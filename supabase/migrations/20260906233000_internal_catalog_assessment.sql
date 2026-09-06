-- ADR0008: staged catalog/session assessment only. No runtime is activated here.
create schema internal_review_private;
revoke all on schema internal_review_private from public, anon, authenticated;
create role internal_review_guard nologin noinherit nosuperuser nobypassrls;
grant internal_review_guard to postgres;
grant usage, create on schema internal_review_private to internal_review_guard;

create table internal_review_private.runtime_binding (
  id smallint primary key check (id = 1),
  backend_project_ref text not null check (backend_project_ref = 'ykyrvqddgnfmgftjwpts'),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  artifact_digest text not null check (artifact_digest ~ '^[0-9a-f]{64}$'),
  configuration_digest text not null check (configuration_digest ~ '^[0-9a-f]{64}$'),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  exact_origin text not null check (exact_origin ~ '^https://antique-trail-[a-z0-9]+-scott-marquis-projects\.vercel\.app$'),
  verified_by text not null check (verified_by = 'product-reset-task'),
  verified_at timestamptz not null,
  version bigint not null check (version > 0)
);

-- This tombstone survives authorization removal and Auth-user deletion.
create table internal_review_private.identities (
  user_id uuid primary key,
  alias text not null unique check (alias in (
    'shopper-a','shopper-b','representative-a','representative-b',
    'administrator-a','navigator-a','revoked-a')),
  fixture_namespace text not null check (fixture_namespace = 'review-reset-20260906'),
  controlled_address text not null unique check (
    controlled_address = alias || '@review-reset-20260906.invalid'),
  created_at timestamptz not null default statement_timestamp()
);

create table internal_review_private.authorizations (
  receipt_id uuid primary key,
  schema_version integer not null check (schema_version = 1),
  context text not null check (context = 'internal_synthetic_assessment'),
  owner_decision_reference text not null check (length(owner_decision_reference) between 10 and 500),
  issuer_role text not null check (issuer_role = 'product_owner'),
  executor_task_id text not null check (executor_task_id = '01a07739-9f14-73c0-8253-2da0e5576afe'),
  teardown_owner text not null check (teardown_owner = 'product-reset-task'),
  backend_project_ref text not null check (backend_project_ref = 'ykyrvqddgnfmgftjwpts'),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  artifact_digest text not null check (artifact_digest ~ '^[0-9a-f]{64}$'),
  configuration_digest text not null check (configuration_digest ~ '^[0-9a-f]{64}$'),
  deployment_id text not null check (deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
  exact_origin text not null,
  runtime_version bigint not null,
  fixture_manifest_digest text not null check (fixture_manifest_digest ~ '^[0-9a-f]{64}$'),
  identity_allowlist uuid[] not null check (cardinality(identity_allowlist) between 1 and 3
    and array_position(identity_allowlist, null) is null),
  -- Further capabilities need their own reviewed server implementation.
  allowed_capabilities text[] not null check (allowed_capabilities = array['catalog','session']::text[]),
  excluded_provider_actions text[] not null check (excluded_provider_actions =
    array['email','external_participants','media','routing','payments','public_activation']::text[]),
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at and expires_at <= issued_at + interval '24 hours'),
  revoked_at timestamptz,
  revocation_reason text,
  check ((revoked_at is null and revocation_reason is null) or
    (revoked_at is not null and length(revocation_reason) between 1 and 240))
);

create table internal_review_private.cleanup_queue (
  receipt_id uuid primary key references internal_review_private.authorizations(receipt_id),
  due_at timestamptz not null,
  completed_at timestamptz
);

