-- #581: bind one separately-moderated image receipt to one Store Update.
-- Image-bearing updates stay private until their approved derivative publishes.

alter table portal_private.store_updates
  alter column published_at drop not null;
alter table portal_private.store_updates
  drop constraint if exists store_updates_state_check;
alter table portal_private.store_updates
  add constraint store_updates_state_check
  check (state in ('live','archived','pending_review'));

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='portal_private.store_updates'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) like '%archived_at%'
  loop
    execute format('alter table portal_private.store_updates drop constraint %I',c.conname);
  end loop;
end $$;

alter table portal_private.store_updates
  add constraint store_update_publication_state_check check(
    (state='live' and published_at is not null and archived_at is null)
    or (state='pending_review' and published_at is null and archived_at is null)
    or (state='archived' and published_at is not null and archived_at is not null)
  );

alter table media_private.media_uploads
  drop constraint if exists media_uploads_kind_check;
alter table media_private.media_uploads
  add constraint media_uploads_kind_check check(kind in ('cover','gallery','store_update'));
alter table media_private.media_uploads
  drop constraint if exists media_publication_shape;
alter table media_private.media_uploads
  add constraint media_publication_shape check(
    state<>'published'
    or (published_at is not null and public_derivative_object_key is not null
      and ((kind='store_update' and catalog_media_id is null)
        or (kind<>'store_update' and catalog_media_id is not null)))
  );

