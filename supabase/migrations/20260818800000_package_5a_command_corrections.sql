-- Final Package 5A command surface, signer boundary, and strict Go transitions.
grant identity_service,trip_grant_signer to postgres;
grant trip_grant_signer to authenticator;
grant create on schema trip_private,app_public to identity_service;
grant usage on schema app_public to trip_grant_signer;

create or replace function trip_private.lock_editable_trip(target_trip uuid,expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_version bigint;
begin
  if not trip_private.trip_member_can_access(target_trip) then raise exception 'not_allowed'; end if;
  select t.version into v_version from trip_private.trips t where t.trip_id=target_trip and t.state in ('draft','ready') for update;
  if v_version is null then raise exception 'not_allowed'; end if;
  if expected_version is null or v_version<>expected_version then raise exception 'conflict'; end if;
end; $$;
alter function trip_private.lock_editable_trip(uuid,bigint) owner to identity_service;

create or replace function app_public.rename_trip(trip_id text,new_name text,expected_version bigint,idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_name text;v_prior jsonb;v_version bigint;v_result jsonb;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  v_name:=regexp_replace(btrim(new_name),'[[:space:]]+',' ','g');
  if idempotency_key is null or char_length(idempotency_key)>128 or v_name is null or char_length(v_name) not between 1 and 80 or v_name~'[[:cntrl:]]' then raise exception 'validation_failed'; end if;
  select r.result_metadata into v_prior from trip_private.trip_mutation_receipts r where r.trip_id=v_trip and r.idempotency_key=rename_trip.idempotency_key;
  if found then return v_prior; end if;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'not_allowed'; end if;
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
alter function app_public.rename_trip(text,text,bigint,text) owner to identity_service;

create or replace function app_public.remove_trip_stop(trip_id text,stop_id text,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;v_position integer;v_next integer;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  delete from trip_private.trip_stops s where s.trip_id=v_trip and s.stop_id=v_stop returning position into v_position;
  if v_position is null then raise exception 'not_found'; end if;
  for v_next in v_position+1..7 loop
    update trip_private.trip_stops set position=v_next-1,version=version+1 where trip_private.trip_stops.trip_id=v_trip and position=v_next;
  end loop;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.remove_trip_stop(text,text,bigint) owner to identity_service;

create or replace function app_public.set_trip_stop_priority(trip_id text,stop_id text,priority text,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if priority not in ('must','prefer','flexible') then raise exception 'validation_failed'; end if;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  update trip_private.trip_stops set priority=set_trip_stop_priority.priority,version=version+1 where trip_private.trip_stops.trip_id=v_trip and stop_id=v_stop;
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
  if dwell_minutes not between 5 and 720 then raise exception 'validation_failed'; end if;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  update trip_private.trip_stops set planned_dwell_minutes=dwell_minutes,version=version+1 where trip_private.trip_stops.trip_id=v_trip and stop_id=v_stop;
  if not found then raise exception 'not_found'; end if;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_stop_dwell(text,text,integer,bigint) owner to identity_service;

create or replace function app_public.update_trip_schedule(trip_id text,local_date text,departure_minute integer,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_date date;
begin
  begin v_trip:=trip_id::uuid;v_date:=local_date::date; exception when others then raise exception 'validation_failed'; end;
  if departure_minute is not null and departure_minute not between 0 and 1439 then raise exception 'validation_failed'; end if;
  perform trip_private.lock_editable_trip(v_trip,expected_version);
  update trip_private.trips set local_date=v_date,departure_local_time=case when departure_minute is null then null else make_time(departure_minute/60,departure_minute%60,0) end,
    version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.update_trip_schedule(text,text,integer,bigint) owner to identity_service;

create or replace function app_public.bind_navigator_device(trip_id text,device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_device bytea;v_epoch bigint;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or not app_private.current_session_is_active() or not trip_private.trip_member_can_access(v_trip) then raise exception 'not_allowed'; end if;
  if not exists(select 1 from trip_private.trips t where t.trip_id=v_trip and t.state in ('draft','ready') and t.navigator_user_id is distinct from auth.uid()) then raise exception 'not_allowed'; end if;
  select p.session_epoch into v_epoch from app_private.profiles p where p.user_id=auth.uid() and p.status='active';
  v_device:=extensions.digest(convert_to(device_id,'utf8'),'sha256');
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason='device_rebound' where trip_private.trip_device_bindings.trip_id=v_trip and user_id=auth.uid() and state='active';
  insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version) values(v_trip,auth.uid(),v_device,v_epoch)
    on conflict(trip_id,device_hash) do update set user_id=excluded.user_id,state='active',revoked_at=null,revocation_reason=null,session_security_version=excluded.session_security_version,bound_at=statement_timestamp();
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.bind_navigator_device(text,text) owner to identity_service;

create or replace function app_public.prepare_offline_grant_claims(trip_id text,install_id text,device_id text,device_key_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_epoch bigint;v_issued timestamptz:=statement_timestamp();
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if install_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or device_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not app_private.current_session_is_active() or not exists(select 1 from trip_private.trips t where t.trip_id=v_trip and t.state in ('ready','active') and t.navigator_user_id=auth.uid()) then raise exception 'not_allowed'; end if;
  select p.session_epoch into v_epoch from app_private.profiles p where p.user_id=auth.uid() and p.status='active';
  return jsonb_build_object('accountId',auth.uid()::text,'tripId',v_trip::text,'installId',install_id,'deviceId',device_id,'deviceKeyId',device_key_id,
    'sessionSecurityVersion',v_epoch,'issuedAt',v_issued,'expiresAt',v_issued+interval '36 hours',
    'reauthorizeBy',v_issued+interval '7 days','nonce',extensions.gen_random_uuid()::text);
end; $$;
alter function app_public.prepare_offline_grant_claims(text,text,text,text) owner to identity_service;

create or replace function app_public.record_offline_grant_receipt(target_trip_id text,target_user_id text,install_id text,device_key_id text,session_security_version bigint,signed_grant jsonb,expires_at timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare v_receipt uuid;v_claims jsonb:=signed_grant->'claims';v_issued timestamptz;v_reauthorize timestamptz;
begin
  begin
    v_issued:=(v_claims->>'issuedAt')::timestamptz;v_reauthorize:=(v_claims->>'reauthorizeBy')::timestamptz;
    if coalesce(signed_grant->>'keyId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or coalesce(v_claims->>'deviceId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or coalesce(v_claims->>'nonce','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or v_issued not between statement_timestamp()-interval '5 minutes' and statement_timestamp()+interval '5 minutes'
      or v_reauthorize<v_issued or v_reauthorize>v_issued+interval '7 days' then raise exception 'offline_grant_producer_invalid'; end if;
    v_receipt:=trip_private.produce_offline_grant_receipt(target_trip_id::uuid,target_user_id::uuid,install_id,device_key_id,session_security_version,signed_grant,expires_at);
  exception when others then raise exception 'offline_grant_producer_invalid'; end;
  return v_receipt::text;
end; $$;
alter function app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz) owner to identity_service;

create or replace function trip_private.consume_start_grant(target_trip uuid,install_filter text,device_key_filter text,activate boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt trip_private.offline_grant_signing_receipts%rowtype;v_epoch bigint;v_device bytea;v_claims jsonb;v_state text;
begin
  if not app_private.current_session_is_active() then raise exception 'not_allowed'; end if;
  select t.state into v_state from trip_private.trips t where t.trip_id=target_trip and t.navigator_user_id=auth.uid() and t.state in ('ready','active') for update;
  if v_state is null or (activate and v_state<>'ready') then raise exception 'not_allowed'; end if;
  if activate and not exists(select 1 from trip_private.trips t where t.trip_id=target_trip and t.departure_local_time is not null
    and ((t.start_kind='manual' and t.private_start_label is not null) or (t.start_kind='current_location' and t.private_start_latitude is not null and t.private_start_longitude is not null))) then raise exception 'not_allowed'; end if;
  select p.session_epoch into v_epoch from app_private.profiles p where p.user_id=auth.uid() and p.status='active';
  select * into v_receipt from trip_private.offline_grant_signing_receipts r where r.trip_id=target_trip and r.user_id=auth.uid()
    and (install_filter is null or r.install_id=install_filter) and (device_key_filter is null or r.device_key_id=device_key_filter)
    and r.session_security_version=v_epoch and r.state='ready' and r.expires_at>statement_timestamp() order by r.issued_at desc limit 1 for update;
  if v_receipt.receipt_id is null then raise exception 'offline_grant_receipt_unavailable'; end if;
  v_claims:=v_receipt.signed_grant->'claims';
  if v_claims->>'accountId'<>auth.uid()::text or v_claims->>'tripId'<>target_trip::text or v_claims->>'installId'<>v_receipt.install_id
    or v_claims->>'deviceKeyId'<>v_receipt.device_key_id or (v_claims->>'sessionSecurityVersion')::bigint<>v_epoch
    or (v_claims->>'expiresAt')::timestamptz<>v_receipt.expires_at or coalesce(v_claims->>'deviceId','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception 'offline_grant_receipt_invalid'; end if;
  v_device:=extensions.digest(convert_to(v_claims->>'deviceId','utf8'),'sha256');
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason=case when activate then 'trip_started' else 'device_transferred' end
    where trip_private.trip_device_bindings.trip_id=target_trip and state='active';
  update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp() where trip_private.trip_offline_grants.trip_id=target_trip and state='active';
  insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version) values(target_trip,auth.uid(),v_device,v_epoch)
    on conflict(trip_id,device_hash) do update set user_id=excluded.user_id,state='active',revoked_at=null,revocation_reason=null,session_security_version=excluded.session_security_version,bound_at=statement_timestamp();
  insert into trip_private.trip_offline_grants(trip_id,user_id,device_hash,session_security_version,grant_hash,issued_at,expires_at)
    values(target_trip,auth.uid(),v_device,v_epoch,v_receipt.signed_grant_hash,v_receipt.issued_at,v_receipt.expires_at);
  update trip_private.trips set state=case when activate then 'active' else state end,navigator_user_id=auth.uid(),navigator_device_hash=v_device,
    version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=target_trip;
  update trip_private.offline_grant_signing_receipts set state='consumed',consumed_at=statement_timestamp() where receipt_id=v_receipt.receipt_id;
  return jsonb_build_object('trip',trip_private.trip_command_json(target_trip),'grant',v_receipt.signed_grant);
end; $$;
alter function trip_private.consume_start_grant(uuid,text,text,boolean) owner to identity_service;

create or replace function app_public.start_trip(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  return trip_private.consume_start_grant(v_trip,null,null,true);
end; $$;
alter function app_public.start_trip(text) owner to identity_service;

create or replace function app_public.start_trip_with_offline_grant(trip_id text,install_id text,device_key_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  return trip_private.consume_start_grant(v_trip,install_id,device_key_id,true);
end; $$;
alter function app_public.start_trip_with_offline_grant(text,text,text) owner to identity_service;

create or replace function app_public.transfer_navigator_device(trip_id text,install_id text,device_key_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  return trip_private.consume_start_grant(v_trip,install_id,device_key_id,false);
end; $$;
alter function app_public.transfer_navigator_device(text,text,text) owner to identity_service;

create or replace function trip_private.apply_go_stop_command(target_trip_id uuid,target_stop_id uuid,target_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_current_state text;v_allowed boolean;
begin
  if not trip_private.go_actor_can_mutate(target_trip_id) then raise exception 'not_allowed'; end if;
  select s.state into v_current_state from trip_private.trip_stops s where s.trip_id=target_trip_id and s.stop_id=target_stop_id for update;
  if v_current_state is null then raise exception 'not_found'; end if;
  v_allowed:=(v_current_state='planned' and target_state in ('arrived','skipped','observed_closed'))
    or (v_current_state='arrived' and target_state in ('completed','skipped','observed_closed'))
    or (v_current_state='observed_closed' and target_state='planned');
  if not v_allowed then raise exception 'conflict'; end if;
  update trip_private.trip_stops set state=target_state,
    arrived_at=case when target_state='arrived' then statement_timestamp() when target_state='planned' then null else arrived_at end,
    completed_at=case when target_state='completed' then statement_timestamp() when target_state='planned' then null else completed_at end,
    closed_observed_at=case when target_state='observed_closed' then statement_timestamp() when target_state='planned' then null else closed_observed_at end,
    version=version+1 where trip_id=target_trip_id and stop_id=target_stop_id;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_id=target_trip_id;
  return trip_private.trip_command_json(target_trip_id);
end; $$;
alter function trip_private.apply_go_stop_command(uuid,uuid,text) owner to identity_service;

create or replace function app_public.mark_trip_stop_closed(trip_id text,stop_id text)
returns jsonb language sql security definer set search_path='' as $$
  select trip_private.apply_go_stop_command(trip_id::uuid,stop_id::uuid,'observed_closed')
$$;
alter function app_public.mark_trip_stop_closed(text,text) owner to identity_service;

create or replace function app_public.restore_trip_stop(trip_id text,stop_id text)
returns jsonb language sql security definer set search_path='' as $$
  select trip_private.apply_go_stop_command(trip_id::uuid,stop_id::uuid,'planned')
$$;
alter function app_public.restore_trip_stop(text,text) owner to identity_service;

create or replace function app_public.replay_trip_mutation(trip_id text,envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;v_key text;v_kind text;v_base bigint;v_sequence bigint;v_device bytea;v_result jsonb;v_target text;
begin
  begin v_trip:=trip_id::uuid;v_stop:=(envelope->>'stop_id')::uuid;v_base:=(envelope->>'base_version')::bigint;v_sequence:=(envelope->>'local_sequence')::bigint; exception when others then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end;
  v_key:=envelope->>'idempotency_key';v_kind:=envelope->>'kind';v_device:=extensions.digest(convert_to(envelope->>'device_id','utf8'),'sha256');
  if v_key is null or char_length(v_key)>128 or v_kind not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop') or v_base<1 or v_sequence<1 then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end if;
  if not exists(select 1 from trip_private.trips t join trip_private.trip_device_bindings b on b.trip_id=t.trip_id and b.user_id=auth.uid() and b.device_hash=v_device and b.state='active'
    join trip_private.trip_offline_grants g on g.trip_id=t.trip_id and g.user_id=auth.uid() and g.device_hash=v_device and g.state='active' and g.expires_at>statement_timestamp()
    join app_private.profiles p on p.user_id=auth.uid() and p.status='active' and p.session_epoch=b.session_security_version and p.session_epoch=g.session_security_version
    where t.trip_id=v_trip and t.state='active' and t.navigator_user_id=auth.uid() and t.navigator_device_hash=v_device) then return jsonb_build_object('state','unauthorized'); end if;
  select r.result_metadata into v_result from trip_private.trip_mutation_receipts r where r.trip_id=v_trip and r.idempotency_key=v_key;
  if found then return v_result; end if;
  if not exists(select 1 from trip_private.trips t where t.trip_id=v_trip and t.version=v_base) then v_result:=jsonb_build_object('state','conflict','summary','The trip changed on another device.');
  else
    v_target:=case v_kind when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed' when 'skip_stop' then 'skipped' when 'mark_observed_closed' then 'observed_closed' else 'planned' end;
    begin
      v_result:=jsonb_build_object('state','accepted','trip',trip_private.apply_go_stop_command(v_trip,v_stop,v_target));
    exception when raise_exception then
      if sqlerrm='conflict' then v_result:=jsonb_build_object('state','conflict','summary','The stop transition conflicts with its current state.'); else raise; end if;
    end;
  end if;
  insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,device_hash,local_sequence,result_state,resulting_version,result_metadata)
    values(v_trip,v_key,v_base,v_device,v_sequence,case when v_result->>'state'='accepted' then 'replayed' else 'conflict' end,(select t.version from trip_private.trips t where t.trip_id=v_trip),v_result);
  return v_result;
exception when others then return jsonb_build_object('state','conflict','summary','The saved action could not be verified.');
end; $$;
alter function app_public.replay_trip_mutation(text,jsonb) owner to identity_service;

revoke all on function trip_private.lock_editable_trip(uuid,bigint),trip_private.consume_start_grant(uuid,text,text,boolean),trip_private.apply_go_stop_command(uuid,uuid,text) from public,anon,authenticated;
revoke all on function app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function app_public.record_offline_grant_receipt(text,text,text,text,bigint,jsonb,timestamptz) to trip_grant_signer;
grant execute on function app_public.rename_trip(text,text,bigint,text),app_public.remove_trip_stop(text,text,bigint),app_public.set_trip_stop_priority(text,text,text,bigint),
  app_public.set_trip_stop_dwell(text,text,integer,bigint),app_public.update_trip_schedule(text,text,integer,bigint),app_public.bind_navigator_device(text,text),
  app_public.transfer_navigator_device(text,text,text),app_public.prepare_offline_grant_claims(text,text,text,text) to authenticated;
revoke create on schema trip_private,app_public from identity_service;
revoke identity_service,trip_grant_signer from postgres;