alter table internal_review_private.runtime_binding owner to internal_review_guard;
alter table internal_review_private.identities owner to internal_review_guard;
alter table internal_review_private.authorizations owner to internal_review_guard;
alter table internal_review_private.cleanup_queue owner to internal_review_guard;
alter table internal_review_private.runtime_binding enable row level security;
alter table internal_review_private.runtime_binding force row level security;
alter table internal_review_private.identities enable row level security;
alter table internal_review_private.identities force row level security;
alter table internal_review_private.authorizations enable row level security;
alter table internal_review_private.authorizations force row level security;
alter table internal_review_private.cleanup_queue enable row level security;
alter table internal_review_private.cleanup_queue force row level security;
create policy guard_binding on internal_review_private.runtime_binding to internal_review_guard using (true) with check (true);
create policy guard_identities on internal_review_private.identities to internal_review_guard using (true) with check (true);
create policy guard_authorizations on internal_review_private.authorizations to internal_review_guard using (true) with check (true);
create policy guard_cleanup on internal_review_private.cleanup_queue to internal_review_guard using (true) with check (true);
revoke all on all tables in schema internal_review_private from public, anon, authenticated, service_role;
grant usage on schema internal_review_private to postgres, identity_service, synthetic_catalog_automation;
grant all on all tables in schema internal_review_private to postgres;
create policy operator_binding on internal_review_private.runtime_binding to postgres using (true) with check (true);
create policy operator_identities on internal_review_private.identities to postgres using (true) with check (true);
create policy operator_authorizations on internal_review_private.authorizations to postgres using (true) with check (true);
create policy operator_cleanup on internal_review_private.cleanup_queue to postgres using (true) with check (true);

create function internal_review_private.preserve_authorization()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'identities' or tg_op = 'DELETE' then
    raise exception 'internal_identity_or_authorization_immutable' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['revoked_at','revocation_reason']) is distinct from
     (to_jsonb(old) - array['revoked_at','revocation_reason']) or
     old.revoked_at is not null then
    raise exception 'internal_authorization_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger immutable_internal_identity before update or delete on internal_review_private.identities
  for each row execute function internal_review_private.preserve_authorization();
create trigger immutable_internal_authorization before update or delete on internal_review_private.authorizations
  for each row execute function internal_review_private.preserve_authorization();

create function internal_review_private.prepare_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into internal_review_private.cleanup_queue(receipt_id, due_at)
    values (new.receipt_id, coalesce(new.revoked_at, new.expires_at))
    on conflict (receipt_id) do update set due_at = least(
      internal_review_private.cleanup_queue.due_at, excluded.due_at);
  return new;
end;
$$;
alter function internal_review_private.prepare_cleanup() owner to internal_review_guard;
create trigger queue_internal_cleanup after insert or update on internal_review_private.authorizations
  for each row execute function internal_review_private.prepare_cleanup();

create function internal_review_private.is_internal(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from internal_review_private.runtime_binding)
    or exists(select 1 from internal_review_private.identities where user_id = p_user_id);
$$;
alter function internal_review_private.is_internal(uuid) owner to internal_review_guard;

