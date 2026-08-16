-- Portable account exports and provider-authoritative privacy reauthentication.
-- Browser metadata is informational only. Authorization derives from the signed
-- provider JWT AMR plus the provider-owned verified-factor table.

grant identity_service to postgres;
grant create on schema app_private, app_public to identity_service;

create or replace function app_private.provider_user_has_verified_mfa(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from auth.mfa_factors f
    where f.user_id=p_user_id and f.status='verified'
  );
$$;
alter function app_private.provider_user_has_verified_mfa(uuid) owner to postgres;
revoke all on function app_private.provider_user_has_verified_mfa(uuid) from public,anon,authenticated;
grant execute on function app_private.provider_user_has_verified_mfa(uuid) to identity_service;

create or replace function app_private.current_session_has_privacy_reauth()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  claims jsonb;
  password_epoch numeric;
  mfa_epoch numeric;
  enrolled boolean;
begin
  if not app_private.current_session_is_active() then return false; end if;
  begin
    claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    select max((entry->>'timestamp')::numeric) into password_epoch
      from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) entry
      where entry->>'method'='password' and entry->>'timestamp'~'^[0-9]{1,12}$';
    if password_epoch is null
      or to_timestamp(password_epoch)<statement_timestamp()-interval '10 minutes'
      or to_timestamp(password_epoch)>statement_timestamp()+interval '1 minute' then return false; end if;
    enrolled:=app_private.provider_user_has_verified_mfa(app_public.request_user_id());
    if not enrolled then return true; end if;
    select max((entry->>'timestamp')::numeric) into mfa_epoch
      from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) entry
      where entry->>'method' in ('totp','recovery_code') and entry->>'timestamp'~'^[0-9]{1,12}$';
    return claims->>'aal'='aal2' and mfa_epoch is not null
      and to_timestamp(mfa_epoch)>=statement_timestamp()-interval '10 minutes'
      and to_timestamp(mfa_epoch)<=statement_timestamp()+interval '1 minute';
  exception when others then
    return false;
  end;
end $$;
alter function app_private.current_session_has_privacy_reauth() owner to identity_service;
revoke all on function app_private.current_session_has_privacy_reauth() from public,anon,authenticated;

create or replace function app_public.request_account_export()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); job app_private.account_export_jobs%rowtype;
begin
  if actor is null or not app_private.current_session_has_privacy_reauth() then
    raise exception using errcode='42501',message='privacy_reauthentication_required';
  end if;
  perform 1 from app_private.profiles where user_id=actor for update;
  update app_private.account_export_jobs set state='expired',claim_token=null,claimed_at=null,lease_expires_at=null
    where user_id=actor and state='ready' and expires_at<=statement_timestamp();
  select * into job from app_private.account_export_jobs
    where user_id=actor and state in ('queued','building','ready') order by requested_at desc limit 1 for update;
  if not found then insert into app_private.account_export_jobs(user_id) values(actor) returning * into job; end if;
  return jsonb_build_object('id',job.export_job_id,'state',job.state,'createdAt',job.requested_at,
    'expiresAt',job.expires_at,'generatedAt',job.completed_at,'fileSizeBytes',job.archive_bytes,
    'checksumSha256',case when job.archive_checksum is null then null else encode(job.archive_checksum,'hex') end);
end $$;

