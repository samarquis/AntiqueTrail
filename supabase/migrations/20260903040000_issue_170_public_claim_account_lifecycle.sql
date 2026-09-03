-- Issue #170 follow-up: preserve content-free claim audit receipts without
-- retaining account identifiers or blocking the established deletion worker.

grant identity_service to postgres;
grant create on schema app_public,app_private,partner_private to identity_service;

alter table partner_private.listing_claims
  add column assigned_admin_tombstone uuid,
  add column approved_by_tombstone uuid;

alter table partner_private.claim_authority_signals
  add column verifier_tombstone uuid,
  drop constraint claim_signal_verified_shape,
  add constraint claim_signal_verified_shape check (
    (status='verified' and verified_at is not null and (
      (verified_by is not null and verifier_tombstone is null)
      or (verified_by is null and verifier_tombstone is not null)
    ))
    or (status<>'verified' and verified_by is null and verified_at is null and verifier_tombstone is null)
  );

create or replace function partner_private.guard_claim_signal_current_consent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.verified_by is not null and new.verified_by is null
    and old.verifier_tombstone is null and new.verifier_tombstone is null
    and row(new.signal_id,new.claim_id,new.channel_class,new.signal_type,new.status,new.verified_at,
      new.evidence_ref_hmac,new.created_at,new.authority_object_hmac,new.verification_event_id)
      is not distinct from
      row(old.signal_id,old.claim_id,old.channel_class,old.signal_type,old.status,old.verified_at,
        old.evidence_ref_hmac,old.created_at,old.authority_object_hmac,old.verification_event_id) then
    new.verifier_tombstone:=extensions.gen_random_uuid();
    return new;
  end if;
  if not exists(select 1 from partner_private.listing_claims c where c.claim_id=new.claim_id
    and not c.material_reconsent_required and partner_private.partner_consent_is_current(c.claimant_id)) then
    raise exception using errcode='42501',message='partner_material_reconsent_required';
  end if;
  return new;
end $$;
alter function partner_private.guard_claim_signal_current_consent() owner to identity_service;

