-- L-01 content-free audit anchoring. External delivery is disabled by default.
-- Local Synthetic-only work remains available; every shared/external privileged
-- role check fails closed unless the separately administered anchor is current.

grant identity_service to postgres;
grant create on schema app_private,app_public to identity_service;

do $$ begin
  if not exists(select 1 from pg_roles where rolname='beta_automation') then
    create role beta_automation nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant beta_automation to postgres;

create table app_private.audit_anchor_capability (
  id smallint primary key default 1 check(id=1),
  deployment_environment text not null default 'local'
    check(deployment_environment in ('local','shared_alpha','private_beta','regional_public')),
  state text not null default 'disabled' check(state in ('disabled','open')),
  provider_key text,
  provider_version text,
  contract_receipt_id text,
  watchdog_state text not null default 'disabled' check(watchdog_state in ('disabled','current','stale')),
  watchdog_checked_at timestamptz,
  last_ack_sequence bigint not null default 0 check(last_ack_sequence>=0),
  last_ack_root bytea,
  last_ack_at timestamptz,
  changed_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check(version>0),
  constraint audit_anchor_open_shape check(
    state<>'open' or (
      deployment_environment<>'local'
      and provider_key ~ '^[a-z][a-z0-9_-]{1,63}$'
      and char_length(provider_version) between 1 and 64
      and contract_receipt_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    )
  ),
  constraint audit_anchor_ack_shape check(
    (last_ack_sequence=0 and last_ack_root is null and last_ack_at is null)
    or (last_ack_sequence>0 and octet_length(last_ack_root)=32 and last_ack_at is not null)
  )
);
insert into app_private.audit_anchor_capability(id) values(1) on conflict(id) do nothing;

create table app_private.audit_anchor_outbox (
  anchor_id uuid primary key default extensions.gen_random_uuid(),
  environment text not null check(environment in ('shared_alpha','private_beta','regional_public')),
  schema_version text not null default 'audit-anchor/v1' check(schema_version='audit-anchor/v1'),
  through_sequence_no bigint not null unique check(through_sequence_no>0),
  root_hash bytea not null check(octet_length(root_hash)=32),
  idempotency_key text not null unique,
  state text not null default 'pending'
    check(state in ('pending','leased','retry_wait','acknowledged')),
  lease_token uuid,
  lease_owner uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check(attempt_count>=0),
  next_attempt_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  acknowledged_at timestamptz,
  constraint audit_anchor_idempotency_shape check(
    idempotency_key=environment||':'||schema_version||':'||through_sequence_no||':'||encode(root_hash,'hex')
  ),
  constraint audit_anchor_lease_shape check(
    (state='leased' and lease_token is not null and lease_owner is not null and lease_expires_at is not null)
    or (state<>'leased' and lease_token is null and lease_owner is null and lease_expires_at is null)
  ),
  constraint audit_anchor_retry_shape check(
    (state='retry_wait' and next_attempt_at is not null and last_error_code is not null)
    or state<>'retry_wait'
  ),
  constraint audit_anchor_acknowledgement_shape check(
    (state='acknowledged' and acknowledged_at is not null)
    or (state<>'acknowledged' and acknowledged_at is null)
  ),
  constraint audit_anchor_error_safe check(
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{1,63}$'
  )
);
create index audit_anchor_claim_idx on app_private.audit_anchor_outbox(state,next_attempt_at,lease_expires_at,through_sequence_no);

alter table app_private.audit_anchor_capability enable row level security;
alter table app_private.audit_anchor_capability force row level security;
alter table app_private.audit_anchor_outbox enable row level security;
alter table app_private.audit_anchor_outbox force row level security;
revoke all on app_private.audit_anchor_capability,app_private.audit_anchor_outbox
  from public,anon,authenticated,service_role;
grant select,insert,update on app_private.audit_anchor_capability,app_private.audit_anchor_outbox
  to identity_service;
create policy identity_service_audit_anchor_capability on app_private.audit_anchor_capability
  for all to identity_service using(true) with check(true);
create policy identity_service_audit_anchor_outbox on app_private.audit_anchor_outbox
  for all to identity_service using(true) with check(true);
create policy identity_service_audit_chain_roots_read on app_private.audit_chain_roots
  for select to identity_service using(true);

create or replace function app_private.privileged_anchor_is_current()
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when c.deployment_environment='local' then
      c.state='disabled'
      and exists(select 1 from app_private.environment_stage e where e.id=1 and e.stage='synthetic_alpha')
    else
      c.state='open'
      and c.watchdog_state='current'
      and c.last_ack_at>=statement_timestamp()-interval '24 hours'
      and c.last_ack_sequence=(select coalesce(max(a.sequence_no),0) from app_private.privileged_audit_events a)
  end
  from app_private.audit_anchor_capability c where c.id=1;
$$;
alter function app_private.privileged_anchor_is_current() owner to identity_service;
revoke all on function app_private.privileged_anchor_is_current() from public,anon,authenticated,service_role;
grant execute on function app_private.privileged_anchor_is_current() to identity_service,beta_automation;

