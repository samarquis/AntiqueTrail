-- Package 5A completion: expose the stable store identifier required for
-- owner-scoped visit memories and let the Navigator undo an accidental skip.

grant identity_service to postgres;

create or replace function trip_private.trip_command_json(target_trip_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, trip_private, app_public as $$
  select jsonb_build_object(
    'id',t.trip_id::text,'name',t.name,'localDate',t.local_date::text,'state',t.state,
    'version',t.version,
    'origin',case when t.private_start_latitude is null then null else jsonb_build_object('latitude',t.private_start_latitude::float8,'longitude',t.private_start_longitude::float8) end,
    'returnCoordinate',case when t.private_return_latitude is null then null else jsonb_build_object('latitude',t.private_return_latitude::float8,'longitude',t.private_return_longitude::float8) end,
    'departureMinute',case when t.departure_local_time is null then null else extract(hour from t.departure_local_time)::int*60+extract(minute from t.departure_local_time)::int end,
    'transitionMinutes',10,'maxDriveMiles',t.max_drive_miles::float8,'maxTotalMinutes',t.max_total_minutes,
    'stops',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.stop_id::text,'storeId',case when s.kind='store' then s.store_id::text else null end,
      'kind',s.kind,
      'label',case when s.kind='store' then st.name else s.rest_label end,
      'address',case when s.kind='store' then concat_ws(', ',st.address,st.town,st.state_code) else s.rest_address end,
      'position',s.position,'priority',s.priority,'plannedDwellMinutes',s.planned_dwell_minutes,
      'state',s.state,
      'coordinate',case when s.kind='store' and st.latitude is not null then jsonb_build_object('latitude',st.latitude::float8,'longitude',st.longitude::float8) when s.kind='rest' and s.rest_latitude is not null then jsonb_build_object('latitude',s.rest_latitude::float8,'longitude',s.rest_longitude::float8) else null end,
      'hours',case when s.kind='store' then jsonb_build_object('state','unknown') else null end
    ) order by s.position) from trip_private.trip_stops s left join app_public.stores st on st.id=s.store_id where s.trip_id=t.trip_id),'[]'::jsonb)
  ) from trip_private.trips t where t.trip_id=target_trip_id;
$$;
alter function trip_private.trip_command_json(uuid) owner to identity_service;

create or replace function trip_private.apply_go_stop_command(
  target_trip_id uuid,
  target_stop_id uuid,
  target_state text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_state text;
  allowed boolean;
begin
  if not trip_private.go_actor_can_mutate(target_trip_id) then
    raise exception 'not_allowed';
  end if;
  select state into current_state
  from trip_private.trip_stops
  where trip_id=target_trip_id and stop_id=target_stop_id
  for update;
  if current_state is null then raise exception 'not_found'; end if;
  allowed :=
    (current_state='planned' and target_state in ('arrived','skipped','observed_closed'))
    or (current_state='arrived' and target_state in ('completed','skipped','observed_closed'))
    or (current_state in ('skipped','observed_closed') and target_state='planned');
  if not allowed then raise exception 'conflict'; end if;
  update trip_private.trip_stops
  set state=target_state,
    arrived_at=case when target_state='arrived' then statement_timestamp() when target_state='planned' then null else arrived_at end,
    completed_at=case when target_state='completed' then statement_timestamp() when target_state='planned' then null else completed_at end,
    closed_observed_at=case when target_state='observed_closed' then statement_timestamp() when target_state='planned' then null else closed_observed_at end,
    version=version+1
  where trip_id=target_trip_id and stop_id=target_stop_id;
  update trip_private.trips
  set version=version+1,updated_at=statement_timestamp()
  where trip_id=target_trip_id;
  return trip_private.trip_command_json(target_trip_id);
end;
$$;
alter function trip_private.apply_go_stop_command(uuid,uuid,text) owner to identity_service;

revoke identity_service from postgres;
