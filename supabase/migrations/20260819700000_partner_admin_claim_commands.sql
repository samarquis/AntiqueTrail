-- Package 6A completion: bounded Synthetic invitations, operational authority
-- signals, and exact-store claimant/Administrator commands. Real claims remain
-- governed by the Package 10B release capability.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='partner_authority_service') then
    create role partner_authority_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

grant identity_service to postgres;
grant create on schema partner_private,app_public to identity_service;
grant usage on schema partner_private to partner_authority_service;
grant update on app_private.role_grants to identity_service;

alter table partner_private.partner_invitations
  add column if not exists synthetic boolean not null default false,
  add column if not exists issuance_idempotency_key text,
  add column if not exists raw_returned_at timestamptz;
alter table partner_private.partner_invitations
  add constraint partner_invitation_issuance_key_safe check(issuance_idempotency_key is null or issuance_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  add constraint partner_synthetic_invitation_shape check(not synthetic or (issuance_idempotency_key is not null and raw_returned_at is not null and expires_at<=created_at+interval '30 minutes'));
create unique index partner_invitation_issuance_key_unique on partner_private.partner_invitations(issuance_idempotency_key) where issuance_idempotency_key is not null;

create table partner_private.claim_command_receipts (
  command_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique check(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  operation text not null check(operation in ('start','submit','withdraw','recheck','changes','conflict','approve','reject','revoke','transfer')),
  claim_id uuid not null references partner_private.listing_claims(claim_id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  input_digest bytea not null check(octet_length(input_digest)=32),
  result_state text not null,
  created_at timestamptz not null default statement_timestamp()
);
alter table partner_private.claim_command_receipts enable row level security;
alter table partner_private.claim_command_receipts force row level security;
revoke all on partner_private.claim_command_receipts from public,anon,authenticated;
grant select,insert on partner_private.claim_command_receipts to identity_service;
create policy identity_service_claim_commands on partner_private.claim_command_receipts for all to identity_service using(true) with check(true);
create trigger claim_command_receipts_append_only before update or delete on partner_private.claim_command_receipts for each row execute function partner_private.reject_append_only_mutation();

alter table partner_private.claim_events drop constraint if exists claim_events_event_kind_check;
alter table partner_private.claim_events add constraint claim_events_event_kind_check check(event_kind in ('created','submitted','signal_submitted','signal_verified','changes_requested','conflict_opened','approved','rejected','withdrawn','revoked','transferred','recheck_requested'));

create or replace function partner_private.claim_stage_allowed(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_public.stores s cross join app_private.environment_stage e
    where s.id=p_store_id and ((s.synthetic and e.id=1 and e.stage='synthetic_alpha')
      or (not s.synthetic and release_private.public_capability_enabled('claims'))))
$$;

create or replace function partner_private.require_claimant() returns uuid
language plpgsql stable security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); begin
  if actor is null or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or not exists(select 1 from app_private.profiles p where p.user_id=actor and p.status='active' and p.verified_email_snapshot is not null) then
    raise exception using errcode='42501',message='partner_claimant_verification_required'; end if; return actor;
end $$;

create or replace function partner_private.require_claim_admin() returns uuid
language plpgsql stable security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); begin
  if actor is null or not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='partner_administrator_required'; end if; return actor;
end $$;

create or replace function app_public.issue_synthetic_partner_invitation(p_recipient_email_hmac bytea,p_hmac_key_version smallint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); raw bytea:=extensions.gen_random_bytes(32); row partner_private.partner_invitations%rowtype;
begin
  if octet_length(p_recipient_email_hmac)<>32 or p_hmac_key_version<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not exists(select 1 from app_private.environment_stage where id=1 and stage='synthetic_alpha') then
    raise exception using errcode='22023',message='partner_synthetic_invitation_invalid'; end if;
  if exists(select 1 from partner_private.partner_invitations where issuance_idempotency_key=p_idempotency_key) then
    raise exception using errcode='55000',message='partner_invitation_raw_secret_not_replayable'; end if;
  insert into partner_private.partner_invitations(token_hash,recipient_email_hmac,hmac_key_version,created_by,expires_at,synthetic,issuance_idempotency_key,raw_returned_at)
    values(extensions.digest(raw,'sha256'),p_recipient_email_hmac,p_hmac_key_version,actor,statement_timestamp()+interval '30 minutes',true,p_idempotency_key,statement_timestamp()) returning * into row;
  return jsonb_build_object('invitationId',row.invitation_id,'token',encode(raw,'hex'),'expiresAt',row.expires_at);
end $$;

create or replace function partner_private.record_synthetic_claim_signal(p_claim_id uuid,p_channel_class text,p_signal_type text,p_evidence_ref_hmac bytea)
returns uuid language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); c partner_private.listing_claims%rowtype; sid uuid; begin
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found then raise exception using errcode='55000',message='partner_synthetic_signal_denied'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  if not found or actor is null or c.claimant_id<>actor or not partner_private.claim_stage_allowed(c.store_id) or not exists(select 1 from app_public.stores where id=c.store_id and synthetic)
    or c.state not in ('submitted','verification_pending') or octet_length(p_evidence_ref_hmac)<>32 then raise exception using errcode='55000',message='partner_synthetic_signal_denied'; end if;
  insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,evidence_ref_hmac)
    values(p_claim_id,p_channel_class,p_signal_type,'submitted',p_evidence_ref_hmac) returning signal_id into sid;
  if c.state='submitted' then update partner_private.listing_claims set state='verification_pending' where claim_id=p_claim_id; end if;
  insert into partner_private.claim_events(claim_id,event_kind,from_state,to_state,idempotency_key)
    values(p_claim_id,'signal_submitted',c.state,case when c.state='submitted' then 'verification_pending' else c.state end,'signal-'||sid);
  return sid;
