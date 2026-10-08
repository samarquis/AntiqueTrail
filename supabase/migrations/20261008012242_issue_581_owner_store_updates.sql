-- #581: versioned Owner text edits, least-privilege public projection, and durable sale expiry.

create temporary table issue581_prior_role_access on commit drop as
select
  exists(select 1 from pg_auth_members where roleid='identity_service'::regrole and member='postgres'::regrole)
    as identity_service_member,
  has_schema_privilege('identity_service','portal_private','CREATE') as identity_service_portal_create,
  has_schema_privilege('identity_service','app_public','CREATE') as identity_service_app_create,
  exists(select 1 from pg_auth_members where roleid='catalog_reader'::regrole and member='postgres'::regrole)
    as catalog_reader_member,
  has_schema_privilege('catalog_reader','app_public','CREATE') as catalog_reader_app_create;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='store_update_expiry_service') then
    create role store_update_expiry_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if exists (
    select 1 from pg_roles
    where rolname='store_update_expiry_service'
      and (rolcanlogin or rolinherit or rolsuper or rolbypassrls)
  ) then
    raise exception 'store_update_expiry_service must remain a non-login, no-inherit, non-superuser, non-bypass role';
  end if;
end
$$;
grant store_update_expiry_service to authenticator;
grant usage on schema app_public to store_update_expiry_service;

alter type app_public.catalog_details_row add attribute updates jsonb;

create table portal_private.store_update_edit_receipts(
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete cascade,
  operation text not null check(operation='text_update_edit'),
  idempotency_key text not null check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_digest bytea not null check(octet_length(request_digest)=32),
  result jsonb not null check(jsonb_typeof(result)='object' and result->>'state'='saved'),
  created_at timestamptz not null default statement_timestamp(),
  primary key(actor_user_id,store_id,operation,idempotency_key)
);
alter table portal_private.store_update_edit_receipts enable row level security;
alter table portal_private.store_update_edit_receipts force row level security;
revoke all on portal_private.store_update_edit_receipts
  from public,anon,authenticated,service_role,catalog_reader,store_update_expiry_service,identity_service;
grant select,insert on portal_private.store_update_edit_receipts to identity_service;
create policy identity_service_update_edit_receipts on portal_private.store_update_edit_receipts
  for all to identity_service using(true) with check(true);

grant usage on schema portal_private to catalog_reader;
revoke all on portal_private.store_updates
  from public,anon,authenticated,service_role,catalog_reader,store_update_expiry_service;
grant select(update_id,store_id,headline,details,published_at,source_url)
  on portal_private.store_updates to catalog_reader;
create policy catalog_reader_public_store_updates on portal_private.store_updates
  for select to catalog_reader using(
    state='live'
    and exists(
      select 1 from app_public.stores s
      where s.id=portal_private.store_updates.store_id
        and s.publication_state='active'
        and (
          (s.synthetic and s.audience='synthetic')
          or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog'))
        )
        and (
          portal_private.store_updates.update_type<>'sale'
          or portal_private.store_updates.end_date >= (statement_timestamp() at time zone s.timezone_name)::date
        )
    )
  );

do $$
declare prior record;
begin
  select * into prior from pg_temp.issue581_prior_role_access;
  if not prior.identity_service_member then execute 'grant identity_service to postgres'; end if;
  if not prior.identity_service_portal_create then execute 'grant create on schema portal_private to identity_service'; end if;
  if not prior.identity_service_app_create then execute 'grant create on schema app_public to identity_service'; end if;
end
$$;
set role identity_service;
create or replace function portal_private.store_update_json(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('id',u.update_id,'type',u.update_type,'headline',u.headline,'details',u.details,
    'vendorLabel',u.vendor_label,'sourceUrl',u.source_url,'endDate',u.end_date,'imageRequested',false,'state',u.state,
    'publishedAt',u.published_at,'archivedAt',u.archived_at,'version',u.version))
  from portal_private.store_updates u where u.update_id=target;
$$;
alter function portal_private.store_update_json(uuid) owner to identity_service;

create or replace function app_public.portal_list_updates()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope(); begin
  return coalesce((select jsonb_agg(portal_private.store_update_json(u.update_id) order by u.published_at desc,u.update_id desc)
    from portal_private.store_updates u where u.store_id=target),'[]'::jsonb);
end $$;
alter function app_public.portal_list_updates() owner to identity_service;
reset role;

