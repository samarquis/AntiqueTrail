-- Executable day-8 account deletion and restore replay. External Storage/Auth
-- effects remain in the Edge worker; database commands are exact-claim and retry safe.

grant identity_service to postgres;

alter table app_private.account_deletion_requests
  drop constraint account_deletion_requests_user_id_fkey,
  alter column user_id drop not null,
  add constraint account_deletion_requests_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null,
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz,
  add column retry_at timestamptz,
  add column attempt_count integer not null default 0 check(attempt_count>=0),
  add column last_error_code text,
  add column prepared_at timestamptz,
  add column storage_objects jsonb,
  add column provider_user_id uuid,
  add column subject_tombstone uuid;
alter table app_private.account_deletion_requests
  add constraint account_deletion_storage_manifest_array check(storage_objects is null or jsonb_typeof(storage_objects)='array'),
  add constraint account_deletion_claim_shape check((claim_token is null and claimed_at is null and lease_expires_at is null) or (claim_token is not null and claimed_at is not null and lease_expires_at is not null));

create unique index one_deletion_receipt_per_request on app_private.deletion_receipts(deletion_request_id) where deletion_request_id is not null;
alter table app_private.deletion_receipts add column expires_at timestamptz not null default (statement_timestamp()+interval '31 days');

create table app_private.account_lifecycle_operations_cases(
  case_id uuid primary key default extensions.gen_random_uuid(),
  resource_kind text not null check(resource_kind in ('account_export','account_deletion','private_memory')),
  resource_id uuid not null,
  error_code text not null check(error_code~'^[a-z][a-z0-9_]{1,63}$'),
  state text not null default 'open' check(state in ('open','resolved')),
  opened_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  unique(resource_kind,resource_id,state),
  constraint account_lifecycle_case_resolution_shape check((state='open' and resolved_at is null) or (state='resolved' and resolved_at is not null))
);
alter table app_private.account_lifecycle_operations_cases enable row level security;
alter table app_private.account_lifecycle_operations_cases force row level security;
revoke all on app_private.account_lifecycle_operations_cases from public,anon,authenticated;
grant select,insert,update on app_private.account_lifecycle_operations_cases to identity_service;
create policy identity_account_lifecycle_cases on app_private.account_lifecycle_operations_cases
  for all to identity_service using(true) with check(true);

-- Provider deletion must be able to remove auth.users without destroying immutable
-- content-free evidence. These actor/subject links de-identify on provider deletion.
-- Append-only evidence cannot accept an ON DELETE SET NULL update. Its UUID is
-- retained only as content-free historical evidence after the Auth subject is gone.
alter table app_private.privileged_audit_events drop constraint privileged_audit_events_actor_user_id_fkey,
  drop constraint privileged_audit_events_subject_user_id_fkey;
alter table app_private.role_grants drop constraint role_grants_subject_user_id_fkey,
  alter column subject_user_id drop not null,
  add constraint role_grants_subject_user_id_fkey foreign key(subject_user_id) references auth.users(id) on delete set null;
alter table shopper_private.correction_case_events drop constraint correction_case_events_actor_user_id_fkey;
alter table candidate_private.candidate_share_actions drop constraint candidate_share_actions_actor_user_id_fkey;
alter table candidate_private.candidate_lifecycle_receipts drop constraint candidate_lifecycle_receipts_actor_user_id_fkey;
alter table shopper_private.store_correction_reports drop constraint store_correction_reports_reporter_user_id_fkey,
  alter column reporter_user_id drop not null,
  add constraint store_correction_reports_reporter_user_id_fkey foreign key(reporter_user_id) references auth.users(id) on delete set null;

alter table partner_private.partner_invitations drop constraint partner_invitations_created_by_fkey,
  alter column created_by drop not null,
  add constraint partner_invitations_created_by_fkey foreign key(created_by) references auth.users(id) on delete set null;
