-- Package 12 follow-on: durable preparation commands. Evidence is supplied by
-- the evidence service; these functions never create or upgrade receipts.

grant community_automation to postgres;
grant create on schema community_private to community_automation;

alter table community_private.community_command_receipts
  drop constraint community_command_receipts_operation_check;
alter table community_private.community_command_receipts
  add constraint community_command_receipts_operation_check
  check (operation in ('prepare','freeze','sign','cancel','activate','rollback','reactivate'));

create or replace function community_private.guard_run_mutation()
returns trigger language plpgsql set search_path='' as $$
declare
  is_freeze boolean;
begin
  is_freeze := old.state='prepared' and new.state='prepared'
    and old.artifact_binding_digest is null and old.store_set_digest is null
    and new.artifact_binding_digest is not null and new.store_set_digest is not null;
  if new.run_id<>old.run_id
    or new.attempt_sequence<>old.attempt_sequence
    or new.target_ordinal<>old.target_ordinal
    or new.area_slug<>old.area_slug
    or new.selection_receipt_id<>old.selection_receipt_id
    or new.rg01_receipt_id is distinct from old.rg01_receipt_id
    or new.prior_gate_receipt_id is distinct from old.prior_gate_receipt_id
    or (not is_freeze and new.artifact_binding_digest is distinct from old.artifact_binding_digest)
    or (not is_freeze and new.store_set_digest is distinct from old.store_set_digest)
    or new.version<>old.version+1
    or (old.activation_ordinal is not null and new.activation_ordinal is distinct from old.activation_ordinal)
    or (old.readiness_receipt_id is not null and new.readiness_receipt_id is distinct from old.readiness_receipt_id)
    or (old.cancellation_receipt_id is not null and new.cancellation_receipt_id is distinct from old.cancellation_receipt_id)
    or (old.activation_receipt_id is not null and new.activation_receipt_id is distinct from old.activation_receipt_id)
    or (old.rollback_receipt_id is not null and new.rollback_receipt_id is distinct from old.rollback_receipt_id)
    or (old.reactivation_receipt_id is not null and new.reactivation_receipt_id is distinct from old.reactivation_receipt_id)
    or (old.gate_receipt_id is not null and new.gate_receipt_id is distinct from old.gate_receipt_id) then
    raise exception using errcode='23514', message='community_run_immutable_field';
  end if;
  if not (
    is_freeze
    or (old.state='prepared' and new.state in ('readiness_signed','cancelled'))
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

create or replace function community_private.prepare_community(
  p_run_id uuid,
  p_area_slug text,
  p_target_ordinal smallint,
  p_selection_receipt_id uuid,
  p_prerequisite_receipt_id uuid,
  p_expected_root_version bigint,
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_area_slug is null or p_target_ordinal is null
    or p_selection_receipt_id is null or p_prerequisite_receipt_id is null
    or p_expected_root_version is null or p_idempotency_key is null or p_input_digest is null
    or p_area_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_area_slug)>80
    or p_target_ordinal not between 1 and 3
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'prepare' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_selection_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;

  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  if root_row.version<>p_expected_root_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is not null
    or p_target_ordinal<>root_row.last_activation_ordinal+1 then
    raise exception using errcode='55000', message='community_prepare_state_invalid';
  end if;
  insert into community_private.community_activation_runs(
    run_id,attempt_sequence,target_ordinal,area_slug,selection_receipt_id,
    rg01_receipt_id,prior_gate_receipt_id,state
  ) values (
    p_run_id,root_row.last_attempt_sequence+1,p_target_ordinal,p_area_slug,p_selection_receipt_id,
    case when p_target_ordinal=1 then p_prerequisite_receipt_id end,
    case when p_target_ordinal>1 then p_prerequisite_receipt_id end,'prepared'
  ) returning * into run_row;
  update community_private.community_expansion_root
    set active_run_id=p_run_id,last_attempt_sequence=run_row.attempt_sequence,version=version+1
    where root_id=1 returning * into root_row;
  result:=jsonb_build_object('run_id',p_run_id,'state','prepared',
    'target_ordinal',p_target_ordinal,'root_version',root_row.version,'run_version',run_row.version);
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'prepare',p_run_id,p_selection_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_prepare_state_invalid';
end
$$;

create or replace function community_private.freeze_community(
  p_run_id uuid,
  p_freeze_receipt_id uuid,
  p_expected_root_version bigint,
  p_expected_run_version bigint,
  p_artifact_digest bytea,
  p_store_digest bytea,
  p_store_ids uuid[],
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  receipt community_private.community_evidence_receipts%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_freeze_receipt_id is null
    or p_expected_root_version is null or p_expected_run_version is null
    or p_artifact_digest is null or p_store_digest is null or p_store_ids is null
    or cardinality(p_store_ids)<2
    or (select count(distinct value) from unnest(p_store_ids) as value)<>cardinality(p_store_ids)
    or array_position(p_store_ids,null) is not null
    or p_idempotency_key is null or p_input_digest is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_artifact_digest)<>32 or octet_length(p_store_digest)<>32
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'freeze' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_freeze_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;
  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  select * into strict run_row from community_private.community_activation_runs where run_id=p_run_id for update;
  if root_row.version<>p_expected_root_version or run_row.version<>p_expected_run_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is distinct from p_run_id or run_row.state<>'prepared'
    or run_row.artifact_binding_digest is not null or run_row.store_set_digest is not null then
    raise exception using errcode='55000', message='community_freeze_state_invalid';
  end if;
  select * into receipt from community_private.community_evidence_receipts where receipt_id=p_freeze_receipt_id;
  if not found or not receipt.external_verified or receipt.receipt_kind<>'catalog_freeze'
    or receipt.responsibility<>'ProductOwner' or receipt.decision<>'pass'
    or receipt.bound_run_id is distinct from p_run_id or receipt.area_slug<>run_row.area_slug
    or receipt.artifact_binding_digest is distinct from p_artifact_digest
    or receipt.store_set_digest is distinct from p_store_digest
    or receipt.predicates->'artifact_binding_frozen' is distinct from 'true'::jsonb
    or receipt.predicates->'store_set_frozen' is distinct from 'true'::jsonb then
    raise exception using errcode='42501', message='community_freeze_evidence_invalid';
  end if;
  if exists(select 1 from community_private.community_command_receipts where action_receipt_id=p_freeze_receipt_id) then
    raise exception using errcode='22023', message='community_receipt_reused';
  end if;
  insert into community_private.community_catalog_projections(
    run_id,area_slug,artifact_binding_digest,store_set_digest
  ) values (p_run_id,run_row.area_slug,p_artifact_digest,p_store_digest);
  insert into community_private.community_projection_stores(run_id,store_id)
    select p_run_id,value from unnest(p_store_ids) as value;
  update community_private.community_activation_runs
    set artifact_binding_digest=p_artifact_digest,store_set_digest=p_store_digest,version=version+1
    where run_id=p_run_id returning * into run_row;
  result:=jsonb_build_object('run_id',p_run_id,'state','prepared','frozen',true,
    'root_version',root_row.version,'run_version',run_row.version,'store_count',cardinality(p_store_ids));
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'freeze',p_run_id,p_freeze_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_freeze_state_invalid';
end
$$;

create or replace function community_private.sign_community_readiness(
  p_run_id uuid,
  p_readiness_receipt_id uuid,
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
  if p_run_id is null or p_readiness_receipt_id is null
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
    if command_row.operation<>'sign' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_readiness_receipt_id
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
  if root_row.active_run_id is distinct from p_run_id or run_row.state<>'prepared'
    or run_row.artifact_binding_digest is null or run_row.store_set_digest is null
    or projection_row.visible or projection_row.artifact_binding_digest<>run_row.artifact_binding_digest
    or projection_row.store_set_digest<>run_row.store_set_digest
    or (select count(*) from community_private.community_projection_stores where run_id=p_run_id)<2 then
    raise exception using errcode='55000', message='community_sign_state_invalid';
  end if;
  if exists(select 1 from community_private.community_command_receipts where action_receipt_id=p_readiness_receipt_id) then
    raise exception using errcode='22023', message='community_receipt_reused';
  end if;
  update community_private.community_activation_runs
    set state='readiness_signed',readiness_receipt_id=p_readiness_receipt_id,version=version+1
    where run_id=p_run_id returning * into run_row;
  result:=jsonb_build_object('run_id',p_run_id,'state','readiness_signed',
    'root_version',root_row.version,'run_version',run_row.version);
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'sign',p_run_id,p_readiness_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_sign_state_invalid';
end
$$;

create or replace function community_private.cancel_community(
  p_run_id uuid,
  p_cancellation_receipt_id uuid,
  p_reason text,
  p_expected_root_version bigint,
  p_expected_run_version bigint,
  p_idempotency_key text,
  p_input_digest bytea
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  root_row community_private.community_expansion_root%rowtype;
  run_row community_private.community_activation_runs%rowtype;
  receipt community_private.community_evidence_receipts%rowtype;
  command_row community_private.community_command_receipts%rowtype;
  result jsonb;
begin
  if p_run_id is null or p_cancellation_receipt_id is null or p_reason is null
    or p_reason<>btrim(p_reason) or char_length(p_reason) not between 1 and 500
    or p_reason ~ '[[:cntrl:]]' or p_expected_root_version is null or p_expected_run_version is null
    or p_idempotency_key is null or p_input_digest is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or octet_length(p_input_digest)<>32 then
    raise exception using errcode='22023', message='community_command_input_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('community:'||p_idempotency_key,0));
  select * into command_row from community_private.community_command_receipts
    where idempotency_key=p_idempotency_key for update;
  if found then
    if command_row.operation<>'cancel' or command_row.run_id<>p_run_id
      or command_row.action_receipt_id<>p_cancellation_receipt_id
      or command_row.input_digest<>p_input_digest then
      raise exception using errcode='22023', message='community_idempotency_mismatch';
    end if;
    return command_row.result_snapshot;
  end if;
  select * into strict root_row from community_private.community_expansion_root where root_id=1 for update;
  select * into strict run_row from community_private.community_activation_runs where run_id=p_run_id for update;
  if root_row.version<>p_expected_root_version or run_row.version<>p_expected_run_version then
    raise exception using errcode='40001', message='community_version_conflict';
  end if;
  if root_row.active_run_id is distinct from p_run_id or run_row.state not in ('prepared','readiness_signed') then
    raise exception using errcode='55000', message='community_cancel_state_invalid';
  end if;
  select * into receipt from community_private.community_evidence_receipts where receipt_id=p_cancellation_receipt_id;
  if not found or not receipt.external_verified or receipt.receipt_kind<>'cancellation'
    or receipt.responsibility<>'ProductOwner' or receipt.decision<>'cancel'
    or receipt.bound_run_id is distinct from p_run_id or receipt.area_slug<>run_row.area_slug
    or receipt.artifact_binding_digest is distinct from run_row.artifact_binding_digest
    or receipt.store_set_digest is distinct from run_row.store_set_digest
    or receipt.predicates->'cancel_authorized' is distinct from 'true'::jsonb then
    raise exception using errcode='42501', message='community_cancellation_evidence_invalid';
  end if;
  if exists(select 1 from community_private.community_command_receipts where action_receipt_id=p_cancellation_receipt_id) then
    raise exception using errcode='22023', message='community_receipt_reused';
  end if;
  update community_private.community_activation_runs
    set state='cancelled',cancellation_receipt_id=p_cancellation_receipt_id,
      cancelled_at=statement_timestamp(),cancellation_reason=p_reason,version=version+1
    where run_id=p_run_id returning * into run_row;
  update community_private.community_expansion_root
    set active_run_id=null,version=version+1 where root_id=1 returning * into root_row;
  result:=jsonb_build_object('run_id',p_run_id,'state','cancelled',
    'root_version',root_row.version,'run_version',run_row.version);
  insert into community_private.community_command_receipts(
    idempotency_key,operation,run_id,action_receipt_id,input_digest,result_snapshot
  ) values (p_idempotency_key,'cancel',p_run_id,p_cancellation_receipt_id,p_input_digest,result);
  return result;
exception
  when no_data_found then
    raise exception using errcode='55000', message='community_cancel_state_invalid';
end
$$;

alter function community_private.guard_run_mutation() owner to community_automation;
alter function community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea) owner to community_automation;
alter function community_private.freeze_community(uuid,uuid,bigint,bigint,bytea,bytea,uuid[],text,bytea) owner to community_automation;
alter function community_private.sign_community_readiness(uuid,uuid,bigint,bigint,text,bytea) owner to community_automation;
alter function community_private.cancel_community(uuid,uuid,text,bigint,bigint,text,bytea) owner to community_automation;

revoke all on function community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea) from public,anon,authenticated;
revoke all on function community_private.freeze_community(uuid,uuid,bigint,bigint,bytea,bytea,uuid[],text,bytea) from public,anon,authenticated;
revoke all on function community_private.sign_community_readiness(uuid,uuid,bigint,bigint,text,bytea) from public,anon,authenticated;
revoke all on function community_private.cancel_community(uuid,uuid,text,bigint,bigint,text,bytea) from public,anon,authenticated;
grant execute on function community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea) to community_deployment_service;
grant execute on function community_private.freeze_community(uuid,uuid,bigint,bigint,bytea,bytea,uuid[],text,bytea) to community_deployment_service;
grant execute on function community_private.sign_community_readiness(uuid,uuid,bigint,bigint,text,bytea) to community_deployment_service;
grant execute on function community_private.cancel_community(uuid,uuid,text,bigint,bigint,text,bytea) to community_deployment_service;

revoke create on schema community_private from community_automation;
revoke community_automation from postgres;
