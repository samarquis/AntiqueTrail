-- The request row supplies request/trip/actor/base-version scope. Its unique linked
-- evidence row supplies the applied order, command hash, and resulting version.
-- Return the current authorized Trip DTO on each call; never persist that private DTO.
alter table trip_private.check_my_day_command_evidence
  add column request_id uuid references trip_private.check_my_day_requests(request_id) on delete cascade;
create unique index check_my_day_command_evidence_request_uidx
  on trip_private.check_my_day_command_evidence(request_id) where request_id is not null;

create or replace function app_public.request_check_my_day(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_trip uuid;
  v_version bigint;
  v_departure time;
  v_facts jsonb;
  v_contract uuid;
  v_request uuid;
  v_reason text;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  select t.version,t.departure_local_time into v_version,v_departure
    from trip_private.trips t where t.trip_id=v_trip for share;
  select jsonb_build_object(
    'stops',coalesce(jsonb_agg(jsonb_build_object('id',s.stop_id::text) order by s.position),'[]'::jsonb)
  ) into v_facts from trip_private.trip_stops s where s.trip_id=v_trip;
  select c.contract_receipt_id into v_contract
    from trip_private.routing_contract_receipts c where c.state='accepted' order by c.accepted_at desc limit 1;
  if v_departure is null then v_reason:='departure_required';
  elsif exists(
    select 1 from trip_private.trip_stops s
    left join app_public.stores st on st.id=s.store_id
    where s.trip_id=v_trip and ((s.kind='store' and st.latitude is null) or (s.kind='rest' and s.rest_latitude is null))
  ) then v_reason:='coordinates_required';
  elsif v_contract is null or not routing_private.capability_open() then v_reason:='r01_blocked'; end if;
  insert into trip_private.check_my_day_requests(
    trip_id,actor_user_id,trip_version,facts,facts_hash,state,block_reason,contract_receipt_id
  ) values (
    v_trip,app_public.request_user_id(),v_version,v_facts,
    extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),
    case when v_reason is null then 'ready' else 'blocked' end,v_reason,
    case when v_reason is null then v_contract else null end
  ) returning request_id into v_request;
  return jsonb_build_object(
    'requestId',v_request::text,
    'state',case when v_reason is null then 'ready' else 'blocked' end,
    'reason',v_reason,
    'tripVersion',v_version
  );
end $$;
alter function app_public.request_check_my_day(text) owner to identity_service;

