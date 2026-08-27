-- M-01 provider-neutral official-media quarantine and publication boundary.
-- The provider capability is deliberately blocked until an externally verified
-- provider_m receipt and deployment-owned stage flag both exist.

do $$
begin
  if not exists(select 1 from pg_roles where rolname='media_automation') then
    create role media_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='media_worker') then
    create role media_worker nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='media_lifecycle_service') then
    create role media_lifecycle_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='media_deployment_service') then
    create role media_deployment_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant media_automation to postgres;
create schema if not exists media_private;
revoke all on schema media_private from public,anon,authenticated,service_role;
grant usage on schema media_private to media_automation,media_worker,media_lifecycle_service,media_deployment_service;
grant create on schema media_private to media_automation;
grant create on schema app_public to media_automation;
grant usage on schema app_public to media_automation,media_worker,media_lifecycle_service,media_deployment_service;
grant usage on schema storage to media_worker,media_lifecycle_service;

create table media_private.media_provider_config (
  id smallint primary key default 1 check(id=1),
  state text not null default 'blocked' check(state in ('blocked','accepted','paused')),
  gate_receipt_id uuid references release_private.release_gate_receipts(gate_receipt_id) on delete restrict,
  provider_key text check(provider_key is null or provider_key~'^[a-z][a-z0-9_-]{1,63}$'),
  contract_version text check(contract_version is null or contract_version~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  processing_region text check(processing_region is null or char_length(processing_region) between 2 and 80),
  provider_retention_days integer check(provider_retention_days between 0 and 30),
  hard_storage_bytes bigint check(hard_storage_bytes between 1 and 10737418240),
  provider_daily_operation_limit integer check(provider_daily_operation_limit between 1 and 100000),
  provider_concurrent_limit integer check(provider_concurrent_limit between 1 and 100),
  replacement_path text check(replacement_path is null or (replacement_path=btrim(replacement_path) and char_length(replacement_path) between 3 and 240)),
  config_digest bytea check(config_digest is null or octet_length(config_digest)=32),
  accepted_at timestamptz,
  paused_at timestamptz,
  pause_reason text check(pause_reason is null or pause_reason~'^[a-z][a-z0-9_]{1,63}$'),
  version bigint not null default 1 check(version>0),
  check((state='blocked' and gate_receipt_id is null and accepted_at is null)
    or (state='accepted' and gate_receipt_id is not null and accepted_at is not null and paused_at is null and pause_reason is null)
    or (state='paused' and gate_receipt_id is not null and accepted_at is not null and paused_at is not null and pause_reason is not null))
);
insert into media_private.media_provider_config(id) values(1);

create table media_private.media_uploads (
  upload_id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_tombstone uuid,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  kind text not null check(kind in ('cover','gallery')),
  alt_text text not null check(alt_text=btrim(alt_text) and char_length(alt_text) between 1 and 240 and alt_text!~'[[:cntrl:]]'),
  rights_confirmed_at timestamptz not null,
  idempotency_key uuid not null,
  source_mime text not null check(source_mime in ('image/jpeg','image/png','image/webp')),
  source_bytes bigint not null check(source_bytes between 20 and 8388608),
  source_width integer not null check(source_width between 1 and 8192),
  source_height integer not null check(source_height between 1 and 8192),
  original_object_key text not null unique,
  private_derivative_object_key text not null unique,
  public_derivative_object_key text unique,
  derivative_digest bytea check(derivative_digest is null or octet_length(derivative_digest)=32),
  derivative_bytes bigint check(derivative_bytes between 20 and 4194304),
  derivative_width integer check(derivative_width between 1 and 8192),
  derivative_height integer check(derivative_height between 1 and 8192),
  scan_state text not null default 'pending' check(scan_state in ('pending','clean','malicious','unknown','failed')),
  metadata_stripped boolean not null default false,
  reencoded boolean not null default false,
  state text not null default 'reserved' check(state in ('reserved','staged','quarantined','awaiting_review','approved_pending_publish','published','rejected','withdrawn','purge_pending','purged')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_reason text check(approval_reason is null or approval_reason~'^[a-z][a-z0-9_]{1,63}$'),
  rejection_reason text,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  display_order smallint check(display_order between 0 and 5),
  catalog_media_id uuid references app_public.store_media(id) on delete set null,
  publish_claimed_at timestamptz,
  published_at timestamptz,
  purge_due_at timestamptz,
  private_deleted_at timestamptz,
  public_deleted_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check(version>0),
  unique(actor_user_id,idempotency_key),
  constraint media_upload_actor_shape check(actor_user_id is not null or actor_tombstone is not null),
  constraint media_upload_pixels_bounded check(source_width::bigint*source_height::bigint<=40000000),
  constraint media_derivative_pixels_bounded check(derivative_width is null or derivative_width::bigint*derivative_height::bigint<=40000000),
  constraint media_original_object_key_safe check(original_object_key~'^quarantine/[0-9a-f-]{36}/original$'),
  constraint media_private_derivative_key_safe check(private_derivative_object_key~'^quarantine/[0-9a-f-]{36}/derivative\.webp$'),
  constraint media_public_object_key_safe check(public_derivative_object_key is null or public_derivative_object_key~'^official/[0-9a-f-]{36}/v[1-9][0-9]*/[a-f0-9]{16,64}\.webp$'),
  constraint media_safe_derivative_shape check(state not in ('awaiting_review','approved_pending_publish','published') or
    (scan_state='clean' and metadata_stripped and reencoded and derivative_digest is not null and derivative_bytes is not null and derivative_width is not null and derivative_height is not null)),
  constraint media_approval_shape check(state not in ('approved_pending_publish','published') or (approved_by is not null and approved_at is not null and approval_reason is not null)),
  constraint media_publication_shape check(state<>'published' or (published_at is not null and public_derivative_object_key is not null and catalog_media_id is not null))
);
create index media_upload_store_day_idx on media_private.media_uploads(store_id,created_at);
create index media_upload_work_idx on media_private.media_uploads(state,purge_due_at,created_at);

create table media_private.media_provider_operations (
  operation_id uuid primary key default extensions.gen_random_uuid(),
  upload_id uuid not null references media_private.media_uploads(upload_id) on delete restrict,
  operation_kind text not null check(operation_kind in ('scan','reencode')),
  provider_operation_id text check(provider_operation_id is null or provider_operation_id~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  outcome text not null check(outcome in ('clean','malicious','unknown','succeeded','failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null default statement_timestamp(),
  check(completed_at>=started_at),
  unique(operation_kind,provider_operation_id)
);

create table media_private.media_purge_jobs (
  purge_job_id uuid primary key default extensions.gen_random_uuid(),
  upload_id uuid not null references media_private.media_uploads(upload_id) on delete restrict,
  reason_code text not null check(reason_code in ('abandoned','quarantine_retention','rejected','withdrawn','replacement','private_after_publish','store_withdrawal','relationship_end')),
  include_private boolean not null default true,
  include_public boolean not null default false,
  due_at timestamptz not null,
  state text not null default 'queued' check(state in ('queued','claimed','completed','cancelled')),
  claimed_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count>=0),
  last_error_code text check(last_error_code is null or last_error_code~'^[a-z][a-z0-9_]{1,63}$'),
  created_at timestamptz not null default statement_timestamp(),
  check((state='claimed' and claimed_at is not null) or state<>'claimed'),
  check((state='completed' and completed_at is not null) or state<>'completed')
);
create unique index one_open_media_purge_scope on media_private.media_purge_jobs(upload_id,include_private,include_public)
  where state in ('queued','claimed');

create table media_private.media_audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  previous_hash bytea check(previous_hash is null or octet_length(previous_hash)=32),
  event_hash bytea not null unique check(octet_length(event_hash)=32),
  event_kind text not null check(event_kind~'^[a-z][a-z0-9_]{1,63}$'),
  actor_user_id uuid references auth.users(id) on delete set null,
  store_id uuid references app_public.stores(id) on delete set null,
  upload_id uuid references media_private.media_uploads(upload_id) on delete set null,
  outcome text not null check(outcome in ('allowed','denied','blocked','quarantined','completed','purged')),
  occurred_at timestamptz not null default statement_timestamp()
);

alter table app_public.store_media drop constraint media_local_asset;
alter table app_public.store_media add constraint media_local_asset check(
  asset_path~'^/assets/[a-zA-Z0-9_./-]+\.(svg|png|jpg|jpeg|webp)$'
  or asset_path~'^/media/official/[0-9a-f-]{36}/v[1-9][0-9]*/[a-f0-9]{16,64}\.webp$'
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('official-media-private','official-media-private',false,8388608,array['image/jpeg','image/png','image/webp']),
  ('official-media-public','official-media-public',true,4194304,array['image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function media_private.reject_append_only_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501',message='media_append_only';
end $$;
create trigger media_provider_operations_append_only before update or delete on media_private.media_provider_operations
  for each row execute function media_private.reject_append_only_mutation();
create trigger media_audit_append_only before update or delete on media_private.media_audit_events
  for each row execute function media_private.reject_append_only_mutation();

create or replace function media_private.append_audit(p_kind text,p_actor uuid,p_store uuid,p_upload uuid,p_outcome text)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior bytea; event_id uuid:=extensions.gen_random_uuid(); event_time timestamptz:=statement_timestamp(); digest bytea;
begin
  perform pg_advisory_xact_lock(hashtextextended('media_audit_chain',0));
  select event_hash into prior from media_private.media_audit_events order by sequence_number desc limit 1;
  digest:=extensions.digest(convert_to(coalesce(encode(prior,'hex'),'root')||'|'||event_id::text||'|'||p_kind||'|'||coalesce(p_actor::text,'')||'|'||coalesce(p_store::text,'')||'|'||coalesce(p_upload::text,'')||'|'||p_outcome||'|'||event_time::text,'utf8'),'sha256');
  insert into media_private.media_audit_events(event_id,previous_hash,event_hash,event_kind,actor_user_id,store_id,upload_id,outcome,occurred_at)
  values(event_id,prior,digest,p_kind,p_actor,p_store,p_upload,p_outcome,event_time);
  return event_id;
end $$;

create or replace function media_private.capability_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from media_private.media_provider_config c
    join release_private.release_gate_receipts g on g.gate_receipt_id=c.gate_receipt_id
    cross join app_private.environment_stage e
    where c.id=1 and c.state='accepted' and g.gate_kind='provider_m' and g.external_verified
      and e.id=1 and e.stage in ('private_beta','regional_public')
      and e.capabilities->>'official_media_upload'='true'
  );
$$;

create or replace function app_public.media_get_capability() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',media_private.capability_enabled(),'source','server');
$$;

create or replace function app_public.media_reserve_upload(
  p_store_id uuid,p_kind text,p_alt_text text,p_idempotency_key uuid,p_rights_confirmed boolean,
  p_source_mime text,p_source_bytes bigint,p_source_width integer,p_source_height integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); existing media_private.media_uploads%rowtype; upload_id uuid:=extensions.gen_random_uuid(); daily_count integer; concurrent_count integer;
begin
  if actor is null or not app_private.current_session_is_active() then raise exception using errcode='42501',message='media_unavailable'; end if;
  select * into existing from media_private.media_uploads where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if existing.store_id<>p_store_id or existing.kind<>p_kind or existing.alt_text<>p_alt_text or existing.source_mime<>p_source_mime or existing.source_bytes<>p_source_bytes or existing.source_width<>p_source_width or existing.source_height<>p_source_height then
      raise exception using errcode='22023',message='media_unavailable';
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'originalObjectKey',existing.original_object_key,'derivativeObjectKey',existing.private_derivative_object_key);
  end if;
  if not media_private.capability_enabled() or not p_rights_confirmed
    or p_kind not in ('cover','gallery') or p_alt_text<>btrim(p_alt_text) or char_length(p_alt_text) not between 1 and 240
    or p_alt_text~'[[:cntrl:]]' or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608 or p_source_width not between 1 and 8192 or p_source_height not between 1 and 8192
    or p_source_width::bigint*p_source_height::bigint>40000000
    or not exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'denied');
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text,0));
  select count(*) into daily_count from media_private.media_uploads where store_id=p_store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads where store_id=p_store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'blocked');
    raise exception using errcode='54000',message='media_unavailable';
  end if;
  insert into media_private.media_uploads(upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,purge_due_at)
  values(upload_id,actor,p_store_id,p_kind,p_alt_text,statement_timestamp(),p_idempotency_key,p_source_mime,p_source_bytes,p_source_width,p_source_height,
    'quarantine/'||upload_id::text||'/original','quarantine/'||upload_id::text||'/derivative.webp',statement_timestamp()+interval '24 hours');
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at) values(upload_id,'abandoned',statement_timestamp()+interval '24 hours');
  perform media_private.append_audit('media_reserved',actor,p_store_id,upload_id,'allowed');
  return jsonb_build_object('uploadId',upload_id,'originalObjectKey','quarantine/'||upload_id::text||'/original','derivativeObjectKey','quarantine/'||upload_id::text||'/derivative.webp');
