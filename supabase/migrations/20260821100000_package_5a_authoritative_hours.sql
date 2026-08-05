-- Package 5A: exact store selection and authoritative, date-specific hours review.
-- This intentionally makes no routing, arrival-time, or optimality calculation.

grant identity_service to postgres;
grant create on schema trip_private,app_public to identity_service;

alter table trip_private.trips
  add column hours_reviewed_at timestamptz,
  add column hours_review_has_unresolved boolean,
  add column hours_warnings_acknowledged_at timestamptz,
  add constraint trip_hours_review_shape check (
    (hours_reviewed_at is null and hours_review_has_unresolved is null and hours_warnings_acknowledged_at is null)
    or (hours_reviewed_at is not null and hours_review_has_unresolved is not null
      and (hours_warnings_acknowledged_at is null or hours_review_has_unresolved))
  );

create or replace function trip_private.trip_hours_for_stop(target_store_id uuid,target_local_date date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  store_timezone text;
  as_of timestamptz;
  day_hours jsonb;
  day_state text;
  freshness text;
  intervals jsonb;
  first_open text;
  last_close text;
begin
  select s.timezone_name into store_timezone from app_public.stores s where s.id=target_store_id;
  if store_timezone is null then
    return jsonb_build_object('state','unknown','warning','Hours unavailable for this trip date.');
  end if;

  as_of:=make_timestamptz(
    extract(year from target_local_date)::int,extract(month from target_local_date)::int,
    extract(day from target_local_date)::int,12,0,0,store_timezone
  );
  select c.hours,c.hours_state into day_hours,day_state
    from app_public.catalog_today(target_store_id,as_of,store_timezone) c;
  select f.freshness_state into freshness
    from app_public.catalog_freshness(target_store_id,statement_timestamp()) f;

  if freshness is distinct from 'current' then
    return jsonb_build_object('state','stale','warning','Hours need verification for this trip date.');
  elsif day_state='closed' then
    return jsonb_build_object('state','verified','closed',true,
      'warning','Store is closed on this trip date.');
  elsif day_state is distinct from 'available' then
    return jsonb_build_object('state','unknown','warning','Hours unavailable for this trip date.');
  end if;

  intervals:=day_hours->'intervals';
  first_open:=intervals#>>'{0,opens_at}';
  last_close:=intervals#>>array[(jsonb_array_length(intervals)-1)::text,'closes_at'];
  return jsonb_build_object(
    'state','verified','closed',false,
    'opensAt',split_part(first_open,':',1)::int*60+split_part(first_open,':',2)::int,
    'closesAt',split_part(last_close,':',1)::int*60+split_part(last_close,':',2)::int
  );
end; $$;
alter function trip_private.trip_hours_for_stop(uuid,date) owner to identity_service;
revoke all on function trip_private.trip_hours_for_stop(uuid,date) from public,anon,authenticated;

create or replace function trip_private.trip_has_unresolved_hours(target_trip_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from trip_private.trip_stops s join trip_private.trips t on t.trip_id=s.trip_id
    where s.trip_id=target_trip_id and s.kind='store'
      and trip_private.trip_hours_for_stop(s.store_id,t.local_date) ? 'warning'
  );
$$;
alter function trip_private.trip_has_unresolved_hours(uuid) owner to identity_service;
revoke all on function trip_private.trip_has_unresolved_hours(uuid) from public,anon,authenticated;

create or replace function trip_private.trip_command_json(target_trip_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, trip_private, app_public, auth as $$
  select jsonb_build_object(
    'id',t.trip_id::text,'name',t.name,'localDate',t.local_date::text,'state',t.state,
    'version',t.version,
    'durationMinutes',case when t.started_at is null or t.completed_at is null then null
      else greatest(0,floor(extract(epoch from (t.completed_at-t.started_at))/60)::int) end,
    'startKind',t.start_kind,'startLabel',t.private_start_label,
    'origin',case when t.private_start_latitude is null then null else jsonb_build_object('latitude',t.private_start_latitude::float8,'longitude',t.private_start_longitude::float8) end,
    'returnCoordinate',case when t.private_return_latitude is null then null else jsonb_build_object('latitude',t.private_return_latitude::float8,'longitude',t.private_return_longitude::float8) end,
    'departureMinute',case when t.departure_local_time is null then null else extract(hour from t.departure_local_time)::int*60+extract(minute from t.departure_local_time)::int end,
    'transitionMinutes',10,'maxDriveMiles',t.max_drive_miles::float8,'maxTotalMinutes',t.max_total_minutes,
    'hoursReview',case when t.hours_reviewed_at is null then null else jsonb_build_object(
      'reviewedAt',t.hours_reviewed_at,'hasUnresolvedWarnings',t.hours_review_has_unresolved,
      'acknowledged',t.hours_warnings_acknowledged_at is not null) end,
    'stops',coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.stop_id::text,'storeId',case when s.kind='store' then s.store_id::text else null end,
      'kind',s.kind,'label',case when s.kind='store' then st.name else s.rest_label end,
      'address',case when s.kind='store' then concat_ws(', ',st.address,st.town,st.state_code) else s.rest_address end,
      'position',s.position,'priority',s.priority,'plannedDwellMinutes',s.planned_dwell_minutes,
      'state',s.state,'memoryStatus',case when s.kind='rest' then 'not_applicable'
        when exists(select 1 from trip_private.trip_visit_memories m where m.author_user_id=auth.uid() and m.trip_id=s.trip_id and m.store_id=s.store_id) then 'saved'
        else 'missing' end,
      'coordinate',case when s.kind='store' and st.latitude is not null then jsonb_build_object('latitude',st.latitude::float8,'longitude',st.longitude::float8) when s.kind='rest' and s.rest_latitude is not null then jsonb_build_object('latitude',s.rest_latitude::float8,'longitude',s.rest_longitude::float8) else null end,
      'hours',case when s.kind='store' then trip_private.trip_hours_for_stop(s.store_id,t.local_date) else null end
    ) order by s.position) from trip_private.trip_stops s left join app_public.stores st on st.id=s.store_id where s.trip_id=t.trip_id),'[]'::jsonb)
  ) from trip_private.trips t where t.trip_id=target_trip_id;
