-- Package 6B: exact-store Store Portal server contract.
-- Media upload/publication commands are deliberately absent from this namespace.

grant identity_service to postgres;
grant create on schema app_public to identity_service;
create schema if not exists portal_private;
revoke all on schema portal_private from public,anon,authenticated;
grant usage,create on schema portal_private to identity_service;

create table portal_private.store_profiles(
  store_id uuid primary key references app_public.stores(id) on delete cascade,
  listing_state text not null default 'active' check(listing_state in ('active','temporarily_closed','permanently_closed')),
  temporary_closure_start date,
  temporary_closure_end date,
  temporary_closure_reason text,
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default statement_timestamp(),
  check((temporary_closure_start is null and temporary_closure_end is null and temporary_closure_reason is null)
    or (temporary_closure_start is not null and temporary_closure_end>=temporary_closure_start
      and (temporary_closure_reason is null or (char_length(temporary_closure_reason)<=240 and temporary_closure_reason!~'[[:cntrl:]]'))))
);

create table portal_private.controlled_changes(
  change_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  requested_by uuid references auth.users(id) on delete set null,
  field text not null check(field in ('name','address','coordinates','ownership','permanent_closure','categories')),
  requested_value text not null check(requested_value=btrim(requested_value) and char_length(requested_value) between 1 and 2000 and requested_value!~'[[:cntrl:]]'),
  reason text not null check(reason=btrim(reason) and char_length(reason) between 1 and 1000 and reason!~'[[:cntrl:]]'),
  state text not null default 'pending' check(state in ('pending','changes_requested','approved','rejected')),
  admin_case_id uuid unique references admin_private.admin_review_cases(case_id) on delete restrict,
  submitted_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check(version>0)
);
create unique index one_live_portal_controlled_field on portal_private.controlled_changes(store_id,field) where state in ('pending','changes_requested');

create table portal_private.store_updates(
  update_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  update_type text not null check(update_type in ('new_finds','sale','announcement','store_news')),
  headline text not null check(headline=btrim(headline) and char_length(headline) between 1 and 160 and headline!~'[[:cntrl:]]'),
  details text not null check(details=btrim(details) and char_length(details) between 1 and 4000 and details!~'[[:cntrl:]]'),
  vendor_label text check(vendor_label is null or (vendor_label=btrim(vendor_label) and char_length(vendor_label) between 1 and 160 and vendor_label!~'[[:cntrl:]]')),
  source_url text check(source_url is null or (char_length(source_url)<=2048 and source_url~*'^https://[^[:space:]@]+$')),
  end_date date,
  state text not null default 'live' check(state in ('live','archived')),
  content_digest bytea not null check(octet_length(content_digest)=32),
  published_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check((update_type='sale' and end_date is not null) or update_type<>'sale'),
  check((state='live' and archived_at is null) or (state='archived' and archived_at is not null))
);
create unique index one_live_identical_store_update on portal_private.store_updates(store_id,content_digest) where state='live';

create table portal_private.official_links(
  store_id uuid not null references app_public.stores(id) on delete cascade,
  platform text not null check(platform in ('facebook','instagram','youtube','pinterest','tiktok')),
  url text not null check(url=btrim(url) and char_length(url) between 12 and 2048 and url!~'[[:cntrl:]]'),
  verified_at timestamptz not null default statement_timestamp(),
  verified_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check(version>0),
  primary key(store_id,platform)
);

