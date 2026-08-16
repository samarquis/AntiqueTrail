-- Package 8C: durable, server-owned Controlled Private Beta expansion.
-- The capability is deliberately seeded disabled. This migration creates no
-- human approval, provider receipt, pilot admission, or real-world evidence.

create schema if not exists beta_private;
revoke all on schema beta_private from public, anon, authenticated;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='beta_automation') then
    create role beta_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='beta_evidence_service') then
    create role beta_evidence_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

grant beta_automation,beta_evidence_service to postgres;
grant authenticated,identity_service,catalog_reader to beta_automation;
grant usage on schema beta_private,app_public,partner_private to beta_automation,beta_evidence_service;
grant usage on schema auth,app_private to beta_automation;
grant create on schema beta_private,app_public to beta_automation;
grant execute on function app_private.current_session_is_active(),app_private.current_session_has_mfa(),
  app_private.current_session_recent_auth(interval) to beta_automation;
grant execute on function app_public.catalog_freshness(uuid,timestamptz) to beta_automation;

alter table app_public.stores drop constraint if exists stores_audience_stage;
alter table app_public.stores add constraint stores_audience_stage check (
  (synthetic and audience='synthetic')
  or (not synthetic and audience in ('private_beta','regional_readiness','public'))
);

create table beta_private.beta_capability (
  singleton boolean primary key default true check(singleton),
  state text not null default 'disabled' check(state in ('disabled','open')),
  operational_state text not null default 'blocked' check(operational_state in ('blocked','current')),
  prerequisite_set_digest bytea check(prerequisite_set_digest is null or octet_length(prerequisite_set_digest)=32),
  opened_at timestamptz,
  checked_at timestamptz,
  version bigint not null default 1 check(version>0),
  check((state='disabled' and opened_at is null) or (state='open' and opened_at is not null and prerequisite_set_digest is not null))
);
insert into beta_private.beta_capability(singleton) values(true);

create table beta_private.prerequisite_receipts (
  receipt_kind text primary key check(receipt_kind in ('external_testing_readiness','hc01','security','operations')),
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  externally_verified boolean not null check(externally_verified),
  accepted_at timestamptz not null
);

create table beta_private.product_owner_bindings (
  user_id uuid primary key references auth.users(id) on delete restrict,
  responsibility text not null default 'ProductOwner' check(responsibility='ProductOwner'),
  source_receipt_digest bytea not null check(octet_length(source_receipt_digest)=32),
  state text not null default 'active' check(state in ('active','revoked')),
  bound_at timestamptz not null,
  revoked_at timestamptz,
  check((state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null))
);

create table beta_private.pilot_cohorts (
  cohort_id uuid primary key default extensions.gen_random_uuid(),
  cohort_key text not null unique check(cohort_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  state text not null default 'preparing' check(state in ('preparing','active','paused','withdrawn','completed')),
  current_ordinal smallint not null default 0 check(current_ordinal between 0 and 3),
  readiness_review text not null default 'closed' check(readiness_review in ('closed','open')),
  version bigint not null default 1 check(version>0),
  created_at timestamptz not null default statement_timestamp(),
  check(readiness_review='closed' or current_ordinal=3)
);

create table beta_private.pilot_cohort_accounts (
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  account_role text not null check(account_role in ('shopper','administrator','store_representative')),
  store_id uuid references app_public.stores(id) on delete restrict,
  verified boolean not null check(verified),
  human boolean not null check(human),
  state text not null default 'active' check(state in ('active','revoked')),
  invited_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  primary key(cohort_id,user_id),
  check((account_role='store_representative' and store_id is not null) or (account_role<>'store_representative' and store_id is null)),
  check((state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null))
);

create table beta_private.pilot_visibility_grants (
  visibility_grant_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid references app_public.stores(id) on delete restrict,
  audience text not null default 'private_beta' check(audience='private_beta'),
  state text not null default 'active' check(state in ('active','revoked','expired')),
  granted_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  unique(cohort_id,user_id,store_id),
  check((state='active' and revoked_at is null) or (state<>'active' and revoked_at is not null))
);

create table beta_private.pilot_store_admissions (
  admission_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  representative_user_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'active' check(state in ('active','withdrawn','rolled_back')),
  gate_state text not null default 'pending' check(gate_state in ('pending','passed','rejected')),
  evidence_class text not null default 'real' check(evidence_class='real'),
  admitted_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  unique(cohort_id,ordinal), unique(cohort_id,store_id),
  check((state='active' and ended_at is null) or (state<>'active' and ended_at is not null))
);

create table beta_private.beta_evidence_events (
  evidence_event_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  evidence_class text not null check(evidence_class in ('real','synthetic')),
  check_code text not null check(check_code in (
    'consent','authority','onboarding','store_portal','data_accuracy','direct_publishing',
    'controlled_publishing','shopper_trip','authorization','audit','support','monitoring',
    'recovery','incident','withdrawal','current_verification')),
  status text not null check(status in ('passed','failed')),
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  observed_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default statement_timestamp()
);

create table beta_private.gate_assessments (
  assessment_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  evidence_class text not null check(evidence_class in ('real','synthetic')),
  owner_continue boolean not null,
  useful boolean not null,
  understandable boolean not null,
  direct_edit_or_reviewed_change boolean not null,
  channel_accept_decline_proven boolean not null,
  support_load_accepted boolean not null,
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  observed_at timestamptz not null,
  valid_until timestamptz,
  recorded_at timestamptz not null default statement_timestamp()
);

create table beta_private.beta_defect_events (
  defect_event_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint check(ordinal between 1 and 3),
  evidence_class text not null check(evidence_class in ('real','synthetic')),
  defect_key text not null check(defect_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  severity text not null check(severity in ('blocking','privacy','security','data_loss','other')),
  state text not null check(state in ('open','resolved')),
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp()
);

create table beta_private.operational_fact_events (
  operational_event_id uuid primary key default extensions.gen_random_uuid(),
  fact_kind text not null check(fact_kind in ('support','monitoring','recovery')),
  evidence_class text not null check(evidence_class in ('real','synthetic')),
  status text not null check(status in ('current','blocked')),
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp()
);

create table beta_private.gate_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  decision text not null check(decision in ('pass','reject')),
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  frozen_payload_digest bytea not null check(octet_length(frozen_payload_digest)=32),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check(expires_at>created_at)
);

create table beta_private.gate_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null unique references beta_private.gate_challenges(challenge_id) on delete restrict,
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  decision text not null check(decision in ('pass','reject')),
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  signer_responsibility text not null check(signer_responsibility='ProductOwner'),
  signature_kind text not null check(signature_kind='authenticated_product_owner_mfa'),
  signed_payload_digest bytea not null check(octet_length(signed_payload_digest)=32),
  signed_at timestamptz not null,
  unique(cohort_id,ordinal)
);

