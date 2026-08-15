-- Complete Package 5A history: authoritative elapsed duration, per-author
-- private-memory status, and atomic Plan Again cloning.

grant identity_service to postgres;
grant create on schema trip_private,app_public to identity_service;

alter table trip_private.trips
  add column started_at timestamptz,
  add column completed_at timestamptz;

update trip_private.trips t
set started_at=coalesce((
      select min(value_at) from (
        select s.arrived_at value_at from trip_private.trip_stops s where s.trip_id=t.trip_id
        union all select s.completed_at from trip_private.trip_stops s where s.trip_id=t.trip_id
        union all select s.closed_observed_at from trip_private.trip_stops s where s.trip_id=t.trip_id
      ) activity where value_at is not null
    ),t.created_at),
    completed_at=t.updated_at
where t.state='completed';

update trip_private.trips t
set started_at=coalesce((
  select min(value_at) from (
    select s.arrived_at value_at from trip_private.trip_stops s where s.trip_id=t.trip_id
    union all select s.completed_at from trip_private.trip_stops s where s.trip_id=t.trip_id
    union all select s.closed_observed_at from trip_private.trip_stops s where s.trip_id=t.trip_id
  ) activity where value_at is not null
),t.updated_at)
where t.state='active';

alter table trip_private.trips add constraint trip_history_timestamps check(
  (state in ('draft','ready') and started_at is null and completed_at is null)
  or (state='active' and started_at is not null and completed_at is null)
  or (state='completed' and started_at is not null and completed_at is not null and completed_at>=started_at)
  or state='cancelled'
);

create or replace function trip_private.stamp_trip_history()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.state='active' and old.state is distinct from 'active' then
    new.started_at:=statement_timestamp();
    new.completed_at:=null;
  elsif new.state='completed' and old.state is distinct from 'completed' then
    new.started_at:=coalesce(old.started_at,statement_timestamp());
    new.completed_at:=statement_timestamp();
  end if;
  return new;
end; $$;
alter function trip_private.stamp_trip_history() owner to identity_service;
revoke all on function trip_private.stamp_trip_history() from public,anon,authenticated;

create trigger stamp_trip_history before update of state on trip_private.trips
for each row execute function trip_private.stamp_trip_history();

create or replace function trip_private.trip_command_json(target_trip_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, trip_private, app_public, auth as $$
  select jsonb_build_object(
    'id',t.trip_id::text,'name',t.name,'localDate',t.local_date::text,'state',t.state,
    'version',t.version,
    'durationMinutes',case when t.started_at is null or t.completed_at is null then null
      else greatest(0,floor(extract(epoch from (t.completed_at-t.started_at))/60)::int) end,
    'origin',case when t.private_start_latitude is null then null else jsonb_build_object('latitude',t.private_start_latitude::float8,'longitude',t.private_start_longitude::float8) end,
    'returnCoordinate',case when t.private_return_latitude is null then null else jsonb_build_object('latitude',t.private_return_latitude::float8,'longitude',t.private_return_longitude::float8) end,
    'departureMinute',case when t.departure_local_time is null then null else extract(hour from t.departure_local_time)::int*60+extract(minute from t.departure_local_time)::int end,
    'transitionMinutes',10,'maxDriveMiles',t.max_drive_miles::float8,'maxTotalMinutes',t.max_total_minutes,
    'stops',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.stop_id::text,'storeId',case when s.kind='store' then s.store_id::text else null end,
      'kind',s.kind,'label',case when s.kind='store' then st.name else s.rest_label end,
      'address',case when s.kind='store' then concat_ws(', ',st.address,st.town,st.state_code) else s.rest_address end,
      'position',s.position,'priority',s.priority,'plannedDwellMinutes',s.planned_dwell_minutes,
      'state',s.state,'memoryStatus',case when s.kind='rest' then 'not_applicable'
        when exists(select 1 from trip_private.trip_visit_memories m where m.author_user_id=app_public.request_user_id() and m.trip_id=s.trip_id and m.store_id=s.store_id) then 'saved'
        else 'missing' end,
      'coordinate',case when s.kind='store' and st.latitude is not null then jsonb_build_object('latitude',st.latitude::float8,'longitude',st.longitude::float8) when s.kind='rest' and s.rest_latitude is not null then jsonb_build_object('latitude',s.rest_latitude::float8,'longitude',s.rest_longitude::float8) else null end,
      'hours',case when s.kind='store' then jsonb_build_object('state','unknown') else null end
    ) order by s.position) from trip_private.trip_stops s left join app_public.stores st on st.id=s.store_id where s.trip_id=t.trip_id),'[]'::jsonb)
  ) from trip_private.trips t where t.trip_id=target_trip_id;
$$;
alter function trip_private.trip_command_json(uuid) owner to identity_service;

create or replace function app_public.clone_completed_trip(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source_id uuid; source_trip trip_private.trips%rowtype; cloned_id uuid;
begin
  if not app_private.current_session_is_active() then raise exception 'authorization_lost'; end if;
  begin source_id:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(source_id) then raise exception 'authorization_lost'; end if;
  select * into source_trip from trip_private.trips t where t.trip_id=source_id and t.state='completed';
  if not found then raise exception 'not_available'; end if;
  insert into trip_private.trips(owner_id,area_id,name,local_date,departure_local_time,
    max_drive_miles,max_total_minutes,state)
  values(app_public.request_user_id(),source_trip.area_id,source_trip.name,source_trip.local_date,
    source_trip.departure_local_time,source_trip.max_drive_miles,source_trip.max_total_minutes,'draft')
  returning trip_private.trips.trip_id into cloned_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role)
    values(cloned_id,app_public.request_user_id(),'creator');
  insert into trip_private.trip_stops(trip_id,kind,store_id,rest_label,rest_address,
    rest_latitude,rest_longitude,position,priority,planned_dwell_minutes,state)
  select cloned_id,kind,store_id,rest_label,rest_address,rest_latitude,rest_longitude,
    position,priority,planned_dwell_minutes,'planned'
  from trip_private.trip_stops where trip_private.trip_stops.trip_id=source_id order by position;
  return trip_private.trip_command_json(cloned_id);
end; $$;
alter function app_public.clone_completed_trip(text) owner to identity_service;
revoke all on function app_public.clone_completed_trip(text) from public,anon;
grant execute on function app_public.clone_completed_trip(text) to authenticated;

revoke create on schema trip_private,app_public from identity_service;
revoke identity_service from postgres;
