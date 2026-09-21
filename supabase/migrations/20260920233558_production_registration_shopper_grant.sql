-- Keep the authoritative admission check, then grant the ordinary Shopper role.
-- Public registration must never grant Administrator.
create or replace function app_public.complete_account_registration_callback(
  p_admission_id uuid,
  p_provider_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public_test_private.complete_callback_base(p_admission_id, p_provider_user_id) then
    return false;
  end if;

  insert into app_private.role_grants(subject_user_id, role, store_id)
    values (p_provider_user_id, 'shopper', null)
    on conflict (subject_user_id) where role = 'shopper' and state = 'active' do nothing;

  return true;
end
$$;
