-- ADR0008: opt-in owned shopper planning; no normal release activation.
grant internal_review_guard to postgres;
grant create on schema internal_review_private, app_public to internal_review_guard;
alter table internal_review_private.authorizations drop constraint authorizations_allowed_capabilities_check;
alter table internal_review_private.authorizations add constraint authorizations_allowed_capabilities_check
  check (allowed_capabilities in (array['catalog','session']::text[],
    array['catalog','session','shopper_planning']::text[]));

grant select on app_private.role_grants to internal_review_guard;
create policy internal_review_read_shopper_roles on app_private.role_grants for select to internal_review_guard
  using (exists(select 1 from internal_review_private.identities i where i.user_id=subject_user_id));

create function internal_review_private.planning_receipt(p_user_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select a.receipt_id from internal_review_private.authorizations a
  join internal_review_private.runtime_binding b on b.id=1
    and (b.backend_project_ref,b.source_sha,b.artifact_digest,b.configuration_digest,b.deployment_id,b.exact_origin,b.version)
      =(a.backend_project_ref,a.source_sha,a.artifact_digest,a.configuration_digest,a.deployment_id,a.exact_origin,a.runtime_version)
  where p_user_id=any(a.identity_allowlist) and 'shopper_planning'=any(a.allowed_capabilities)
    and a.revoked_at is null and a.issued_at<=statement_timestamp() and a.expires_at>statement_timestamp()
    and internal_review_private.valid_until(p_user_id) is not null
    and exists(select 1 from app_private.role_grants g where g.subject_user_id=p_user_id
      and g.role='shopper' and g.store_id is null and g.state='active')
  order by a.issued_at desc,a.receipt_id limit 1;
$$;
alter function internal_review_private.planning_receipt(uuid) owner to internal_review_guard;

create function internal_review_private.planning_path(p_path text)
returns boolean language sql immutable set search_path='' as $$
  select p_path in ('rpc/shopper_list_saved','rpc/shopper_save_state','rpc/shopper_set_save',
    'rpc/shopper_list_memories','rpc/shopper_get_memory','rpc/shopper_upsert_memory',
    'rpc/shopper_delete_memory','rpc/shopper_undo_delete_memory',
    'rpc/list_trips','rpc/get_trip','rpc/create_trip','rpc/add_trip_stop','rpc/reorder_trip_stop',
    'rpc/rename_trip','rpc/remove_trip_stop','rpc/set_trip_stop_priority','rpc/set_trip_stop_dwell',
    'rpc/update_trip_schedule');
$$;
alter function internal_review_private.planning_path(text) owner to internal_review_guard;

alter function internal_review_private.session_allowed(uuid) owner to postgres;
create or replace function internal_review_private.session_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when not internal_review_private.is_internal(p_user_id) then true else
    internal_review_private.valid_until(p_user_id) is not null
    and current_setting('request.method',true)='POST'
    and (ltrim(coalesce(current_setting('request.path',true),''),'/') in (
      'rpc/register_current_session','rpc/current_session_is_active','rpc/revoke_current_session',
      'rpc/synthetic_catalog_gateway_request','rpc/account_lifecycle_status')
      or (internal_review_private.planning_path(ltrim(coalesce(current_setting('request.path',true),''),'/'))
        and internal_review_private.planning_receipt(p_user_id) is not null)) end;
$$;
alter function internal_review_private.session_allowed(uuid) owner to internal_review_guard;

alter function app_public.internal_review_pre_request() owner to postgres;
create or replace function app_public.internal_review_pre_request()
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
  path text:=ltrim(coalesce(current_setting('request.path',true),''),'/');
  claims jsonb:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
  if not internal_review_private.is_internal(actor) then return; end if;
  if current_setting('request.method',true) is distinct from 'POST' or not exists(
    select 1 from internal_review_private.runtime_binding b where b.id=1 and b.exact_origin=headers->>'origin'
  ) then raise exception 'internal_request_denied' using errcode='42501'; end if;
  if claims->>'role'='public_catalog_gateway' and path='rpc/synthetic_catalog_gateway_request' then return; end if;
  if claims->>'role' is distinct from 'authenticated' or path='rpc/synthetic_catalog_gateway_request'
    or not coalesce(internal_review_private.session_allowed(actor),false) then
    raise exception 'internal_request_denied' using errcode='42501';
  end if;
end;
$$;
alter function app_public.internal_review_pre_request() owner to internal_review_guard;

-- Reserve each generated trip ID before its INSERT, in the same transaction.
-- The operator manifest must preauthorize bounded trip creation for these personas.
create table internal_review_private.owned_trips (
  trip_id uuid primary key,
  owner_id uuid not null references internal_review_private.identities(user_id),
  receipt_id uuid not null references internal_review_private.authorizations(receipt_id),
  created_at timestamptz not null default statement_timestamp()
);
alter table internal_review_private.owned_trips owner to internal_review_guard;
alter table internal_review_private.owned_trips enable row level security;
alter table internal_review_private.owned_trips force row level security;
revoke all on internal_review_private.owned_trips from public,anon,authenticated,service_role;
grant select on internal_review_private.owned_trips to postgres;
create policy guard_owned_trips on internal_review_private.owned_trips to internal_review_guard using(true) with check(true);
create policy operator_owned_trips on internal_review_private.owned_trips for select to postgres using(true);

create function internal_review_private.reserve_trip()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); receipt uuid;
begin
  if not internal_review_private.is_internal(actor) then return new; end if;
  receipt:=internal_review_private.planning_receipt(actor);
  if receipt is null or new.owner_id is distinct from actor
    or ltrim(coalesce(current_setting('request.path',true),''),'/')<>'rpc/create_trip'
    or current_setting('request.method',true) is distinct from 'POST' then
    raise exception 'internal_fixture_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,232));
  if (select count(*) from internal_review_private.owned_trips where owner_id=actor)>=3 then
    raise exception 'internal_trip_fixture_limit' using errcode='42501'; end if;
  insert into internal_review_private.owned_trips(trip_id,owner_id,receipt_id) values(new.trip_id,actor,receipt);
  return new;
