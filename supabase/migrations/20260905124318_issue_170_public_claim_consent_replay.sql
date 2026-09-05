-- Issue #170 follow-up: ordinary applicants can consent without pilot identity,
-- and signal retries are bound to their exact original input.

grant identity_service to postgres;
grant create on schema app_public,partner_private to identity_service;

create table partner_private.public_claim_consent_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  policy_version text not null references partner_private.partner_material_terms(policy_version) on delete restrict,
  reviewed_ack boolean not null check (reviewed_ack),
  voluntary_ack boolean not null check (voluntary_ack),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  receipt_checksum bytea not null check (octet_length(receipt_checksum)=32),
  accepted_at timestamptz not null default statement_timestamp(),
  unique(auth_user_id,policy_version)
);
alter table partner_private.public_claim_consent_receipts owner to identity_service;
set role identity_service;
alter table partner_private.public_claim_consent_receipts enable row level security;
alter table partner_private.public_claim_consent_receipts force row level security;
revoke all on partner_private.public_claim_consent_receipts from public,anon,authenticated;
grant select,insert on partner_private.public_claim_consent_receipts to identity_service;
create policy identity_service_public_claim_consent_receipts
  on partner_private.public_claim_consent_receipts for all to identity_service using (true) with check (true);
create function partner_private.reject_public_claim_consent_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='55000',message='public_claim_consent_receipt_append_only';
end $$;
revoke all on function partner_private.reject_public_claim_consent_mutation() from public,anon,authenticated;
create trigger public_claim_consent_receipts_append_only before update or delete
  on partner_private.public_claim_consent_receipts for each row execute function partner_private.reject_public_claim_consent_mutation();

create or replace function partner_private.partner_accepted_consent_version(target_user uuid)
returns text language sql stable security definer set search_path='' as $$
  select accepted.policy_version from (
    select r.policy_version,r.accepted_at from partner_private.partner_reconsent_receipts r where r.auth_user_id=target_user
    union all
    select r.policy_version,r.accepted_at from partner_private.public_claim_consent_receipts r where r.auth_user_id=target_user
    union all
    select r.policy_version,r.finalized_at from partner_private.pilot_consent_receipts r where r.auth_user_id=target_user
  ) accepted order by accepted.accepted_at desc limit 1
$$;