alter table partner_private.pending_partner_identities drop constraint pending_partner_identities_auth_user_id_fkey;
alter table partner_private.pilot_consent_receipts drop constraint pilot_consent_receipts_auth_user_id_fkey;
alter table partner_private.listing_claims drop constraint listing_claims_claimant_id_fkey,
  alter column claimant_id drop not null,
  add constraint listing_claims_claimant_id_fkey foreign key(claimant_id) references auth.users(id) on delete set null;
alter table partner_private.store_partner_grants drop constraint store_partner_grants_auth_user_id_fkey,
  alter column auth_user_id drop not null,
  add constraint store_partner_grants_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete set null;
alter table partner_private.partner_access_revocations drop constraint partner_access_revocations_auth_user_id_fkey;
alter table partner_private.claim_events drop constraint claim_events_actor_user_id_fkey;
alter table partner_private.claim_command_receipts drop constraint claim_command_receipts_actor_user_id_fkey;

alter table admin_private.admin_case_events drop constraint admin_case_events_actor_user_id_fkey;
alter table admin_private.admin_scope_actions drop constraint admin_scope_actions_subject_user_id_fkey,
  drop constraint admin_scope_actions_decided_by_fkey;
alter table admin_private.admin_field_change_requests drop constraint admin_field_change_requests_requested_by_fkey,
  drop constraint admin_field_change_requests_reviewed_by_fkey;
alter table admin_private.admin_duplicate_merge_proposals drop constraint admin_duplicate_merge_proposals_requested_by_fkey,
  drop constraint admin_duplicate_merge_proposals_reviewed_by_fkey;
alter table readiness_private.readiness_signing_challenges drop constraint readiness_signing_challenges_signer_user_id_fkey;
alter table readiness_private.readiness_receipts drop constraint readiness_receipts_signer_user_id_fkey;
alter table rg01_private.rg01_product_owner_grants drop constraint rg01_product_owner_grants_user_id_fkey;
alter table rg01_private.rg01_signing_challenges drop constraint rg01_signing_challenges_signer_user_id_fkey;
alter table rg01_private.rg01_receipts drop constraint rg01_receipts_signer_user_id_fkey;

-- A retained share/action is only content-free status after either party deletes.
alter table candidate_private.candidate_shares drop constraint candidate_shares_candidate_id_fkey,
  drop constraint candidate_shares_sender_id_fkey,
  alter column candidate_id drop not null,
  alter column sender_id drop not null,
  add constraint candidate_shares_candidate_id_fkey foreign key(candidate_id) references candidate_private.candidate_links(candidate_id) on delete set null,
  add constraint candidate_shares_sender_id_fkey foreign key(sender_id) references auth.users(id) on delete set null;

