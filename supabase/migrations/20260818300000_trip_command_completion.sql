-- Complete the configured Package 5A command surface without adding a browser signing oracle.
-- Offline grants and invitation tokens are consumed only from pre-issued, signer-bound receipts.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='trip_grant_signer') then
    create role trip_grant_signer nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='trip_invitation_signer') then
    create role trip_invitation_signer nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='trip_route_worker') then
    create role trip_route_worker nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='trip_route_authorizer') then
    create role trip_route_authorizer nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

grant identity_service,trip_grant_signer,trip_invitation_signer,trip_route_worker,trip_route_authorizer to postgres;
grant usage on schema trip_private to identity_service,trip_grant_signer,trip_invitation_signer,trip_route_worker,trip_route_authorizer;
grant create on schema trip_private to identity_service;
grant update on trip_private.trip_invitations,trip_private.trip_participants,
  trip_private.trip_device_bindings,trip_private.trip_offline_grants to identity_service;

create table trip_private.offline_grant_signing_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id text not null,
  device_key_id text not null,
  session_security_version bigint not null check(session_security_version>0),
  signed_grant jsonb not null,
  signed_grant_hash bytea not null check(octet_length(signed_grant_hash)=32),
  expires_at timestamptz not null,
  state text not null default 'ready' check(state in ('ready','consumed','expired','revoked')),
  issued_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz,
  constraint offline_signing_receipt_ids check(
    install_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' and
    device_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint offline_signing_receipt_window check(expires_at>issued_at and expires_at<=issued_at+interval '36 hours'),
  constraint offline_signing_receipt_shape check(
    jsonb_typeof(signed_grant)='object' and
    signed_grant ? 'keyId' and signed_grant ? 'claims' and signed_grant ? 'signature' and
    signed_grant_hash=extensions.digest(convert_to(signed_grant::text,'utf8'),'sha256') and
    ((state='ready' and consumed_at is null) or (state='consumed' and consumed_at is not null) or state in ('expired','revoked')))
);
create unique index one_ready_offline_signing_receipt on trip_private.offline_grant_signing_receipts(trip_id,user_id,install_id,device_key_id) where state='ready';

create table trip_private.invitation_signing_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  recipient_email_digest bytea not null check(octet_length(recipient_email_digest)=32),
  token_hash bytea not null check(octet_length(token_hash)=32),
  provider_receipt_id text not null unique,
  expires_at timestamptz not null,
  state text not null default 'ready' check(state in ('ready','consumed','expired','revoked')),
  issued_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz,
  constraint invitation_signing_window check(expires_at>issued_at and expires_at<=issued_at+interval '7 days'),
  constraint invitation_signing_provider_id check(provider_receipt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint invitation_signing_state_shape check(
    (state='ready' and consumed_at is null) or (state='consumed' and consumed_at is not null) or state in ('expired','revoked'))
);
create unique index one_ready_invitation_signing_receipt on trip_private.invitation_signing_receipts(trip_id,recipient_email_digest) where state='ready';

create table trip_private.routing_contract_receipts (
  contract_receipt_id uuid primary key default extensions.gen_random_uuid(),
  provider_key text not null,
  provider_version text not null,
  attribution text not null,
  max_requests integer not null check(max_requests between 1 and 8),
  max_cost_units numeric(10,4) not null check(max_cost_units>=0),
  timeout_ms integer not null check(timeout_ms between 100 and 30000),
  state text not null check(state in ('accepted','revoked')),
  evidence_hash bytea not null check(octet_length(evidence_hash)=32),
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  constraint routing_contract_codes check(provider_key ~ '^[a-z][a-z0-9_-]{1,63}$' and char_length(provider_version) between 1 and 64),
  constraint routing_contract_state_shape check((state='accepted' and revoked_at is null) or (state='revoked' and revoked_at is not null))
);
create unique index one_accepted_routing_contract on trip_private.routing_contract_receipts((state)) where state='accepted';

