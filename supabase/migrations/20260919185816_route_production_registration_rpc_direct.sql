create or replace function app_public.begin_account_registration(p_email_hmac bytea,p_age_18_attestation boolean,p_idempotency_key text)
returns jsonb language sql security definer set search_path='' as $$
 select public_test_private.begin_registration_base(p_email_hmac,p_age_18_attestation,p_idempotency_key)
$$;

create or replace function app_public.begin_account_registration_operation(p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_kind text)
returns jsonb language sql security definer set search_path='' as $$
 select public_test_private.begin_operation_base(p_operation_id,p_admission_id,p_idempotency_key,p_kind)
$$;

create or replace function app_public.complete_account_registration_callback(p_admission_id uuid,p_provider_user_id uuid)
returns boolean language sql security definer set search_path='' as $$
 select public_test_private.complete_callback_base(p_admission_id,p_provider_user_id)
$$;