create or replace function app_public.get_account_export_status(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype;
begin
  if not app_private.current_session_is_active() then raise exception using errcode='42501',message='account_lifecycle_denied'; end if;
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and user_id=app_public.request_user_id();
  if not found then raise exception using errcode='P0002',message='account_export_unavailable'; end if;
  return jsonb_build_object('id',job.export_job_id,'state',job.state,'createdAt',job.requested_at,
    'expiresAt',job.expires_at,'generatedAt',job.completed_at,'fileSizeBytes',job.archive_bytes,
    'checksumSha256',case when job.archive_checksum is null then null else encode(job.archive_checksum,'hex') end);
end $$;

create or replace function app_public.issue_account_export_download(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); job app_private.account_export_jobs%rowtype; handoff app_private.account_export_download_handoffs%rowtype;
begin
  if actor is null or not app_private.current_session_has_privacy_reauth() then
    raise exception using errcode='42501',message='privacy_reauthentication_required';
  end if;
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and user_id=actor for update;
  if not found or job.state<>'ready' or job.expires_at<=statement_timestamp() or job.archive_deleted_at is not null then
    raise exception using errcode='P0002',message='account_export_unavailable';
  end if;
  update app_private.account_export_download_handoffs set consumed_at=statement_timestamp()
    where export_job_id=p_job_id and user_id=actor and consumed_at is null;
  insert into app_private.account_export_download_handoffs(export_job_id,user_id) values(p_job_id,actor) returning * into handoff;
  return jsonb_build_object('handoffId',handoff.handoff_id,'expiresAt',handoff.expires_at);
end $$;

create or replace function app_public.request_account_deletion()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); deletion app_private.account_deletion_requests%rowtype;
begin
  if actor is null or not app_private.current_session_has_privacy_reauth() then
    raise exception using errcode='42501',message='privacy_reauthentication_required';
  end if;
  perform 1 from app_private.profiles where user_id=actor and status='active' for update;
  if not found then raise exception using errcode='55000',message='account_lifecycle_unavailable'; end if;
  select * into deletion from app_private.account_deletion_requests where user_id=actor and state='scheduled' for update;
  if not found then insert into app_private.account_deletion_requests(user_id,due_at)
    values(actor,statement_timestamp()+interval '7 days') returning * into deletion; end if;
  update app_private.role_grants set state='revoked',revoked_by=actor,revoked_at=statement_timestamp(),
    revocation_reason='account_deletion_requested',version=version+1 where subject_user_id=actor and state='active';
  update app_private.active_sessions set state='cancellation_only',revoked_at=statement_timestamp(),
    revocation_reason='account_deletion_requested',version=version+1 where user_id=actor and state='active';
  update app_private.profiles set status='deletion_scheduled',deletion_due_at=deletion.due_at,
    version=version+1,updated_at=statement_timestamp() where user_id=actor;
  return jsonb_build_object('state','deletion_scheduled','deletionDueAt',deletion.due_at);
end $$;

create or replace function app_public.cancel_account_deletion()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); session_id uuid:=app_private.claim_session_id(); deletion app_private.account_deletion_requests%rowtype;
begin
  if actor is null or not app_private.current_session_is_cancellation_only() then
    raise exception using errcode='42501',message='account_lifecycle_denied';
  end if;
  select * into deletion from app_private.account_deletion_requests where user_id=actor and state='scheduled' for update;
  if not found or deletion.due_at<=statement_timestamp() then raise exception using errcode='55000',message='account_deletion_complete'; end if;
  update app_private.account_deletion_requests set state='cancelled',cancelled_at=statement_timestamp(),version=version+1
    where deletion_request_id=deletion.deletion_request_id;
  update app_private.profiles set status='active',deletion_due_at=null,version=version+1,updated_at=statement_timestamp() where user_id=actor;
  insert into app_private.role_grants(subject_user_id,role,granted_by) select actor,'shopper',actor
    where not exists(select 1 from app_private.role_grants where subject_user_id=actor and role='shopper' and state='active');
  update app_private.active_sessions set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),
    revocation_reason='deletion_cancelled_other_session',version=version+1
    where user_id=actor and state='cancellation_only' and active_sessions.session_id<>session_id;
  update app_private.active_sessions set state='active',revoked_at=null,revocation_reason=null,version=version+1
    where user_id=actor and active_sessions.session_id=session_id and state='cancellation_only';
  return jsonb_build_object('state','active');
end $$;

