-- Production auth/session composition plus bounded Package 5A trip commands.
-- Browser callers never supply an actor; auth.uid() and the registered JWT session are authoritative.

grant identity_service to postgres;
grant usage on schema app_private, trip_private, app_public to identity_service;
grant create on schema app_public to identity_service;
grant create on schema trip_private to identity_service;
grant update on app_private.profiles, app_private.active_sessions to identity_service;
grant update on trip_private.trips, trip_private.trip_stops to identity_service;
grant select on app_public.catalog_areas, app_public.stores to identity_service;

create or replace function app_private.provider_session_created_at(
  p_session_id uuid,p_user_id uuid
)
returns timestamptz language sql stable security definer set search_path='' as $$
  select s.created_at from auth.sessions s
  where s.id=p_session_id and s.user_id=p_user_id;
$$;
revoke all on function app_private.provider_session_created_at(uuid,uuid)
  from public,anon,authenticated;
grant execute on function app_private.provider_session_created_at(uuid,uuid) to identity_service;

create or replace function app_public.register_current_session(access_token_expires_at bigint)
returns boolean language plpgsql security definer
set search_path = pg_catalog, app_private, auth as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := app_private.claim_session_id();
  v_epoch bigint;
  v_expires_at timestamptz;
  v_provider_created_at timestamptz;
  v_revoked_before timestamptz;
begin
  if v_user_id is null or v_session_id is null then raise exception 'authentication_required'; end if;
  if access_token_expires_at <= (extract(epoch from statement_timestamp()) * 1000)::bigint
     or access_token_expires_at > (extract(epoch from statement_timestamp() + interval '24 hours') * 1000)::bigint then
    raise exception 'session_expiry_invalid';
  end if;
  v_expires_at := to_timestamp(access_token_expires_at::numeric / 1000);
  v_provider_created_at:=app_private.provider_session_created_at(v_session_id,v_user_id);
  if v_provider_created_at is null then raise exception 'provider_session_unavailable'; end if;
  select session_epoch,sessions_revoked_before into v_epoch,v_revoked_before
    from app_private.profiles where user_id=v_user_id and status='active' for update;
  if v_epoch is null then raise exception 'account_unavailable'; end if;
  if not exists(select 1 from app_private.role_grants g
    where g.subject_user_id=v_user_id and g.role='shopper' and g.state='active') then
    raise exception 'admission_required';
  end if;
  if v_revoked_before is not null and v_provider_created_at<=v_revoked_before then
    raise exception 'provider_session_revoked';
  end if;
  insert into app_private.active_sessions(
    session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
  ) values (
    v_session_id,v_user_id,v_provider_created_at,v_epoch,'active',statement_timestamp(),v_expires_at
  ) on conflict (session_id) do update set
    last_authenticated_at=statement_timestamp(), access_token_expires_at=excluded.access_token_expires_at,
    version=app_private.active_sessions.version+1
  where app_private.active_sessions.user_id=excluded.user_id
    and app_private.active_sessions.session_epoch=excluded.session_epoch
    and app_private.active_sessions.provider_created_at=excluded.provider_created_at
    and app_private.active_sessions.state='active';
  return app_private.current_session_is_active();
end; $$;
alter function app_public.register_current_session(bigint) owner to identity_service;

grant create on schema app_private to identity_service;
alter function app_private.current_session_is_active() owner to postgres;
create or replace function app_private.current_session_is_active()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and nullif(current_setting('request.jwt.claims',true),'') is not null
    and exists(
      select 1 from app_private.profiles p
      join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
      where p.user_id=auth.uid() and p.status='active' and s.state='active'
        and s.session_id=app_private.claim_session_id()
        and s.provider_created_at is not null
        and (s.access_token_expires_at is null or s.access_token_expires_at>statement_timestamp())
        and (p.sessions_revoked_before is null or s.provider_created_at>p.sessions_revoked_before)
    );
$$;
alter function app_private.current_session_is_active() owner to identity_service;
revoke create on schema app_private from identity_service;

create or replace function app_public.current_session_is_active()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private as $$
  select app_private.current_session_is_active();
$$;
alter function app_public.current_session_is_active() owner to identity_service;

