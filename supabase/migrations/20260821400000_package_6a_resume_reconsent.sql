-- Package 6A completion: interruption-safe invitation exchange, idempotent
-- consent receipts, and versioned material-term reconsent.

grant identity_service to postgres;
grant create on schema partner_private,app_public to identity_service;

create table partner_private.partner_invitation_resumes(
  resume_id uuid primary key default extensions.gen_random_uuid(),
  invitation_id uuid not null references partner_private.partner_invitations(invitation_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  handle_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_consent_receipt_id uuid references partner_private.pilot_consent_receipts(consent_receipt_id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  last_used_at timestamptz not null default statement_timestamp(),
  constraint partner_resume_hash_size check(octet_length(handle_hash)=32),
  constraint partner_resume_expiry_bound check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  unique(invitation_id,actor_user_id)
);

create table partner_private.partner_onboarding_command_receipts(
  command_receipt_id uuid primary key default extensions.gen_random_uuid(),
  resume_id uuid not null references partner_private.partner_invitation_resumes(resume_id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  operation text not null check(operation='accept_consent'),
  input_digest bytea not null,
  consent_receipt_id uuid not null references partner_private.pilot_consent_receipts(consent_receipt_id) on delete restrict,
  result jsonb not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint partner_onboarding_key_safe check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint partner_onboarding_digest_size check(octet_length(input_digest)=32),
  constraint partner_onboarding_result_object check(jsonb_typeof(result)='object'),
  unique(resume_id,idempotency_key)
);

create table partner_private.partner_material_terms(
  policy_version text primary key,
  terms jsonb not null,
  is_current boolean not null default false,
  published_at timestamptz not null default statement_timestamp(),
  constraint partner_material_policy_safe check(policy_version~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  constraint partner_material_terms_array check(jsonb_typeof(terms)='array' and jsonb_array_length(terms)>0)
);
create unique index one_current_partner_material_terms on partner_private.partner_material_terms(is_current) where is_current;

create table partner_private.partner_reconsent_receipts(
  reconsent_receipt_id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  prior_consent_receipt_id uuid not null references partner_private.pilot_consent_receipts(consent_receipt_id) on delete restrict,
  policy_version text not null references partner_private.partner_material_terms(policy_version) on delete restrict,
  reviewed_ack boolean not null,
  voluntary_ack boolean not null,
  idempotency_key text not null unique,
  receipt_checksum bytea not null,
  accepted_at timestamptz not null default statement_timestamp(),
  constraint partner_reconsent_acknowledgements check(reviewed_ack and voluntary_ack),
  constraint partner_reconsent_key_safe check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint partner_reconsent_checksum_size check(octet_length(receipt_checksum)=32),
  unique(auth_user_id,policy_version)
);

do $$ declare t text; begin
  foreach t in array array['partner_invitation_resumes','partner_onboarding_command_receipts','partner_material_terms','partner_reconsent_receipts'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on partner_private.%I to identity_service',t);
    execute format('create policy identity_service_%I on partner_private.%I for all to identity_service using(true) with check(true)',t,t);
  end loop;
end $$;
revoke update,delete,truncate on partner_private.partner_onboarding_command_receipts,partner_private.partner_reconsent_receipts from identity_service;
create trigger partner_onboarding_receipts_append_only before update or delete on partner_private.partner_onboarding_command_receipts for each row execute function partner_private.reject_append_only_mutation();
create trigger partner_reconsent_receipts_append_only before update or delete on partner_private.partner_reconsent_receipts for each row execute function partner_private.reject_append_only_mutation();

insert into partner_private.partner_material_terms(policy_version,terms,is_current)
values('synthetic-v3','["Store data is limited to the approved pilot purpose.","Participation remains voluntary, unpaid, non-endorsing, and withdrawable."]'::jsonb,true);

create or replace function partner_private.guard_material_term_history()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.policy_version is distinct from new.policy_version
    or old.terms is distinct from new.terms or old.published_at is distinct from new.published_at
    or not (old.is_current and not new.is_current)
    then raise exception using errcode='55000',message='partner_material_terms_append_only'; end if;
  return new;
end $$;
alter function partner_private.guard_material_term_history() owner to identity_service;
create trigger partner_material_terms_history before update or delete on partner_private.partner_material_terms for each row execute function partner_private.guard_material_term_history();

alter table partner_private.listing_claims add column material_reconsent_required boolean not null default false;
alter table partner_private.store_partnerships add column consent_policy_version text;
alter table partner_private.store_partner_grants add column consent_policy_version text;

alter table partner_private.store_partnerships drop constraint store_partnerships_state_check;
alter table partner_private.store_partnerships add constraint store_partnerships_state_check check(state in ('pending','active','reconsent_required','withdrawn','revoked'));
alter table partner_private.store_partnerships drop constraint partnership_state_shape;
alter table partner_private.store_partnerships add constraint partnership_state_shape check(
  (state='pending' and started_at is null and ended_at is null)
  or (state in ('active','reconsent_required') and started_at is not null and ended_at is null)
  or (state in ('withdrawn','revoked') and ended_at is not null));
drop index partner_private.store_partnership_active_store_idx;
drop index partner_private.store_partnership_active_user_store_idx;
create unique index store_partnership_live_store_idx on partner_private.store_partnerships(store_id) where state in ('active','reconsent_required');
create unique index store_partnership_live_user_store_idx on partner_private.store_partnerships(auth_user_id,store_id) where state in ('active','reconsent_required');
alter table partner_private.store_partner_grants drop constraint store_partner_grants_state_check;
alter table partner_private.store_partner_grants add constraint store_partner_grants_state_check check(state in ('active','reconsent_required','revoked','expired'));
alter table partner_private.store_partner_grants drop constraint partner_grant_state_shape;
alter table partner_private.store_partner_grants add constraint partner_grant_state_shape check(
  (state in ('active','reconsent_required') and revoked_at is null and revoked_by is null)
  or (state in ('revoked','expired') and revoked_at is not null));
drop index partner_private.partner_grant_active_store_idx;
drop index partner_private.partner_grant_active_user_store_idx;
create unique index partner_grant_live_store_idx on partner_private.store_partner_grants(store_id) where state in ('active','reconsent_required');
create unique index partner_grant_live_user_store_idx on partner_private.store_partner_grants(auth_user_id,store_id) where state in ('active','reconsent_required');

update partner_private.listing_claims set material_reconsent_required=true
where state in ('draft','submitted','verification_pending','changes_requested','conflict','approved')
  and not exists(select 1 from partner_private.pilot_consent_receipts r where r.auth_user_id=listing_claims.claimant_id and r.policy_version='synthetic-v3');
update partner_private.store_partnerships p set state='reconsent_required',consent_policy_version='synthetic-v3'
where state='active' and not exists(select 1 from partner_private.pilot_consent_receipts r where r.auth_user_id=p.auth_user_id and r.policy_version='synthetic-v3');
update partner_private.store_partner_grants g set state='reconsent_required',consent_policy_version='synthetic-v3'
where state='active' and not exists(select 1 from partner_private.pilot_consent_receipts r where r.auth_user_id=g.auth_user_id and r.policy_version='synthetic-v3');

create or replace function partner_private.partner_accepted_consent_version(target_user uuid)
returns text language sql stable security definer set search_path='' as $$
  select coalesce(
    (select r.policy_version from partner_private.partner_reconsent_receipts r where r.auth_user_id=target_user order by r.accepted_at desc limit 1),
    (select r.policy_version from partner_private.pilot_consent_receipts r where r.auth_user_id=target_user order by r.finalized_at desc limit 1));
$$;
alter function partner_private.partner_accepted_consent_version(uuid) owner to identity_service;

create or replace function partner_private.partner_consent_is_current(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select partner_private.partner_accepted_consent_version(target_user) is not distinct from
    (select t.policy_version from partner_private.partner_material_terms t where t.is_current);
$$;
alter function partner_private.partner_consent_is_current(uuid) owner to identity_service;

create or replace function partner_private.partner_consent_status(target_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'requiredVersion',t.policy_version,
    'acceptedVersion',partner_private.partner_accepted_consent_version(target_user),
    'reconsentRequired',partner_private.partner_accepted_consent_version(target_user) is distinct from t.policy_version,
    'materialTerms',t.terms)
  from partner_private.partner_material_terms t where t.is_current;
$$;
alter function partner_private.partner_consent_status(uuid) owner to identity_service;

create or replace function app_public.publish_partner_material_terms(p_policy_version text,p_terms jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  if actor is null or not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    or jsonb_typeof(p_terms)<>'array' or jsonb_array_length(p_terms)=0
    then raise exception using errcode='42501',message='partner_material_terms_denied'; end if;
  update partner_private.partner_material_terms set is_current=false where is_current;
  insert into partner_private.partner_material_terms(policy_version,terms,is_current) values(p_policy_version,p_terms,true);
  update partner_private.listing_claims set material_reconsent_required=true
    where state in ('draft','submitted','verification_pending','changes_requested','conflict','approved');
  update partner_private.store_partnerships set state='reconsent_required',consent_policy_version=p_policy_version where state='active';
  update partner_private.store_partner_grants set state='reconsent_required',consent_policy_version=p_policy_version where state='active';
  return jsonb_build_object('policyVersion',p_policy_version,'publishedAt',statement_timestamp());
end $$;
alter function app_public.publish_partner_material_terms(text,jsonb) owner to identity_service;
revoke all on function app_public.publish_partner_material_terms(text,jsonb) from public,anon;
grant execute on function app_public.publish_partner_material_terms(text,jsonb) to authenticated;

create or replace function app_public.partner_consent_command(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); current_version text; prior_receipt uuid; prior partner_private.partner_reconsent_receipts%rowtype; digest bytea;
begin
  if actor is null or not app_private.current_session_is_active()
    or not exists(select 1 from partner_private.pending_partner_identities p where p.auth_user_id=actor and p.state='bound')
    then raise exception using errcode='42501',message='partner_consent_unavailable'; end if;
  if p_operation='get_consent_status' then return partner_private.partner_consent_status(actor); end if;
  if p_operation<>'accept_material_terms' or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_payload->>'policyVersion' is null
    or p_payload->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not coalesce((p_payload->'acknowledgements'->>'reviewed')::boolean,false)
    or not coalesce((p_payload->'acknowledgements'->>'voluntary')::boolean,false)
    then raise exception using errcode='42501',message='partner_reconsent_denied'; end if;
  select policy_version into current_version from partner_private.partner_material_terms where is_current;
  if p_payload->>'policyVersion' is distinct from current_version then raise exception using errcode='40001',message='partner_terms_changed'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',actor,current_version,'reviewed','voluntary'),'utf8'),'sha256');
  select * into prior from partner_private.partner_reconsent_receipts where idempotency_key=p_payload->>'idempotencyKey';
  if found then
    if prior.auth_user_id<>actor or prior.policy_version<>current_version or prior.receipt_checksum<>digest then raise exception using errcode='22023',message='partner_reconsent_idempotency_mismatch'; end if;
    return partner_private.partner_consent_status(actor);
  end if;
  select consent_receipt_id into prior_receipt from partner_private.pilot_consent_receipts where auth_user_id=actor order by finalized_at desc limit 1;
  if prior_receipt is null then raise exception using errcode='42501',message='partner_reconsent_denied'; end if;
  insert into partner_private.partner_reconsent_receipts(auth_user_id,prior_consent_receipt_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum)
    values(actor,prior_receipt,current_version,true,true,p_payload->>'idempotencyKey',digest)
    on conflict(auth_user_id,policy_version) do nothing;
  update partner_private.listing_claims set material_reconsent_required=false where claimant_id=actor;
  update partner_private.store_partnerships set state='active',consent_policy_version=current_version where auth_user_id=actor and state='reconsent_required';
  update partner_private.store_partner_grants set state='active',consent_policy_version=current_version where auth_user_id=actor and state='reconsent_required';
  return partner_private.partner_consent_status(actor);
end $$;
alter function app_public.partner_consent_command(text,jsonb) owner to identity_service;
revoke all on function app_public.partner_consent_command(text,jsonb) from public,anon;
grant execute on function app_public.partner_consent_command(text,jsonb) to authenticated;

create or replace function partner_private.guard_current_partner_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid:=case tg_table_name when 'listing_claims' then new.claimant_id else new.auth_user_id end;
begin
  if tg_table_name='listing_claims' and tg_op='UPDATE' and not old.material_reconsent_required
    and new.material_reconsent_required and new.state=old.state then return new; end if;
  if ((tg_table_name='listing_claims' and new.state in ('submitted','verification_pending','changes_requested','conflict','approved'))
      or (tg_table_name<>'listing_claims' and new.state='active'))
    and (not partner_private.partner_consent_is_current(target_user)
      or (tg_table_name='listing_claims' and new.material_reconsent_required))
    then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
  return new;
end $$;
alter function partner_private.guard_current_partner_consent() owner to identity_service;
create trigger listing_claim_current_consent before insert or update on partner_private.listing_claims for each row execute function partner_private.guard_current_partner_consent();
create trigger partnership_current_consent before insert or update on partner_private.store_partnerships for each row execute function partner_private.guard_current_partner_consent();
create trigger partner_grant_current_consent before insert or update on partner_private.store_partner_grants for each row execute function partner_private.guard_current_partner_consent();

create or replace function partner_private.guard_claim_signal_current_consent()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from partner_private.listing_claims c where c.claim_id=new.claim_id
    and not c.material_reconsent_required and partner_private.partner_consent_is_current(c.claimant_id))
    then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
  return new;
end $$;
alter function partner_private.guard_claim_signal_current_consent() owner to identity_service;
create trigger claim_signal_current_consent before insert or update on partner_private.claim_authority_signals for each row execute function partner_private.guard_claim_signal_current_consent();

create or replace function partner_private.require_claimant() returns uuid
language plpgsql stable security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); begin
  if actor is null or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active' and p.verified_email_snapshot is not null)
    or not partner_private.partner_consent_is_current(actor) then
    raise exception using errcode='42501',message='partner_claimant_verification_required'; end if; return actor;
end $$;
alter function partner_private.require_claimant() owner to identity_service;

create or replace function app_public.partner_synthetic_command(p_operation text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); token text:=p_payload->>'token'; resume_handle text:=p_payload->>'resumeHandle'; token_digest bytea; handle_digest bytea;
  supplied_email_hmac bytea; inv partner_private.partner_invitations%rowtype; resume partner_private.partner_invitation_resumes%rowtype;
  identity_input jsonb:=p_payload->'identity'; signal_input jsonb:=p_payload->'input'; pending_id uuid; consent_id uuid; receipt_id uuid;
  signal_id uuid; claim_row partner_private.listing_claims%rowtype; existing partner_private.pending_partner_identities%rowtype;
  prior partner_private.partner_onboarding_command_receipts%rowtype; input_digest bytea; result jsonb; raw_handle bytea;
begin
  if actor is null or not app_private.current_session_is_active() or p_payload->>'synthetic' is distinct from 'true'
    or not exists(select 1 from app_private.environment_stage where id=1 and stage='synthetic_alpha') then raise exception using errcode='42501',message='partner_synthetic_denied'; end if;
  if p_operation='exchange_invitation' then
    if token !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    token_digest:=extensions.digest(decode(token,'hex'),'sha256');
    select * into inv from partner_private.partner_invitations where token_hash=token_digest and synthetic and state='active' and expires_at>statement_timestamp() for update;
    if not found then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    raw_handle:=extensions.gen_random_bytes(32);
    insert into partner_private.partner_invitation_resumes(invitation_id,actor_user_id,handle_hash,expires_at)
      values(inv.invitation_id,actor,extensions.digest(raw_handle,'sha256'),least(inv.expires_at,statement_timestamp()+interval '30 minutes'))
      on conflict(invitation_id,actor_user_id) do update set handle_hash=excluded.handle_hash,expires_at=excluded.expires_at,last_used_at=statement_timestamp()
      returning * into resume;
    return jsonb_build_object('state','active','maskedRecipient','Synthetic test identity','resumeHandle',encode(raw_handle,'hex'),'expiresAt',resume.expires_at);
  elsif p_operation in ('resume_invitation','accept_consent') then
    if resume_handle !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    handle_digest:=extensions.digest(decode(resume_handle,'hex'),'sha256');
    select r.* into resume from partner_private.partner_invitation_resumes r where r.handle_hash=handle_digest and r.actor_user_id=actor and r.expires_at>statement_timestamp() for update;
    if not found then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    select * into inv from partner_private.partner_invitations where invitation_id=resume.invitation_id for update;
    update partner_private.partner_invitation_resumes set last_used_at=statement_timestamp() where resume_id=resume.resume_id;
    if p_operation='resume_invitation' then return jsonb_build_object('state',inv.state,'expiresAt',resume.expires_at,
      'consentReceiptId',resume.accepted_consent_receipt_id); end if;
  end if;
  if p_operation='accept_consent' then
    if p_payload->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    input_digest:=extensions.digest(convert_to((p_payload-'resumeHandle'-'synthetic')::text,'utf8'),'sha256');
    select * into prior from partner_private.partner_onboarding_command_receipts where resume_id=resume.resume_id and idempotency_key=p_payload->>'idempotencyKey';
    if found then
      if prior.actor_user_id<>actor or prior.input_digest<>input_digest then raise exception using errcode='22023',message='partner_consent_idempotency_mismatch'; end if;
      return prior.result;
    end if;
    if inv.state<>'active' or inv.expires_at<=statement_timestamp() or resume.accepted_consent_receipt_id is not null
      or p_payload->>'emailHmac' !~ '^[0-9a-f]{64}$' or jsonb_typeof(identity_input)<>'object'
      or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
      or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active'
        and p.verified_email_snapshot=lower(btrim(identity_input->>'email')))
      or not coalesce((p_payload->'acknowledgements'->>'authority')::boolean,false) or not coalesce((p_payload->'acknowledgements'->>'voluntary')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'permittedData')::boolean,false) or not coalesce((p_payload->'acknowledgements'->>'noPayment')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'withdrawal')::boolean,false) then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    supplied_email_hmac:=decode(p_payload->>'emailHmac','hex'); if supplied_email_hmac<>inv.recipient_email_hmac then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    update partner_private.partner_invitations set state='consumed',consumed_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp() where invitation_id=inv.invitation_id;
    insert into partner_private.pending_partner_identities(invitation_id,email_hmac,hmac_key_version,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
      values(inv.invitation_id,supplied_email_hmac,inv.hmac_key_version,actor,'bound',statement_timestamp(),statement_timestamp(),statement_timestamp()) returning pending_identity_id into pending_id;
    insert into partner_private.provisional_partner_consents(invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
      values(inv.invitation_id,pending_id,'synthetic-v3',btrim(identity_input->>'name'),btrim(identity_input->>'title'),btrim(identity_input->>'store'),supplied_email_hmac,true,true,true,true,true,p_payload->>'idempotencyKey') returning provisional_consent_id into consent_id;
    insert into partner_private.pilot_consent_receipts(provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
      values(consent_id,pending_id,inv.invitation_id,actor,supplied_email_hmac,'synthetic-v3',extensions.digest(convert_to(consent_id::text,'utf8'),'sha256')) returning consent_receipt_id into receipt_id;
    result:=jsonb_build_object('invitation','consumed','pendingIdentity','bound','onboarding','draft','consentReceiptId',receipt_id,'consentPolicyVersion','synthetic-v3');
    update partner_private.partner_invitation_resumes set accepted_consent_receipt_id=receipt_id where resume_id=resume.resume_id;
    insert into partner_private.partner_onboarding_command_receipts(resume_id,actor_user_id,idempotency_key,operation,input_digest,consent_receipt_id,result)
      values(resume.resume_id,actor,p_payload->>'idempotencyKey','accept_consent',input_digest,receipt_id,result);
    return result;
  elsif p_operation='bind_identity' then
    select * into existing from partner_private.pending_partner_identities where auth_user_id=actor and state='bound';
    if not found or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes') then raise exception using errcode='55000',message='partner_identity_unavailable'; end if;
    return jsonb_build_object('invitation','consumed','pendingIdentity','bound','onboarding','draft');
  elsif p_operation='submit_authority_signal' then
    if not partner_private.partner_consent_is_current(actor) or jsonb_typeof(signal_input)<>'object' or signal_input->>'claimId' is null or signal_input->>'channelClass' not in ('published_business_contact','callback','mailed_code','filing_lookup','in_person') or signal_input->>'evidenceRefHmac' !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='partner_synthetic_signal_denied'; end if;
    signal_id:=partner_private.record_synthetic_claim_signal((signal_input->>'claimId')::uuid,signal_input->>'channelClass',case signal_input->>'channelClass' when 'published_business_contact' then 'domain_response' when 'callback' then 'callback' when 'mailed_code' then 'mailed_code' when 'filing_lookup' then 'filing_lookup' else 'in_person_inspection' end,decode(signal_input->>'evidenceRefHmac','hex'));
    return app_public.partner_claim_status((signal_input->>'claimId')::uuid);
  elsif p_operation='request_authority_recheck' then
    if not partner_private.partner_consent_is_current(actor) then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
    select * into claim_row from partner_private.listing_claims where claim_id=(p_payload->>'claimId')::uuid and claimant_id=actor;
    if not found then raise exception using errcode='55000',message='partner_claim_unavailable'; end if;
    return app_public.partner_claimant_claim_command('recheck',claim_row.claim_id,claim_row.version,'synthetic-recheck-'||claim_row.claim_id||'-v'||claim_row.version);
  else raise exception using errcode='22023',message='partner_synthetic_operation_denied'; end if;
exception when invalid_text_representation then raise exception using errcode='22023',message='partner_invitation_unavailable';
end $$;
alter function app_public.partner_synthetic_command(text,jsonb) owner to identity_service;

revoke all on function partner_private.partner_accepted_consent_version(uuid),partner_private.partner_consent_is_current(uuid),partner_private.partner_consent_status(uuid),partner_private.guard_current_partner_consent(),partner_private.guard_claim_signal_current_consent(),partner_private.guard_material_term_history() from public,anon,authenticated;

revoke create on schema partner_private,app_public from identity_service;
revoke identity_service from postgres;