end $$;

create or replace function partner_private.verify_synthetic_claim_signal(p_signal_id uuid,p_verifier_user_id uuid,p_authority_object_hmac bytea,p_verification_event_id uuid,p_decision text)
returns void language plpgsql volatile security definer set search_path='' as $$ declare s partner_private.claim_authority_signals%rowtype; c partner_private.listing_claims%rowtype; begin
  select lc.* into c from partner_private.claim_authority_signals sig join partner_private.listing_claims lc using(claim_id) where sig.signal_id=p_signal_id;
  if not found then raise exception using errcode='42501',message='partner_signal_verification_denied'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=c.claim_id for update;
  select * into s from partner_private.claim_authority_signals where signal_id=p_signal_id for update;
  if s.signal_id is null or s.status<>'submitted' or p_decision not in ('verified','rejected') or p_verifier_user_id=c.claimant_id
    or octet_length(p_authority_object_hmac)<>32 or p_verification_event_id is null
    or not exists(select 1 from app_private.role_grants where subject_user_id=p_verifier_user_id and role='administrator' and store_id is null and state='active')
    or not exists(select 1 from app_public.stores where id=c.store_id and synthetic) then raise exception using errcode='42501',message='partner_signal_verification_denied'; end if;
  update partner_private.claim_authority_signals set status=p_decision,verified_by=case when p_decision='verified' then p_verifier_user_id else null end,
    verified_at=case when p_decision='verified' then statement_timestamp() else null end,
    authority_object_hmac=case when p_decision='verified' then p_authority_object_hmac else null end,
    verification_event_id=case when p_decision='verified' then p_verification_event_id else null end where signal_id=p_signal_id;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(c.claim_id,p_verifier_user_id,'signal_verified',c.state,c.state,'verify-'||p_verification_event_id);
end $$;

create or replace function app_public.partner_start_claim(p_store_id uuid,p_relationship text,p_authority_statement text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype; d bytea; prior partner_private.claim_command_receipts%rowtype; begin
  if p_store_id is null or nullif(btrim(p_relationship),'') is null or nullif(btrim(p_authority_statement),'') is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='partner_claim_input_invalid'; end if;
  d:=extensions.digest(convert_to(concat_ws('|','start',actor,p_store_id,btrim(p_relationship),btrim(p_authority_statement)),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.operation<>'start' or prior.input_digest<>d then raise exception using errcode='22023',message='partner_claim_idempotency_mismatch'; end if; return app_public.partner_claim_status(prior.claim_id); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||p_store_id,0));
  if not partner_private.claim_stage_allowed(p_store_id) then raise exception using errcode='42501',message='listing_claim_release_disabled'; end if;
  insert into partner_private.listing_claims(claimant_id,store_id,relationship,authority_statement) values(actor,p_store_id,btrim(p_relationship),btrim(p_authority_statement)) returning * into c;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,to_state,idempotency_key) values(c.claim_id,actor,'created','draft',p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state) values(p_idempotency_key,'start',c.claim_id,actor,d,c.state);
  return app_public.partner_claim_status(c.claim_id);
