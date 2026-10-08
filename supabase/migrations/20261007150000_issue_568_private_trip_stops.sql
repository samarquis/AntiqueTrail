-- #568: organizer-only private trip stops and stop-scoped visit identity.

create temporary table issue568_prior_identity_service_membership on commit drop as
select 1 as present
where exists (
  select 1 from pg_auth_members
  where roleid='identity_service'::regrole and member='postgres'::regrole
);
grant identity_service to postgres;
grant create on schema trip_private to identity_service;

create table trip_private.private_stop_capability (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
alter table trip_private.private_stop_capability owner to identity_service;
insert into trip_private.private_stop_capability(singleton,enabled) values (true,false);
revoke all on trip_private.private_stop_capability from public, anon, authenticated, service_role;

create function trip_private.private_stop_capability_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from trip_private.private_stop_capability where singleton),false);
$$;
alter function trip_private.private_stop_capability_enabled() owner to identity_service;
revoke all on function trip_private.private_stop_capability_enabled() from public, anon, authenticated, service_role;
grant execute on function trip_private.private_stop_capability_enabled() to identity_service;

create function trip_private.enforce_private_stop_capability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not trip_private.private_stop_capability_enabled() then
    if tg_op='INSERT' and new.kind='private' then
      raise exception using errcode='55000',message='private_trip_stops_disabled';
    elsif tg_op='UPDATE' and (old.kind='private' or new.kind='private') then
      if old.kind is distinct from 'private' or new.kind is distinct from 'private'
         or (pg_catalog.to_jsonb(new)-array['position','version'])
           is distinct from (pg_catalog.to_jsonb(old)-array['position','version'])
         or (new.position is not distinct from old.position
             and new.version is distinct from old.version) then
        raise exception using errcode='55000',message='private_trip_stops_disabled';
      end if;
    end if;
  end if;
  return new;
end;
$$;
alter function trip_private.enforce_private_stop_capability() owner to identity_service;
revoke all on function trip_private.enforce_private_stop_capability() from public, anon, authenticated, service_role;
grant execute on function trip_private.enforce_private_stop_capability() to identity_service;
create trigger trip_stops_private_capability
before insert or update on trip_private.trip_stops
for each row execute function trip_private.enforce_private_stop_capability();

-- Catalog reorders rewrite every trip row. Let that position bookkeeping pass
-- while the private-stop capability is off, but reject a private target.
grant create on schema app_public to identity_service;
do $wrap$
begin
  perform set_config('role','identity_service',true);
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

  if not trip_private.private_stop_capability_enabled()
     and exists (
       select 1 from trip_private.trip_stops as s
        where s.trip_id = v_trip_id and s.stop_id = v_stop_id and s.kind = 'private'
     ) then
    raise exception using errcode='55000',message='private_trip_stops_disabled';
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
  perform set_config('role','none',true);
end;
$wrap$;
revoke create on schema app_public from identity_service;

