-- Repair the directional ordering calculation while preserving the public RPC contract.
grant create on schema app_public to identity_service;
do $wrap$
begin
  perform set_config('role', 'identity_service', true);
  execute $fn$

create or replace function app_public.reorder_trip_stop(trip_id text, stop_id text, "position" integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_private as $$
declare
  v_trip_id uuid;
  v_stop_id uuid;
  v_count integer;
  v_locked_trip_id uuid;
  v_target_position integer := reorder_trip_stop."position";
begin
  if trip_id is null or stop_id is null then
    raise exception 'trip_stop_id_invalid';
  end if;

  begin
    v_trip_id := trip_id::uuid;
    v_stop_id := stop_id::uuid;
  exception when others then
    raise exception 'trip_stop_id_invalid';
  end;

  if not trip_private.trip_owner_can_access(v_trip_id) then
    raise exception 'authorization_lost';
  end if;

  select t.trip_id
    into v_locked_trip_id
    from trip_private.trips as t
   where t.trip_id = v_trip_id
     and t.owner_id = app_public.request_user_id()
   for update;
  if v_locked_trip_id is null then
    raise exception 'authorization_lost';
  end if;

  select count(*)
    into v_count
    from trip_private.trip_stops as s
   where s.trip_id = v_trip_id;

  if v_target_position is null
     or v_target_position < 0
     or v_target_position >= v_count
     or not exists (
       select 1
         from trip_private.trip_stops as s
        where s.trip_id = v_trip_id
          and s.stop_id = v_stop_id
     ) then
    raise exception 'trip_position_invalid';
  end if;

  with remaining as (
    select s.stop_id,
           row_number() over (order by s.position, s.stop_id) - 1 as remaining_position
      from trip_private.trip_stops as s
     where s.trip_id = v_trip_id
       and s.stop_id <> v_stop_id
  ), ordered as (
    select v_stop_id as stop_id, v_target_position as next_position
    union all
    select r.stop_id,
           case when r.remaining_position >= v_target_position
                then r.remaining_position + 1
                else r.remaining_position
           end as next_position
      from remaining as r
  )
  update trip_private.trip_stops as s
     set position = o.next_position::smallint
    from ordered as o
   where s.trip_id = v_trip_id
     and s.stop_id = o.stop_id;

  update trip_private.trips as t
     set version = t.version + 1,
         updated_at = statement_timestamp()
   where t.trip_id = v_trip_id;

  return trip_private.trip_command_json(v_trip_id);
end; $$;

  $fn$;
  execute $priv$revoke all on function app_public.reorder_trip_stop(text, text, integer) from public, anon$priv$;
  execute $priv$grant execute on function app_public.reorder_trip_stop(text, text, integer) to authenticated$priv$;
  perform set_config('role', 'none', true);
end;
$wrap$;
revoke create on schema app_public from identity_service;
