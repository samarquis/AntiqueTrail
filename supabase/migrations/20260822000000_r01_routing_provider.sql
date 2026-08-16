-- R-01: fail-closed provider-neutral routing/geocoding operational boundary.
-- This migration records configuration fields, not provider claims. Activation
-- requires externally verified Provider R and routing-contract receipts.

create schema if not exists routing_private;
revoke all on schema routing_private from public, anon, authenticated;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='routing_automation') then
    create role routing_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='routing_provider_service') then
    create role routing_provider_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='routing_deployment_service') then
    create role routing_deployment_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='routing_monitor_service') then
    create role routing_monitor_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant routing_automation,routing_provider_service,routing_deployment_service,routing_monitor_service to postgres;
grant usage on schema routing_private to routing_automation,routing_provider_service,routing_deployment_service,routing_monitor_service;
grant create on schema routing_private to routing_automation;
grant create on schema app_public to routing_automation;

create table routing_private.provider_config (
  singleton boolean primary key default true check(singleton),
  state text not null default 'blocked' check(state in ('blocked','accepted','revoked')),
  gate_receipt_id uuid references release_private.release_gate_receipts(gate_receipt_id) on delete restrict,
  contract_receipt_id uuid references trip_private.routing_contract_receipts(contract_receipt_id) on delete restrict,
  processing_region text,
  provider_retention_minutes integer check(provider_retention_minutes between 0 and 525600),
  auth_method text check(auth_method is null or auth_method ~ '^[a-z][a-z0-9_-]{1,63}$'),
  provider_version text,
  attribution text,
  max_daily_requests integer check(max_daily_requests between 1 and 100000),
  max_daily_cost_units numeric(14,4) check(max_daily_cost_units>=0),
  max_cost_per_call numeric(14,4) check(max_cost_per_call>=0),
  timeout_ms integer check(timeout_ms between 100 and 30000),
  replacement_path text,
  config_digest text check(config_digest is null or config_digest ~ '^sha256:[0-9a-f]{64}$'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1 check(version>0),
  constraint provider_config_complete check(
    state<>'accepted' or (gate_receipt_id is not null and contract_receipt_id is not null and
      char_length(btrim(processing_region)) between 2 and 120 and provider_retention_minutes is not null and
      auth_method is not null and char_length(btrim(provider_version)) between 1 and 128 and
      char_length(btrim(attribution)) between 1 and 240 and max_daily_requests is not null and
      max_daily_cost_units is not null and max_cost_per_call is not null and timeout_ms is not null and
      char_length(btrim(replacement_path)) between 1 and 240 and config_digest is not null and accepted_at is not null and revoked_at is null)
  )
);
insert into routing_private.provider_config default values;

create table routing_private.quota_latch (
  singleton boolean primary key default true check(singleton),
  state text not null default 'blocked' check(state in ('blocked','open','paused')),
  window_start date not null default current_date,
  request_count integer not null default 0 check(request_count>=0),
  cost_units numeric(14,4) not null default 0 check(cost_units>=0),
  pause_reason text,
  version bigint not null default 1 check(version>0)
);
insert into routing_private.quota_latch default values;

create table routing_private.operations (
  operation_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  operation_kind text not null check(operation_kind in ('matrix','geocode')),
  state text not null check(state in ('reserved','calling','reconciliation_required','settled_ok','settled_failure')),
  point_count smallint not null check(point_count between 0 and 10),
  outcome text check(outcome is null or outcome in ('ok','timeout','quota','revoked','outage','temporary_market','no_route')),
  provider_operation_id text check(provider_operation_id is null or provider_operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  provider_version text,
  attribution text,
  request_count integer not null default 0 check(request_count between 0 and 8),
  cost_units numeric(14,4) not null default 0 check(cost_units>=0),
  created_at timestamptz not null default statement_timestamp(),
  deadline_at timestamptz not null,
  settled_at timestamptz
);
create index routing_operations_retention_idx on routing_private.operations(settled_at) where settled_at is not null;

create table routing_private.audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  operation_id uuid,
  action text not null check(action ~ '^[a-z][a-z0-9_]{1,63}$'),
  outcome text not null check(outcome ~ '^[a-z][a-z0-9_]{1,63}$'),
  previous_hash bytea,
  event_hash bytea not null check(octet_length(event_hash)=32),
  occurred_at timestamptz not null default statement_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['provider_config','quota_latch','operations','audit_events'] loop
    execute format('alter table routing_private.%I enable row level security',t);
    execute format('alter table routing_private.%I force row level security',t);
    execute format('alter table routing_private.%I owner to routing_automation',t);
    execute format('revoke all on routing_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
grant select,insert,update,delete on routing_private.operations to routing_automation;
grant select,update on routing_private.provider_config,routing_private.quota_latch to routing_automation;
grant select,insert on routing_private.audit_events to routing_automation;
create policy routing_automation_config on routing_private.provider_config for all to routing_automation using(true) with check(true);
create policy routing_automation_latch on routing_private.quota_latch for all to routing_automation using(true) with check(true);
create policy routing_automation_operations on routing_private.operations for all to routing_automation using(true) with check(true);
create policy routing_automation_audit on routing_private.audit_events for select to routing_automation using(true);
create policy routing_automation_audit_insert on routing_private.audit_events for insert to routing_automation with check(true);

create function routing_private.append_audit(p_operation uuid,p_action text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare v_previous bytea; v_time timestamptz:=statement_timestamp();
begin
  perform pg_advisory_xact_lock(52001);
  select event_hash into v_previous from routing_private.audit_events order by sequence_no desc limit 1;
  insert into routing_private.audit_events(operation_id,action,outcome,previous_hash,event_hash,occurred_at)
  values(p_operation,p_action,p_outcome,v_previous,extensions.digest(convert_to(concat_ws('|',coalesce(v_previous::text,''),coalesce(p_operation::text,''),p_action,p_outcome,v_time::text),'utf8'),'sha256'),v_time);
end $$;
alter function routing_private.append_audit(uuid,text,text) owner to routing_automation;
revoke all on function routing_private.append_audit(uuid,text,text) from public,anon,authenticated;

create function routing_private.capability_open()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from routing_private.provider_config c
    join routing_private.quota_latch q on q.singleton
    join release_private.release_gate_receipts g on g.gate_receipt_id=c.gate_receipt_id
    join trip_private.routing_contract_receipts r on r.contract_receipt_id=c.contract_receipt_id
    join app_private.environment_stage e on e.id=1
    where c.singleton and c.state='accepted' and q.state='open' and g.gate_kind='provider_r'
      and g.external_verified and r.state='accepted' and r.provider_version=c.provider_version
      and r.attribution=c.attribution and coalesce((e.capabilities->>'routing_geocoding')::boolean,false)
      and e.stage in ('private_beta','regional_public')
  );
$$;
alter function routing_private.capability_open() owner to postgres;
revoke all on function routing_private.capability_open() from public,anon,authenticated;

create function app_public.routing_get_capability()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',routing_private.capability_open(),'reason',case when routing_private.capability_open() then null else 'r01_blocked' end);
$$;
alter function app_public.routing_get_capability() owner to postgres;
revoke all on function app_public.routing_get_capability() from public;
grant execute on function app_public.routing_get_capability() to anon,authenticated;

create function app_public.routing_reserve_operation(
  p_kind text,p_idempotency uuid,p_explicit boolean,p_point_count integer,p_coordinates jsonb default null,p_return_index integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing routing_private.operations%rowtype; v_latch routing_private.quota_latch%rowtype; v_config routing_private.provider_config%rowtype; v_threshold integer; v_cost_threshold numeric;
begin
  if not app_private.current_session_is_active() then raise exception using errcode='42501',message='authorization_lost'; end if;
  if not p_explicit or p_kind not in ('matrix','geocode') then return jsonb_build_object('state','blocked','reason','revoked'); end if;
  select * into v_existing from routing_private.operations where idempotency_key=p_idempotency;
  if found then
    if v_existing.state='calling' then
      update routing_private.operations set state='reconciliation_required' where operation_id=v_existing.operation_id;
      return jsonb_build_object('state','reconciliation_required','operationId',v_existing.operation_id);
    elsif v_existing.state in ('reserved','reconciliation_required') then
      return jsonb_build_object('state',v_existing.state,'operationId',v_existing.operation_id);
    else
      return jsonb_build_object('state','blocked','reason','revoked');
    end if;
  end if;
  if p_kind='matrix' then
    if p_point_count not between 2 and 10 or jsonb_typeof(p_coordinates)<>'array' or jsonb_array_length(p_coordinates)<>p_point_count
      or exists(select 1 from jsonb_array_elements(p_coordinates) c where c<>jsonb_strip_nulls(jsonb_build_object('latitude',c->'latitude','longitude',c->'longitude'))
        or jsonb_typeof(c->'latitude')<>'number' or jsonb_typeof(c->'longitude')<>'number'
        or (c->>'latitude')::numeric not between -90 and 90 or (c->>'longitude')::numeric not between -180 and 180)
      or (p_return_index is not null and (p_return_index<>p_point_count-1 or p_return_index<1)) then
      return jsonb_build_object('state','blocked','reason','revoked');
    end if;
    if exists(
      select 1 from jsonb_array_elements(p_coordinates) with ordinality c(value,ordinality)
      where ordinality>1 and (p_return_index is null or ordinality-1<>p_return_index)
        and not exists(select 1 from app_public.stores s where s.publication_state='active' and s.latitude=round((c.value->>'latitude')::numeric,5) and s.longitude=round((c.value->>'longitude')::numeric,5))
    ) then return jsonb_build_object('state','blocked','reason','revoked'); end if;
  elsif p_point_count<>0 or p_coordinates is not null or p_return_index is not null then
    return jsonb_build_object('state','blocked','reason','revoked');
  end if;
  select * into v_config from routing_private.provider_config where singleton for update;
  select * into v_latch from routing_private.quota_latch where singleton for update;
  if v_latch.window_start<current_date then update routing_private.quota_latch set window_start=current_date,request_count=0,cost_units=0,state=case when v_config.state='accepted' then 'open' else 'blocked' end,pause_reason=null,version=version+1 where singleton; select * into v_latch from routing_private.quota_latch where singleton; end if;
  if not routing_private.capability_open() then return jsonb_build_object('state','blocked','reason',case when v_latch.state='paused' and v_latch.pause_reason='quota' then 'quota' else 'r01_blocked' end); end if;
  v_threshold:=floor(v_config.max_daily_requests*0.75); v_cost_threshold:=v_config.max_daily_cost_units*0.75;
  if v_latch.request_count+1>v_threshold or v_latch.cost_units+v_config.max_cost_per_call>v_cost_threshold then
    update routing_private.quota_latch set state='paused',pause_reason='quota',version=version+1 where singleton;
    perform routing_private.append_audit(null,'quota_latch','quota');
    return jsonb_build_object('state','blocked','reason','quota');
  end if;
  update routing_private.quota_latch set request_count=request_count+1,cost_units=cost_units+v_config.max_cost_per_call,version=version+1 where singleton;
  insert into routing_private.operations(idempotency_key,operation_kind,state,point_count,request_count,cost_units,deadline_at)
  values(p_idempotency,p_kind,'reserved',p_point_count,1,v_config.max_cost_per_call,statement_timestamp()+make_interval(secs=>v_config.timeout_ms/1000.0)) returning * into v_existing;
  perform routing_private.append_audit(v_existing.operation_id,'reserve','allowed');
  return jsonb_build_object('state','reserved','operationId',v_existing.operation_id);
end $$;
alter function app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer) owner to postgres;
revoke all on function app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer) from public,anon;
grant execute on function app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer) to authenticated;

create function app_public.routing_begin_operation(p_operation uuid,p_idempotency uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v routing_private.operations%rowtype;
begin
  select * into v from routing_private.operations where operation_id=p_operation and idempotency_key=p_idempotency for update;
  if v.operation_id is null then return jsonb_build_object('state','blocked','reason','revoked'); end if;
  if v.state='reconciliation_required' then return jsonb_build_object('state','reconciliation_required'); end if;
  if v.state<>'reserved' or not routing_private.capability_open() then return jsonb_build_object('state','blocked','reason','r01_blocked'); end if;
  update routing_private.operations set state='calling' where operation_id=p_operation;
  perform routing_private.append_audit(p_operation,'provider_call','allowed');
  return jsonb_build_object('state','calling');
end $$;
alter function app_public.routing_begin_operation(uuid,uuid) owner to postgres;
revoke all on function app_public.routing_begin_operation(uuid,uuid) from public,anon,authenticated;
grant execute on function app_public.routing_begin_operation(uuid,uuid) to routing_provider_service;

create function app_public.routing_settle_operation(
  p_operation uuid,p_idempotency uuid,p_outcome text,p_provider_operation_id text,p_provider_version text,p_attribution text,p_request_count integer,p_cost_units numeric
) returns void language plpgsql security definer set search_path='' as $$
declare v routing_private.operations%rowtype; c routing_private.provider_config%rowtype;
begin
  select * into v from routing_private.operations where operation_id=p_operation and idempotency_key=p_idempotency for update;
  select * into c from routing_private.provider_config where singleton;
  if v.operation_id is null or v.state not in ('calling','reconciliation_required') or p_outcome not in ('ok','timeout','quota','revoked','outage','temporary_market','no_route','unknown')
    or p_request_count not between 0 and 8 or p_cost_units<0 or p_cost_units>c.max_cost_per_call
    or (p_provider_version is not null and p_provider_version<>c.provider_version) or (p_attribution is not null and p_attribution<>c.attribution) then raise exception 'routing_settlement_invalid'; end if;
  update routing_private.operations set state=case when p_outcome='unknown' then 'reconciliation_required' when p_outcome='ok' then 'settled_ok' else 'settled_failure' end,
    outcome=case when p_outcome='unknown' then null else p_outcome end,provider_operation_id=p_provider_operation_id,provider_version=p_provider_version,
    attribution=p_attribution,request_count=p_request_count,cost_units=p_cost_units,settled_at=case when p_outcome='unknown' then null else statement_timestamp() end where operation_id=p_operation;
  update routing_private.quota_latch set cost_units=greatest(0,cost_units-c.max_cost_per_call+p_cost_units),
    state=case when p_outcome in ('quota','revoked') then 'paused' else state end,
    pause_reason=case when p_outcome in ('quota','revoked') then p_outcome else pause_reason end,version=version+1 where singleton;
  perform routing_private.append_audit(p_operation,'settle',case when p_outcome='unknown' then 'reconciliation_required' else p_outcome end);
end $$;
alter function app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric) owner to postgres;
revoke all on function app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric) from public,anon,authenticated;
grant execute on function app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric) to routing_provider_service;

