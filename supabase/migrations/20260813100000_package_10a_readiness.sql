-- Package 10A: server-owned readiness evidence, calculation, and signing boundary.
-- Provider verification happens in the signature service. Browsers cannot write
-- evidence or receipts and cannot turn a boolean claim into a signed decision.

do $$
begin
  if not exists (select 1 from pg_roles where rolname='readiness_automation') then
    create role readiness_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='readiness_calculation_service') then
    create role readiness_calculation_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='readiness_signature_service') then
    create role readiness_signature_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant readiness_automation, identity_service to postgres;
create schema if not exists readiness_private;
revoke all on schema readiness_private from public, anon, authenticated;
grant usage on schema readiness_private to readiness_automation, identity_service,
  readiness_calculation_service, readiness_signature_service;
grant create on schema readiness_private to readiness_automation, identity_service;
grant create on schema app_public to identity_service;

create table readiness_private.readiness_runs (
  run_id uuid primary key,
  source_digest bytea not null unique check (octet_length(source_digest)=32),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot)='object'),
  blockers text[] not null,
  state text not null default 'frozen' check (state in ('frozen','signed','rejected')),
  calculated_at timestamptz not null default statement_timestamp(),
  receipt_id uuid unique,
  constraint readiness_run_state_shape check (
    (state='frozen' and receipt_id is null) or (state in ('signed','rejected') and receipt_id is not null)
  )
);

create table readiness_private.readiness_signing_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references readiness_private.readiness_runs(run_id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  nonce bytea not null default extensions.gen_random_bytes(32) check (octet_length(nonce)=32),
  frozen_digest bytea not null check (octet_length(frozen_digest)=32),
  payload_digest bytea not null check (octet_length(payload_digest)=32),
  expires_at timestamptz not null default statement_timestamp()+interval '5 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint readiness_challenge_window check (
    expires_at>created_at and expires_at<=created_at+interval '5 minutes'
  )
);
create unique index readiness_one_live_challenge_per_run_signer
  on readiness_private.readiness_signing_challenges(run_id,signer_user_id)
  where consumed_at is null;

create table readiness_private.readiness_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references readiness_private.readiness_runs(run_id) on delete restrict,
  challenge_id uuid not null unique references readiness_private.readiness_signing_challenges(challenge_id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  responsibility text not null check (responsibility='ProductOwner'),
  decision text not null check (decision in ('pass','reject')),
  frozen_digest bytea not null check (octet_length(frozen_digest)=32),
  signed_payload_digest bytea not null check (octet_length(signed_payload_digest)=32),
  signature_digest bytea not null check (octet_length(signature_digest)=32),
  provider_key_id text not null check (
    provider_key_id=btrim(provider_key_id) and char_length(provider_key_id) between 1 and 160
      and provider_key_id !~ '[[:cntrl:]]'
  ),
  provider_verification_id text not null check (
    provider_verification_id=btrim(provider_verification_id)
      and char_length(provider_verification_id) between 1 and 160
      and provider_verification_id !~ '[[:cntrl:]]'
  ),
  verified_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp()
);

alter table readiness_private.readiness_runs
  add constraint readiness_run_receipt_fk foreign key(receipt_id)
  references readiness_private.readiness_receipts(receipt_id) on delete restrict;

create or replace function readiness_private.reject_append_only_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501', message='readiness_append_only';
end
$$;
create trigger readiness_receipts_append_only before update or delete
  on readiness_private.readiness_receipts for each row
  execute function readiness_private.reject_append_only_mutation();

create or replace function readiness_private.guard_run_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.run_id<>old.run_id
    or new.source_digest<>old.source_digest
    or new.evidence_snapshot<>old.evidence_snapshot
    or new.blockers<>old.blockers
    or new.calculated_at<>old.calculated_at
    or old.state<>'frozen'
    or new.state not in ('signed','rejected')
    or new.receipt_id is null then
    raise exception using errcode='23514', message='readiness_run_transition_invalid';
  end if;
  return new;
end
$$;
create trigger readiness_run_guard before update on readiness_private.readiness_runs
  for each row execute function readiness_private.guard_run_mutation();
create trigger readiness_runs_no_delete before delete on readiness_private.readiness_runs
  for each row execute function readiness_private.reject_append_only_mutation();

