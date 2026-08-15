-- Package 2A: server-owned identity, session, role, capability, and audit boundary.
-- External auth/provider calls and account admission are deliberately owned by Package 2B.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'identity_service') then
    create role identity_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;
grant identity_service to postgres;
grant usage on schema app_private to postgres;
grant usage on schema app_private to identity_service;
grant create on schema app_private to identity_service;

create type app_private.account_status as enum ('active','suspended','deletion_pending','deleted');
create type app_private.session_state as enum ('active','revoked','expired');
create type app_private.app_role as enum ('shopper','representative','administrator');
create type app_private.grant_state as enum ('active','revoked','expired');
create type app_private.runtime_stage as enum ('synthetic_alpha','private_beta','regional_public');

create table app_private.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  verified_email_snapshot text,
  public_display_name text,
  age_18_attested_at timestamptz,
  status app_private.account_status not null default 'active',
  last_authenticated_at timestamptz,
  session_epoch bigint not null default 1,
  sessions_revoked_before timestamptz,
  deletion_due_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1,
  constraint profiles_session_epoch_positive check (session_epoch > 0),
  constraint profiles_version_positive check (version > 0),
  constraint profiles_display_name_safe check (public_display_name is null or (public_display_name = btrim(public_display_name) and char_length(public_display_name) between 1 and 80 and public_display_name !~ '[[:cntrl:]]')),
  constraint profiles_email_snapshot_safe check (verified_email_snapshot is null or (verified_email_snapshot = lower(btrim(verified_email_snapshot)) and char_length(verified_email_snapshot) between 3 and 320 and verified_email_snapshot !~ '[[:cntrl:]]')),
  constraint profiles_deletion_shape check ((status <> 'deletion_pending' and deletion_due_at is null) or (status = 'deletion_pending' and deletion_due_at is not null))
);

create table app_private.active_sessions (
  session_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_created_at timestamptz,
  session_epoch bigint not null,
  state app_private.session_state not null default 'active',
  created_at timestamptz not null default statement_timestamp(),
  last_authenticated_at timestamptz not null default statement_timestamp(),
  mfa_verified_at timestamptz,
  access_token_expires_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  version bigint not null default 1,
  constraint sessions_epoch_positive check (session_epoch > 0),
  constraint sessions_version_positive check (version > 0),
  constraint sessions_revocation_shape check ((state = 'active' and revoked_at is null) or (state <> 'active' and revoked_at is not null)),
  constraint sessions_reason_shape check (revocation_reason is null or (char_length(btrim(revocation_reason)) between 1 and 160 and revocation_reason !~ '[[:cntrl:]]'))
);
create index active_sessions_user_state_idx on app_private.active_sessions(user_id, state);

create table app_private.role_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  role app_private.app_role not null,
  store_id uuid references app_public.stores(id) on delete restrict,
  state app_private.grant_state not null default 'active',
  granted_by uuid references auth.users(id) on delete restrict,
  granted_at timestamptz not null default statement_timestamp(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text,
  version bigint not null default 1,
  constraint role_grants_version_positive check (version > 0),
  constraint role_grants_store_scope check ((role in ('shopper','administrator') and store_id is null) or (role = 'representative' and store_id is not null)),
  constraint role_grants_revocation_shape check ((state = 'active' and revoked_at is null and revoked_by is null) or (state <> 'active' and revoked_at is not null)),
  constraint role_grants_reason_shape check (revocation_reason is null or (char_length(btrim(revocation_reason)) between 1 and 240 and revocation_reason !~ '[[:cntrl:]]'))
);
create unique index one_active_shopper_grant on app_private.role_grants(subject_user_id) where role='shopper' and state='active';
create unique index one_active_role_scope on app_private.role_grants(subject_user_id, role, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)) where state='active';
create index role_grants_subject_state_idx on app_private.role_grants(subject_user_id, state);
create index role_grants_store_scope_idx on app_private.role_grants(store_id, state) where role='representative';

create table app_private.environment_stage (
  id smallint primary key default 1 check (id = 1),
  stage app_private.runtime_stage not null default 'synthetic_alpha',
  capabilities jsonb not null default '{"private_auth":false,"shopper_private":false,"representative_portal":false,"administrator":false}'::jsonb,
  changed_by uuid references auth.users(id) on delete restrict,
  receipt_id uuid,
  version bigint not null default 1,
  changed_at timestamptz not null default statement_timestamp(),
  constraint environment_version_positive check (version > 0),
  constraint environment_capabilities_object check (jsonb_typeof(capabilities) = 'object')
);

