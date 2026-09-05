-- Issue #170: the Package 10B existing-listing claim seam.  This migration
-- deliberately builds the command while the release capability remains off.
-- It does not enable a route, a capability, or a public listing.

grant identity_service to postgres;
grant create on schema app_public, partner_private to identity_service;
grant select,insert,update on partner_private.store_photo_tier_state to identity_service;
create policy identity_service_claim_free_tier_read
  on partner_private.store_photo_tier_state for select to identity_service using (true);
create policy identity_service_claim_free_tier_insert
  on partner_private.store_photo_tier_state for insert to identity_service
  with check (tier='free' and source='default');
create policy identity_service_claim_free_tier_update
  on partner_private.store_photo_tier_state for update to identity_service
  using (tier='free' and source='default') with check (tier='free' and source='default');

create table partner_private.store_owner_intake_roots (
  applicant_id uuid primary key references auth.users(id) on delete cascade,
  active_kind text not null default 'none' check (active_kind in ('none','claim','add')),
  active_id uuid,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default statement_timestamp(),
  constraint store_owner_intake_root_shape check (
    (active_kind='none' and active_id is null) or (active_kind in ('claim','add') and active_id is not null)
  )
);
alter table partner_private.store_owner_intake_roots enable row level security;
alter table partner_private.store_owner_intake_roots force row level security;
revoke all on partner_private.store_owner_intake_roots from public, anon, authenticated;
grant select, insert, update on partner_private.store_owner_intake_roots to identity_service;
create policy identity_service_store_owner_intake_roots on partner_private.store_owner_intake_roots
  for all to identity_service using (true) with check (true);

-- A public claimant has an ordinary Auth account, not an invitation-backed
-- pilot identity.  Keep the two shapes explicit so a public claim cannot
-- borrow pilot consent or invitation authority.
alter table partner_private.store_partnerships
  add column if not exists intake_kind text not null default 'pilot';
alter table partner_private.store_partnerships
  alter column pending_identity_id drop not null,
  alter column consent_receipt_id drop not null;
alter table partner_private.store_partnerships
  drop constraint if exists store_partnership_public_identity_shape,
  add constraint store_partnership_public_identity_shape check (
    (intake_kind='pilot' and pending_identity_id is not null and consent_receipt_id is not null)
    or (intake_kind='public_claim' and pending_identity_id is null and consent_receipt_id is null)
  );

create table partner_private.claim_free_activation_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  claim_id uuid not null unique references partner_private.listing_claims(claim_id) on delete restrict,
  applicant_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  tier text not null check (tier='free'),
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp()
);
alter table partner_private.claim_free_activation_receipts enable row level security;
alter table partner_private.claim_free_activation_receipts force row level security;
revoke all on partner_private.claim_free_activation_receipts from public, anon, authenticated;
grant select, insert on partner_private.claim_free_activation_receipts to identity_service;
create policy identity_service_claim_free_activation_receipts on partner_private.claim_free_activation_receipts
  for all to identity_service using (true) with check (true);

create or replace function partner_private.clear_matching_claim_intake_root()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state in ('approved','rejected','withdrawn','revoked') then
    update partner_private.store_owner_intake_roots
      set active_kind='none', active_id=null, version=version+1, updated_at=statement_timestamp()
      where applicant_id=new.claimant_id and active_kind='claim' and active_id=new.claim_id;
  end if;
  return new;
end $$;
drop trigger if exists listing_claim_clear_matching_intake_root on partner_private.listing_claims;
create trigger listing_claim_clear_matching_intake_root
  after update of state on partner_private.listing_claims
  for each row execute function partner_private.clear_matching_claim_intake_root();

create or replace function app_public.public_listing_claim_status(p_claim_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); c partner_private.listing_claims%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='listing_claim_unavailable';
  end if;
  select * into c from partner_private.listing_claims
    where claimant_id=actor and (p_claim_id is null or claim_id=p_claim_id)
    order by created_at desc limit 1;
  if not found or not partner_private.claim_stage_allowed(c.store_id) then return null; end if;
  return jsonb_build_object('claimId',c.claim_id,'state',c.state,
    'exactStoreScope',(select slug from app_public.stores where id=c.store_id),
    'version',c.version);
end $$;