create table trip_private.check_my_day_requests (
  request_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  trip_version bigint not null check(trip_version>0),
  facts jsonb not null check(jsonb_typeof(facts)='object'),
  facts_hash bytea not null check(octet_length(facts_hash)=32),
  state text not null check(state in ('blocked','ready','running','suggested','failed')),
  block_reason text,
  contract_receipt_id uuid references trip_private.routing_contract_receipts(contract_receipt_id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint check_my_day_request_state check(
    (state='blocked' and block_reason is not null and contract_receipt_id is null) or
    (state<>'blocked' and block_reason is null and contract_receipt_id is not null)),
  constraint check_my_day_facts_hash check(facts_hash=extensions.digest(convert_to(facts::text,'utf8'),'sha256'))
);
create index check_my_day_requests_actor_idx on trip_private.check_my_day_requests(actor_user_id,created_at desc);

create table trip_private.check_my_day_route_runs (
  route_run_id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null unique references trip_private.check_my_day_requests(request_id) on delete cascade,
  provider_version text not null,
  attribution text not null,
  request_count integer not null check(request_count between 1 and 8),
  cost_units numeric(10,4) not null check(cost_units>=0),
  matrix jsonb not null check(jsonb_typeof(matrix)='object'),
  matrix_hash bytea not null check(octet_length(matrix_hash)=32),
  generated_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint route_run_matrix_hash check(matrix_hash=extensions.digest(convert_to(matrix::text,'utf8'),'sha256'))
);

create table trip_private.check_my_day_suggestions (
  suggestion_id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null unique references trip_private.check_my_day_requests(request_id) on delete cascade,
  ordered_stop_ids uuid[] not null check(cardinality(ordered_stop_ids) between 1 and 8),
  explanation jsonb not null check(jsonb_typeof(explanation)='array'),
  suggestion_hash bytea not null check(octet_length(suggestion_hash)=32),
  created_at timestamptz not null default statement_timestamp(),
  constraint check_my_day_suggestion_hash check(suggestion_hash=extensions.digest(convert_to(jsonb_build_object('orderedStopIds',ordered_stop_ids,'explanation',explanation)::text,'utf8'),'sha256'))
);

create table trip_private.trip_conflict_resolution_receipts (
  resolution_id uuid primary key default extensions.gen_random_uuid(),
  conflict_id uuid not null unique references trip_private.trip_mutation_conflicts(conflict_id) on delete cascade,
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  choice text not null check(choice in ('phone','saved')),
  resolution_hash bytea not null check(octet_length(resolution_hash)=32),
  created_at timestamptz not null default statement_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['offline_grant_signing_receipts','invitation_signing_receipts','routing_contract_receipts','check_my_day_requests','check_my_day_route_runs','check_my_day_suggestions','trip_conflict_resolution_receipts'] loop
    execute format('alter table trip_private.%I enable row level security',t);
    execute format('alter table trip_private.%I force row level security',t);
    execute format('revoke all on trip_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
grant select,update on trip_private.offline_grant_signing_receipts,trip_private.invitation_signing_receipts to identity_service;
grant insert,select,update on trip_private.check_my_day_requests to identity_service;
grant insert,select on trip_private.check_my_day_route_runs,trip_private.check_my_day_suggestions,trip_private.trip_conflict_resolution_receipts to identity_service;
grant select on trip_private.routing_contract_receipts to identity_service;
grant insert,select on trip_private.offline_grant_signing_receipts to trip_grant_signer;
grant insert,select on trip_private.invitation_signing_receipts to trip_invitation_signer;
grant insert on trip_private.routing_contract_receipts to trip_route_authorizer;
create policy identity_offline_signing_receipts on trip_private.offline_grant_signing_receipts for all to identity_service using(true) with check(true);
create policy signer_offline_signing_receipts on trip_private.offline_grant_signing_receipts for insert to trip_grant_signer with check(true);
create policy identity_invitation_signing_receipts on trip_private.invitation_signing_receipts for all to identity_service using(true) with check(true);
create policy signer_invitation_signing_receipts on trip_private.invitation_signing_receipts for insert to trip_invitation_signer with check(true);
create policy identity_check_my_day_requests on trip_private.check_my_day_requests for all to identity_service using(true) with check(true);
create policy identity_routing_contracts on trip_private.routing_contract_receipts for select to identity_service using(true);
create policy identity_check_my_day_runs on trip_private.check_my_day_route_runs for all to identity_service using(true) with check(true);
create policy identity_check_my_day_suggestions on trip_private.check_my_day_suggestions for all to identity_service using(true) with check(true);
create policy identity_conflict_resolutions on trip_private.trip_conflict_resolution_receipts for all to identity_service using(true) with check(true);
create policy authorizer_routing_contracts on trip_private.routing_contract_receipts for insert to trip_route_authorizer with check(true);

create or replace function trip_private.current_verified_email_digest()
returns bytea language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(lower(btrim(u.email)),'utf8'),'sha256')
  from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
$$;
alter function trip_private.current_verified_email_digest() owner to postgres;
revoke all on function trip_private.current_verified_email_digest() from public,anon,authenticated;
grant execute on function trip_private.current_verified_email_digest() to identity_service;

create or replace function trip_private.collaboration_json(target_trip_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'tripId',t.trip_id::text,'currentUserId',auth.uid()::text,
    'participants',coalesce((select jsonb_agg(jsonb_build_object(
      'userId',p.user_id::text,'displayName',case when p.participant_role='creator' then 'Trip creator' else 'Trip partner' end,
      'role',p.participant_role) order by p.participant_role,p.joined_at)
      from trip_private.trip_participants p where p.trip_id=t.trip_id and p.state='active'),'[]'::jsonb),
    'navigatorUserId',t.navigator_user_id::text,
    'invitation',(select jsonb_build_object('id',i.invitation_id::text,'state',i.state,'expiresAt',i.expires_at::text)
      from trip_private.trip_invitations i where i.trip_id=t.trip_id order by i.created_at desc limit 1)
  ) from trip_private.trips t where t.trip_id=target_trip_id;
$$;
alter function trip_private.collaboration_json(uuid) owner to identity_service;

create or replace function trip_private.record_check_my_day_suggestion(
  target_request_id uuid,provider_version text,attribution text,request_count integer,
  cost_units numeric,matrix jsonb,generated_at timestamptz,ordered_stop_ids uuid[],explanation jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request trip_private.check_my_day_requests%rowtype; v_contract trip_private.routing_contract_receipts%rowtype; v_expected uuid[]; v_suggestion uuid;
begin
  select * into v_request from trip_private.check_my_day_requests r where r.request_id=target_request_id and r.state='ready' for update;
  if v_request.request_id is null then raise exception 'check_my_day_request_unavailable'; end if;
  select * into v_contract from trip_private.routing_contract_receipts c where c.contract_receipt_id=v_request.contract_receipt_id and c.state='accepted';
  if v_contract.contract_receipt_id is null or provider_version<>v_contract.provider_version or attribution<>v_contract.attribution
    or request_count not between 1 and v_contract.max_requests or cost_units<0 or cost_units>v_contract.max_cost_units
    or generated_at<statement_timestamp()-interval '10 minutes' or generated_at>statement_timestamp()+interval '1 minute'
    or jsonb_typeof(matrix)<>'object' or jsonb_typeof(explanation)<>'array' or jsonb_array_length(explanation) not between 1 and 20
    or cardinality(ordered_stop_ids) not between 1 and 8 or cardinality(ordered_stop_ids)<>cardinality(array(select distinct unnest(ordered_stop_ids))) then
    raise exception 'check_my_day_route_evidence_invalid';
  end if;
  select array_agg((stop->>'id')::uuid order by (stop->>'id')::uuid) into v_expected from jsonb_array_elements(v_request.facts->'stops') stop;
  if v_expected is distinct from (select array_agg(x order by x) from unnest(ordered_stop_ids) x) then raise exception 'check_my_day_stop_set_mismatch'; end if;
  insert into trip_private.check_my_day_route_runs(request_id,provider_version,attribution,request_count,cost_units,matrix,matrix_hash,generated_at)
    values(target_request_id,provider_version,attribution,request_count,cost_units,matrix,extensions.digest(convert_to(matrix::text,'utf8'),'sha256'),generated_at);
  insert into trip_private.check_my_day_suggestions(request_id,ordered_stop_ids,explanation,suggestion_hash)
    values(target_request_id,ordered_stop_ids,explanation,extensions.digest(convert_to(jsonb_build_object('orderedStopIds',ordered_stop_ids,'explanation',explanation)::text,'utf8'),'sha256'))
    returning suggestion_id into v_suggestion;
  update trip_private.check_my_day_requests set state='suggested' where request_id=target_request_id;
  return v_suggestion;
end; $$;
alter function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) owner to identity_service;
revoke all on function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) from public,anon,authenticated;
grant execute on function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) to trip_route_worker;

