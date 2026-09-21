-- Preserve the cleanup timestamp required by admission_cleanup_shape while
-- terminalizing definitive provider rejections and existing no-effect residue.
alter function app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)
  rename to settle_account_registration_generate_20260920241500;

create function app_public.settle_account_registration_generate(
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
  result jsonb;
begin
  result := app_public.settle_account_registration_generate_20260920241500(
    p_operation_id,
    p_admission_id,
    p_idempotency_key,
    p_outcome,
    p_provider_user_id
  );
  if p_outcome='confirmed_not_generated' then
    update app_private.account_admission_receipts
      set state='completed_terminal_cleanup',
          cleanup_due_at=coalesce(cleanup_due_at,statement_timestamp()),
          updated_at=statement_timestamp(),
          version=version+1
      where admission_id=p_admission_id and provider_user_id is null;
  end if;
  return result;
end;
$$;

revoke all on function app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)
  to service_role;

update app_private.account_admission_receipts
  set state='completed_terminal_cleanup',
      cleanup_due_at=coalesce(cleanup_due_at,statement_timestamp()),
      updated_at=statement_timestamp(),
      version=version+1
  where state='cleanup_pending' and provider_user_id is null;