create table portal_private.support_tickets(
  ticket_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  opened_by uuid references auth.users(id) on delete set null,
  category text not null check(category in ('bug','confusing_workflow','store_data_correction','feature_idea','security_privacy')),
  subject text not null check(subject=btrim(subject) and char_length(subject) between 1 and 160 and subject!~'[[:cntrl:]]'),
  body text not null check(body=btrim(body) and char_length(body) between 1 and 4000 and body!~'[[:cntrl:]]'),
  diagnostics jsonb not null default '[]'::jsonb check(jsonb_typeof(diagnostics)='array'),
  state text not null default 'submitted' check(state in ('submitted','in_review','waiting_on_you','resolved','reopened')),
  resolution_note text check(resolution_note is null or (resolution_note=btrim(resolution_note) and char_length(resolution_note) between 1 and 2000 and resolution_note!~'[[:cntrl:]]')),
  request_digest bytea not null check(octet_length(request_digest)=32),
  admin_case_id uuid unique references admin_private.admin_review_cases(case_id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  version bigint not null default 1 check(version>0),
  check((state='resolved' and resolved_at is not null) or state<>'resolved')
);
create unique index one_open_identical_support_ticket on portal_private.support_tickets(store_id,opened_by,request_digest) where state<>'resolved';

create table portal_private.support_replies(
  reply_id uuid primary key default extensions.gen_random_uuid(),
  ticket_id uuid not null references portal_private.support_tickets(ticket_id) on delete cascade,
  author_kind text not null check(author_kind in ('owner','support')),
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null check(body=btrim(body) and char_length(body) between 1 and 4000 and body!~'[[:cntrl:]]'),
  body_digest bytea not null check(octet_length(body_digest)=32),
  created_at timestamptz not null default statement_timestamp(),
  unique(ticket_id,author_kind,body_digest)
);

create table portal_private.support_events(
  event_id uuid primary key default extensions.gen_random_uuid(),
  ticket_id uuid not null references portal_private.support_tickets(ticket_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_kind text not null check(event_kind in ('submitted','owner_replied','support_replied','in_review','waiting_on_owner','resolved','owner_confirmed','reopened')),
  from_state text,
  to_state text not null,
  occurred_at timestamptz not null default statement_timestamp()
);

create table portal_private.portal_audit_events(
  event_id uuid primary key default extensions.gen_random_uuid(),
  event_kind text not null check(event_kind~'^[a-z][a-z0-9_]{1,63}$'),
  actor_user_id uuid references auth.users(id) on delete set null,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  resource_id uuid,
  payload_hash bytea not null check(octet_length(payload_hash)=32),
  previous_version bigint,
  resulting_version bigint,
  occurred_at timestamptz not null default statement_timestamp(),
  check(previous_version is null or previous_version>0),
  check(resulting_version is null or resulting_version>0)
);

do $$ declare t text; begin
  foreach t in array array['store_profiles','controlled_changes','store_updates','official_links','support_tickets','support_replies','support_events','portal_audit_events'] loop
    execute format('alter table portal_private.%I enable row level security',t);
    execute format('alter table portal_private.%I force row level security',t);
    execute format('revoke all on portal_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on portal_private.%I to identity_service',t);
    execute format('create policy identity_service_%I on portal_private.%I for all to identity_service using(true) with check(true)',t,t);
  end loop;
end $$;
revoke update,delete,truncate on portal_private.support_replies,portal_private.support_events,portal_private.portal_audit_events from identity_service;
create trigger support_replies_append_only before update or delete on portal_private.support_replies for each row execute function partner_private.reject_append_only_mutation();
create trigger support_events_append_only before update or delete on portal_private.support_events for each row execute function partner_private.reject_append_only_mutation();
create trigger portal_audit_append_only before update or delete on portal_private.portal_audit_events for each row execute function partner_private.reject_append_only_mutation();

-- The Portal publishes only these catalog fields. Browser roles retain no direct
-- grants, while FORCE RLS keeps this service path explicit and reviewable.
grant select,update on app_public.stores to identity_service;
grant select on app_public.store_category_assignments to identity_service;
grant select,insert,update on app_public.store_fact_verifications to identity_service;
grant select,insert,delete on app_public.store_weekly_hours,app_public.store_hour_exceptions to identity_service;
grant execute on function app_public.catalog_freshness(uuid,timestamptz) to identity_service;
create policy identity_service_portal_stores on app_public.stores
  for all to identity_service using(true) with check(true);
create policy identity_service_portal_store_categories on app_public.store_category_assignments
  for select to identity_service using(true);
create policy identity_service_portal_verifications on app_public.store_fact_verifications
  for all to identity_service using(true) with check(true);
create policy identity_service_portal_weekly_hours on app_public.store_weekly_hours
  for all to identity_service using(true) with check(true);
create policy identity_service_portal_hour_exceptions on app_public.store_hour_exceptions
  for all to identity_service using(true) with check(true);

create or replace function portal_private.require_portal_scope()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not partner_private.partner_consent_is_current(actor) then raise exception using errcode='42501',message='portal_unavailable'; end if;
  select min(g.store_id) into target
  from partner_private.store_partner_grants g
  join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
  join app_public.stores s on s.id=g.store_id
  cross join app_private.environment_stage e
  where g.auth_user_id=actor and g.state='active'
    and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id)
    and ((s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
      or (not s.synthetic and s.audience='regional_readiness' and e.id=1 and e.stage='private_beta')
      or (not s.synthetic and s.audience='public' and e.id=1 and e.stage='regional_public'))
  having count(*)=1;
  if target is null then raise exception using errcode='42501',message='portal_unavailable'; end if;
  return target;
end $$;
alter function portal_private.require_portal_scope() owner to identity_service;

create or replace function portal_private.lock_portal_store(target_store uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('portal-store:'||target_store::text,0)); end $$;
alter function portal_private.lock_portal_store(uuid) owner to identity_service;

create or replace function portal_private.record_portal_event(kind text,actor uuid,target_store uuid,resource uuid,digest bytea,prior_version bigint,next_version bigint)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  insert into portal_private.portal_audit_events(event_kind,actor_user_id,store_id,resource_id,payload_hash,previous_version,resulting_version)
    values(kind,actor,target_store,resource,digest,prior_version,next_version);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,payload_hash,event_hash)
    values(actor,'representative','portal_'||kind,'completed','store_portal',coalesce(resource,target_store),digest,decode(repeat('00',32),'hex'));
end $$;
alter function portal_private.record_portal_event(text,uuid,uuid,uuid,bytea,bigint,bigint) owner to identity_service;

create or replace function portal_private.official_link_allowed(platform text,url text)
returns boolean language sql immutable set search_path='' as $$
  select platform in ('facebook','instagram','youtube','pinterest','tiktok') and url=btrim(url)
    and char_length(url) between 12 and 2048 and url!~'[[:cntrl:]@#]'
    and case platform
      when 'facebook' then url~*'^https://(www\.)?facebook\.com/[^[:space:]]+$'
      when 'instagram' then url~*'^https://(www\.)?instagram\.com/[^[:space:]]+$'
      when 'youtube' then url~*'^https://(www\.)?(youtube\.com|youtu\.be)/[^[:space:]]+$'
      when 'pinterest' then url~*'^https://(www\.)?pinterest\.com/[^[:space:]]+$'
      when 'tiktok' then url~*'^https://(www\.)?tiktok\.com/[^[:space:]]+$'
      else false end;
$$;
alter function portal_private.official_link_allowed(text,text) owner to identity_service;

create or replace function portal_private.diagnostics_allowed(input jsonb)
returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(input)='array' and jsonb_array_length(input)<=5 and not exists(
    select 1 from jsonb_array_elements(input) d
    where d->>'key' not in ('browser','operating_system','app_version','route','connection')
      or d->>'label' is distinct from case d->>'key' when 'browser' then 'Browser' when 'operating_system' then 'Operating system' when 'app_version' then 'App version' when 'route' then 'Current screen' when 'connection' then 'Connection' end
      or char_length(d->>'value') not between 1 and 120 or d->>'value'~'[[:cntrl:]]'
      or d->>'value'~*'[?&#](token|code|secret|key)='
  );
$$;
alter function portal_private.diagnostics_allowed(jsonb) owner to identity_service;

create or replace function portal_private.controlled_change_json(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',c.change_id,'field',c.field,'requestedValue',c.requested_value,'state',c.state,'submittedAt',c.submitted_at)
  from portal_private.controlled_changes c where c.change_id=target;
$$;
alter function portal_private.controlled_change_json(uuid) owner to identity_service;

create or replace function portal_private.store_update_json(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('id',u.update_id,'type',u.update_type,'headline',u.headline,'details',u.details,
    'vendorLabel',u.vendor_label,'sourceUrl',u.source_url,'endDate',u.end_date,'imageRequested',false,'state',u.state,
    'publishedAt',u.published_at,'archivedAt',u.archived_at)) from portal_private.store_updates u where u.update_id=target;
$$;
alter function portal_private.store_update_json(uuid) owner to identity_service;

create or replace function portal_private.support_ticket_json(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object('id',t.ticket_id,'category',t.category,'subject',t.subject,'body',t.body,'state',t.state,
    'createdAt',t.created_at,'updatedAt',t.updated_at,'diagnostics',t.diagnostics,'screenshotAttached',false,'resolutionNote',t.resolution_note,
    'replies',coalesce((select jsonb_agg(jsonb_build_object('id',r.reply_id,'author',r.author_kind,'body',r.body,'createdAt',r.created_at) order by r.created_at,r.reply_id)
      from portal_private.support_replies r where r.ticket_id=t.ticket_id),'[]'::jsonb)))
  from portal_private.support_tickets t where t.ticket_id=target;
$$;
alter function portal_private.support_ticket_json(uuid) owner to identity_service;

create or replace function app_public.portal_get_home()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); s app_public.stores%rowtype; p portal_private.store_profiles%rowtype; freshness text; verified timestamptz; source text;
begin
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select * into s from app_public.stores where id=target;
  select * into p from portal_private.store_profiles where store_id=target;
  select f.freshness_state,f.oldest_verified_at into freshness,verified from app_public.catalog_freshness(target,statement_timestamp()) f;
  select coalesce(min(v.provenance_label),'Store representative confirmation') into source from app_public.store_fact_verifications v where v.store_id=target;
  return jsonb_build_object('store',jsonb_build_object('id',s.id,'name',s.name,'listingState',p.listing_state,'timeZone',s.timezone_name),
    'freshness',jsonb_strip_nulls(jsonb_build_object('state',case freshness when 'current' then 'verified' when 'overdue' then 'overdue' when 'stale' then 'stale' else 'unknown' end,
      'label',case freshness when 'current' then 'Verified' when 'overdue' then 'Verification overdue' when 'stale' then 'Verification required' else 'Verification date unavailable' end,
      'verifiedAt',verified,'daysSinceVerification',case when verified is null then null else greatest(0,floor(extract(epoch from statement_timestamp()-verified)/86400)::int) end)),
    'provenance',jsonb_build_object('sourceLabel',source,'verifiedBy','Store representative','verifiedAt',coalesce(verified,statement_timestamp()),'ownerConfirmed',exists(select 1 from app_public.store_fact_verifications v where v.store_id=target and v.verifier_kind='store_partner')),
    'pendingChanges',coalesce((select jsonb_agg(portal_private.controlled_change_json(c.change_id) order by c.submitted_at) from portal_private.controlled_changes c where c.store_id=target and c.state in ('pending','changes_requested')),'[]'::jsonb));
end $$;
alter function app_public.portal_get_home() owner to identity_service;

create or replace function app_public.portal_get_hours()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope(); zone text; p portal_private.store_profiles%rowtype;
begin
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select timezone_name into zone from app_public.stores where id=target;
  select * into p from portal_private.store_profiles where store_id=target;
  return jsonb_strip_nulls(jsonb_build_object('timeZone',zone,'version',p.version,
    'weekly',(select jsonb_agg(jsonb_build_object('weekday',d,'label',case d when 1 then 'Monday' when 2 then 'Tuesday' when 3 then 'Wednesday' when 4 then 'Thursday' when 5 then 'Friday' when 6 then 'Saturday' else 'Sunday' end,
      'isClosed',coalesce((select bool_or(h.is_closed) from app_public.store_weekly_hours h where h.store_id=target and h.iso_weekday=d),true),
      'intervals',coalesce((select jsonb_agg(jsonb_build_object('opensAt',to_char(h.opens_at,'HH24:MI'),'closesAt',to_char(h.closes_at,'HH24:MI')) order by h.interval_index) from app_public.store_weekly_hours h where h.store_id=target and h.iso_weekday=d and not h.is_closed),'[]'::jsonb)) order by d) from generate_series(1,7) d),
    'holidays',coalesce((select jsonb_agg(x.value order by x.local_date) from (select e.local_date,jsonb_build_object('localDate',e.local_date,'label',min(e.label),'isClosed',bool_or(e.is_closed),
      'intervals',coalesce(jsonb_agg(jsonb_build_object('opensAt',to_char(e.opens_at,'HH24:MI'),'closesAt',to_char(e.closes_at,'HH24:MI')) order by e.interval_index) filter(where not e.is_closed),'[]'::jsonb)) value
      from app_public.store_hour_exceptions e where e.store_id=target group by e.local_date) x),'[]'::jsonb),
    'temporaryClosure',case when p.temporary_closure_start is null then null else jsonb_strip_nulls(jsonb_build_object('startDate',p.temporary_closure_start,'endDate',p.temporary_closure_end,'reason',p.temporary_closure_reason)) end));
end $$;
alter function app_public.portal_get_hours() owner to identity_service;

create or replace function app_public.portal_save_hours(p_hours jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); item jsonb; span jsonb; seen int[]:='{}'; prior bigint; next bigint; zone text; digest bytea; closure jsonb:=nullif(p_hours->'temporaryClosure','null'::jsonb);
begin
  if jsonb_typeof(p_hours)<>'object' or jsonb_typeof(p_hours->'weekly')<>'array' or jsonb_array_length(p_hours->'weekly')<>7
    or jsonb_typeof(coalesce(p_hours->'holidays','[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_hours->'holidays','[]'::jsonb))>64 then raise exception using errcode='22023',message='portal_unavailable'; end if;
  select timezone_name into zone from app_public.stores where id=target;
  if p_hours->>'timeZone' is distinct from zone then raise exception using errcode='22023',message='portal_unavailable'; end if;
  for item in select value from jsonb_array_elements(p_hours->'weekly') loop
    if (item->>'weekday')::int not between 1 and 7 or (item->>'weekday')::int=any(seen) or jsonb_typeof(item->'isClosed')<>'boolean'
      or jsonb_typeof(item->'intervals')<>'array' or jsonb_array_length(item->'intervals')>2
      or ((item->>'isClosed')::boolean and jsonb_array_length(item->'intervals')<>0)
      or (not (item->>'isClosed')::boolean and jsonb_array_length(item->'intervals')=0) then raise exception using errcode='22023',message='portal_unavailable'; end if;
    seen:=array_append(seen,(item->>'weekday')::int);
    for span in select value from jsonb_array_elements(item->'intervals') loop
      if span->>'opensAt'!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' or span->>'closesAt'!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' or (span->>'opensAt')::time >= (span->>'closesAt')::time then raise exception using errcode='22023',message='portal_unavailable'; end if;
    end loop;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_hours->'holidays','[]'::jsonb)) loop
    if item->>'localDate'!~'^\d{4}-\d{2}-\d{2}$' or nullif(btrim(item->>'label'),'') is null or char_length(item->>'label')>160
      or jsonb_typeof(item->'isClosed')<>'boolean' or jsonb_typeof(item->'intervals')<>'array' or jsonb_array_length(item->'intervals')>2
      or ((item->>'isClosed')::boolean and jsonb_array_length(item->'intervals')<>0)
      or (not (item->>'isClosed')::boolean and jsonb_array_length(item->'intervals')=0) then raise exception using errcode='22023',message='portal_unavailable'; end if;
    for span in select value from jsonb_array_elements(item->'intervals') loop
      if span->>'opensAt'!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' or span->>'closesAt'!~'^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' or (span->>'opensAt')::time >= (span->>'closesAt')::time then raise exception using errcode='22023',message='portal_unavailable'; end if;
    end loop;
  end loop;
  if closure is not null and (closure->>'startDate'!~'^\d{4}-\d{2}-\d{2}$' or closure->>'endDate'!~'^\d{4}-\d{2}-\d{2}$' or (closure->>'startDate')::date>(closure->>'endDate')::date or char_length(coalesce(closure->>'reason',''))>240) then raise exception using errcode='22023',message='portal_unavailable'; end if;
  perform portal_private.lock_portal_store(target);
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select version into prior from portal_private.store_profiles where store_id=target for update;
  if (p_hours->>'version')::bigint<>prior then raise exception using errcode='40001',message='portal_conflict'; end if;
  delete from app_public.store_weekly_hours where store_id=target;
  for item in select value from jsonb_array_elements(p_hours->'weekly') loop
    if (item->>'isClosed')::boolean then insert into app_public.store_weekly_hours(store_id,iso_weekday,interval_index,is_closed) values(target,(item->>'weekday')::int,1,true);
    else
      insert into app_public.store_weekly_hours(store_id,iso_weekday,interval_index,is_closed,opens_at,closes_at)
      select target,(item->>'weekday')::int,ordinality,false,(value->>'opensAt')::time,(value->>'closesAt')::time from jsonb_array_elements(item->'intervals') with ordinality;
    end if;
  end loop;
  delete from app_public.store_hour_exceptions where store_id=target;
  for item in select value from jsonb_array_elements(coalesce(p_hours->'holidays','[]'::jsonb)) loop
    if (item->>'isClosed')::boolean then insert into app_public.store_hour_exceptions(store_id,local_date,interval_index,is_closed,label) values(target,(item->>'localDate')::date,1,true,btrim(item->>'label'));
    else
      insert into app_public.store_hour_exceptions(store_id,local_date,interval_index,is_closed,opens_at,closes_at,label)
      select target,(item->>'localDate')::date,ordinality,false,(value->>'opensAt')::time,(value->>'closesAt')::time,btrim(item->>'label') from jsonb_array_elements(item->'intervals') with ordinality;
    end if;
  end loop;
  insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
    values(target,'hours',statement_timestamp(),'Store representative confirmation','store_partner')
    on conflict(store_id,verification_group) do update set verified_at=excluded.verified_at,provenance_label=excluded.provenance_label,verifier_kind=excluded.verifier_kind;
  update portal_private.store_profiles set temporary_closure_start=case when closure is null then null else (closure->>'startDate')::date end,
    temporary_closure_end=case when closure is null then null else (closure->>'endDate')::date end,temporary_closure_reason=nullif(btrim(closure->>'reason'),''),
    listing_state=case when closure is null then 'active' else 'temporarily_closed' end,version=version+1,updated_at=statement_timestamp() where store_id=target returning version into next;
  digest:=extensions.digest(convert_to(p_hours::text,'utf8'),'sha256');
  perform portal_private.record_portal_event('hours_published',actor,target,target,digest,prior,next);
  return app_public.portal_get_hours();
end $$;
alter function app_public.portal_save_hours(jsonb) owner to identity_service;

create or replace function app_public.portal_save_managed_fields(p_fields jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); closure jsonb:=nullif(p_fields->'temporaryClosure','null'::jsonb); prior bigint; next bigint; digest bytea;
begin
  if jsonb_typeof(p_fields)<>'object' or char_length(coalesce(p_fields->>'phone',''))>32 or (nullif(p_fields->>'phone','') is not null and p_fields->>'phone'!~'^[+0-9(). ext-]{7,32}$')
    or char_length(coalesce(p_fields->>'description',''))>4000 or (nullif(p_fields->>'website','') is not null and (char_length(p_fields->>'website')>2048 or p_fields->>'website'!~*'^https?://[^[:space:]@]+$'))
    or (closure is not null and (closure->>'startDate'!~'^\d{4}-\d{2}-\d{2}$' or closure->>'endDate'!~'^\d{4}-\d{2}-\d{2}$' or (closure->>'startDate')::date>(closure->>'endDate')::date or char_length(coalesce(closure->>'reason',''))>240)) then raise exception using errcode='22023',message='portal_unavailable'; end if;
  perform portal_private.lock_portal_store(target);
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select version into prior from portal_private.store_profiles where store_id=target for update;
  update app_public.stores set phone=nullif(btrim(p_fields->>'phone'),''),website=nullif(btrim(p_fields->>'website'),''),description=coalesce(nullif(btrim(p_fields->>'description'),''),description),updated_at=statement_timestamp() where id=target;
  insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
    values(target,'contact',statement_timestamp(),'Store representative confirmation','store_partner'),
      (target,'categories_attributes',statement_timestamp(),'Store representative confirmation','store_partner')
    on conflict(store_id,verification_group) do update set verified_at=excluded.verified_at,provenance_label=excluded.provenance_label,verifier_kind='store_partner';
  update portal_private.store_profiles set temporary_closure_start=case when closure is null then null else (closure->>'startDate')::date end,
    temporary_closure_end=case when closure is null then null else (closure->>'endDate')::date end,temporary_closure_reason=nullif(btrim(closure->>'reason'),''),listing_state=case when closure is null then 'active' else 'temporarily_closed' end,
    version=version+1,updated_at=statement_timestamp() where store_id=target returning version into next;
  digest:=extensions.digest(convert_to(p_fields::text,'utf8'),'sha256'); perform portal_private.record_portal_event('managed_fields_published',actor,target,target,digest,prior,next);
  return app_public.portal_get_home();
end $$;
alter function app_public.portal_save_managed_fields(jsonb) owner to identity_service;

create or replace function app_public.portal_submit_controlled_change(p_change jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); new portal_private.controlled_changes%rowtype; existing portal_private.controlled_changes%rowtype; case_id uuid; digest bytea; profile_version bigint;
begin
  if jsonb_typeof(p_change)<>'object' or p_change->>'field' not in ('name','address','coordinates','ownership','permanent_closure','categories','official_media')
    or p_change->>'field'='official_media' or nullif(btrim(p_change->>'requestedValue'),'') is null or char_length(p_change->>'requestedValue')>2000
    or nullif(btrim(p_change->>'reason'),'') is null or char_length(p_change->>'reason')>1000 then raise exception using errcode='22023',message='portal_unavailable'; end if;
  perform portal_private.lock_portal_store(target); insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select * into existing from portal_private.controlled_changes where store_id=target and field=p_change->>'field' and state in ('pending','changes_requested') for update;
  if found then if existing.requested_value=btrim(p_change->>'requestedValue') and existing.reason=btrim(p_change->>'reason') then return portal_private.controlled_change_json(existing.change_id); end if; raise exception using errcode='40001',message='portal_conflict'; end if;
  select version into profile_version from portal_private.store_profiles where store_id=target;
  digest:=extensions.digest(convert_to(p_change::text,'utf8'),'sha256');
  insert into portal_private.controlled_changes(store_id,requested_by,field,requested_value,reason) values(target,actor,p_change->>'field',btrim(p_change->>'requestedValue'),btrim(p_change->>'reason')) returning * into new;
  insert into admin_private.admin_review_cases(case_type,target_kind,target_id,store_id,snapshot_hash) values('store_change','store_controlled_change',new.change_id,target,digest) returning admin_private.admin_review_cases.case_id into case_id;
  update portal_private.controlled_changes set admin_case_id=case_id where change_id=new.change_id returning * into new;
  insert into admin_private.admin_field_change_requests(case_id,store_id,target_kind,target_id,field_name,proposed_value_hash,expected_version,requested_by)
    values(case_id,target,'store_text',new.change_id,new.field,digest,profile_version,actor);
  insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,to_state,snapshot_hash,idempotency_key) values(case_id,actor,'created','open',digest,'portal-change-'||new.change_id);
  perform portal_private.record_portal_event('controlled_change_requested',actor,target,new.change_id,digest,null,new.version);
  return portal_private.controlled_change_json(new.change_id);