create or replace function app_public.start_trip_with_offline_grant(trip_id text,install_id text,device_key_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_receipt trip_private.offline_grant_signing_receipts%rowtype; v_epoch bigint; v_device_hash bytea; v_claims jsonb;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not app_private.current_session_is_active() or not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  if install_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or device_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception 'offline_device_invalid'; end if;
  select p.session_epoch into v_epoch from app_private.profiles p where p.user_id=auth.uid() and p.status='active';
  select * into v_receipt from trip_private.offline_grant_signing_receipts r
    where r.trip_id=v_trip and r.user_id=auth.uid() and r.install_id=start_trip_with_offline_grant.install_id
      and r.device_key_id=start_trip_with_offline_grant.device_key_id and r.session_security_version=v_epoch
      and r.state='ready' and r.expires_at>statement_timestamp() order by r.issued_at desc limit 1 for update;
  if v_receipt.receipt_id is null then raise exception 'offline_grant_receipt_unavailable'; end if;
  v_claims:=v_receipt.signed_grant->'claims';
  if v_claims->>'accountId'<>auth.uid()::text or v_claims->>'tripId'<>v_trip::text
    or v_claims->>'installId'<>install_id or v_claims->>'deviceKeyId'<>device_key_id
    or (v_claims->>'sessionSecurityVersion')::bigint<>v_epoch
    or (v_claims->>'expiresAt')::timestamptz<>v_receipt.expires_at
    or coalesce(v_receipt.signed_grant->>'signature','') !~ '^[A-Za-z0-9_-]{32,2048}$' then
    raise exception 'offline_grant_receipt_invalid';
  end if;
  v_device_hash:=extensions.digest(convert_to(v_claims->>'deviceId','utf8'),'sha256');
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason='navigator_replaced'
    where trip_private.trip_device_bindings.trip_id=v_trip and state='active';
  update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp()
    where trip_private.trip_offline_grants.trip_id=v_trip and state='active';
  update trip_private.trips set navigator_user_id=null,navigator_device_hash=null where trip_private.trips.trip_id=v_trip;
  insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version)
    values(v_trip,auth.uid(),v_device_hash,v_epoch);
  insert into trip_private.trip_offline_grants(trip_id,user_id,device_hash,session_security_version,grant_hash,issued_at,expires_at)
    values(v_trip,auth.uid(),v_device_hash,v_epoch,v_receipt.signed_grant_hash,v_receipt.issued_at,v_receipt.expires_at);
  update trip_private.trips set state='active',navigator_user_id=auth.uid(),navigator_device_hash=v_device_hash,
    version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip and state in ('ready','active');
  if not found then raise exception 'trip_not_ready'; end if;
  update trip_private.offline_grant_signing_receipts set state='consumed',consumed_at=statement_timestamp() where receipt_id=v_receipt.receipt_id;
  return jsonb_build_object('trip',trip_private.trip_command_json(v_trip),'grant',v_receipt.signed_grant);