end $$;

create or replace function app_public.partner_claim_status(p_claim_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$ declare actor uuid:=app_public.request_user_id(); c partner_private.listing_claims%rowtype; begin
  if actor is null or not app_private.current_session_is_active() then raise exception using errcode='42501',message='partner_auth_required'; end if;
  select * into c from partner_private.listing_claims where claimant_id=actor and (p_claim_id is null or claim_id=p_claim_id) order by created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('claimId',c.claim_id,'state',case c.state when 'submitted' then 'in_review' when 'verification_pending' then 'in_review' when 'conflict' then 'in_review' when 'rejected' then 'closed' when 'revoked' then 'closed' else c.state end,
    'riskTier',c.risk_tier,'verifiedSignalCount',(select count(*) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified'),'requiredSignalCount',2,
    'exactStoreScope',(select slug from app_public.stores where id=c.store_id),'version',c.version);
end $$;

create or replace function app_public.partner_claimant_claim_command(p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype; prior partner_private.claim_command_receipts%rowtype; d bytea; prior_state text; begin
  if p_operation not in ('submit','withdraw','recheck') or p_claim_id is null or p_expected_version<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='partner_claim_input_invalid'; end if;
  d:=extensions.digest(convert_to(concat_ws('|',p_operation,p_claim_id,p_expected_version,actor),'utf8'),'sha256'); select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.operation<>p_operation or prior.claim_id<>p_claim_id or prior.input_digest<>d then raise exception using errcode='22023',message='partner_claim_idempotency_mismatch'; end if; return app_public.partner_claim_status(p_claim_id); end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor;
  if not found then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor for update;
  if not found or c.version<>p_expected_version or not partner_private.claim_stage_allowed(c.store_id) then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  prior_state:=c.state;
  if p_operation='submit' and c.state in ('draft','changes_requested') then update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id=c.claim_id returning * into c;
  elsif p_operation='withdraw' and c.state in ('draft','submitted','verification_pending','changes_requested','conflict') then update partner_private.listing_claims set state='withdrawn' where claim_id=c.claim_id returning * into c;
  elsif p_operation='recheck' and c.state='approved' then null;
  else raise exception using errcode='55000',message='partner_claim_state_invalid'; end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key) values(c.claim_id,actor,case p_operation when 'submit' then 'submitted' when 'withdraw' then 'withdrawn' else 'recheck_requested' end,prior_state,c.state,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state) values(p_idempotency_key,p_operation,c.claim_id,actor,d,c.state);
  return app_public.partner_claim_status(c.claim_id);
end $$;

create or replace function partner_private.revoke_exact_claim_scope(p_claim_id uuid,p_actor uuid,p_reason text,p_key text) returns void
language plpgsql volatile security definer set search_path='' as $$ declare c partner_private.listing_claims%rowtype; g partner_private.store_partner_grants%rowtype; begin
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update; if c.state<>'approved' then raise exception using errcode='55000',message='partner_claim_not_approved'; end if;
  perform 1 from partner_private.store_partner_grants where store_id=c.store_id and state='active' for update;
  update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),revoked_by=p_actor,version=version+1 where store_id=c.store_id and auth_user_id=c.claimant_id and state='active' returning * into g;
  if found then insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,revoked_by,idempotency_key) values(g.grant_id,g.auth_user_id,g.store_id,case when p_reason='scope_transfer' then 'scope_transfer' else 'administrator_revoked' end,p_actor,p_key); end if;
  update app_private.role_grants set state='revoked',revoked_by=p_actor,revoked_at=statement_timestamp(),revocation_reason=p_reason,version=version+1 where subject_user_id=c.claimant_id and role='representative' and store_id=c.store_id and state='active';
  update partner_private.store_partnerships set state='revoked',ended_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp() where auth_user_id=c.claimant_id and store_id=c.store_id and state='active';
  update partner_private.listing_claims set state='revoked',revoked_at=statement_timestamp() where claim_id=c.claim_id;
end $$;