end $$;
alter function app_public.portal_submit_controlled_change(jsonb) owner to identity_service;

create or replace function app_public.portal_list_updates()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope(); begin
  return coalesce((select jsonb_agg(portal_private.store_update_json(u.update_id) order by u.created_at desc) from portal_private.store_updates u where u.store_id=target),'[]'::jsonb);
end $$;
alter function app_public.portal_list_updates() owner to identity_service;

create or replace function app_public.portal_create_update(p_update jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); digest bytea; row portal_private.store_updates%rowtype;
begin
  if jsonb_typeof(p_update)<>'object' or coalesce((p_update->>'imageRequested')::boolean,false) or p_update->>'type' not in ('new_finds','sale','announcement','store_news')
    or nullif(btrim(p_update->>'headline'),'') is null or char_length(p_update->>'headline')>160 or nullif(btrim(p_update->>'details'),'') is null or char_length(p_update->>'details')>4000
    or char_length(coalesce(p_update->>'vendorLabel',''))>160 or (nullif(p_update->>'sourceUrl','') is not null and (char_length(p_update->>'sourceUrl')>2048 or p_update->>'sourceUrl'!~*'^https://[^[:space:]@]+$'))
    or (p_update->>'type'='sale' and p_update->>'endDate'!~'^\d{4}-\d{2}-\d{2}$') or (nullif(p_update->>'endDate','') is not null and p_update->>'endDate'!~'^\d{4}-\d{2}-\d{2}$') then raise exception using errcode='22023',message='portal_unavailable'; end if;
  digest:=extensions.digest(convert_to(jsonb_strip_nulls(p_update)::text,'utf8'),'sha256'); perform portal_private.lock_portal_store(target);
  select * into row from portal_private.store_updates where store_id=target and content_digest=digest and state='live'; if found then return portal_private.store_update_json(row.update_id); end if;
  insert into portal_private.store_updates(store_id,author_user_id,update_type,headline,details,vendor_label,source_url,end_date,content_digest)
    values(target,actor,p_update->>'type',btrim(p_update->>'headline'),btrim(p_update->>'details'),nullif(btrim(p_update->>'vendorLabel'),''),nullif(btrim(p_update->>'sourceUrl'),''),nullif(p_update->>'endDate','')::date,digest) returning * into row;
  perform portal_private.record_portal_event('text_update_published',actor,target,row.update_id,digest,null,row.version); return portal_private.store_update_json(row.update_id);