create or replace function app_public.revoke_current_session(reason text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, app_private, auth as $$
begin
  if auth.uid() is null or app_private.claim_session_id() is null then return false; end if;
  if reason is null or reason !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'reason_invalid'; end if;
  update app_private.active_sessions set state='revoked', revoked_at=statement_timestamp(),
    revocation_reason=reason, version=version+1
  where session_id=app_private.claim_session_id() and user_id=auth.uid() and state='active';
  return found;
end; $$;
alter function app_public.revoke_current_session(text) owner to identity_service;

create table trip_private.check_my_day_command_evidence (
  evidence_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  choice text not null check (choice in ('suggested','manual')),
  ordered_stop_ids uuid[] not null,
  trip_version bigint not null check (trip_version > 0),
  command_hash bytea not null check (octet_length(command_hash)=32),
  created_at timestamptz not null default statement_timestamp()
);
alter table trip_private.check_my_day_command_evidence enable row level security;
alter table trip_private.check_my_day_command_evidence force row level security;
revoke all on trip_private.check_my_day_command_evidence from public, anon, authenticated;
grant select, insert on trip_private.check_my_day_command_evidence to identity_service;
create policy identity_service_check_my_day_evidence on trip_private.check_my_day_command_evidence
  for all to identity_service using (true) with check (true);

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
      'id',s.stop_id::text,'kind',s.kind,
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

create or replace function app_public.list_trips()
returns jsonb language sql stable security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
  select case when not app_private.current_session_is_active() then '[]'::jsonb else
    coalesce(jsonb_agg(trip_private.trip_command_json(t.trip_id) order by t.local_date,t.created_at),'[]'::jsonb) end
  from trip_private.trips t where t.owner_id=auth.uid() or exists(
    select 1 from trip_private.trip_participants p where p.trip_id=t.trip_id and p.user_id=auth.uid() and p.state='active');
$$;
alter function app_public.list_trips() owner to identity_service;

create or replace function app_public.get_trip(trip_id text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
declare v_trip_id uuid;
begin
  if not app_private.current_session_is_active() then raise exception 'authorization_lost'; end if;
  begin v_trip_id := trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip_id) then raise exception 'authorization_lost'; end if;
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.get_trip(text) owner to identity_service;

create or replace function app_public.create_trip(name text, local_date text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_public, app_private, auth as $$
declare v_trip_id uuid; v_area_id uuid; v_date date;
begin
  if not app_private.current_session_is_active() then raise exception 'authorization_lost'; end if;
  if name is null or name<>btrim(name) or char_length(name) not between 1 and 80 or name ~ '[[:cntrl:]]' then raise exception 'trip_name_invalid'; end if;
  begin v_date:=local_date::date; exception when others then raise exception 'trip_date_invalid'; end;
  select id into v_area_id from app_public.catalog_areas order by sort_order,slug limit 1;
  if v_area_id is null then raise exception 'trip_area_unavailable'; end if;
  insert into trip_private.trips(owner_id,area_id,name,local_date) values(auth.uid(),v_area_id,name,v_date) returning trip_id into v_trip_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role) values(v_trip_id,auth.uid(),'creator');
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.create_trip(text,text) owner to identity_service;

create or replace function app_public.add_trip_stop(trip_id text, kind text, label text, priority text, planned_dwell_minutes integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_public, app_private, auth as $$
declare v_trip_id uuid; v_store_id uuid; v_position integer;
begin
  begin v_trip_id:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip_id) then raise exception 'authorization_lost'; end if;
  if kind<>'store' or priority not in ('must','prefer','flexible') or planned_dwell_minutes not between 5 and 720 then raise exception 'trip_stop_invalid'; end if;
  select id into v_store_id from app_public.stores where lower(name)=lower(label) order by id limit 1;
  if v_store_id is null then raise exception 'store_stop_not_found'; end if;
  select coalesce(max(position),-1)+1 into v_position from trip_private.trip_stops where trip_private.trip_stops.trip_id=v_trip_id;
  if v_position>7 then raise exception 'trip_stop_limit_exceeded'; end if;
  insert into trip_private.trip_stops(trip_id,kind,store_id,position,priority,planned_dwell_minutes)
  values(v_trip_id,'store',v_store_id,v_position,priority,planned_dwell_minutes);
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip_id;
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.add_trip_stop(text,text,text,text,integer) owner to identity_service;

drop index if exists trip_private.trip_stop_position_unique;
alter table trip_private.trip_stops add constraint trip_stop_position_unique unique(trip_id,position) deferrable initially deferred;

create or replace function app_public.reorder_trip_stop(trip_id text, stop_id text, "position" integer)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_private as $$
declare v_trip_id uuid; v_stop_id uuid; v_count integer;
begin
  begin v_trip_id:=trip_id::uuid; v_stop_id:=stop_id::uuid; exception when others then raise exception 'trip_stop_id_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip_id) then raise exception 'authorization_lost'; end if;
  select count(*) into v_count from trip_private.trip_stops where trip_private.trip_stops.trip_id=v_trip_id;
  if "position"<0 or "position">=v_count or not exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip_id and s.stop_id=v_stop_id) then raise exception 'trip_position_invalid'; end if;
  with ordered as (
    select s.stop_id,row_number() over(order by case when s.stop_id=v_stop_id then "position" else case when s.position>="position" then s.position+1 else s.position end end,s.position)-1 as next_position
    from trip_private.trip_stops s where s.trip_id=v_trip_id
  ) update trip_private.trip_stops s set position=o.next_position from ordered o where s.stop_id=o.stop_id;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip_id;
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.reorder_trip_stop(text,text,integer) owner to identity_service;