create table beta_private.expansion_receipts (
  expansion_receipt_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references beta_private.pilot_cohorts(cohort_id) on delete restrict,
  ordinal smallint not null check(ordinal between 1 and 3),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  signer_responsibility text not null check(signer_responsibility='ProductOwner'),
  signature_kind text not null check(signature_kind='authenticated_product_owner_mfa'),
  signed_command_digest bytea not null check(octet_length(signed_command_digest)=32),
  signed_at timestamptz not null,
  unique(cohort_id,ordinal), unique(cohort_id,store_id)
);

create table beta_private.command_receipts (
  command_receipt_id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_kind text not null check(command_kind in ('complete_gate','admit_store','withdraw_store','recover_cohort')),
  idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_digest bytea not null check(octet_length(request_digest)=32),
  response_body jsonb not null check(jsonb_typeof(response_body)='object'),
  created_at timestamptz not null default statement_timestamp(),
  unique(actor_user_id,command_kind,idempotency_key)
);

create table beta_private.beta_audit_events (
  audit_event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  action text not null check(action in ('capability_opened','gate_challenged','gate_signed','store_admitted','store_withdrawn','store_rolled_back','cohort_recovered','operational_blocked','operational_current')),
  outcome text not null check(outcome in ('completed','blocked','rejected')),
  actor_user_id uuid,
  cohort_id uuid,
  store_id uuid,
  ordinal smallint check(ordinal between 1 and 3),
  event_digest bytea not null check(octet_length(event_digest)=32),
  occurred_at timestamptz not null default statement_timestamp()
);

create or replace function beta_private.deny_mutation() returns trigger language plpgsql as $$
begin raise exception using errcode='55000',message='append_only'; end $$;
create trigger beta_evidence_append_only before update or delete on beta_private.beta_evidence_events for each row execute function beta_private.deny_mutation();
create trigger beta_assessment_append_only before update or delete on beta_private.gate_assessments for each row execute function beta_private.deny_mutation();
create trigger beta_defect_append_only before update or delete on beta_private.beta_defect_events for each row execute function beta_private.deny_mutation();
create trigger beta_operational_append_only before update or delete on beta_private.operational_fact_events for each row execute function beta_private.deny_mutation();
create trigger beta_audit_append_only before update or delete on beta_private.beta_audit_events for each row execute function beta_private.deny_mutation();

create or replace function beta_private.serialize_gate_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('beta-gate-evidence',0));
  return new;
end $$;
alter function beta_private.serialize_gate_evidence() owner to beta_automation;
revoke all on function beta_private.serialize_gate_evidence() from public,anon,authenticated,service_role,beta_evidence_service;
create trigger beta_evidence_decision_lock before insert on beta_private.beta_evidence_events for each statement execute function beta_private.serialize_gate_evidence();
create trigger beta_assessment_decision_lock before insert on beta_private.gate_assessments for each statement execute function beta_private.serialize_gate_evidence();
create trigger beta_defect_decision_lock before insert on beta_private.beta_defect_events for each statement execute function beta_private.serialize_gate_evidence();
create trigger beta_operational_decision_lock before insert on beta_private.operational_fact_events for each statement execute function beta_private.serialize_gate_evidence();

do $$ declare t text; begin
  foreach t in array array[
    'beta_capability','prerequisite_receipts','product_owner_bindings','pilot_cohorts','pilot_cohort_accounts',
    'pilot_visibility_grants','pilot_store_admissions','beta_evidence_events','gate_assessments',
    'beta_defect_events','operational_fact_events','gate_challenges','gate_receipts','expansion_receipts',
    'command_receipts','beta_audit_events'
  ] loop
    execute format('alter table beta_private.%I enable row level security',t);
    execute format('alter table beta_private.%I force row level security',t);
    execute format('revoke all on beta_private.%I from public,anon,authenticated,service_role,beta_automation,beta_evidence_service',t);
  end loop;