create or replace function app_private.purge_account_application_data(p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare removed jsonb:='[]'::jsonb;
begin
  if p_user_id is null then raise exception using errcode='22023',message='account_deletion_subject_required'; end if;

  delete from shopper_private.saved_stores where user_id=p_user_id;
  delete from shopper_private.private_store_memories where user_id=p_user_id;
  delete from shopper_private.private_memory_deletions where user_id=p_user_id;
  delete from shopper_private.catalog_last_seen where user_id=p_user_id;
  delete from shopper_private.catalog_new_dismissals where user_id=p_user_id;
  update shopper_private.store_correction_reports set reporter_user_id=null,description='[deleted]',public_source_url=null,
    assigned_admin_id=null,state='closed',version=version+1,updated_at=statement_timestamp() where reporter_user_id=p_user_id;
  removed:=removed||'"shopper"'::jsonb;

  delete from candidate_private.candidate_share_payloads p using candidate_private.candidate_shares s
    where p.share_id=s.share_id and (s.sender_id=p_user_id or s.recipient_id=p_user_id);
  update candidate_private.candidate_shares set
    candidate_id=case when sender_id=p_user_id then null else candidate_id end,
    sender_id=case when sender_id=p_user_id then null else sender_id end,
    recipient_id=case when recipient_id=p_user_id then null else recipient_id end,
    recipient_email_hmac=extensions.gen_random_bytes(32),version=version+1,updated_at=statement_timestamp()
    where sender_id=p_user_id or recipient_id=p_user_id;
  delete from candidate_private.candidate_blocks where blocker_id=p_user_id or blocked_user_id=p_user_id;
  delete from candidate_private.trip_ideas where owner_user_id=p_user_id;
  delete from candidate_private.candidate_share_delivery_jobs where sender_user_id=p_user_id;
  delete from candidate_private.candidate_rate_events where actor_user_id=p_user_id;
  delete from candidate_private.candidate_concurrency_leases where actor_user_id=p_user_id;
  delete from candidate_private.candidate_links where owner_user_id=p_user_id;
  removed:=removed||'"candidate"'::jsonb;

  delete from trip_private.trips where owner_id=p_user_id;
  update trip_private.trips set navigator_user_id=null,navigator_device_hash=null,version=version+1,updated_at=statement_timestamp()
    where navigator_user_id=p_user_id;
  delete from trip_private.trip_visit_memories where author_user_id=p_user_id;
  delete from trip_private.trip_offline_grants where user_id=p_user_id;
  delete from trip_private.trip_device_bindings where user_id=p_user_id;
  delete from trip_private.trip_participants where user_id=p_user_id;
  delete from trip_private.trip_device_proof_nonces where user_id=p_user_id;
  removed:=removed||'"trips"'::jsonb;

  update partner_private.store_partner_grants set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),
    revoked_by=null,version=version+1 where auth_user_id=p_user_id and state='active';
  update partner_private.store_partnerships set state='revoked',ended_at=coalesce(ended_at,statement_timestamp()),
    auth_user_id=null,version=version+1,updated_at=statement_timestamp() where auth_user_id=p_user_id;
  update partner_private.listing_claims set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),
    claimant_id=null,assigned_admin_id=null,version=version+1,updated_at=statement_timestamp() where claimant_id=p_user_id;
  update partner_private.store_partner_grants set auth_user_id=null where auth_user_id=p_user_id;
  update partner_private.partner_invitations set created_by=null where created_by=p_user_id;
  removed:=removed||'"partner_revoked"'::jsonb;

  update app_private.role_grants set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),revoked_by=null,
    revocation_reason=coalesce(revocation_reason,'account_deleted'),version=version+1 where subject_user_id=p_user_id and state in ('active','pending');
  update app_private.role_grants set granted_by=null where granted_by=p_user_id;
  update app_private.role_grants set revoked_by=null where revoked_by=p_user_id;
  update app_private.role_grants set subject_user_id=null where subject_user_id=p_user_id;
  update app_private.environment_stage set changed_by=null where changed_by=p_user_id;
  update app_private.account_registration_config set updated_by=null where updated_by=p_user_id;
  update app_private.admin_bootstrap_state set subject_user_id=null,subject_binding_state='cleared' where subject_user_id=p_user_id;
  delete from app_private.feature_restrictions where subject_user_id=p_user_id;
  delete from app_private.provider_revocation_outbox where user_id=p_user_id;
  delete from app_private.notification_deliveries where user_id=p_user_id;
  delete from app_private.account_export_download_handoffs where user_id=p_user_id;
  delete from app_private.account_export_jobs where user_id=p_user_id;
  delete from app_private.active_sessions where user_id=p_user_id;
  delete from trip_private.check_my_day_command_evidence where actor_user_id=p_user_id;
  delete from trip_private.check_my_day_requests where actor_user_id=p_user_id;
  delete from trip_private.trip_conflict_resolution_receipts where actor_user_id=p_user_id;
  update rg01_private.rg01_product_owner_grants set state='revoked',revoked_at=coalesce(revoked_at,statement_timestamp()),version=version+1
    where user_id=p_user_id and state='active';
  update rg01_private.rg01_subject_consents set user_id=null,withdrawn_at=coalesce(withdrawn_at,statement_timestamp()) where user_id=p_user_id;
  update app_private.account_admission_receipts set provider_user_id=null where provider_user_id=p_user_id;
  delete from app_private.profiles where user_id=p_user_id;
  return removed;