end $$;
alter function app_public.portal_create_update(jsonb) owner to identity_service;

create or replace function app_public.portal_archive_update(p_update_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); id uuid; row portal_private.store_updates%rowtype; prior bigint; digest bytea;
begin begin id:=p_update_id::uuid; exception when others then raise exception using errcode='22023',message='portal_unavailable'; end; perform portal_private.lock_portal_store(target);
  select * into row from portal_private.store_updates where update_id=id and store_id=target for update; if not found then raise exception using errcode='55000',message='portal_unavailable'; end if;
  prior:=row.version; if row.state='live' then update portal_private.store_updates set state='archived',archived_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp() where update_id=id returning * into row; end if;
  digest:=extensions.digest(convert_to('archive|'||id,'utf8'),'sha256'); if row.version<>prior then perform portal_private.record_portal_event('text_update_archived',actor,target,id,digest,prior,row.version); end if; return portal_private.store_update_json(id);
end $$;
alter function app_public.portal_archive_update(text) owner to identity_service;

create or replace function app_public.portal_restore_update(p_update_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); id uuid; row portal_private.store_updates%rowtype; prior bigint; digest bytea;
begin begin id:=p_update_id::uuid; exception when others then raise exception using errcode='22023',message='portal_unavailable'; end; perform portal_private.lock_portal_store(target);
  select * into row from portal_private.store_updates where update_id=id and store_id=target for update; if not found then raise exception using errcode='55000',message='portal_unavailable'; end if;
  prior:=row.version; if row.state='archived' then update portal_private.store_updates set state='live',archived_at=null,version=version+1,updated_at=statement_timestamp() where update_id=id returning * into row; end if;
  digest:=extensions.digest(convert_to('restore|'||id,'utf8'),'sha256'); if row.version<>prior then perform portal_private.record_portal_event('text_update_restored',actor,target,id,digest,prior,row.version); end if; return portal_private.store_update_json(id);
