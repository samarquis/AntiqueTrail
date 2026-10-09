-- Keep the accepted audit-anchor guard intact while deferring Owner approval audits
-- until both protected role grants have been converted in the same transaction.
grant create on schema app_public,partner_private to identity_service;
set role identity_service;

create or replace function partner_private.partner_admin_claim_command_core(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid,p_allow_owner_intent boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  claimant uuid;
  intake_root partner_private.store_owner_intake_roots%rowtype;
  target_store uuid;
  result jsonb;
begin
  perform set_config('antique.owner_approval_defer_audit','off',true);
  perform partner_private.require_claim_admin();
  if exists(select 1 from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key) then
    return partner_private.partner_admin_claim_command_core_unchecked(
      p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id);
  end if;
  if p_operation in ('approve','transfer') and not coalesce(p_allow_owner_intent,false) then
    select c.claimant_id into claimant from partner_private.listing_claims c where c.claim_id=p_claim_id;
    if found then
      select * into intake_root from partner_private.store_owner_intake_roots
        where applicant_id=claimant for update;
      if found and intake_root.active_kind='claim' and intake_root.active_id=p_claim_id
        and partner_private.is_owner_intent_claim(p_claim_id) then
        raise exception using errcode='42501',message='partner_admin_owner_path_required';
      end if;
    end if;
  end if;
  if p_operation in ('revoke','recheck','transfer') then
    select c.store_id into target_store from partner_private.listing_claims c where c.claim_id=p_claim_id;
    if target_store is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||target_store,0));
      perform 1 from partner_private.listing_claims where store_id=target_store for update;
      perform 1 from partner_private.store_partner_grants where store_id=target_store for update;
      if exists(select 1 from partner_private.owner_claim_approvals
        where claim_id=p_claim_id and store_id=target_store)
        or (p_operation='transfer' and exists(
          select 1 from partner_private.owner_claim_approvals
          where claim_id=p_transfer_from_claim_id
        )) then
        raise exception using errcode='42501',message='partner_admin_owner_path_required';
      end if;
    end if;
  end if;
  perform set_config('antique.owner_approval_defer_audit',
    case when p_operation='approve' and coalesce(p_allow_owner_intent,false) then 'on' else 'off' end,true);
  result:=partner_private.partner_admin_claim_command_core_unchecked(
    p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id);
  perform set_config('antique.owner_approval_defer_audit','off',true);
  return result;
end $$;
alter function partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)
  owner to identity_service;