create or replace function partner_private.approve_exact_claim(p_claim_id uuid,p_actor uuid) returns void
language plpgsql volatile security definer set search_path='' as $$ declare c partner_private.listing_claims%rowtype; pid uuid; partnership uuid; receipt uuid; begin
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  perform 1 from partner_private.claim_authority_signals where claim_id=p_claim_id for update;
  if c.state<>'verification_pending' or c.claimant_id=p_actor or exists(select 1 from partner_private.claim_conflicts where claim_id=c.claim_id and state='open')
    or (select count(distinct channel_class) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2
    or not exists(select 1 from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified' and channel_class='published_business_contact')
    or (select count(distinct authority_object_hmac) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2
    or (select count(distinct verification_event_id) from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified')<2 then raise exception using errcode='42501',message='partner_claim_approval_denied'; end if;
  select p.pending_identity_id,r.consent_receipt_id into pid,receipt from partner_private.pending_partner_identities p join partner_private.pilot_consent_receipts r using(pending_identity_id) where p.auth_user_id=c.claimant_id and p.state='bound' order by p.bound_at desc limit 1;
  if pid is null then raise exception using errcode='42501',message='partner_bound_identity_required'; end if;
  select partnership_id into partnership from partner_private.store_partnerships where auth_user_id=c.claimant_id and store_id=c.store_id and state in ('pending','active') for update;
  if partnership is null then insert into partner_private.store_partnerships(pending_identity_id,auth_user_id,store_id,consent_receipt_id) values(pid,c.claimant_id,c.store_id,receipt) returning partnership_id into partnership; end if;
  update partner_private.store_partnerships set state='active',started_at=coalesce(started_at,statement_timestamp()),version=version+1,updated_at=statement_timestamp() where partnership_id=partnership;
  update partner_private.listing_claims set state='approved',assigned_admin_id=p_actor,approved_by=p_actor,approved_at=statement_timestamp() where claim_id=c.claim_id;
  insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id) values(partnership,c.claimant_id,c.store_id);
  insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by) values(c.claimant_id,'representative',c.store_id,'active',p_actor);
end $$;

create or replace function app_public.partner_admin_claim_case(p_claim_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype; begin
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and (assigned_admin_id is null or assigned_admin_id=actor);
  if not found then raise exception using errcode='55000',message='partner_claim_case_unavailable'; end if;
  return jsonb_build_object('claimId',c.claim_id,'state',c.state,'riskTier',c.risk_tier,'version',c.version,'exactStoreScope',(select slug from app_public.stores where id=c.store_id),
    'verifiedSignals',(select coalesce(jsonb_agg(jsonb_build_object('channelClass',channel_class,'signalType',signal_type) order by created_at),'[]') from partner_private.claim_authority_signals where claim_id=c.claim_id and status='verified'));
end $$;

create or replace function app_public.partner_admin_claim_command(p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,p_reason_code text,p_transfer_from_claim_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$ declare actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype; old partner_private.listing_claims%rowtype; prior partner_private.claim_command_receipts%rowtype; d bytea; prior_state text; begin
  if p_operation not in ('changes','conflict','approve','reject','revoke','recheck','transfer') or p_claim_id is null or p_expected_version<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' or ((p_operation='transfer')<>(p_transfer_from_claim_id is not null)) then raise exception using errcode='22023',message='partner_admin_command_invalid'; end if;
  d:=extensions.digest(convert_to(concat_ws('|',p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id,actor),'utf8'),'sha256'); select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.operation<>p_operation or prior.claim_id<>p_claim_id or prior.input_digest<>d then raise exception using errcode='22023',message='partner_claim_idempotency_mismatch'; end if; return app_public.partner_admin_claim_case(p_claim_id); end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id; if not found then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0)); perform 1 from partner_private.listing_claims where store_id=c.store_id for update; perform 1 from partner_private.store_partner_grants where store_id=c.store_id for update; prior_state:=c.state;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update; if not found or c.version<>p_expected_version or c.claimant_id=actor or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  if p_operation='changes' and c.state in ('submitted','verification_pending','conflict') then update partner_private.listing_claims set state='changes_requested',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='conflict' and c.state in ('submitted','verification_pending') then update partner_private.listing_claims set state='conflict',assigned_admin_id=actor where claim_id=c.claim_id returning * into c; insert into partner_private.claim_conflicts(claim_id,conflict_kind,assigned_admin_id) values(c.claim_id,'authority_mismatch',actor);
  elsif p_operation='reject' and c.state in ('submitted','verification_pending','conflict') then update partner_private.listing_claims set state='rejected',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='approve' then perform partner_private.approve_exact_claim(c.claim_id,actor); select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation in ('revoke','recheck') then perform partner_private.revoke_exact_claim_scope(c.claim_id,actor,p_reason_code,p_idempotency_key||'-scope'); select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation='transfer' then select * into old from partner_private.listing_claims where claim_id=p_transfer_from_claim_id and store_id=c.store_id for update; if old.state<>'approved' then raise exception using errcode='55000',message='partner_transfer_source_invalid'; end if; perform partner_private.revoke_exact_claim_scope(old.claim_id,actor,'scope_transfer',p_idempotency_key||'-old'); perform partner_private.approve_exact_claim(c.claim_id,actor); select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  else raise exception using errcode='55000',message='partner_claim_state_invalid'; end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key) values(c.claim_id,actor,case p_operation when 'changes' then 'changes_requested' when 'conflict' then 'conflict_opened' when 'approve' then 'approved' when 'reject' then 'rejected' when 'transfer' then 'transferred' else 'revoked' end,prior_state,c.state,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state) values(p_idempotency_key,p_operation,c.claim_id,actor,d,c.state);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash) values(actor,'administrator','partner_claim_'||p_operation,'completed','listing_claim',c.claim_id,p_reason_code,d,decode(repeat('00',32),'hex'));
  return app_public.partner_admin_claim_case(c.claim_id);