create table app_private.session_security_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id uuid references app_private.active_sessions(session_id) on delete set null,
  event_kind text not null,
  outcome text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  reason_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint session_event_kind_safe check (event_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint session_event_outcome_safe check (outcome in ('allowed','denied','revoked','expired','rotated')),
  constraint session_event_reason_safe check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint session_event_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table app_private.privileged_audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  session_id uuid references app_private.active_sessions(session_id) on delete set null,
  actor_role app_private.app_role,
  action text not null,
  outcome text not null,
  resource_kind text not null,
  resource_id uuid,
  reason_code text,
  payload_hash bytea,
  previous_hash bytea,
  event_hash bytea not null,
  occurred_at timestamptz not null default statement_timestamp(),
  retention_until date not null default (current_date + 730),
  constraint audit_action_safe check (action ~ '^[a-z][a-z0-9_]{1,95}$'),
  constraint audit_outcome_safe check (outcome in ('allowed','denied','requested','revoked','completed','failed')),
  constraint audit_resource_safe check (resource_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint audit_reason_safe check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint audit_payload_hash_size check (payload_hash is null or octet_length(payload_hash) = 32),
  constraint audit_hash_sizes check (octet_length(event_hash) = 32 and (previous_hash is null or octet_length(previous_hash) = 32)),
  constraint audit_retention_two_years check (retention_until >= (occurred_at::date + 730))
);
create index privileged_audit_actor_idx on app_private.privileged_audit_events(actor_user_id, occurred_at desc);
create index privileged_audit_subject_idx on app_private.privileged_audit_events(subject_user_id, occurred_at desc);
grant usage, select on sequence app_private.privileged_audit_events_sequence_no_seq to identity_service;

create table app_private.audit_chain_roots (
  root_id uuid primary key default extensions.gen_random_uuid(),
  through_sequence_no bigint not null unique,
  root_hash bytea not null,
  anchored_at timestamptz,
  anchor_provider text,
  created_at timestamptz not null default statement_timestamp(),
  constraint audit_root_hash_size check (octet_length(root_hash) = 32),
  constraint audit_root_anchor_shape check ((anchored_at is null and anchor_provider is null) or (anchored_at is not null and anchor_provider is not null))
);

create table app_private.denied_attempt_outbox (
  attempt_id uuid primary key default extensions.gen_random_uuid(),
  occurred_at timestamptz not null default statement_timestamp(),
  actor_user_id uuid references auth.users(id) on delete set null,
  session_id uuid references app_private.active_sessions(session_id) on delete set null,
  action text not null,
  resource_kind text not null,
  reason_code text not null,
  dedupe_key text not null unique,
  delivered_at timestamptz,
  constraint denied_action_safe check (action ~ '^[a-z][a-z0-9_]{1,95}$'),
  constraint denied_resource_safe check (resource_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint denied_reason_safe check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$')
);

insert into app_private.environment_stage (id) values (1) on conflict (id) do nothing;

-- Hash-chain every privileged event. The trigger locks the latest row so concurrent
-- writers cannot fork the chain. No payload, token, or private text is persisted.
create or replace function app_private.hash_privileged_audit_event()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
declare last_hash bytea;
begin
  select event_hash into last_hash from app_private.privileged_audit_events order by sequence_no desc limit 1 for update;
  new.previous_hash := last_hash;
  new.event_hash := extensions.digest(
    concat_ws('|', new.sequence_no::text, new.event_id::text, coalesce(new.actor_user_id::text,''), coalesce(new.subject_user_id::text,''), coalesce(new.session_id::text,''), coalesce(new.actor_role::text,''), new.action, new.outcome, new.resource_kind, coalesce(new.resource_id::text,''), coalesce(new.reason_code,''), coalesce(encode(new.payload_hash,'hex'),''), coalesce(encode(new.previous_hash,'hex'),''), new.occurred_at::text, new.retention_until::text),
    'sha256'
  );
  return new;
end; $$;
create trigger privileged_audit_hash before insert on app_private.privileged_audit_events
for each row execute function app_private.hash_privileged_audit_event();

create or replace function app_private.reject_audit_mutation()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
begin raise exception 'privileged_audit_append_only'; end; $$;
create trigger privileged_audit_no_update before update or delete on app_private.privileged_audit_events
for each row execute function app_private.reject_audit_mutation();

create or replace function app_private.claim_session_id()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, app_private as $$
declare raw text;
begin
  raw := nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id'), '');
  if raw is null or raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  return raw::uuid;
exception when others then return null;
end; $$;
alter function app_private.claim_session_id() owner to identity_service;

create or replace function app_private.current_session_is_active()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select app_public.request_user_id() is not null
    and nullif(current_setting('request.jwt.claims', true), '') is not null
    and exists (
      select 1 from app_private.profiles p
      join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
      where p.user_id=app_public.request_user_id() and p.status='active' and s.state='active'
        and s.session_id=app_private.claim_session_id()
        and (s.access_token_expires_at is null or s.access_token_expires_at > statement_timestamp())
        and (p.sessions_revoked_before is null or s.created_at > p.sessions_revoked_before)
    );
$$;
alter function app_private.current_session_is_active() owner to identity_service;

create or replace function app_private.current_session_recent_auth(p_window interval default interval '15 minutes')
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select app_private.current_session_is_active() and exists (
    select 1 from app_private.active_sessions s
    where s.session_id=app_private.claim_session_id()
      and s.last_authenticated_at >= statement_timestamp() - p_window
  );
$$;
alter function app_private.current_session_recent_auth(interval) owner to identity_service;

create or replace function app_private.current_session_has_mfa()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select app_private.current_session_is_active() and exists (
    select 1 from app_private.active_sessions s
    where s.session_id=app_private.claim_session_id()
      and s.mfa_verified_at is not null
  );
$$;
alter function app_private.current_session_has_mfa() owner to identity_service;

create or replace function app_private.current_user_has_role(p_role app_private.app_role, p_store_id uuid default null)
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select app_private.current_session_is_active() and exists (
    select 1 from app_private.role_grants g
    where g.subject_user_id=app_public.request_user_id() and g.role=p_role and g.state='active'
      and (g.store_id is not distinct from p_store_id)
  );
$$;
alter function app_private.current_user_has_role(app_private.app_role,uuid) owner to identity_service;
revoke identity_service from postgres;
revoke usage on schema app_private from postgres;
revoke create on schema app_private from identity_service;

grant execute on function app_private.current_session_is_active() to anon, authenticated;
grant execute on function app_private.current_session_recent_auth(interval) to authenticated;
grant execute on function app_private.current_session_has_mfa() to authenticated;
grant execute on function app_private.current_user_has_role(app_private.app_role,uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','active_sessions','role_grants','environment_stage','session_security_events','privileged_audit_events','audit_chain_roots','denied_attempt_outbox'] loop
    execute format('alter table app_private.%I enable row level security',t);
    execute format('alter table app_private.%I force row level security',t);
    execute format('revoke all on app_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert on app_private.%I to identity_service',t);
  end loop;
end $$;
revoke update, delete, truncate on app_private.privileged_audit_events from identity_service;
revoke update, delete, truncate on app_private.audit_chain_roots from identity_service;
revoke update, delete, truncate on app_private.denied_attempt_outbox from identity_service;

create policy identity_service_profiles on app_private.profiles for all to identity_service using (true) with check (true);
create policy identity_service_sessions on app_private.active_sessions for all to identity_service using (true) with check (true);
create policy identity_service_role_grants on app_private.role_grants for all to identity_service using (true) with check (true);
create policy identity_service_stage on app_private.environment_stage for all to identity_service using (true) with check (true);
create policy identity_service_session_events on app_private.session_security_events for all to identity_service using (true) with check (true);
create policy identity_service_audit_read on app_private.privileged_audit_events for select to identity_service using (true);
create policy identity_service_audit on app_private.privileged_audit_events for insert to identity_service with check (true);
create policy identity_service_roots on app_private.audit_chain_roots for insert to identity_service with check (true);
create policy identity_service_denied on app_private.denied_attempt_outbox for insert to identity_service with check (true);

-- The application roles may call only boolean gates; no private table or audit grants.