create or replace function app_public.review_trip_hours(trip_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private as $$
declare v_trip_id uuid;
begin
  begin v_trip_id:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip_id) then raise exception 'authorization_lost'; end if;
  if not exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip_id) then raise exception 'trip_has_no_stops'; end if;
  update trip_private.trips set state='ready',version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip_id and state in ('draft','ready');
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.review_trip_hours(text) owner to identity_service;

create or replace function app_public.start_trip(trip_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, auth as $$
declare v_trip_id uuid;
begin
  begin v_trip_id:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip_id) then raise exception 'authorization_lost'; end if;
  update trip_private.trips set state='active',version=version+1,updated_at=statement_timestamp()
  where trip_private.trips.trip_id=v_trip_id and state='ready';
  if not found then raise exception 'trip_not_ready'; end if;
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.start_trip(text) owner to identity_service;

create or replace function trip_private.apply_go_stop_command(target_trip_id uuid,target_stop_id uuid,target_state text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
begin
  if not app_private.current_session_is_active() or not exists(select 1 from trip_private.trips t where t.trip_id=target_trip_id and t.state='active' and coalesce(t.navigator_user_id,t.owner_id)=auth.uid()) then raise exception 'authorization_lost'; end if;
  update trip_private.trip_stops set state=target_state,
    arrived_at=case when target_state='arrived' then statement_timestamp() else arrived_at end,
    completed_at=case when target_state='completed' then statement_timestamp() else completed_at end,
    version=version+1 where trip_id=target_trip_id and stop_id=target_stop_id;
  if not found then raise exception 'trip_stop_not_found'; end if;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_id=target_trip_id;
  return trip_private.trip_command_json(target_trip_id);
end; $$;
alter function trip_private.apply_go_stop_command(uuid,uuid,text) owner to identity_service;

create or replace function app_public.mark_arrived(trip_id text, stop_id text) returns jsonb language sql security definer set search_path=pg_catalog,trip_private as $$ select trip_private.apply_go_stop_command(trip_id::uuid,stop_id::uuid,'arrived') $$;
create or replace function app_public.complete_trip_stop(trip_id text, stop_id text) returns jsonb language sql security definer set search_path=pg_catalog,trip_private as $$ select trip_private.apply_go_stop_command(trip_id::uuid,stop_id::uuid,'completed') $$;
create or replace function app_public.skip_trip_stop(trip_id text, stop_id text) returns jsonb language sql security definer set search_path=pg_catalog,trip_private as $$ select trip_private.apply_go_stop_command(trip_id::uuid,stop_id::uuid,'skipped') $$;
alter function app_public.mark_arrived(text,text) owner to identity_service;
alter function app_public.complete_trip_stop(text,text) owner to identity_service;
alter function app_public.skip_trip_stop(text,text) owner to identity_service;

create or replace function app_public.replay_trip_mutation(trip_id text, envelope jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
declare v_trip_id uuid; v_stop_id uuid; v_key text; v_kind text; v_base bigint; v_sequence bigint; v_device_hash bytea; v_result jsonb;
begin
  begin v_trip_id:=trip_id::uuid; v_stop_id:=(envelope->>'stop_id')::uuid; exception when others then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end;
  v_key:=envelope->>'idempotency_key'; v_kind:=envelope->>'kind'; v_base:=(envelope->>'base_version')::bigint; v_sequence:=(envelope->>'local_sequence')::bigint;
  if jsonb_typeof(envelope)<>'object' or v_key is null or char_length(v_key)>128 or v_kind not in ('mark_arrived','complete_stop','skip_stop') or v_base<1 or v_sequence<1 then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end if;
  v_device_hash:=extensions.digest(envelope->>'device_id','sha256');
  if not app_private.current_session_is_active() or not exists(
    select 1 from trip_private.trips t join trip_private.trip_device_bindings b on b.trip_id=t.trip_id and b.user_id=auth.uid() and b.state='active'
    join trip_private.trip_offline_grants g on g.trip_id=t.trip_id and g.user_id=auth.uid() and g.device_hash=b.device_hash and g.state='active' and g.expires_at>statement_timestamp()
    join app_private.profiles p on p.user_id=auth.uid() and p.status='active'
    where t.trip_id=v_trip_id and t.state='active' and t.navigator_user_id=auth.uid() and b.device_hash=v_device_hash
      and b.session_security_version=p.session_epoch and g.session_security_version=p.session_epoch
  ) then return jsonb_build_object('state','unauthorized'); end if;
  select result_metadata into v_result from trip_private.trip_mutation_receipts where trip_private.trip_mutation_receipts.trip_id=v_trip_id and idempotency_key=v_key;
  if found then return v_result; end if;
  if not exists(select 1 from trip_private.trips t where t.trip_id=v_trip_id and t.version=v_base) then
    v_result:=jsonb_build_object('state','conflict','summary','The trip changed on another device.');
  else
    v_result:=jsonb_build_object('state','accepted','trip',trip_private.apply_go_stop_command(v_trip_id,v_stop_id,case v_kind when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed' else 'skipped' end));
  end if;
  insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,device_hash,local_sequence,result_state,resulting_version,result_metadata)
  values(v_trip_id,v_key,v_base,v_device_hash,v_sequence,case when v_result->>'state'='accepted' then 'replayed' else 'conflict' end,(select version from trip_private.trips where trip_private.trips.trip_id=v_trip_id),v_result);
  return v_result;
exception when others then return jsonb_build_object('state','conflict','summary','The saved action could not be verified.');
end; $$;
alter function app_public.replay_trip_mutation(text,jsonb) owner to identity_service;

create or replace function app_public.save_check_my_day_choice(trip_id text, choice text, stop_ids text[])
returns jsonb language plpgsql security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
declare v_trip_id uuid; v_ids uuid[]; v_version bigint;
begin
  begin v_trip_id:=trip_id::uuid; v_ids:=stop_ids::uuid[]; exception when others then raise exception 'check_my_day_command_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip_id) or choice not in ('suggested','manual') or cardinality(v_ids) not between 1 and 8 or cardinality(v_ids)<>cardinality(array(select distinct unnest(v_ids))) then raise exception 'check_my_day_command_invalid'; end if;
  if (select array_agg(s.stop_id order by s.stop_id) from trip_private.trip_stops s where s.trip_id=v_trip_id) is distinct from (select array_agg(x order by x) from unnest(v_ids) x) then raise exception 'check_my_day_stop_set_mismatch'; end if;
  select version into v_version from trip_private.trips where trip_private.trips.trip_id=v_trip_id for update;
  if choice='suggested' then
    update trip_private.trip_stops s set position=o.next_position from (select x.stop_id,x.ordinality-1 as next_position from unnest(v_ids) with ordinality x(stop_id,ordinality)) o where s.trip_id=v_trip_id and s.stop_id=o.stop_id;
    update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip_id returning version into v_version;
  end if;
  insert into trip_private.check_my_day_command_evidence(trip_id,actor_user_id,choice,ordered_stop_ids,trip_version,command_hash)
  values(v_trip_id,auth.uid(),choice,v_ids,v_version,extensions.digest(concat_ws('|',v_trip_id::text,auth.uid()::text,choice,array_to_string(v_ids,','),v_version::text),'sha256'));
  return trip_private.trip_command_json(v_trip_id);
end; $$;
alter function app_public.save_check_my_day_choice(text,text,text[]) owner to identity_service;

revoke all on function trip_private.trip_command_json(uuid), trip_private.apply_go_stop_command(uuid,uuid,text) from public, anon, authenticated;
revoke all on function app_public.register_current_session(bigint), app_public.current_session_is_active(), app_public.revoke_current_session(text) from public, anon;
grant execute on function app_public.register_current_session(bigint), app_public.current_session_is_active(), app_public.revoke_current_session(text) to authenticated;
grant execute on function app_public.list_trips(), app_public.get_trip(text), app_public.create_trip(text,text), app_public.add_trip_stop(text,text,text,text,integer), app_public.reorder_trip_stop(text,text,integer), app_public.review_trip_hours(text), app_public.start_trip(text), app_public.mark_arrived(text,text), app_public.complete_trip_stop(text,text), app_public.skip_trip_stop(text,text), app_public.replay_trip_mutation(text,jsonb), app_public.save_check_my_day_choice(text,text,text[]) to authenticated;
revoke create on schema app_public from identity_service;
revoke create on schema trip_private from identity_service;
revoke identity_service from postgres;