create function app_public.routing_accept_provider_config(
  p_gate uuid,p_contract uuid,p_region text,p_retention integer,p_auth_method text,p_daily_requests integer,p_daily_cost numeric,p_call_cost numeric,p_timeout integer,p_replacement_path text,p_config_digest text
) returns void language plpgsql security definer set search_path='' as $$
declare r trip_private.routing_contract_receipts%rowtype;
begin
  select c.* into r from trip_private.routing_contract_receipts c join release_private.release_gate_receipts g on g.gate_receipt_id=p_gate
    where c.contract_receipt_id=p_contract and c.state='accepted' and g.gate_kind='provider_r' and g.external_verified;
  if r.contract_receipt_id is null or p_daily_requests<1 or p_daily_cost<0 or p_call_cost<0 or p_timeout<>r.timeout_ms
    or char_length(btrim(p_region)) not between 2 and 120 or p_retention not between 0 and 525600
    or p_auth_method !~ '^[a-z][a-z0-9_-]{1,63}$' or char_length(btrim(p_replacement_path)) not between 1 and 240
    or p_config_digest !~ '^sha256:[0-9a-f]{64}$' then raise exception 'routing_provider_evidence_invalid'; end if;
  update routing_private.provider_config set state='accepted',gate_receipt_id=p_gate,contract_receipt_id=p_contract,processing_region=btrim(p_region),provider_retention_minutes=p_retention,
    auth_method=p_auth_method,provider_version=r.provider_version,attribution=r.attribution,max_daily_requests=p_daily_requests,max_daily_cost_units=p_daily_cost,
    max_cost_per_call=p_call_cost,timeout_ms=p_timeout,replacement_path=btrim(p_replacement_path),config_digest=p_config_digest,accepted_at=statement_timestamp(),revoked_at=null,version=version+1 where singleton;
  update routing_private.quota_latch set state='open',window_start=current_date,request_count=0,cost_units=0,pause_reason=null,version=version+1 where singleton;
  perform routing_private.append_audit(null,'provider_config','accepted');
