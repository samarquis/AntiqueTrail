-- Package 12: durable, provider-neutral one-community activation boundary.
-- Human signatures are verified outside this database and recorded here; no
-- transition function creates, signs, or upgrades an evidence receipt.

do $$
begin
  if not exists (select 1 from pg_roles where rolname='community_automation') then
    create role community_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='community_deployment_service') then
    create role community_deployment_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='community_evidence_service') then
    create role community_evidence_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant community_automation to postgres;
create schema if not exists community_private;
revoke all on schema community_private from public, anon, authenticated;
grant usage on schema community_private to community_automation, community_deployment_service, community_evidence_service;
grant create on schema community_private to community_automation;

create table community_private.community_evidence_receipts (
  receipt_id uuid primary key,
  receipt_kind text not null check (receipt_kind in (
    'rg01_pass','selection','catalog_freeze','readiness','cancellation',
    'activation','rollback','reactivation','community_gate'
  )),
  responsibility text not null check (responsibility in ('ProductOwner','PrimaryInternalTester','Operations')),
  decision text not null check (decision in ('pass','reject','cancel')),
  area_slug text not null check (
    area_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(area_slug) between 1 and 80
  ),
  bound_run_id uuid,
  prior_receipt_id uuid references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  artifact_binding_digest bytea,
  store_set_digest bytea,
  signed_payload_digest bytea not null,
  external_verified boolean not null default false,
  mfa_verified boolean not null default false,
  recent_authentication boolean not null default false,
  predicates jsonb not null default '{}'::jsonb,
  signed_at timestamptz not null default statement_timestamp(),
  recorded_at timestamptz not null default statement_timestamp(),
  constraint community_evidence_signed_digest_size check (octet_length(signed_payload_digest)=32),
  constraint community_evidence_artifact_digest_size check (
    artifact_binding_digest is null or octet_length(artifact_binding_digest)=32
  ),
  constraint community_evidence_store_digest_size check (
    store_set_digest is null or octet_length(store_set_digest)=32
  ),
  constraint community_evidence_predicates_object check (jsonb_typeof(predicates)='object'),
  constraint community_evidence_time_order check (recorded_at>=signed_at)
);

create table community_private.community_expansion_root (
  root_id smallint primary key default 1 check (root_id=1),
  last_activation_ordinal smallint not null default 0 check (last_activation_ordinal between 0 and 3),
  last_attempt_sequence bigint not null default 0 check (last_attempt_sequence>=0),
  active_run_id uuid,
  version bigint not null default 1 check (version>0),
  updated_at timestamptz not null default statement_timestamp()
);
insert into community_private.community_expansion_root(root_id) values (1);

