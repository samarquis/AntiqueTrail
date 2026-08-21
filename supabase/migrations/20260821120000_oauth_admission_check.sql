-- Posture A admission boundary for social sign-in.
-- Supabase creates OAuth identities without passing through account-registration,
-- so this is the application-side admission check: an identity passes only when its
-- own auth.users metadata carries an admission id that resolves to that identity's
-- active admission receipt. No receipt, no session admission; the caller signs the
-- identity out locally and shows the invitation-required screen.
create or replace function app_public.oauth_admission_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admission_id text;
begin
  select raw_user_meta_data ->> 'antique_trail_admission_id'
    into admission_id
    from auth.users
    where id = auth.uid();
  if admission_id is null then
    return jsonb_build_object('state', 'blocked');
  end if;
  begin
    if exists (
      select 1
      from app_private.account_admission_receipts r
      where r.admission_id = admission_id::uuid
        and r.provider_user_id = auth.uid()
        and r.state = 'active'
    ) then
      return jsonb_build_object('state', 'active');
    end if;
  exception when invalid_text_representation then
    return jsonb_build_object('state', 'blocked');
  end;
  return jsonb_build_object('state', 'blocked');
end;
$$;

revoke all on function app_public.oauth_admission_check() from public, anon;
grant execute on function app_public.oauth_admission_check() to authenticated;
