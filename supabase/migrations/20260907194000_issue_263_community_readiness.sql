-- Issue #263: authenticated community preparation and current-area gate.
-- The deployment command remains service-only. These wrappers authorize the
-- current session before invoking the existing durable command functions.

grant identity_service, community_automation to postgres;
grant create on schema community_private, app_public to community_automation;
grant usage on schema readiness_private to identity_service;

create or replace function community_private.require_user_responsibility(
  p_responsibility text,
  p_require_privileged_reauth boolean default false
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  grant_row readiness_private.evidence_responsibility_grants%rowtype;
begin
  if p_responsibility not in ('ProductOwner','PrimaryInternalTester','Operations')
    or actor is null
    or not app_private.current_session_is_active()
    or (p_require_privileged_reauth and (
      not app_private.current_session_has_mfa()
      or not app_private.current_session_recent_auth(interval '15 minutes')
    )) then
    raise exception using errcode='42501',message='community_responsibility_required';
  end if;
  select * into grant_row
    from readiness_private.evidence_responsibility_grants
    where user_id=actor and responsibility=p_responsibility and state='active';
  if not found then
    raise exception using errcode='42501',message='community_responsibility_required';
  end if;
  return jsonb_build_object('userId',actor,'grantId',grant_row.grant_id,'grantVersion',grant_row.version);
end $$;
alter function community_private.require_user_responsibility(text,boolean) owner to identity_service;
revoke all on function community_private.require_user_responsibility(text,boolean) from public,anon,authenticated;
grant execute on function community_private.require_user_responsibility(text,boolean) to community_automation;

create table community_private.community_readiness_capabilities (
  capability_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references community_private.community_activation_runs(run_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  readiness_receipt_id uuid not null references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  frozen_digest bytea not null check(octet_length(frozen_digest)=32),
  expected_root_version bigint not null check(expected_root_version>0),
  expected_run_version bigint not null check(expected_run_version>0),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  state text not null default 'issued' check(state in ('issued','consumed','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz,
  constraint community_readiness_capability_window check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  check((state='consumed' and consumed_at is not null) or (state<>'consumed' and consumed_at is null))
);
create unique index community_one_live_readiness_capability
  on community_private.community_readiness_capabilities(user_id,run_id,frozen_digest) where state='issued';

create table community_private.community_gate_packets (
  run_id uuid primary key references community_private.community_activation_runs(run_id) on delete restrict,
  frozen_digest bytea not null check(octet_length(frozen_digest)=32),
  checks jsonb not null check(jsonb_typeof(checks)='object'),
  version bigint not null default 1 check(version>0),
  frozen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table community_private.community_gate_capabilities (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references community_private.community_activation_runs(run_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  responsibility text not null check(responsibility='PrimaryInternalTester'),
  frozen_digest bytea not null check(octet_length(frozen_digest)=32),
  grant_id uuid not null references readiness_private.evidence_responsibility_grants(grant_id) on delete restrict,
  grant_version bigint not null check(grant_version>0),
  decision text not null check(decision in ('pass','reject')),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  failed_codes text[] not null default array[]::text[],
  state text not null default 'issued' check(state in ('issued','consumed','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz,
  constraint community_gate_capability_window check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  check((state='consumed' and consumed_at is not null) or (state<>'consumed' and consumed_at is null))
);
create unique index community_one_live_gate_capability
  on community_private.community_gate_capabilities(user_id,run_id,frozen_digest)
  where state='issued';

create table community_private.community_gate_command_receipts (
  command_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  challenge_id uuid not null references community_private.community_gate_capabilities(challenge_id) on delete restrict,
  run_id uuid not null references community_private.community_activation_runs(run_id) on delete restrict,
  input_digest bytea not null check(octet_length(input_digest)=32),
  result_snapshot jsonb not null check(jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz not null default statement_timestamp()
);

create or replace function community_private.reject_gate_receipt_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501',message='community_append_only';
end $$;
create trigger community_gate_commands_append_only
before update or delete on community_private.community_gate_command_receipts
for each row execute function community_private.reject_gate_receipt_mutation();

alter table community_private.community_gate_packets enable row level security;
alter table community_private.community_gate_packets force row level security;
alter table community_private.community_gate_capabilities enable row level security;
alter table community_private.community_gate_capabilities force row level security;
alter table community_private.community_gate_command_receipts enable row level security;
alter table community_private.community_gate_command_receipts force row level security;
alter table community_private.community_readiness_capabilities enable row level security;
alter table community_private.community_readiness_capabilities force row level security;
revoke all on community_private.community_readiness_capabilities from public,anon,authenticated;
revoke all on community_private.community_gate_packets,community_private.community_gate_capabilities,community_private.community_gate_command_receipts from public,anon,authenticated;
grant select,insert,update on community_private.community_readiness_capabilities to community_automation;
grant select,insert,update on community_private.community_gate_packets to community_automation;
grant select,insert,update on community_private.community_gate_capabilities to community_automation;
grant select,insert on community_private.community_gate_command_receipts to community_automation;
create policy community_automation_gate_packets on community_private.community_gate_packets for all to community_automation using(true) with check(true);
create policy community_automation_gate_capabilities on community_private.community_gate_capabilities for all to community_automation using(true) with check(true);
create policy community_automation_gate_commands on community_private.community_gate_command_receipts for all to community_automation using(true) with check(true);
create policy community_automation_readiness_capabilities on community_private.community_readiness_capabilities for all to community_automation using(true) with check(true);

create or replace function community_private.gate_failed_codes(p_checks jsonb)
returns text[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(code order by code) filter(where not passed),array[]::text[])
  from (values
    ('two_verified_active_listings',p_checks->>'twoVerifiedActiveListings'='true'),
    ('anchor_direct_edit',p_checks->>'anchorDirectEdit'='true'),
    ('reviewed_controlled_change',p_checks->>'reviewedControlledChange'='true'),
    ('anchor_support_request',p_checks->>'anchorSupportRequest'='true'),
    ('primary_tester_separate_account_phone_trip',p_checks->>'primaryTesterSeparateAccountPhoneTrip'='true'),
    ('independent_tester_separate_account_phone_trip',p_checks->>'independentTesterSeparateAccountPhoneTrip'='true'),
    ('five_voluntary_shopper_trip_confirmations',coalesce((p_checks->>'voluntaryShopperTripConfirmations')::integer,0)>=5),
    ('no_precise_location_tracking',p_checks->>'noPreciseLocationTracking'='true'),
    ('monitoring',p_checks->>'monitoring'='true'),
    ('support',p_checks->>'support'='true'),
    ('store_data_accuracy',p_checks->>'storeDataAccuracy'='true'),
    ('zero_blocking_privacy_security_data_loss_defects',p_checks->>'zeroBlockingPrivacySecurityDataLossDefects'='true')
  ) facts(code,passed)
$$;

create or replace function community_private.gate_checks_complete(p_checks jsonb)
returns boolean language sql immutable set search_path='' as $$
  select cardinality(community_private.gate_failed_codes(p_checks))=0
$$;

create or replace function community_private.community_preparation_projection(p_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare root_row community_private.community_expansion_root%rowtype;
begin
  perform community_private.require_user_responsibility('Operations',false);
  select * into root_row from community_private.community_expansion_root where root_id=1;
  if p_run_id is not null and not exists(select 1 from community_private.community_activation_runs where run_id=p_run_id) then
    raise exception using errcode='55000',message='community_run_not_available';
  end if;
  return jsonb_build_object(
    'status',case when exists(select 1 from community_private.community_evidence_receipts s
      join community_private.community_evidence_receipts p on p.receipt_id=s.prior_receipt_id
      where s.receipt_kind='selection' and s.responsibility='ProductOwner' and s.decision='pass' and s.external_verified
        and s.predicates->'eligible_small_community'='true'::jsonb
        and ((p.receipt_kind='rg01_pass' and p.rg01_authoritative_receipt_id is not null
          and rg01_private.receipt_is_current_pass(p.rg01_authoritative_receipt_id))
          or (p.receipt_kind='community_gate' and p.decision='pass' and p.external_verified)))
      then 'available' else 'blocked' end,
    'root',jsonb_build_object('expectedVersion',root_row.version,'lastActivationOrdinal',root_row.last_activation_ordinal,
      'lastAttemptSequence',root_row.last_attempt_sequence,'activeRunId',root_row.active_run_id),
    'runs',coalesce((select jsonb_agg(jsonb_build_object(
      'runId',r.run_id,'areaId',r.area_slug,'areaName',r.area_slug,'targetOrdinal',r.target_ordinal,
      'attemptSequence',r.attempt_sequence,'state',r.state,'version',r.version,
      'expectedRootVersion',root_row.version,'artifactDigest',case when r.artifact_binding_digest is null then null else encode(r.artifact_binding_digest,'hex') end,
      'storeSetDigest',case when r.store_set_digest is null then null else encode(r.store_set_digest,'hex') end,
      'readinessStatus',case when r.readiness_receipt_id is null then 'unsigned' else 'signed' end,
      'receipts',jsonb_build_object('selection',r.selection_receipt_id,'prerequisite',coalesce(r.rg01_receipt_id,r.prior_gate_receipt_id),
        'readiness',r.readiness_receipt_id,'cancellation',r.cancellation_receipt_id)))
      from community_private.community_activation_runs r where p_run_id is null or r.run_id=p_run_id order by r.attempt_sequence),'[]'::jsonb)
  );
end $$;
alter function community_private.community_preparation_projection(uuid) owner to community_automation;

create or replace function community_private.request_readiness_capability(
  p_run_id uuid,p_readiness_receipt_id uuid,p_expected_root_version bigint,p_expected_run_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb:=community_private.require_user_responsibility('ProductOwner',true); uid uuid:=(actor->>'userId')::uuid;
  r community_private.community_activation_runs%rowtype; digest bytea; cap community_private.community_readiness_capabilities%rowtype;
begin
  select * into r from community_private.community_activation_runs where run_id=p_run_id;
  if not found or r.state<>'prepared' or r.artifact_binding_digest is null or p_expected_root_version<>(select version from community_private.community_expansion_root where root_id=1)
    or p_expected_run_version<>r.version then raise exception using errcode='55000',message='community_readiness_capability_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_run_id,p_readiness_receipt_id,encode(r.artifact_binding_digest,'hex'),p_expected_root_version,p_expected_run_version,uid),'utf8'),'sha256');
  insert into community_private.community_readiness_capabilities(run_id,user_id,readiness_receipt_id,frozen_digest,expected_root_version,expected_run_version,payload_digest,expires_at)
    values(p_run_id,uid,p_readiness_receipt_id,r.artifact_binding_digest,p_expected_root_version,p_expected_run_version,digest,statement_timestamp()+interval '30 minutes')
    on conflict (user_id,run_id,frozen_digest) where state='issued' do update set readiness_receipt_id=excluded.readiness_receipt_id,expected_root_version=excluded.expected_root_version,expected_run_version=excluded.expected_run_version,payload_digest=excluded.payload_digest,expires_at=excluded.expires_at
    returning * into cap;
  return jsonb_build_object('capabilityId',cap.capability_id,'payloadDigest',encode(cap.payload_digest,'hex'),'expiresAt',cap.expires_at);
end $$;
alter function community_private.request_readiness_capability(uuid,uuid,bigint,bigint) owner to community_automation;

create or replace function community_private.consume_readiness_capability(
  p_capability_id uuid,p_run_id uuid,p_readiness_receipt_id uuid,p_payload_digest bytea,p_expected_root_version bigint,p_expected_run_version bigint
)
returns void language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb:=community_private.require_user_responsibility('ProductOwner',true); uid uuid:=(actor->>'userId')::uuid;
  cap community_private.community_readiness_capabilities%rowtype; r community_private.community_activation_runs%rowtype;
begin
  select * into cap from community_private.community_readiness_capabilities where capability_id=p_capability_id for update;
  select * into r from community_private.community_activation_runs where run_id=p_run_id;
  if not found or cap.user_id<>uid or cap.run_id<>p_run_id or cap.readiness_receipt_id<>p_readiness_receipt_id
    or cap.state<>'issued' or cap.expires_at<=statement_timestamp() or cap.payload_digest<>p_payload_digest
    or cap.expected_root_version<>p_expected_root_version or cap.expected_run_version<>p_expected_run_version
    or r.version<>p_expected_run_version then raise exception using errcode='42501',message='community_readiness_capability_unavailable'; end if;
  update community_private.community_readiness_capabilities set state='consumed',consumed_at=statement_timestamp() where capability_id=cap.capability_id;
end $$;
alter function community_private.consume_readiness_capability(uuid,uuid,uuid,bytea,bigint,bigint) owner to community_automation;

create or replace function app_public.community_preparation_command(p_operation text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor jsonb;
  input_digest bytea;
  result jsonb;
  prior_command community_private.community_command_receipts%rowtype;
  target_ordinal smallint;
  run_id uuid;
  readiness_capability_id uuid;
  readiness_payload_digest bytea;
begin
  if p_operation='list' then
    if p_payload is distinct from '{}'::jsonb then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
    return community_private.community_preparation_projection(null);
  elsif p_operation='detail' then
    if not community_private.deployment_payload_exact(p_payload,array['runId']) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
    begin run_id:=(p_payload->>'runId')::uuid; exception when others then raise exception using errcode='22023',message='community_command_input_invalid'; end;
    return community_private.community_preparation_projection(run_id);
  end if;
  if p_operation='sign_request' then
    if not community_private.deployment_payload_exact(p_payload,array['runId','readinessReceiptId','expectedRootVersion','expectedRunVersion']) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
    perform community_private.require_user_responsibility('ProductOwner',true);
    return community_private.request_readiness_capability((p_payload->>'runId')::uuid,(p_payload->>'readinessReceiptId')::uuid,
      (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint);
  elsif p_operation not in ('prepare','freeze','sign','cancel') or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='22023',message='community_command_input_invalid';
  end if;
  if p_operation in ('prepare','freeze','cancel') then
    actor:=community_private.require_user_responsibility('Operations',false);
  else
    actor:=community_private.require_user_responsibility('ProductOwner',true);
  end if;
  input_digest:=extensions.digest(convert_to(p_operation||':'||p_payload::text,'utf8'),'sha256');
  if p_operation='sign' then
    select * into prior_command from community_private.community_command_receipts
      where idempotency_key=p_payload->>'idempotencyKey' for update;
    if found then
      if prior_command.operation<>'sign' or prior_command.run_id<>(p_payload->>'runId')::uuid
        or prior_command.action_receipt_id<>(p_payload->>'readinessReceiptId')::uuid
        or prior_command.input_digest<>input_digest then
        raise exception using errcode='22023',message='community_idempotency_mismatch';
      end if;
      return prior_command.result_snapshot;
    end if;
  end if;
  case p_operation
    when 'prepare' then
      if not community_private.deployment_payload_exact(p_payload,array['runId','areaSlug','selectionReceiptId','prerequisiteReceiptId','expectedRootVersion','idempotencyKey']) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
      select (last_activation_ordinal+1)::smallint into target_ordinal from community_private.community_expansion_root where root_id=1;
      result:=community_private.prepare_community((p_payload->>'runId')::uuid,p_payload->>'areaSlug',target_ordinal,
        (p_payload->>'selectionReceiptId')::uuid,(p_payload->>'prerequisiteReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,p_payload->>'idempotencyKey',input_digest);
    when 'freeze' then
      result:=community_private.freeze_community((p_payload->>'runId')::uuid,(p_payload->>'freezeReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        decode(p_payload->>'artifactDigest','hex'),decode(p_payload->>'storeSetDigest','hex'),
        array(select value::uuid from jsonb_array_elements_text(p_payload->'storeIds') value),p_payload->>'idempotencyKey',input_digest);
    when 'sign' then
      if not community_private.deployment_payload_exact(p_payload,array['runId','readinessReceiptId','capabilityId','payloadDigest','expectedRootVersion','expectedRunVersion','idempotencyKey']) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
      readiness_capability_id:=(p_payload->>'capabilityId')::uuid;
      readiness_payload_digest:=decode(p_payload->>'payloadDigest','hex');
      perform community_private.consume_readiness_capability(readiness_capability_id,(p_payload->>'runId')::uuid,(p_payload->>'readinessReceiptId')::uuid,
        readiness_payload_digest,(p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint);
      result:=community_private.sign_community_readiness((p_payload->>'runId')::uuid,(p_payload->>'readinessReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,p_payload->>'idempotencyKey',input_digest);
    when 'cancel' then
      result:=community_private.cancel_community((p_payload->>'runId')::uuid,(p_payload->>'cancellationReceiptId')::uuid,p_payload->>'reason',
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,p_payload->>'idempotencyKey',input_digest);
  end case;
  return result;
exception when invalid_text_representation then
  raise exception using errcode='22023',message='community_command_input_invalid';
end $$;
alter function app_public.community_preparation_command(text,jsonb) owner to community_automation;
revoke all on function app_public.community_preparation_command(text,jsonb) from public,anon;
grant execute on function app_public.community_preparation_command(text,jsonb) to authenticated;

create or replace function app_public.community_gate_command(p_operation text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb; uid uuid; grant_id uuid; grant_version bigint; target_run_id uuid; r community_private.community_activation_runs%rowtype;
  packet community_private.community_gate_packets%rowtype; cap community_private.community_gate_capabilities%rowtype;
  decision text; failed_codes text[]; digest bytea; result jsonb; receipt_id uuid; idempotency text;
  prior_command community_private.community_gate_command_receipts%rowtype;
begin
  if p_operation not in ('packet','request','decide') or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
  begin target_run_id:=(p_payload->>'runId')::uuid; exception when others then raise exception using errcode='22023',message='community_gate_unavailable'; end;
  actor:=community_private.require_user_responsibility('PrimaryInternalTester',true); uid:=(actor->>'userId')::uuid; grant_id:=(actor->>'grantId')::uuid; grant_version:=(actor->>'grantVersion')::bigint;
  select * into r from community_private.community_activation_runs where community_activation_runs.run_id=target_run_id;
  select * into packet from community_private.community_gate_packets where community_gate_packets.run_id=target_run_id;
  if r.run_id is null or packet.run_id is null or r.state<>'live' or r.activation_ordinal is distinct from (select last_activation_ordinal from community_private.community_expansion_root where root_id=1)
    or packet.frozen_digest is distinct from r.artifact_binding_digest then raise exception using errcode='55000',message='community_gate_unavailable'; end if;
  failed_codes:=community_private.gate_failed_codes(packet.checks);
  if p_operation='packet' then
    if not community_private.deployment_payload_exact(p_payload,array['runId']) then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
    return jsonb_build_object('runId',r.run_id,'areaId',r.area_slug,'areaName',r.area_slug,'version',r.version,
      'frozenEvidenceDigest',encode(packet.frozen_digest,'hex'),'predicateOutcomes',packet.checks,
      'failureCodes',failed_codes,'priorDecision',case when r.gate_receipt_id is null then null else 'recorded' end);
  end if;
  decision:=p_payload->>'decision';
  if decision not in ('pass','reject') then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
  if p_operation='request' then
    if not community_private.deployment_payload_exact(p_payload,array['runId','decision']) then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
    digest:=extensions.digest(convert_to(concat_ws('|',r.run_id,r.version,encode(packet.frozen_digest,'hex'),decision,array_to_string(failed_codes,','),uid),'utf8'),'sha256');
    insert into community_private.community_gate_capabilities(run_id,user_id,frozen_digest,grant_id,grant_version,decision,payload_digest,failed_codes,expires_at)
      values(r.run_id,uid,packet.frozen_digest,grant_id,grant_version,decision,digest,failed_codes,statement_timestamp()+interval '30 minutes')
      on conflict (user_id,run_id,frozen_digest) where state='issued' do update set decision=excluded.decision,payload_digest=excluded.payload_digest,failed_codes=excluded.failed_codes,expires_at=excluded.expires_at
      returning * into cap;
    return jsonb_build_object('challengeId',cap.challenge_id,'payloadDigest',encode(cap.payload_digest,'hex'),'expiresAt',cap.expires_at,'decision',cap.decision);
  end if;
  if not community_private.deployment_payload_exact(p_payload,array['runId','challengeId','payloadDigest','decision','expectedRunVersion','idempotencyKey']) then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
  idempotency:=p_payload->>'idempotencyKey';
  if idempotency is null or idempotency !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='community_gate_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_payload->>'challengeId',p_payload->>'payloadDigest',decision,p_payload->>'expectedRunVersion',uid),'utf8'),'sha256');
  select * into prior_command from community_private.community_gate_command_receipts
    where community_gate_command_receipts.idempotency_key=idempotency for update;
  if found then
    if prior_command.run_id<>r.run_id or prior_command.input_digest<>digest then
      raise exception using errcode='22023',message='community_idempotency_mismatch';
    end if;
    return prior_command.result_snapshot;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community-gate:'||idempotency,0));
  select * into cap from community_private.community_gate_capabilities where challenge_id=(p_payload->>'challengeId')::uuid for update;
  if not found or cap.user_id<>uid or cap.state<>'issued' or cap.expires_at<=statement_timestamp()
    or cap.grant_id<>grant_id or cap.grant_version<>grant_version or cap.run_id<>r.run_id
    or cap.frozen_digest<>packet.frozen_digest or cap.decision<>decision
    or encode(cap.payload_digest,'hex')<>p_payload->>'payloadDigest'
    or cap.payload_digest<>extensions.digest(convert_to(concat_ws('|',r.run_id,r.version,encode(packet.frozen_digest,'hex'),decision,array_to_string(failed_codes,','),uid),'utf8'),'sha256')
    or (p_payload->>'expectedRunVersion')::bigint<>r.version then raise exception using errcode='42501',message='community_gate_unavailable'; end if;
  if decision='pass' and cardinality(failed_codes)>0 then raise exception using errcode='55000',message='community_gate_pass_evidence_incomplete'; end if;
  if decision='reject' and cardinality(failed_codes)=0 then raise exception using errcode='55000',message='community_gate_rejection_invalid'; end if;
  insert into community_private.community_evidence_receipts(receipt_kind,responsibility,decision,area_slug,bound_run_id,artifact_binding_digest,signed_payload_digest,external_verified,mfa_verified,recent_authentication,predicates)
    values('community_gate','PrimaryInternalTester',decision,r.area_slug,r.run_id,packet.frozen_digest,cap.payload_digest,true,true,true,
      jsonb_build_object('failedCodes',failed_codes,'frozen_digest',encode(packet.frozen_digest,'hex'))) returning receipt_id into receipt_id;
  update community_private.community_gate_capabilities set state='consumed',consumed_at=statement_timestamp() where challenge_id=cap.challenge_id;
  update community_private.community_activation_runs set gate_receipt_id=receipt_id,state=case when decision='reject' then 'withdrawn' else 'live' end,version=version+1 where run_id=r.run_id;
  if decision='reject' then update community_private.community_catalog_projections set visible=false,version=version+1 where run_id=r.run_id; end if;
  result:=jsonb_build_object('receiptId',receipt_id,'runId',r.run_id,'decision',decision,'failureCodes',failed_codes,'state',case when decision='reject' then 'withdrawn' else 'live' end);
  insert into community_private.community_gate_command_receipts(idempotency_key,challenge_id,run_id,input_digest,result_snapshot) values(idempotency,cap.challenge_id,r.run_id,digest,result);
  return result;
exception when invalid_text_representation then
  raise exception using errcode='42501',message='community_gate_unavailable';
end $$;
alter function app_public.community_gate_command(text,jsonb) owner to community_automation;
revoke all on function app_public.community_gate_command(text,jsonb) from public,anon;
grant execute on function app_public.community_gate_command(text,jsonb) to authenticated;

revoke create on schema community_private,app_public from community_automation;
revoke identity_service,community_automation from postgres;