end $$;

create or replace function app_public.claim_due_account_deletions(p_now timestamptz,p_limit integer default 10)
returns table(deletion_request_id uuid,claim_token uuid,user_id uuid,storage_objects jsonb)
language plpgsql volatile security definer set search_path='' as $$
declare locked boolean;
begin
  locked:=pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_account_deletion',0));
  if not locked then return; end if;
  return query
  with due as (
    select d.deletion_request_id from app_private.account_deletion_requests d
    where d.state='scheduled' and coalesce(d.provider_user_id,d.user_id) is not null and d.due_at<=statement_timestamp()
      and d.attempt_count<5 and (d.retry_at is null or d.retry_at<=statement_timestamp())
      and (d.claim_token is null or d.lease_expires_at<=statement_timestamp())
    order by d.due_at for update skip locked limit greatest(0,least(p_limit,25))
  ), claimed as (
    update app_private.account_deletion_requests d set claim_token=extensions.gen_random_uuid(),
      claimed_at=statement_timestamp(),lease_expires_at=statement_timestamp()+interval '5 minutes',
      attempt_count=d.attempt_count+1,retry_at=null,last_error_code=null,
      provider_user_id=coalesce(d.provider_user_id,d.user_id),
      storage_objects=coalesce(d.storage_objects,(
        select coalesce(jsonb_agg(x.item order by x.item->>'bucket_id',x.item->>'object_key'),'[]'::jsonb) from (
          select jsonb_build_object('bucket_id','account-exports','object_key',j.archive_object_key) item
            from app_private.account_export_jobs j where j.user_id=d.user_id and j.archive_object_key is not null
          union all
          select jsonb_build_object('bucket_id','candidate-private','object_key',o.object_key)
            from candidate_private.candidate_share_storage_objects o
            join candidate_private.candidate_shares s on s.share_id=o.share_id
            left join candidate_private.candidate_links c on c.candidate_id=s.candidate_id
            where s.sender_id=d.user_id or s.recipient_id=d.user_id or c.owner_user_id=d.user_id
        ) x
      ))
    from due where d.deletion_request_id=due.deletion_request_id
    returning d.deletion_request_id,d.claim_token,d.provider_user_id,d.storage_objects
  ) select * from claimed;
end $$;

