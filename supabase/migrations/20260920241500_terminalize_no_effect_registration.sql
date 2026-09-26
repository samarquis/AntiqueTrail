-- A definitive provider rejection cannot create a provider identity.
-- Mark the admission terminal instead of leaving a cleanup-only state with no ticket.
create or replace function app_public.settle_account_registration_generate(
  p_operation_id uuid,
  p_admission_id uuid,
  p_idempotency_key text,
  p_outcome text,
  p_provider_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  operation app_private.registration_provider_operations%rowtype;
  receipt app_private.account_admission_receipts%rowtype;
  delivery app_private.registration_provider_operations%rowtype;
  config app_private.account_registration_config%rowtype;
  latch app_private.registration_quarantine_latch%rowtype;
  stale boolean;
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
    update app_private.account_admission_receipts
      set state='completed_terminal_cleanup',cleanup_due_at=null,updated_at=statement_timestamp(),version=version+1
      where admission_id=p_admission_id;
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
end;
$$;