end $$;
alter function app_public.portal_restore_update(text) owner to identity_service;

create or replace function app_public.portal_list_official_links()
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare target uuid:=portal_private.require_portal_scope(); begin
  return coalesce((select jsonb_agg(jsonb_build_object('platform',l.platform,'url',l.url,'verifiedAt',l.verified_at) order by l.platform) from portal_private.official_links l where l.store_id=target),'[]'::jsonb);
end $$;
alter function app_public.portal_list_official_links() owner to identity_service;

create or replace function app_public.portal_save_official_link(p_link jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); row portal_private.official_links%rowtype; digest bytea; prior bigint; begin
  if jsonb_typeof(p_link)<>'object' or not portal_private.official_link_allowed(p_link->>'platform',p_link->>'url') then raise exception using errcode='22023',message='portal_unavailable'; end if;
  perform portal_private.lock_portal_store(target); select version into prior from portal_private.official_links where store_id=target and platform=p_link->>'platform' for update;
  insert into portal_private.official_links(store_id,platform,url,verified_by) values(target,p_link->>'platform',p_link->>'url',actor)
    on conflict(store_id,platform) do update set url=excluded.url,verified_at=statement_timestamp(),verified_by=actor,version=portal_private.official_links.version+1 returning * into row;
  digest:=extensions.digest(convert_to(p_link::text,'utf8'),'sha256'); perform portal_private.record_portal_event('official_link_published',actor,target,target,digest,prior,row.version);
  return jsonb_build_object('platform',row.platform,'url',row.url,'verifiedAt',row.verified_at);