create function internal_review_private.valid_until(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(a.expires_at)
  from internal_review_private.authorizations a
  join internal_review_private.runtime_binding b on b.id = 1
    and b.backend_project_ref = a.backend_project_ref and b.source_sha = a.source_sha
    and b.artifact_digest = a.artifact_digest and b.configuration_digest = a.configuration_digest
    and b.deployment_id = a.deployment_id and b.exact_origin = a.exact_origin
    and b.version = a.runtime_version
  join internal_review_private.identities i on i.user_id = p_user_id
    and i.user_id = any(a.identity_allowlist)
    and i.alias in ('shopper-a','shopper-b','revoked-a')
  where a.revoked_at is null and a.issued_at <= statement_timestamp()
    and a.expires_at > statement_timestamp() and b.verified_at <= statement_timestamp()
    and exists(select 1 from pg_catalog.pg_roles r where r.rolname = 'authenticator'
      and r.rolconfig @> array['pgrst.db_pre_request=app_public.internal_review_pre_request']);
$$;
alter function internal_review_private.valid_until(uuid) owner to internal_review_guard;

create function internal_review_private.session_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when not internal_review_private.is_internal(p_user_id) then true else
    internal_review_private.valid_until(p_user_id) is not null
    and ltrim(coalesce(current_setting('request.path', true), ''), '/') in (
      'rpc/register_current_session','rpc/current_session_is_active',
      'rpc/revoke_current_session','rpc/synthetic_catalog_gateway_request')
    and coalesce(current_setting('request.method', true), '') = 'POST'
  end;
$$;
alter function internal_review_private.session_allowed(uuid) owner to internal_review_guard;

grant create on schema app_public to internal_review_guard;
create function app_public.internal_review_pre_request()
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := app_public.request_user_id();
  request_path text := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if not internal_review_private.is_internal(actor) then return; end if;
  if current_setting('request.method', true) is distinct from 'POST' or not exists(
    select 1 from internal_review_private.runtime_binding b where b.id = 1
      and b.exact_origin = headers->>'origin'
  ) then raise exception 'internal_request_denied' using errcode = '42501'; end if;
  -- This credential is server-only; the catalog RPC independently verifies its actor/session.
  if claims->>'role' = 'public_catalog_gateway' and
    request_path = 'rpc/synthetic_catalog_gateway_request' then return; end if;
  if claims->>'role' is distinct from 'authenticated' or
    request_path not in ('rpc/register_current_session','rpc/current_session_is_active','rpc/revoke_current_session') or
    internal_review_private.valid_until(actor) is null then
    raise exception 'internal_request_denied' using errcode = '42501';
  end if;
end;
$$;
grant usage on schema app_public to internal_review_guard;
grant execute on function app_public.request_user_id() to internal_review_guard;
alter function app_public.internal_review_pre_request() owner to internal_review_guard;
revoke create on schema app_public from internal_review_guard;
revoke all on function app_public.internal_review_pre_request() from public;
grant execute on function app_public.internal_review_pre_request() to anon, authenticated, public_catalog_gateway;

create function internal_review_private.revoke_authorization(p_receipt_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare users uuid[];
begin
  if p_reason is null or length(p_reason) not between 1 and 240 then
    raise exception 'internal_revocation_reason_invalid';
  end if;
  select identity_allowlist into users from internal_review_private.authorizations
    where receipt_id = p_receipt_id for update;
  if users is null then raise exception 'internal_authorization_missing'; end if;
  update internal_review_private.authorizations set revoked_at = statement_timestamp(), revocation_reason = p_reason
    where receipt_id = p_receipt_id and revoked_at is null;
  update app_private.active_sessions set state = 'revoked', revoked_at = statement_timestamp(),
    revocation_reason = 'internal_review_revoked', version = version + 1
    where user_id = any(users) and state in ('active','cancellation_only');
end;
$$;
grant usage on schema app_private to internal_review_guard;
grant select, update on app_private.active_sessions to internal_review_guard;
create policy internal_review_revoke_sessions on app_private.active_sessions to internal_review_guard
  using (exists(select 1 from internal_review_private.identities i where i.user_id = active_sessions.user_id))
  with check (exists(select 1 from internal_review_private.identities i where i.user_id = active_sessions.user_id));
alter function internal_review_private.revoke_authorization(uuid,text) owner to internal_review_guard;
revoke all on all functions in schema internal_review_private from public, anon, authenticated, service_role;
grant execute on function internal_review_private.is_internal(uuid),
  internal_review_private.valid_until(uuid), internal_review_private.session_allowed(uuid)
  to identity_service, synthetic_catalog_automation;
grant execute on function internal_review_private.revoke_authorization(uuid,text) to postgres;
revoke create on schema internal_review_private from internal_review_guard;
revoke internal_review_guard from postgres;

-- Intended PostgREST role, not table access or release-stage activation.
grant public_catalog_gateway to authenticator;
notify pgrst, 'reload schema';

-- Replace in place: preserve function OIDs used by existing RLS policies.
grant identity_service, synthetic_catalog_automation to postgres;
grant create on schema app_private, app_public to identity_service;
grant create on schema app_public to synthetic_catalog_automation;
alter function app_private.current_session_is_active() owner to postgres;
create or replace function app_private.current_session_is_active()
returns boolean language sql stable security definer set search_path='' as $$
  select app_public.request_user_id() is not null
    and nullif(current_setting('request.jwt.claims',true),'') is not null
    and internal_review_private.session_allowed(app_public.request_user_id())
    and exists(
      select 1 from app_private.profiles p
      join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
      where p.user_id=app_public.request_user_id() and p.status='active' and s.state='active'
        and s.session_id=app_private.claim_session_id()
        and s.provider_created_at is not null
        and (s.access_token_expires_at is null or s.access_token_expires_at>statement_timestamp())
        and (p.sessions_revoked_before is null or s.provider_created_at>p.sessions_revoked_before)
    );
$$;
alter function app_private.current_session_is_active() owner to identity_service;
alter function app_public.register_current_session(bigint) owner to postgres;
create or replace function app_public.register_current_session(access_token_expires_at bigint)
returns boolean language plpgsql security definer set search_path='' as $body$
declare
  v_actor uuid:=app_public.request_user_id();
  v_session uuid:=app_private.claim_session_id();
  v_epoch bigint; v_expires timestamptz; v_provider_created timestamptz; v_revoked_before timestamptz;
begin
  if v_actor is null or v_session is null then raise exception 'authentication_required'; end if;
  if not internal_review_private.session_allowed(v_actor) then raise exception 'internal_request_denied' using errcode='42501'; end if;
  if access_token_expires_at<=(extract(epoch from statement_timestamp())*1000)::bigint
    or access_token_expires_at>(extract(epoch from statement_timestamp()+interval '24 hours')*1000)::bigint
    then raise exception 'session_expiry_invalid'; end if;
  v_expires:=to_timestamp(access_token_expires_at::numeric/1000);
  if internal_review_private.is_internal(v_actor) then
    v_expires:=least(v_expires,internal_review_private.valid_until(v_actor));
  end if;
  v_provider_created:=app_private.provider_session_created_at(v_session,v_actor);
  if v_provider_created is null then raise exception 'provider_session_unavailable'; end if;
  select session_epoch,sessions_revoked_before into v_epoch,v_revoked_before
    from app_private.profiles where user_id=v_actor and status='active' for update;
  if v_epoch is null then raise exception 'account_unavailable'; end if;
  if not exists(select 1 from app_private.role_grants
    where subject_user_id=v_actor and role='shopper' and state='active') then raise exception 'admission_required'; end if;
  if v_revoked_before is not null and v_provider_created<=v_revoked_before then raise exception 'provider_session_revoked'; end if;
  insert into app_private.active_sessions(
    session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
  ) values(v_session,v_actor,v_provider_created,v_epoch,'active',v_provider_created,v_expires)
  on conflict (session_id) do update set
    access_token_expires_at=excluded.access_token_expires_at,
    version=app_private.active_sessions.version+1
  where app_private.active_sessions.user_id=excluded.user_id
    and app_private.active_sessions.session_epoch=excluded.session_epoch
    and app_private.active_sessions.provider_created_at=excluded.provider_created_at
    and app_private.active_sessions.state='active';
  return app_private.current_session_is_active();
end
$body$;
alter function app_public.register_current_session(bigint) owner to identity_service;
alter function app_private.current_session_is_cancellation_only() owner to postgres;
create or replace function app_private.current_session_is_cancellation_only()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select app_public.request_user_id() is not null
    and not internal_review_private.is_internal(app_public.request_user_id()) and exists (
    select 1 from app_private.profiles p
    join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
    where p.user_id=app_public.request_user_id() and p.status='deletion_scheduled' and s.state='cancellation_only'
      and s.session_id=app_private.claim_session_id()
      and (s.access_token_expires_at is null or s.access_token_expires_at > statement_timestamp())
  );
$$;
alter function app_private.current_session_is_cancellation_only() owner to identity_service;
alter function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) owner to postgres;
create or replace function app_public.synthetic_catalog_gateway_request(
  p_key_hash text,p_user_id uuid,p_session_id uuid,p_operation text,p_args jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_internal boolean := internal_review_private.is_internal(p_user_id);
  v_stage app_private.runtime_stage;
  v_hash bytea;
  v_window timestamptz;
  v_count integer;
  v_limit integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
    or p_operation not in ('list','details','map')
    or jsonb_typeof(p_args)<>'object'
    or (p_operation='list' and p_args-array['p_q','p_category','p_area']<>'{}'::jsonb)
    or (p_operation='details' and p_args-array['p_slug']<>'{}'::jsonb)
    or (p_operation='map' and p_args ? 'p_zoom' and p_args-array[
      'p_q','p_category','p_area','p_open_now','p_visited','p_saved','p_claimed',
      'p_max_area_centroid_miles','p_state','p_north','p_south','p_east','p_west',
      'p_zoom','p_limit','p_actor_user_id'
    ]<>'{}'::jsonb)
    or (p_operation='map' and not p_args ? 'p_zoom' and p_args-array[
      'p_q','p_category','p_area','p_north','p_south','p_east','p_west','p_limit'
    ]<>'{}'::jsonb)
  then raise exception 'gateway_request_invalid'; end if;

  select stage into v_stage from app_private.environment_stage where id=1;
  if v_stage is distinct from 'synthetic_alpha' then
    raise exception 'synthetic_catalog_outside_stage';
  end if;
  if p_operation='map' then
    raise exception 'synthetic_catalog_map_disabled' using errcode='42501';
  end if;

  if v_internal then
    if internal_review_private.valid_until(p_user_id) is null
      or not internal_review_private.session_allowed(p_user_id) then
      raise exception 'synthetic_catalog_forbidden' using errcode='42501';
    end if;
  elsif not exists(
    select 1
    from app_private.environment_stage e
    join app_private.account_registration_config c on c.id=1
    join app_private.registration_quarantine_latch q on q.id=1
    where e.id=1 and e.stage='synthetic_alpha' and e.receipt_id is not null
      and e.capabilities @> '{"private_auth":true}'::jsonb
      and c.mode='receipt_only' and c.stage_receipt_id=e.receipt_id
      and q.state='open'
  ) then raise exception 'synthetic_catalog_evidence_invalid' using errcode='42501'; end if;

  if p_user_id is null or p_session_id is null
    or not app_private.gateway_session_is_active(p_user_id,p_session_id) or not exists(
    select 1
    from app_private.profiles p
    join app_private.role_grants g
      on g.subject_user_id=p.user_id and g.role='shopper' and g.state='active' and g.store_id is null
    where p.user_id=p_user_id and p.status='active'
  ) then raise exception 'synthetic_catalog_forbidden' using errcode='42501'; end if;

  v_hash:=decode(p_key_hash,'hex');
  v_window:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
  v_limit:=case p_operation when 'details' then 120 else 60 end;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash||p_operation||v_window::text,0));
  insert into release_private.public_catalog_rate_windows(key_hash,operation,window_start,request_count)
    values(v_hash,p_operation,v_window,1)
    on conflict(key_hash,operation,window_start) do update
      set request_count=release_private.public_catalog_rate_windows.request_count+1
    returning request_count into v_count;
  if v_count>v_limit then raise exception 'catalog_rate_limited'; end if;

  if p_operation='list' then
    return coalesce((select jsonb_agg(x) from app_public.catalog_list(
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x where not v_internal or x.id in (
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
      from generate_series(1001,1012) n)),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(x) from app_public.catalog_details(
    p_args->>'p_slug') x where not v_internal or x.id in (
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
      from generate_series(1001,1012) n)),'[]'::jsonb);
end;
$$;
alter function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) owner to synthetic_catalog_automation;
revoke create on schema app_private, app_public from identity_service;
revoke create on schema app_public from synthetic_catalog_automation;
revoke identity_service, synthetic_catalog_automation from postgres;