create or replace function trip_private.private_source_url_valid(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value is null or (
    char_length(value) between 1 and 2048
    and value !~ '[[:cntrl:]]'
    and value !~ '[[:space:]]'
    and value ~ '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?([/?#][^[:space:][:cntrl:]]*)?$'
  );
$$;
alter function trip_private.private_source_url_valid(text) owner to identity_service;
revoke all on function trip_private.private_source_url_valid(text) from public, anon, authenticated;
grant execute on function trip_private.private_source_url_valid(text) to identity_service;

create or replace function trip_private.private_hours_valid(value jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_interval jsonb;
  v_holiday jsonb;
  v_closure jsonb;
  v_weekday integer;
  v_weekdays boolean[] := array[false,false,false,false,false,false,false];
  v_open text;
  v_close text;
  v_previous_close text;
  v_date text;
  v_timezone text;
  v_intervals jsonb;
  v_closed boolean;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'object' or value ? 'version'
     or jsonb_typeof(value->'timeZone') is distinct from 'string'
     or jsonb_typeof(value->'weekly') is distinct from 'array'
     or jsonb_array_length(value->'weekly') <> 7
     or jsonb_typeof(value->'holidays') is distinct from 'array'
     or jsonb_array_length(value->'holidays') > 100 then
    return false;
  end if;
  if value - array['timeZone','weekly','holidays','temporaryClosure'] <> '{}'::jsonb then
    return false;
  end if;
  v_timezone := value->>'timeZone';
  if char_length(v_timezone) not between 1 and 128
     or not exists(select 1 from pg_catalog.pg_timezone_names as zones where zones.name = v_timezone) then
    return false;
  end if;

  for v_day in select item from pg_catalog.jsonb_array_elements(value->'weekly') as items(item) loop
    if jsonb_typeof(v_day) is distinct from 'object' then return false; end if;
    if v_day - array['weekday','label','isClosed','intervals'] <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(v_day->'weekday') is distinct from 'number'
       or jsonb_typeof(v_day->'label') is distinct from 'string'
       or jsonb_typeof(v_day->'isClosed') is distinct from 'boolean'
       or jsonb_typeof(v_day->'intervals') is distinct from 'array'
       or jsonb_array_length(v_day->'intervals') > 2 then
      return false;
    end if;
    v_weekday := (v_day->>'weekday')::integer;
    if v_weekday not between 0 and 6 or v_weekdays[v_weekday+1]
       or char_length(v_day->>'label') not between 1 and 32
       or (v_day->>'label') ~ '[[:cntrl:]]' then
      return false;
    end if;
    v_weekdays[v_weekday+1] := true;
    v_closed := (v_day->>'isClosed')::boolean;
    v_intervals := v_day->'intervals';
    if v_closed and jsonb_array_length(v_intervals) > 0 then return false; end if;
    v_previous_close := null;
    for v_interval in select item from pg_catalog.jsonb_array_elements(v_intervals) as items(item) loop
      if jsonb_typeof(v_interval) is distinct from 'object' then return false; end if;
      if v_interval - array['opensAt','closesAt'] <> '{}'::jsonb then return false; end if;
      if jsonb_typeof(v_interval->'opensAt') is distinct from 'string'
         or jsonb_typeof(v_interval->'closesAt') is distinct from 'string' then return false; end if;
      v_open := v_interval->>'opensAt';
      v_close := v_interval->>'closesAt';
      if v_open !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
         or v_close !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
         or v_open >= v_close
         or (v_previous_close is not null and v_previous_close > v_open) then return false; end if;
      v_previous_close := v_close;
    end loop;
  end loop;

  for v_holiday in select item from pg_catalog.jsonb_array_elements(value->'holidays') as items(item) loop
    if jsonb_typeof(v_holiday) is distinct from 'object' then return false; end if;
    if v_holiday - array['localDate','label','isClosed','intervals'] <> '{}'::jsonb then return false; end if;
    if jsonb_typeof(v_holiday->'localDate') is distinct from 'string'
       or jsonb_typeof(v_holiday->'label') is distinct from 'string'
       or jsonb_typeof(v_holiday->'isClosed') is distinct from 'boolean'
       or jsonb_typeof(v_holiday->'intervals') is distinct from 'array'
       or jsonb_array_length(v_holiday->'intervals') > 2 then return false; end if;
    v_date := v_holiday->>'localDate';
    if v_date !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_date::date)::text <> v_date
       or char_length(v_holiday->>'label') not between 1 and 80
       or (v_holiday->>'label') ~ '[[:cntrl:]]' then return false; end if;
    v_closed := (v_holiday->>'isClosed')::boolean;
    v_intervals := v_holiday->'intervals';
    if v_closed and jsonb_array_length(v_intervals) > 0 then return false; end if;
    v_previous_close := null;
    for v_interval in select item from pg_catalog.jsonb_array_elements(v_intervals) as items(item) loop
      if jsonb_typeof(v_interval) is distinct from 'object' then return false; end if;
      if v_interval - array['opensAt','closesAt'] <> '{}'::jsonb then return false; end if;
      if jsonb_typeof(v_interval->'opensAt') is distinct from 'string'
         or jsonb_typeof(v_interval->'closesAt') is distinct from 'string' then return false; end if;
      v_open := v_interval->>'opensAt';
      v_close := v_interval->>'closesAt';
      if v_open !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
         or v_close !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
         or v_open >= v_close
         or (v_previous_close is not null and v_previous_close > v_open) then return false; end if;
      v_previous_close := v_close;
    end loop;
  end loop;

  if value ? 'temporaryClosure' and value->'temporaryClosure' <> 'null'::jsonb then
    v_closure := value->'temporaryClosure';
    if jsonb_typeof(v_closure) <> 'object'
       or jsonb_typeof(v_closure->'startDate') is distinct from 'string'
       or jsonb_typeof(v_closure->'endDate') is distinct from 'string' then return false; end if;
    if v_closure - array['startDate','endDate','reason'] <> '{}'::jsonb then return false; end if;
    v_date := v_closure->>'startDate';
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' or (v_date::date)::text <> v_date then return false; end if;
    v_date := v_closure->>'endDate';
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' or (v_date::date)::text <> v_date
       or v_closure->>'startDate' > v_date then return false; end if;
    if v_closure ? 'reason' and jsonb_typeof(v_closure->'reason') not in ('string','null') then return false; end if;
    if char_length(coalesce(v_closure->>'reason','')) > 200
       or coalesce(v_closure->>'reason','') ~ '[[:cntrl:]]' then return false; end if;
  end if;
  return true;
exception when others then
  return false;
end;
$$;
alter function trip_private.private_hours_valid(jsonb) owner to identity_service;
revoke all on function trip_private.private_hours_valid(jsonb) from public, anon, authenticated;
grant execute on function trip_private.private_hours_valid(jsonb) to identity_service;

alter table trip_private.trip_stops
  add column private_name text,
  add column private_address text,
  add column private_source_url text,
  add column private_hours jsonb,
  add column destination_status text not null default 'draft';
alter table trip_private.trip_stops drop constraint trip_stops_kind_check;
alter table trip_private.trip_stops add constraint trip_stops_kind_check
  check (kind in ('store','rest','private'));
alter table trip_private.trip_stops drop constraint stop_kind_shape;
alter table trip_private.trip_stops add constraint stop_kind_shape check (
  (kind='store' and store_id is not null and rest_label is null and rest_address is null
    and rest_latitude is null and rest_longitude is null and private_name is null
    and private_address is null and private_source_url is null and private_hours is null
    and destination_status='draft')
  or (kind='rest' and store_id is null and rest_label is not null and rest_address is not null
    and private_name is null and private_address is null and private_source_url is null
    and private_hours is null and destination_status='draft')
  or (kind='private' and store_id is null and rest_label is null and rest_address is null
    and rest_latitude is null and rest_longitude is null and private_name is not null
    and destination_status in ('draft','confirmed_by_organizer')
    and (destination_status='draft' or private_address is not null or location_purged_at is not null))
);
alter table trip_private.trip_stops add constraint private_stop_name_safe
  check (private_name is null or (char_length(btrim(private_name)) between 1 and 160 and private_name !~ '[[:cntrl:]]'));
alter table trip_private.trip_stops add constraint private_stop_address_safe
  check (private_address is null or (char_length(btrim(private_address)) between 1 and 320 and private_address !~ '[[:cntrl:]]'));
alter table trip_private.trip_stops add constraint private_stop_source_url_safe
  check (trip_private.private_source_url_valid(private_source_url));
alter table trip_private.trip_stops add constraint private_stop_hours_safe
  check (trip_private.private_hours_valid(private_hours));

alter table trip_private.trip_visit_memories add column memory_id uuid;
update trip_private.trip_visit_memories
   set memory_id = extensions.gen_random_uuid()
 where memory_id is null;
alter table trip_private.trip_visit_memories drop constraint trip_visit_memories_pkey;
alter table trip_private.trip_visit_memories
  alter column memory_id set default extensions.gen_random_uuid(),
  alter column memory_id set not null,
  alter column store_id drop not null,
  add column stop_id uuid,
  add column private_stop_id uuid references trip_private.trip_stops(stop_id) on delete set null,
  add column private_stop_name text,
  add column private_stop_address text;
alter table trip_private.trip_visit_memories add constraint trip_visit_memories_pkey primary key (memory_id);
alter table trip_private.trip_visit_memories add constraint visit_memory_stop_identity_shape
  check (stop_id is not null or store_id is not null);
alter table trip_private.trip_visit_memories add constraint visit_memory_private_snapshot_shape check (
  (private_stop_name is null and private_stop_address is null and private_stop_id is null)
  or (private_stop_name is not null and store_id is null and stop_id is not null
      and char_length(btrim(private_stop_name)) between 1 and 160
      and private_stop_name !~ '[[:cntrl:]]'
      and (private_stop_address is null or
        (char_length(btrim(private_stop_address)) between 1 and 320 and private_stop_address !~ '[[:cntrl:]]')))
);
create unique index trip_visit_memories_legacy_store_unique
  on trip_private.trip_visit_memories(author_user_id,trip_id,store_id)
  where stop_id is null and store_id is not null;
create unique index trip_visit_memories_stop_identity_unique
  on trip_private.trip_visit_memories(author_user_id,trip_id,stop_id)
  where stop_id is not null;

create or replace function trip_private.validate_private_stop_visit_memory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_stop trip_private.trip_stops%rowtype; v_owner uuid;
begin
  if new.private_stop_name is null then
    if new.private_stop_id is not null then raise exception 'private_visit_snapshot_invalid'; end if;
    return new;
  end if;
  select t.owner_id into v_owner from trip_private.trips as t where t.trip_id=new.trip_id;
  if v_owner is distinct from new.author_user_id then raise exception 'authorization_lost'; end if;
  if new.private_stop_id is null then return new; end if;
  select s.* into v_stop from trip_private.trip_stops as s
   where s.stop_id=new.private_stop_id and s.trip_id=new.trip_id;
  if not found or v_stop.kind <> 'private' or new.stop_id <> v_stop.stop_id
     or new.private_stop_name is distinct from v_stop.private_name
     or (new.private_stop_address is distinct from v_stop.private_address and not (
       v_stop.private_address is null and v_stop.location_purged_at is not null
       and tg_op = 'UPDATE'
       and old.trip_id is not distinct from new.trip_id
       and old.stop_id is not distinct from new.stop_id
       and old.private_stop_id is not distinct from v_stop.stop_id
       and old.private_stop_name is not distinct from new.private_stop_name
       and old.private_stop_address is not distinct from new.private_stop_address
     )) then
    raise exception 'private_visit_snapshot_invalid';
  end if;
  return new;
end;
$$;
alter function trip_private.validate_private_stop_visit_memory() owner to identity_service;
revoke all on function trip_private.validate_private_stop_visit_memory() from public, anon, authenticated;
drop trigger if exists validate_private_stop_visit_memory on trip_private.trip_visit_memories;
create trigger validate_private_stop_visit_memory
  before insert or update on trip_private.trip_visit_memories
  for each row execute function trip_private.validate_private_stop_visit_memory();

create or replace function trip_private.lock_private_stop_trip(target_trip uuid)
returns table(trip_version bigint, trip_state text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not trip_private.trip_owner_can_access(target_trip) then raise exception 'authorization_lost'; end if;
  return query
    select t.version,t.state from trip_private.trips as t
     where t.trip_id=target_trip for update;
  if not found then raise exception 'authorization_lost'; end if;
end;
$$;
alter function trip_private.lock_private_stop_trip(uuid) owner to identity_service;
revoke all on function trip_private.lock_private_stop_trip(uuid) from public, anon, authenticated;
grant execute on function trip_private.lock_private_stop_trip(uuid) to identity_service;

create or replace function trip_private.private_stop_receipt_replay(
  target_trip uuid,
  target_version bigint,
  target_state text,
  target_command text,
  target_key text,
  target_expected_version bigint,
  submitted jsonb,
  requested_stop_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_receipt jsonb; v_receipt_base_version bigint; v_stop_id uuid; v_stop trip_private.trip_stops%rowtype;
begin
  select r.result_metadata,r.base_version into v_receipt,v_receipt_base_version
   from trip_private.trip_mutation_receipts as r
   where r.trip_id=target_trip and r.idempotency_key=target_key;
  if not found then return null; end if;
  if v_receipt->>'command' <> target_command
     or target_state not in ('draft','ready')
     or target_expected_version is distinct from v_receipt_base_version
     or target_version is distinct from (v_receipt->>'resulting_version')::bigint then
    raise exception 'conflict';
  end if;
  begin v_stop_id := (v_receipt->>'stop_id')::uuid;
  exception when others then raise exception 'conflict'; end;
  if target_command in ('update_private_trip_stop','confirm_trip_stop_destination')
     and requested_stop_id is distinct from v_stop_id then
    raise exception 'conflict';
  end if;
  select s.* into v_stop from trip_private.trip_stops as s
   where s.trip_id=target_trip and s.stop_id=v_stop_id and s.kind='private';
  if not found then raise exception 'conflict'; end if;
  if target_command='confirm_trip_stop_destination' then
    if v_stop.private_address is distinct from submitted->>'exact_address'
       or v_stop.destination_status <> 'confirmed_by_organizer' then raise exception 'conflict'; end if;
  else
    if v_stop.private_name is distinct from submitted->>'name'
       or v_stop.private_address is distinct from submitted->>'address'
       or v_stop.private_source_url is distinct from submitted->>'source_url'
       or v_stop.private_hours is distinct from nullif(submitted->'hours','null'::jsonb)
       or v_stop.priority is distinct from submitted->>'priority'
       or v_stop.planned_dwell_minutes is distinct from (submitted->>'planned_dwell_minutes')::smallint then
      raise exception 'conflict';
    end if;
  end if;
  return v_stop_id;
end;
$$;
alter function trip_private.private_stop_receipt_replay(uuid,bigint,text,text,text,bigint,jsonb,uuid) owner to identity_service;
revoke all on function trip_private.private_stop_receipt_replay(uuid,bigint,text,text,text,bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function trip_private.private_stop_receipt_replay(uuid,bigint,text,text,text,bigint,jsonb,uuid) to identity_service;

create or replace function app_public.remove_trip_stop(trip_id text,stop_id text,expected_version bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid; v_stop uuid; v_version bigint; v_state text; v_kind text; v_position integer; v_next integer;
begin
  begin v_trip:=trip_id::uuid; v_stop:=stop_id::uuid;
  exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'not_allowed'; end if;
  select t.version,t.state into v_version,v_state from trip_private.trips as t
   where t.trip_id=v_trip for update;
  if not found then raise exception 'authorization_lost'; end if;
  if expected_version is null or expected_version < 1 or v_version<>expected_version then raise exception 'conflict'; end if;
  select s.kind,s.position into v_kind,v_position from trip_private.trip_stops as s
   where s.trip_id=v_trip and s.stop_id=v_stop for update;
  if not found then raise exception 'not_found'; end if;
  if v_kind='private' then
    if not trip_private.private_stop_capability_enabled() then raise exception using errcode='55000',message='private_trip_stops_disabled'; end if;
    if not trip_private.trip_owner_can_access(v_trip) then raise exception 'authorization_lost'; end if;
    if v_state not in ('draft','ready','completed') then raise exception 'authorization_lost'; end if;
    if v_state='completed' and not exists(select 1 from trip_private.trip_visit_memories as m
       where m.author_user_id=app_public.request_user_id() and m.trip_id=v_trip and m.stop_id=v_stop) then
      raise exception 'not_allowed';
    end if;
  elsif v_state not in ('draft','ready') then
    raise exception 'authorization_lost';
  end if;
  delete from trip_private.trip_stops as s where s.trip_id=v_trip and s.stop_id=v_stop;
  for v_next in v_position+1..7 loop
    update trip_private.trip_stops as s set position=v_next-1,version=s.version+1
     where s.trip_id=v_trip and s.position=v_next;
  end loop;
  update trip_private.trips as t set version=t.version+1,updated_at=statement_timestamp()
   where t.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end;
$$;
grant create on schema app_public to identity_service;
alter function app_public.remove_trip_stop(text,text,bigint) owner to identity_service;

set role identity_service;
create function trip_private.project_completed_private_stops(target_trip_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from trip_private.trip_stops as s
    where s.trip_id=target_trip_id and s.kind='private')
    and not trip_private.private_stop_capability_enabled() then
    raise exception using errcode='55000',message='private_trip_stops_disabled';
  end if;
  insert into trip_private.trip_visit_memories(
    author_user_id,trip_id,stop_id,private_stop_id,private_stop_name,private_stop_address
  )
  select t.owner_id,t.trip_id,s.stop_id,s.stop_id,s.private_name,s.private_address
    from trip_private.trips as t
    join trip_private.trip_stops as s on s.trip_id=t.trip_id
   where t.trip_id=target_trip_id and s.kind='private' and s.state='completed'
  on conflict(author_user_id,trip_id,stop_id) where stop_id is not null
  do update set private_stop_id=excluded.private_stop_id,
    private_stop_name=excluded.private_stop_name,private_stop_address=excluded.private_stop_address,
    version=trip_private.trip_visit_memories.version+1,updated_at=statement_timestamp();
  update trip_private.trip_stops as s set private_address=null,location_purged_at=statement_timestamp()
   where s.trip_id=target_trip_id and s.kind='private';
end;
$$;
revoke all on function trip_private.project_completed_private_stops(uuid) from public,anon,authenticated,service_role;

create or replace function app_public.execute_verified_go_command(
  target_user_id text,target_session_id text,trip_id text,action text,stop_id text,
  base_version bigint,device_key_id text,proof_nonce text,proof_issued_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid; v_session uuid; v_trip uuid; v_stop uuid; v_nonce uuid;
  v_state text; v_allowed boolean; v_target text; v_trip_version bigint;
begin
  begin
    v_user:=target_user_id::uuid; v_session:=target_session_id::uuid;
    v_trip:=trip_id::uuid; v_nonce:=proof_nonce::uuid;
    if stop_id is not null then v_stop:=stop_id::uuid; end if;
  exception when others then raise exception 'device_proof_invalid'; end;
  if action not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop','complete_trip')
     or proof_issued_at not between statement_timestamp()-interval '5 minutes' and statement_timestamp()+interval '5 minutes' then
    raise exception 'device_proof_invalid';
  end if;
  if not exists(
    select 1 from app_private.profiles as p
    join app_private.active_sessions as s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
    where p.user_id=v_user and p.status='active' and s.session_id=v_session and s.state='active'
      and s.provider_created_at is not null
      and (s.access_token_expires_at is null or s.access_token_expires_at>statement_timestamp())
      and (p.sessions_revoked_before is null or s.provider_created_at>p.sessions_revoked_before)
  ) then raise exception 'not_allowed'; end if;
  select t.version into v_trip_version from trip_private.trips as t
   where t.trip_id=v_trip and t.state='active' and t.version=base_version
     and t.navigator_user_id=v_user
     and t.navigator_device_hash=extensions.digest(convert_to(device_key_id,'utf8'),'sha256')
   for update;
  if v_trip_version is null then raise exception 'not_allowed'; end if;
  begin
    insert into trip_private.trip_device_proof_nonces(
      device_key_id,nonce,trip_id,user_id,purpose,action,issued_at
    ) values (device_key_id,v_nonce,v_trip,v_user,'go',action,proof_issued_at);
  exception when unique_violation then raise exception 'device_proof_replayed'; end;
  if action='complete_trip' then
    if exists(select 1 from trip_private.trip_stops as s
      where s.trip_id=v_trip and s.state not in ('completed','skipped','observed_closed')) then
      raise exception 'conflict';
    end if;
    perform trip_private.project_completed_private_stops(v_trip);
    update trip_private.trips as t set state='completed',start_kind=null,private_start_label=null,
      private_start_latitude=null,private_start_longitude=null,private_return_label=null,
      private_return_latitude=null,private_return_longitude=null,location_purged_at=statement_timestamp(),
      navigator_user_id=null,navigator_device_hash=null,version=t.version+1,updated_at=statement_timestamp()
     where t.trip_id=v_trip;
    update trip_private.trip_stops as s set rest_address=null,rest_latitude=null,rest_longitude=null,
      location_purged_at=statement_timestamp() where s.trip_id=v_trip and s.kind='rest';
    update trip_private.trip_device_bindings as b set state='revoked',revoked_at=statement_timestamp(),
      revocation_reason='trip_completed' where b.trip_id=v_trip and b.state='active';
    update trip_private.trip_offline_grants as g set state='revoked',revoked_at=statement_timestamp()
     where g.trip_id=v_trip and g.state='active';
    return trip_private.trip_command_json(v_trip);
  end if;
  select s.state into v_state from trip_private.trip_stops as s
   where s.trip_id=v_trip and s.stop_id=v_stop for update;
  v_target:=case action when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed'
    when 'skip_stop' then 'skipped' when 'mark_observed_closed' then 'observed_closed' else 'planned' end;
  v_allowed:=(v_state='planned' and v_target in ('arrived','skipped','observed_closed'))
    or (v_state='arrived' and v_target in ('completed','skipped','observed_closed'))
    or (v_state in ('skipped','observed_closed') and v_target='planned');
  if not coalesce(v_allowed,false) then raise exception 'conflict'; end if;
  update trip_private.trip_stops as s set state=v_target,
    arrived_at=case when v_target='arrived' then statement_timestamp() when v_target='planned' then null else s.arrived_at end,
    completed_at=case when v_target='completed' then statement_timestamp() when v_target='planned' then null else s.completed_at end,
    closed_observed_at=case when v_target='observed_closed' then statement_timestamp() when v_target='planned' then null else s.closed_observed_at end,
    version=s.version+1 where s.trip_id=v_trip and s.stop_id=v_stop;
  update trip_private.trips as t set version=t.version+1,updated_at=statement_timestamp() where t.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end;
$$;
reset role;
revoke all on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)
  to trip_go_gateway;

create or replace function app_public.complete_trip(trip_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.go_actor_can_mutate(v_trip)
     or exists(select 1 from trip_private.trip_stops as s
       where s.trip_id=v_trip and s.state not in ('completed','skipped','observed_closed')) then
    raise exception 'not_allowed';
  end if;
  if exists(select 1 from trip_private.trip_stops as s where s.trip_id=v_trip and s.kind='private')
     and not trip_private.private_stop_capability_enabled() then
    raise exception using errcode='55000',message='private_trip_stops_disabled';
  end if;
  perform trip_private.project_completed_private_stops(v_trip);

  update trip_private.trips as t set state='completed',start_kind=null,private_start_label=null,
    private_start_latitude=null,private_start_longitude=null,private_return_label=null,
    private_return_latitude=null,private_return_longitude=null,location_purged_at=statement_timestamp(),
    navigator_user_id=null,navigator_device_hash=null,version=t.version+1,updated_at=statement_timestamp()
   where t.trip_id=v_trip;
  update trip_private.trip_stops as s set rest_address=null,rest_latitude=null,rest_longitude=null,
    location_purged_at=statement_timestamp()
   where s.trip_id=v_trip and s.kind='rest';
  update trip_private.trip_device_bindings as b set state='revoked',revoked_at=statement_timestamp(),
    revocation_reason='trip_completed'
   where b.trip_id=v_trip and b.state='active';
  update trip_private.trip_offline_grants as g set state='revoked',revoked_at=statement_timestamp()
   where g.trip_id=v_trip and g.state='active';
  return trip_private.trip_command_json(v_trip);
end;
$$;
alter function app_public.complete_trip(text) owner to identity_service;

drop function app_public.save_trip_visit_memory(text,text,integer,text,text);
create function app_public.save_trip_visit_memory(trip_id text,stop_id text,rating integer,return_choice text,note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare v_trip uuid; v_stop uuid; v_store uuid; v_kind text; v_name text; v_address text;
begin
  begin v_trip:=trip_id::uuid; v_stop:=stop_id::uuid;
  exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip)
    or (rating is null and return_choice is null and nullif(btrim(note),'') is null)
    or (rating is not null and rating not between 1 and 5)
    or (return_choice is not null and return_choice not in ('no','maybe','yes'))
    or char_length(note)>2000
    or not exists(select 1 from trip_private.trips as t
      join trip_private.trip_stops as s on s.trip_id=t.trip_id
      where t.trip_id=v_trip and t.state='completed' and s.stop_id=v_stop
        and s.kind in ('store','private')
        and s.state in ('completed','observed_closed')) then
    raise exception 'validation_failed';
  end if;
  select s.store_id,s.kind,s.private_name,s.private_address
    into v_store,v_kind,v_name,v_address
    from trip_private.trips as t
    join trip_private.trip_stops as s on s.trip_id=t.trip_id
   where t.trip_id=v_trip and t.state='completed' and s.stop_id=v_stop
     and s.kind in ('store','private') and s.state in ('completed','observed_closed');
  if not found then raise exception 'validation_failed'; end if;
  if v_kind='private' and not trip_private.private_stop_capability_enabled() then
    raise exception using errcode='55000',message='private_trip_stops_disabled';
  end if;
  insert into trip_private.trip_visit_memories(
    author_user_id,trip_id,store_id,stop_id,private_stop_id,private_stop_name,private_stop_address,
    rating,return_choice,note
  ) values (
    app_public.request_user_id(),v_trip,v_store,v_stop,
    case when v_kind='private' then v_stop else null end,
    case when v_kind='private' then v_name else null end,
    case when v_kind='private' then v_address else null end,
    rating,return_choice,nullif(btrim(note),'')
  )
  on conflict(author_user_id,trip_id,stop_id) where stop_id is not null
  do update set rating=excluded.rating,return_choice=excluded.return_choice,note=excluded.note,
    version=trip_private.trip_visit_memories.version+1,updated_at=statement_timestamp();
  return trip_private.trip_command_json(v_trip);
end;
$$;
alter function app_public.save_trip_visit_memory(text,text,integer,text,text) owner to identity_service;
revoke all on function app_public.save_trip_visit_memory(text,text,integer,text,text) from public, anon;
grant execute on function app_public.save_trip_visit_memory(text,text,integer,text,text) to authenticated;

create or replace function app_public.accept_trip_invitation(fragment_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_invite trip_private.trip_invitations%rowtype; v_hmac bytea; v_state text;
begin
  if not app_private.current_session_is_active()
     or fragment_token is null or char_length(fragment_token) not between 32 and 4096 then
    raise exception 'not_allowed';
  end if;
  select i.* into v_invite from trip_private.trip_invitations as i
   where i.token_hash=extensions.digest(convert_to(fragment_token,'utf8'),'sha256')
     and i.state='pending' and i.expires_at>statement_timestamp()
   limit 1 for update;
  if v_invite.invitation_id is null then raise exception 'not_allowed'; end if;
  v_hmac:=trip_private.current_verified_email_hmac(
    v_invite.purpose,v_invite.environment,v_invite.email_hmac_key_version);
  if v_hmac is null or v_hmac<>v_invite.recipient_email_hmac then raise exception 'not_allowed'; end if;

  select t.state into v_state from trip_private.trips as t
   where t.trip_id=v_invite.trip_id for update;
  if not found then raise exception 'not_allowed'; end if;
  if exists(select 1 from trip_private.trip_stops as s
    where s.trip_id=v_invite.trip_id and s.kind='private') then
    raise exception 'trip_partner_join_private_stop';
  end if;
  if exists(select 1 from trip_private.trip_participants as p
    where p.trip_id=v_invite.trip_id and p.participant_role='partner' and p.state='active') then
    raise exception 'not_allowed';
  end if;
  update trip_private.trip_invitations as i set state='accepted',
    accepted_user_id=app_public.request_user_id(),accepted_at=statement_timestamp(),version=i.version+1
   where i.invitation_id=v_invite.invitation_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role)
    values(v_invite.trip_id,app_public.request_user_id(),'partner')
  on conflict(trip_id,user_id) do update set state='active',left_at=null,
    version=trip_private.trip_participants.version+1;
  return trip_private.collaboration_json(v_invite.trip_id);
end;
$$;
alter function app_public.accept_trip_invitation(text) owner to identity_service;

create or replace function trip_private.trip_command_json(target_trip_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id',t.trip_id::text,'name',t.name,'localDate',t.local_date::text,'state',t.state,
    'version',t.version,
    'durationMinutes',case when t.started_at is null or t.completed_at is null then null
      else greatest(0,floor(extract(epoch from (t.completed_at-t.started_at))/60)::int) end,
    'startKind',t.start_kind,'startLabel',t.private_start_label,
    'origin',case when t.private_start_latitude is null then null else pg_catalog.jsonb_build_object('latitude',t.private_start_latitude::float8,'longitude',t.private_start_longitude::float8) end,
    'returnCoordinate',case when t.private_return_latitude is null then null else pg_catalog.jsonb_build_object('latitude',t.private_return_latitude::float8,'longitude',t.private_return_longitude::float8) end,
    'departureMinute',case when t.departure_local_time is null then null else extract(hour from t.departure_local_time)::int*60+extract(minute from t.departure_local_time)::int end,
    'transitionMinutes',10,'maxDriveMiles',t.max_drive_miles::float8,'maxTotalMinutes',t.max_total_minutes,
    'hoursReview',case when t.hours_reviewed_at is null then null else pg_catalog.jsonb_build_object(
      'reviewedAt',t.hours_reviewed_at,'hasUnresolvedWarnings',t.hours_review_has_unresolved,
      'acknowledged',t.hours_warnings_acknowledged_at is not null) end,
    'stops',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',s.stop_id::text,'storeId',case when s.kind='store' then s.store_id::text else null end,
      'kind',s.kind,'label',case when s.kind='store' then st.name when s.kind='rest' then s.rest_label else s.private_name end,
      'address',case when s.kind='store' then pg_catalog.concat_ws(', ',st.address,st.town,st.state_code)
        when s.kind='rest' then s.rest_address
        when t.state='completed' then null else s.private_address end,
      'sourceUrl',case when s.kind='private' then s.private_source_url else null end,
      'shopperHours',case when s.kind='private' then s.private_hours else null end,
      'destination',case when s.kind='private' then s.destination_status else null end,
      'position',s.position,'priority',s.priority,'plannedDwellMinutes',s.planned_dwell_minutes,
      'state',s.state,'memoryStatus',case
        when s.kind='rest' then 'not_applicable'
        when exists(select 1 from trip_private.trip_visit_memories as m
          where m.author_user_id=app_public.request_user_id() and m.trip_id=s.trip_id and m.stop_id=s.stop_id) then 'saved'
        when s.kind='store' and exists(select 1 from trip_private.trip_visit_memories as m
          where m.author_user_id=app_public.request_user_id() and m.trip_id=s.trip_id
            and m.stop_id is null and m.store_id=s.store_id) then 'saved'
        when s.kind in ('store','private') then 'missing' else 'not_applicable' end,
      'coordinate',case when s.kind='store' and st.latitude is not null then pg_catalog.jsonb_build_object('latitude',st.latitude::float8,'longitude',st.longitude::float8)
        when s.kind='rest' and s.rest_latitude is not null then pg_catalog.jsonb_build_object('latitude',s.rest_latitude::float8,'longitude',s.rest_longitude::float8) else null end,
      'hours',case when s.kind='store' then trip_private.trip_hours_for_stop(s.store_id,t.local_date) else null end
    ) order by s.position) from trip_private.trip_stops as s
      left join app_public.stores as st on st.id=s.store_id
      where s.trip_id=t.trip_id and (s.kind<>'private' or trip_private.private_stop_capability_enabled())),'[]'::jsonb)
  ) from trip_private.trips as t where t.trip_id=target_trip_id;
$$;
alter function trip_private.trip_command_json(uuid) owner to identity_service;
revoke create on schema trip_private from identity_service;

create or replace function app_public.add_private_trip_stop(
  trip_id text,name text,address text,source_url text,hours jsonb,priority text,
  planned_dwell_minutes integer,expected_version bigint,idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_stop uuid;
  v_version bigint;
  v_state text;
  v_replay uuid;
  v_position integer;
  v_name text;
  v_address text;
  v_url text;
  v_payload jsonb;
  v_new_version bigint;
begin
  if not trip_private.private_stop_capability_enabled() then raise exception using errcode='55000',message='private_trip_stops_disabled'; end if;
  begin v_trip := trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  v_name := regexp_replace(btrim(name),'[[:space:]]+',' ','g');
  v_address := nullif(btrim(address),'');
  v_url := nullif(btrim(source_url),'');
  if v_name is null or char_length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]'
     or (v_address is not null and (char_length(v_address) not between 1 and 320 or v_address ~ '[[:cntrl:]]'))
     or not trip_private.private_source_url_valid(v_url)
     or not trip_private.private_hours_valid(hours)
     or priority is null or priority not in ('must','prefer','flexible')
     or planned_dwell_minutes is null or planned_dwell_minutes not between 5 and 720
     or expected_version is null or expected_version < 1
     or idempotency_key is null or char_length(idempotency_key)>128
     or idempotency_key !~ '^add_private_trip_stop:[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'validation_failed';
  end if;
  v_payload := pg_catalog.jsonb_build_object('name',v_name,'address',v_address,'source_url',v_url,
    'hours',hours,'priority',priority,'planned_dwell_minutes',planned_dwell_minutes);
  select locked.trip_version,locked.trip_state into v_version,v_state
    from trip_private.lock_private_stop_trip(v_trip) as locked;
  v_replay := trip_private.private_stop_receipt_replay(
    v_trip,v_version,v_state,'add_private_trip_stop',idempotency_key,expected_version,v_payload);
  if v_replay is not null then return trip_private.trip_command_json(v_trip); end if;
  if v_state not in ('draft','ready') then raise exception 'authorization_lost'; end if;
  if v_version <> expected_version then raise exception 'conflict'; end if;
  if exists(select 1 from trip_private.trip_participants as p
    where p.trip_id=v_trip and p.participant_role='partner' and p.state='active') then
    raise exception 'trip_private_stop_partner_conflict';
  end if;
  select coalesce(pg_catalog.max(s.position),-1)+1 into v_position
    from trip_private.trip_stops as s where s.trip_id=v_trip;
  if v_position > 7 then raise exception 'trip_stop_limit_exceeded'; end if;
  insert into trip_private.trip_stops(
    trip_id,kind,private_name,private_address,private_source_url,private_hours,
    destination_status,position,priority,planned_dwell_minutes
  ) values (
    v_trip,'private',v_name,v_address,v_url,hours,'draft',v_position,priority,planned_dwell_minutes
  ) returning stop_id into v_stop;
  update trip_private.trips as t set version=t.version+1,updated_at=statement_timestamp()
   where t.trip_id=v_trip returning t.version into v_new_version;
  insert into trip_private.trip_mutation_receipts(
    trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata
  ) values (
    v_trip,idempotency_key,expected_version,'applied',v_new_version,
    pg_catalog.jsonb_build_object('command','add_private_trip_stop','stop_id',v_stop::text,'resulting_version',v_new_version)
  );
  return trip_private.trip_command_json(v_trip);
end;
$$;
alter function app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text) owner to identity_service;

create or replace function app_public.update_private_trip_stop(
  trip_id text,stop_id text,name text,address text,source_url text,hours jsonb,priority text,
  planned_dwell_minutes integer,expected_version bigint,idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_stop uuid;
  v_version bigint;
  v_state text;
  v_replay uuid;
  v_name text;
  v_address text;
  v_url text;
  v_payload jsonb;
  v_new_version bigint;
begin
  if not trip_private.private_stop_capability_enabled() then raise exception using errcode='55000',message='private_trip_stops_disabled'; end if;
  begin v_trip := trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  begin v_stop := stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  v_name := regexp_replace(btrim(name),'[[:space:]]+',' ','g');
  v_address := nullif(btrim(address),'');
  v_url := nullif(btrim(source_url),'');
  if v_name is null or char_length(v_name) not between 1 and 160 or v_name ~ '[[:cntrl:]]'
     or (v_address is not null and (char_length(v_address) not between 1 and 320 or v_address ~ '[[:cntrl:]]'))
     or not trip_private.private_source_url_valid(v_url)
     or not trip_private.private_hours_valid(hours)
     or priority is null or priority not in ('must','prefer','flexible')
     or planned_dwell_minutes is null or planned_dwell_minutes not between 5 and 720
     or expected_version is null or expected_version < 1
     or idempotency_key is null or char_length(idempotency_key)>128
     or idempotency_key !~ '^update_private_trip_stop:[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'validation_failed';
  end if;
  v_payload := pg_catalog.jsonb_build_object('name',v_name,'address',v_address,'source_url',v_url,
    'hours',hours,'priority',priority,'planned_dwell_minutes',planned_dwell_minutes);
  select locked.trip_version,locked.trip_state into v_version,v_state
    from trip_private.lock_private_stop_trip(v_trip) as locked;
  v_replay := trip_private.private_stop_receipt_replay(
    v_trip,v_version,v_state,'update_private_trip_stop',idempotency_key,expected_version,v_payload,v_stop);
  if v_replay is not null then return trip_private.trip_command_json(v_trip); end if;
  if v_state not in ('draft','ready') then raise exception 'authorization_lost'; end if;
  if v_version <> expected_version then raise exception 'conflict'; end if;
  if exists(select 1 from trip_private.trip_participants as p
    where p.trip_id=v_trip and p.participant_role='partner' and p.state='active') then
    raise exception 'trip_private_stop_partner_conflict';
  end if;
  perform 1 from trip_private.trip_stops as s
    where s.trip_id=v_trip and s.stop_id=v_stop and s.kind='private' for update;
  if not found then raise exception 'validation_failed'; end if;
  update trip_private.trip_stops as s set private_name=v_name,private_address=v_address,
    destination_status=case when s.private_address is distinct from v_address then 'draft' else s.destination_status end,
    private_source_url=v_url,private_hours=hours,priority=update_private_trip_stop.priority,
    planned_dwell_minutes=update_private_trip_stop.planned_dwell_minutes,version=s.version+1
   where s.trip_id=v_trip and s.stop_id=v_stop and s.kind='private';
  update trip_private.trips as t set version=t.version+1,updated_at=statement_timestamp()
   where t.trip_id=v_trip returning t.version into v_new_version;
  insert into trip_private.trip_mutation_receipts(
    trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata
  ) values (
    v_trip,idempotency_key,expected_version,'applied',v_new_version,
    pg_catalog.jsonb_build_object('command','update_private_trip_stop','stop_id',v_stop::text,'resulting_version',v_new_version)
  );
  return trip_private.trip_command_json(v_trip);
end;
$$;
alter function app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text) owner to identity_service;

create or replace function app_public.confirm_trip_stop_destination(
  trip_id text,stop_id text,exact_address text,expected_version bigint,idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_stop uuid;
  v_version bigint;
  v_state text;
  v_replay uuid;
  v_address text;
  v_new_version bigint;
begin
  if not trip_private.private_stop_capability_enabled() then raise exception using errcode='55000',message='private_trip_stops_disabled'; end if;
  begin v_trip := trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  begin v_stop := stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  v_address := btrim(exact_address);
  if v_address is null or char_length(v_address) not between 1 and 320 or v_address ~ '[[:cntrl:]]'
     or expected_version is null or expected_version < 1
     or idempotency_key is null or char_length(idempotency_key)>128
     or idempotency_key !~ '^confirm_trip_stop_destination:[A-Za-z0-9][A-Za-z0-9._:-]*$' then
    raise exception 'validation_failed';
  end if;
  select locked.trip_version,locked.trip_state into v_version,v_state
    from trip_private.lock_private_stop_trip(v_trip) as locked;
  v_replay := trip_private.private_stop_receipt_replay(
    v_trip,v_version,v_state,'confirm_trip_stop_destination',idempotency_key,
    expected_version,
    pg_catalog.jsonb_build_object('exact_address',v_address),v_stop);
  if v_replay is not null then return trip_private.trip_command_json(v_trip); end if;
  if v_state not in ('draft','ready') then raise exception 'authorization_lost'; end if;
  if v_version <> expected_version then raise exception 'conflict'; end if;
  if exists(select 1 from trip_private.trip_participants as p
    where p.trip_id=v_trip and p.participant_role='partner' and p.state='active') then
    raise exception 'trip_private_stop_partner_conflict';
  end if;
  perform 1 from trip_private.trip_stops as s
    where s.trip_id=v_trip and s.stop_id=v_stop and s.kind='private'
      and s.private_address=v_address for update;
  if not found then raise exception 'validation_failed'; end if;
  update trip_private.trip_stops as s set destination_status='confirmed_by_organizer',
    version=s.version+1 where s.trip_id=v_trip and s.stop_id=v_stop and s.kind='private';
  update trip_private.trips as t set version=t.version+1,updated_at=statement_timestamp()
   where t.trip_id=v_trip returning t.version into v_new_version;
  insert into trip_private.trip_mutation_receipts(
    trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata
  ) values (
    v_trip,idempotency_key,expected_version,'applied',v_new_version,
    pg_catalog.jsonb_build_object('command','confirm_trip_stop_destination','stop_id',v_stop::text,'resulting_version',v_new_version)
  );
  return trip_private.trip_command_json(v_trip);
end;
$$;
alter function app_public.confirm_trip_stop_destination(text,text,text,bigint,text) owner to identity_service;

set role identity_service;
revoke all on function app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text) from public, anon;
revoke all on function app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text) from public, anon;
revoke all on function app_public.confirm_trip_stop_destination(text,text,text,bigint,text) from public, anon;
grant execute on function app_public.add_private_trip_stop(text,text,text,text,jsonb,text,integer,bigint,text),
  app_public.update_private_trip_stop(text,text,text,text,text,jsonb,text,integer,bigint,text),
  app_public.confirm_trip_stop_destination(text,text,text,bigint,text) to authenticated;
reset role;

revoke create on schema app_public from identity_service;
do $cleanup$
begin
  if not exists (select 1 from pg_temp.issue568_prior_identity_service_membership) then
    execute 'revoke identity_service from postgres';
  end if;
end;
$cleanup$;
