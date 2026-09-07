-- Qualify stop columns in the versioned priority and dwell commands.
create or replace function app_public.set_trip_stop_priority(trip_id text,stop_id text,priority text,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if priority is null or priority not in ('must','prefer','flexible') then raise exception 'validation_failed'; end if;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  update trip_private.trip_stops as s
     set priority=set_trip_stop_priority.priority,version=s.version+1
   where s.trip_id=v_trip and s.stop_id=v_stop;
  if not found then raise exception 'not_found'; end if;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_stop_priority(text,text,text,bigint) owner to identity_service;

create or replace function app_public.set_trip_stop_dwell(trip_id text,stop_id text,dwell_minutes integer,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if dwell_minutes is null or dwell_minutes not between 5 and 720 then raise exception 'validation_failed'; end if;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  update trip_private.trip_stops as s
     set planned_dwell_minutes=set_trip_stop_dwell.dwell_minutes,version=s.version+1
   where s.trip_id=v_trip and s.stop_id=v_stop;
  if not found then raise exception 'not_found'; end if;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_stop_dwell(text,text,integer,bigint) owner to identity_service;