create or replace function app_public.get_check_my_day_suggestion(request_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_request uuid;
  v_row trip_private.check_my_day_requests%rowtype;
  v_suggestion trip_private.check_my_day_suggestions%rowtype;
begin
  begin v_request:=request_id::uuid; exception when others then raise exception 'check_my_day_request_invalid'; end;
  select * into v_row from trip_private.check_my_day_requests r
    where r.request_id=v_request and r.actor_user_id=app_public.request_user_id();
  if v_row.request_id is null or not trip_private.trip_member_can_access(v_row.trip_id) then
    raise exception 'authorization_lost';
  end if;
  if v_row.state='blocked' then
    return jsonb_build_object(
      'requestId',v_request::text,'state','blocked','reason',v_row.block_reason,'tripVersion',v_row.trip_version
    );
  end if;
  select * into v_suggestion from trip_private.check_my_day_suggestions s where s.request_id=v_request;
  if v_suggestion.suggestion_id is null then
    return jsonb_build_object('requestId',v_request::text,'state',v_row.state,'tripVersion',v_row.trip_version);
  end if;
  if v_row.trip_version<>(select t.version from trip_private.trips t where t.trip_id=v_row.trip_id) then
    return jsonb_build_object(
      'requestId',v_request::text,'state','failed','reason','trip_changed','tripVersion',v_row.trip_version
    );
  end if;
  return jsonb_build_object(
    'requestId',v_request::text,
    'state','suggested',
    'orderedStopIds',v_suggestion.ordered_stop_ids::text[],
    'explanation',v_suggestion.explanation,
    'tripVersion',v_row.trip_version
  );
end $$;
alter function app_public.get_check_my_day_suggestion(text) owner to identity_service;

revoke all on function app_public.save_check_my_day_choice(text,text,text[]) from public,anon,authenticated;
drop function app_public.save_check_my_day_choice(text,text,text[]);

create function app_public.use_check_my_day_suggestion(trip_id text, request_id text, expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_trip_id uuid;
  v_request_id uuid;
  v_request trip_private.check_my_day_requests%rowtype;
  v_suggestion trip_private.check_my_day_suggestions%rowtype;
  v_receipt trip_private.check_my_day_command_evidence%rowtype;
  v_current_version bigint;
  v_request_stop_ids uuid[];
  v_current_stop_ids uuid[];
  v_next_version bigint;
  v_updated integer;
  v_result jsonb;
begin
  begin v_trip_id:=trip_id::uuid; v_request_id:=request_id::uuid;
  exception when others then raise exception 'check_my_day_suggestion_invalid'; end;
  if expected_version is null or expected_version<1 then raise exception 'check_my_day_suggestion_invalid'; end if;

  if not trip_private.trip_owner_can_access(v_trip_id) then
    raise exception using errcode='42501',message='check_my_day_suggestion_unavailable';
  end if;
  -- Lock trip before request to match trip deletion and trip-command lock order.
  select t.version into v_current_version from trip_private.trips t
    where t.trip_id=v_trip_id for update;
  if v_current_version is null or not trip_private.trip_owner_can_access(v_trip_id) then
    raise exception using errcode='42501',message='check_my_day_suggestion_unavailable';
  end if;

  select * into v_request from trip_private.check_my_day_requests r
    where r.request_id=v_request_id
      and r.actor_user_id=app_public.request_user_id()
      and r.trip_id=v_trip_id
    for update;
  if v_request.request_id is null then
    raise exception using errcode='42501',message='check_my_day_suggestion_unavailable';
  end if;

  select * into v_receipt from trip_private.check_my_day_command_evidence e
    where e.request_id=v_request_id;
  if v_receipt.request_id is not null then
    select * into v_suggestion from trip_private.check_my_day_suggestions s
      where s.request_id=v_request_id;
    if v_request.state<>'suggested'
      or v_request.trip_version is distinct from expected_version
      or v_receipt.trip_id is distinct from v_trip_id
      or v_receipt.actor_user_id is distinct from app_public.request_user_id()
      or v_receipt.choice is distinct from 'suggested'
      or v_receipt.trip_version is distinct from expected_version+1
      or v_suggestion.suggestion_id is null
      or v_receipt.ordered_stop_ids is distinct from v_suggestion.ordered_stop_ids
      or v_receipt.command_hash is distinct from extensions.digest(
        concat_ws('|',v_trip_id::text,app_public.request_user_id()::text,'suggested',
          array_to_string(v_receipt.ordered_stop_ids,','),expected_version::text,v_request_id::text),
        'sha256'
      ) then
      raise exception using errcode='42501',message='check_my_day_suggestion_unavailable';
    end if;
    return trip_private.trip_command_json(v_trip_id);
  end if;

  if v_request.state<>'suggested' or v_request.trip_version is distinct from expected_version
    or v_current_version is distinct from expected_version then
    raise exception 'check_my_day_suggestion_stale';
  end if;

  select * into v_suggestion from trip_private.check_my_day_suggestions s where s.request_id=v_request_id;
  if v_suggestion.suggestion_id is null then raise exception 'check_my_day_suggestion_unavailable'; end if;
  select array_agg((stop->>'id')::uuid order by (stop->>'id')::uuid)
    into v_request_stop_ids from jsonb_array_elements(v_request.facts->'stops') stop;
  select array_agg(s.stop_id order by s.stop_id)
    into v_current_stop_ids from trip_private.trip_stops s where s.trip_id=v_request.trip_id;
  if v_request_stop_ids is distinct from v_current_stop_ids
    or v_request_stop_ids is distinct from (
      select array_agg(stop_id order by stop_id) from unnest(v_suggestion.ordered_stop_ids) stop_id
    ) then
    raise exception 'check_my_day_stop_set_mismatch';
  end if;

  update trip_private.trip_stops s set position=o.next_position
    from (
      select stop_id,ordinality-1 as next_position
      from unnest(v_suggestion.ordered_stop_ids) with ordinality as x(stop_id,ordinality)
    ) o
    where s.trip_id=v_request.trip_id and s.stop_id=o.stop_id;
  get diagnostics v_updated = row_count;
  if v_updated is distinct from cardinality(v_suggestion.ordered_stop_ids) then
    raise exception 'check_my_day_stop_set_mismatch';
  end if;
  update trip_private.trips t set version=t.version+1,updated_at=statement_timestamp()
    where t.trip_id=v_request.trip_id returning t.version into v_next_version;
  insert into trip_private.check_my_day_command_evidence(
    trip_id,actor_user_id,choice,ordered_stop_ids,trip_version,command_hash,request_id
  ) values (
    v_request.trip_id,app_public.request_user_id(),'suggested',v_suggestion.ordered_stop_ids,v_next_version,
    extensions.digest(
      concat_ws('|',v_request.trip_id::text,app_public.request_user_id()::text,'suggested',
        array_to_string(v_suggestion.ordered_stop_ids,','),expected_version::text,v_request_id::text),
      'sha256'
    ),
    v_request_id
  );
  v_result:=trip_private.trip_command_json(v_request.trip_id);
  return v_result;
end $$;
alter function app_public.use_check_my_day_suggestion(text,text,bigint) owner to identity_service;
revoke all on function app_public.use_check_my_day_suggestion(text,text,bigint) from public,anon,authenticated;
grant execute on function app_public.use_check_my_day_suggestion(text,text,bigint) to authenticated;
