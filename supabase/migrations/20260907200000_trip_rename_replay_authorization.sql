-- Issue #254: authorize rename replays before reading private receipts.
grant create on schema app_public to identity_service;
do $wrap$
begin
  perform set_config('role', 'identity_service', true);
  execute $fn$
create or replace function app_public.rename_trip(trip_id text,new_name text,expected_version bigint,idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_name text;v_prior jsonb;v_version bigint;v_result jsonb;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  v_name:=regexp_replace(btrim(new_name),'[[:space:]]+',' ','g');
  if idempotency_key is null or char_length(idempotency_key)>128 or v_name is null or char_length(v_name) not between 1 and 80 or v_name~'[[:cntrl:]]' then raise exception 'validation_failed'; end if;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'not_allowed'; end if;
  select r.result_metadata into v_prior from trip_private.trip_mutation_receipts r where r.trip_id=v_trip and r.idempotency_key=rename_trip.idempotency_key;
  if found then return v_prior; end if;
  select t.version into v_version from trip_private.trips t where t.trip_id=v_trip and t.state in ('draft','ready') for update;
  if v_version is null then raise exception 'not_allowed'; end if;
  if expected_version is null or v_version<>expected_version then
    select jsonb_build_object('state','conflict','latest',jsonb_build_object('name',t.name,'version',t.version)) into v_result from trip_private.trips t where t.trip_id=v_trip;
    insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata)
      values(v_trip,rename_trip.idempotency_key,greatest(coalesce(expected_version,1),1),'conflict',v_version,v_result);
    return v_result;
  end if;
  update trip_private.trips set name=v_name,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  v_result:=trip_private.trip_command_json(v_trip);
  insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata)
    values(v_trip,rename_trip.idempotency_key,expected_version,'applied',v_version+1,v_result);
  return v_result;
end; $$;
  $fn$;
  perform set_config('role', 'none', true);
end;
$wrap$;
revoke create on schema app_public from identity_service;
