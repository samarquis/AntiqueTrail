-- Cryptographic device proof for grant issuance and ordinary online Go commands.
do $$ begin if not exists(select 1 from pg_roles where rolname='trip_go_gateway') then create role trip_go_gateway nologin noinherit nosuperuser nobypassrls; end if; end $$;
grant identity_service,trip_grant_signer,trip_go_gateway to postgres;
grant trip_go_gateway to authenticator;
grant usage on schema app_public to trip_go_gateway;
grant create on schema trip_private,app_public to identity_service;

create table trip_private.trip_device_proof_nonces(
  device_key_id text not null,
  nonce uuid not null,
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check(purpose in ('grant','go')),
  action text not null,
  issued_at timestamptz not null,
  consumed_at timestamptz not null default statement_timestamp(),
  primary key(device_key_id,nonce),
  constraint device_proof_key_safe check(device_key_id~'^device-key-[A-Za-z0-9_-]{43}$'),
  constraint device_proof_fresh check(issued_at between consumed_at-interval '5 minutes' and consumed_at+interval '5 minutes')
);
alter table trip_private.trip_device_proof_nonces enable row level security;
alter table trip_private.trip_device_proof_nonces force row level security;
grant select,insert on trip_private.trip_device_proof_nonces to identity_service;
create policy identity_device_proof_nonces on trip_private.trip_device_proof_nonces for all to identity_service using(true) with check(true);

create or replace function app_public.record_verified_offline_grant_receipt(
  target_trip_id text,target_user_id text,install_id text,device_key_id text,session_security_version bigint,
  signed_grant jsonb,expires_at timestamptz,proof_nonce text,proof_issued_at timestamptz
) returns text language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_user uuid;v_nonce uuid;v_receipt text;
begin
  begin v_trip:=target_trip_id::uuid;v_user:=target_user_id::uuid;v_nonce:=proof_nonce::uuid; exception when others then raise exception 'device_proof_invalid'; end;
  if signed_grant->'claims'->>'deviceId'<>device_key_id or signed_grant->'claims'->>'deviceKeyId'<>device_key_id then raise exception 'device_proof_invalid'; end if;
  begin
    insert into trip_private.trip_device_proof_nonces(device_key_id,nonce,trip_id,user_id,purpose,action,issued_at)
      values(device_key_id,v_nonce,v_trip,v_user,'grant','offline_grant',proof_issued_at);
  exception when unique_violation then raise exception 'device_proof_replayed'; end;
  v_receipt:=app_public.record_offline_grant_receipt(target_trip_id,target_user_id,install_id,device_key_id,session_security_version,signed_grant,expires_at);
  return v_receipt;
end; $$;
alter function app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz) owner to identity_service;
revoke all on function app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz) from public,anon,authenticated;
grant execute on function app_public.record_verified_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz,text,timestamptz) to trip_grant_signer;
revoke execute on function app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz) from trip_grant_signer;

create or replace function app_public.prepare_go_device_command(trip_id text,action text,stop_id text,device_key_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;v_version bigint;
begin
  begin v_trip:=trip_id::uuid;if stop_id is not null then v_stop:=stop_id::uuid;end if; exception when others then raise exception 'validation_failed'; end;
  if action not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop','complete_trip')
    or device_key_id!~'^device-key-[A-Za-z0-9_-]{43}$' or not app_private.current_session_is_active() then raise exception 'not_allowed'; end if;
  select t.version into v_version from trip_private.trips t where t.trip_id=v_trip and t.state='active' and t.navigator_user_id=app_public.request_user_id()
    and t.navigator_device_hash=extensions.digest(convert_to(device_key_id,'utf8'),'sha256');
  if v_version is null or (action<>'complete_trip' and not exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip and s.stop_id=v_stop)) then raise exception 'not_allowed'; end if;
  return jsonb_build_object('baseVersion',v_version);
end; $$;
alter function app_public.prepare_go_device_command(text,text,text,text) owner to identity_service;
grant execute on function app_public.prepare_go_device_command(text,text,text,text) to authenticated;