end; $$;
alter function app_public.start_trip_with_offline_grant(text,text,text) owner to identity_service;

create or replace function app_public.get_offline_trip_queue(trip_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trip uuid; v_pending integer; v_conflict uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  select count(*),min(c.conflict_id) into v_pending,v_conflict from trip_private.trip_mutation_conflicts c where c.trip_id=v_trip and c.resolution_state='pending'
    and not exists(select 1 from trip_private.trip_conflict_resolution_receipts r where r.conflict_id=c.conflict_id);
  return case when v_pending>0 then jsonb_build_object('state','conflict','pendingCount',v_pending,'conflict',jsonb_build_object('id',v_conflict::text,'summary','A saved trip change needs your choice.'))
    else jsonb_build_object('state','empty','pendingCount',0) end;
end; $$;
alter function app_public.get_offline_trip_queue(text) owner to identity_service;

create or replace function app_public.queue_offline_trip_action(trip_id text,action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  if jsonb_typeof(action)<>'object' or action->>'kind'<>'go_action' or coalesce(action->>'stop_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'offline_action_invalid'; end if;
  return jsonb_build_object('state','blocked','pendingCount',0,'purgeReason','encrypted_runtime_required');
end; $$;
alter function app_public.queue_offline_trip_action(text,jsonb) owner to identity_service;

create or replace function app_public.resolve_trip_conflict(trip_id text,choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_conflict uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) or choice not in ('phone','saved') then raise exception 'conflict_choice_invalid'; end if;
  select c.conflict_id into v_conflict from trip_private.trip_mutation_conflicts c where c.trip_id=v_trip and c.resolution_state='pending'
    and not exists(select 1 from trip_private.trip_conflict_resolution_receipts r where r.conflict_id=c.conflict_id) order by c.created_at limit 1;
  if v_conflict is not null then
    insert into trip_private.trip_conflict_resolution_receipts(conflict_id,trip_id,actor_user_id,choice,resolution_hash)
      values(v_conflict,v_trip,auth.uid(),choice,extensions.digest(convert_to(concat_ws('|',v_conflict::text,v_trip::text,auth.uid()::text,choice),'utf8'),'sha256'));
  end if;
  return app_public.get_offline_trip_queue(trip_id);
end; $$;
alter function app_public.resolve_trip_conflict(text,text) owner to identity_service;

create or replace function app_public.purge_offline_trip(trip_id text,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_device bytea;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) or reason !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'offline_purge_invalid'; end if;
  select b.device_hash into v_device from trip_private.trip_device_bindings b where b.trip_id=v_trip and b.user_id=auth.uid() and b.state='active' limit 1;
  update trip_private.trips set navigator_user_id=null,navigator_device_hash=null where trip_private.trips.trip_id=v_trip and navigator_user_id=auth.uid();
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason=reason where trip_private.trip_device_bindings.trip_id=v_trip and user_id=auth.uid() and state='active';
  update trip_private.trip_offline_grants set state='revoked',revoked_at=statement_timestamp() where trip_private.trip_offline_grants.trip_id=v_trip and user_id=auth.uid() and state='active';
  return jsonb_build_object('state','purged','pendingCount',0,'purgeReason',reason);
end; $$;
alter function app_public.purge_offline_trip(text,text) owner to identity_service;

create or replace function app_public.replay_trip_mutations(trip_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  if exists(select 1 from trip_private.trip_mutation_conflicts c where c.trip_id=v_trip and c.resolution_state='pending'
    and not exists(select 1 from trip_private.trip_conflict_resolution_receipts r where r.conflict_id=c.conflict_id)) then raise exception 'offline_conflict_pending'; end if;
  return trip_private.trip_command_json(v_trip);
end; $$;
alter function app_public.replay_trip_mutations(text) owner to identity_service;

create or replace function app_public.get_trip_collaboration(trip_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.get_trip_collaboration(text) owner to identity_service;

create or replace function app_public.invite_trip_partner(trip_id text,verified_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_digest bytea; v_receipt trip_private.invitation_signing_receipts%rowtype;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip) or verified_email<>lower(btrim(verified_email)) or char_length(verified_email) not between 3 and 320 then raise exception 'trip_invitation_invalid'; end if;
  v_digest:=extensions.digest(convert_to(verified_email,'utf8'),'sha256');
  select * into v_receipt from trip_private.invitation_signing_receipts r where r.trip_id=v_trip and r.recipient_email_digest=v_digest and r.state='ready' and r.expires_at>statement_timestamp() order by r.issued_at desc limit 1 for update;
  if v_receipt.receipt_id is null then raise exception 'trip_invitation_receipt_unavailable'; end if;
  insert into trip_private.trip_invitations(trip_id,token_hash,recipient_email_hmac,expires_at,idempotency_key)
    values(v_trip,v_receipt.token_hash,v_digest,v_receipt.expires_at,v_receipt.provider_receipt_id);
  update trip_private.invitation_signing_receipts set state='consumed',consumed_at=statement_timestamp() where receipt_id=v_receipt.receipt_id;
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.invite_trip_partner(text,text) owner to identity_service;

create or replace function app_public.revoke_trip_invitation(trip_id text,invitation_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_invite uuid;
begin
  begin v_trip:=trip_id::uuid; v_invite:=invitation_id::uuid; exception when others then raise exception 'trip_invitation_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  update trip_private.trip_invitations set state='revoked',version=version+1 where trip_private.trip_invitations.trip_id=v_trip and trip_private.trip_invitations.invitation_id=v_invite and state='pending';
  if not found then raise exception 'trip_invitation_unavailable'; end if;
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.revoke_trip_invitation(text,text) owner to identity_service;

create or replace function app_public.accept_trip_invitation(fragment_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invite trip_private.trip_invitations%rowtype; v_digest bytea;
begin
  if not app_private.current_session_is_active() or fragment_token is null or char_length(fragment_token) not between 32 and 4096 then raise exception 'trip_invitation_invalid'; end if;
  v_digest:=trip_private.current_verified_email_digest();
  if v_digest is null then raise exception 'verified_email_required'; end if;
  select * into v_invite from trip_private.trip_invitations i where i.token_hash=extensions.digest(convert_to(fragment_token,'utf8'),'sha256') and i.recipient_email_hmac=v_digest and i.state='pending' and i.expires_at>statement_timestamp() limit 1 for update;
  if v_invite.invitation_id is null then raise exception 'trip_invitation_unavailable'; end if;
  if exists(select 1 from trip_private.trip_participants p where p.trip_id=v_invite.trip_id and p.participant_role='partner' and p.state='active') then raise exception 'trip_partner_limit'; end if;
  update trip_private.trip_invitations set state='accepted',accepted_user_id=auth.uid(),accepted_at=statement_timestamp(),version=version+1 where invitation_id=v_invite.invitation_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role) values(v_invite.trip_id,auth.uid(),'partner')
    on conflict(trip_id,user_id) do update set state='active',left_at=null,version=trip_private.trip_participants.version+1;
  return trip_private.collaboration_json(v_invite.trip_id);
end; $$;
alter function app_public.accept_trip_invitation(text) owner to identity_service;

create or replace function app_public.assign_navigator(trip_id text,participant_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_participant uuid; v_device bytea;
begin
  begin v_trip:=trip_id::uuid; v_participant:=participant_id::uuid; exception when others then raise exception 'navigator_assignment_invalid'; end;
  if not trip_private.trip_owner_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  select b.device_hash into v_device from trip_private.trip_device_bindings b where b.trip_id=v_trip and b.user_id=v_participant and b.state='active' order by b.bound_at desc limit 1;
  if v_device is null or not exists(select 1 from trip_private.trip_participants p where p.trip_id=v_trip and p.user_id=v_participant and p.state='active') then raise exception 'navigator_device_required'; end if;
  update trip_private.trips set navigator_user_id=v_participant,navigator_device_hash=v_device,version=version+1,updated_at=statement_timestamp() where trip_private.trips.trip_id=v_trip;
  return trip_private.collaboration_json(v_trip);
end; $$;
alter function app_public.assign_navigator(text,text) owner to identity_service;

create or replace function app_public.leave_trip(trip_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_trip uuid;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) or exists(select 1 from trip_private.trips t where t.trip_id=v_trip and t.owner_id=auth.uid()) then raise exception 'trip_creator_cannot_leave'; end if;
  update trip_private.trips set navigator_user_id=null,navigator_device_hash=null where trip_private.trips.trip_id=v_trip and navigator_user_id=auth.uid();
  update trip_private.trip_device_bindings set state='revoked',revoked_at=statement_timestamp(),revocation_reason='left_trip' where trip_private.trip_device_bindings.trip_id=v_trip and user_id=auth.uid() and state='active';
  update trip_private.trip_participants set state='left',left_at=statement_timestamp(),version=version+1 where trip_private.trip_participants.trip_id=v_trip and user_id=auth.uid() and participant_role='partner' and state='active';
  return found;
end; $$;
alter function app_public.leave_trip(text) owner to identity_service;

create or replace function app_public.request_check_my_day(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_version bigint; v_departure time; v_facts jsonb; v_contract uuid; v_request uuid; v_reason text;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  select t.version,t.departure_local_time into v_version,v_departure from trip_private.trips t where t.trip_id=v_trip for share;
  v_facts:=trip_private.trip_command_json(v_trip);
  select c.contract_receipt_id into v_contract from trip_private.routing_contract_receipts c where c.state='accepted' order by c.accepted_at desc limit 1;
  if v_departure is null then v_reason:='departure_required';
  elsif exists(select 1 from trip_private.trip_stops s left join app_public.stores st on st.id=s.store_id where s.trip_id=v_trip and ((s.kind='store' and st.latitude is null) or (s.kind='rest' and s.rest_latitude is null))) then v_reason:='coordinates_required';
  elsif v_contract is null then v_reason:='r01_blocked'; end if;
  insert into trip_private.check_my_day_requests(trip_id,actor_user_id,trip_version,facts,facts_hash,state,block_reason,contract_receipt_id)
    values(v_trip,auth.uid(),v_version,v_facts,extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),case when v_reason is null then 'ready' else 'blocked' end,v_reason,case when v_reason is null then v_contract else null end)
    returning request_id into v_request;
  return jsonb_build_object('requestId',v_request::text,'state',case when v_reason is null then 'ready' else 'blocked' end,'reason',v_reason);
end; $$;
alter function app_public.request_check_my_day(text) owner to identity_service;

create or replace function app_public.get_check_my_day_suggestion(request_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_request uuid; v_row trip_private.check_my_day_requests%rowtype; v_suggestion trip_private.check_my_day_suggestions%rowtype;
begin
  begin v_request:=request_id::uuid; exception when others then raise exception 'check_my_day_request_invalid'; end;
  select * into v_row from trip_private.check_my_day_requests r where r.request_id=v_request and r.actor_user_id=auth.uid();
  if v_row.request_id is null or not trip_private.trip_member_can_access(v_row.trip_id) then raise exception 'authorization_lost'; end if;
  if v_row.state='blocked' then return jsonb_build_object('requestId',v_request::text,'state','blocked','reason',v_row.block_reason); end if;
  select * into v_suggestion from trip_private.check_my_day_suggestions s where s.request_id=v_request;
  if v_suggestion.suggestion_id is null then return jsonb_build_object('requestId',v_request::text,'state',v_row.state); end if;
  if v_row.trip_version<>(select t.version from trip_private.trips t where t.trip_id=v_row.trip_id) then return jsonb_build_object('requestId',v_request::text,'state','failed','reason','trip_changed'); end if;
  return jsonb_build_object('requestId',v_request::text,'state','suggested','orderedStopIds',v_suggestion.ordered_stop_ids::text[],'explanation',v_suggestion.explanation);
end; $$;
alter function app_public.get_check_my_day_suggestion(text) owner to identity_service;

revoke all on function trip_private.collaboration_json(uuid),trip_private.current_verified_email_digest() from public,anon,authenticated;
grant execute on function app_public.start_trip_with_offline_grant(text,text,text),app_public.get_offline_trip_queue(text),app_public.queue_offline_trip_action(text,jsonb),app_public.resolve_trip_conflict(text,text),app_public.purge_offline_trip(text,text),app_public.replay_trip_mutations(text),app_public.get_trip_collaboration(text),app_public.invite_trip_partner(text,text),app_public.revoke_trip_invitation(text,text),app_public.accept_trip_invitation(text),app_public.assign_navigator(text,text),app_public.leave_trip(text),app_public.request_check_my_day(text),app_public.get_check_my_day_suggestion(text) to authenticated;
revoke create on schema trip_private from identity_service;
revoke identity_service,trip_grant_signer,trip_invitation_signer,trip_route_worker,trip_route_authorizer from postgres;