create or replace function readiness_private.calculate_blockers(p_evidence jsonb)
returns text[] language plpgsql immutable set search_path='' as $$
declare result text[] := array[]::text[];
declare first_eight jsonb := coalesce(p_evidence->'firstEight','[]'::jsonb);
begin
  if jsonb_typeof(p_evidence)<>'object' then return array['readiness_evidence_invalid']; end if;
  if coalesce(p_evidence->>'cat01ReceiptId','')='' then result:=array_append(result,'cat01_receipt_missing'); end if;
  if coalesce((p_evidence->>'cat01ReceiptRecordedByService')::boolean,false) is not true then
    result:=array_append(result,'cat01_service_receipt_missing');
  end if;
  if jsonb_typeof(first_eight)<>'array' or jsonb_array_length(first_eight)<>8 then
    result:=array_append(result,'readiness_first_eight_invalid');
  end if;
  if coalesce((p_evidence->>'completedJourneys')::integer,0)<7 then
    result:=array_append(result,'readiness_completions_below_seven');
  end if;
  if coalesce((p_evidence->>'returnIntents')::integer,0)<5 then
    result:=array_append(result,'readiness_return_intent_below_five');
  end if;
  if coalesce((p_evidence->>'verifiedListings')::integer,0)<12 then
    result:=array_append(result,'catalog_twelve_listing_floor_missing');
  end if;
  if coalesce((p_evidence->>'coveragePercent')::numeric,0)<70 then
    result:=array_append(result,'catalog_seventy_percent_coverage_missing');
  end if;
  if coalesce((p_evidence->>'freshnessPercent')::numeric,0)<>100 then
    result:=array_append(result,'catalog_freshness_not_complete');
  end if;
  if coalesce((p_evidence->>'itineraryCount')::integer,0)<>9 then
    result:=array_append(result,'itinerary_nine_required');
  end if;
  if coalesce((p_evidence->>'artifactCount')::integer,0)<>8 then
    result:=array_append(result,'readiness_artifacts_incomplete');
  end if;
  if coalesce((p_evidence->>'unresolvedCriticalDefects')::integer,0)<>0 then
    result:=array_append(result,'readiness_critical_defect_open');
  end if;
  if coalesce((p_evidence->>'prerequisitesPassed')::boolean,false) is not true then
    result:=array_append(result,'readiness_prerequisites_incomplete');
  end if;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return array['readiness_evidence_invalid'];
end
$$;

