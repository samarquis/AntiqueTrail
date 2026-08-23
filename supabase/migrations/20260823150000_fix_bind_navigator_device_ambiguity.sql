-- Fix: bind_navigator_device raised 42702 ("column reference \"trip_id\" is
-- ambiguous") on every call: the ON CONFLICT (trip_id, ...) inference list
-- collided with the parameter named trip_id under PL/pgSQL variable
-- substitution, so devices could never bind and start_trip always returned
-- not_allowed. Parameters KEEP their original names because PostgREST matches
-- RPC JSON body keys to parameter names (renaming breaks the SPA contract).
-- Rewritten as update-then-insert with fully aliased column refs; the unique
-- index on (trip_id, device_hash) still guards duplicates.
create or replace function app_public.bind_navigator_device(trip_id text, device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_device bytea;
  v_epoch bigint;
begin
  begin v_trip := trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
     or not app_private.current_session_is_active()
     or not trip_private.trip_member_can_access(v_trip) then
    raise exception 'not_allowed';
  end if;
  if not exists(
    select 1 from trip_private.trips t
    where t.trip_id = v_trip
      and t.state in ('draft','ready')
      and t.navigator_user_id is distinct from app_public.request_user_id()
  ) then
    raise exception 'not_allowed';
  end if;
  select pr.session_epoch into v_epoch
    from app_private.profiles pr
    where pr.user_id = app_public.request_user_id() and pr.status = 'active';
  v_device := extensions.digest(convert_to(device_id, 'utf8'), 'sha256');
  update trip_private.trip_device_bindings b
    set state = 'revoked', revoked_at = statement_timestamp(), revocation_reason = 'device_rebound'
    where b.trip_id = v_trip and b.user_id = app_public.request_user_id() and b.state = 'active';
  update trip_private.trip_device_bindings ub
    set user_id = app_public.request_user_id(),
        state = 'active',
        revoked_at = null,
        revocation_reason = null,
        session_security_version = v_epoch,
        bound_at = statement_timestamp()
    where ub.trip_id = v_trip and ub.device_hash = v_device;
  if not found then
    insert into trip_private.trip_device_bindings(trip_id, user_id, device_hash, session_security_version)
    values (v_trip, app_public.request_user_id(), v_device, v_epoch);
  end if;
  return trip_private.collaboration_json(v_trip);
end;
$$;