alter function app_public.build_account_export(uuid,uuid) rename to build_account_export_canonical_json;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid) from public,anon,authenticated;

create or replace function app_public.build_account_export(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; canonical jsonb; media jsonb; media_count bigint;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  canonical:=app_public.build_account_export_canonical_json(p_job_id,p_claim_token)::jsonb;
  select count(*) into media_count
  from candidate_private.candidate_share_storage_objects o
  join candidate_private.candidate_shares s on s.share_id=o.share_id
  where s.sender_id=job.user_id and s.state in ('pending','accepted');
  if media_count>100 then raise exception using errcode='54000',message='account_export_media_count_exceeded'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucketId','candidate-private','objectKey',o.object_key,
    'path','media/'||s.share_id::text||'/'||encode(extensions.digest(o.object_key,'sha256'),'hex')||'.bin')
    order by o.object_key),'[]'::jsonb) into media
  from candidate_private.candidate_share_storage_objects o
  join candidate_private.candidate_shares s on s.share_id=o.share_id
  where s.sender_id=job.user_id and s.state in ('pending','accepted');
  return jsonb_build_object('canonical',canonical,'media',media)::text;
end $$;
alter function app_public.build_account_export(uuid,uuid) owner to identity_service;
revoke all on function app_public.build_account_export(uuid,uuid) from public,anon,authenticated;
grant execute on function app_public.build_account_export(uuid,uuid) to account_lifecycle_service;

create or replace function app_public.claim_account_exports(p_now timestamptz,p_limit integer default 10)
returns table(job_id uuid,claim_token uuid,object_key text) language plpgsql volatile security definer set search_path='' as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_account_exports',0)) then return; end if;
  return query with candidates as (
    select j.export_job_id from app_private.account_export_jobs j where j.attempt_count<5 and (
      (j.state='queued' and (j.retry_at is null or j.retry_at<=statement_timestamp()))
      or (j.state='building' and j.lease_expires_at<=statement_timestamp()))
    order by j.requested_at for update skip locked limit greatest(0,least(p_limit,25))
  ), claimed as (
    update app_private.account_export_jobs j set state='building',claim_token=extensions.gen_random_uuid(),
      claimed_at=statement_timestamp(),lease_expires_at=statement_timestamp()+interval '5 minutes',attempt_count=j.attempt_count+1,retry_at=null
    from candidates c where j.export_job_id=c.export_job_id returning j.export_job_id,j.claim_token,j.user_id
  ) select export_job_id,claimed.claim_token,'account-exports/'||claimed.user_id::text||'/'||export_job_id::text||'.zip' from claimed;
end $$;

create or replace function app_public.complete_account_export(p_job_id uuid,p_claim_token uuid,p_object_key text,p_checksum bytea,p_bytes bigint,p_completed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; completed timestamptz:=statement_timestamp();
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id for update;
  if job.state='ready' and job.archive_object_key=p_object_key and job.archive_checksum=p_checksum and job.archive_bytes=p_bytes then return jsonb_build_object('id',job.export_job_id,'state',job.state); end if;
  if job.state<>'building' or job.claim_token<>p_claim_token or job.lease_expires_at<=completed
    or p_object_key!~('^account-exports/'||job.user_id::text||'/'||job.export_job_id::text||'\.zip$')
    or octet_length(p_checksum)<>32 or p_bytes<22 then raise exception using errcode='42501',message='account_export_completion_invalid'; end if;
  update app_private.account_export_jobs set state='ready',completed_at=completed,expires_at=completed+interval '7 days',archive_object_key=p_object_key,
    archive_checksum=p_checksum,archive_bytes=p_bytes,claim_token=null,claimed_at=null,lease_expires_at=null,failure_code=null,version=version+1
    where export_job_id=p_job_id returning * into job;
  return jsonb_build_object('id',job.export_job_id,'state',job.state);
end $$;

revoke create on schema app_private, app_public from identity_service;
revoke identity_service from postgres;