-- The unchecked implementation remains private and keeps all existing claim,
-- CAS, idempotency, and receipt behavior. Only its generic audit append is deferred
-- for the checked Owner path; the Owner routine appends it after grant conversion.
create or replace function partner_private.partner_admin_claim_command_core_unchecked(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
  old partner_private.listing_claims%rowtype; root partner_private.store_owner_intake_roots%rowtype;
  prior partner_private.claim_command_receipts%rowtype; d bytea; prior_state text; case_result jsonb;
begin
  if p_operation not in ('changes','conflict','approve','reject','revoke','recheck','transfer')
    or p_claim_id is null or p_expected_version<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' or ((p_operation='transfer')<>(p_transfer_from_claim_id is not null)) then
    raise exception using errcode='22023',message='partner_admin_command_invalid';
  end if;
  d:=extensions.digest(convert_to(concat_ws('|',p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id,actor),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>p_operation or prior.claim_id<>p_claim_id or prior.input_digest<>d then
      raise exception using errcode='22023',message='partner_claim_idempotency_mismatch'; end if;
    return app_public.partner_admin_claim_case(p_claim_id);
  end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(c.claimant_id)
    on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=c.claimant_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  perform 1 from partner_private.claim_authority_signals where claim_id=c.claim_id for update;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  if not found or c.version<>p_expected_version or c.claimant_id=actor
    or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then
    raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  perform 1 from partner_private.store_partner_grants where store_id=c.store_id for update;
  prior_state:=c.state;
  if p_operation='changes' and c.state in ('submitted','verification_pending','conflict') then
    update partner_private.listing_claims set state='changes_requested',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='conflict' and c.state in ('submitted','verification_pending') then
    update partner_private.listing_claims set state='conflict',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
    insert into partner_private.claim_conflicts(claim_id,conflict_kind,assigned_admin_id) values(c.claim_id,'authority_mismatch',actor);
  elsif p_operation='reject' and c.state in ('submitted','verification_pending','conflict') then
    update partner_private.listing_claims set state='rejected',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='approve' then
    perform partner_private.approve_exact_claim(c.claim_id,actor);
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation in ('revoke','recheck') then
    perform partner_private.revoke_exact_claim_scope(c.claim_id,actor,p_reason_code,p_idempotency_key||'-scope');
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation='transfer' then
    select * into old from partner_private.listing_claims where claim_id=p_transfer_from_claim_id and store_id=c.store_id for update;
    if old.state<>'approved' then raise exception using errcode='55000',message='partner_transfer_source_invalid'; end if;
    perform partner_private.revoke_exact_claim_scope(old.claim_id,actor,'scope_transfer',p_idempotency_key||'-old');
    perform partner_private.approve_exact_claim(c.claim_id,actor);
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  else raise exception using errcode='55000',message='partner_claim_state_invalid'; end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(c.claim_id,actor,case p_operation when 'changes' then 'changes_requested' when 'conflict' then 'conflict_opened' when 'approve' then 'approved' when 'reject' then 'rejected' when 'transfer' then 'transferred' else 'revoked' end,prior_state,c.state,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,p_operation,c.claim_id,actor,d,c.state);
  case_result:=app_public.partner_admin_claim_case(c.claim_id);
  if coalesce(current_setting('antique.owner_approval_defer_audit',true),'off')<>'on' then
    insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
      values(actor,'administrator','partner_claim_'||p_operation,'completed','listing_claim',c.claim_id,p_reason_code,d,decode(repeat('00',32),'hex'));
  end if;
  return case_result;
end $$;
alter function partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)
  owner to identity_service;

create or replace function app_public.owner_admin_approve_claim(
  p_claim_id uuid,p_store_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin();
  c partner_private.listing_claims%rowtype;
  prior partner_private.owner_claim_approvals%rowtype;
  intake_root partner_private.store_owner_intake_roots%rowtype;
  command_digest bytea;
begin
  if p_claim_id is null or p_store_id is null or p_expected_version is null or p_expected_version<1
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='owner_command_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-approval:'||p_idempotency_key,0));
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found or c.store_id<>p_store_id or c.claimant_id=actor
    or not exists(select 1 from app_public.stores s cross join app_private.environment_stage e
      where s.id=c.store_id and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
    or not exists(select 1 from app_private.profiles where user_id=c.claimant_id and status='active' and verified_email_snapshot is not null)
    or not app_private.provider_user_has_verified_mfa(c.claimant_id) then
    raise exception using errcode='42501',message='owner_access_unavailable';
  end if;
  if not exists(select 1 from partner_private.pending_partner_identities p
      join partner_private.partner_invitations i on i.invitation_id=p.invitation_id and i.synthetic
      where p.auth_user_id=c.claimant_id and p.state='bound')
    or not app_private.provider_user_is_confirmed(c.claimant_id) then
    raise exception using errcode='42501',message='owner_access_unavailable';
  end if;
  select * into prior from partner_private.owner_claim_approvals where idempotency_key=p_idempotency_key;
  if found then
    if prior.claim_id<>p_claim_id or prior.store_id<>p_store_id or prior.approved_by<>actor or prior.expected_version<>p_expected_version then
      raise exception using errcode='22023',message='owner_idempotency_mismatch';
    end if;
    if c.state<>'approved' then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
  else
    if exists(select 1 from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key) then
      raise exception using errcode='22023',message='owner_idempotency_mismatch';
    end if;
    select * into intake_root from partner_private.store_owner_intake_roots
      where applicant_id=c.claimant_id for update;
    if not found or intake_root.active_kind<>'claim' or intake_root.active_id<>c.claim_id
      or not exists(select 1 from partner_private.pending_partner_identities p
        join partner_private.partner_invitations i on i.invitation_id=p.invitation_id
        where p.auth_user_id=c.claimant_id and p.state='bound'
          and p.verified_email_at is not null and p.mfa_verified_at is not null and i.synthetic) then
      raise exception using errcode='42501',message='owner_access_unavailable';
    end if;
    perform partner_private.partner_admin_claim_command_core(
      'approve',p_claim_id,p_expected_version,p_idempotency_key,'owner_boundary_confirmed',null,true);
    update app_private.role_grants set role='store_owner',version=version+1
      where subject_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active';
    if not found then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
    update partner_private.store_partner_grants set role='store_owner',version=version+1
      where auth_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active';
    if not found then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
    insert into partner_private.owner_claim_approvals(claim_id,store_id,approved_by,expected_version,idempotency_key)
      values(p_claim_id,p_store_id,actor,p_expected_version,p_idempotency_key);
    select input_digest into command_digest from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
    insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
      values(actor,'administrator','partner_claim_approve','completed','listing_claim',p_claim_id,'owner_boundary_confirmed',command_digest,decode(repeat('00',32),'hex'));
    insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
      values(actor,'administrator','owner_claim_approved','completed','listing_claim',p_claim_id,'owner_boundary_confirmed',
        extensions.digest(convert_to(p_claim_id::text||'|'||p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  end if;
  return jsonb_build_object('role','Store Owner','storeId',p_store_id,'claimId',p_claim_id);
end $$;
alter function app_public.owner_admin_approve_claim(uuid,uuid,bigint,text) owner to identity_service;

reset role;
revoke create on schema app_public,partner_private from identity_service;
