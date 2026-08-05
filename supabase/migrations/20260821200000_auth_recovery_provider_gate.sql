-- E-01 provider-neutral password recovery. The browser can request only this
-- bounded operation; real delivery remains disabled until a server-owned
-- accepted capability is activated and a provider adapter is deployed.

grant identity_service to postgres;
grant usage,create on schema app_private to identity_service;
grant usage,create on schema app_public to identity_service;

create table app_private.email_delivery_capability (
  id smallint primary key default 1 check (id=1),
  state text not null default 'disabled' check (state in ('disabled','draining','open')),
  provider_key text,
  provider_version text,
  contract_receipt_id text,
  changed_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check (version>0),
  constraint email_delivery_open_shape check (
    state<>'open' or (
      provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'
      and char_length(provider_version) between 1 and 64
      and contract_receipt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
  )
);
insert into app_private.email_delivery_capability(id) values (1) on conflict(id) do nothing;

create table app_private.auth_recovery_operations (
  operation_id uuid primary key default extensions.gen_random_uuid(),
  recipient_hmac bytea not null check(octet_length(recipient_hmac)=32),
  idempotency_key text not null unique check(idempotency_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  expected_capability_version bigint not null check(expected_capability_version>0),
  state text not null check(state in ('blocked','reserved','calling','reconciliation_required','settled_no_effect','settled_delivered')),
  provider_outcome text check(provider_outcome is null or provider_outcome in ('confirmed_delivered','confirmed_not_delivered','unknown')),
  call_started_at timestamptz,
  call_deadline timestamptz,
  finality_due_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  settled_at timestamptz,
  version bigint not null default 1 check(version>0),
  constraint auth_recovery_call_shape check(
    (call_started_at is null and call_deadline is null and finality_due_at is null)
    or (call_started_at is not null and call_deadline>call_started_at and finality_due_at>=call_deadline)
  ),
  constraint auth_recovery_settlement_shape check(
    (state in ('settled_no_effect','settled_delivered','blocked') and settled_at is not null)
    or (state not in ('settled_no_effect','settled_delivered','blocked') and settled_at is null)
  ),
  constraint auth_recovery_outcome_shape check(
    (state='settled_delivered' and provider_outcome='confirmed_delivered')
    or (state in ('settled_no_effect','blocked') and provider_outcome='confirmed_not_delivered')
    or (state='reconciliation_required' and provider_outcome='unknown')
    or (state in ('reserved','calling') and provider_outcome is null)
  )
);
create index auth_recovery_nonterminal_idx on app_private.auth_recovery_operations(state,finality_due_at)
where state in ('reserved','calling','reconciliation_required');

alter table app_private.email_delivery_capability enable row level security;
alter table app_private.email_delivery_capability force row level security;
alter table app_private.auth_recovery_operations enable row level security;
alter table app_private.auth_recovery_operations force row level security;
revoke all on app_private.email_delivery_capability,app_private.auth_recovery_operations from public,anon,authenticated,service_role;
grant select,insert,update on app_private.email_delivery_capability,app_private.auth_recovery_operations to identity_service;
create policy identity_service_email_delivery_capability on app_private.email_delivery_capability for all to identity_service using(true) with check(true);
create policy identity_service_auth_recovery_operations on app_private.auth_recovery_operations for all to identity_service using(true) with check(true);

create or replace function app_public.reserve_auth_recovery_delivery(p_recipient_hmac bytea,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.email_delivery_capability%rowtype; prior app_private.auth_recovery_operations%rowtype; target_state text;
begin
  -- The capability latch is always locked before an operation row.
  select * into capability from app_private.email_delivery_capability where id=1 for update;
  if capability.id is null or octet_length(p_recipient_hmac)<>32
    or p_idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='auth_recovery_request_unavailable';
  end if;
  select * into prior from app_private.auth_recovery_operations where idempotency_key=p_idempotency_key for update;
  if prior.operation_id is not null then
    if prior.recipient_hmac<>p_recipient_hmac then
      raise exception using errcode='22023',message='auth_recovery_request_unavailable';
    end if;
    return jsonb_build_object('operationId',prior.operation_id,'state',prior.state);
  end if;
  target_state:=case when capability.state='open' then 'reserved' else 'blocked' end;
  insert into app_private.auth_recovery_operations(
    recipient_hmac,idempotency_key,expected_capability_version,state,provider_outcome,settled_at
  ) values (
    p_recipient_hmac,p_idempotency_key,capability.version,target_state,
    case when target_state='blocked' then 'confirmed_not_delivered' end,
    case when target_state='blocked' then statement_timestamp() end
  ) returning * into prior;
  return jsonb_build_object('operationId',prior.operation_id,'state',prior.state);
end;
$$;
alter function app_public.reserve_auth_recovery_delivery(bytea,text) owner to identity_service;

create or replace function app_public.begin_auth_recovery_delivery(p_operation_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.email_delivery_capability%rowtype; operation app_private.auth_recovery_operations%rowtype;
begin
  select * into capability from app_private.email_delivery_capability where id=1 for update;
  select * into operation from app_private.auth_recovery_operations where operation_id=p_operation_id for update;
  if operation.operation_id is null or operation.idempotency_key<>p_idempotency_key then
    raise exception using errcode='22023',message='auth_recovery_request_unavailable';
  end if;
  if operation.state='calling' then return jsonb_build_object('operationId',operation.operation_id,'state',operation.state); end if;
  if operation.state<>'reserved' then raise exception using errcode='55000',message='auth_recovery_operation_unavailable'; end if;
  if capability.state<>'open' or capability.version<>operation.expected_capability_version then
    update app_private.auth_recovery_operations set state='settled_no_effect',provider_outcome='confirmed_not_delivered',
      settled_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where operation_id=operation.operation_id returning * into operation;
    return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
  end if;
  update app_private.auth_recovery_operations set state='calling',call_started_at=statement_timestamp(),
    call_deadline=statement_timestamp()+interval '10 seconds',finality_due_at=statement_timestamp()+interval '15 minutes',
    updated_at=statement_timestamp(),version=version+1 where operation_id=operation.operation_id returning * into operation;
  return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
end;
$$;
alter function app_public.begin_auth_recovery_delivery(uuid,text) owner to identity_service;

create or replace function app_public.complete_auth_recovery_delivery(p_operation_id uuid,p_idempotency_key text,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.email_delivery_capability%rowtype; operation app_private.auth_recovery_operations%rowtype; target_state text;
begin
  select * into capability from app_private.email_delivery_capability where id=1 for update;
  select * into operation from app_private.auth_recovery_operations where operation_id=p_operation_id for update;
  if operation.operation_id is null or operation.idempotency_key<>p_idempotency_key or p_outcome not in ('confirmed_delivered','confirmed_not_delivered','unknown') then
    raise exception using errcode='22023',message='auth_recovery_request_unavailable';
  end if;
  if operation.state='reconciliation_required' then raise exception using errcode='55000',message='auth_recovery_reconciliation_required'; end if;
  if operation.state in ('settled_delivered','settled_no_effect','blocked') then
    if operation.provider_outcome<>p_outcome and not (operation.state='blocked' and p_outcome='confirmed_not_delivered') then
      raise exception using errcode='22023',message='auth_recovery_request_unavailable';
    end if;
    return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
  end if;
  if operation.state='reserved' and p_outcome<>'confirmed_not_delivered' then
    raise exception using errcode='55000',message='auth_recovery_operation_not_called';
  end if;
  if operation.state not in ('reserved','calling') then raise exception using errcode='55000',message='auth_recovery_operation_unavailable'; end if;
  target_state:=case p_outcome when 'confirmed_delivered' then 'settled_delivered' when 'confirmed_not_delivered' then 'settled_no_effect' else 'reconciliation_required' end;
  update app_private.auth_recovery_operations set state=target_state,provider_outcome=p_outcome,
    settled_at=case when target_state like 'settled_%' then statement_timestamp() end,
    updated_at=statement_timestamp(),version=version+1 where operation_id=operation.operation_id returning * into operation;
  return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
end;
$$;
alter function app_public.complete_auth_recovery_delivery(uuid,text,text) owner to identity_service;

create or replace function app_public.reconcile_auth_recovery_delivery(p_operation_id uuid,p_idempotency_key text,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.email_delivery_capability%rowtype; operation app_private.auth_recovery_operations%rowtype; target_state text;
begin
  select * into capability from app_private.email_delivery_capability where id=1 for update;
  select * into operation from app_private.auth_recovery_operations where operation_id=p_operation_id for update;
  if operation.operation_id is null or operation.idempotency_key<>p_idempotency_key or p_outcome not in ('confirmed_delivered','confirmed_not_delivered','unknown') then
    raise exception using errcode='22023',message='auth_recovery_request_unavailable';
  end if;
  if operation.state in ('settled_delivered','settled_no_effect') then
    if operation.provider_outcome<>p_outcome then raise exception using errcode='22023',message='auth_recovery_request_unavailable'; end if;
    return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
  end if;
  if operation.state<>'reconciliation_required' then raise exception using errcode='55000',message='auth_recovery_reconciliation_unavailable'; end if;
  target_state:=case p_outcome when 'confirmed_delivered' then 'settled_delivered' when 'confirmed_not_delivered' then 'settled_no_effect' else 'reconciliation_required' end;
  update app_private.auth_recovery_operations set state=target_state,provider_outcome=p_outcome,
    settled_at=case when target_state like 'settled_%' then statement_timestamp() end,
    updated_at=statement_timestamp(),version=version+1 where operation_id=operation.operation_id returning * into operation;
  return jsonb_build_object('operationId',operation.operation_id,'state',operation.state);
end;
$$;
alter function app_public.reconcile_auth_recovery_delivery(uuid,text,text) owner to identity_service;

revoke all on function app_public.reserve_auth_recovery_delivery(bytea,text),app_public.begin_auth_recovery_delivery(uuid,text),
  app_public.complete_auth_recovery_delivery(uuid,text,text),app_public.reconcile_auth_recovery_delivery(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function app_public.reserve_auth_recovery_delivery(bytea,text),app_public.begin_auth_recovery_delivery(uuid,text),
  app_public.complete_auth_recovery_delivery(uuid,text,text),app_public.reconcile_auth_recovery_delivery(uuid,text,text)
  to service_role;

revoke create on schema app_private from identity_service;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