-- The original guard predates de-identified retained claims. Permit only the
-- deletion worker's exact terminal unlink; all ordinary identity edits remain
-- immutable and all other state-machine checks are unchanged.
create or replace function partner_private.enforce_listing_claim_transition()
returns trigger language plpgsql set search_path=pg_catalog,partner_private,auth as $$
declare v_verified_channels integer;
begin
  if tg_op='INSERT' then
    if new.state<>'draft' or new.assigned_admin_id is not null or new.approved_at is not null
      or new.approved_by is not null or new.revoked_at is not null
      or new.last_authority_verified_at is not null or new.authority_recheck_due_at is not null then
      raise exception 'listing_claim_initial_state_forbidden';
    end if;
    if new.relationship is null or new.authority_statement is null then raise exception 'listing_claim_assertion_required'; end if;
    return new;
  end if;
  if current_user='identity_service'
    and new.claimant_id is not distinct from old.claimant_id
    and new.claim_id is not distinct from old.claim_id and new.store_id is not distinct from old.store_id
    and new.state is not distinct from old.state and new.risk_tier is not distinct from old.risk_tier
    and new.submitted_at is not distinct from old.submitted_at and new.approved_at is not distinct from old.approved_at
    and new.revoked_at is not distinct from old.revoked_at and new.created_at is not distinct from old.created_at
    and new.relationship is not distinct from old.relationship and new.authority_statement is not distinct from old.authority_statement
    and new.last_authority_verified_at is not distinct from old.last_authority_verified_at
    and new.authority_recheck_due_at is not distinct from old.authority_recheck_due_at
    and new.material_reconsent_required is not distinct from old.material_reconsent_required
    and ((new.assigned_admin_id is not distinct from old.assigned_admin_id and new.assigned_admin_tombstone is not distinct from old.assigned_admin_tombstone)
      or (old.assigned_admin_id is not null and new.assigned_admin_id is null and old.assigned_admin_tombstone is null and new.assigned_admin_tombstone is not null))
    and ((new.approved_by is not distinct from old.approved_by and new.approved_by_tombstone is not distinct from old.approved_by_tombstone)
      or (old.approved_by is not null and new.approved_by is null and old.approved_by_tombstone is null and new.approved_by_tombstone is not null))
    and (new.assigned_admin_id is distinct from old.assigned_admin_id or new.approved_by is distinct from old.approved_by) then
    new.version:=old.version+1;
    new.updated_at:=statement_timestamp();
    return new;
  end if;
  if current_user='identity_service' and old.claimant_id is not null and new.claimant_id is null
    and new.claim_id is not distinct from old.claim_id and new.store_id is not distinct from old.store_id
    and new.created_at is not distinct from old.created_at and new.submitted_at is not distinct from old.submitted_at
    and new.relationship is not distinct from old.relationship and new.authority_statement is not distinct from old.authority_statement
    and new.risk_tier is not distinct from old.risk_tier and new.state='revoked'
    and new.assigned_admin_id is null and new.material_reconsent_required is not distinct from old.material_reconsent_required
    and new.approved_at is not distinct from old.approved_at and new.approved_by is not distinct from old.approved_by
    and new.last_authority_verified_at is not distinct from old.last_authority_verified_at
    and new.authority_recheck_due_at is not distinct from old.authority_recheck_due_at then
    new.assigned_admin_id:=case when old.assigned_admin_id=old.claimant_id then null else old.assigned_admin_id end;
    new.assigned_admin_tombstone:=case when old.assigned_admin_id=old.claimant_id then extensions.gen_random_uuid() else old.assigned_admin_tombstone end;
    new.revoked_at:=coalesce(new.revoked_at,statement_timestamp());
    new.version:=old.version+1;
    new.updated_at:=statement_timestamp();
    return new;
  end if;
  if new.claimant_id is distinct from old.claimant_id or new.store_id is distinct from old.store_id
    or new.created_at is distinct from old.created_at then raise exception 'listing_claim_identity_immutable'; end if;
  if old.state in ('rejected','withdrawn','revoked') then
    if new is distinct from old then raise exception 'listing_claim_terminal'; end if;
    return old;
  end if;
  if old.state='approved' then
    if new.state='approved' and new is distinct from old then raise exception 'listing_claim_terminal';
    elsif new.state not in ('approved','revoked') then raise exception 'listing_claim_transition_forbidden'; end if;
  end if;
  if (old.state='draft' and new.state not in ('draft','submitted','withdrawn'))
    or (old.state='submitted' and new.state not in ('submitted','verification_pending','changes_requested','conflict','rejected','withdrawn'))
    or (old.state='verification_pending' and new.state not in ('verification_pending','changes_requested','conflict','approved','rejected','withdrawn'))
    or (old.state='changes_requested' and new.state not in ('changes_requested','submitted','withdrawn'))
    or (old.state='conflict' and new.state not in ('conflict','verification_pending','rejected','withdrawn','revoked')) then
    raise exception 'listing_claim_transition_forbidden';
  end if;
  if new.state='approved' then
    select count(distinct channel_class) into v_verified_channels from partner_private.claim_authority_signals
      where claim_id=old.claim_id and status='verified';
    if v_verified_channels<2 then raise exception 'listing_claim_two_signals_required'; end if;
    if new.assigned_admin_id is null or new.approved_by is null or new.approved_at is null
      or new.approved_by is distinct from new.assigned_admin_id then raise exception 'listing_claim_approval_evidence_required'; end if;
    new.last_authority_verified_at:=new.approved_at;
    new.authority_recheck_due_at:=new.approved_at+case new.risk_tier when 'standard' then interval '1 year'
      when 'elevated' then interval '180 days' else interval '90 days' end;
  elsif new.last_authority_verified_at is distinct from old.last_authority_verified_at
    or new.authority_recheck_due_at is distinct from old.authority_recheck_due_at then raise exception 'listing_claim_recheck_server_owned';
  end if;
  if new.state in ('withdrawn','revoked') and new.revoked_at is null then new.revoked_at:=statement_timestamp(); end if;
  new.version:=old.version+1;
  new.updated_at:=statement_timestamp();
  return new;