create or replace function app_public.portal_edit_update(
  p_update_id text,p_update jsonb,p_expected_version bigint,p_idempotency_key text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target uuid:=portal_private.require_portal_scope();
  id uuid;
  row portal_private.store_updates%rowtype;
  receipt portal_private.store_update_edit_receipts%rowtype;
  request_digest bytea;
  draft_digest bytea;
  prior_version bigint;
  next_end_date date;
  result jsonb;
begin
  if p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_expected_version is null or p_expected_version<1 then
    raise exception using errcode='22023',message='validation_failed';
  end if;

  request_digest:=extensions.digest(convert_to(jsonb_build_object(
    'updateId',p_update_id,'update',p_update,'expectedVersion',p_expected_version
  )::text,'utf8'),'sha256');
  perform portal_private.lock_portal_store(target);

  select * into receipt from portal_private.store_update_edit_receipts
    where actor_user_id=actor and store_id=target and operation='text_update_edit'
      and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_digest=request_digest then return receipt.result; end if;
    return jsonb_build_object('state','conflict');
  end if;

  if p_update_id is null then raise exception using errcode='55000',message='portal_unavailable'; end if;
  begin id:=p_update_id::uuid;
  exception when others then raise exception using errcode='55000',message='portal_unavailable'; end;

  if jsonb_typeof(p_update) is distinct from 'object'
    or p_update - array['type','headline','details','vendorLabel','sourceUrl','endDate','imageRequested'] <> '{}'::jsonb
    or jsonb_typeof(p_update->'type') is distinct from 'string'
    or p_update->>'type' not in ('new_finds','sale','announcement','store_news')
    or jsonb_typeof(p_update->'headline') is distinct from 'string'
    or nullif(btrim(p_update->>'headline'),'') is null
    or char_length(p_update->>'headline')>160
    or p_update->>'headline'~'[[:cntrl:]]'
    or jsonb_typeof(p_update->'details') is distinct from 'string'
    or nullif(btrim(p_update->>'details'),'') is null
    or char_length(p_update->>'details')>4000
    or p_update->>'details'~'[[:cntrl:]]'
    or (p_update ? 'vendorLabel' and jsonb_typeof(p_update->'vendorLabel') not in ('string','null'))
    or char_length(coalesce(p_update->>'vendorLabel',''))>160
    or coalesce(p_update->>'vendorLabel','')~'[[:cntrl:]]'
    or (p_update ? 'sourceUrl' and jsonb_typeof(p_update->'sourceUrl') not in ('string','null'))
    or (nullif(p_update->>'sourceUrl','') is not null and
      (char_length(p_update->>'sourceUrl')>2048 or p_update->>'sourceUrl'!~*'^https://[^[:space:]@]+$'))
    or (p_update ? 'imageRequested' and p_update->'imageRequested' <> 'false'::jsonb)
    or (p_update ? 'endDate' and jsonb_typeof(p_update->'endDate') not in ('string','null')) then
    raise exception using errcode='22023',message='validation_failed';
  end if;

  next_end_date:=null;
  if nullif(p_update->>'endDate','') is not null then
    if p_update->>'endDate'!~'^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode='22023',message='validation_failed';
    end if;
    begin next_end_date:=(p_update->>'endDate')::date;
    exception when others then raise exception using errcode='22023',message='validation_failed'; end;
    if next_end_date::text<>p_update->>'endDate' then
      raise exception using errcode='22023',message='validation_failed';
    end if;
  elsif p_update->>'type'='sale' then
    raise exception using errcode='22023',message='validation_failed';
  end if;

  perform 1 from portal_private.store_updates where update_id=id and store_id=target for update;
  if not found then raise exception using errcode='55000',message='portal_unavailable'; end if;
  select * into row from portal_private.store_updates where update_id=id and store_id=target;
  if row.version<>p_expected_version then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',row.version));
  end if;

  prior_version:=row.version;
  draft_digest:=extensions.digest(convert_to(jsonb_strip_nulls(p_update)::text,'utf8'),'sha256');
  begin
    update portal_private.store_updates set
      update_type=p_update->>'type',
      headline=btrim(p_update->>'headline'),
      details=btrim(p_update->>'details'),
      vendor_label=nullif(btrim(p_update->>'vendorLabel'),''),
      source_url=nullif(btrim(p_update->>'sourceUrl'),''),
      end_date=next_end_date,
      content_digest=draft_digest,
      version=version+1,
      updated_at=statement_timestamp()
    where update_id=id and store_id=target returning * into row;
  exception when unique_violation then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',prior_version));
  end;

  perform portal_private.record_portal_event('text_update_edited',actor,target,id,draft_digest,prior_version,row.version);
  result:=jsonb_build_object('state','saved','update',portal_private.store_update_json(id));
  insert into portal_private.store_update_edit_receipts(
    actor_user_id,store_id,operation,idempotency_key,request_digest,result
  ) values(actor,target,'text_update_edit',p_idempotency_key,request_digest,result);
  return result;
end $$;
alter function app_public.portal_edit_update(text,jsonb,bigint,text) owner to identity_service;
revoke all on function app_public.portal_edit_update(text,jsonb,bigint,text) from public,anon;
grant execute on function app_public.portal_edit_update(text,jsonb,bigint,text) to authenticated;

create or replace function portal_private.record_store_update_expiry_event(
  p_store_id uuid,p_update_id uuid,p_digest bytea,p_previous_version bigint,p_resulting_version bigint,p_now timestamptz
)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  insert into portal_private.portal_audit_events(
    event_kind,actor_user_id,store_id,resource_id,payload_hash,previous_version,resulting_version,occurred_at
  ) values('text_update_sale_expired',null,p_store_id,p_update_id,p_digest,p_previous_version,p_resulting_version,p_now);
  insert into app_private.privileged_audit_events(
    actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash,occurred_at
  ) values(null,null,'portal_text_update_sale_expired','completed','store_update',p_update_id,
    'sale_end_date_elapsed',p_digest,decode(repeat('00',32),'hex'),p_now);
end $$;
alter function portal_private.record_store_update_expiry_event(uuid,uuid,bytea,bigint,bigint,timestamptz) owner to identity_service;
revoke all on function portal_private.record_store_update_expiry_event(uuid,uuid,bytea,bigint,bigint,timestamptz)
  from public,anon,authenticated;

create or replace function portal_private.expire_store_sales(p_now timestamptz,p_limit integer)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare
  due record;
  next_version bigint;
  digest bytea;
  affected integer:=0;
begin
  if p_now is null or p_limit is null or p_limit<1 or p_limit>500 then
    raise exception using errcode='22023',message='portal_expiry_input_invalid';
  end if;
  for due in
    select u.update_id,u.store_id,u.version
    from portal_private.store_updates u
    join app_public.stores s on s.id=u.store_id
    where u.update_type='sale' and u.state='live'
      and u.end_date < (p_now at time zone s.timezone_name)::date
    order by u.end_date,u.store_id,u.update_id
    limit p_limit for update of u skip locked
  loop
    update portal_private.store_updates set
      state='archived',archived_at=p_now,updated_at=p_now,version=version+1
    where update_id=due.update_id and store_id=due.store_id and state='live'
    returning version into next_version;
    if found then
      digest:=extensions.digest(convert_to(
        'sale-expired|'||due.update_id::text||'|'||due.version::text||'|'||next_version::text||'|'||p_now::text,
        'utf8'
      ),'sha256');
      perform portal_private.record_store_update_expiry_event(
        due.store_id,due.update_id,digest,due.version,next_version,p_now
      );
      affected:=affected+1;
    end if;
  end loop;
  return affected;
end $$;
alter function portal_private.expire_store_sales(timestamptz,integer) owner to identity_service;
revoke all on function portal_private.expire_store_sales(timestamptz,integer) from public,anon,authenticated;

create or replace function app_public.portal_expire_store_sales(p_now timestamptz,p_limit integer)
returns integer language sql volatile security definer set search_path='' as $$
  select portal_private.expire_store_sales(p_now,p_limit);
$$;
alter function app_public.portal_expire_store_sales(timestamptz,integer) owner to identity_service;
revoke all on function app_public.portal_expire_store_sales(timestamptz,integer) from public,anon,authenticated;
grant execute on function app_public.portal_expire_store_sales(timestamptz,integer) to store_update_expiry_service;

do $$
declare prior record;
begin
  select * into prior from pg_temp.issue581_prior_role_access;
  if not prior.catalog_reader_member then execute 'grant catalog_reader to postgres'; end if;
  if not prior.catalog_reader_app_create then execute 'grant create on schema app_public to catalog_reader'; end if;
end
$$;
set role catalog_reader;
create or replace function app_public.catalog_details(p_slug text)
returns setof app_public.catalog_details_row language plpgsql stable security definer
set search_path = pg_catalog, app_public as $$
declare as_of timestamptz := statement_timestamp();
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then return; end if;
  return query
  select s.id,s.slug,s.name,s.town,s.state_code,s.address,a.slug,a.label,s.summary,s.description,s.phone,s.website,s.timezone_name,
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('weekday',h.iso_weekday,'is_closed',h.is_closed,'interval_index',h.interval_index,'opens_at',case when h.opens_at is null then null else to_char(h.opens_at,'HH24:MI') end,'closes_at',case when h.closes_at is null then null else to_char(h.closes_at,'HH24:MI') end) order by h.iso_weekday,h.interval_index),'[]'::jsonb) from app_public.store_weekly_hours h where h.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('local_date',e.local_date,'label',e.label,'is_closed',e.is_closed,'interval_index',e.interval_index,'opens_at',case when e.opens_at is null then null else to_char(e.opens_at,'HH24:MI') end,'closes_at',case when e.closes_at is null then null else to_char(e.closes_at,'HH24:MI') end) order by e.local_date,e.interval_index),'[]'::jsonb) from app_public.store_hour_exceptions e where e.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('asset_path',m.asset_path,'kind',m.kind,'alt_text',m.alt_text,'display_order',m.display_order) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('group',v.verification_group,'verified_at',v.verified_at,'label',v.provenance_label) order by v.verification_group),'[]'::jsonb) from app_public.store_fact_verifications v where v.store_id=s.id),
    f.freshness_state,f.oldest_verified_at,as_of,
    (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',u.update_id,'title',u.headline,'body',u.details,'publishedAt',u.published_at,'href',u.source_url
    )) order by u.published_at desc,u.update_id desc),'[]'::jsonb)
      from portal_private.store_updates u where u.store_id=s.id)
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,as_of) f
  where s.slug=p_slug and s.synthetic and s.audience='synthetic' and s.publication_state='active' and f.freshness_state in ('current','overdue');
