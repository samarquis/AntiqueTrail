-- Issue #374: forward correction of verified beta history drift.
-- Apply in a reviewed preservation-aware deployment sequence BEFORE pending
-- media/correction consumers. Never relabel or modify old migration rows.
grant usage on schema extensions to review_automation;
grant usage on schema app_public to release_executor;
alter table media_private.media_uploads
 add column if not exists rejection_reason text,
 add column if not exists rejected_by uuid references auth.users(id) on delete set null,
 add column if not exists rejected_at timestamptz;

-- Replacing under the existing owner avoids attempts to rewrite role ownership.
grant identity_service to postgres;
grant create on schema app_public,partner_private to identity_service;
do $replace_owned$ declare existing_owner text; begin
 select r.rolname into existing_owner from pg_proc p join pg_roles r on r.oid=p.proowner
 where p.oid=to_regprocedure('app_public.bind_navigator_device(text,text)');
 if existing_owner is null or existing_owner not in ('postgres','identity_service') then
  raise exception 'unexpected_beta_function_owner';
 end if;
 execute format('set local role %I',existing_owner);
 execute $current_body$create or replace function app_public.bind_navigator_device(trip_id text, device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip uuid;
  v_device bytea;
  v_epoch bigint;
begin
  begin v_trip := trip_id::uuid; exception when others then raise exception 'validation_failed'; end;
  if device_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
     or not app_private.current_session_is_active()
     or not trip_private.trip_member_can_access(v_trip) then
    raise exception 'not_allowed';
  end if;
  if not exists(
    select 1 from trip_private.trips t
    where t.trip_id = v_trip
      and t.state in ('draft','ready')
      and t.navigator_user_id is distinct from app_public.request_user_id()
  ) then
    raise exception 'not_allowed';
  end if;
  select pr.session_epoch into v_epoch
    from app_private.profiles pr
    where pr.user_id = app_public.request_user_id() and pr.status = 'active';
  v_device := extensions.digest(convert_to(device_id, 'utf8'), 'sha256');
  update trip_private.trip_device_bindings b
    set state = 'revoked', revoked_at = statement_timestamp(), revocation_reason = 'device_rebound'
    where b.trip_id = v_trip and b.user_id = app_public.request_user_id() and b.state = 'active';
  update trip_private.trip_device_bindings ub
    set user_id = app_public.request_user_id(),
        state = 'active',
        revoked_at = null,
        revocation_reason = null,
        session_security_version = v_epoch,
        bound_at = statement_timestamp()
    where ub.trip_id = v_trip and ub.device_hash = v_device;
  if not found then
    insert into trip_private.trip_device_bindings(trip_id, user_id, device_hash, session_security_version)
    values (v_trip, app_public.request_user_id(), v_device, v_epoch);
  end if;
  return trip_private.collaboration_json(v_trip);
end;
$$;
$current_body$;
 reset role;
end $replace_owned$;
do $replace_owned$ declare existing_owner text; begin
 select r.rolname into existing_owner from pg_proc p join pg_roles r on r.oid=p.proowner
 where p.oid=to_regprocedure('partner_private.guard_current_partner_consent()');
 if existing_owner is null or existing_owner not in ('postgres','identity_service') then
  raise exception 'unexpected_beta_function_owner';
 end if;
 execute format('set local role %I',existing_owner);
 execute $current_body$create or replace function partner_private.guard_current_partner_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid;
begin
  if tg_table_name='listing_claims' then
    target_user := new.claimant_id;
    if tg_op='UPDATE' then
      if not old.material_reconsent_required and new.material_reconsent_required and new.state=old.state then return new; end if;
      if new.state in ('submitted','verification_pending','changes_requested','conflict','approved')
        and (not partner_private.partner_consent_is_current(target_user) or new.material_reconsent_required)
        then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
    elsif new.state in ('submitted','verification_pending','changes_requested','conflict','approved')
      and (not partner_private.partner_consent_is_current(target_user) or new.material_reconsent_required)
      then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
  else
    target_user := new.auth_user_id;
    if new.state='active' and not partner_private.partner_consent_is_current(target_user)
      then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
  end if;
  return new;
end $$;
$current_body$;
 reset role;
end $replace_owned$;
revoke create on schema app_public,partner_private from identity_service;
revoke identity_service from postgres;

-- The beta has only the obsolete four-argument correction RPC. Canonical fresh
-- installs already have the rate table; do not replay its creation there.
do $bridge$ begin
 if to_regclass('shopper_private.correction_rate_events') is null then
  execute $correction_repair$-- Package 3 correction submit rate limiting and the submitted-case audit event.
-- The submit boundary gains a required edge-provided IP HMAC, mechanical rate
-- limits, and an identity_service-owned submitted event row. The former 4-arg
-- signature is dropped so no un-rate-limited path remains callable.

grant identity_service to postgres;
grant create on schema app_public to identity_service;
grant create on schema shopper_private to identity_service;

create table shopper_private.correction_rate_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  operation text not null check (operation='correction_submit'),
  key_kind text not null check (key_kind in ('account','ip','account_store')),
  key_digest bytea not null check (octet_length(key_digest)=32),
  device_session_digest bytea not null check (octet_length(device_session_digest)=32),
  occurred_at timestamptz not null default statement_timestamp(),
  purge_after timestamptz not null default (statement_timestamp()+interval '90 days'),
  constraint correction_rate_retention check (purge_after<=occurred_at+interval '90 days')
);
create index correction_rate_window_idx on shopper_private.correction_rate_events
  (operation,key_kind,key_digest,occurred_at desc);