end $$;

grant select on beta_private.beta_capability,beta_private.prerequisite_receipts,beta_private.pilot_cohorts,beta_private.pilot_cohort_accounts,beta_private.pilot_visibility_grants,
  beta_private.pilot_store_admissions,beta_private.beta_evidence_events,beta_private.gate_assessments,
  beta_private.beta_defect_events,beta_private.operational_fact_events,beta_private.product_owner_bindings,
  beta_private.gate_challenges,beta_private.gate_receipts,beta_private.expansion_receipts,beta_private.command_receipts to beta_automation;
grant insert,select on beta_private.prerequisite_receipts,beta_private.product_owner_bindings,
  beta_private.pilot_cohorts,beta_private.pilot_cohort_accounts,beta_private.pilot_visibility_grants,
  beta_private.beta_evidence_events,beta_private.gate_assessments,beta_private.beta_defect_events,
  beta_private.operational_fact_events to beta_evidence_service;
grant select,insert,update on beta_private.beta_capability,beta_private.pilot_cohorts,
  beta_private.pilot_visibility_grants,beta_private.pilot_store_admissions,beta_private.gate_challenges,
  beta_private.gate_receipts,beta_private.expansion_receipts,beta_private.command_receipts to beta_automation;
grant insert,select on beta_private.beta_audit_events to beta_automation;

do $$ declare t text; begin
  foreach t in array array['beta_capability','prerequisite_receipts','pilot_cohorts','pilot_cohort_accounts','pilot_visibility_grants','pilot_store_admissions','beta_evidence_events','gate_assessments','beta_defect_events','operational_fact_events','product_owner_bindings','gate_challenges','gate_receipts','expansion_receipts','command_receipts','beta_audit_events'] loop
    execute format('create policy beta_automation_%I on beta_private.%I for all to beta_automation using(true) with check(true)',t,t);
  end loop;
  foreach t in array array['prerequisite_receipts','product_owner_bindings','pilot_cohorts','pilot_cohort_accounts','pilot_visibility_grants','beta_evidence_events','gate_assessments','beta_defect_events','operational_fact_events'] loop
    execute format('create policy beta_evidence_%I on beta_private.%I for all to beta_evidence_service using(true) with check(true)',t,t);
  end loop;
end $$;

grant select(id,email_confirmed_at) on auth.users to beta_automation;
grant select on app_private.role_grants to beta_automation;
create policy beta_automation_role_grants on app_private.role_grants for select to beta_automation using(true);

grant select on partner_private.pilot_consent_receipts,partner_private.store_partnerships,
  partner_private.store_partner_grants,partner_private.listing_claims,partner_private.claim_authority_signals to beta_automation;
create policy beta_automation_consent on partner_private.pilot_consent_receipts for select to beta_automation using(true);
create policy beta_automation_partnership on partner_private.store_partnerships for select to beta_automation using(true);
create policy beta_automation_partner_grant on partner_private.store_partner_grants for select to beta_automation using(true);
create policy beta_automation_claim on partner_private.listing_claims for select to beta_automation using(true);
create policy beta_automation_claim_signal on partner_private.claim_authority_signals for select to beta_automation using(true);
grant select,update(audience,publication_state,updated_at) on app_public.stores to beta_automation;
create policy beta_automation_store_update on app_public.stores for update to beta_automation
  using(not synthetic and exists(select 1 from beta_private.pilot_store_admissions a where a.store_id=id))
  with check(not synthetic and audience in ('private_beta','regional_readiness') and exists(select 1 from beta_private.pilot_store_admissions a where a.store_id=id));

create or replace function beta_private.require_product_owner() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_public.request_user_id();
begin
  if uid is null or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or not exists(select 1 from beta_private.product_owner_bindings b where b.user_id=uid and b.state='active') then
    raise exception using errcode='42501',message='private_beta_unavailable';
  end if;
  return uid;
end $$;
alter function beta_private.require_product_owner() owner to beta_automation;