create or replace function app_public.prepare_audit_anchor()
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.audit_anchor_capability%rowtype;
  sequence_number bigint; event_root bytea; derived_root bytea; anchor app_private.audit_anchor_outbox%rowtype;
begin
  select * into capability from app_private.audit_anchor_capability where id=1 for update;
  if capability.deployment_environment='local' then
    return jsonb_build_object('state','local_only');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('audit-anchor-root-v1',0));
  select sequence_no,event_hash into sequence_number,event_root
    from app_private.privileged_audit_events order by sequence_no desc limit 1;
  if sequence_number is null then return jsonb_build_object('state','empty'); end if;
  derived_root:=extensions.digest(convert_to(concat_ws('|','audit-anchor/v1',capability.deployment_environment,
    sequence_number,encode(event_root,'hex')),'utf8'),'sha256');
  insert into app_private.audit_chain_roots(through_sequence_no,root_hash)
    values(sequence_number,derived_root) on conflict(through_sequence_no) do nothing;
  if not exists(select 1 from app_private.audit_chain_roots
    where through_sequence_no=sequence_number and root_hash=derived_root) then
    raise exception using errcode='55000',message='audit_anchor_root_conflict';
  end if;
  insert into app_private.audit_anchor_outbox(environment,through_sequence_no,root_hash,idempotency_key)
    values(capability.deployment_environment,sequence_number,derived_root,
      capability.deployment_environment||':audit-anchor/v1:'||sequence_number||':'||encode(derived_root,'hex'))
    on conflict(through_sequence_no) do update set updated_at=app_private.audit_anchor_outbox.updated_at
    returning * into anchor;
  if anchor.environment<>capability.deployment_environment or anchor.root_hash<>derived_root then
    raise exception using errcode='55000',message='audit_anchor_outbox_conflict';
  end if;
  return jsonb_build_object('state',anchor.state,'sequence',anchor.through_sequence_no);
end;
$$;
alter function app_public.prepare_audit_anchor() owner to identity_service;

create or replace function app_public.audit_anchor_watchdog(p_now timestamptz)
returns text language plpgsql security definer set search_path='' as $$
declare capability app_private.audit_anchor_capability%rowtype; next_state text;
begin
  select * into capability from app_private.audit_anchor_capability where id=1 for update;
  next_state:=case
    when capability.state='disabled' then 'disabled'
    when capability.last_ack_at is not null and capability.last_ack_at>=p_now-interval '24 hours'
      and capability.last_ack_sequence=(select coalesce(max(sequence_no),0) from app_private.privileged_audit_events)
      then 'current'
    else 'stale'
  end;
  update app_private.audit_anchor_capability set watchdog_state=next_state,watchdog_checked_at=p_now,
    version=version+1 where id=1;
  return next_state;
end;
$$;
alter function app_public.audit_anchor_watchdog(timestamptz) owner to identity_service;