create or replace function readiness_private.freeze_evidence(
  p_run_id uuid, p_source_digest bytea, p_evidence jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare run_row readiness_private.readiness_runs%rowtype;
begin
  if p_run_id is null or octet_length(p_source_digest)<>32 or jsonb_typeof(p_evidence)<>'object' then
    raise exception using errcode='22023', message='readiness_evidence_invalid';
  end if;
  insert into readiness_private.readiness_runs(run_id,source_digest,evidence_snapshot,blockers)
    values(p_run_id,p_source_digest,p_evidence,readiness_private.calculate_blockers(p_evidence))
    returning * into run_row;
  return jsonb_build_object('runId',run_row.run_id,'state',run_row.state,
    'frozenDigest',encode(run_row.source_digest,'hex'),'blockers',to_jsonb(run_row.blockers),
    'calculatedAt',run_row.calculated_at);
exception when unique_violation then
  raise exception using errcode='23505', message='readiness_evidence_already_frozen';
end
$$;

create or replace function app_public.readiness_get_status(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare run_row readiness_private.readiness_runs%rowtype;
begin
  if not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501', message='readiness_access_denied';
  end if;
  select * into run_row from readiness_private.readiness_runs where run_id=p_run_id;
  if not found then raise exception using errcode='P0002', message='readiness_run_not_found'; end if;
  return jsonb_build_object('runId',run_row.run_id,'state',run_row.state,
    'frozenDigest',encode(run_row.source_digest,'hex'),'blockers',to_jsonb(run_row.blockers),
    'calculatedAt',run_row.calculated_at,'receiptId',run_row.receipt_id);
end
$$;

create or replace function app_public.readiness_request_signing_challenge(p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare run_row readiness_private.readiness_runs%rowtype;
declare challenge readiness_private.readiness_signing_challenges%rowtype;
declare challenge_nonce bytea := extensions.gen_random_bytes(32);
declare challenge_expires_at timestamptz := statement_timestamp()+interval '5 minutes';
begin
  if not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501', message='readiness_access_denied';
  end if;
  select * into run_row from readiness_private.readiness_runs where run_id=p_run_id for update;
  if not found then raise exception using errcode='P0002', message='readiness_run_not_found'; end if;
  if run_row.state<>'frozen' or cardinality(run_row.blockers)>0 then
    raise exception using errcode='55000', message='readiness_signing_blocked';
  end if;
  delete from readiness_private.readiness_signing_challenges
    where run_id=p_run_id and signer_user_id=auth.uid() and consumed_at is null
      and expires_at<=statement_timestamp();
  insert into readiness_private.readiness_signing_challenges(
    run_id,signer_user_id,nonce,frozen_digest,payload_digest,expires_at
  ) values(
    p_run_id,auth.uid(),challenge_nonce,run_row.source_digest,
    extensions.digest(convert_to(concat_ws('|',p_run_id::text,encode(run_row.source_digest,'hex'),
      auth.uid()::text,encode(challenge_nonce,'hex'),challenge_expires_at::text),'UTF8'),'sha256'),
    challenge_expires_at
  ) returning * into challenge;
  return jsonb_build_object('challengeId',challenge.challenge_id,
    'payloadDigest',encode(challenge.payload_digest,'hex'),'expiresAt',challenge.expires_at);
exception when unique_violation then
  raise exception using errcode='55000', message='readiness_challenge_already_active';
end
$$;

create or replace function readiness_private.consume_signing_challenge(
  p_challenge_id uuid, p_signed_payload_digest bytea, p_signature_digest bytea,
  p_provider_key_id text, p_provider_verification_id text, p_decision text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare challenge readiness_private.readiness_signing_challenges%rowtype;
declare run_row readiness_private.readiness_runs%rowtype;
declare receipt readiness_private.readiness_receipts%rowtype;
begin
  select * into challenge from readiness_private.readiness_signing_challenges
    where challenge_id=p_challenge_id for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at<=statement_timestamp() then
    raise exception using errcode='22023', message='readiness_challenge_invalid_or_consumed';
  end if;
  if p_signed_payload_digest is distinct from challenge.payload_digest
    or octet_length(p_signature_digest)<>32
    or nullif(btrim(p_provider_key_id),'') is null
    or nullif(btrim(p_provider_verification_id),'') is null
    or p_decision not in ('pass','reject') then
    raise exception using errcode='22023', message='readiness_provider_verification_invalid';
  end if;
  select * into run_row from readiness_private.readiness_runs
    where run_id=challenge.run_id for update;
  if run_row.state<>'frozen' or (p_decision='pass' and cardinality(run_row.blockers)>0) then
    raise exception using errcode='55000', message='readiness_decision_blocked';
  end if;
  update readiness_private.readiness_signing_challenges
    set consumed_at=statement_timestamp() where challenge_id=p_challenge_id;
  insert into readiness_private.readiness_receipts(
    run_id,challenge_id,signer_user_id,responsibility,decision,frozen_digest,
    signed_payload_digest,signature_digest,provider_key_id,provider_verification_id
  ) values(
    run_row.run_id,challenge.challenge_id,challenge.signer_user_id,'ProductOwner',p_decision,
    challenge.frozen_digest,p_signed_payload_digest,p_signature_digest,
    btrim(p_provider_key_id),btrim(p_provider_verification_id)
  ) returning * into receipt;
  update readiness_private.readiness_runs set
    state=case when p_decision='pass' then 'signed' else 'rejected' end,
    receipt_id=receipt.receipt_id where run_id=run_row.run_id;
  return jsonb_build_object('receiptId',receipt.receipt_id,'runId',receipt.run_id,
    'state',case when receipt.decision='pass' then 'signed' else 'rejected' end,
    'decision',receipt.decision,'verifiedAt',receipt.verified_at);
end
$$;

do $$ declare t text; begin
  foreach t in array array['readiness_runs','readiness_signing_challenges','readiness_receipts'] loop
    execute format('alter table readiness_private.%I enable row level security',t);
    execute format('alter table readiness_private.%I force row level security',t);
    execute format('revoke all on readiness_private.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on readiness_private.%I to readiness_automation',t);
  end loop;
end $$;
grant select on readiness_private.readiness_runs,readiness_private.readiness_receipts to identity_service;
grant select,insert,delete on readiness_private.readiness_signing_challenges to identity_service;
create policy readiness_automation_runs on readiness_private.readiness_runs
  for all to readiness_automation using(true) with check(true);
create policy readiness_automation_challenges on readiness_private.readiness_signing_challenges
  for all to readiness_automation using(true) with check(true);
create policy readiness_automation_receipts on readiness_private.readiness_receipts
  for all to readiness_automation using(true) with check(true);
create policy identity_service_readiness_runs on readiness_private.readiness_runs
  for all to identity_service using(true) with check(true);
create policy identity_service_readiness_challenges on readiness_private.readiness_signing_challenges
  for all to identity_service using(true) with check(true);
create policy identity_service_readiness_receipts on readiness_private.readiness_receipts
  for all to identity_service using(true) with check(true);

alter function readiness_private.reject_append_only_mutation() owner to readiness_automation;
alter function readiness_private.guard_run_mutation() owner to readiness_automation;
alter function readiness_private.calculate_blockers(jsonb) owner to readiness_automation;
alter function readiness_private.freeze_evidence(uuid,bytea,jsonb) owner to readiness_automation;
alter function readiness_private.consume_signing_challenge(uuid,bytea,bytea,text,text,text) owner to readiness_automation;
alter function app_public.readiness_get_status(uuid) owner to identity_service;
alter function app_public.readiness_request_signing_challenge(uuid) owner to identity_service;

revoke all on function readiness_private.calculate_blockers(jsonb) from public,anon,authenticated;
revoke all on function readiness_private.freeze_evidence(uuid,bytea,jsonb) from public,anon,authenticated;
revoke all on function readiness_private.consume_signing_challenge(uuid,bytea,bytea,text,text,text) from public,anon,authenticated;
revoke all on function app_public.readiness_get_status(uuid) from public,anon;
revoke all on function app_public.readiness_request_signing_challenge(uuid) from public,anon;
grant execute on function readiness_private.freeze_evidence(uuid,bytea,jsonb) to readiness_calculation_service;
grant execute on function readiness_private.consume_signing_challenge(uuid,bytea,bytea,text,text,text) to readiness_signature_service;
grant execute on function app_public.readiness_get_status(uuid) to authenticated;
grant execute on function app_public.readiness_request_signing_challenge(uuid) to authenticated;

revoke create on schema readiness_private from readiness_automation,identity_service;
revoke create on schema app_public from identity_service;
revoke readiness_automation,identity_service from postgres;