end $$;
alter function app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text) owner to postgres;
revoke all on function app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text) from public,anon,authenticated;
grant execute on function app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text) to routing_deployment_service;

create function app_public.routing_revoke_provider(p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_reason !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'routing_revocation_invalid'; end if;
  update routing_private.provider_config set state='revoked',revoked_at=statement_timestamp(),version=version+1 where singleton;
  update routing_private.quota_latch set state='blocked',pause_reason='revoked',version=version+1 where singleton;
  perform routing_private.append_audit(null,'provider_config','revoked');
end $$;
alter function app_public.routing_revoke_provider(text) owner to postgres;
revoke all on function app_public.routing_revoke_provider(text) from public,anon,authenticated;
grant execute on function app_public.routing_revoke_provider(text) to routing_deployment_service;

create function app_public.routing_purge_operations(p_now timestamptz default statement_timestamp(),p_limit integer default 500)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  with doomed as (select operation_id from routing_private.operations where settled_at<p_now-interval '90 days' order by settled_at limit least(greatest(p_limit,1),1000))
  delete from routing_private.operations o using doomed d where o.operation_id=d.operation_id;
  get diagnostics n=row_count; return n;
end $$;
alter function app_public.routing_purge_operations(timestamptz,integer) owner to postgres;
revoke all on function app_public.routing_purge_operations(timestamptz,integer) from public,anon,authenticated;
grant execute on function app_public.routing_purge_operations(timestamptz,integer) to routing_monitor_service;

-- Remove the legacy raw route response persistence surface. The digest is
-- operational evidence; provider requests/responses remain transient.
alter table trip_private.check_my_day_route_runs drop constraint route_run_matrix_hash;
alter table trip_private.check_my_day_route_runs add column response_digest bytea;
update trip_private.check_my_day_route_runs set response_digest=matrix_hash;
alter table trip_private.check_my_day_route_runs alter column response_digest set not null;
alter table trip_private.check_my_day_route_runs add constraint route_run_response_digest check(octet_length(response_digest)=32);
alter table trip_private.check_my_day_route_runs drop column matrix,drop column matrix_hash;

create or replace function app_public.request_check_my_day(trip_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_trip uuid; v_version bigint; v_departure time; v_facts jsonb; v_contract uuid; v_request uuid; v_reason text;
begin
  begin v_trip:=trip_id::uuid; exception when others then raise exception 'trip_id_invalid'; end;
  if not trip_private.trip_member_can_access(v_trip) then raise exception 'authorization_lost'; end if;
  select t.version,t.departure_local_time into v_version,v_departure from trip_private.trips t where t.trip_id=v_trip for share;
  select jsonb_build_object('stops',coalesce(jsonb_agg(jsonb_build_object('id',s.stop_id::text) order by s.position),'[]'::jsonb))
    into v_facts from trip_private.trip_stops s where s.trip_id=v_trip;
  select c.contract_receipt_id into v_contract from trip_private.routing_contract_receipts c where c.state='accepted' order by c.accepted_at desc limit 1;
  if v_departure is null then v_reason:='departure_required';
  elsif exists(select 1 from trip_private.trip_stops s left join app_public.stores st on st.id=s.store_id where s.trip_id=v_trip and ((s.kind='store' and st.latitude is null) or (s.kind='rest' and s.rest_latitude is null))) then v_reason:='coordinates_required';
  elsif v_contract is null or not routing_private.capability_open() then v_reason:='r01_blocked'; end if;
  insert into trip_private.check_my_day_requests(trip_id,actor_user_id,trip_version,facts,facts_hash,state,block_reason,contract_receipt_id)
    values(v_trip,app_public.request_user_id(),v_version,v_facts,extensions.digest(convert_to(v_facts::text,'utf8'),'sha256'),case when v_reason is null then 'ready' else 'blocked' end,v_reason,case when v_reason is null then v_contract else null end)
    returning request_id into v_request;
  return jsonb_build_object('requestId',v_request::text,'state',case when v_reason is null then 'ready' else 'blocked' end,'reason',v_reason);
end $$;
alter function app_public.request_check_my_day(text) owner to postgres;

create or replace function trip_private.record_check_my_day_suggestion(
  target_request_id uuid,provider_version text,attribution text,request_count integer,
  cost_units numeric,matrix jsonb,generated_at timestamptz,ordered_stop_ids uuid[],explanation jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
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
  insert into trip_private.check_my_day_route_runs(request_id,provider_version,attribution,request_count,cost_units,response_digest,generated_at)
    values(target_request_id,provider_version,attribution,request_count,cost_units,extensions.digest(convert_to(matrix::text,'utf8'),'sha256'),generated_at);
  insert into trip_private.check_my_day_suggestions(request_id,ordered_stop_ids,explanation,suggestion_hash)
    values(target_request_id,ordered_stop_ids,explanation,extensions.digest(convert_to(jsonb_build_object('orderedStopIds',ordered_stop_ids,'explanation',explanation)::text,'utf8'),'sha256')) returning suggestion_id into v_suggestion;
  update trip_private.check_my_day_requests set state='suggested' where request_id=target_request_id;
  return v_suggestion;
end $$;
alter function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) owner to postgres;
revoke all on function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) from public,anon,authenticated;
grant execute on function trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamptz,uuid[],jsonb) to trip_route_worker;

revoke create on schema routing_private from routing_automation;
revoke create on schema app_public from routing_automation;
revoke routing_automation,routing_provider_service,routing_deployment_service,routing_monitor_service from postgres;