end $$;
alter function app_public.portal_save_official_link(jsonb) owner to identity_service;

create or replace function app_public.portal_remove_official_link(p_platform text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); row portal_private.official_links%rowtype; digest bytea; begin
  if p_platform not in ('facebook','instagram','youtube','pinterest','tiktok') then raise exception using errcode='22023',message='portal_unavailable'; end if;
  perform portal_private.lock_portal_store(target); delete from portal_private.official_links where store_id=target and platform=p_platform returning * into row;
  if found then digest:=extensions.digest(convert_to('remove|'||p_platform,'utf8'),'sha256'); perform portal_private.record_portal_event('official_link_removed',actor,target,target,digest,row.version,null); end if;
  return jsonb_build_object('removed',true);
end $$;
alter function app_public.portal_remove_official_link(text) owner to identity_service;

create or replace function app_public.portal_list_support_tickets()
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); begin
  return coalesce((select jsonb_agg(portal_private.support_ticket_json(t.ticket_id) order by t.updated_at desc) from portal_private.support_tickets t where t.store_id=target and t.opened_by=actor),'[]'::jsonb);
end $$;
alter function app_public.portal_list_support_tickets() owner to identity_service;

create or replace function app_public.portal_create_support_ticket(p_ticket jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); row portal_private.support_tickets%rowtype; digest bytea; case_id uuid; diagnostics jsonb:=coalesce(p_ticket->'diagnostics','[]'::jsonb);
begin
  if jsonb_typeof(p_ticket)<>'object' or p_ticket->>'category' not in ('bug','confusing_workflow','store_data_correction','feature_idea','security_privacy')
    or nullif(btrim(p_ticket->>'subject'),'') is null or char_length(p_ticket->>'subject')>160 or nullif(btrim(p_ticket->>'body'),'') is null or char_length(p_ticket->>'body')>4000
    or not portal_private.diagnostics_allowed(diagnostics) then raise exception using errcode='22023',message='portal_unavailable'; end if;
  digest:=extensions.digest(convert_to(jsonb_build_object('category',p_ticket->>'category','subject',btrim(p_ticket->>'subject'),'body',btrim(p_ticket->>'body'),'diagnostics',diagnostics)::text,'utf8'),'sha256');
  perform portal_private.lock_portal_store(target); select * into row from portal_private.support_tickets where store_id=target and opened_by=actor and request_digest=digest and state<>'resolved'; if found then return portal_private.support_ticket_json(row.ticket_id); end if;
  insert into portal_private.support_tickets(store_id,opened_by,category,subject,body,diagnostics,request_digest) values(target,actor,p_ticket->>'category',btrim(p_ticket->>'subject'),btrim(p_ticket->>'body'),diagnostics,digest) returning * into row;
  insert into admin_private.admin_review_cases(case_type,target_kind,target_id,store_id,snapshot_hash) values('support','store_support_ticket',row.ticket_id,target,digest) returning admin_private.admin_review_cases.case_id into case_id;
  update portal_private.support_tickets set admin_case_id=case_id where ticket_id=row.ticket_id returning * into row;
  insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,to_state,snapshot_hash,idempotency_key) values(case_id,actor,'created','open',digest,'portal-support-'||row.ticket_id);
  insert into portal_private.support_events(ticket_id,actor_user_id,event_kind,to_state) values(row.ticket_id,actor,'submitted','submitted');
  perform portal_private.record_portal_event('support_ticket_created',actor,target,row.ticket_id,digest,null,row.version); return portal_private.support_ticket_json(row.ticket_id);