create or replace function app_public.claim_audit_anchor(p_worker_id uuid,p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare capability app_private.audit_anchor_capability%rowtype; anchor app_private.audit_anchor_outbox%rowtype; token uuid;
begin
  if p_worker_id is null then raise exception using errcode='22023',message='audit_anchor_claim_invalid'; end if;
  select * into capability from app_private.audit_anchor_capability where id=1 for update;
  if capability.state<>'open' or capability.deployment_environment='local' then return null; end if;
  select * into anchor from app_private.audit_anchor_outbox
    where (state='pending')
      or (state='retry_wait' and next_attempt_at<=p_now)
      or (state='leased' and lease_expires_at<=p_now)
    order by through_sequence_no limit 1 for update skip locked;
  if anchor.anchor_id is null then return null; end if;
  token:=extensions.gen_random_uuid();
  update app_private.audit_anchor_outbox set state='leased',lease_token=token,lease_owner=p_worker_id,
    lease_expires_at=p_now+interval '2 minutes',attempt_count=attempt_count+1,next_attempt_at=null,
    last_error_code=null,updated_at=p_now where anchor_id=anchor.anchor_id returning * into anchor;
  return jsonb_build_object(
    'leaseToken',token,
    'payload',jsonb_build_object(
      'environment',anchor.environment,
      'schema',anchor.schema_version,
      'sequence',anchor.through_sequence_no,
      'root',encode(anchor.root_hash,'hex'),
      'idempotencyKey',anchor.idempotency_key
    )
  );
end;
$$;
alter function app_public.claim_audit_anchor(uuid,timestamptz) owner to identity_service;

create or replace function app_public.acknowledge_audit_anchor(
  p_idempotency_key text,p_lease_token uuid,p_acknowledged_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare capability app_private.audit_anchor_capability%rowtype; anchor app_private.audit_anchor_outbox%rowtype;
begin
  select * into capability from app_private.audit_anchor_capability where id=1 for update;
  select * into anchor from app_private.audit_anchor_outbox where idempotency_key=p_idempotency_key for update;
  if anchor.anchor_id is null then raise exception using errcode='22023',message='audit_anchor_ack_invalid'; end if;
  if anchor.state='acknowledged' then return true; end if;
  if anchor.state<>'leased' or anchor.lease_token<>p_lease_token or anchor.lease_expires_at<p_acknowledged_at then
    raise exception using errcode='55000',message='audit_anchor_lease_lost';
  end if;
  update app_private.audit_anchor_outbox set state='acknowledged',lease_token=null,lease_owner=null,
    lease_expires_at=null,acknowledged_at=p_acknowledged_at,updated_at=p_acknowledged_at
    where anchor_id=anchor.anchor_id;
  if anchor.through_sequence_no>=capability.last_ack_sequence then
    update app_private.audit_anchor_capability set last_ack_sequence=anchor.through_sequence_no,
      last_ack_root=anchor.root_hash,last_ack_at=p_acknowledged_at,watchdog_state='current',
      watchdog_checked_at=p_acknowledged_at,version=version+1 where id=1;
  end if;
  return true;
end;
$$;
alter function app_public.acknowledge_audit_anchor(text,uuid,timestamptz) owner to identity_service;

create or replace function app_public.fail_audit_anchor(
  p_idempotency_key text,p_lease_token uuid,p_now timestamptz,p_error_code text
) returns boolean language plpgsql security definer set search_path='' as $$
declare anchor app_private.audit_anchor_outbox%rowtype; retry_seconds integer;
begin
  if p_error_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode='22023',message='audit_anchor_failure_invalid';
  end if;
  select * into anchor from app_private.audit_anchor_outbox where idempotency_key=p_idempotency_key for update;
  if anchor.anchor_id is null or anchor.state<>'leased' or anchor.lease_token<>p_lease_token then
    raise exception using errcode='55000',message='audit_anchor_lease_lost';
  end if;
  retry_seconds:=least(3600,30*(2^least(anchor.attempt_count,7))::integer);
  update app_private.audit_anchor_outbox set state='retry_wait',lease_token=null,lease_owner=null,
    lease_expires_at=null,next_attempt_at=p_now+make_interval(secs=>retry_seconds),
    last_error_code=p_error_code,updated_at=p_now where anchor_id=anchor.anchor_id;
  return true;
end;
$$;
alter function app_public.fail_audit_anchor(text,uuid,timestamptz,text) owner to identity_service;

-- This is the single shared/external privilege gate. Shopper authorization is
-- unchanged; representative and administrator checks inherit L-01 centrally.
create or replace function app_private.current_user_has_role(
  p_role app_private.app_role,p_store_id uuid default null
) returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_session_is_active()
    and (p_role='shopper'::app_private.app_role or app_private.privileged_anchor_is_current())
    and exists(
      select 1 from app_private.role_grants g
      where g.subject_user_id=app_public.request_user_id() and g.role=p_role and g.state='active'
        and g.store_id is not distinct from p_store_id
    );
$$;
alter function app_private.current_user_has_role(app_private.app_role,uuid) owner to identity_service;

-- Prevent internal/security-definer code from bypassing the role-check seam by
-- writing an active privileged grant directly. Safety revocations remain possible.
create or replace function app_private.guard_privileged_role_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare privileged boolean; activating boolean;
begin
  privileged:=case tg_table_schema||'.'||tg_table_name
    when 'app_private.role_grants' then new.role in ('representative','administrator')
    when 'partner_private.store_partner_grants' then new.role='representative'
    else false
  end;
  activating:=new.state='active' and (tg_op='INSERT' or old.state<>'active');
  if privileged and activating and not app_private.privileged_anchor_is_current() then
    raise exception using errcode='42501',message='privileged_anchor_stale';
  end if;
  return new;
end;
$$;
alter function app_private.guard_privileged_role_activation() owner to identity_service;
revoke all on function app_private.guard_privileged_role_activation() from public,anon,authenticated,service_role;
create trigger role_grant_anchor_guard before insert or update on app_private.role_grants
  for each row execute function app_private.guard_privileged_role_activation();
create trigger partner_grant_anchor_guard before insert or update on partner_private.store_partner_grants
  for each row execute function app_private.guard_privileged_role_activation();

revoke all on function app_public.prepare_audit_anchor(),app_public.audit_anchor_watchdog(timestamptz),
  app_public.claim_audit_anchor(uuid,timestamptz),app_public.acknowledge_audit_anchor(text,uuid,timestamptz),
  app_public.fail_audit_anchor(text,uuid,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function app_public.prepare_audit_anchor(),app_public.audit_anchor_watchdog(timestamptz),
  app_public.claim_audit_anchor(uuid,timestamptz),app_public.acknowledge_audit_anchor(text,uuid,timestamptz),
  app_public.fail_audit_anchor(text,uuid,timestamptz,text) to service_role;

revoke create on schema app_private,app_public from identity_service;
revoke identity_service from postgres;