end;
$$;
alter function internal_review_private.reserve_trip() owner to internal_review_guard;
create trigger internal_reserve_trip before insert on trip_private.trips
  for each row execute function internal_review_private.reserve_trip();

create function internal_review_private.owns_trip(p_trip_id uuid)
-- Must see the reservation inserted by the BEFORE trigger in this statement.
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from internal_review_private.owned_trips
    where trip_id=p_trip_id and owner_id=app_public.request_user_id());
$$;
alter function internal_review_private.owns_trip(uuid) owner to internal_review_guard;
create function internal_review_private.owned_store(p_store_id uuid)
returns boolean language sql immutable set search_path='' as $$
  select p_store_id in (select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
    from generate_series(1001,1012) n);
$$;
alter function internal_review_private.owned_store(uuid) owner to internal_review_guard;

-- Restrictive policies narrow existing definer access without replacing its checks.
create policy internal_planning_store_scope on app_public.stores as restrictive to identity_service
  using(not internal_review_private.is_internal(app_public.request_user_id())
    or internal_review_private.owned_store(id));
do $$ declare tab text; begin
  foreach tab in array array['saved_stores','private_store_memories','private_memory_deletions'] loop
    execute format('create policy internal_planning_scope on shopper_private.%I as restrictive to identity_service
      using(not internal_review_private.is_internal(app_public.request_user_id()) or
        (user_id=app_public.request_user_id() and internal_review_private.owned_store(store_id)
          and internal_review_private.planning_receipt(user_id) is not null))',tab);
  end loop;
end $$;
create policy internal_planning_scope on trip_private.trips as restrictive to identity_service
  using(not internal_review_private.is_internal(app_public.request_user_id()) or
    (owner_id=app_public.request_user_id() and internal_review_private.owns_trip(trip_id)
      and internal_review_private.planning_receipt(owner_id) is not null
      and state='draft' and navigator_user_id is null and navigator_device_hash is null));
create policy internal_planning_scope on trip_private.trip_stops as restrictive to identity_service
  using(not internal_review_private.is_internal(app_public.request_user_id()) or
    (internal_review_private.owns_trip(trip_id) and internal_review_private.owned_store(store_id)
      and kind='store' and state='planned'
      and internal_review_private.planning_receipt(app_public.request_user_id()) is not null));
create policy internal_planning_scope on trip_private.trip_participants as restrictive to identity_service
  using(not internal_review_private.is_internal(app_public.request_user_id()) or
    (internal_review_private.owns_trip(trip_id) and user_id=app_public.request_user_id()
      and participant_role='creator'
      and internal_review_private.planning_receipt(user_id) is not null));

revoke all on function internal_review_private.planning_receipt(uuid),internal_review_private.planning_path(text),
  internal_review_private.reserve_trip(),internal_review_private.owns_trip(uuid),internal_review_private.owned_store(uuid)
  from public,anon,authenticated,service_role;
grant execute on function internal_review_private.planning_receipt(uuid),internal_review_private.owns_trip(uuid),
  internal_review_private.owned_store(uuid) to identity_service;
revoke create on schema internal_review_private, app_public from internal_review_guard;
revoke internal_review_guard from postgres;
notify pgrst,'reload schema';
