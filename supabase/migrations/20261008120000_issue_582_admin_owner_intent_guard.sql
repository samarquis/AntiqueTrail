-- Keep invitation-backed Owner claims out of generic Representative approval
-- and transfer commands, including claims whose identity is not yet bound.

alter function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)
  set schema partner_private;
alter function partner_private.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)
  rename to partner_admin_claim_command_core_unchecked;
revoke all on function partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)
  to identity_service;

create function partner_private.is_owner_intent_claim(p_claim_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from partner_private.listing_claims c
    join partner_private.store_owner_intake_roots root_row
      on root_row.applicant_id=c.claimant_id
      and root_row.active_kind='claim'
      and root_row.active_id=c.claim_id
    join partner_private.pending_partner_identities pending
      on pending.auth_user_id=c.claimant_id
    join partner_private.partner_invitations invitation
      on invitation.invitation_id=pending.invitation_id
      and invitation.synthetic
    where c.claim_id=p_claim_id
  );
$$;
alter function partner_private.is_owner_intent_claim(uuid) owner to identity_service;
revoke all on function partner_private.is_owner_intent_claim(uuid)
  from public,anon,authenticated,service_role;
grant execute on function partner_private.is_owner_intent_claim(uuid) to identity_service;

create function partner_private.partner_admin_claim_command_core(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid,p_allow_owner_intent boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare claimant uuid; intake_root partner_private.store_owner_intake_roots%rowtype;
begin
  perform partner_private.require_claim_admin();
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
  return partner_private.partner_admin_claim_command_core_unchecked(
    p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id);
end $$;
alter function partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)
  owner to identity_service;
revoke all on function partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)
  to identity_service;

create or replace function app_public.partner_admin_claim_case(p_claim_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
begin
  select * into c from partner_private.listing_claims
    where claim_id=p_claim_id and (assigned_admin_id is null or assigned_admin_id=actor);
  if not found then raise exception using errcode='55000',message='partner_claim_case_unavailable'; end if;
  return jsonb_build_object(
    'claimId',c.claim_id,'storeId',c.store_id,'state',c.state,'riskTier',c.risk_tier,
    'version',c.version,'ownerIntent',partner_private.is_owner_intent_claim(c.claim_id),
    'exactStoreScope',(select slug from app_public.stores where id=c.store_id),
    'verifiedSignals',(select coalesce(jsonb_agg(jsonb_build_object(
      'channelClass',channel_class,'signalType',signal_type) order by created_at),'[]')
      from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified'),
    'pendingSignals',(select coalesce(jsonb_agg(jsonb_build_object(
      'signalId',signal_id,'channelClass',channel_class,'signalType',signal_type) order by created_at),'[]')
      from partner_private.claim_authority_signals where claim_id=c.claim_id and status='submitted')
  );
end $$;
alter function app_public.partner_admin_claim_case(uuid) owner to identity_service;

create function app_public.partner_admin_claim_command(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  return partner_private.partner_admin_claim_command_core(
    p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id,false);
end $$;
alter function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)
  owner to identity_service;
revoke all on function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)
  from public,anon,service_role;
grant execute on function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)
  to authenticated;

create or replace function app_public.owner_admin_approve_claim(
  p_claim_id uuid,p_store_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin();
  c partner_private.listing_claims%rowtype;
  prior partner_private.owner_claim_approvals%rowtype;
  intake_root partner_private.store_owner_intake_roots%rowtype;
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
    insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
      values(actor,'administrator','owner_claim_approved','completed','listing_claim',p_claim_id,'owner_boundary_confirmed',
        extensions.digest(convert_to(p_claim_id::text||'|'||p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
  end if;
  return jsonb_build_object('role','Store Owner','storeId',p_store_id,'claimId',p_claim_id);
end $$;
alter function app_public.owner_admin_approve_claim(uuid,uuid,bigint,text) owner to identity_service;

revoke create on schema partner_private from identity_service;
