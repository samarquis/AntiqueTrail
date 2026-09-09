-- Issue 253: expose only the server-owned owner-acquisition presentation gates.
-- Read-only browser projection; it never exposes release or readiness records.
create or replace function app_public.owner_intake_availability()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'routeVisible',
      e.stage='private_beta'
      or (e.stage='regional_public' and release_private.public_capability_enabled('claims')),
    'intakeAvailable',
      e.stage='regional_public' and partner_private.store_application_enabled(),
    'claimsAvailable',
      e.stage='regional_public' and release_private.public_capability_enabled('claims')
  )
  from app_private.environment_stage e
  where e.id=1
$$;

grant create, usage on schema app_public to identity_service;
alter function app_public.owner_intake_availability() owner to identity_service;
revoke all on function app_public.owner_intake_availability() from public,anon,authenticated;
grant execute on function app_public.owner_intake_availability() to anon,authenticated;
