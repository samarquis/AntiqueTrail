-- Keep the proof-bound Go gateway aligned with the authoritative stop matrix.
-- Both skipped and observed-closed stops can be restored by the current
-- Navigator on the currently bound device before trip completion.

grant identity_service to postgres;

create or replace function app_public.execute_verified_go_command(
  target_user_id text,target_session_id text,trip_id text,action text,stop_id text,
  base_version bigint,device_key_id text,proof_nonce text,proof_issued_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid;v_session uuid;v_trip uuid;v_stop uuid;v_nonce uuid;
  v_state text;v_allowed boolean;v_target text;v_trip_version bigint;
begin
  begin
    v_user:=target_user_id::uuid;v_session:=target_session_id::uuid;
    v_trip:=trip_id::uuid;v_nonce:=proof_nonce::uuid;
    if stop_id is not null then v_stop:=stop_id::uuid;end if;
  exception when others then raise exception 'device_proof_invalid'; end;
  if action not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop','complete_trip')
    or proof_issued_at not between statement_timestamp()-interval '5 minutes' and statement_timestamp()+interval '5 minutes'
    then raise exception 'device_proof_invalid'; end if;
  if not exists(select 1 from app_private.profiles p
    join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
    where p.user_id=v_user and p.status='active' and s.session_id=v_session and s.state='active'
      and s.provider_created_at is not null
      and (s.access_token_expires_at is null or s.access_token_expires_at>statement_timestamp())
      and (p.sessions_revoked_before is null or s.provider_created_at>p.sessions_revoked_before))
    then raise exception 'not_allowed'; end if;
  select t.version into v_trip_version from trip_private.trips t
    where t.trip_id=v_trip and t.state='active' and t.version=base_version
      and t.navigator_user_id=v_user
      and t.navigator_device_hash=extensions.digest(convert_to(device_key_id,'utf8'),'sha256')
    for update;
  if v_trip_version is null then raise exception 'not_allowed'; end if;
  begin
    insert into trip_private.trip_device_proof_nonces(
      device_key_id,nonce,trip_id,user_id,purpose,action,issued_at
    ) values(device_key_id,v_nonce,v_trip,v_user,'go',action,proof_issued_at);
  exception when unique_violation then raise exception 'device_proof_replayed'; end;
  if action='complete_trip' then
    if exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip
      and s.state not in ('completed','skipped','observed_closed')) then raise exception 'conflict'; end if;
    update trip_private.trips set state='completed',start_kind=null,private_start_label=null,
      private_start_latitude=null,private_start_longitude=null,private_return_label=null,
      private_return_latitude=null,private_return_longitude=null,
      location_purged_at=statement_timestamp(),navigator_user_id=null,navigator_device_hash=null,
      version=version+1,updated_at=statement_timestamp()
      where trip_private.trips.trip_id=v_trip;
    update trip_private.trip_stops set rest_address=null,rest_latitude=null,rest_longitude=null,
      location_purged_at=statement_timestamp()
      where trip_private.trip_stops.trip_id=v_trip and kind='rest';
    update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),
      revocation_reason='trip_completed'
      where trip_private.trip_device_bindings.trip_id=v_trip and state='active';
    update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp()
      where trip_private.trip_offline_grants.trip_id=v_trip and state='active';
    return trip_private.trip_command_json(v_trip);
  end if;
  select s.state into v_state from trip_private.trip_stops s
    where s.trip_id=v_trip and s.stop_id=v_stop for update;
  v_target:=case action when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed'
    when 'skip_stop' then 'skipped' when 'mark_observed_closed' then 'observed_closed'
    else 'planned' end;
  v_allowed:=(v_state='planned' and v_target in ('arrived','skipped','observed_closed'))
    or (v_state='arrived' and v_target in ('completed','skipped','observed_closed'))
    or (v_state in ('skipped','observed_closed') and v_target='planned');
  if not coalesce(v_allowed,false) then raise exception 'conflict'; end if;
  update trip_private.trip_stops s set state=v_target,
    arrived_at=case when v_target='arrived' then statement_timestamp() when v_target='planned' then null else s.arrived_at end,
    completed_at=case when v_target='completed' then statement_timestamp() when v_target='planned' then null else s.completed_at end,
    closed_observed_at=case when v_target='observed_closed' then statement_timestamp() when v_target='planned' then null else s.closed_observed_at end,
    version=s.version+1 where s.trip_id=v_trip and s.stop_id=v_stop;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp()
    where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;

alter function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)
  owner to identity_service;
revoke all on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)
  from public,anon,authenticated;
grant execute on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz)
  to trip_go_gateway;

revoke identity_service from postgres;