-- The sole normal-public start command.  It checks the server-owned Package
-- 10B capability before creating even the applicant root, and it reserves the
-- root before any claim row so a future add-store command shares this lock.
create or replace function app_public.public_listing_claim_command(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claimant();
  target_store_id uuid; root partner_private.store_owner_intake_roots%rowtype;
  claim partner_private.listing_claims%rowtype; prior partner_private.claim_command_receipts%rowtype;
  relationship text:=nullif(btrim(p_payload->>'relationship'),'');
  statement text:=nullif(btrim(p_payload->>'authorityStatement'),'');
  key text:=p_payload->>'idempotencyKey'; digest bytea;
begin
  if jsonb_typeof(p_payload)<>'object' or p_operation<>'start' then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  begin target_store_id:=(p_payload->>'storeId')::uuid; exception when others then
    raise exception using errcode='42501', message='listing_claim_unavailable'; end;
  if relationship is null or statement is null or key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  -- Never trust the route, selected label, or a client capability.  This is
  -- intentionally before root creation to make stage-off writes side-effect free.
  if not partner_private.claim_stage_allowed(target_store_id)
    or not exists(select 1 from app_public.stores where id=target_store_id and not synthetic and publication_state='active') then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  digest:=extensions.digest(convert_to(concat_ws('|','public-start',actor,target_store_id,relationship,statement),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'start' or prior.input_digest<>digest then
      raise exception using errcode='42501', message='listing_claim_unavailable';
    end if;
    return app_public.public_listing_claim_status(prior.claim_id);
  end if;
  insert into partner_private.store_owner_intake_roots(applicant_id)
    values(actor) on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  if exists(select 1 from app_private.role_grants where subject_user_id=actor and role='representative' and state='active') then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  if root.active_kind='claim' then
    select * into claim from partner_private.listing_claims where claim_id=root.active_id and claimant_id=actor for update;
    if found then return app_public.public_listing_claim_status(claim.claim_id); end if;
    raise exception using errcode='42501', message='listing_claim_unavailable';
  elsif root.active_kind<>'none' then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||target_store_id,0));
  if exists(select 1 from partner_private.store_partner_grants as grant_row where grant_row.store_id=target_store_id and grant_row.state='active') then
    raise exception using errcode='42501', message='listing_claim_unavailable';
  end if;
  insert into partner_private.listing_claims(claimant_id,store_id,relationship,authority_statement)
    values(actor,target_store_id,relationship,statement) returning * into claim;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,to_state,idempotency_key)
    values(claim.claim_id,actor,'created','draft',key);
  update partner_private.listing_claims
    set state='submitted',version=version+1,updated_at=statement_timestamp()
    where claim_id=claim.claim_id returning * into claim;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(claim.claim_id,actor,'submitted','draft','submitted',encode(digest,'hex')||':submitted');
  update partner_private.store_owner_intake_roots set active_kind='claim', active_id=claim.claim_id,
    version=version+1, updated_at=statement_timestamp() where applicant_id=actor;
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(key,'start',claim.claim_id,actor,digest,claim.state);
  return app_public.public_listing_claim_status(claim.claim_id);
end $$;

-- The Edge Function reduces a transient authority reference to an independent
-- purpose-keyed HMAC before it reaches this command.  The database retains no
-- raw evidence, and only the Administrator can verify the submitted signal.
create or replace function app_public.public_listing_claim_signal_command(
  p_claim_id uuid,p_channel_class text,p_evidence_ref_hmac bytea,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; signal_type text; digest bytea;
begin
  if p_claim_id is null or p_channel_class not in ('published_business_contact','callback','mailed_code','filing_lookup','in_person')
    or octet_length(p_evidence_ref_hmac)<>32 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='42501',message='listing_claim_unavailable';
  end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor;
  if not found or not partner_private.claim_stage_allowed(c.store_id) then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(actor) on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor for update;
  if root.active_kind<>'claim' or root.active_id<>c.claim_id or c.state not in ('submitted','verification_pending') then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  signal_type:=case p_channel_class when 'published_business_contact' then 'domain_response' when 'callback' then 'callback'
    when 'mailed_code' then 'mailed_code' when 'filing_lookup' then 'filing_lookup' else 'in_person_inspection' end;
  digest:=extensions.digest(convert_to(concat_ws('|','public-signal',actor,p_claim_id,p_channel_class,encode(p_evidence_ref_hmac,'hex')),'utf8'),'sha256');
  if exists(select 1 from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key) then
    return app_public.public_listing_claim_status(p_claim_id);
  end if;
  insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,evidence_ref_hmac)
    values(c.claim_id,p_channel_class,signal_type,'submitted',p_evidence_ref_hmac);
  if c.state='submitted' then
    update partner_private.listing_claims set state='verification_pending' where claim_id=c.claim_id;
  end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(c.claim_id,actor,'signal_submitted',c.state,case when c.state='submitted' then 'verification_pending' else c.state end,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,'submit',c.claim_id,actor,digest,'verification_pending');
  return app_public.public_listing_claim_status(c.claim_id);
