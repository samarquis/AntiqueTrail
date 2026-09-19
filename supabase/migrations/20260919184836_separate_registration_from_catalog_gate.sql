create or replace function public_test_private.begin_registration(p_email_hmac bytea,p_age_18_attestation boolean,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from app_private.account_registration_config where id=1 and mode='public') then
  return public_test_private.begin_registration_base(p_email_hmac,p_age_18_attestation,p_idempotency_key);
 end if;
 return public_test_private.begin_registration_base(p_email_hmac,p_age_18_attestation,p_idempotency_key);
end $$;

create or replace function public_test_private.begin_operation(p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return public_test_private.begin_operation_base(p_operation_id,p_admission_id,p_idempotency_key,p_kind);
end $$;

create or replace function public_test_private.complete_callback(p_admission_id uuid,p_provider_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 return public_test_private.complete_callback_base(p_admission_id,p_provider_user_id);
end $$;

update public_test_private.runtime
set first_started_at = coalesce(first_started_at, statement_timestamp()),
    active_binding_id = '6c621ff6-5351-4384-a425-a95db0191598'
where id = 1;