end; $$;
alter function app_public.catalog_details(text) owner to catalog_reader;

create or replace function app_public.regional_catalog_details(p_slug text)
returns setof app_public.catalog_details_row language sql stable security definer set search_path='' as $$
  select s.id,s.slug,s.name,s.town,s.state_code,s.address,a.slug,a.label,s.summary,s.description,s.phone,s.website,s.timezone_name,
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('weekday',h.iso_weekday,'is_closed',h.is_closed,'interval_index',h.interval_index,'opens_at',case when h.opens_at is null then null else to_char(h.opens_at,'HH24:MI') end,'closes_at',case when h.closes_at is null then null else to_char(h.closes_at,'HH24:MI') end) order by h.iso_weekday,h.interval_index),'[]'::jsonb) from app_public.store_weekly_hours h where h.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('local_date',e.local_date,'label',e.label,'is_closed',e.is_closed,'interval_index',e.interval_index,'opens_at',case when e.opens_at is null then null else to_char(e.opens_at,'HH24:MI') end,'closes_at',case when e.closes_at is null then null else to_char(e.closes_at,'HH24:MI') end) order by e.local_date,e.interval_index),'[]'::jsonb) from app_public.store_hour_exceptions e where e.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('asset_path',m.asset_path,'kind',m.kind,'alt_text',m.alt_text,'display_order',m.display_order) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('group',v.verification_group,'verified_at',v.verified_at,'label',v.provenance_label) order by v.verification_group),'[]'::jsonb) from app_public.store_fact_verifications v where v.store_id=s.id),
    f.freshness_state,f.oldest_verified_at,statement_timestamp(),
    (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',u.update_id,'title',u.headline,'body',u.details,'publishedAt',u.published_at,'href',u.source_url
    )) order by u.published_at desc,u.update_id desc),'[]'::jsonb)
      from portal_private.store_updates u where u.store_id=s.id)
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,statement_timestamp()) f
  where release_private.public_capability_enabled('catalog') and s.slug=p_slug and not s.synthetic and s.audience='public' and s.publication_state='active' and f.freshness_state in ('current','overdue');
$$;
alter function app_public.regional_catalog_details(text) owner to catalog_reader;

reset role;
do $$
declare prior record;
begin
  select * into prior from pg_temp.issue581_prior_role_access;
  if not prior.identity_service_portal_create then execute 'revoke create on schema portal_private from identity_service'; end if;
  if not prior.identity_service_app_create then execute 'revoke create on schema app_public from identity_service'; end if;
  if not prior.identity_service_member then execute 'revoke identity_service from postgres'; end if;
  if not prior.catalog_reader_app_create then execute 'revoke create on schema app_public from catalog_reader'; end if;
  if not prior.catalog_reader_member then execute 'revoke catalog_reader from postgres'; end if;
end
$$;