end $$;

-- Preserve the established Administrator signal command while extending its
-- verifier to the staged public-claim shape. Public verification still fails
-- closed unless the server-owned claim capability is active for the store.
create or replace function partner_private.verify_synthetic_claim_signal(
  p_signal_id uuid,
  p_verifier_user_id uuid,
  p_authority_object_hmac bytea,
  p_verification_event_id uuid,
  p_decision text
) returns void
language plpgsql volatile security definer set search_path='' as $$
declare
  s partner_private.claim_authority_signals%rowtype;
  c partner_private.listing_claims%rowtype;
begin
  select lc.* into c
  from partner_private.claim_authority_signals sig
  join partner_private.listing_claims lc using(claim_id)
  where sig.signal_id=p_signal_id;
  if not found then
    raise exception using errcode='42501',message='partner_signal_verification_denied';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=c.claim_id for update;
  select * into s from partner_private.claim_authority_signals where signal_id=p_signal_id for update;
  if s.signal_id is null or s.status<>'submitted' or p_decision not in ('verified','rejected')
    or p_verifier_user_id=c.claimant_id or octet_length(p_authority_object_hmac)<>32
    or p_verification_event_id is null
    or not exists(
      select 1 from app_private.role_grants
      where subject_user_id=p_verifier_user_id and role='administrator'
        and store_id is null and state='active'
    )
    or not exists(
      select 1 from app_public.stores
      where id=c.store_id and (
        synthetic or (
          not synthetic and publication_state='active'
          and partner_private.claim_stage_allowed(c.store_id)
        )
      )
    )
  then
    raise exception using errcode='42501',message='partner_signal_verification_denied';
  end if;
  update partner_private.claim_authority_signals
  set status=p_decision,
      verified_by=case when p_decision='verified' then p_verifier_user_id else null end,
      verified_at=case when p_decision='verified' then statement_timestamp() else null end,
      authority_object_hmac=case when p_decision='verified' then p_authority_object_hmac else null end,
      verification_event_id=case when p_decision='verified' then p_verification_event_id else null end
  where signal_id=p_signal_id;
  insert into partner_private.claim_events(
    claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key
  ) values(
    c.claim_id,p_verifier_user_id,
    case when p_decision='verified' then 'signal_verified' else 'signal_rejected' end,
    c.state,c.state,'verify-'||p_verification_event_id
  );
end $$;