create or replace function app_public.execute_verified_go_command(
  target_user_id text,target_session_id text,trip_id text,action text,stop_id text,base_version bigint,device_key_id text,proof_nonce text,proof_issued_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;v_session uuid;v_trip uuid;v_stop uuid;v_nonce uuid;v_state text;v_allowed boolean;v_target text;v_trip_version bigint;
begin
  begin v_user:=target_user_id::uuid;v_session:=target_session_id::uuid;v_trip:=trip_id::uuid;v_nonce:=proof_nonce::uuid;if stop_id is not null then v_stop:=stop_id::uuid;end if; exception when others then raise exception 'device_proof_invalid'; end;
  if action not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop','complete_trip') or proof_issued_at not between statement_timestamp()-interval '5 minutes' and statement_timestamp()+interval '5 minutes' then raise exception 'device_proof_invalid'; end if;
  if not exists(select 1 from app_private.profiles p join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
    where p.user_id=v_user and p.status='active' and s.session_id=v_session and s.state='active' and s.provider_created_at is not null
      and (s.access_token_expires_at is null or s.access_token_expires_at>statement_timestamp())
      and (p.sessions_revoked_before is null or s.provider_created_at>p.sessions_revoked_before)) then raise exception 'not_allowed'; end if;
  select t.version into v_trip_version from trip_private.trips t where t.trip_id=v_trip and t.state='active' and t.version=base_version and t.navigator_user_id=v_user and t.navigator_device_hash=extensions.digest(convert_to(device_key_id,'utf8'),'sha256') for update;
  if v_trip_version is null then raise exception 'not_allowed'; end if;
  begin
    insert into trip_private.trip_device_proof_nonces(device_key_id,nonce,trip_id,user_id,purpose,action,issued_at)
      values(device_key_id,v_nonce,v_trip,v_user,'go',action,proof_issued_at);
  exception when unique_violation then raise exception 'device_proof_replayed'; end;
  if action='complete_trip' then
    if exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip and s.state not in ('completed','skipped','observed_closed')) then raise exception 'conflict'; end if;
    update trip_private.trips set state='completed',start_kind=null,private_start_label=null,private_start_latitude=null,private_start_longitude=null,private_return_label=null,private_return_latitude=null,private_return_longitude=null,location_purged_at=statement_timestamp(),navigator_user_id=null,navigator_device_hash=null,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
    update trip_private.trip_stops set rest_address=null,rest_latitude=null,rest_longitude=null,location_purged_at=statement_timestamp() where trip_private.trip_stops.trip_id=v_trip and kind='rest';
    update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason='trip_completed' where trip_private.trip_device_bindings.trip_id=v_trip and state='active';
    update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp() where trip_private.trip_offline_grants.trip_id=v_trip and state='active';
    return trip_private.trip_command_json(v_trip);
  end if;
  select s.state into v_state from trip_private.trip_stops s where s.trip_id=v_trip and s.stop_id=v_stop for update;
  v_target:=case action when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed' when 'skip_stop' then 'skipped' when 'mark_observed_closed' then 'observed_closed' else 'planned' end;
  v_allowed:=(v_state='planned' and v_target in ('arrived','skipped','observed_closed')) or (v_state='arrived' and v_target in ('completed','skipped','observed_closed')) or (v_state='observed_closed' and v_target='planned');
  if not coalesce(v_allowed,false) then raise exception 'conflict'; end if;
  update trip_private.trip_stops s set state=v_target,arrived_at=case when v_target='arrived' then statement_timestamp() when v_target='planned' then null else s.arrived_at end,completed_at=case when v_target='completed' then statement_timestamp() when v_target='planned' then null else s.completed_at end,closed_observed_at=case when v_target='observed_closed' then statement_timestamp() when v_target='planned' then null else s.closed_observed_at end,version=s.version+1 where s.trip_id=v_trip and s.stop_id=v_stop;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz) owner to identity_service;
revoke all on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz) from public,anon,authenticated;
grant execute on function app_public.execute_verified_go_command(text,text,text,text,text,bigint,text,text,timestamptz) to trip_go_gateway;

revoke execute on function app_public.mark_arrived(text,text),app_public.complete_trip_stop(text,text),app_public.skip_trip_stop(text,text),app_public.mark_trip_stop_closed(text,text),app_public.restore_trip_stop(text,text),app_public.complete_trip(text) from authenticated;
revoke create on schema trip_private,app_public from identity_service;
revoke identity_service,trip_grant_signer,trip_go_gateway from postgres;
