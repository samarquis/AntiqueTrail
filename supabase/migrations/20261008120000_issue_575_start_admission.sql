create or replace function app_public.verify_initial_navigator_device(
  trip_id text,
  device_key_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_device bytea;
  v_epoch bigint;
  v_version bigint;
  v_state text;
  v_owner uuid;
  v_navigator uuid;
  v_navigator_device bytea;
  v_bound boolean;
  v_user uuid := app_public.request_user_id();
begin
  begin v_trip := trip_id::uuid; exception when others then raise exception 'not_allowed'; end;
  if device_key_id is null or device_key_id !~ '^device-key-[A-Za-z0-9_-]{43}$'
     or not app_private.current_session_is_active() then
    raise exception 'not_allowed';
  end if;

  select t.state, t.owner_id, t.navigator_user_id, t.navigator_device_hash, t.version
    into v_state, v_owner, v_navigator, v_navigator_device, v_version
    from trip_private.trips t where t.trip_id = v_trip;
  if not found or v_state <> 'ready' then raise exception 'not_allowed'; end if;

  if v_navigator is null then
    if v_owner is distinct from v_user or not exists(
      select 1 from trip_private.trip_participants p
      where p.trip_id = v_trip and p.user_id = v_user
        and p.participant_role = 'creator' and p.state = 'active'
    ) then raise exception 'not_allowed'; end if;
  elsif v_navigator is distinct from v_user or not exists(
    select 1 from trip_private.trip_participants p
    where p.trip_id = v_trip and p.user_id = v_user and p.state = 'active'
  ) then
    raise exception 'not_allowed';
  end if;

  select p.session_epoch into v_epoch from app_private.profiles p
  where p.user_id = v_user and p.status = 'active';
  if v_epoch is null then raise exception 'not_allowed'; end if;
  v_device := extensions.digest(convert_to(device_key_id, 'utf8'), 'sha256');
  select exists(
    select 1 from trip_private.trip_device_bindings b
    where b.trip_id = v_trip and b.user_id = v_user and b.device_hash = v_device
      and b.state = 'active' and b.session_security_version = v_epoch
  ) and v_navigator is not null and v_navigator_device = v_device
    into v_bound;

  return jsonb_build_object(
    'tripVersion', v_version,
    'currentDeviceBound', coalesce(v_bound, false)
  );
end;
$$;
alter function app_public.verify_initial_navigator_device(text,text) owner to identity_service;
revoke all on function app_public.verify_initial_navigator_device(text,text) from public, anon;
grant execute on function app_public.verify_initial_navigator_device(text,text) to authenticated;

create or replace function app_public.prepare_initial_navigator(
  trip_id text,
  expected_version bigint,
  device_key_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_device bytea;
  v_epoch bigint;
  v_version bigint;
  v_state text;
  v_owner uuid;
  v_navigator uuid;
  v_navigator_device bytea;
  v_user uuid := app_public.request_user_id();
begin
  begin v_trip := trip_id::uuid; exception when others then raise exception 'not_allowed'; end;
  if expected_version is null or expected_version < 1
     or device_key_id is null or device_key_id !~ '^device-key-[A-Za-z0-9_-]{43}$'
     or not app_private.current_session_is_active() then
    raise exception 'not_allowed';
  end if;

  select t.state, t.version, t.owner_id, t.navigator_user_id, t.navigator_device_hash
    into v_state, v_version, v_owner, v_navigator, v_navigator_device
    from trip_private.trips t where t.trip_id = v_trip for update;
  if not found or v_state <> 'ready' then raise exception 'not_allowed'; end if;
  if v_owner is distinct from v_user or not exists(
    select 1 from trip_private.trip_participants p
    where p.trip_id = v_trip and p.user_id = v_user
      and p.participant_role = 'creator' and p.state = 'active'
  ) then raise exception 'not_allowed'; end if;

  select p.session_epoch into v_epoch from app_private.profiles p
  where p.user_id = v_user and p.status = 'active';
  if v_epoch is null then raise exception 'not_allowed'; end if;
  v_device := extensions.digest(convert_to(device_key_id, 'utf8'), 'sha256');

  if v_navigator is not null then
    if v_navigator = v_user and v_navigator_device = v_device and exists(
      select 1 from trip_private.trip_device_bindings b
      where b.trip_id = v_trip and b.user_id = v_user and b.device_hash = v_device
        and b.state = 'active' and b.session_security_version = v_epoch
    ) then
      return trip_private.collaboration_json(v_trip);
    end if;
    raise exception 'not_allowed';
  end if;
  if v_version <> expected_version then raise exception 'not_allowed'; end if;
  if exists(
    select 1 from trip_private.trip_device_bindings b
    where b.trip_id = v_trip and b.device_hash = v_device and b.user_id <> v_user
  ) then raise exception 'not_allowed'; end if;

  update trip_private.trip_device_bindings b
    set state = 'revoked', revoked_at = statement_timestamp(), revocation_reason = 'device_rebound'
    where b.trip_id = v_trip and b.user_id = v_user and b.state = 'active';
  update trip_private.trip_device_bindings b
    set state = 'active', revoked_at = null, revocation_reason = null,
        session_security_version = v_epoch, bound_at = statement_timestamp()
    where b.trip_id = v_trip and b.user_id = v_user and b.device_hash = v_device;
  if not found then
    insert into trip_private.trip_device_bindings(
      trip_id, user_id, device_hash, session_security_version
    ) values (v_trip, v_user, v_device, v_epoch);
  end if;

  update trip_private.trips t
    set navigator_user_id = v_user,
        navigator_device_hash = v_device,
        version = t.version + 1,
        updated_at = statement_timestamp()
    where t.trip_id = v_trip and t.version = expected_version
      and t.navigator_user_id is null and t.state = 'ready';
  if not found then raise exception 'not_allowed'; end if;
  return trip_private.collaboration_json(v_trip);
end;
$$;
alter function app_public.prepare_initial_navigator(text,bigint,text) owner to identity_service;
revoke all on function app_public.prepare_initial_navigator(text,bigint,text) from public, anon;
grant execute on function app_public.prepare_initial_navigator(text,bigint,text) to authenticated;
