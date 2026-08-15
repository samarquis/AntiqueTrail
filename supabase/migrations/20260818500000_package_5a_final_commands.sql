-- Final Package 5A state commands, service producers, rotating email HMAC, and location purge.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='trip_email_key_manager') then
    create role trip_email_key_manager nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant identity_service,trip_grant_signer,trip_invitation_signer,trip_email_key_manager to postgres;
grant usage on schema trip_private to identity_service,trip_grant_signer,trip_invitation_signer,trip_email_key_manager;
grant create on schema trip_private to identity_service;
grant create on schema app_public to identity_service;
grant update on trip_private.trips,trip_private.trip_stops,trip_private.trip_visit_memories to identity_service;
grant insert on trip_private.offline_grant_signing_receipts,trip_private.invitation_signing_receipts to identity_service;

alter table trip_private.trips add column location_purged_at timestamptz;
alter table trip_private.trip_stops add column location_purged_at timestamptz;
alter table trip_private.trip_stops drop constraint stop_kind_shape;
alter table trip_private.trip_stops add constraint stop_kind_shape check(
  (kind='store' and store_id is not null and rest_label is null and rest_address is null and rest_latitude is null and rest_longitude is null)
  or (kind='rest' and store_id is null and rest_label is not null and ((location_purged_at is null and rest_address is not null) or (location_purged_at is not null and rest_address is null and rest_latitude is null and rest_longitude is null)))
);

create table trip_private.email_hmac_keys (
  environment text not null check(environment in ('local','shared_alpha','private_beta','regional_public')),
  purpose text not null check(purpose in ('trip_invitation')),
  key_version integer not null check(key_version>0),
  key_material bytea not null check(octet_length(key_material)>=32),
  state text not null check(state in ('active','verify_only','retired')),
  activated_at timestamptz not null default statement_timestamp(),
  retired_at timestamptz,
  primary key(environment,purpose,key_version),
  constraint email_hmac_key_state check((state<>'retired' and retired_at is null) or (state='retired' and retired_at is not null))
);
create unique index one_active_trip_email_hmac_key on trip_private.email_hmac_keys(environment,purpose) where state='active';
alter table trip_private.email_hmac_keys enable row level security;
alter table trip_private.email_hmac_keys force row level security;
revoke all on trip_private.email_hmac_keys from public,anon,authenticated;
grant insert,select,update on trip_private.email_hmac_keys to trip_email_key_manager;
grant select on trip_private.email_hmac_keys to identity_service;
create policy key_manager_email_hmac_keys on trip_private.email_hmac_keys for all to trip_email_key_manager using(true) with check(true);
create policy identity_verify_email_hmac_keys on trip_private.email_hmac_keys for select to identity_service using(state in ('active','verify_only'));

alter table trip_private.invitation_signing_receipts add column environment text not null default 'local';
alter table trip_private.invitation_signing_receipts add column purpose text not null default 'trip_invitation';
alter table trip_private.invitation_signing_receipts add column email_hmac_key_version integer not null default 1;
alter table trip_private.trip_invitations add column environment text not null default 'local';
alter table trip_private.trip_invitations add column purpose text not null default 'trip_invitation';
alter table trip_private.trip_invitations add column email_hmac_key_version integer not null default 1;

create or replace function trip_private.email_hmac(normalized_email text,target_purpose text,target_environment text,target_version integer default null)
returns table(value bytea,key_version integer) language plpgsql stable security definer set search_path='' as $$
declare v_key trip_private.email_hmac_keys%rowtype;
begin
  if normalized_email<>lower(btrim(normalized_email)) or char_length(normalized_email) not between 3 and 320 then raise exception 'email_invalid'; end if;
  select * into v_key from trip_private.email_hmac_keys k where k.environment=target_environment and k.purpose=target_purpose
    and ((target_version is null and k.state='active') or (target_version is not null and k.key_version=target_version and k.state in ('active','verify_only')))
    order by k.key_version desc limit 1;
  if v_key.key_version is null then raise exception 'email_hmac_key_unavailable'; end if;
  return query select extensions.hmac(convert_to(normalized_email,'utf8'),v_key.key_material,'sha256'),v_key.key_version;