create or replace function app_public.prepare_account_deletion(p_deletion_request_id uuid,p_claim_token uuid,p_prepared_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d app_private.account_deletion_requests%rowtype; scopes jsonb;
begin
  select * into d from app_private.account_deletion_requests where deletion_request_id=p_deletion_request_id for update;
  if d.state='completed' then return jsonb_build_object('state','completed'); end if;
  if d.state<>'scheduled' or d.claim_token is distinct from p_claim_token or d.lease_expires_at<=statement_timestamp()
    then raise exception using errcode='42501',message='account_deletion_claim_invalid'; end if;
  if d.prepared_at is null then
    scopes:=app_private.purge_account_application_data(d.user_id);
    update app_private.account_deletion_requests set prepared_at=statement_timestamp(),subject_tombstone=coalesce(subject_tombstone,extensions.gen_random_uuid())
      where deletion_request_id=d.deletion_request_id;
  end if;
  return jsonb_build_object('state','prepared');
end $$;

create or replace function app_public.complete_account_deletion(p_deletion_request_id uuid,p_claim_token uuid,p_completed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare d app_private.account_deletion_requests%rowtype; completed timestamptz:=statement_timestamp();
begin
  select * into d from app_private.account_deletion_requests where deletion_request_id=p_deletion_request_id for update;
  if d.state='completed' then return jsonb_build_object('state','completed'); end if;
  if d.state<>'scheduled' or d.prepared_at is null or d.claim_token is distinct from p_claim_token
    then raise exception using errcode='42501',message='account_deletion_claim_invalid'; end if;
  insert into app_private.deletion_receipts(user_id,deletion_request_id,outcome,completed_at,removed_scopes,receipt_checksum,expires_at)
    values(null,d.deletion_request_id,'completed',completed,'["shopper","candidate","trips","partner_revoked","provider"]'::jsonb,
      extensions.digest(convert_to(d.deletion_request_id::text||'|'||d.subject_tombstone::text||'|'||completed::text,'utf8'),'sha256'),completed+interval '31 days')
    on conflict(deletion_request_id) where deletion_request_id is not null do nothing;
  update app_private.account_deletion_requests set state='completed',completed_at=completed,user_id=null,
    provider_user_id=null,claim_token=null,claimed_at=null,lease_expires_at=null,retry_at=null,last_error_code=null,version=version+1
    where deletion_request_id=d.deletion_request_id;
  return jsonb_build_object('state','completed');
end $$;

create or replace function app_public.fail_account_deletion(p_deletion_request_id uuid,p_claim_token uuid,p_now timestamptz,p_error_code text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare attempts integer; code text;
begin
  select attempt_count into attempts from app_private.account_deletion_requests
    where deletion_request_id=p_deletion_request_id and state='scheduled' and claim_token=p_claim_token for update;
  if not found then return; end if;
  code:=case when p_error_code~'^[a-z][a-z0-9_]{1,63}$' then p_error_code else 'worker_failure' end;
  update app_private.account_deletion_requests set claim_token=null,claimed_at=null,lease_expires_at=null,
    retry_at=case when attempts>=5 then null else statement_timestamp()+make_interval(mins=>least(60,power(2,attempts)::integer)) end,
    last_error_code=code,version=version+1 where deletion_request_id=p_deletion_request_id;
  if attempts>=5 then
    insert into app_private.account_lifecycle_operations_cases(resource_kind,resource_id,error_code)
      values('account_deletion',p_deletion_request_id,code) on conflict(resource_kind,resource_id,state) do nothing;
  end if;
end $$;

create or replace function app_public.replay_account_deletion_receipts(p_now timestamptz,p_limit integer default 25)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare row record; replayed integer:=0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_account_deletion_replay',0)) then return 0; end if;
  for row in select d.deletion_request_id,d.user_id from app_private.account_deletion_requests d
    join app_private.deletion_receipts r using(deletion_request_id)
    where r.outcome='completed' and r.expires_at>statement_timestamp() and d.user_id is not null
    order by r.completed_at for update of d skip locked limit greatest(0,least(p_limit,100)) loop
    perform app_private.purge_account_application_data(row.user_id);
    update app_private.account_deletion_requests set user_id=null,subject_tombstone=coalesce(subject_tombstone,extensions.gen_random_uuid())
      where deletion_request_id=row.deletion_request_id;
    replayed:=replayed+1;
  end loop;
  return replayed;
end $$;

-- Closed received shares retain only status metadata in an owner export.
create or replace function app_public.build_account_export(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; result jsonb;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  select jsonb_build_object('schemaVersion',1,'generatedAt',job.requested_at,
    'profile',(select jsonb_build_object('displayName',p.public_display_name,'verifiedEmail',p.verified_email_snapshot,'status',p.status,
      'age18AttestedAt',p.age_18_attested_at,'lastAuthenticatedAt',p.last_authenticated_at) from app_private.profiles p where p.user_id=job.user_id),
    'shopper',jsonb_build_object(
      'savedStores',(select coalesce(jsonb_agg(jsonb_build_object('storeId',s.store_id,'slug',st.slug,'name',st.name,'savedAt',s.created_at) order by s.created_at),'[]') from shopper_private.saved_stores s join app_public.stores st on st.id=s.store_id where s.user_id=job.user_id),
      'memories',(select coalesce(jsonb_agg(jsonb_build_object('storeId',m.store_id,'rating',m.rating,'note',m.note,'lastVisitMonth',m.last_visit_month,'version',m.version) order by m.updated_at),'[]') from shopper_private.private_store_memories m where m.user_id=job.user_id),
      'catalogLastSeen',(select coalesce(jsonb_agg(jsonb_build_object('areaId',l.area_id,'slug',a.slug,'label',a.label,'seenAt',l.seen_at) order by l.seen_at),'[]') from shopper_private.catalog_last_seen l join app_public.catalog_areas a on a.id=l.area_id where l.user_id=job.user_id),
      'newDismissals',(select coalesce(jsonb_agg(jsonb_build_object('storeId',d.store_id,'slug',st.slug,'dismissedAt',d.dismissed_at) order by d.dismissed_at),'[]') from shopper_private.catalog_new_dismissals d join app_public.stores st on st.id=d.store_id where d.user_id=job.user_id),
      'corrections',(select coalesce(jsonb_agg(jsonb_build_object('id',r.report_id,'storeId',r.store_id,'type',r.correction_type,'description',r.description,'publicSourceUrl',r.public_source_url,'state',r.state,'createdAt',r.created_at,'updatedAt',r.updated_at) order by r.created_at),'[]') from shopper_private.store_correction_reports r where r.reporter_user_id=job.user_id)),
    'candidate',jsonb_build_object(
      'links',(select coalesce(jsonb_agg(jsonb_build_object('id',c.candidate_id,'url',c.normalized_url,'title',c.title,'note',c.note,'extractionState',c.extraction_state,'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at) order by c.created_at),'[]') from candidate_private.candidate_links c where c.owner_user_id=job.user_id),
      'shares',(select coalesce(jsonb_agg(jsonb_build_object('id',s.share_id,'direction',case when s.sender_id=job.user_id then 'sent' else 'received' end,
        'state',case when s.sender_id=job.user_id then s.sender_status else s.state end,
        'title',case when s.sender_id=job.user_id or s.state in ('pending','accepted') then c.title else null end,
        'expiresAt',s.expires_at,'createdAt',s.created_at) order by s.created_at),'[]')
        from candidate_private.candidate_shares s left join candidate_private.candidate_links c on c.candidate_id=s.candidate_id where job.user_id in (s.sender_id,s.recipient_id)),
      'tripIdeas',(select coalesce(jsonb_agg(jsonb_build_object('id',i.idea_id,'sourceShareId',i.source_share_id,'title',i.title,'urlNote',i.url_note,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at) order by i.created_at),'[]') from candidate_private.trip_ideas i where i.owner_user_id=job.user_id),
      'blockedSenders',(select coalesce(jsonb_agg(jsonb_build_object('label','Blocked sender','blockedAt',b.created_at) order by b.created_at),'[]') from candidate_private.candidate_blocks b where b.blocker_id=job.user_id))
  ) into result;
  return result::text;
end $$;

-- Harden the other lifecycle schedules to database-authoritative time and one
-- claim scheduler per job kind. Caller timestamps remain ABI-compatible only.
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
  ) select export_job_id,claimed.claim_token,'account-exports/'||claimed.user_id::text||'/'||export_job_id::text||'.json' from claimed;
end $$;

create or replace function app_public.complete_account_export(p_job_id uuid,p_claim_token uuid,p_object_key text,p_checksum bytea,p_bytes bigint,p_completed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; completed timestamptz:=statement_timestamp();
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id for update;
  if job.state='ready' and job.archive_object_key=p_object_key and job.archive_checksum=p_checksum and job.archive_bytes=p_bytes then return jsonb_build_object('id',job.export_job_id,'state',job.state); end if;
  if job.state<>'building' or job.claim_token<>p_claim_token or job.lease_expires_at<=completed
    or p_object_key!~('^account-exports/'||job.user_id::text||'/'||job.export_job_id::text||'\.json$')
    or octet_length(p_checksum)<>32 or p_bytes<2 then raise exception using errcode='42501',message='account_export_completion_invalid'; end if;
  update app_private.account_export_jobs set state='ready',completed_at=completed,expires_at=completed+interval '7 days',archive_object_key=p_object_key,
    archive_checksum=p_checksum,archive_bytes=p_bytes,claim_token=null,claimed_at=null,lease_expires_at=null,failure_code=null,version=version+1
    where export_job_id=p_job_id returning * into job;
  return jsonb_build_object('id',job.export_job_id,'state',job.state);
end $$;

create or replace function app_public.fail_account_export(p_job_id uuid,p_claim_token uuid,p_now timestamptz,p_error_code text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare attempts integer; code text;
begin
  select attempt_count into attempts from app_private.account_export_jobs where export_job_id=p_job_id and state='building' and claim_token=p_claim_token for update;
  if not found then return; end if;
  code:=case when p_error_code~'^[a-z][a-z0-9_]{1,63}$' then p_error_code else 'worker_failure' end;
  update app_private.account_export_jobs set state=case when attempts>=5 then 'failed' else 'queued' end,
    retry_at=case when attempts>=5 then null else statement_timestamp()+make_interval(mins=>least(60,power(2,attempts)::integer)) end,
    failure_code=code,claim_token=null,claimed_at=null,lease_expires_at=null,version=version+1 where export_job_id=p_job_id;
  if attempts>=5 then insert into app_private.account_lifecycle_operations_cases(resource_kind,resource_id,error_code)
    values('account_export',p_job_id,code) on conflict(resource_kind,resource_id,state) do nothing; end if;
end $$;

create or replace function app_public.expire_account_exports(p_now timestamptz,p_limit integer default 25)
returns table(job_id uuid,object_key text) language plpgsql volatile security definer set search_path='' as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_account_export_expiry',0)) then return; end if;
  return query with due as (
    select export_job_id from app_private.account_export_jobs where archive_deleted_at is null and archive_object_key is not null
      and ((state='ready' and expires_at<=statement_timestamp()) or state='expired') order by expires_at for update skip locked limit greatest(0,least(p_limit,100))
  ), expired as (
    update app_private.account_export_jobs j set state='expired',claim_token=null,claimed_at=null,lease_expires_at=null,version=version+1
      from due where j.export_job_id=due.export_job_id returning j.export_job_id,j.archive_object_key
  ) select export_job_id,archive_object_key from expired;
end $$;

create or replace function app_public.complete_account_export_expiry(p_job_id uuid,p_object_key text,p_completed_at timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  update app_private.account_export_jobs set archive_deleted_at=statement_timestamp(),version=version+1
    where export_job_id=p_job_id and state='expired' and archive_object_key=p_object_key and archive_deleted_at is null;
  if not found and not exists(select 1 from app_private.account_export_jobs where export_job_id=p_job_id and archive_deleted_at is not null)
    then raise exception using errcode='42501',message='account_export_expiry_invalid'; end if;
end $$;

create or replace function app_public.claim_due_private_memory_purges(p_now timestamptz,p_limit integer default 25)
returns table(undo_token uuid,claim_token uuid) language plpgsql volatile security definer set search_path='' as $$
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_private_memory_purge',0)) then return; end if;
  return query with due as (
    select d.undo_token from shopper_private.private_memory_deletions d where d.state='pending' and d.purge_due_at<=statement_timestamp()
      and d.attempt_count<5 and (d.retry_at is null or d.retry_at<=statement_timestamp()) and (d.claim_token is null or d.lease_expires_at<=statement_timestamp())
      order by d.purge_due_at for update skip locked limit greatest(0,least(p_limit,100))
  ), claimed as (
    update shopper_private.private_memory_deletions d set claim_token=extensions.gen_random_uuid(),claimed_at=statement_timestamp(),
      lease_expires_at=statement_timestamp()+interval '5 minutes',attempt_count=d.attempt_count+1,retry_at=null from due where d.undo_token=due.undo_token
    returning d.undo_token,d.claim_token
  ) select * from claimed;
end $$;

create or replace function app_public.complete_private_memory_purge(p_undo_token uuid,p_claim_token uuid,p_completed_at timestamptz)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare receipt uuid; completed timestamptz:=statement_timestamp();
begin
  insert into shopper_private.private_memory_deletion_receipts(deleted_at,completed_at)
    select d.created_at,completed from shopper_private.private_memory_deletions d where d.undo_token=p_undo_token and d.state='pending'
      and d.claim_token=p_claim_token and d.lease_expires_at>=completed returning receipt_id into receipt;
  if receipt is null then
    if exists(select 1 from shopper_private.private_memory_deletions where undo_token=p_undo_token and state='purged') then return null; end if;
    raise exception using errcode='42501',message='private_memory_purge_claim_invalid';
  end if;
  update shopper_private.private_memory_deletions set rating=null,note=null,last_visit_month=null,state='purged',purged_at=completed,
    claim_token=null,claimed_at=null,lease_expires_at=null,retry_at=null where undo_token=p_undo_token;
  return receipt;
end $$;

create or replace function app_public.fail_private_memory_purge(p_undo_token uuid,p_claim_token uuid,p_now timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
declare attempts integer;
begin
  select attempt_count into attempts from shopper_private.private_memory_deletions where undo_token=p_undo_token and state='pending' and claim_token=p_claim_token for update;
  if not found then return; end if;
  update shopper_private.private_memory_deletions set claim_token=null,claimed_at=null,lease_expires_at=null,
    retry_at=case when attempts>=5 then null else statement_timestamp()+make_interval(mins=>least(60,power(2,attempts)::integer)) end where undo_token=p_undo_token;
  if attempts>=5 then insert into app_private.account_lifecycle_operations_cases(resource_kind,resource_id,error_code)
    values('private_memory',p_undo_token,'worker_failure') on conflict(resource_kind,resource_id,state) do nothing; end if;
end $$;

create or replace function app_public.purge_due_catalog_dismissals(p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare removed integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('antique_trail_catalog_dismissal_purge',0)) then return 0; end if;
  with due as (select d.ctid from shopper_private.catalog_new_dismissals d where d.dismissed_at<=statement_timestamp()-interval '30 days'
    order by d.dismissed_at for update skip locked limit greatest(0,least(p_limit,500)))
  delete from shopper_private.catalog_new_dismissals d using due where d.ctid=due.ctid;
  get diagnostics removed=row_count;
  delete from shopper_private.private_memory_deletion_receipts where expires_at<=statement_timestamp();
  delete from app_private.deletion_receipts where expires_at<=statement_timestamp();
  return removed;
end $$;

alter function app_private.purge_account_application_data(uuid) owner to identity_service;
alter function app_public.claim_due_account_deletions(timestamptz,integer) owner to identity_service;
alter function app_public.prepare_account_deletion(uuid,uuid,timestamptz) owner to identity_service;
alter function app_public.complete_account_deletion(uuid,uuid,timestamptz) owner to identity_service;
alter function app_public.fail_account_deletion(uuid,uuid,timestamptz,text) owner to identity_service;
alter function app_public.replay_account_deletion_receipts(timestamptz,integer) owner to identity_service;
alter function app_public.build_account_export(uuid,uuid) owner to identity_service;

revoke all on function app_private.purge_account_application_data(uuid),
  app_public.claim_due_account_deletions(timestamptz,integer),app_public.prepare_account_deletion(uuid,uuid,timestamptz),
  app_public.complete_account_deletion(uuid,uuid,timestamptz),app_public.fail_account_deletion(uuid,uuid,timestamptz,text),
  app_public.replay_account_deletion_receipts(timestamptz,integer) from public,anon,authenticated,account_lifecycle_service;
grant execute on function app_public.claim_due_account_deletions(timestamptz,integer),
  app_public.prepare_account_deletion(uuid,uuid,timestamptz),app_public.complete_account_deletion(uuid,uuid,timestamptz),
  app_public.fail_account_deletion(uuid,uuid,timestamptz,text),app_public.replay_account_deletion_receipts(timestamptz,integer)
  to account_lifecycle_service;

revoke create on schema app_public,app_private from identity_service;
revoke identity_service from postgres;
