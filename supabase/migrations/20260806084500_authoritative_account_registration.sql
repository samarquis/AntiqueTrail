-- Service-only registration protocol. Browser signup is never part of this boundary.
create unique index if not exists auth_users_exact_antique_trail_admission
  on auth.users ((raw_user_meta_data->>'antique_trail_admission_id'))
  where raw_user_meta_data ? 'antique_trail_admission_id';

create or replace function app_public.begin_account_registration(
  p_email_hmac bytea,p_age_18_attestation boolean,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  receipt app_private.account_admission_receipts%rowtype;
  operation app_private.registration_provider_operations%rowtype;
  config app_private.account_registration_config%rowtype;
  latch app_private.registration_quarantine_latch%rowtype;
begin
  select * into config from app_private.account_registration_config where id=1 for update;
  select * into latch from app_private.registration_quarantine_latch where id=1 for update;
  if not p_age_18_attestation or octet_length(p_email_hmac)<>32
    or p_idempotency_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('state','blocked');
  end if;
  if exists(select 1 from app_private.registration_cleanup_tickets where state<>'completed_absent') then
    return jsonb_build_object('state','blocked');
  end if;
  select * into receipt from app_private.account_admission_receipts
    where idempotency_key=p_idempotency_key for update;
  if receipt.admission_id is not null then
    if receipt.email_hmac<>p_email_hmac then return jsonb_build_object('state','blocked'); end if;
    if receipt.state in ('verification_pending','active') then
      return jsonb_build_object('state','pending_verification');
    end if;
    if receipt.state='provider_pending' then
      select * into operation from app_private.registration_provider_operations
        where admission_id=receipt.admission_id and kind='generate_link' for update;
      if operation.state='reserved' then
        return jsonb_build_object('state','reserved','admissionId',receipt.admission_id,'providerOperationId',operation.operation_id);
      end if;
      if operation.state in ('calling','reconciliation_required') then
        if operation.state='calling' then
          update app_private.registration_provider_operations set state='reconciliation_required',version=version+1
            where operation_id=operation.operation_id;
        end if;
        return jsonb_build_object('state','reconciliation_required','admissionId',receipt.admission_id,'operationId',operation.operation_id,'kind','generate_link');
      end if;
    end if;
    if receipt.state='delivery_pending' then
      select * into operation from app_private.registration_provider_operations where admission_id=receipt.admission_id and kind='send_verification' for update;
      if operation.state='reserved' then
        update app_private.registration_provider_operations set state='cancelled_before_call',settled_at=statement_timestamp(),version=version+1 where operation_id=operation.operation_id;
        update app_private.account_admission_receipts set state='orphan_quarantined',cleanup_due_at=statement_timestamp(),delivery_state='not_started',updated_at=statement_timestamp(),version=version+1 where admission_id=receipt.admission_id;
        insert into app_private.registration_quarantine_subjects(provider_user_id) values(receipt.provider_user_id) on conflict(provider_user_id) do nothing;
        perform app_public.enqueue_account_registration_cleanup(receipt.admission_id,receipt.provider_user_id);
        return jsonb_build_object('state','blocked','admissionId',receipt.admission_id,'operationId',operation.operation_id,'kind','send_verification','cleanupScheduled',true);
      end if;
      if operation.state in ('calling','reconciliation_required') then
        if operation.state='calling' then update app_private.registration_provider_operations set state='reconciliation_required',version=version+1 where operation_id=operation.operation_id; end if;
        return jsonb_build_object('state','reconciliation_required','admissionId',receipt.admission_id,'operationId',operation.operation_id,'kind','send_verification');
      end if;
    end if;
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if config.mode<>'public' or latch.state<>'open' then return jsonb_build_object('state','blocked'); end if;
  insert into app_private.account_admission_receipts(
    token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,claim_expires_at,
    state,claimed_at
  ) values (
    extensions.digest(extensions.gen_random_uuid()::text,'sha256'),'shopper',p_email_hmac,
    statement_timestamp(),p_idempotency_key,statement_timestamp()+interval '30 minutes',
    'provider_pending',statement_timestamp()
  ) returning * into receipt;
  insert into app_private.registration_provider_operations(
    admission_id,kind,expected_latch_version,expected_admission_version,
    expected_config_version,external_idempotency_key
  ) values (
    receipt.admission_id,'generate_link',latch.version,receipt.version,config.version,
    p_idempotency_key||':generate-link'
  ) returning * into operation;
  return jsonb_build_object('state','reserved','admissionId',receipt.admission_id,'providerOperationId',operation.operation_id);
end; $$;

create or replace function app_public.begin_account_registration_operation(
  p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_kind text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation app_private.registration_provider_operations%rowtype; receipt app_private.account_admission_receipts%rowtype;
  config app_private.account_registration_config%rowtype; latch app_private.registration_quarantine_latch%rowtype;
begin
  select * into config from app_private.account_registration_config where id=1 for update;
  select * into latch from app_private.registration_quarantine_latch where id=1 for update;
  select * into receipt from app_private.account_admission_receipts where admission_id=p_admission_id for update;
  select * into operation from app_private.registration_provider_operations where operation_id=p_operation_id for update;
  if receipt.admission_id is null or receipt.idempotency_key<>p_idempotency_key or operation.admission_id<>p_admission_id
    or operation.kind<>p_kind or p_kind not in ('generate_link','send_verification') then
    raise exception using errcode='22023',message='account_registration_unavailable';
  end if;
  if operation.state in ('calling','reconciliation_required') then
    if operation.state='calling' then update app_private.registration_provider_operations set state='reconciliation_required',version=version+1 where operation_id=p_operation_id; end if;
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if operation.state<>'reserved' then raise exception using errcode='55000',message='account_registration_operation_unavailable'; end if;
  if latch.state<>'open' or latch.version<>operation.expected_latch_version
    or config.version<>operation.expected_config_version or receipt.version<>operation.expected_admission_version then
    update app_private.registration_provider_operations set state='cancelled_before_call',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set
      state=case when p_kind='send_verification' then 'orphan_quarantined' else 'cleanup_pending' end,
      cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
      where admission_id=p_admission_id;
    return jsonb_build_object('state','blocked');
  end if;
  update app_private.registration_provider_operations set state='calling',call_started_at=statement_timestamp(),
    call_deadline=statement_timestamp()+interval '10 seconds',finality_due_at=statement_timestamp()+interval '15 minutes',version=version+1
    where operation_id=p_operation_id;
  return jsonb_build_object('state','calling');
end; $$;

create or replace function app_public.settle_account_registration_generate(
  p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_outcome text,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation app_private.registration_provider_operations%rowtype; receipt app_private.account_admission_receipts%rowtype;
  delivery app_private.registration_provider_operations%rowtype; config app_private.account_registration_config%rowtype;
  latch app_private.registration_quarantine_latch%rowtype; stale boolean;
begin
  select * into config from app_private.account_registration_config where id=1 for update;
  select * into latch from app_private.registration_quarantine_latch where id=1 for update;
  select * into receipt from app_private.account_admission_receipts where admission_id=p_admission_id for update;
  select * into operation from app_private.registration_provider_operations where operation_id=p_operation_id for update;
  if receipt.idempotency_key<>p_idempotency_key or operation.admission_id<>p_admission_id or operation.kind<>'generate_link'
    or p_outcome not in ('confirmed_generated','confirmed_not_generated','unknown') then
    raise exception using errcode='22023',message='account_registration_unavailable';
  end if;
  if operation.state='settled_captured' and receipt.state in ('delivery_pending','verification_pending','active') then
    select * into delivery from app_private.registration_provider_operations where admission_id=p_admission_id and kind='send_verification';
    return jsonb_build_object('state','delivery_reserved','deliveryOperationId',delivery.operation_id);
  end if;
  if operation.state not in ('calling','reconciliation_required') then raise exception using errcode='55000',message='account_registration_operation_unavailable'; end if;
  stale:=latch.state<>'open' or latch.version<>operation.expected_latch_version
    or config.version<>operation.expected_config_version or receipt.version<>operation.expected_admission_version
    or operation.call_deadline is null or operation.finality_due_at is null
    or statement_timestamp()>operation.call_deadline or statement_timestamp()>operation.finality_due_at;
  if p_outcome='unknown' then
    update app_private.registration_provider_operations set state='reconciliation_required',version=version+1 where operation_id=p_operation_id;
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if p_outcome='confirmed_not_generated' then
    update app_private.registration_provider_operations set state='settled_no_effect',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='cleanup_pending',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    return jsonb_build_object('state','blocked');
  end if;
  if p_provider_user_id is null then raise exception using errcode='22023',message='account_registration_unavailable'; end if;
  if stale then
    update app_private.registration_provider_operations set state='settled_captured',provider_user_id=p_provider_user_id,settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='orphan_quarantined',provider_user_id=p_provider_user_id,cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    perform app_public.enqueue_account_registration_cleanup(p_admission_id,p_provider_user_id);
    return jsonb_build_object('state','blocked');
  end if;
  update app_private.registration_provider_operations set state='settled_captured',provider_user_id=p_provider_user_id,settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
  update app_private.account_admission_receipts set state='delivery_pending',provider_user_id=p_provider_user_id,
    delivery_state='pending',updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id returning * into receipt;
  insert into app_private.registration_provider_operations(
    admission_id,kind,expected_latch_version,expected_admission_version,expected_config_version,
    provider_user_id,external_idempotency_key
  ) select p_admission_id,'send_verification',g.version,receipt.version,c.version,p_provider_user_id,p_idempotency_key||':send-verification'
    from app_private.registration_quarantine_latch g cross join app_private.account_registration_config c where g.id=1 and c.id=1
    returning * into delivery;
  return jsonb_build_object('state','delivery_reserved','deliveryOperationId',delivery.operation_id);
end; $$;

create or replace function app_public.settle_account_registration_delivery(
  p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_outcome text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation app_private.registration_provider_operations%rowtype; receipt app_private.account_admission_receipts%rowtype;
  config app_private.account_registration_config%rowtype; latch app_private.registration_quarantine_latch%rowtype; stale boolean;
begin
  select * into config from app_private.account_registration_config where id=1 for update;
  select * into latch from app_private.registration_quarantine_latch where id=1 for update;
  select * into receipt from app_private.account_admission_receipts where admission_id=p_admission_id for update;
  select * into operation from app_private.registration_provider_operations where operation_id=p_operation_id for update;
  if receipt.idempotency_key<>p_idempotency_key or operation.admission_id<>p_admission_id or operation.kind<>'send_verification'
    or p_outcome not in ('confirmed_delivered','confirmed_not_delivered','unknown') then
    raise exception using errcode='22023',message='account_registration_unavailable';
  end if;
  if operation.state='settled_captured' and receipt.state in ('verification_pending','active') then return jsonb_build_object('state','pending_verification'); end if;
  if operation.state not in ('calling','reconciliation_required') then raise exception using errcode='55000',message='account_registration_operation_unavailable'; end if;
  stale:=latch.state<>'open' or latch.version<>operation.expected_latch_version
    or config.version<>operation.expected_config_version or receipt.version<>operation.expected_admission_version
    or operation.call_deadline is null or operation.finality_due_at is null
    or statement_timestamp()>operation.call_deadline or statement_timestamp()>operation.finality_due_at;
  if p_outcome='unknown' then
    update app_private.registration_provider_operations set state='reconciliation_required',version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set delivery_state='unknown',updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if p_outcome='confirmed_not_delivered' then
    update app_private.registration_provider_operations set state='settled_no_effect',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='cleanup_pending',delivery_state='not_delivered',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    perform app_public.enqueue_account_registration_cleanup(p_admission_id,receipt.provider_user_id);
    return jsonb_build_object('state','blocked');
  end if;
  if stale then
    update app_private.registration_provider_operations set state='settled_captured',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='orphan_quarantined',delivery_state='unknown',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    perform app_public.enqueue_account_registration_cleanup(p_admission_id,receipt.provider_user_id);
    return jsonb_build_object('state','blocked');
  end if;
  update app_private.registration_provider_operations set state='settled_captured',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
  update app_private.account_admission_receipts set state='verification_pending',delivery_state='delivered',verification_link_expires_at=statement_timestamp()+interval '30 minutes',updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
  return jsonb_build_object('state','pending_verification');
end; $$;

create or replace function app_public.reconcile_account_registration_delivery(
  p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_outcome text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation app_private.registration_provider_operations%rowtype; receipt app_private.account_admission_receipts%rowtype;
  config app_private.account_registration_config%rowtype; latch app_private.registration_quarantine_latch%rowtype; stale boolean;
begin
  select * into config from app_private.account_registration_config where id=1 for update;
  select * into latch from app_private.registration_quarantine_latch where id=1 for update;
  select * into receipt from app_private.account_admission_receipts where admission_id=p_admission_id for update;
  select * into operation from app_private.registration_provider_operations where operation_id=p_operation_id for update;
  if operation.state<>'reconciliation_required' or operation.kind<>'send_verification'
    or operation.admission_id<>p_admission_id or receipt.idempotency_key<>p_idempotency_key
    or p_outcome not in ('confirmed_delivered','confirmed_not_delivered','unknown') then
    raise exception using errcode='22023',message='account_registration_reconciliation_unavailable';
  end if;
  stale:=latch.state<>'open' or latch.version<>operation.expected_latch_version
    or config.version<>operation.expected_config_version
    or receipt.version not in (operation.expected_admission_version,operation.expected_admission_version+1)
    or operation.finality_due_at is null or statement_timestamp()>operation.finality_due_at;
  if p_outcome='unknown' and not stale then return jsonb_build_object('state','reconciliation_required'); end if;
  if p_outcome='confirmed_not_delivered' then
    update app_private.registration_provider_operations set state='settled_no_effect',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='cleanup_pending',delivery_state='not_delivered',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    perform app_public.enqueue_account_registration_cleanup(p_admission_id,receipt.provider_user_id);
    return jsonb_build_object('state','blocked');
  end if;
  if stale or p_outcome='unknown' then
    update app_private.registration_provider_operations set state='settled_captured',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='orphan_quarantined',delivery_state='unknown',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    perform app_public.enqueue_account_registration_cleanup(p_admission_id,receipt.provider_user_id);
    return jsonb_build_object('state','blocked');
  end if;
  update app_private.registration_provider_operations set state='settled_captured',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
  update app_private.account_admission_receipts set state='verification_pending',delivery_state='delivered',verification_link_expires_at=statement_timestamp()+interval '30 minutes',updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
  return jsonb_build_object('state','pending_verification');
end; $$;

create or replace function app_public.registration_exact_provider_for_admission(p_admission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare matches integer; provider_id uuid;
begin
  select count(*),(array_agg(id order by id))[1] into matches,provider_id from auth.users
    where raw_user_meta_data->>'antique_trail_admission_id'=p_admission_id::text;
  if matches=0 then return jsonb_build_object('state','absent'); end if;
  if matches<>1 then return jsonb_build_object('state','duplicate'); end if;
  return jsonb_build_object('state','found','providerUserId',provider_id);
end; $$;

create or replace function app_public.reconcile_account_registration_generate(
  p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_provider_state text,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation app_private.registration_provider_operations%rowtype; receipt app_private.account_admission_receipts%rowtype;
begin
  select * into receipt from app_private.account_admission_receipts where admission_id=p_admission_id for update;
  select * into operation from app_private.registration_provider_operations where operation_id=p_operation_id for update;
  if operation.state<>'reconciliation_required' or operation.kind<>'generate_link' or operation.admission_id<>p_admission_id
    or receipt.idempotency_key<>p_idempotency_key or p_provider_state not in ('found','absent','duplicate') then
    raise exception using errcode='22023',message='account_registration_reconciliation_unavailable';
  end if;
  if p_provider_state='absent' and statement_timestamp()<=operation.finality_due_at then return jsonb_build_object('state','reconciliation_required'); end if;
  if p_provider_state='absent' then
    update app_private.registration_provider_operations set state='settled_no_effect',settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
    update app_private.account_admission_receipts set state='cleanup_pending',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
    return jsonb_build_object('state','cleanup_pending');
  end if;
  update app_private.registration_provider_operations set state='settled_captured',provider_user_id=p_provider_user_id,settled_at=statement_timestamp(),version=version+1 where operation_id=p_operation_id;
  update app_private.account_admission_receipts set state='orphan_quarantined',provider_user_id=p_provider_user_id,cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where admission_id=p_admission_id;
  if p_provider_user_id is not null then perform app_public.enqueue_account_registration_cleanup(p_admission_id,p_provider_user_id); end if;
  return jsonb_build_object('state','orphan_quarantined');
end; $$;

create or replace function app_public.complete_account_registration_callback(p_admission_id uuid,p_provider_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare latch_state text;
begin
  if exists(select 1 from app_private.account_admission_receipts where admission_id=p_admission_id and provider_user_id=p_provider_user_id and state='active') then return true; end if;
  select state into latch_state from app_private.registration_quarantine_latch where id=1 for update;
  if latch_state<>'open' or exists(select 1 from app_private.registration_cleanup_tickets where state<>'completed_absent') then
    update app_private.account_admission_receipts set state='orphan_quarantined',cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
      where admission_id=p_admission_id and provider_user_id=p_provider_user_id and state='verification_pending';
    return false;
  end if;
  update app_private.account_admission_receipts set state='active',updated_at=statement_timestamp(),version=version+1
    where admission_id=p_admission_id and provider_user_id=p_provider_user_id and state='verification_pending'
      and verification_link_expires_at>statement_timestamp();
  return found;
end; $$;

create table if not exists app_private.registration_cleanup_tickets (
  cleanup_ticket_id uuid primary key default extensions.gen_random_uuid(),
  provider_user_id uuid not null unique,
  asserted_admission_id uuid,
  state text not null default 'pending' check (state in ('pending','calling','reconciliation_required','completed_absent','escalated')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 6),
  max_attempts integer not null default 6 check (max_attempts=6),
  next_attempt_at timestamptz not null default statement_timestamp(),
  call_started_at timestamptz,
  call_deadline timestamptz,
  finality_due_at timestamptz,
  last_outcome text,
  operator_case_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint registration_cleanup_escalation_shape check (state<>'escalated' or operator_case_id is not null)
);
create index if not exists registration_cleanup_due_idx on app_private.registration_cleanup_tickets(next_attempt_at,cleanup_ticket_id)
  where state in ('pending','calling','reconciliation_required');
alter table app_private.registration_cleanup_tickets enable row level security;
insert into app_private.registration_quarantine_subjects(provider_user_id)
  select distinct provider_user_id from app_private.account_admission_receipts
  where provider_user_id is not null and state in ('cleanup_pending','orphan_quarantined')
  on conflict(provider_user_id) do nothing;
insert into app_private.registration_cleanup_tickets(cleanup_ticket_id,provider_user_id,asserted_admission_id)
  select q.deletion_ticket_id,q.provider_user_id,min(r.admission_id::text)::uuid
  from app_private.registration_quarantine_subjects q
  left join app_private.account_admission_receipts r on r.provider_user_id=q.provider_user_id
    and r.state in ('cleanup_pending','orphan_quarantined')
  where q.resolved_absent_at is null
  group by q.deletion_ticket_id,q.provider_user_id
  on conflict(provider_user_id) do nothing;

create or replace function app_public.enqueue_account_registration_cleanup(p_admission_id uuid,p_provider_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; deletion_ticket uuid;
begin
  insert into app_private.registration_quarantine_subjects(provider_user_id) values(p_provider_user_id)
    on conflict(provider_user_id) do update set provider_user_id=excluded.provider_user_id
    returning deletion_ticket_id into deletion_ticket;
  insert into app_private.registration_cleanup_tickets(cleanup_ticket_id,provider_user_id,asserted_admission_id)
    values(deletion_ticket,p_provider_user_id,p_admission_id)
    on conflict(provider_user_id) do update set updated_at=app_private.registration_cleanup_tickets.updated_at
    returning * into ticket;
  update app_private.account_admission_receipts set state='orphan_quarantined',provider_user_id=p_provider_user_id,
    cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
    where admission_id=p_admission_id and (provider_user_id is null or provider_user_id=p_provider_user_id)
      and state in ('provider_pending','provider_created','delivery_pending','verification_pending','cleanup_pending','orphan_quarantined');
  return jsonb_build_object('state',ticket.state,'cleanupTicketId',ticket.cleanup_ticket_id,'providerUserId',ticket.provider_user_id);
end; $$;

create or replace function app_public.claim_account_registration_cleanup()
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype;
begin
  select * into ticket from app_private.registration_cleanup_tickets
    where state in ('pending','calling','reconciliation_required') and next_attempt_at<=statement_timestamp()
    order by next_attempt_at,cleanup_ticket_id for update skip locked limit 1;
  if ticket.cleanup_ticket_id is null then return jsonb_build_object('state','empty'); end if;
  if ticket.state='calling' then
    update app_private.registration_cleanup_tickets set state='reconciliation_required',updated_at=statement_timestamp()
      where cleanup_ticket_id=ticket.cleanup_ticket_id returning * into ticket;
  end if;
  return jsonb_build_object('state',ticket.state,'cleanupTicketId',ticket.cleanup_ticket_id,'providerUserId',ticket.provider_user_id);
end; $$;

create or replace function app_public.begin_account_registration_cleanup(p_cleanup_ticket_id uuid,p_provider_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype;
begin
  select * into ticket from app_private.registration_cleanup_tickets where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id for update;
  if ticket.cleanup_ticket_id is null then raise exception using errcode='22023',message='registration_cleanup_unavailable'; end if;
  if ticket.state='reconciliation_required' then return jsonb_build_object('state','reconciliation_required'); end if;
  if ticket.state<>'pending' then raise exception using errcode='55000',message='registration_cleanup_unavailable'; end if;
  update app_private.registration_cleanup_tickets set state='calling',attempt_count=attempt_count+1,
    call_started_at=statement_timestamp(),call_deadline=statement_timestamp()+interval '10 seconds',
    finality_due_at=statement_timestamp()+interval '15 minutes',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id;
  return jsonb_build_object('state','calling');
end; $$;

create or replace function app_public.settle_account_registration_cleanup(p_cleanup_ticket_id uuid,p_provider_user_id uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; delay_seconds integer;
begin
  select * into ticket from app_private.registration_cleanup_tickets where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id for update;
  if ticket.state<>'calling' or p_outcome not in ('confirmed_deleted','confirmed_not_deleted','unknown') then raise exception using errcode='22023',message='registration_cleanup_unavailable'; end if;
  if p_outcome='confirmed_not_deleted' then
    if ticket.attempt_count>=ticket.max_attempts then
      update app_private.registration_cleanup_tickets set state='escalated',operator_case_id=extensions.gen_random_uuid(),last_outcome=p_outcome,updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id;
      return jsonb_build_object('state','escalated');
    end if;
    delay_seconds:=least(3600,60*(2^(ticket.attempt_count-1))::integer);
    update app_private.registration_cleanup_tickets set state='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>delay_seconds),
      call_started_at=null,call_deadline=null,finality_due_at=null,last_outcome=p_outcome,updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id;
    return jsonb_build_object('state','retry');
  end if;
  update app_private.registration_cleanup_tickets set state='reconciliation_required',last_outcome=p_outcome,updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id;
  return jsonb_build_object('state','reconciliation_required');
end; $$;

create or replace function app_public.reconcile_account_registration_cleanup(p_cleanup_ticket_id uuid,p_provider_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; delay_seconds integer; provider_matches integer;
begin
  select * into ticket from app_private.registration_cleanup_tickets where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id for update;
  if ticket.state<>'reconciliation_required' then raise exception using errcode='22023',message='registration_cleanup_reconciliation_unavailable'; end if;
  select count(*) into provider_matches from auth.users where id=ticket.provider_user_id;
  if provider_matches=0 then
    update app_private.registration_cleanup_tickets set state='completed_absent',last_outcome='absent',updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id;
    update app_private.account_admission_receipts set state='completed_terminal_cleanup',provider_user_id=null,updated_at=statement_timestamp(),version=version+1
      where provider_user_id=p_provider_user_id and state in ('cleanup_pending','orphan_quarantined');
    update app_private.registration_quarantine_subjects set resolved_absent_at=statement_timestamp() where provider_user_id=p_provider_user_id;
    return jsonb_build_object('state','completed_terminal_cleanup');
  end if;
  if ticket.attempt_count>=ticket.max_attempts then
    update app_private.registration_cleanup_tickets set state='escalated',operator_case_id=extensions.gen_random_uuid(),last_outcome='provider_present',updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id;
    return jsonb_build_object('state','escalated');
  end if;
  delay_seconds:=least(3600,60*(2^(ticket.attempt_count-1))::integer);
  update app_private.registration_cleanup_tickets set state='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>delay_seconds),
    call_started_at=null,call_deadline=null,finality_due_at=null,last_outcome='provider_present',updated_at=statement_timestamp() where cleanup_ticket_id=p_cleanup_ticket_id;
  return jsonb_build_object('state','retry');
end; $$;

create or replace function app_public.resolve_registration_cleanup_operator_case(p_cleanup_ticket_id uuid,p_provider_user_id uuid,p_resolution text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_resolution<>'retry' then raise exception using errcode='22023',message='registration_cleanup_operator_resolution_unavailable'; end if;
  update app_private.registration_cleanup_tickets set state='pending',attempt_count=0,operator_case_id=null,next_attempt_at=statement_timestamp(),
    call_started_at=null,call_deadline=null,finality_due_at=null,last_outcome='operator_retry',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id and state='escalated';
  if not found then raise exception using errcode='22023',message='registration_cleanup_operator_resolution_unavailable'; end if;
  return jsonb_build_object('state','retry');
end; $$;

revoke all on function app_public.begin_account_registration(bytea,boolean,text),
  app_public.begin_account_registration_operation(uuid,uuid,text,text),
  app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid),
  app_public.settle_account_registration_delivery(uuid,uuid,text,text),
  app_public.registration_exact_provider_for_admission(uuid),
  app_public.reconcile_account_registration_generate(uuid,uuid,text,text,uuid),
  app_public.reconcile_account_registration_delivery(uuid,uuid,text,text),
  app_public.enqueue_account_registration_cleanup(uuid,uuid),
  app_public.claim_account_registration_cleanup(),
  app_public.begin_account_registration_cleanup(uuid,uuid),
  app_public.settle_account_registration_cleanup(uuid,uuid,text),
  app_public.reconcile_account_registration_cleanup(uuid,uuid),
  app_public.resolve_registration_cleanup_operator_case(uuid,uuid,text),
  app_public.complete_account_registration_callback(uuid,uuid) from public,anon,authenticated;
grant execute on function app_public.begin_account_registration(bytea,boolean,text),
  app_public.begin_account_registration_operation(uuid,uuid,text,text),
  app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid),
  app_public.settle_account_registration_delivery(uuid,uuid,text,text),
  app_public.registration_exact_provider_for_admission(uuid),
  app_public.reconcile_account_registration_generate(uuid,uuid,text,text,uuid),
  app_public.reconcile_account_registration_delivery(uuid,uuid,text,text),
  app_public.enqueue_account_registration_cleanup(uuid,uuid),
  app_public.claim_account_registration_cleanup(),
  app_public.begin_account_registration_cleanup(uuid,uuid),
  app_public.settle_account_registration_cleanup(uuid,uuid,text),
  app_public.reconcile_account_registration_cleanup(uuid,uuid),
  app_public.resolve_registration_cleanup_operator_case(uuid,uuid,text),
  app_public.complete_account_registration_callback(uuid,uuid) to service_role;