-- The older command remains the Synthetic-only harness seam.  Making that
-- distinction here closes the historical authenticated-RPC bypass for a real
-- listing while giving Synthetic claim and future add starts the same root.
create or replace function app_public.partner_start_claim(
  p_store_id uuid,p_relationship text,p_authority_statement text,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; d bytea;
  prior partner_private.claim_command_receipts%rowtype;
begin
  if p_store_id is null or nullif(btrim(p_relationship),'') is null
    or nullif(btrim(p_authority_statement),'') is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not exists(select 1 from app_public.stores where id=p_store_id and synthetic) then
    raise exception using errcode='42501',message='listing_claim_unavailable';
  end if;
  d:=extensions.digest(convert_to(concat_ws('|','start',actor,p_store_id,btrim(p_relationship),btrim(p_authority_statement)),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>'start' or prior.input_digest<>d then
      raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
    return app_public.partner_claim_status(prior.claim_id);
  end if;
  if not partner_private.claim_stage_allowed(p_store_id) then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(actor)
    on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  if exists(select 1 from app_private.role_grants where subject_user_id=actor and role='representative' and state='active')
    or root.active_kind='add' then raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  if root.active_kind='claim' then
    select * into c from partner_private.listing_claims where claim_id=root.active_id and claimant_id=actor for update;
    if found then return app_public.partner_claim_status(c.claim_id); end if;
    raise exception using errcode='42501',message='listing_claim_unavailable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||p_store_id,0));
  insert into partner_private.listing_claims(claimant_id,store_id,relationship,authority_statement)
    values(actor,p_store_id,btrim(p_relationship),btrim(p_authority_statement)) returning * into c;
  update partner_private.store_owner_intake_roots set active_kind='claim',active_id=c.claim_id,
    version=version+1,updated_at=statement_timestamp() where applicant_id=actor;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,to_state,idempotency_key)
    values(c.claim_id,actor,'created','draft',p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,'start',c.claim_id,actor,d,c.state);
  return app_public.partner_claim_status(c.claim_id);
end $$;

-- Approval is reimplemented with the public-account branch and the mandated
-- lock order.  All mutations remain one transaction; any raised denial rolls
-- back the claim, both grants, Free tier, receipt, event, and root clear.
create or replace function partner_private.approve_exact_claim(p_claim_id uuid,p_actor uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare
  c partner_private.listing_claims%rowtype; root partner_private.store_owner_intake_roots%rowtype;
  pid uuid; consent uuid; partnership uuid; is_public boolean; tier_row partner_private.store_photo_tier_state%rowtype;
begin
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found then raise exception using errcode='42501',message='partner_claim_approval_denied'; end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(c.claimant_id)
    on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=c.claimant_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  perform 1 from partner_private.claim_authority_signals where claim_id=p_claim_id for update;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  perform 1 from partner_private.store_partner_grants where store_id=c.store_id for update;
  select * into tier_row from partner_private.store_photo_tier_state where store_id=c.store_id for update;
  select not synthetic into is_public from app_public.stores where id=c.store_id;
  if c.state<>'verification_pending' or c.claimant_id=p_actor
    or root.active_kind<>'claim' or root.active_id<>c.claim_id
    or exists(select 1 from partner_private.claim_conflicts where claim_id=c.claim_id and state='open')
    or exists(select 1 from partner_private.store_partner_grants where store_id=c.store_id and state='active')
    or not partner_private.claim_stage_allowed(c.store_id)
    or (select count(distinct channel_class) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2
    or not exists(select 1 from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified' and channel_class='published_business_contact')
    or (select count(distinct authority_object_hmac) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2
    or (select count(distinct verification_event_id) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2 then
    raise exception using errcode='42501',message='partner_claim_approval_denied';
  end if;
  if not is_public then
    select p.pending_identity_id,r.consent_receipt_id into pid,consent
      from partner_private.pending_partner_identities p join partner_private.pilot_consent_receipts r using(pending_identity_id)
      where p.auth_user_id=c.claimant_id and p.state='bound' order by p.bound_at desc limit 1;
    if pid is null then raise exception using errcode='42501',message='partner_bound_identity_required'; end if;
  end if;
  insert into partner_private.store_partnerships(pending_identity_id,auth_user_id,store_id,consent_receipt_id,intake_kind,state,started_at)
    values(pid,c.claimant_id,c.store_id,consent,case when is_public then 'public_claim' else 'pilot' end,'active',statement_timestamp())
    returning partnership_id into partnership;
  update partner_private.listing_claims set state='approved',assigned_admin_id=p_actor,approved_by=p_actor,approved_at=statement_timestamp()
    where claim_id=c.claim_id;
  insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id)
    values(partnership,c.claimant_id,c.store_id);
  insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by)
    values(c.claimant_id,'representative',c.store_id,'active',p_actor);
  if tier_row.store_id is null then
    insert into partner_private.store_photo_tier_state(store_id,tier,source) values(c.store_id,'free','default');
  elsif tier_row.tier<>'free' or tier_row.source<>'default' then
    raise exception using errcode='42501',message='partner_claim_approval_denied';
  end if;
  insert into partner_private.claim_free_activation_receipts(claim_id,applicant_id,store_id,tier,granted_by)
    values(c.claim_id,c.claimant_id,c.store_id,'free',p_actor);
end $$;

create or replace function app_public.partner_admin_claim_command(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
  old partner_private.listing_claims%rowtype; root partner_private.store_owner_intake_roots%rowtype;
  prior partner_private.claim_command_receipts%rowtype; d bytea; prior_state text;
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
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,'administrator','partner_claim_'||p_operation,'completed','listing_claim',c.claim_id,p_reason_code,d,decode(repeat('00',32),'hex'));
  return app_public.partner_admin_claim_case(c.claim_id);
end $$;

alter function partner_private.clear_matching_claim_intake_root() owner to identity_service;
alter function app_public.public_listing_claim_status(uuid) owner to identity_service;
alter function app_public.public_listing_claim_command(text,jsonb) owner to identity_service;
alter function app_public.public_listing_claim_signal_command(uuid,text,bytea,text) owner to identity_service;
alter function app_public.partner_start_claim(uuid,text,text,text) owner to identity_service;
alter function partner_private.approve_exact_claim(uuid,uuid) owner to identity_service;
alter function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid) owner to identity_service;
revoke all on function partner_private.clear_matching_claim_intake_root(),app_public.public_listing_claim_status(uuid),app_public.public_listing_claim_command(text,jsonb),app_public.public_listing_claim_signal_command(uuid,text,bytea,text) from public,anon;
grant execute on function app_public.public_listing_claim_status(uuid),app_public.public_listing_claim_command(text,jsonb),app_public.public_listing_claim_signal_command(uuid,text,bytea,text) to authenticated;
revoke create on schema app_public, partner_private from identity_service;
revoke identity_service from postgres;