create or replace function beta_private.real_operations_current(p_now timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  with latest as (
    select distinct on(fact_kind) fact_kind,status,valid_until from beta_private.operational_fact_events
    where evidence_class='real' and observed_at<=p_now order by fact_kind,observed_at desc,recorded_at desc
  ) select count(*)=3 and bool_and(status='current' and valid_until>=p_now) from latest
$$;
alter function beta_private.real_operations_current(timestamptz) owner to beta_automation;

create or replace function beta_private.gate_passable(p_cohort_id uuid,p_ordinal smallint,p_now timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
  with latest_checks as (
    select distinct on(check_code) check_code,status,valid_until from beta_private.beta_evidence_events
    where cohort_id=p_cohort_id and ordinal=p_ordinal and evidence_class='real' and observed_at<=p_now
    order by check_code,observed_at desc,recorded_at desc
  ), latest_assessment as (
    select * from beta_private.gate_assessments where cohort_id=p_cohort_id and ordinal=p_ordinal
      and evidence_class='real' and observed_at<=p_now order by observed_at desc,recorded_at desc limit 1
  ), latest_defects as (
    select distinct on(defect_key) defect_key,severity,state from beta_private.beta_defect_events
    where cohort_id=p_cohort_id and evidence_class='real' and observed_at<=p_now
    order by defect_key,observed_at desc,recorded_at desc
  )
  select (select count(*)=16 and bool_and(status='passed' and (valid_until is null or valid_until>=p_now)) from latest_checks)
    and exists(select 1 from latest_assessment where owner_continue and useful and understandable
      and direct_edit_or_reviewed_change and channel_accept_decline_proven and support_load_accepted
      and (valid_until is null or valid_until>=p_now))
    and not exists(select 1 from latest_defects where state='open' and severity in ('blocking','privacy','security','data_loss'))
    and beta_private.real_operations_current(p_now)
$$;
alter function beta_private.gate_passable(uuid,smallint,timestamptz) owner to beta_automation;

create or replace function beta_private.current_gate_digest(
  p_cohort_id uuid,p_ordinal smallint,p_decision text,p_now timestamptz
) returns bytea language sql stable security definer set search_path='' as $$
  with latest_checks as (
    select distinct on(check_code) evidence_event_id,check_code,status,artifact_digest,observed_at,valid_until
    from beta_private.beta_evidence_events
    where cohort_id=p_cohort_id and ordinal=p_ordinal and evidence_class='real' and observed_at<=p_now
    order by check_code,observed_at desc,recorded_at desc
  ), latest_assessment as (
    select assessment_id,owner_continue,useful,understandable,direct_edit_or_reviewed_change,
      channel_accept_decline_proven,support_load_accepted,artifact_digest,observed_at,valid_until
    from beta_private.gate_assessments
    where cohort_id=p_cohort_id and ordinal=p_ordinal and evidence_class='real' and observed_at<=p_now
    order by observed_at desc,recorded_at desc limit 1
  ), latest_defects as (
    select distinct on(defect_key) defect_event_id,defect_key,severity,state,artifact_digest,observed_at
    from beta_private.beta_defect_events
    where cohort_id=p_cohort_id and evidence_class='real' and observed_at<=p_now
    order by defect_key,observed_at desc,recorded_at desc
  ), latest_operations as (
    select distinct on(fact_kind) operational_event_id,fact_kind,status,artifact_digest,observed_at,valid_until
    from beta_private.operational_fact_events
    where evidence_class='real' and observed_at<=p_now
    order by fact_kind,observed_at desc,recorded_at desc
  ), packet as (
    select jsonb_build_object(
      'cohortId',p_cohort_id,'ordinal',p_ordinal,'decision',p_decision,
      'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.check_code) from latest_checks c),'[]'::jsonb),
      'assessment',coalesce((select to_jsonb(a) from latest_assessment a),'null'::jsonb),
      'defects',coalesce((select jsonb_agg(to_jsonb(d) order by d.defect_key) from latest_defects d),'[]'::jsonb),
      'operations',coalesce((select jsonb_agg(to_jsonb(o) order by o.fact_kind) from latest_operations o),'[]'::jsonb)
    ) body
  )
  select extensions.digest(convert_to(body::text,'UTF8'),'sha256') from packet
$$;
alter function beta_private.current_gate_digest(uuid,smallint,text,timestamptz) owner to beta_automation;

create or replace function beta_private.cohort_accounts_ready(
  p_cohort_id uuid,p_store_id uuid,p_representative_user_id uuid,p_initial boolean
) returns boolean language sql stable security definer set search_path='' as $$
  with active_accounts as (
    select a.* from beta_private.pilot_cohort_accounts a
    join auth.users u on u.id=a.user_id and u.email_confirmed_at is not null
    where a.cohort_id=p_cohort_id and a.state='active' and a.verified and a.human
  ), role_aligned as (
    select a.* from active_accounts a where
      (select count(*) from app_private.role_grants rg where rg.subject_user_id=a.user_id and rg.state='active')=1
      and exists (
      select 1 from app_private.role_grants rg
      where rg.subject_user_id=a.user_id and rg.state='active'
        and rg.role::text=case a.account_role when 'store_representative' then 'representative' else a.account_role end
        and ((a.account_role='store_representative' and rg.store_id=a.store_id) or (a.account_role<>'store_representative' and rg.store_id is null))
    )
  )
  select case when p_initial then
    (select count(*)=4 and count(distinct user_id)=4
      and count(*) filter(where account_role='shopper')=2
      and count(*) filter(where account_role='administrator')=1
      and count(*) filter(where account_role='store_representative')=1
      and bool_and(account_role<>'store_representative' or (user_id=p_representative_user_id and store_id=p_store_id))
      from role_aligned)
    and (select count(*) from beta_private.pilot_cohort_accounts where cohort_id=p_cohort_id and state='active')=4
  else exists(select 1 from role_aligned where account_role='store_representative' and user_id=p_representative_user_id and store_id=p_store_id)
  end
$$;
alter function beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean) owner to beta_automation;

create or replace function beta_private.open_capability() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d bytea;
begin
  if (select count(*) from beta_private.prerequisite_receipts where externally_verified)=4 then
    select extensions.digest(convert_to(string_agg(receipt_kind||':'||encode(artifact_digest,'hex'),'|' order by receipt_kind),'UTF8'),'sha256') into d
    from beta_private.prerequisite_receipts where externally_verified;
  else raise exception using errcode='55000',message='private_beta_prerequisites_incomplete'; end if;
  update beta_private.beta_capability set state='open',prerequisite_set_digest=d,opened_at=statement_timestamp(),version=version+1 where singleton;
  insert into beta_private.beta_audit_events(action,outcome,event_digest) values('capability_opened','completed',d);
  return jsonb_build_object('state','open','prerequisiteDigest',encode(d,'hex'));
end $$;
alter function beta_private.open_capability() owner to beta_automation;
revoke all on function beta_private.open_capability() from public,anon,authenticated,service_role;
grant execute on function beta_private.open_capability() to beta_evidence_service;

create or replace function app_public.beta_get_state(p_cohort_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_public.request_user_id(); result jsonb;
begin
  if uid is null or not app_private.current_session_is_active() or not (
    exists(select 1 from beta_private.product_owner_bindings where user_id=uid and state='active')
    or exists(select 1 from beta_private.pilot_visibility_grants where cohort_id=p_cohort_id and user_id=uid and state='active' and (expires_at is null or expires_at>statement_timestamp()))
  ) then raise exception using errcode='42501',message='private_beta_unavailable'; end if;
  select jsonb_build_object('cohortId',c.cohort_id,'state',c.state,'currentOrdinal',c.current_ordinal,
    'version',c.version,'regionalPublicReadinessReview',c.readiness_review,
    'capabilities',jsonb_build_object('openSignup',false,'publicReviews',false,'anonymousRealStoreAccess',false,
      'publicPromotion',false,'ownerAnalytics',false,'pilotStoreAudience','invited_cohort_only'),
    'admissions',coalesce((select jsonb_agg(jsonb_build_object('ordinal',a.ordinal,'storeId',a.store_id,'representativeAccountId',a.representative_user_id,'state',a.state,'gateState',a.gate_state) order by a.ordinal) from beta_private.pilot_store_admissions a where a.cohort_id=c.cohort_id),'[]'::jsonb))
    into result from beta_private.pilot_cohorts c where c.cohort_id=p_cohort_id;
  if result is null then raise exception using errcode='P0002',message='private_beta_unavailable'; end if;
  return result;
end $$;
alter function app_public.beta_get_state(uuid) owner to beta_automation;

create or replace function app_public.beta_request_gate_decision(p_cohort_id uuid,p_ordinal smallint,p_decision text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=beta_private.require_product_owner(); d bytea; cid uuid; decision_now timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('beta-gate-evidence',0));
  decision_now:=pg_catalog.clock_timestamp();
  if p_ordinal not between 1 and 3 or p_decision not in ('pass','reject')
    or not exists(select 1 from beta_private.pilot_store_admissions where cohort_id=p_cohort_id and ordinal=p_ordinal and state='active')
    or (p_decision='pass' and not beta_private.gate_passable(p_cohort_id,p_ordinal,decision_now)) then
    raise exception using errcode='55000',message='private_beta_gate_unavailable';
  end if;
  d:=beta_private.current_gate_digest(p_cohort_id,p_ordinal,p_decision,decision_now);
  insert into beta_private.gate_challenges(cohort_id,ordinal,decision,signer_user_id,frozen_payload_digest,expires_at)
    values(p_cohort_id,p_ordinal,p_decision,actor,d,decision_now+interval '30 minutes') returning challenge_id into cid;
  insert into beta_private.beta_audit_events(action,outcome,actor_user_id,cohort_id,ordinal,event_digest) values('gate_challenged','completed',actor,p_cohort_id,p_ordinal,d);
  return jsonb_build_object('challengeId',cid,'payloadDigest',encode(d,'hex'),'expiresInSeconds',1800);
end $$;
alter function app_public.beta_request_gate_decision(uuid,smallint,text) owner to beta_automation;

create or replace function app_public.beta_complete_gate_decision(p_challenge_id uuid,p_payload_digest text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=beta_private.require_product_owner(); ch beta_private.gate_challenges%rowtype; req bytea; prior beta_private.command_receipts%rowtype; result jsonb; rid uuid; decision_now timestamptz;
begin
  req:=extensions.digest(convert_to(p_challenge_id::text||':'||p_payload_digest,'UTF8'),'sha256');
  select * into prior from beta_private.command_receipts where actor_user_id=actor and command_kind='complete_gate' and idempotency_key=p_idempotency_key;
  if found then if prior.request_digest<>req then raise exception using errcode='22000',message='idempotency_key_reused'; end if; return prior.response_body; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('beta-gate-evidence',0));
  decision_now:=pg_catalog.clock_timestamp();
  select * into ch from beta_private.gate_challenges where challenge_id=p_challenge_id for update;
  if not found or ch.signer_user_id<>actor or ch.consumed_at is not null or ch.expires_at<decision_now
    or encode(ch.frozen_payload_digest,'hex')<>lower(p_payload_digest)
    or beta_private.current_gate_digest(ch.cohort_id,ch.ordinal,ch.decision,decision_now)<>ch.frozen_payload_digest
    or (ch.decision='pass' and not beta_private.gate_passable(ch.cohort_id,ch.ordinal,decision_now)) then
    raise exception using errcode='55000',message='private_beta_gate_unavailable';
  end if;
  insert into beta_private.gate_receipts(challenge_id,cohort_id,ordinal,decision,signer_user_id,signer_responsibility,signature_kind,signed_payload_digest,signed_at)
    values(ch.challenge_id,ch.cohort_id,ch.ordinal,ch.decision,actor,'ProductOwner','authenticated_product_owner_mfa',ch.frozen_payload_digest,decision_now) returning receipt_id into rid;
  update beta_private.gate_challenges set consumed_at=decision_now where challenge_id=ch.challenge_id;
  update beta_private.pilot_store_admissions set gate_state=case when ch.decision='pass' then 'passed' else 'rejected' end where cohort_id=ch.cohort_id and ordinal=ch.ordinal;
  update beta_private.pilot_cohorts set readiness_review=case when ch.ordinal=3 and ch.decision='pass' then 'open' else readiness_review end,version=version+1 where cohort_id=ch.cohort_id;
  result:=jsonb_build_object('receiptId',rid,'cohortId',ch.cohort_id,'ordinal',ch.ordinal,'decision',ch.decision,'signatureKind','authenticated_product_owner_mfa');
  insert into beta_private.command_receipts(actor_user_id,command_kind,idempotency_key,request_digest,response_body) values(actor,'complete_gate',p_idempotency_key,req,result);
  insert into beta_private.beta_audit_events(action,outcome,actor_user_id,cohort_id,ordinal,event_digest) values('gate_signed','completed',actor,ch.cohort_id,ch.ordinal,ch.frozen_payload_digest);
  return result;
end $$;
alter function app_public.beta_complete_gate_decision(uuid,text,text) owner to beta_automation;

create or replace function app_public.beta_admit_next_store(p_cohort_id uuid,p_store_id uuid,p_representative_user_id uuid,p_expected_cohort_version bigint,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=beta_private.require_product_owner(); c beta_private.pilot_cohorts%rowtype; next_ordinal smallint; req bytea; prior beta_private.command_receipts%rowtype; result jsonb;
begin
  req:=extensions.digest(convert_to(concat_ws(':',p_cohort_id,p_store_id,p_representative_user_id,p_expected_cohort_version),'UTF8'),'sha256');
  select * into prior from beta_private.command_receipts where actor_user_id=actor and command_kind='admit_store' and idempotency_key=p_idempotency_key;
  if found then if prior.request_digest<>req then raise exception using errcode='22000',message='idempotency_key_reused'; end if; return prior.response_body; end if;
  select * into c from beta_private.pilot_cohorts where cohort_id=p_cohort_id for update;
  next_ordinal:=c.current_ordinal+1;
  if not found or c.version<>p_expected_cohort_version or c.state not in ('preparing','active') or next_ordinal not between 1 and 3
    or not exists(select 1 from beta_private.beta_capability where singleton and state='open' and operational_state='current')
    or not app_private.privileged_anchor_is_current()
    or not beta_private.cohort_accounts_ready(p_cohort_id,p_store_id,p_representative_user_id,next_ordinal=1)
    or (next_ordinal>1 and not exists(select 1 from beta_private.gate_receipts where cohort_id=p_cohort_id and ordinal=next_ordinal-1 and decision='pass'))
    or exists(select 1 from beta_private.beta_defect_events d where d.cohort_id=p_cohort_id and d.evidence_class='real' and d.state='open' and d.severity in ('blocking','privacy','security','data_loss') and not exists(select 1 from beta_private.beta_defect_events newer where newer.cohort_id=d.cohort_id and newer.defect_key=d.defect_key and newer.evidence_class='real' and newer.observed_at>d.observed_at))
    or not exists(
      select 1 from app_public.stores s
      join partner_private.store_partnerships p on p.store_id=s.id and p.auth_user_id=p_representative_user_id and p.state='active'
      join partner_private.pilot_consent_receipts cr on cr.consent_receipt_id=p.consent_receipt_id and cr.auth_user_id=p_representative_user_id
      join partner_private.store_partner_grants g on g.partnership_id=p.partnership_id and g.store_id=s.id and g.auth_user_id=p_representative_user_id and g.state='active'
      join partner_private.listing_claims lc on lc.store_id=s.id and lc.claimant_id=p_representative_user_id and lc.state='approved'
      where s.id=p_store_id and not s.synthetic
        and (select count(distinct cas.channel_class) from partner_private.claim_authority_signals cas where cas.claim_id=lc.claim_id and cas.status='verified')>=2
        and (select freshness_state from app_public.catalog_freshness(s.id,statement_timestamp()))='current'
    ) then raise exception using errcode='55000',message='private_beta_admission_unavailable'; end if;
  insert into beta_private.pilot_store_admissions(cohort_id,ordinal,store_id,representative_user_id) values(p_cohort_id,next_ordinal,p_store_id,p_representative_user_id);
  insert into beta_private.pilot_visibility_grants(cohort_id,user_id,store_id)
    select p_cohort_id,user_id,p_store_id from beta_private.pilot_cohort_accounts
    where cohort_id=p_cohort_id and state='active' and verified and human
    on conflict(cohort_id,user_id,store_id) do nothing;
  insert into beta_private.expansion_receipts(cohort_id,ordinal,store_id,signer_user_id,signer_responsibility,signature_kind,signed_command_digest,signed_at)
    values(p_cohort_id,next_ordinal,p_store_id,actor,'ProductOwner','authenticated_product_owner_mfa',req,statement_timestamp());
  update app_public.stores set audience='private_beta',publication_state='active',updated_at=statement_timestamp() where id=p_store_id;
  update beta_private.pilot_cohorts set state='active',current_ordinal=next_ordinal,version=version+1 where cohort_id=p_cohort_id;
  result:=jsonb_build_object('cohortId',p_cohort_id,'ordinal',next_ordinal,'storeId',p_store_id,'state','active');
  insert into beta_private.command_receipts(actor_user_id,command_kind,idempotency_key,request_digest,response_body) values(actor,'admit_store',p_idempotency_key,req,result);
  insert into beta_private.beta_audit_events(action,outcome,actor_user_id,cohort_id,store_id,ordinal,event_digest) values('store_admitted','completed',actor,p_cohort_id,p_store_id,next_ordinal,req);
  return result;
end $$;
alter function app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text) owner to beta_automation;

create or replace function app_public.beta_withdraw_store(p_cohort_id uuid,p_store_id uuid,p_reason_code text,p_expected_cohort_version bigint,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=beta_private.require_product_owner(); c beta_private.pilot_cohorts%rowtype; a beta_private.pilot_store_admissions%rowtype; req bytea; prior beta_private.command_receipts%rowtype; result jsonb;
begin
  if p_reason_code not in ('owner_withdrawn','blocking_defect','scope_leak','operational_stop') then raise exception using errcode='22023',message='private_beta_unavailable'; end if;
  req:=extensions.digest(convert_to(concat_ws(':',p_cohort_id,p_store_id,p_reason_code,p_expected_cohort_version),'UTF8'),'sha256');
  select * into prior from beta_private.command_receipts where actor_user_id=actor and command_kind='withdraw_store' and idempotency_key=p_idempotency_key;
  if found then if prior.request_digest<>req then raise exception using errcode='22000',message='idempotency_key_reused'; end if; return prior.response_body; end if;
  select * into c from beta_private.pilot_cohorts where cohort_id=p_cohort_id for update;
  select * into a from beta_private.pilot_store_admissions where cohort_id=p_cohort_id and store_id=p_store_id and state='active' for update;
  if c.version<>p_expected_cohort_version or a.admission_id is null then raise exception using errcode='55000',message='private_beta_withdrawal_unavailable'; end if;
  update beta_private.pilot_store_admissions set state=case when p_reason_code='owner_withdrawn' then 'withdrawn' else 'rolled_back' end,ended_at=statement_timestamp() where admission_id=a.admission_id;
  update beta_private.pilot_visibility_grants set state='revoked',revoked_at=statement_timestamp() where cohort_id=p_cohort_id and store_id=p_store_id and state='active';
  update app_public.stores set audience='regional_readiness',publication_state='hidden',updated_at=statement_timestamp() where id=p_store_id;
  update beta_private.pilot_cohorts set state='paused',version=version+1 where cohort_id=p_cohort_id;
  result:=jsonb_build_object('cohortId',p_cohort_id,'ordinal',a.ordinal,'storeId',p_store_id,'state',case when p_reason_code='owner_withdrawn' then 'withdrawn' else 'rolled_back' end);
  insert into beta_private.command_receipts(actor_user_id,command_kind,idempotency_key,request_digest,response_body) values(actor,'withdraw_store',p_idempotency_key,req,result);
  insert into beta_private.beta_audit_events(action,outcome,actor_user_id,cohort_id,store_id,ordinal,event_digest) values(case when p_reason_code='owner_withdrawn' then 'store_withdrawn' else 'store_rolled_back' end,'completed',actor,p_cohort_id,p_store_id,a.ordinal,req);
  return result;
end $$;
alter function app_public.beta_withdraw_store(uuid,uuid,text,bigint,text) owner to beta_automation;

create or replace function app_public.beta_recover_cohort(p_cohort_id uuid,p_expected_cohort_version bigint,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=beta_private.require_product_owner(); c beta_private.pilot_cohorts%rowtype; req bytea; prior beta_private.command_receipts%rowtype; result jsonb; recovered_count integer:=0;
begin
  req:=extensions.digest(convert_to(concat_ws(':',p_cohort_id,p_expected_cohort_version),'UTF8'),'sha256');
  select * into prior from beta_private.command_receipts where actor_user_id=actor and command_kind='recover_cohort' and idempotency_key=p_idempotency_key;
  if found then if prior.request_digest<>req then raise exception using errcode='22000',message='idempotency_key_reused'; end if; return prior.response_body; end if;
  select * into c from beta_private.pilot_cohorts where cohort_id=p_cohort_id for update;
  if not found or c.version<>p_expected_cohort_version or c.state<>'paused' or c.current_ordinal not between 1 and 3
    or not exists(select 1 from beta_private.beta_capability where singleton and state='open' and operational_state='current')
    or not beta_private.real_operations_current(statement_timestamp()) or not app_private.privileged_anchor_is_current()
    or exists(select 1 from beta_private.beta_defect_events d where d.cohort_id=p_cohort_id and d.evidence_class='real' and d.state='open' and d.severity in ('blocking','privacy','security','data_loss') and not exists(select 1 from beta_private.beta_defect_events newer where newer.cohort_id=d.cohort_id and newer.defect_key=d.defect_key and newer.evidence_class='real' and newer.observed_at>d.observed_at))
    or exists(
      select 1 from beta_private.pilot_store_admissions a where a.cohort_id=p_cohort_id and a.state='active' and not exists(
        select 1 from partner_private.store_partnerships p
        join partner_private.pilot_consent_receipts cr on cr.consent_receipt_id=p.consent_receipt_id and cr.auth_user_id=a.representative_user_id
        join partner_private.store_partner_grants g on g.partnership_id=p.partnership_id and g.store_id=a.store_id and g.auth_user_id=a.representative_user_id and g.state='active'
        join partner_private.listing_claims lc on lc.store_id=a.store_id and lc.claimant_id=a.representative_user_id and lc.state='approved'
        where p.store_id=a.store_id and p.auth_user_id=a.representative_user_id and p.state='active'
          and (select count(distinct cas.channel_class) from partner_private.claim_authority_signals cas where cas.claim_id=lc.claim_id and cas.status='verified')>=2
          and (select freshness_state from app_public.catalog_freshness(a.store_id,statement_timestamp()))='current'
      )
    ) then raise exception using errcode='55000',message='private_beta_recovery_unavailable'; end if;
  with recovered as (
    update app_public.stores s set audience='private_beta',publication_state='active',updated_at=statement_timestamp()
    from beta_private.pilot_store_admissions a where a.cohort_id=p_cohort_id and a.state='active' and a.store_id=s.id returning s.id
  ) select count(*) into recovered_count from recovered;
  update beta_private.pilot_cohorts set state='active',version=version+1 where cohort_id=p_cohort_id;
  result:=jsonb_build_object('cohortId',p_cohort_id,'state','active','recoveredStores',recovered_count);
  insert into beta_private.command_receipts(actor_user_id,command_kind,idempotency_key,request_digest,response_body) values(actor,'recover_cohort',p_idempotency_key,req,result);
  insert into beta_private.beta_audit_events(action,outcome,actor_user_id,cohort_id,event_digest) values('cohort_recovered','completed',actor,p_cohort_id,req);
  return result;
end $$;
alter function app_public.beta_recover_cohort(uuid,bigint,text) owner to beta_automation;

create or replace function app_public.beta_refresh_operational_latch(p_now timestamptz default statement_timestamp()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare is_current boolean; paused_count integer:=0; hidden_count integer:=0; d bytea;
begin
  select state='open' and beta_private.real_operations_current(p_now) into is_current from beta_private.beta_capability where singleton for update;
  if coalesce(is_current,false) then
    update beta_private.beta_capability set operational_state='current',checked_at=p_now,version=version+1 where singleton and operational_state<>'current';
    d:=extensions.digest(convert_to('current:'||p_now::text,'UTF8'),'sha256');
    insert into beta_private.beta_audit_events(action,outcome,event_digest,occurred_at) values('operational_current','completed',d,p_now);
  else
    update beta_private.beta_capability set operational_state='blocked',checked_at=p_now,version=version+1 where singleton and operational_state<>'blocked';
    update beta_private.pilot_cohorts set state='paused',version=version+1 where state='active'; get diagnostics paused_count=row_count;
    with hidden as (update app_public.stores s set publication_state='hidden',updated_at=p_now from beta_private.pilot_store_admissions a where a.store_id=s.id and a.state='active' and s.audience='private_beta' and s.publication_state<>'hidden' returning s.id) select count(*) into hidden_count from hidden;
    d:=extensions.digest(convert_to('blocked:'||p_now::text,'UTF8'),'sha256');
    insert into beta_private.beta_audit_events(action,outcome,event_digest,occurred_at) values('operational_blocked','blocked',d,p_now);
  end if;
  -- Recovery changes only the latch. Paused cohorts and hidden stores require an explicit human command.
  return jsonb_build_object('state',case when is_current then 'current' else 'blocked' end,'pausedCohorts',paused_count,'hiddenStores',hidden_count);
end $$;
alter function app_public.beta_refresh_operational_latch(timestamptz) owner to beta_automation;

revoke all on function app_public.beta_get_state(uuid),app_public.beta_request_gate_decision(uuid,smallint,text),
  app_public.beta_complete_gate_decision(uuid,text,text),app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text),
  app_public.beta_withdraw_store(uuid,uuid,text,bigint,text),app_public.beta_recover_cohort(uuid,bigint,text),
  app_public.beta_refresh_operational_latch(timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function app_public.beta_get_state(uuid),app_public.beta_request_gate_decision(uuid,smallint,text),
  app_public.beta_complete_gate_decision(uuid,text,text),app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text),
  app_public.beta_withdraw_store(uuid,uuid,text,bigint,text),app_public.beta_recover_cohort(uuid,bigint,text) to authenticated;
grant execute on function app_public.beta_refresh_operational_latch(timestamptz) to service_role;

revoke all on all tables in schema beta_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema beta_private from public,anon,authenticated,service_role;
grant usage,select on sequence beta_private.beta_audit_events_sequence_number_seq to beta_automation;
revoke create on schema beta_private,app_public from beta_automation;