$$;
alter function trip_private.trip_command_json(uuid) owner to identity_service;

create or replace function app_public.add_trip_store_stop(trip_id text,store_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_trip uuid; target_store uuid; next_position integer;
begin
  begin target_trip:=trip_id::uuid;target_store:=store_id::uuid;
  exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(target_trip) then raise exception 'authorization_lost'; end if;
  if not exists(
    select 1 from trip_private.trips t join app_public.stores s on s.id=target_store and s.area_id=t.area_id
    where t.trip_id=target_trip and t.state in ('draft','ready')
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception 'store_stop_not_found'; end if;
  if exists(select 1 from trip_private.trip_stops s where s.trip_id=target_trip and s.store_id=target_store)
    then raise exception 'trip_stop_duplicate'; end if;
  select coalesce(max(s.position),-1)+1 into next_position from trip_private.trip_stops s where s.trip_id=target_trip;
  if next_position>7 then raise exception 'trip_stop_limit_exceeded'; end if;
  insert into trip_private.trip_stops(trip_id,kind,store_id,position,priority,planned_dwell_minutes)
    values(target_trip,'store',target_store,next_position,'prefer',60);
  update trip_private.trips set state='draft',hours_reviewed_at=null,hours_review_has_unresolved=null,
    hours_warnings_acknowledged_at=null,version=version+1,updated_at=statement_timestamp()
    where trip_private.trips.trip_id=target_trip;
  return trip_private.trip_command_json(target_trip);
end; $$;
alter function app_public.add_trip_store_stop(text,text) owner to identity_service;
revoke all on function app_public.add_trip_store_stop(text,text) from public,anon;
grant execute on function app_public.add_trip_store_stop(text,text) to authenticated;

create or replace function app_public.review_trip_hours(trip_id text,acknowledge_warnings boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_trip uuid; unresolved boolean;
begin
  begin target_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(target_trip) then raise exception 'authorization_lost'; end if;
  if not exists(select 1 from trip_private.trip_stops s where s.trip_id=target_trip) then raise exception 'trip_has_no_stops'; end if;
  unresolved:=trip_private.trip_has_unresolved_hours(target_trip);
  update trip_private.trips set
    hours_reviewed_at=statement_timestamp(),hours_review_has_unresolved=unresolved,
    hours_warnings_acknowledged_at=case when unresolved and acknowledge_warnings then statement_timestamp() else null end,
    state=case when not unresolved or acknowledge_warnings then 'ready' else 'draft' end,
    version=version+1,updated_at=statement_timestamp()
  where trip_private.trips.trip_id=target_trip and state in ('draft','ready');
  if not found then raise exception 'not_allowed'; end if;
  return trip_private.trip_command_json(target_trip);
end; $$;
alter function app_public.review_trip_hours(text,boolean) owner to identity_service;
revoke all on function app_public.review_trip_hours(text) from public,anon,authenticated;
revoke all on function app_public.review_trip_hours(text,boolean) from public,anon;
grant execute on function app_public.review_trip_hours(text,boolean) to authenticated;

create or replace function trip_private.invalidate_trip_hours_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare affected_trip uuid:=coalesce(new.trip_id,old.trip_id);
begin
  update trip_private.trips set state=case when state='ready' then 'draft' else state end,
    hours_reviewed_at=null,hours_review_has_unresolved=null,hours_warnings_acknowledged_at=null,
    updated_at=statement_timestamp() where trip_id=affected_trip and state in ('draft','ready');
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
alter function trip_private.invalidate_trip_hours_review() owner to identity_service;
revoke all on function trip_private.invalidate_trip_hours_review() from public,anon,authenticated;
create trigger invalidate_trip_hours_after_stop
after insert or update or delete on trip_private.trip_stops
for each row execute function trip_private.invalidate_trip_hours_review();

create or replace function trip_private.invalidate_trip_hours_on_date_change()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.local_date is distinct from old.local_date then
    new.state:=case when new.state='ready' then 'draft' else new.state end;
    new.hours_reviewed_at:=null;
    new.hours_review_has_unresolved:=null;
    new.hours_warnings_acknowledged_at:=null;
  end if;
  return new;
end; $$;
alter function trip_private.invalidate_trip_hours_on_date_change() owner to identity_service;
revoke all on function trip_private.invalidate_trip_hours_on_date_change() from public,anon,authenticated;
create trigger invalidate_trip_hours_on_date_change before update of local_date on trip_private.trips
for each row execute function trip_private.invalidate_trip_hours_on_date_change();

create or replace function trip_private.guard_trip_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='active' and old.state<>'active' and (
    new.departure_local_time is null or new.navigator_user_id is null or new.navigator_device_hash is null
    or new.hours_reviewed_at is null
    or new.hours_review_has_unresolved is null
    or (new.hours_review_has_unresolved and new.hours_warnings_acknowledged_at is null)
    or trip_private.trip_has_unresolved_hours(new.trip_id) is distinct from new.hours_review_has_unresolved
    or not ((new.start_kind='manual' and new.private_start_label is not null) or (new.start_kind='current_location' and new.private_start_latitude is not null and new.private_start_longitude is not null))
    or not exists(select 1 from trip_private.trip_device_bindings b where b.trip_id=new.trip_id and b.user_id=new.navigator_user_id and b.device_hash=new.navigator_device_hash and b.state='active')
    or not (auth.uid()=new.owner_id or old.navigator_user_id=auth.uid())
  ) then raise exception 'not_allowed'; end if;
  return new;
end; $$;
alter function trip_private.guard_trip_activation() owner to identity_service;

revoke create on schema trip_private,app_public from identity_service;
revoke identity_service from postgres;