end $$;

alter table partner_private.public_claim_consent_receipts
  drop constraint public_claim_consent_receipts_auth_user_id_fkey,
  alter column auth_user_id drop not null,
  add column actor_tombstone uuid,
  add constraint public_claim_consent_receipts_auth_user_id_fkey
    foreign key(auth_user_id) references auth.users(id) on delete set null,
  add constraint public_claim_consent_receipt_subject_shape check (
    (auth_user_id is not null and actor_tombstone is null)
    or (auth_user_id is null and actor_tombstone is not null)
  );

alter table partner_private.claim_free_activation_receipts
  drop constraint claim_free_activation_receipts_applicant_id_fkey,
  drop constraint claim_free_activation_receipts_granted_by_fkey,
  alter column applicant_id drop not null,
  alter column granted_by drop not null,
  add column applicant_tombstone uuid,
  add column grantor_tombstone uuid,
  add constraint claim_free_activation_receipts_applicant_id_fkey
    foreign key(applicant_id) references auth.users(id) on delete set null,
  add constraint claim_free_activation_receipts_granted_by_fkey
    foreign key(granted_by) references auth.users(id) on delete set null,
  add constraint claim_free_activation_receipt_applicant_shape check (
    (applicant_id is not null and applicant_tombstone is null)
    or (applicant_id is null and applicant_tombstone is not null)
  ),
  add constraint claim_free_activation_receipt_grantor_shape check (
    (granted_by is not null and grantor_tombstone is null)
    or (granted_by is null and grantor_tombstone is not null)
  );

grant update on partner_private.public_claim_consent_receipts,
  partner_private.claim_free_activation_receipts to identity_service;

create or replace function partner_private.reject_public_claim_consent_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE'
    and old.auth_user_id is not null and new.auth_user_id is null
    and old.actor_tombstone is null and new.actor_tombstone is not null
    and row(new.receipt_id,new.policy_version,new.reviewed_ack,new.voluntary_ack,new.idempotency_key,new.receipt_checksum,new.accepted_at)
      is not distinct from
      row(old.receipt_id,old.policy_version,old.reviewed_ack,old.voluntary_ack,old.idempotency_key,old.receipt_checksum,old.accepted_at) then
    return new;
  end if;
  raise exception using errcode='55000',message='public_claim_consent_receipt_append_only';
end $$;
alter function partner_private.reject_public_claim_consent_mutation() owner to identity_service;

create function partner_private.reject_claim_free_activation_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE'
    and ((old.applicant_id is not distinct from new.applicant_id and old.applicant_tombstone is not distinct from new.applicant_tombstone)
      or (old.applicant_id is not null and new.applicant_id is null and old.applicant_tombstone is null and new.applicant_tombstone is not null))
    and ((old.granted_by is not distinct from new.granted_by and old.grantor_tombstone is not distinct from new.grantor_tombstone)
      or (old.granted_by is not null and new.granted_by is null and old.grantor_tombstone is null and new.grantor_tombstone is not null))
    and (old.applicant_id is distinct from new.applicant_id or old.granted_by is distinct from new.granted_by)
    and row(new.receipt_id,new.claim_id,new.store_id,new.tier,new.created_at)
      is not distinct from row(old.receipt_id,old.claim_id,old.store_id,old.tier,old.created_at) then
    return new;
  end if;
  raise exception using errcode='55000',message='claim_free_activation_receipt_append_only';