end; $$;
alter function trip_private.email_hmac(text,text,text,integer) owner to identity_service;
revoke all on function trip_private.email_hmac(text,text,text,integer) from public,anon,authenticated;

create or replace function trip_private.current_verified_email_hmac(target_purpose text,target_environment text,target_version integer)
returns bytea language sql stable security definer set search_path='' as $$
  select h.value from auth.users u cross join lateral trip_private.email_hmac(lower(btrim(u.email)),target_purpose,target_environment,target_version) h
  where u.id=app_public.request_user_id() and u.email_confirmed_at is not null;
$$;
alter function trip_private.current_verified_email_hmac(text,text,integer) owner to postgres;
revoke all on function trip_private.current_verified_email_hmac(text,text,integer) from public,anon,authenticated;
grant execute on function trip_private.current_verified_email_hmac(text,text,integer) to identity_service;

revoke insert on trip_private.offline_grant_signing_receipts from trip_grant_signer;
revoke insert on trip_private.invitation_signing_receipts from trip_invitation_signer;

create or replace function trip_private.produce_offline_grant_receipt(
  target_trip_id uuid,target_user_id uuid,install_id text,device_key_id text,session_security_version bigint,
  signed_grant jsonb,expires_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_receipt uuid; v_claims jsonb:=signed_grant->'claims';
begin
  if not exists(select 1 from trip_private.trips t where t.trip_id=target_trip_id)
    or v_claims->>'accountId'<>target_user_id::text or v_claims->>'tripId'<>target_trip_id::text
    or v_claims->>'installId'<>install_id or v_claims->>'deviceKeyId'<>device_key_id
    or (v_claims->>'sessionSecurityVersion')::bigint<>session_security_version
    or (v_claims->>'expiresAt')::timestamptz<>expires_at or expires_at>statement_timestamp()+interval '36 hours'
    or coalesce(signed_grant->>'signature','') !~ '^[A-Za-z0-9_-]{32,2048}$' then raise exception 'offline_grant_producer_invalid'; end if;
  insert into trip_private.offline_grant_signing_receipts(trip_id,user_id,install_id,device_key_id,session_security_version,signed_grant,signed_grant_hash,expires_at)
    values(target_trip_id,target_user_id,install_id,device_key_id,session_security_version,signed_grant,extensions.digest(convert_to(signed_grant::text,'utf8'),'sha256'),expires_at)
    returning receipt_id into v_receipt;
  return v_receipt;
end; $$;
alter function trip_private.produce_offline_grant_receipt(uuid,uuid,text,text,bigint,jsonb,timestamptz) owner to identity_service;
revoke all on function trip_private.produce_offline_grant_receipt(uuid,uuid,text,text,bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function trip_private.produce_offline_grant_receipt(uuid,uuid,text,text,bigint,jsonb,timestamptz) to trip_grant_signer;

create or replace function trip_private.produce_invitation_receipt(
  target_trip_id uuid,normalized_email text,token_hash bytea,provider_receipt_id text,expires_at timestamptz,target_environment text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_receipt uuid; v_hmac bytea; v_version integer;
begin
  if octet_length(token_hash)<>32 or expires_at>statement_timestamp()+interval '7 days' then raise exception 'invitation_producer_invalid'; end if;
  select h.value,h.key_version into v_hmac,v_version from trip_private.email_hmac(normalized_email,'trip_invitation',target_environment,null) h;
  insert into trip_private.invitation_signing_receipts(trip_id,recipient_email_digest,token_hash,provider_receipt_id,expires_at,environment,purpose,email_hmac_key_version)
    values(target_trip_id,v_hmac,token_hash,provider_receipt_id,expires_at,target_environment,'trip_invitation',v_version) returning receipt_id into v_receipt;
  return v_receipt;
end; $$;
alter function trip_private.produce_invitation_receipt(uuid,text,bytea,text,timestamptz,text) owner to identity_service;
revoke all on function trip_private.produce_invitation_receipt(uuid,text,bytea,text,timestamptz,text) from public,anon,authenticated;
grant execute on function trip_private.produce_invitation_receipt(uuid,text,bytea,text,timestamptz,text) to trip_invitation_signer;

create or replace function trip_private.current_trip_environment()
returns text language sql stable security definer set search_path='' as $$
  select case s.stage when 'private_beta' then 'private_beta' when 'regional_public' then 'regional_public' else 'shared_alpha' end
  from app_private.environment_stage s where s.id=1;
$$;
alter function trip_private.current_trip_environment() owner to identity_service;
revoke all on function trip_private.current_trip_environment() from public,anon,authenticated;

create or replace function app_public.invite_trip_partner(trip_id text,verified_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_hmac bytea;v_version integer;v_environment text;v_receipt trip_private.invitation_signing_receipts%rowtype;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_owner_can_access(v_trip) or verified_email<>lower(btrim(verified_email)) then raise exception 'not_allowed'; end if;
  v_environment:=trip_private.current_trip_environment();
  select h.value,h.key_version into v_hmac,v_version from trip_private.email_hmac(verified_email,'trip_invitation',v_environment,null) h;
  select * into v_receipt from trip_private.invitation_signing_receipts r where r.trip_id=v_trip and r.recipient_email_digest=v_hmac
    and r.environment=v_environment and r.purpose='trip_invitation' and r.email_hmac_key_version=v_version and r.state='ready' and r.expires_at>statement_timestamp()
    order by r.issued_at desc limit 1 for update;
  if v_receipt.receipt_id is null then raise exception 'provider_unavailable'; end if;
  insert into trip_private.trip_invitations(trip_id,token_hash,recipient_email_hmac,expires_at,idempotency_key,environment,purpose,email_hmac_key_version)
    values(v_trip,v_receipt.token_hash,v_hmac,v_receipt.expires_at,v_receipt.provider_receipt_id,v_environment,'trip_invitation',v_version);
  update trip_private.invitation_signing_receipts set state='consumed',consumed_at=statement_timestamp() where receipt_id=v_receipt.receipt_id;
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.invite_trip_partner(text,text) owner to identity_service;

create or replace function app_public.accept_trip_invitation(fragment_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invite trip_private.trip_invitations%rowtype;v_hmac bytea;
begin
  if not app_private.current_session_is_active() or fragment_token is null or char_length(fragment_token) not between 32 and 4096 then raise exception 'not_allowed'; end if;
  select * into v_invite from trip_private.trip_invitations i where i.token_hash=extensions.digest(convert_to(fragment_token,'utf8'),'sha256')
    and i.state='pending' and i.expires_at>statement_timestamp() limit 1 for update;
  if v_invite.invitation_id is null then raise exception 'not_allowed'; end if;
  v_hmac:=trip_private.current_verified_email_hmac(v_invite.purpose,v_invite.environment,v_invite.email_hmac_key_version);
  if v_hmac is null or v_hmac<>v_invite.recipient_email_hmac then raise exception 'not_allowed'; end if;
  if exists(select 1 from trip_private.trip_participants p where p.trip_id=v_invite.trip_id and p.participant_role='partner' and p.state='active') then raise exception 'not_allowed'; end if;
  update trip_private.trip_invitations set state='accepted',accepted_user_id=app_public.request_user_id(),accepted_at=statement_timestamp(),version=version+1 where invitation_id=v_invite.invitation_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role) values(v_invite.trip_id,app_public.request_user_id(),'partner')
    on conflict(trip_id,user_id) do update set state='active',left_at=null,version=trip_private.trip_participants.version+1;
  return trip_private.collaboration_json(v_invite.trip_id);
end; $$;
alter function app_public.accept_trip_invitation(text) owner to identity_service;
drop function if exists trip_private.current_verified_email_digest();

create or replace function app_public.set_trip_start(trip_id text,kind text,label text,latitude double precision,longitude double precision,departure_minute integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) or departure_minute not between 0 and 1439
    or (kind='manual' and (label is null or latitude is not null or longitude is not null))
    or (kind='current_location' and (latitude not between -90 and 90 or longitude not between -180 and 180))
    or kind not in ('manual','current_location') then raise exception 'validation_failed'; end if;
  update trip_private.trips set start_kind=kind,private_start_label=case when kind='manual' then label else null end,
    private_start_latitude=case when kind='current_location' then latitude else null end,private_start_longitude=case when kind='current_location' then longitude else null end,
    departure_local_time=make_time(departure_minute/60,departure_minute%60,0),version=version+1,updated_at=statement_timestamp()
    where trip_private.trips.trip_id=v_trip and state in ('draft','ready');
  if not found then raise exception 'not_allowed'; end if;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_start(text,text,text,double precision,double precision,integer) owner to identity_service;

create or replace function app_public.set_trip_return(trip_id text,clear boolean,label text,latitude double precision,longitude double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) or (not clear and label is null and (latitude is null or longitude is null)) then raise exception 'validation_failed'; end if;
  update trip_private.trips set private_return_label=case when clear then null else label end,private_return_latitude=case when clear then null else latitude end,
    private_return_longitude=case when clear then null else longitude end,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip and state in ('draft','ready');
  if not found then raise exception 'not_allowed'; end if; return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_return(text,boolean,text,double precision,double precision) owner to identity_service;

create or replace function app_public.set_trip_limits(trip_id text,max_drive_miles double precision,max_total_minutes integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) or (max_drive_miles is not null and max_drive_miles not between 1 and 500) or (max_total_minutes is not null and max_total_minutes not between 30 and 1440) then raise exception 'validation_failed'; end if;
  update trip_private.trips set max_drive_miles=set_trip_limits.max_drive_miles,max_total_minutes=set_trip_limits.max_total_minutes,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip and state in ('draft','ready');
  if not found then raise exception 'not_allowed'; end if; return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.set_trip_limits(text,double precision,integer) owner to identity_service;

create or replace function app_public.add_rest_stop(trip_id text,label text,address text,priority text,planned_dwell_minutes integer,latitude double precision,longitude double precision)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_position integer;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) or label is null or address is null or priority not in ('must','prefer','flexible') or planned_dwell_minutes not between 5 and 720 or ((latitude is null)<>(longitude is null)) then raise exception 'validation_failed'; end if;
  select coalesce(max(s.position),-1)+1 into v_position from trip_private.trip_stops s where s.trip_id=v_trip;
  if v_position>7 then raise exception 'validation_failed'; end if;
  insert into trip_private.trip_stops(trip_id,kind,rest_label,rest_address,rest_latitude,rest_longitude,position,priority,planned_dwell_minutes)
    values(v_trip,'rest',label,address,latitude,longitude,v_position,priority,planned_dwell_minutes);
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip and state in ('draft','ready');
  if not found then raise exception 'not_allowed'; end if; return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.add_rest_stop(text,text,text,text,integer,double precision,double precision) owner to identity_service;

create or replace function trip_private.go_actor_can_mutate(target_trip uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_session_is_active() and exists(select 1 from trip_private.trips t join trip_private.trip_device_bindings b on b.trip_id=t.trip_id and b.user_id=app_public.request_user_id() and b.device_hash=t.navigator_device_hash and b.state='active' where t.trip_id=target_trip and t.state='active' and t.navigator_user_id=app_public.request_user_id());
$$;
alter function trip_private.go_actor_can_mutate(uuid) owner to identity_service;

create or replace function trip_private.apply_go_stop_command(target_trip_id uuid,target_stop_id uuid,target_state text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not trip_private.go_actor_can_mutate(target_trip_id) then raise exception 'not_allowed'; end if;
  update trip_private.trip_stops set state=target_state,
    arrived_at=case when target_state='arrived' then statement_timestamp() else arrived_at end,
    completed_at=case when target_state='completed' then statement_timestamp() else completed_at end,
    version=version+1 where trip_id=target_trip_id and stop_id=target_stop_id;
  if not found then raise exception 'not_found'; end if;
  update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_id=target_trip_id;
  return trip_private.trip_command_json(target_trip_id);
end; $$;
alter function trip_private.apply_go_stop_command(uuid,uuid,text) owner to identity_service;

create or replace function trip_private.guard_trip_activation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='active' and old.state<>'active' and (
    new.departure_local_time is null or new.navigator_user_id is null or new.navigator_device_hash is null
    or not ((new.start_kind='manual' and new.private_start_label is not null) or (new.start_kind='current_location' and new.private_start_latitude is not null and new.private_start_longitude is not null))
    or not exists(select 1 from trip_private.trip_device_bindings b where b.trip_id=new.trip_id and b.user_id=new.navigator_user_id and b.device_hash=new.navigator_device_hash and b.state='active')
    or not (app_public.request_user_id()=new.owner_id or old.navigator_user_id=app_public.request_user_id())
  ) then raise exception 'not_allowed'; end if;
  return new;
end; $$;
alter function trip_private.guard_trip_activation() owner to identity_service;
drop trigger if exists trip_activation_guard on trip_private.trips;
create trigger trip_activation_guard before update of state on trip_private.trips for each row execute function trip_private.guard_trip_activation();

create or replace function app_public.mark_trip_stop_closed(trip_id text,stop_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_stop uuid;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.go_actor_can_mutate(v_trip) then raise exception 'not_allowed'; end if;
  update trip_private.trip_stops set state='observed_closed',closed_observed_at=statement_timestamp(),completed_at=null,version=version+1 where trip_private.trip_stops.trip_id=v_trip and trip_private.trip_stops.stop_id=v_stop and state in ('planned','arrived');
  if not found then raise exception 'conflict'; end if; update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip; return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.mark_trip_stop_closed(text,text) owner to identity_service;

create or replace function app_public.restore_trip_stop(trip_id text,stop_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_stop uuid;
begin
  begin v_trip:=trip_id::uuid;v_stop:=stop_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.go_actor_can_mutate(v_trip) then raise exception 'not_allowed'; end if;
  update trip_private.trip_stops set state='planned',arrived_at=null,completed_at=null,closed_observed_at=null,version=version+1 where trip_private.trip_stops.trip_id=v_trip and trip_private.trip_stops.stop_id=v_stop and state='observed_closed';
  if not found then raise exception 'conflict'; end if; update trip_private.trips set version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip; return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.restore_trip_stop(text,text) owner to identity_service;

create or replace function app_public.complete_trip(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.go_actor_can_mutate(v_trip) or exists(select 1 from trip_private.trip_stops s where s.trip_id=v_trip and s.state not in ('completed','skipped','observed_closed')) then raise exception 'not_allowed'; end if;
  update trip_private.trips set state='completed',start_kind=null,private_start_label=null,private_start_latitude=null,private_start_longitude=null,private_return_label=null,private_return_latitude=null,private_return_longitude=null,location_purged_at=statement_timestamp(),navigator_user_id=null,navigator_device_hash=null,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  update trip_private.trip_stops set rest_address=null,rest_latitude=null,rest_longitude=null,location_purged_at=statement_timestamp() where trip_private.trip_stops.trip_id=v_trip and kind='rest';
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason='trip_completed' where trip_private.trip_device_bindings.trip_id=v_trip and state='active';
  update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp() where trip_private.trip_offline_grants.trip_id=v_trip and state='active';
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.complete_trip(text) owner to identity_service;

create or replace function app_public.save_trip_visit_memory(trip_id text,store_id text,rating integer,return_choice text,note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_store uuid;
begin
  begin v_trip:=trip_id::uuid;v_store:=store_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not trip_private.trip_member_can_access(v_trip) or (rating is null and return_choice is null and nullif(btrim(note),'') is null)
    or (rating is not null and rating not between 1 and 5) or (return_choice is not null and return_choice not in ('no','maybe','yes')) or char_length(note)>2000
    or not exists(select 1 from trip_private.trips t join trip_private.trip_stops s on s.trip_id=t.trip_id
      where t.trip_id=v_trip and t.state='completed' and s.store_id=v_store and s.state in ('completed','observed_closed')) then raise exception 'validation_failed'; end if;
  insert into trip_private.trip_visit_memories(author_user_id,trip_id,store_id,rating,return_choice,note)
    values(app_public.request_user_id(),v_trip,v_store,rating,return_choice,nullif(btrim(note),'')) on conflict(author_user_id,trip_id,store_id) do update set rating=excluded.rating,return_choice=excluded.return_choice,note=excluded.note,version=trip_private.trip_visit_memories.version+1,updated_at=statement_timestamp();
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.save_trip_visit_memory(text,text,integer,text,text) owner to identity_service;

create or replace function app_public.start_trip(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if not app_private.current_session_is_active() or not exists(select 1 from trip_private.trips t join trip_private.trip_device_bindings b on b.trip_id=t.trip_id and b.user_id=app_public.request_user_id() and b.device_hash=t.navigator_device_hash and b.state='active' where t.trip_id=v_trip and t.state='ready' and t.navigator_user_id=app_public.request_user_id() and t.departure_local_time is not null and ((t.start_kind='manual' and t.private_start_label is not null) or (t.start_kind='current_location' and t.private_start_latitude is not null and t.private_start_longitude is not null))) then raise exception 'not_allowed'; end if;
  update trip_private.trips set state='active',version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.start_trip(text) owner to identity_service;

create or replace function app_public.replay_trip_mutation(trip_id text,envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;v_stop uuid;v_key text;v_kind text;v_base bigint;v_sequence bigint;v_device bytea;v_result jsonb;
begin
  begin v_trip:=trip_id::uuid;v_stop:=(envelope->>'stop_id')::uuid;v_base:=(envelope->>'base_version')::bigint;v_sequence:=(envelope->>'local_sequence')::bigint; exception when others then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end;
  v_key:=envelope->>'idempotency_key';v_kind:=envelope->>'kind';v_device:=extensions.digest(convert_to(envelope->>'device_id','utf8'),'sha256');
  if v_key is null or char_length(v_key)>128 or v_kind not in ('mark_arrived','complete_stop','skip_stop','mark_observed_closed','restore_stop') or v_base<1 or v_sequence<1 then return jsonb_build_object('state','conflict','summary','The saved action is invalid.'); end if;
  if not exists(select 1 from trip_private.trips t join trip_private.trip_device_bindings b on b.trip_id=t.trip_id and b.user_id=app_public.request_user_id() and b.device_hash=v_device and b.state='active'
    join trip_private.trip_offline_grants g on g.trip_id=t.trip_id and g.user_id=app_public.request_user_id() and g.device_hash=v_device and g.state='active' and g.expires_at>statement_timestamp()
    join app_private.profiles p on p.user_id=app_public.request_user_id() and p.status='active' and p.session_epoch=b.session_security_version and p.session_epoch=g.session_security_version
    where t.trip_id=v_trip and t.state='active' and t.navigator_user_id=app_public.request_user_id() and t.navigator_device_hash=v_device) then return jsonb_build_object('state','unauthorized'); end if;
  select r.result_metadata into v_result from trip_private.trip_mutation_receipts r where r.trip_id=v_trip and r.idempotency_key=v_key;
  if found then return v_result; end if;
  if not exists(select 1 from trip_private.trips t where t.trip_id=v_trip and t.version=v_base) then v_result:=jsonb_build_object('state','conflict','summary','The trip changed on another device.');
  else
    v_result:=jsonb_build_object('state','accepted','trip',case v_kind
      when 'mark_observed_closed' then app_public.mark_trip_stop_closed(trip_id,v_stop::text)
      when 'restore_stop' then app_public.restore_trip_stop(trip_id,v_stop::text)
      else trip_private.apply_go_stop_command(v_trip,v_stop,case v_kind when 'mark_arrived' then 'arrived' when 'complete_stop' then 'completed' else 'skipped' end) end);
  end if;
  insert into trip_private.trip_mutation_receipts(trip_id,idempotency_key,base_version,device_hash,local_sequence,result_state,resulting_version,result_metadata)
    values(v_trip,v_key,v_base,v_device,v_sequence,case when v_result->>'state'='accepted' then 'replayed' else 'conflict' end,(select t.version from trip_private.trips t where t.trip_id=v_trip),v_result);
  return v_result;
exception when others then return jsonb_build_object('state','conflict','summary','The saved action could not be verified.');
end; $$;
alter function app_public.replay_trip_mutation(text,jsonb) owner to identity_service;

revoke all on function trip_private.go_actor_can_mutate(uuid) from public,anon,authenticated;
grant execute on function app_public.set_trip_start(text,text,text,double precision,double precision,integer),app_public.set_trip_return(text,boolean,text,double precision,double precision),app_public.set_trip_limits(text,double precision,integer),app_public.add_rest_stop(text,text,text,text,integer,double precision,double precision),app_public.mark_trip_stop_closed(text,text),app_public.restore_trip_stop(text,text),app_public.complete_trip(text),app_public.save_trip_visit_memory(text,text,integer,text,text) to authenticated;
revoke create on schema trip_private from identity_service;
revoke create on schema app_public from identity_service;
revoke identity_service,trip_grant_signer,trip_invitation_signer,trip_email_key_manager from postgres;