end $$;

create or replace function app_public.media_get_upload(p_upload_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); u media_private.media_uploads%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then raise exception using errcode='42501',message='media_unavailable'; end if;
  select * into u from media_private.media_uploads where upload_id=p_upload_id and
    (actor_user_id=actor or exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=media_uploads.store_id and g.state='active'));
  if not found then raise exception using errcode='55000',message='media_unavailable'; end if;
  return jsonb_build_object('uploadId',u.upload_id,'storeId',u.store_id,'kind',u.kind,'state',u.state,'version',u.version);
end $$;

create or replace function media_private.record_staged_upload(p_upload_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u media_private.media_uploads%rowtype;
begin
  update media_private.media_uploads set state='staged',updated_at=statement_timestamp(),version=version+1
    where upload_id=p_upload_id and state='reserved' returning * into u;
  if not found then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  update media_private.media_purge_jobs set state='cancelled' where upload_id=p_upload_id and reason_code='abandoned' and state='queued';
  perform media_private.append_audit('media_staged',null,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('state',u.state);
end $$;

create or replace function media_private.record_quarantined_upload(p_upload_id uuid,p_outcome text,p_provider_operation_id text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u media_private.media_uploads%rowtype; scan_outcome text;
begin
  if p_outcome not in ('malicious','unknown','processing_failed') or (p_provider_operation_id is not null and p_provider_operation_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$') then raise exception using errcode='22023',message='media_worker_unavailable'; end if;
  scan_outcome:=case p_outcome when 'malicious' then 'malicious' when 'unknown' then 'unknown' else 'failed' end;
  update media_private.media_uploads set state='quarantined',scan_state=scan_outcome,purge_due_at=statement_timestamp()+interval '30 days',updated_at=statement_timestamp(),version=version+1
    where upload_id=p_upload_id and state in ('staged','quarantined') returning * into u;
  if not found then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  if p_provider_operation_id is not null then
    insert into media_private.media_provider_operations(upload_id,operation_kind,provider_operation_id,outcome,started_at)
      values(u.upload_id,case when p_outcome='processing_failed' then 'reencode' else 'scan' end,p_provider_operation_id,case p_outcome when 'processing_failed' then 'failed' else p_outcome end,statement_timestamp());
  end if;
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at) values(u.upload_id,'quarantine_retention',statement_timestamp()+interval '30 days') on conflict do nothing;
  perform media_private.append_audit('media_quarantined',null,u.store_id,u.upload_id,'quarantined');
  return jsonb_build_object('state','quarantined');
end $$;

create or replace function media_private.record_processing_result(
  p_upload_id uuid,p_scan_outcome text,p_scan_operation_id text,p_processor_operation_id text,
  p_derivative_digest bytea,p_derivative_bytes bigint,p_width integer,p_height integer,p_metadata_stripped boolean,p_reencoded boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare u media_private.media_uploads%rowtype;
begin
  select * into u from media_private.media_uploads where upload_id=p_upload_id for update;
  if not found or u.state<>'staged' or u.scan_state<>'pending' or p_scan_outcome<>'clean'
    or p_scan_operation_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_processor_operation_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or octet_length(p_derivative_digest)<>32 or p_derivative_bytes not between 20 and 4194304
    or p_width not between 1 and 8192 or p_height not between 1 and 8192 or p_width::bigint*p_height::bigint>40000000
    or not p_metadata_stripped or not p_reencoded then raise exception using errcode='42501',message='media_worker_unavailable'; end if;
  insert into media_private.media_provider_operations(upload_id,operation_kind,provider_operation_id,outcome,started_at)
  values(u.upload_id,'scan',p_scan_operation_id,'clean',statement_timestamp()),(u.upload_id,'reencode',p_processor_operation_id,'succeeded',statement_timestamp());
  update media_private.media_uploads set state='awaiting_review',scan_state='clean',metadata_stripped=true,reencoded=true,
    derivative_digest=p_derivative_digest,derivative_bytes=p_derivative_bytes,derivative_width=p_width,derivative_height=p_height,purge_due_at=null,updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  perform media_private.append_audit('media_processed',null,u.store_id,u.upload_id,'completed');
  return jsonb_build_object('state','awaiting_review','version',u.version);
end $$;

create or replace function app_public.media_approve_upload(p_upload_id uuid,p_display_order integer,p_expected_version bigint,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); u media_private.media_uploads%rowtype; active_count integer;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_user_has_role('administrator'::app_private.app_role)
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_reason!~'^[a-z][a-z0-9_]{1,63}$' or p_display_order not between 0 and 5 then raise exception using errcode='42501',message='media_unavailable'; end if;
  select * into u from media_private.media_uploads where upload_id=p_upload_id for update;
  if not found or u.state<>'awaiting_review' or u.version<>p_expected_version then raise exception using errcode='40001',message='media_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u.store_id::text,0));
  select count(*) into active_count from media_private.media_uploads where store_id=u.store_id and kind=u.kind and state in ('approved_pending_publish','published');
  if (u.kind='cover' and active_count>=2) or (u.kind='gallery' and active_count>=5) then raise exception using errcode='23505',message='media_unavailable'; end if;
  update media_private.media_uploads set state='approved_pending_publish',approved_by=actor,approved_at=statement_timestamp(),approval_reason=p_reason,
    display_order=p_display_order,public_derivative_object_key='official/'||u.store_id::text||'/v'||u.version::text||'/'||substr(encode(u.derivative_digest,'hex'),1,32)||'.webp',updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  perform media_private.append_audit('media_approved',actor,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('uploadId',u.upload_id,'state',u.state,'jobId',u.upload_id,'version',u.version);
end $$;

create or replace function media_private.claim_publish_job(p_job_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u media_private.media_uploads%rowtype;
begin
  update media_private.media_uploads set publish_claimed_at=statement_timestamp(),updated_at=statement_timestamp()
    where upload_id=p_job_id and state='approved_pending_publish' and (publish_claimed_at is null or publish_claimed_at<statement_timestamp()-interval '15 minutes') returning * into u;
  if not found then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  return jsonb_build_object('uploadId',u.upload_id,'privateDerivativeKey',u.private_derivative_object_key,'publicDerivativeKey',u.public_derivative_object_key);
end $$;

create or replace function media_private.list_publish_jobs(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(upload_id order by approved_at),'[]'::jsonb) from (
    select upload_id,approved_at from media_private.media_uploads
    where state='approved_pending_publish' and (publish_claimed_at is null or publish_claimed_at<statement_timestamp()-interval '15 minutes')
    order by approved_at limit least(greatest(p_limit,1),25)
  ) due;
$$;

create or replace function media_private.complete_publish_job(p_job_id uuid,p_upload_id uuid,p_public_key text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u media_private.media_uploads%rowtype; media_id uuid:=extensions.gen_random_uuid(); old_upload uuid;
begin
  select * into u from media_private.media_uploads where upload_id=p_upload_id and upload_id=p_job_id for update;
  if not found or u.state<>'approved_pending_publish' or u.public_derivative_object_key<>p_public_key or u.publish_claimed_at is null then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  if u.kind='cover' then
    select mu.upload_id into old_upload from media_private.media_uploads mu where mu.store_id=u.store_id and mu.kind='cover' and mu.state='published' for update;
    if old_upload is not null then
      delete from app_public.store_media where id=(select catalog_media_id from media_private.media_uploads where upload_id=old_upload);
      update media_private.media_uploads set state='purge_pending',purge_due_at=statement_timestamp()+interval '24 hours',updated_at=statement_timestamp(),version=version+1 where upload_id=old_upload;
      insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at) values(old_upload,'replacement',true,true,statement_timestamp()+interval '24 hours') on conflict do nothing;
    end if;
  end if;
  insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order)
    values(media_id,u.store_id,'/media/'||p_public_key,u.kind::app_public.media_kind,u.alt_text,u.display_order);
  update media_private.media_uploads set state='published',catalog_media_id=media_id,published_at=statement_timestamp(),publish_claimed_at=null,updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
    values(u.upload_id,'private_after_publish',true,false,statement_timestamp()+interval '24 hours') on conflict do nothing;
  perform media_private.append_audit('media_published',null,u.store_id,u.upload_id,'completed');
  return jsonb_build_object('state','published');
end $$;

create or replace function app_public.media_withdraw_upload(p_upload_id uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); u media_private.media_uploads%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() or p_reason not in ('rights_withdrawn','store_withdrawn','relationship_ended','author_removed') then raise exception using errcode='42501',message='media_unavailable'; end if;
  select * into u from media_private.media_uploads where upload_id=p_upload_id and state not in ('purge_pending','purged') for update;
  if not found or not (u.actor_user_id=actor or exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=u.store_id and g.state='active') or app_private.current_user_has_role('administrator'::app_private.app_role)) then raise exception using errcode='42501',message='media_unavailable'; end if;
  if u.catalog_media_id is not null then delete from app_public.store_media where id=u.catalog_media_id; end if;
  update media_private.media_uploads set state='purge_pending',purge_due_at=statement_timestamp()+interval '24 hours',catalog_media_id=null,updated_at=statement_timestamp(),version=version+1 where upload_id=u.upload_id returning * into u;
  insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
    values(u.upload_id,case p_reason when 'rights_withdrawn' then 'withdrawn' when 'store_withdrawn' then 'store_withdrawal' else 'relationship_end' end,true,u.public_derivative_object_key is not null,statement_timestamp()+interval '24 hours') on conflict do nothing;
  perform media_private.append_audit('media_withdrawn',actor,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('state','purge_pending');
end $$;

create or replace function media_private.claim_purge_job(p_job_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j media_private.media_purge_jobs%rowtype; u media_private.media_uploads%rowtype; private_keys jsonb:='[]'::jsonb; public_keys jsonb:='[]'::jsonb;
begin
  update media_private.media_purge_jobs set state='claimed',claimed_at=statement_timestamp(),attempt_count=attempt_count+1
    where purge_job_id=p_job_id and state='queued' and due_at<=statement_timestamp() returning * into j;
  if not found then raise exception using errcode='55000',message='media_lifecycle_unavailable'; end if;
  select * into u from media_private.media_uploads where upload_id=j.upload_id;
  if j.include_private then private_keys:=jsonb_build_array(u.original_object_key,u.private_derivative_object_key); end if;
  if j.include_public and u.public_derivative_object_key is not null then public_keys:=jsonb_build_array(u.public_derivative_object_key); end if;
  return jsonb_build_object('uploadId',u.upload_id,'privateKeys',private_keys,'publicKeys',public_keys);
end $$;

create or replace function media_private.list_purge_jobs(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(purge_job_id order by due_at),'[]'::jsonb) from (
    select purge_job_id,due_at from media_private.media_purge_jobs
    where state='queued' and due_at<=statement_timestamp()
    order by due_at limit least(greatest(p_limit,1),25)
  ) due;
$$;

create or replace function media_private.complete_purge_job(p_job_id uuid,p_upload_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare j media_private.media_purge_jobs%rowtype; u media_private.media_uploads%rowtype;
begin
  select * into j from media_private.media_purge_jobs where purge_job_id=p_job_id and upload_id=p_upload_id for update;
  if not found or j.state<>'claimed' then raise exception using errcode='55000',message='media_lifecycle_unavailable'; end if;
  update media_private.media_purge_jobs set state='completed',completed_at=statement_timestamp() where purge_job_id=j.purge_job_id;
  update media_private.media_uploads set private_deleted_at=case when j.include_private then statement_timestamp() else private_deleted_at end,
    public_deleted_at=case when j.include_public then statement_timestamp() else public_deleted_at end,
    state=case when j.reason_code='private_after_publish' then state else 'purged' end,updated_at=statement_timestamp(),version=version+1
    where upload_id=p_upload_id returning * into u;
  perform media_private.append_audit('media_purged',null,u.store_id,u.upload_id,'purged');
  return jsonb_build_object('state',u.state);
end $$;

create or replace function media_private.accept_provider_config(
  p_gate_receipt_id uuid,p_provider_key text,p_contract_version text,p_processing_region text,p_provider_retention_days integer,
  p_hard_storage_bytes bigint,p_daily_operation_limit integer,p_concurrent_limit integer,p_replacement_path text,p_config_digest bytea
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c media_private.media_provider_config%rowtype;
begin
  if not exists(select 1 from release_private.release_gate_receipts g where g.gate_receipt_id=p_gate_receipt_id and g.gate_kind='provider_m' and g.external_verified)
    or p_provider_key!~'^[a-z][a-z0-9_-]{1,63}$' or p_contract_version!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or char_length(p_processing_region) not between 2 and 80 or p_provider_retention_days not between 0 and 30
    or p_hard_storage_bytes not between 1 and 10737418240 or p_daily_operation_limit not between 1 and 100000 or p_concurrent_limit not between 1 and 100
    or p_replacement_path<>btrim(p_replacement_path) or char_length(p_replacement_path) not between 3 and 240 or octet_length(p_config_digest)<>32 then
    raise exception using errcode='42501',message='media_provider_gate_unavailable';
  end if;
  select * into c from media_private.media_provider_config where id=1 for update;
  if c.state='accepted' and (c.gate_receipt_id<>p_gate_receipt_id or c.config_digest<>p_config_digest) then raise exception using errcode='55000',message='media_provider_gate_unavailable'; end if;
  update media_private.media_provider_config set state='accepted',gate_receipt_id=p_gate_receipt_id,provider_key=p_provider_key,contract_version=p_contract_version,
    processing_region=p_processing_region,provider_retention_days=p_provider_retention_days,hard_storage_bytes=p_hard_storage_bytes,
    provider_daily_operation_limit=p_daily_operation_limit,provider_concurrent_limit=p_concurrent_limit,replacement_path=p_replacement_path,
    config_digest=p_config_digest,accepted_at=coalesce(accepted_at,statement_timestamp()),paused_at=null,pause_reason=null,version=version+1 where id=1 returning * into c;
  perform media_private.append_audit('media_provider_accepted',null,null,null,'allowed');
  return jsonb_build_object('state',c.state,'version',c.version);
end $$;

create or replace function media_private.pause_media_capability(p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c media_private.media_provider_config%rowtype;
begin
  if p_reason not in ('provider_unavailable','scan_unknown','quota_75','quota_90','cost_cap','security_stop','restore_fence') then raise exception using errcode='22023',message='media_provider_gate_unavailable'; end if;
  update media_private.media_provider_config set state='paused',paused_at=statement_timestamp(),pause_reason=p_reason,version=version+1 where id=1 and state='accepted' returning * into c;
  if not found then raise exception using errcode='55000',message='media_provider_gate_unavailable'; end if;
  perform media_private.append_audit('media_provider_paused',null,null,null,'blocked');
  return jsonb_build_object('state',c.state,'version',c.version);
end $$;

-- Exposed worker/deployment commands stay in app_public because media_private
-- is intentionally absent from the PostgREST exposed-schema allowlist.
create or replace function app_public.media_record_staged_upload(p_upload_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.record_staged_upload(p_upload_id); $$;
create or replace function app_public.media_record_quarantined_upload(p_upload_id uuid,p_outcome text,p_provider_operation_id text) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.record_quarantined_upload(p_upload_id,p_outcome,p_provider_operation_id); $$;
create or replace function app_public.media_record_processing_result(p_upload_id uuid,p_scan_outcome text,p_scan_operation_id text,p_processor_operation_id text,p_derivative_digest bytea,p_derivative_bytes bigint,p_width integer,p_height integer,p_metadata_stripped boolean,p_reencoded boolean) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.record_processing_result(p_upload_id,p_scan_outcome,p_scan_operation_id,p_processor_operation_id,p_derivative_digest,p_derivative_bytes,p_width,p_height,p_metadata_stripped,p_reencoded); $$;
create or replace function app_public.media_claim_publish_job(p_job_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.claim_publish_job(p_job_id); $$;
create or replace function app_public.media_list_publish_jobs(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$ select media_private.list_publish_jobs(p_limit); $$;
create or replace function app_public.media_complete_publish_job(p_job_id uuid,p_upload_id uuid,p_public_key text) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.complete_publish_job(p_job_id,p_upload_id,p_public_key); $$;
create or replace function app_public.media_claim_purge_job(p_job_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.claim_purge_job(p_job_id); $$;
create or replace function app_public.media_list_purge_jobs(p_limit integer default 10) returns jsonb
language sql stable security definer set search_path='' as $$ select media_private.list_purge_jobs(p_limit); $$;
create or replace function app_public.media_complete_purge_job(p_job_id uuid,p_upload_id uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.complete_purge_job(p_job_id,p_upload_id); $$;
create or replace function app_public.media_accept_provider_config(p_gate_receipt_id uuid,p_provider_key text,p_contract_version text,p_processing_region text,p_provider_retention_days integer,p_hard_storage_bytes bigint,p_daily_operation_limit integer,p_concurrent_limit integer,p_replacement_path text,p_config_digest bytea) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.accept_provider_config(p_gate_receipt_id,p_provider_key,p_contract_version,p_processing_region,p_provider_retention_days,p_hard_storage_bytes,p_daily_operation_limit,p_concurrent_limit,p_replacement_path,p_config_digest); $$;
create or replace function app_public.media_pause_capability(p_reason text) returns jsonb
language sql volatile security definer set search_path='' as $$ select media_private.pause_media_capability(p_reason); $$;

do $$ declare t text; begin
  foreach t in array array['media_provider_config','media_uploads','media_provider_operations','media_purge_jobs','media_audit_events'] loop
    execute format('alter table media_private.%I enable row level security',t);
    execute format('alter table media_private.%I force row level security',t);
    execute format('revoke all on media_private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update,delete on media_private.%I to media_automation',t);
    execute format('create policy media_automation_%I on media_private.%I for all to media_automation using(true) with check(true)',t,t);
  end loop;
end $$;

grant select on app_private.environment_stage to media_automation;
grant select on partner_private.store_partner_grants to media_automation;
grant select on release_private.release_gate_receipts to media_automation;
grant select on app_public.stores to media_automation;
grant select,insert,update,delete on app_public.store_media to media_automation;
grant execute on function app_private.current_session_is_active(),app_private.current_session_has_mfa(),
  app_private.current_session_recent_auth(interval),app_private.current_user_has_role(app_private.app_role,uuid) to media_automation;
create policy media_authority_stage on app_private.environment_stage for select to media_automation using(true);
create policy media_authority_partner_grants on partner_private.store_partner_grants for select to media_automation using(true);
create policy media_authority_release_receipts on release_private.release_gate_receipts for select to media_automation using(true);
create policy media_authority_stores on app_public.stores for select to media_automation using(true);
create policy media_authority_catalog_media on app_public.store_media for all to media_automation using(true) with check(true);

grant select on storage.buckets to media_worker,media_lifecycle_service;
grant select,insert,update,delete on storage.objects to media_worker,media_lifecycle_service;
create policy media_worker_storage_select on storage.objects for select to media_worker using(bucket_id in ('official-media-private','official-media-public'));
create policy media_worker_storage_insert on storage.objects for insert to media_worker with check(bucket_id in ('official-media-private','official-media-public'));
create policy media_worker_storage_update on storage.objects for update to media_worker using(bucket_id in ('official-media-private','official-media-public')) with check(bucket_id in ('official-media-private','official-media-public'));
create policy media_worker_storage_delete on storage.objects for delete to media_worker using(bucket_id in ('official-media-private','official-media-public'));
create policy media_lifecycle_storage_select on storage.objects for select to media_lifecycle_service using(bucket_id in ('official-media-private','official-media-public'));
create policy media_lifecycle_storage_delete on storage.objects for delete to media_lifecycle_service using(bucket_id in ('official-media-private','official-media-public'));

alter function media_private.reject_append_only_mutation() owner to media_automation;
alter function media_private.append_audit(text,uuid,uuid,uuid,text) owner to media_automation;
alter function media_private.capability_enabled() owner to media_automation;
alter function app_public.media_get_capability() owner to media_automation;
alter function app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer) owner to media_automation;
alter function app_public.media_get_upload(uuid) owner to media_automation;
alter function media_private.record_staged_upload(uuid) owner to media_automation;
alter function media_private.record_quarantined_upload(uuid,text,text) owner to media_automation;
alter function media_private.record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean) owner to media_automation;
alter function app_public.media_approve_upload(uuid,integer,bigint,text) owner to media_automation;
alter function media_private.claim_publish_job(uuid) owner to media_automation;
alter function media_private.list_publish_jobs(integer) owner to media_automation;
alter function media_private.complete_publish_job(uuid,uuid,text) owner to media_automation;
alter function app_public.media_withdraw_upload(uuid,text) owner to media_automation;
alter function media_private.claim_purge_job(uuid) owner to media_automation;
alter function media_private.list_purge_jobs(integer) owner to media_automation;
alter function media_private.complete_purge_job(uuid,uuid) owner to media_automation;
alter function media_private.accept_provider_config(uuid,text,text,text,integer,bigint,integer,integer,text,bytea) owner to media_automation;
alter function media_private.pause_media_capability(text) owner to media_automation;
alter function app_public.media_record_staged_upload(uuid) owner to media_automation;
alter function app_public.media_record_quarantined_upload(uuid,text,text) owner to media_automation;
alter function app_public.media_record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean) owner to media_automation;
alter function app_public.media_claim_publish_job(uuid) owner to media_automation;
alter function app_public.media_list_publish_jobs(integer) owner to media_automation;
alter function app_public.media_complete_publish_job(uuid,uuid,text) owner to media_automation;
alter function app_public.media_claim_purge_job(uuid) owner to media_automation;
alter function app_public.media_list_purge_jobs(integer) owner to media_automation;
alter function app_public.media_complete_purge_job(uuid,uuid) owner to media_automation;
alter function app_public.media_accept_provider_config(uuid,text,text,text,integer,bigint,integer,integer,text,bytea) owner to media_automation;
alter function app_public.media_pause_capability(text) owner to media_automation;

revoke all on all functions in schema media_private from public,anon,authenticated,service_role;
revoke all on function app_public.media_get_capability(),app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer),
  app_public.media_get_upload(uuid),app_public.media_approve_upload(uuid,integer,bigint,text),app_public.media_withdraw_upload(uuid,text),
  app_public.media_record_staged_upload(uuid),app_public.media_record_quarantined_upload(uuid,text,text),
  app_public.media_record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean),app_public.media_claim_publish_job(uuid),
  app_public.media_list_publish_jobs(integer),app_public.media_complete_publish_job(uuid,uuid,text),app_public.media_claim_purge_job(uuid),
  app_public.media_list_purge_jobs(integer),app_public.media_complete_purge_job(uuid,uuid),
  app_public.media_accept_provider_config(uuid,text,text,text,integer,bigint,integer,integer,text,bytea),app_public.media_pause_capability(text)
  from public,anon,authenticated,service_role;
grant execute on function app_public.media_get_capability() to anon,authenticated;
grant execute on function app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer),app_public.media_get_upload(uuid),
  app_public.media_approve_upload(uuid,integer,bigint,text),app_public.media_withdraw_upload(uuid,text) to authenticated;
grant execute on function app_public.media_record_staged_upload(uuid),app_public.media_record_quarantined_upload(uuid,text,text),
  app_public.media_record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean),app_public.media_claim_publish_job(uuid),
  app_public.media_list_publish_jobs(integer),app_public.media_complete_publish_job(uuid,uuid,text),app_public.media_pause_capability(text) to media_worker;
grant execute on function app_public.media_claim_purge_job(uuid),app_public.media_list_purge_jobs(integer),app_public.media_complete_purge_job(uuid,uuid) to media_lifecycle_service;
grant execute on function app_public.media_accept_provider_config(uuid,text,text,text,integer,bigint,integer,integer,text,bytea) to media_deployment_service;

revoke create on schema app_public from media_automation;
revoke create on schema media_private from media_automation;
revoke media_automation from postgres;