create table portal_private.store_update_image_bindings (
  update_id uuid primary key references portal_private.store_updates(update_id) on delete cascade,
  upload_id uuid not null unique references media_private.media_uploads(upload_id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_digest bytea not null check(octet_length(request_digest)=32),
  created_at timestamptz not null default statement_timestamp()
);
alter table portal_private.store_update_image_bindings owner to identity_service;
alter table portal_private.store_update_image_bindings enable row level security;
alter table portal_private.store_update_image_bindings force row level security;
revoke all on portal_private.store_update_image_bindings
  from public,anon,authenticated,service_role,catalog_reader,store_update_expiry_service,media_automation;
grant select,insert on portal_private.store_update_image_bindings to identity_service;
create policy identity_service_store_update_image_bindings
  on portal_private.store_update_image_bindings
  for all to identity_service using(true) with check(true);

grant usage on schema media_private to identity_service;
grant usage on schema portal_private to media_automation;

create function media_private.store_update_image_receipt_reviewable(
  p_upload_id uuid,p_actor uuid,p_store_id uuid
) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from media_private.media_uploads
    where upload_id=p_upload_id and actor_user_id=p_actor and store_id=p_store_id
      and kind='store_update' and state='awaiting_review'
      and target_media_id is null and rights_confirmed_at is not null
    for update;
  return found;
end $$;
alter function media_private.store_update_image_receipt_reviewable(uuid,uuid,uuid) owner to media_automation;
revoke all on function media_private.store_update_image_receipt_reviewable(uuid,uuid,uuid)
  from public,anon,authenticated,service_role,media_worker,media_lifecycle_service;
grant execute on function media_private.store_update_image_receipt_reviewable(uuid,uuid,uuid)
  to identity_service;

create function media_private.store_update_image_is_published(p_upload_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from media_private.media_uploads
    where upload_id=p_upload_id and kind='store_update' and state='published'
      and catalog_media_id is null and public_derivative_object_key is not null
  );
$$;
alter function media_private.store_update_image_is_published(uuid) owner to media_automation;
revoke all on function media_private.store_update_image_is_published(uuid)
  from public,anon,authenticated,service_role,media_worker,media_lifecycle_service;
grant execute on function media_private.store_update_image_is_published(uuid)
  to identity_service;

create function portal_private.store_update_image_bound(p_upload_id uuid,p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from portal_private.store_update_image_bindings b
    join portal_private.store_updates u on u.update_id=b.update_id and u.store_id=b.store_id
    where b.upload_id=p_upload_id and b.store_id=p_store_id and u.state='pending_review'
  );
$$;
alter function portal_private.store_update_image_bound(uuid,uuid) owner to identity_service;
revoke all on function portal_private.store_update_image_bound(uuid,uuid)
  from public,anon,authenticated,service_role,catalog_reader,store_update_expiry_service;
grant execute on function portal_private.store_update_image_bound(uuid,uuid)
  to media_automation;

create function portal_private.record_store_update_image_publish_event(
  p_store_id uuid,p_update_id uuid,p_digest bytea,p_previous_version bigint,p_resulting_version bigint
)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  insert into portal_private.portal_audit_events(
    event_kind,actor_user_id,store_id,resource_id,payload_hash,previous_version,resulting_version
  ) values('text_update_image_published',null,p_store_id,p_update_id,p_digest,p_previous_version,p_resulting_version);
  insert into app_private.privileged_audit_events(
    actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash
  ) values(null,null,'portal_text_update_image_published','completed','store_update',p_update_id,
    'approved_media_receipt',p_digest,decode(repeat('00',32),'hex'));
end $$;
alter function portal_private.record_store_update_image_publish_event(uuid,uuid,bytea,bigint,bigint) owner to identity_service;
revoke all on function portal_private.record_store_update_image_publish_event(uuid,uuid,bytea,bigint,bigint)
  from public,anon,authenticated;

create function portal_private.publish_store_update_image(p_upload_id uuid)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare
  target_id uuid;
  target_store uuid;
  row portal_private.store_updates%rowtype;
  prior_version bigint;
  event_digest bytea;
begin
  if not media_private.store_update_image_is_published(p_upload_id) then
    raise exception using errcode='55000',message='media_worker_unavailable';
  end if;
  select b.update_id,b.store_id into target_id,target_store
    from portal_private.store_update_image_bindings b
    where b.upload_id=p_upload_id;
  if not found then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  perform portal_private.lock_portal_store(target_store);
  select * into row from portal_private.store_updates
    where update_id=target_id and store_id=target_store for update;
  if not found or row.state<>'pending_review' then
    raise exception using errcode='55000',message='media_worker_unavailable';
  end if;
  prior_version:=row.version;
  event_digest:=extensions.digest(convert_to('store_update_image_published|'||p_upload_id::text,'utf8'),'sha256');
  update portal_private.store_updates set
    state='live',published_at=statement_timestamp(),archived_at=null,
    version=version+1,updated_at=statement_timestamp()
    where update_id=target_id and store_id=target_store returning * into row;
  perform portal_private.record_store_update_image_publish_event(
    target_store,target_id,event_digest,prior_version,row.version
  );
  return target_id;
end $$;
alter function portal_private.publish_store_update_image(uuid) owner to identity_service;
revoke all on function portal_private.publish_store_update_image(uuid)
  from public,anon,authenticated,service_role,catalog_reader,store_update_expiry_service;
grant execute on function portal_private.publish_store_update_image(uuid) to media_automation;

create or replace function app_public.portal_create_update(p_update jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target uuid:=portal_private.require_portal_scope();
  image_id uuid;
  digest bytea;
  next_end_date date;
  row portal_private.store_updates%rowtype;
  binding portal_private.store_update_image_bindings%rowtype;
begin
  if jsonb_typeof(p_update) is distinct from 'object'
    or p_update - array['type','headline','details','vendorLabel','sourceUrl','endDate','imageRequested','imageUploadId'] <> '{}'::jsonb
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
    or (p_update ? 'imageRequested' and p_update->'imageRequested'<>'false'::jsonb)
    or (p_update ? 'endDate' and jsonb_typeof(p_update->'endDate') not in ('string','null'))
    or (p_update ? 'imageUploadId' and (
      jsonb_typeof(p_update->'imageUploadId') is distinct from 'string'
      or p_update->>'imageUploadId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )) then
    raise exception using errcode='22023',message='portal_unavailable';
  end if;
  next_end_date:=null;
  if nullif(p_update->>'endDate','') is not null then
    if p_update->>'endDate'!~'^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode='22023',message='portal_unavailable';
    end if;
    begin next_end_date:=(p_update->>'endDate')::date;
    exception when others then raise exception using errcode='22023',message='portal_unavailable'; end;
    if next_end_date::text<>p_update->>'endDate' then
      raise exception using errcode='22023',message='portal_unavailable';
    end if;
  elsif p_update->>'type'='sale' then
    raise exception using errcode='22023',message='portal_unavailable';
  end if;
  if p_update ? 'imageUploadId' then image_id:=(p_update->>'imageUploadId')::uuid; end if;
  digest:=extensions.digest(convert_to(jsonb_strip_nulls(p_update)::text,'utf8'),'sha256');
  perform portal_private.lock_portal_store(target);

  if image_id is not null then
    select * into binding from portal_private.store_update_image_bindings
      where upload_id=image_id;
    if found then
      if binding.actor_user_id<>actor or binding.store_id<>target then
        raise exception using errcode='55000',message='portal_unavailable';
      end if;
      if binding.request_digest=digest then
        return portal_private.store_update_json(binding.update_id);
      end if;
      raise exception using errcode='40001',message='portal_unavailable';
    end if;
    if not media_private.store_update_image_receipt_reviewable(image_id,actor,target) then
      raise exception using errcode='55000',message='portal_unavailable';
    end if;
  else
    select * into row from portal_private.store_updates
      where store_id=target and content_digest=digest and state='live';
    if found then return portal_private.store_update_json(row.update_id); end if;
  end if;

  begin
    insert into portal_private.store_updates(
      store_id,author_user_id,update_type,headline,details,vendor_label,source_url,end_date,
      content_digest,state,published_at
    ) values(
      target,actor,p_update->>'type',btrim(p_update->>'headline'),btrim(p_update->>'details'),
      nullif(btrim(p_update->>'vendorLabel'),''),nullif(btrim(p_update->>'sourceUrl'),''),
      next_end_date,digest,
      case when image_id is null then 'live' else 'pending_review' end,
      case when image_id is null then statement_timestamp() else null end
    ) returning * into row;
    if image_id is not null then
      insert into portal_private.store_update_image_bindings(
        update_id,upload_id,store_id,actor_user_id,request_digest
      ) values(row.update_id,image_id,target,actor,digest);
    end if;
  exception when unique_violation then
    if image_id is not null then
      select * into binding from portal_private.store_update_image_bindings
        where upload_id=image_id;
      if found and binding.actor_user_id=actor and binding.store_id=target
        and binding.request_digest=digest then
        return portal_private.store_update_json(binding.update_id);
      end if;
      if found and (binding.actor_user_id<>actor or binding.store_id<>target) then
        raise exception using errcode='55000',message='portal_unavailable';
      end if;
      raise exception using errcode='40001',message='portal_unavailable';
    end if;
    select * into row from portal_private.store_updates
      where store_id=target and content_digest=digest and state='live';
    if found then return portal_private.store_update_json(row.update_id); end if;
    raise exception using errcode='40001',message='portal_unavailable';
  end;

  if image_id is null then
    perform portal_private.record_portal_event(
      'text_update_published',actor,target,row.update_id,digest,null,row.version
    );
  else
    perform portal_private.record_portal_event(
      'text_update_submitted_for_image_review',actor,target,row.update_id,digest,null,row.version
    );
  end if;
  return portal_private.store_update_json(row.update_id);
end $$;
alter function app_public.portal_create_update(jsonb) owner to identity_service;

create or replace function app_public.portal_edit_update(
  p_update_id text,p_update jsonb,p_expected_version bigint,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target uuid:=portal_private.require_portal_scope();
  id uuid;
  image_id uuid;
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
    or p_update - array['type','headline','details','vendorLabel','sourceUrl','endDate','imageRequested','imageUploadId'] <> '{}'::jsonb
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
    or (p_update ? 'imageRequested' and p_update->'imageRequested'<>'false'::jsonb)
    or (p_update ? 'imageUploadId' and (
      jsonb_typeof(p_update->'imageUploadId') is distinct from 'string'
      or p_update->>'imageUploadId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ))
    or (nullif(p_update->>'sourceUrl','') is not null and
      (char_length(p_update->>'sourceUrl')>2048 or p_update->>'sourceUrl'!~*'^https://[^[:space:]@]+$'))
    or (p_update ? 'endDate' and jsonb_typeof(p_update->'endDate') not in ('string','null')) then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  if p_update ? 'imageUploadId' then image_id:=(p_update->>'imageUploadId')::uuid; end if;

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

  perform 1 from portal_private.store_updates
    where update_id=id and store_id=target for update;
  if not found then raise exception using errcode='55000',message='portal_unavailable'; end if;
  select * into row from portal_private.store_updates where update_id=id and store_id=target;
  if row.version<>p_expected_version then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',row.version));
  end if;

  if image_id is not null then
    if row.state<>'live'
      or exists(select 1 from portal_private.store_update_image_bindings
        where update_id=id or upload_id=image_id) then
      return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',row.version));
    end if;
    if not media_private.store_update_image_receipt_reviewable(image_id,actor,target) then
      raise exception using errcode='55000',message='portal_unavailable';
    end if;
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
      state=case when image_id is null then state else 'pending_review' end,
      published_at=case when image_id is null then published_at else null end,
      archived_at=case when image_id is null then archived_at else null end,
      version=version+1,
      updated_at=statement_timestamp()
      where update_id=id and store_id=target returning * into row;
    if image_id is not null then
      insert into portal_private.store_update_image_bindings(
        update_id,upload_id,store_id,actor_user_id,request_digest
      ) values(id,image_id,target,actor,request_digest);
    end if;
  exception when unique_violation then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',prior_version));
  end;

  perform portal_private.record_portal_event(
    'text_update_edited',actor,target,id,draft_digest,prior_version,row.version
  );
  result:=jsonb_build_object('state','saved','update',portal_private.store_update_json(id));
  insert into portal_private.store_update_edit_receipts(
    actor_user_id,store_id,operation,idempotency_key,request_digest,result
  ) values(actor,target,'text_update_edit',p_idempotency_key,request_digest,result);
  return result;
end $$;
alter function app_public.portal_edit_update(text,jsonb,bigint,text) owner to identity_service;

create or replace function app_public.media_reserve_upload(
  p_store_id uuid,p_kind text,p_alt_text text,p_idempotency_key uuid,p_rights_confirmed boolean,
  p_source_mime text,p_source_bytes bigint,p_source_width integer,p_source_height integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  existing media_private.media_uploads%rowtype;
  upload_id uuid:=extensions.gen_random_uuid();
  daily_count integer;
  concurrent_count integer;
  cap_result jsonb;
begin
  if actor is null or not app_private.current_session_is_active() then
    perform portal_private.log_owner_access_denial('media_reserve_session',p_store_id);
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  perform portal_private.require_owner_media_scope(p_store_id);
  if p_idempotency_key is null then raise exception using errcode='22023',message='media_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_idempotency_key::text,1));
  select * into existing from media_private.media_uploads
    where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if p_rights_confirmed is distinct from true
      or existing.store_id is distinct from p_store_id or existing.kind is distinct from p_kind
      or existing.alt_text is distinct from p_alt_text or existing.source_mime is distinct from p_source_mime
      or existing.source_bytes is distinct from p_source_bytes or existing.source_width is distinct from p_source_width
      or existing.source_height is distinct from p_source_height then
      raise exception using errcode='22023',message='media_unavailable';
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'originalObjectKey',existing.original_object_key,
      'derivativeObjectKey',existing.private_derivative_object_key,'state',existing.state,'replayed',true);
  end if;
  if not media_private.capability_enabled() or p_rights_confirmed is distinct from true
    or p_kind is null or p_kind not in ('cover','gallery','store_update')
    or p_alt_text is null or p_source_mime is null or p_source_bytes is null
    or p_source_width is null or p_source_height is null or p_alt_text<>btrim(p_alt_text)
    or char_length(p_alt_text) not between 1 and 240 or p_alt_text~'[[:cntrl:]]'
    or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608 or p_source_width not between 1 and 8192
    or p_source_height not between 1 and 8192 or p_source_width::bigint*p_source_height::bigint>40000000
    or not exists(select 1 from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'denied');
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text,0));
  if p_kind<>'store_update' then
    cap_result:=partner_private.check_store_media_cap(p_store_id,p_kind,p_idempotency_key);
    if not coalesce((cap_result->>'allowed')::boolean,false) then
      perform media_private.append_audit('media_reservation',actor,p_store_id,null,'blocked');
      raise exception using errcode='23505',message='media_unavailable';
    end if;
  end if;
  select count(*) into daily_count from media_private.media_uploads
    where store_id=p_store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads
    where store_id=p_store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'blocked');
    raise exception using errcode='54000',message='media_unavailable';
  end if;
  insert into media_private.media_uploads(
    upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
    source_mime,source_bytes,source_width,source_height,original_object_key,
    private_derivative_object_key,purge_due_at
  ) values(
    upload_id,actor,p_store_id,p_kind,p_alt_text,statement_timestamp(),p_idempotency_key,
    p_source_mime,p_source_bytes,p_source_width,p_source_height,
    'quarantine/'||upload_id::text||'/original',
    'quarantine/'||upload_id::text||'/derivative.webp',statement_timestamp()+interval '24 hours'
  );
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at)
    values(upload_id,'abandoned',statement_timestamp()+interval '24 hours');
  perform media_private.append_audit('media_reserved',actor,p_store_id,upload_id,'allowed');
  return jsonb_build_object('uploadId',upload_id,'originalObjectKey','quarantine/'||upload_id::text||'/original',
    'derivativeObjectKey','quarantine/'||upload_id::text||'/derivative.webp','state','reserved','replayed',false);
end $$;
alter function app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)
  owner to media_automation;

create or replace function app_public.media_approve_upload(
  p_upload_id uuid,p_display_order integer,p_expected_version bigint,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target_store uuid;
  u media_private.media_uploads%rowtype;
  target app_public.store_media%rowtype;
  cap_result jsonb;
  approved_order integer;
begin
  if actor is null or not app_private.current_session_is_active()
    or not app_private.current_user_has_role('administrator'::app_private.app_role)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_expected_version is null or p_reason is null or p_reason!~'^[a-z][a-z0-9_]{1,63}$'
    or p_display_order is null or p_display_order<0 then
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  select store_id into target_store from media_private.media_uploads where upload_id=p_upload_id;
  if target_store is null then raise exception using errcode='40001',message='media_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_store::text,0));
  select * into u from media_private.media_uploads where upload_id=p_upload_id for update;
  if not found or u.state<>'awaiting_review' or u.version<>p_expected_version then
    raise exception using errcode='40001',message='media_unavailable';
  end if;
  if u.kind='store_update' then
    if u.target_media_id is not null
      or not portal_private.store_update_image_bound(u.upload_id,u.store_id) then
      raise exception using errcode='40001',message='media_unavailable';
    end if;
    approved_order:=null;
  elsif u.target_media_id is not null then
    select * into target from app_public.store_media
      where id=u.target_media_id and store_id=u.store_id for update;
    if not found or target.version<>u.expected_media_version
      or target.kind::text<>u.kind then
      raise exception using errcode='40001',message='media_unavailable';
    end if;
    approved_order:=target.display_order;
  else
    cap_result:=partner_private.check_store_media_cap(u.store_id,u.kind,u.idempotency_key);
    if not coalesce((cap_result->>'allowed')::boolean,false) then
      raise exception using errcode='23505',message='media_unavailable';
    end if;
    approved_order:=p_display_order;
  end if;
  update media_private.media_uploads set state='approved_pending_publish',approved_by=actor,
    approved_at=statement_timestamp(),approval_reason=p_reason,display_order=approved_order,
    public_derivative_object_key='official/'||u.store_id::text||'/v'||u.version::text||'/'
      ||substr(encode(u.derivative_digest,'hex'),1,32)||replace(u.upload_id::text,'-','')||'.webp',
    updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  perform media_private.append_audit('media_approved',actor,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('uploadId',u.upload_id,'state',u.state,'jobId',u.upload_id,'version',u.version);
end $$;
alter function app_public.media_approve_upload(uuid,integer,bigint,text) owner to media_automation;

create function media_private.complete_store_update_publish_job(
  p_job_id uuid,p_upload_id uuid,p_public_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  u media_private.media_uploads%rowtype;
  target_store uuid;
  update_id uuid;
begin
  select store_id into target_store from media_private.media_uploads
    where upload_id=p_upload_id and upload_id=p_job_id and kind='store_update';
  if target_store is null then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_store::text,0));
  select * into u from media_private.media_uploads
    where upload_id=p_upload_id and upload_id=p_job_id for update;
  if not found or u.kind<>'store_update' or u.state<>'approved_pending_publish'
    or u.public_derivative_object_key is null or p_public_key is null
    or u.public_derivative_object_key<>p_public_key or u.publish_claimed_at is null
    or not portal_private.store_update_image_bound(u.upload_id,u.store_id) then
    raise exception using errcode='55000',message='media_worker_unavailable';
  end if;
  update media_private.media_uploads set state='published',display_order=null,catalog_media_id=null,
    published_at=statement_timestamp(),publish_claimed_at=null,updated_at=statement_timestamp(),
    version=version+1
    where upload_id=u.upload_id returning * into u;
  update_id:=portal_private.publish_store_update_image(u.upload_id);
  insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
    values(u.upload_id,'private_after_publish',true,false,statement_timestamp()+interval '24 hours')
    on conflict do nothing;
  perform media_private.append_audit('media_published',null,u.store_id,u.upload_id,'completed');
  return jsonb_build_object('state','published','updateId',update_id);
end $$;
alter function media_private.complete_store_update_publish_job(uuid,uuid,text) owner to media_automation;
revoke all on function media_private.complete_store_update_publish_job(uuid,uuid,text)
  from public,anon,authenticated,service_role,media_moderation;

create or replace function app_public.media_complete_publish_job(
  p_job_id uuid,p_upload_id uuid,p_public_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare media_kind text;
begin
  select kind into media_kind from media_private.media_uploads
    where upload_id=p_upload_id and upload_id=p_job_id;
  if media_kind='store_update' then
    return media_private.complete_store_update_publish_job(p_job_id,p_upload_id,p_public_key);
  end if;
  return media_private.complete_publish_job(p_job_id,p_upload_id,p_public_key);
end $$;
alter function app_public.media_complete_publish_job(uuid,uuid,text) owner to media_automation;

reset role;