end $$;
alter function app_public.portal_create_support_ticket(jsonb) owner to identity_service;

create or replace function app_public.portal_reply_support_ticket(p_ticket_id text,p_body text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); id uuid; ticket portal_private.support_tickets%rowtype; reply portal_private.support_replies%rowtype; digest bytea; prior bigint; prior_state text;
begin begin id:=p_ticket_id::uuid; exception when others then raise exception using errcode='22023',message='portal_unavailable'; end;
  if p_body is null or p_body<>btrim(p_body) or char_length(p_body) not between 1 and 4000 or p_body~'[[:cntrl:]]' then raise exception using errcode='22023',message='portal_unavailable'; end if;
  digest:=extensions.digest(convert_to(p_body,'utf8'),'sha256'); perform portal_private.lock_portal_store(target);
  select * into ticket from portal_private.support_tickets where ticket_id=id and store_id=target and opened_by=actor for update; if not found or ticket.state='resolved' then raise exception using errcode='55000',message='portal_unavailable'; end if;
  select * into reply from portal_private.support_replies where ticket_id=id and author_kind='owner' and body_digest=digest; if not found then
    insert into portal_private.support_replies(ticket_id,author_kind,author_user_id,body,body_digest) values(id,'owner',actor,p_body,digest) returning * into reply;
    prior:=ticket.version; prior_state:=ticket.state; update portal_private.support_tickets set state='in_review',updated_at=statement_timestamp(),version=version+1 where ticket_id=id returning * into ticket;
    insert into portal_private.support_events(ticket_id,actor_user_id,event_kind,from_state,to_state) values(id,actor,'owner_replied',prior_state,'in_review');
    perform portal_private.record_portal_event('support_owner_replied',actor,target,id,digest,prior,ticket.version);
  end if; return portal_private.support_ticket_json(id);
end $$;
alter function app_public.portal_reply_support_ticket(text,text) owner to identity_service;