create index correction_rate_purge_idx on shopper_private.correction_rate_events(purge_after);
alter table shopper_private.correction_rate_events enable row level security;
alter table shopper_private.correction_rate_events force row level security;
revoke all on shopper_private.correction_rate_events from public,anon,authenticated;
grant select,insert,delete on shopper_private.correction_rate_events to identity_service;
create policy identity_service_correction_rate_events on shopper_private.correction_rate_events
  for all to identity_service using (true) with check (true);

drop function if exists app_public.shopper_submit_correction(uuid,text,text,text);

create or replace function app_public.shopper_submit_correction(
  p_store_id uuid,p_type text,p_description text,p_ip_hmac bytea,
  p_public_source_url text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  report shopper_private.store_correction_reports%rowtype;
  actor uuid:=app_public.request_user_id(); now_at timestamptz:=statement_timestamp();
  session_value text:=app_public.request_jwt()->>'session_id';
  session_digest bytea; account_digest bytea; account_store_digest bytea;
  kinds text[]; digests bytea[]; limits integer[]; windows interval[];
  index_value integer; event_count bigint; oldest_event timestamptz;
  retry_seconds integer:=0; lock_value text;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if actor is null or not app_private.current_session_is_active() or nullif(session_value,'') is null
    or octet_length(p_ip_hmac)<>32 then
    raise exception using errcode='42501', message='correction_rate_context_unavailable';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  session_digest:=extensions.digest(convert_to('correction-device:'||session_value,'UTF8'),'sha256');
  account_digest:=extensions.digest(convert_to('correction-account:'||actor::text,'UTF8'),'sha256');
  account_store_digest:=extensions.digest(account_digest||convert_to(p_store_id::text,'UTF8'),'sha256');
  kinds:=array['account','ip','account_store'];
  digests:=array[account_digest,p_ip_hmac,account_store_digest];
  limits:=array[5,20,2]; windows:=array[interval '1 day',interval '1 day',interval '1 day'];
  for lock_value in select distinct kinds[i]||':'||encode(digests[i],'hex')
    from generate_subscripts(kinds,1) i order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_value,0));
  end loop;
  delete from shopper_private.correction_rate_events where purge_after<=now_at;
  for index_value in 1..array_length(kinds,1) loop
    select count(*),min(occurred_at) into event_count,oldest_event
      from shopper_private.correction_rate_events
      where operation='correction_submit' and key_kind=kinds[index_value]
        and key_digest=digests[index_value] and occurred_at>now_at-windows[index_value];
    if event_count>=limits[index_value] then
      retry_seconds:=least(extract(epoch from windows[index_value])::integer,
        greatest(1,ceil(extract(epoch from (oldest_event+windows[index_value]-now_at)))::integer));
      raise exception using errcode='42900', message='correction_rate_limited',
        detail=jsonb_build_object('retryAfter',retry_seconds)::text;
    end if;
  end loop;
  insert into shopper_private.store_correction_reports(
    reporter_user_id,store_id,correction_type,description,public_source_url
  ) values(
    actor,p_store_id,p_type,btrim(p_description),nullif(btrim(p_public_source_url),'')
  ) returning * into report;
  for index_value in 1..array_length(kinds,1) loop
    insert into shopper_private.correction_rate_events(
      operation,key_kind,key_digest,device_session_digest
    ) values ('correction_submit',kinds[index_value],digests[index_value],session_digest);
  end loop;
  insert into shopper_private.correction_case_events(
    report_id,actor_user_id,event_kind,to_state,idempotency_key
  ) values (
    report.report_id,actor,'submitted','submitted','submitted:'||report.report_id::text
  ) on conflict (report_id,idempotency_key) do nothing;
  return jsonb_build_object('id',report.report_id,'state',report.state);
end; $$;

alter function app_public.shopper_submit_correction(uuid,text,text,bytea,text) owner to identity_service;
revoke all on function app_public.shopper_submit_correction(uuid,text,text,bytea,text) from public, anon;
grant execute on function app_public.shopper_submit_correction(uuid,text,text,bytea,text) to authenticated;

revoke create on schema app_public from identity_service;
revoke create on schema shopper_private from identity_service;
revoke identity_service from postgres;$correction_repair$;
 elsif to_regprocedure('app_public.shopper_submit_correction(uuid,text,text,bytea,text)') is null
    or to_regprocedure('app_public.shopper_submit_correction(uuid,text,text,text)') is not null then
  raise exception 'unexpected_beta_correction_contract';
 end if;
end $bridge$;