end $$;

create or replace function app_public.partner_synthetic_command(p_operation text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); token text:=p_payload->>'token'; token_digest bytea; supplied_email_hmac bytea; inv partner_private.partner_invitations%rowtype;
  identity_input jsonb:=p_payload->'identity'; signal_input jsonb:=p_payload->'input'; pending_id uuid; consent_id uuid; signal_id uuid; claim_row partner_private.listing_claims%rowtype; existing partner_private.pending_partner_identities%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() or p_payload->>'synthetic' is distinct from 'true'
    or not exists(select 1 from app_private.environment_stage where id=1 and stage='synthetic_alpha') then raise exception using errcode='42501',message='partner_synthetic_denied'; end if;
  if p_operation in ('exchange_invitation','accept_consent') then
    if token !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    token_digest:=extensions.digest(decode(token,'hex'),'sha256');
    select * into inv from partner_private.partner_invitations where token_hash=token_digest and synthetic and state='active' and expires_at>statement_timestamp() for update;
    if not found then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
  end if;
  if p_operation='exchange_invitation' then return jsonb_build_object('state','active','maskedRecipient','Synthetic test identity');
  elsif p_operation='accept_consent' then
    if p_payload->>'emailHmac' !~ '^[0-9a-f]{64}$' or jsonb_typeof(identity_input)<>'object'
      or not coalesce((p_payload->'acknowledgements'->>'authority')::boolean,false) or not coalesce((p_payload->'acknowledgements'->>'voluntary')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'permittedData')::boolean,false) or not coalesce((p_payload->'acknowledgements'->>'noPayment')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'withdrawal')::boolean,false) then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    supplied_email_hmac:=decode(p_payload->>'emailHmac','hex'); if supplied_email_hmac<>inv.recipient_email_hmac then raise exception using errcode='22023',message='partner_invitation_unavailable'; end if;
    update partner_private.partner_invitations set state='consumed',consumed_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp() where invitation_id=inv.invitation_id;
    insert into partner_private.pending_partner_identities(invitation_id,email_hmac,hmac_key_version,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
      values(inv.invitation_id,supplied_email_hmac,inv.hmac_key_version,actor,'bound',statement_timestamp(),statement_timestamp(),statement_timestamp()) returning pending_identity_id into pending_id;
    insert into partner_private.provisional_partner_consents(invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
      values(inv.invitation_id,pending_id,'synthetic-v2',btrim(identity_input->>'name'),btrim(identity_input->>'title'),btrim(identity_input->>'store'),supplied_email_hmac,true,true,true,true,true,'synthetic-'||inv.invitation_id) returning provisional_consent_id into consent_id;
    insert into partner_private.pilot_consent_receipts(provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
      values(consent_id,pending_id,inv.invitation_id,actor,supplied_email_hmac,'synthetic-v2',extensions.digest(convert_to(consent_id::text,'utf8'),'sha256'));
    return jsonb_build_object('invitation','consumed','pendingIdentity','bound','onboarding','draft');
  elsif p_operation='bind_identity' then select * into existing from partner_private.pending_partner_identities where auth_user_id=actor and state='bound'; if not found or not app_private.current_session_has_mfa() then raise exception using errcode='55000',message='partner_identity_unavailable'; end if; return jsonb_build_object('invitation','consumed','pendingIdentity','bound','onboarding','draft');
  elsif p_operation='submit_authority_signal' then
    if jsonb_typeof(signal_input)<>'object' or signal_input->>'claimId' is null or signal_input->>'channelClass' not in ('published_business_contact','callback','mailed_code','filing_lookup','in_person') or signal_input->>'evidenceRefHmac' !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='partner_synthetic_signal_denied'; end if;
    signal_id:=partner_private.record_synthetic_claim_signal((signal_input->>'claimId')::uuid,signal_input->>'channelClass',case signal_input->>'channelClass' when 'published_business_contact' then 'domain_response' when 'callback' then 'callback' when 'mailed_code' then 'mailed_code' when 'filing_lookup' then 'filing_lookup' else 'in_person_inspection' end,decode(signal_input->>'evidenceRefHmac','hex'));
    return app_public.partner_claim_status((signal_input->>'claimId')::uuid);
  elsif p_operation='request_authority_recheck' then
    select * into claim_row from partner_private.listing_claims where claim_id=(p_payload->>'claimId')::uuid and claimant_id=actor;
    if not found then raise exception using errcode='55000',message='partner_claim_unavailable'; end if;
    return app_public.partner_claimant_claim_command('recheck',claim_row.claim_id,claim_row.version,'synthetic-recheck-'||claim_row.claim_id||'-v'||claim_row.version);
  else raise exception using errcode='22023',message='partner_synthetic_operation_denied'; end if;
exception when invalid_text_representation then raise exception using errcode='22023',message='partner_invitation_unavailable';
end $$;

-- Synthetic submission is the only pre-10B exception. It remains exact-store,
-- signed-in, and entirely fictional; every real listing continues to deny.
create or replace function partner_private.enforce_listing_claim_release_gate() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if new.state='submitted' and (tg_op='INSERT' or old.state is distinct from new.state)
    and not partner_private.claim_stage_allowed(new.store_id) then raise exception using errcode='42501',message='listing_claim_release_disabled'; end if; return new;
end $$;

-- Remove direct row reads; claimant and Administrator projections above are
-- reason-neutral and exact-case only.
revoke select on partner_private.listing_claims,partner_private.claim_authority_signals,partner_private.claim_conflicts from authenticated;

alter function partner_private.claim_stage_allowed(uuid) owner to identity_service; alter function partner_private.require_claimant() owner to identity_service; alter function partner_private.require_claim_admin() owner to identity_service;
alter function app_public.issue_synthetic_partner_invitation(bytea,smallint,text) owner to identity_service; alter function app_public.partner_start_claim(uuid,text,text,text) owner to identity_service; alter function app_public.partner_claim_status(uuid) owner to identity_service; alter function app_public.partner_claimant_claim_command(text,uuid,bigint,text) owner to identity_service;
alter function partner_private.record_synthetic_claim_signal(uuid,text,text,bytea) owner to identity_service; alter function partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text) owner to identity_service; alter function partner_private.revoke_exact_claim_scope(uuid,uuid,text,text) owner to identity_service; alter function partner_private.approve_exact_claim(uuid,uuid) owner to identity_service;
alter function app_public.partner_admin_claim_case(uuid) owner to identity_service; alter function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid) owner to identity_service; alter function partner_private.enforce_listing_claim_release_gate() owner to identity_service;
alter function app_public.partner_synthetic_command(text,jsonb) owner to identity_service;

revoke all on function partner_private.record_synthetic_claim_signal(uuid,text,text,bytea),partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text) from public,anon,authenticated,partner_authority_service;
grant execute on function partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text) to partner_authority_service;
revoke all on function app_public.issue_synthetic_partner_invitation(bytea,smallint,text),app_public.partner_start_claim(uuid,text,text,text),app_public.partner_claim_status(uuid),app_public.partner_claimant_claim_command(text,uuid,bigint,text),app_public.partner_admin_claim_case(uuid),app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid) from public,anon;
grant execute on function app_public.issue_synthetic_partner_invitation(bytea,smallint,text),app_public.partner_start_claim(uuid,text,text,text),app_public.partner_claim_status(uuid),app_public.partner_claimant_claim_command(text,uuid,bigint,text),app_public.partner_admin_claim_case(uuid),app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid) to authenticated;

revoke create on schema partner_private,app_public from identity_service;
revoke identity_service from postgres;