create or replace function app_public.portal_confirm_support_resolution(p_ticket_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); id uuid; ticket portal_private.support_tickets%rowtype; digest bytea; begin
  begin id:=p_ticket_id::uuid; exception when others then raise exception using errcode='22023',message='portal_unavailable'; end; perform portal_private.lock_portal_store(target);
  select * into ticket from portal_private.support_tickets where ticket_id=id and store_id=target and opened_by=actor for update; if not found or ticket.state<>'resolved' then raise exception using errcode='55000',message='portal_unavailable'; end if;
  if not exists(select 1 from portal_private.support_events e where e.ticket_id=id and e.event_kind='owner_confirmed') then
    insert into portal_private.support_events(ticket_id,actor_user_id,event_kind,from_state,to_state) values(id,actor,'owner_confirmed','resolved','resolved');
    digest:=extensions.digest(convert_to('confirm|'||id,'utf8'),'sha256');
    perform portal_private.record_portal_event('support_resolution_confirmed',actor,target,id,digest,ticket.version,ticket.version);
  end if; return portal_private.support_ticket_json(id);
end $$;
alter function app_public.portal_confirm_support_resolution(text) owner to identity_service;

create or replace function app_public.portal_reopen_support_ticket(p_ticket_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); id uuid; ticket portal_private.support_tickets%rowtype; prior bigint; digest bytea; begin
  begin id:=p_ticket_id::uuid; exception when others then raise exception using errcode='22023',message='portal_unavailable'; end; perform portal_private.lock_portal_store(target);
  select * into ticket from portal_private.support_tickets where ticket_id=id and store_id=target and opened_by=actor for update; if not found or ticket.state not in ('resolved','reopened') then raise exception using errcode='55000',message='portal_unavailable'; end if;
  prior:=ticket.version; if ticket.state='resolved' then update portal_private.support_tickets set state='reopened',resolved_at=null,updated_at=statement_timestamp(),version=version+1 where ticket_id=id returning * into ticket;
    insert into portal_private.support_events(ticket_id,actor_user_id,event_kind,from_state,to_state) values(id,actor,'reopened','resolved','reopened');
    digest:=extensions.digest(convert_to('reopen|'||id,'utf8'),'sha256'); perform portal_private.record_portal_event('support_reopened',actor,target,id,digest,prior,ticket.version); end if; return portal_private.support_ticket_json(id);
end $$;
alter function app_public.portal_reopen_support_ticket(text) owner to identity_service;

create or replace function app_public.portal_preview_public_listing()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope(); s app_public.stores%rowtype; p portal_private.store_profiles%rowtype; freshness text; verified timestamptz;
begin insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing; select * into s from app_public.stores where id=target; select * into p from portal_private.store_profiles where store_id=target;
  select f.freshness_state,f.oldest_verified_at into freshness,verified from app_public.catalog_freshness(target,statement_timestamp()) f;
  return jsonb_build_object('storeName',s.name,'listingState',p.listing_state,'liveFields',jsonb_strip_nulls(jsonb_build_object('phone',s.phone,'website',s.website,'description',s.description)),
    'pendingChanges',coalesce((select jsonb_agg(portal_private.controlled_change_json(c.change_id) order by c.submitted_at) from portal_private.controlled_changes c where c.store_id=target and c.state in ('pending','changes_requested')),'[]'::jsonb),
    'freshness',jsonb_strip_nulls(jsonb_build_object('state',case freshness when 'current' then 'verified' when 'overdue' then 'overdue' when 'stale' then 'stale' else 'unknown' end,'label',case freshness when 'current' then 'Verified' when 'overdue' then 'Verification overdue' when 'stale' then 'Verification required' else 'Verification date unavailable' end,'verifiedAt',verified)));
end $$;
alter function app_public.portal_preview_public_listing() owner to identity_service;

revoke all on function portal_private.require_portal_scope(),portal_private.lock_portal_store(uuid),portal_private.record_portal_event(text,uuid,uuid,uuid,bytea,bigint,bigint),portal_private.official_link_allowed(text,text),portal_private.diagnostics_allowed(jsonb),portal_private.controlled_change_json(uuid),portal_private.store_update_json(uuid),portal_private.support_ticket_json(uuid) from public,anon,authenticated;
revoke all on function app_public.portal_get_home(),app_public.portal_get_hours(),app_public.portal_save_hours(jsonb),app_public.portal_save_managed_fields(jsonb),app_public.portal_submit_controlled_change(jsonb),app_public.portal_list_updates(),app_public.portal_create_update(jsonb),app_public.portal_archive_update(text),app_public.portal_restore_update(text),app_public.portal_list_official_links(),app_public.portal_save_official_link(jsonb),app_public.portal_remove_official_link(text),app_public.portal_list_support_tickets(),app_public.portal_create_support_ticket(jsonb),app_public.portal_reply_support_ticket(text,text),app_public.portal_confirm_support_resolution(text),app_public.portal_reopen_support_ticket(text),app_public.portal_preview_public_listing() from public,anon;
grant execute on function app_public.portal_get_home(),app_public.portal_get_hours(),app_public.portal_save_hours(jsonb),app_public.portal_save_managed_fields(jsonb),app_public.portal_submit_controlled_change(jsonb),app_public.portal_list_updates(),app_public.portal_create_update(jsonb),app_public.portal_archive_update(text),app_public.portal_restore_update(text),app_public.portal_list_official_links(),app_public.portal_save_official_link(jsonb),app_public.portal_remove_official_link(text),app_public.portal_list_support_tickets(),app_public.portal_create_support_ticket(jsonb),app_public.portal_reply_support_ticket(text,text),app_public.portal_confirm_support_resolution(text),app_public.portal_reopen_support_ticket(text),app_public.portal_preview_public_listing() to authenticated;

revoke create on schema portal_private,app_public from identity_service;
revoke identity_service from postgres;