create or replace function app_public.partner_consent_command(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id(); current_version text; prior_receipt uuid;
  prior_reconsent partner_private.partner_reconsent_receipts%rowtype;
  prior_public partner_private.public_claim_consent_receipts%rowtype;
  digest bytea; pilot boolean;
begin
  if actor is null or not app_private.current_session_is_active()
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active'
      and p.verified_email_snapshot is not null) then
    raise exception using errcode='42501',message='partner_consent_unavailable';
  end if;
  select exists(select 1 from partner_private.pending_partner_identities p where p.auth_user_id=actor and p.state='bound') into pilot;
  if p_operation='get_consent_status' then return partner_private.partner_consent_status(actor); end if;
  if p_operation<>'accept_material_terms' or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_payload->>'policyVersion' is null
    or p_payload->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not coalesce((p_payload->'acknowledgements'->>'reviewed')::boolean,false)
    or not coalesce((p_payload->'acknowledgements'->>'voluntary')::boolean,false) then
    raise exception using errcode='42501',message='partner_reconsent_denied';
  end if;
  select policy_version into current_version from partner_private.partner_material_terms where is_current;
  if p_payload->>'policyVersion' is distinct from current_version then
    raise exception using errcode='40001',message='partner_terms_changed';
  end if;
  digest:=extensions.digest(convert_to(concat_ws('|',actor,current_version,'reviewed','voluntary'),'utf8'),'sha256');
  select * into prior_public from partner_private.public_claim_consent_receipts where idempotency_key=p_payload->>'idempotencyKey';
  if found then
    if prior_public.auth_user_id<>actor or prior_public.policy_version<>current_version or prior_public.receipt_checksum<>digest then
      raise exception using errcode='22023',message='partner_reconsent_idempotency_mismatch'; end if;
    return partner_private.partner_consent_status(actor);
  end if;
  select * into prior_reconsent from partner_private.partner_reconsent_receipts where idempotency_key=p_payload->>'idempotencyKey';
  if found then
    if prior_reconsent.auth_user_id<>actor or prior_reconsent.policy_version<>current_version or prior_reconsent.receipt_checksum<>digest then
      raise exception using errcode='22023',message='partner_reconsent_idempotency_mismatch'; end if;
    return partner_private.partner_consent_status(actor);
  end if;
  if pilot then
    select consent_receipt_id into prior_receipt from partner_private.pilot_consent_receipts where auth_user_id=actor order by finalized_at desc limit 1;
    if prior_receipt is null then raise exception using errcode='42501',message='partner_reconsent_denied'; end if;
    insert into partner_private.partner_reconsent_receipts(auth_user_id,prior_consent_receipt_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum)
      values(actor,prior_receipt,current_version,true,true,p_payload->>'idempotencyKey',digest)
      on conflict(auth_user_id,policy_version) do nothing;
  else
    insert into partner_private.public_claim_consent_receipts(auth_user_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum)
      values(actor,current_version,true,true,p_payload->>'idempotencyKey',digest)
      on conflict(auth_user_id,policy_version) do nothing;
  end if;
  update partner_private.listing_claims set material_reconsent_required=false where claimant_id=actor;
  update partner_private.store_partnerships set state='active',consent_policy_version=current_version where auth_user_id=actor and state='reconsent_required';
  update partner_private.store_partner_grants set state='active',consent_policy_version=current_version where auth_user_id=actor and state='reconsent_required';
  return partner_private.partner_consent_status(actor);
end $$;

create or replace function app_public.public_listing_claim_signal_command(
  p_claim_id uuid,p_channel_class text,p_evidence_ref_hmac bytea,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; signal_type text; digest bytea;
  prior partner_private.claim_command_receipts%rowtype;
begin
  if p_claim_id is null or p_channel_class not in ('published_business_contact','callback','mailed_code','filing_lookup','in_person')
    or octet_length(p_evidence_ref_hmac)<>32 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='42501',message='listing_claim_unavailable';
  end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor;
  if not found or not partner_private.claim_stage_allowed(c.store_id) then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  signal_type:=case p_channel_class when 'published_business_contact' then 'domain_response' when 'callback' then 'callback'
    when 'mailed_code' then 'mailed_code' when 'filing_lookup' then 'filing_lookup' else 'in_person_inspection' end;
  digest:=extensions.digest(convert_to(concat_ws('|','public-signal',actor,p_claim_id,p_channel_class,encode(p_evidence_ref_hmac,'hex')),'utf8'),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'submit' or prior.claim_id<>p_claim_id or prior.input_digest<>digest then
      raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
    return app_public.public_listing_claim_status(p_claim_id);
  end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(actor) on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor for update;
  if root.active_kind<>'claim' or root.active_id<>c.claim_id or c.state not in ('submitted','verification_pending','changes_requested') then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  if c.state='changes_requested' then
    perform app_public.partner_claimant_claim_command('submit',c.claim_id,c.version,
      'public-resubmit-'||encode(extensions.digest(p_idempotency_key,'sha256'),'hex'));
    select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  end if;
  insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,evidence_ref_hmac)
    values(c.claim_id,p_channel_class,signal_type,'submitted',p_evidence_ref_hmac);
  if c.state='submitted' then update partner_private.listing_claims set state='verification_pending' where claim_id=c.claim_id; end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(c.claim_id,actor,'signal_submitted',c.state,case when c.state='submitted' then 'verification_pending' else c.state end,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,'submit',c.claim_id,actor,digest,'verification_pending');
  return app_public.public_listing_claim_status(c.claim_id);
end $$;

reset role;
revoke create on schema app_public,partner_private from identity_service;
revoke identity_service from postgres;