create table community_private.community_activation_runs (
  run_id uuid primary key default extensions.gen_random_uuid(),
  attempt_sequence bigint not null unique check (attempt_sequence>0),
  target_ordinal smallint not null check (target_ordinal between 1 and 3),
  activation_ordinal smallint unique check (activation_ordinal between 1 and 3),
  area_slug text not null check (
    area_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(area_slug) between 1 and 80
  ),
  selection_receipt_id uuid not null unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  rg01_receipt_id uuid references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  prior_gate_receipt_id uuid references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  state text not null check (state in ('prepared','readiness_signed','live','withdrawn','cancelled')),
  version bigint not null default 1 check (version>0),
  readiness_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  cancellation_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  activation_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  rollback_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  reactivation_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  gate_receipt_id uuid unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  artifact_binding_digest bytea,
  store_set_digest bytea,
  activated_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint community_run_prerequisite_shape check (
    (target_ordinal=1 and rg01_receipt_id is not null and prior_gate_receipt_id is null)
    or (target_ordinal between 2 and 3 and rg01_receipt_id is null and prior_gate_receipt_id is not null)
  ),
  constraint community_run_artifact_digest_size check (
    artifact_binding_digest is null or octet_length(artifact_binding_digest)=32
  ),
  constraint community_run_store_digest_size check (
    store_set_digest is null or octet_length(store_set_digest)=32
  ),
  constraint community_run_cancel_reason_safe check (
    cancellation_reason is null or (
      cancellation_reason=btrim(cancellation_reason)
      and char_length(cancellation_reason) between 1 and 500
      and cancellation_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint community_run_state_shape check (
    (state='prepared' and readiness_receipt_id is null and activation_ordinal is null
      and activation_receipt_id is null and cancellation_receipt_id is null and cancelled_at is null)
    or (state='readiness_signed' and readiness_receipt_id is not null and activation_ordinal is null
      and activation_receipt_id is null and cancellation_receipt_id is null and cancelled_at is null
      and artifact_binding_digest is not null and store_set_digest is not null)
    or (state='live' and readiness_receipt_id is not null and activation_ordinal=target_ordinal
      and activation_receipt_id is not null and activated_at is not null and cancellation_receipt_id is null)
    or (state='withdrawn' and readiness_receipt_id is not null and activation_ordinal=target_ordinal
      and activation_receipt_id is not null and activated_at is not null and cancellation_receipt_id is null
      and (rollback_receipt_id is not null or gate_receipt_id is not null))
    or (state='cancelled' and activation_ordinal is null and activation_receipt_id is null
      and cancellation_receipt_id is not null and cancelled_at is not null and cancellation_reason is not null)
  )
);
create unique index community_one_non_cancelled_run_per_area
  on community_private.community_activation_runs(area_slug) where state<>'cancelled';

alter table community_private.community_expansion_root
  add constraint community_root_active_run_fk foreign key(active_run_id)
  references community_private.community_activation_runs(run_id) on delete restrict;

create table community_private.community_catalog_projections (
  run_id uuid primary key references community_private.community_activation_runs(run_id) on delete restrict,
  area_slug text not null,
  artifact_binding_digest bytea not null check (octet_length(artifact_binding_digest)=32),
  store_set_digest bytea not null check (octet_length(store_set_digest)=32),
  visible boolean not null default false,
  version bigint not null default 1 check (version>0),
  frozen_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint community_projection_area_safe check (
    area_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(area_slug) between 1 and 80
  )
);

create table community_private.community_projection_stores (
  run_id uuid not null references community_private.community_catalog_projections(run_id) on delete restrict,
  store_id uuid not null,
  frozen_at timestamptz not null default statement_timestamp(),
  primary key(run_id,store_id)
);

create table community_private.community_command_receipts (
  command_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key text not null unique,
  operation text not null check (operation in ('activate','rollback','reactivate')),
  run_id uuid not null references community_private.community_activation_runs(run_id) on delete restrict,
  action_receipt_id uuid not null unique references community_private.community_evidence_receipts(receipt_id) on delete restrict,
  input_digest bytea not null check (octet_length(input_digest)=32),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot)='object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint community_command_key_safe check (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  )
);

create or replace function community_private.reject_append_only_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501', message='community_append_only';
end
$$;

create trigger community_evidence_append_only
before update or delete on community_private.community_evidence_receipts
for each row execute function community_private.reject_append_only_mutation();
create trigger community_commands_append_only
before update or delete on community_private.community_command_receipts
for each row execute function community_private.reject_append_only_mutation();
create trigger community_projection_store_frozen
before update or delete on community_private.community_projection_stores
for each row execute function community_private.reject_append_only_mutation();

create or replace function community_private.guard_root_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.root_id<>old.root_id
    or new.version<>old.version+1
    or new.last_activation_ordinal<old.last_activation_ordinal
    or new.last_activation_ordinal>old.last_activation_ordinal+1
    or new.last_attempt_sequence<old.last_attempt_sequence then
    raise exception using errcode='23514', message='community_root_transition_invalid';
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end
$$;
create trigger community_root_guard
before update on community_private.community_expansion_root
for each row execute function community_private.guard_root_mutation();

create or replace function community_private.guard_run_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.run_id<>old.run_id
    or new.attempt_sequence<>old.attempt_sequence
    or new.target_ordinal<>old.target_ordinal
    or new.area_slug<>old.area_slug
    or new.selection_receipt_id<>old.selection_receipt_id
    or new.rg01_receipt_id is distinct from old.rg01_receipt_id
    or new.prior_gate_receipt_id is distinct from old.prior_gate_receipt_id
    or new.artifact_binding_digest is distinct from old.artifact_binding_digest
    or new.store_set_digest is distinct from old.store_set_digest
    or new.version<>old.version+1
    or (old.activation_ordinal is not null and new.activation_ordinal is distinct from old.activation_ordinal)
    or (old.readiness_receipt_id is not null and new.readiness_receipt_id is distinct from old.readiness_receipt_id)
    or (old.activation_receipt_id is not null and new.activation_receipt_id is distinct from old.activation_receipt_id)
    or (old.rollback_receipt_id is not null and new.rollback_receipt_id is distinct from old.rollback_receipt_id)
    or (old.reactivation_receipt_id is not null and new.reactivation_receipt_id is distinct from old.reactivation_receipt_id)
    or (old.gate_receipt_id is not null and new.gate_receipt_id is distinct from old.gate_receipt_id) then
    raise exception using errcode='23514', message='community_run_immutable_field';
  end if;
  if not (
    (old.state='prepared' and new.state in ('readiness_signed','cancelled'))
    or (old.state='readiness_signed' and new.state in ('live','cancelled'))
    or (old.state='live' and new.state='withdrawn')
    or (old.state='withdrawn' and new.state='live')
  ) then
    raise exception using errcode='23514', message='community_run_transition_invalid';
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end
$$;
create trigger community_run_guard
before update on community_private.community_activation_runs
for each row execute function community_private.guard_run_mutation();

create or replace function community_private.validate_run_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  selection_receipt community_private.community_evidence_receipts%rowtype;
  prerequisite_receipt community_private.community_evidence_receipts%rowtype;
  readiness_receipt community_private.community_evidence_receipts%rowtype;
begin
  select * into selection_receipt from community_private.community_evidence_receipts
    where receipt_id=new.selection_receipt_id;
  if not found or not selection_receipt.external_verified
    or selection_receipt.receipt_kind<>'selection'
    or selection_receipt.responsibility<>'ProductOwner'
    or selection_receipt.decision<>'pass'
    or selection_receipt.area_slug<>new.area_slug
    or selection_receipt.predicates->'eligible_small_community' is distinct from 'true'::jsonb then
    raise exception using errcode='42501', message='community_selection_evidence_invalid';
  end if;

  if new.target_ordinal=1 then
    select * into prerequisite_receipt from community_private.community_evidence_receipts
      where receipt_id=new.rg01_receipt_id;
    if not found or not prerequisite_receipt.external_verified
      or prerequisite_receipt.receipt_kind<>'rg01_pass'
      or prerequisite_receipt.responsibility<>'ProductOwner'
      or prerequisite_receipt.decision<>'pass'
      or selection_receipt.prior_receipt_id is distinct from prerequisite_receipt.receipt_id then
      raise exception using errcode='42501', message='community_rg01_evidence_invalid';
    end if;
  else
    select * into prerequisite_receipt from community_private.community_evidence_receipts
      where receipt_id=new.prior_gate_receipt_id;
    if not found or not prerequisite_receipt.external_verified
      or prerequisite_receipt.receipt_kind<>'community_gate'
      or prerequisite_receipt.responsibility<>'PrimaryInternalTester'
      or prerequisite_receipt.decision<>'pass'
      or not prerequisite_receipt.mfa_verified
      or not prerequisite_receipt.recent_authentication
      or selection_receipt.prior_receipt_id is distinct from prerequisite_receipt.receipt_id then
      raise exception using errcode='42501', message='community_prior_gate_evidence_invalid';
    end if;
  end if;

  if new.state in ('readiness_signed','live','withdrawn') then
    select * into readiness_receipt from community_private.community_evidence_receipts
      where receipt_id=new.readiness_receipt_id;
    if not found or not readiness_receipt.external_verified
      or readiness_receipt.receipt_kind<>'readiness'
      or readiness_receipt.responsibility<>'ProductOwner'
      or readiness_receipt.decision<>'pass'
      or readiness_receipt.bound_run_id is distinct from new.run_id
      or readiness_receipt.area_slug<>new.area_slug
      or readiness_receipt.artifact_binding_digest is distinct from new.artifact_binding_digest
      or readiness_receipt.store_set_digest is distinct from new.store_set_digest
      or readiness_receipt.predicates->'all_predicates_pass' is distinct from 'true'::jsonb then
      raise exception using errcode='42501', message='community_readiness_evidence_invalid';
    end if;
  end if;
  return new;
end
$$;
create trigger community_run_evidence_guard
before insert or update on community_private.community_activation_runs
for each row execute function community_private.validate_run_evidence();

create or replace function community_private.guard_projection_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.run_id<>old.run_id
    or new.area_slug<>old.area_slug
    or new.artifact_binding_digest<>old.artifact_binding_digest
    or new.store_set_digest<>old.store_set_digest
    or new.frozen_at<>old.frozen_at
    or new.version<>old.version+1
    or new.visible=old.visible then
    raise exception using errcode='23514', message='community_projection_transition_invalid';
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end
$$;
create trigger community_projection_guard
before update on community_private.community_catalog_projections
for each row execute function community_private.guard_projection_mutation();

alter table community_private.community_evidence_receipts enable row level security;
alter table community_private.community_evidence_receipts force row level security;
alter table community_private.community_expansion_root enable row level security;
alter table community_private.community_expansion_root force row level security;
alter table community_private.community_activation_runs enable row level security;
alter table community_private.community_activation_runs force row level security;
alter table community_private.community_catalog_projections enable row level security;
alter table community_private.community_catalog_projections force row level security;
alter table community_private.community_projection_stores enable row level security;
alter table community_private.community_projection_stores force row level security;
alter table community_private.community_command_receipts enable row level security;
alter table community_private.community_command_receipts force row level security;

grant select,insert,update,delete on all tables in schema community_private to community_automation;
grant select,insert on community_private.community_evidence_receipts to community_evidence_service;

create policy community_automation_evidence on community_private.community_evidence_receipts
  for all to community_automation using (true) with check (true);
create policy community_automation_root on community_private.community_expansion_root
  for all to community_automation using (true) with check (true);
create policy community_automation_runs on community_private.community_activation_runs
  for all to community_automation using (true) with check (true);
create policy community_automation_projections on community_private.community_catalog_projections
  for all to community_automation using (true) with check (true);
create policy community_automation_projection_stores on community_private.community_projection_stores
  for all to community_automation using (true) with check (true);
create policy community_automation_commands on community_private.community_command_receipts
  for all to community_automation using (true) with check (true);
create policy community_evidence_service_read on community_private.community_evidence_receipts
  for select to community_evidence_service using (true);
create policy community_evidence_service_insert on community_private.community_evidence_receipts
  for insert to community_evidence_service with check (true);

create or replace function community_private.assert_action_receipt(
  p_receipt_id uuid,
  p_kind text,
  p_run_id uuid,
  p_area_slug text,
  p_artifact_digest bytea,
  p_store_digest bytea,
  p_required_predicates text[]
)
returns void language plpgsql stable security definer set search_path='' as $$
declare
  receipt community_private.community_evidence_receipts%rowtype;
  predicate_name text;
begin
  select * into receipt
  from community_private.community_evidence_receipts
  where receipt_id=p_receipt_id;
  if not found or not receipt.external_verified then
    raise exception using errcode='42501', message='community_receipt_not_verified';
  end if;
  if receipt.receipt_kind<>p_kind
    or receipt.responsibility<>'ProductOwner'
    or receipt.decision<>'pass'
    or receipt.bound_run_id is distinct from p_run_id
    or receipt.area_slug<>p_area_slug
    or receipt.artifact_binding_digest is distinct from p_artifact_digest
    or receipt.store_set_digest is distinct from p_store_digest then
    raise exception using errcode='22023', message='community_receipt_binding_invalid';
  end if;
  foreach predicate_name in array p_required_predicates loop
    if receipt.predicates->predicate_name is distinct from 'true'::jsonb then
      raise exception using errcode='42501', message='community_receipt_predicates_incomplete';
    end if;
  end loop;
  if exists(
    select 1 from community_private.community_command_receipts
    where action_receipt_id=p_receipt_id
  ) then
    raise exception using errcode='22023', message='community_receipt_reused';
  end if;
end
$$;

create or replace function community_private.activate_community(
  p_run_id uuid,
  p_activation_receipt_id uuid,
  p_expected_root_version bigint,
  p_expected_run_version bigint,
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  projection_row community_private.community_catalog_projections%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_activation_receipt_id is null
    or p_expected_root_version is null or p_expected_run_version is null
    or p_idempotency_key is null or p_input_digest is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'activate' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_activation_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;

  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  select * into strict run_row from community_private.community_activation_runs where run_id=p_run_id for update;
  select * into strict projection_row from community_private.community_catalog_projections where run_id=p_run_id for update;
  if root_row.version<>p_expected_root_version or run_row.version<>p_expected_run_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is distinct from p_run_id
    or run_row.state<>'readiness_signed'
    or run_row.activation_ordinal is not null
    or run_row.target_ordinal<>root_row.last_activation_ordinal+1
    or projection_row.visible
    or projection_row.area_slug<>run_row.area_slug
    or projection_row.artifact_binding_digest<>run_row.artifact_binding_digest
    or projection_row.store_set_digest<>run_row.store_set_digest
    or (select count(*) from community_private.community_projection_stores where run_id=p_run_id)<2 then
    raise exception using errcode='55000', message='community_activation_state_invalid';
  end if;
  perform community_private.assert_action_receipt(
    p_activation_receipt_id,'activation',p_run_id,run_row.area_slug,
    run_row.artifact_binding_digest,run_row.store_set_digest,
    array['signed_frozen_artifacts','recovery_capacity','channel_consents',
      'canonical_route_bound','schema_config_bound','zero_blocking_defects']
  );

  update community_private.community_catalog_projections
    set visible=true,version=version+1 where run_id=p_run_id;
  update community_private.community_activation_runs
    set state='live',activation_ordinal=target_ordinal,
      activation_receipt_id=p_activation_receipt_id,activated_at=statement_timestamp(),version=version+1
    where run_id=p_run_id returning * into run_row;
  update community_private.community_expansion_root
    set last_activation_ordinal=run_row.target_ordinal,active_run_id=null,version=version+1
    where root_id=1 returning * into root_row;
  result:=jsonb_build_object(
    'run_id',p_run_id,'state','live','activation_ordinal',run_row.activation_ordinal,
    'root_version',root_row.version,'run_version',run_row.version,'visible',true
  );
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'activate',p_run_id,p_activation_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_activation_state_invalid';
end
$$;

create or replace function community_private.rollback_community(
  p_run_id uuid,
  p_rollback_receipt_id uuid,
  p_expected_root_version bigint,
  p_expected_run_version bigint,
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  projection_row community_private.community_catalog_projections%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_rollback_receipt_id is null
    or p_expected_root_version is null or p_expected_run_version is null
    or p_idempotency_key is null or p_input_digest is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'rollback' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_rollback_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;

  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  select * into strict run_row from community_private.community_activation_runs where run_id=p_run_id for update;
  select * into strict projection_row from community_private.community_catalog_projections where run_id=p_run_id for update;
  if root_row.version<>p_expected_root_version or run_row.version<>p_expected_run_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is not null or run_row.state<>'live'
    or run_row.activation_ordinal is distinct from root_row.last_activation_ordinal
    or not projection_row.visible then
    raise exception using errcode='55000', message='community_rollback_state_invalid';
  end if;
  perform community_private.assert_action_receipt(
    p_rollback_receipt_id,'rollback',p_run_id,run_row.area_slug,
    run_row.artifact_binding_digest,run_row.store_set_digest,
    array['rollback_authorized','projection_stop_confirmed','artifact_bound']
  );

  update community_private.community_catalog_projections
    set visible=false,version=version+1 where run_id=p_run_id;
  update community_private.community_activation_runs
    set state='withdrawn',rollback_receipt_id=p_rollback_receipt_id,version=version+1
    where run_id=p_run_id returning * into run_row;
  update community_private.community_expansion_root
    set version=version+1 where root_id=1 returning * into root_row;
  result:=jsonb_build_object(
    'run_id',p_run_id,'state','withdrawn','activation_ordinal',run_row.activation_ordinal,
    'root_version',root_row.version,'run_version',run_row.version,'visible',false
  );
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'rollback',p_run_id,p_rollback_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_rollback_state_invalid';
end
$$;

create or replace function community_private.reactivate_community(
  p_run_id uuid,
  p_reactivation_receipt_id uuid,
  p_expected_root_version bigint,
  p_expected_run_version bigint,
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  projection_row community_private.community_catalog_projections%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_reactivation_receipt_id is null
    or p_expected_root_version is null or p_expected_run_version is null
    or p_idempotency_key is null or p_input_digest is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'reactivate' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_reactivation_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;

  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  select * into strict run_row from community_private.community_activation_runs where run_id=p_run_id for update;
  select * into strict projection_row from community_private.community_catalog_projections where run_id=p_run_id for update;
  if root_row.version<>p_expected_root_version or run_row.version<>p_expected_run_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is not null or run_row.state<>'withdrawn'
    or run_row.activation_ordinal is distinct from root_row.last_activation_ordinal
    or projection_row.visible then
    raise exception using errcode='55000', message='community_reactivation_state_invalid';
  end if;
  perform community_private.assert_action_receipt(
    p_reactivation_receipt_id,'reactivation',p_run_id,run_row.area_slug,
    run_row.artifact_binding_digest,run_row.store_set_digest,
    array['repair_readiness','recovery_capacity','same_store_set','channel_consents']
  );

  update community_private.community_catalog_projections
    set visible=true,version=version+1 where run_id=p_run_id;
  update community_private.community_activation_runs
    set state='live',reactivation_receipt_id=p_reactivation_receipt_id,version=version+1
    where run_id=p_run_id returning * into run_row;
  update community_private.community_expansion_root
    set version=version+1 where root_id=1 returning * into root_row;
  result:=jsonb_build_object(
    'run_id',p_run_id,'state','live','activation_ordinal',run_row.activation_ordinal,
    'root_version',root_row.version,'run_version',run_row.version,'visible',true
  );
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'reactivate',p_run_id,p_reactivation_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_reactivation_state_invalid';
end
$$;

alter function community_private.reject_append_only_mutation() owner to community_automation;
alter function community_private.guard_root_mutation() owner to community_automation;
alter function community_private.guard_run_mutation() owner to community_automation;
alter function community_private.validate_run_evidence() owner to community_automation;
alter function community_private.guard_projection_mutation() owner to community_automation;
alter function community_private.assert_action_receipt(uuid,text,uuid,text,bytea,bytea,text[]) owner to community_automation;
alter function community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea) owner to community_automation;
alter function community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea) owner to community_automation;
alter function community_private.reactivate_community(uuid,uuid,bigint,bigint,text,bytea) owner to community_automation;

revoke all on function community_private.reject_append_only_mutation() from public, anon, authenticated;
revoke all on function community_private.guard_root_mutation() from public, anon, authenticated;
revoke all on function community_private.guard_run_mutation() from public, anon, authenticated;
revoke all on function community_private.validate_run_evidence() from public, anon, authenticated;
revoke all on function community_private.guard_projection_mutation() from public, anon, authenticated;
revoke all on function community_private.assert_action_receipt(uuid,text,uuid,text,bytea,bytea,text[]) from public, anon, authenticated;
revoke all on function community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea) from public, anon, authenticated;
revoke all on function community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea) from public, anon, authenticated;
revoke all on function community_private.reactivate_community(uuid,uuid,bigint,bigint,text,bytea) from public, anon, authenticated;
grant execute on function community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea) to community_deployment_service;
grant execute on function community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea) to community_deployment_service;
grant execute on function community_private.reactivate_community(uuid,uuid,bigint,bigint,text,bytea) to community_deployment_service;

revoke create on schema community_private from community_automation;
revoke community_automation from postgres;