end $$;
alter function partner_private.reject_claim_free_activation_mutation() owner to identity_service;
revoke all on function partner_private.reject_claim_free_activation_mutation() from public,anon,authenticated;
create trigger claim_free_activation_receipts_append_only before update or delete
  on partner_private.claim_free_activation_receipts for each row
  execute function partner_private.reject_claim_free_activation_mutation();

create function partner_private.deidentify_claim_receipts_for_deleted_profile()
returns trigger language plpgsql security definer set search_path='' as $$
declare tombstone uuid:=extensions.gen_random_uuid();
begin
  update partner_private.public_claim_consent_receipts
    set auth_user_id=null,actor_tombstone=tombstone where auth_user_id=old.user_id;
  update partner_private.claim_free_activation_receipts
    set applicant_id=case when applicant_id=old.user_id then null else applicant_id end,
      applicant_tombstone=case when applicant_id=old.user_id then tombstone else applicant_tombstone end,
      granted_by=case when granted_by=old.user_id then null else granted_by end,
      grantor_tombstone=case when granted_by=old.user_id then tombstone else grantor_tombstone end
    where applicant_id=old.user_id or granted_by=old.user_id;
  update partner_private.listing_claims
    set assigned_admin_id=case when assigned_admin_id=old.user_id then null else assigned_admin_id end,
      assigned_admin_tombstone=case when assigned_admin_id=old.user_id then tombstone else assigned_admin_tombstone end,
      approved_by=case when approved_by=old.user_id then null else approved_by end,
      approved_by_tombstone=case when approved_by=old.user_id then tombstone else approved_by_tombstone end
    where assigned_admin_id=old.user_id or approved_by=old.user_id;
  return old;
end $$;
alter function partner_private.deidentify_claim_receipts_for_deleted_profile() owner to identity_service;
revoke all on function partner_private.deidentify_claim_receipts_for_deleted_profile() from public,anon,authenticated;
create trigger profile_deidentify_claim_receipts before delete on app_private.profiles
  for each row execute function partner_private.deidentify_claim_receipts_for_deleted_profile();

alter function app_public.build_account_export_canonical_json(uuid,uuid)
  rename to build_account_export_before_claim_receipts;
revoke all on function app_public.build_account_export_before_claim_receipts(uuid,uuid)
  from public,anon,authenticated;

create or replace function app_public.build_account_export_canonical_json(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; canonical jsonb;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  canonical:=app_public.build_account_export_before_claim_receipts(p_job_id,p_claim_token)::jsonb;
  return (canonical||jsonb_build_object('partnerClaims',jsonb_build_object(
    'consentReceipts',(select coalesce(jsonb_agg(jsonb_build_object('receiptId',r.receipt_id,'policyVersion',r.policy_version,'acceptedAt',r.accepted_at) order by r.accepted_at),'[]'::jsonb)
      from partner_private.public_claim_consent_receipts r where r.auth_user_id=job.user_id),
    'freeActivations',(select coalesce(jsonb_agg(jsonb_build_object('receiptId',r.receipt_id,'claimId',r.claim_id,'storeId',r.store_id,'tier',r.tier,'createdAt',r.created_at) order by r.created_at),'[]'::jsonb)
      from partner_private.claim_free_activation_receipts r where r.applicant_id=job.user_id),
    'approvalsGranted',(select coalesce(jsonb_agg(jsonb_build_object('receiptId',r.receipt_id,'claimId',r.claim_id,'storeId',r.store_id,'tier',r.tier,'createdAt',r.created_at) order by r.created_at),'[]'::jsonb)
      from partner_private.claim_free_activation_receipts r where r.granted_by=job.user_id)
  )))::text;
end $$;
alter function app_public.build_account_export_canonical_json(uuid,uuid) owner to identity_service;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid) from public,anon,authenticated;
grant execute on function app_public.build_account_export_canonical_json(uuid,uuid) to identity_service;

revoke create on schema app_public,app_private,partner_private from identity_service;
revoke identity_service from postgres;
