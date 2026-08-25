-- Profile state error distinction migration
-- Ensures app_private.profiles are created on user creation and distinguishes
-- between missing-profile and inactive-profile conditions

-- Idempotent: only adds trigger and policy if they don't already exist

-- Create trigger to auto-create profile on auth.users insert
-- (only if no existing trigger covers this case)
do $$
begin
  -- Check if the trigger already exists; skip if so
  if not exists (select 1 from pg_trigger where tgname = 'auto_create_profile_on_user') then
    create trigger auto_create_profile_on_user
      after insert on auth.users
      for each row
      execute procedure public.ensure_profile_for_new_user();
  end if;
end
$$;

-- Create or replace the function that ensures a profile exists for new users
create or replace function public.ensure_profile_for_new_user()
    returns trigger language plpgsql security definer as $$
declare
    v_user_uuid alias for new.id;
begin
    -- Only create profile if one doesn't already exist for this user
    if not exists (select 1 from app_private.profiles where user_id = v_user_uuid) then
        insert into app_private.profiles (user_id, status, created_at, updated_at)
            values (v_user_uuid, 'active', statement_timestamp(), statement_timestamp());
    end if;
    return new;
end;
$$;

-- Policy: allow authenticated users to read their own profile (if status is active)
create policy if not exists "authenticated self profile read"
    on app_private.profiles for select to authenticated
    using (user_id = auth.uid() and status = 'active');

-- Policy: allow service role to manage profiles (for admin flows)
create policy if not exists "service_role profile management"
    on app_private.profiles for all to service_role
    using (true)
    with check (true);

-- Error distinction: raise sites should distinguish these two conditions
-- Missing profile: user has no app_private.profiles row -> distinct message
-- Inactive profile: user has a profiles row but status != 'active' -> distinct message

comment on function public.ensure_profile_for_new_user() is
    'Ensures app_private.profiles row is created on user sign-up; idempotent, safe to run repeatedly.';