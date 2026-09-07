-- Issue #252: recovery is a dedicated, content-free server operation.
-- The Edge handler supplies the subject/session only after verifyOtp succeeds.
grant identity_service to postgres;
grant create, usage on schema app_public to identity_service;

create table app_private.password_recovery_operations (
  operation_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  recovery_session_id uuid not null,
  state text not null check (state in ('invalidated','provider_pending','completed','uncertain')),
  created_at timestamptz not null default statement_timestamp(),
  invalidated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check (version > 0),
  constraint password_recovery_completion_shape check (
    (state = 'completed' and completed_at is not null) or
    (state <> 'completed' and completed_at is null)
  )
);
alter table app_private.password_recovery_operations enable row level security;
alter table app_private.password_recovery_operations force row level security;
revoke all on app_private.password_recovery_operations from public, anon, authenticated, service_role;
grant select, insert, update on app_private.password_recovery_operations to identity_service;
create policy identity_service_password_recovery_operations on app_private.password_recovery_operations
  for all to identity_service using (true) with check (true);

grant update on app_private.provider_revocation_outbox to identity_service;

create or replace function app_public.password_recovery_status(p_request_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select coalesce(
    (select state from app_private.password_recovery_operations where idempotency_key=p_request_id),
    'unknown'
  );
$$;
alter function app_public.password_recovery_status(uuid) owner to identity_service;

create or replace function app_public.begin_password_recovery(
  p_request_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  prior app_private.password_recovery_operations%rowtype;
  profile_row app_private.profiles%rowtype;
  provider_created timestamptz;
  v_revoked_at timestamptz:=statement_timestamp();
begin
  if p_request_id is null or p_user_id is null or p_session_id is null then
    raise exception using errcode='22023',message='password_recovery_unavailable';
  end if;
  provider_created:=app_private.provider_session_created_at(p_session_id,p_user_id);
  if provider_created is null then
    raise exception using errcode='42501',message='password_recovery_unavailable';
  end if;
  select * into prior from app_private.password_recovery_operations
    where idempotency_key=p_request_id for update;
  if prior.operation_id is not null then
    if prior.user_id<>p_user_id or prior.recovery_session_id<>p_session_id then
      return jsonb_build_object('state','retry_required');
    end if;
    return jsonb_build_object(
      'state',case prior.state when 'completed' then 'completed' else 'retry_required' end
    );
  end if;
  select * into profile_row from app_private.profiles
    where user_id=p_user_id and status in ('active','deletion_pending','deletion_scheduled') for update;
  if profile_row.user_id is null then
    raise exception using errcode='42501',message='password_recovery_unavailable';
  end if;
  update app_private.active_sessions set state='revoked',revoked_at=v_revoked_at,
    revocation_reason='password_recovery',version=version+1
    where user_id=p_user_id and state in ('active','cancellation_only');
  update app_private.profiles set session_epoch=session_epoch+1,
    sessions_revoked_before=v_revoked_at,updated_at=v_revoked_at,version=version+1
    where user_id=p_user_id;
  if exists(
    select 1 from app_private.password_recovery_operations
      where user_id=p_user_id and state='provider_pending'
  ) or exists(
    select 1 from app_private.provider_revocation_outbox
      where user_id=p_user_id and reason_code='password_recovery'
        and state in ('pending','calling','failed')
  ) then
    insert into app_private.password_recovery_operations(
      idempotency_key,user_id,recovery_session_id,state,invalidated_at,updated_at
    ) values (p_request_id,p_user_id,p_session_id,'provider_pending',v_revoked_at,v_revoked_at);
    return jsonb_build_object('state','provider_retry');
  end if;
  insert into app_private.provider_revocation_outbox(
    user_id,session_id,provider_user_id,reason_code,idempotency_key
  ) values (p_user_id,null,p_user_id,'password_recovery',p_request_id::text||':provider-revoke')
  on conflict (idempotency_key) do nothing;
  insert into app_private.password_recovery_operations(
    idempotency_key,user_id,recovery_session_id,state,invalidated_at,updated_at
  ) values (p_request_id,p_user_id,p_session_id,'invalidated',v_revoked_at,v_revoked_at);
  return jsonb_build_object('state','ready');
end;
$$;
alter function app_public.begin_password_recovery(uuid,uuid,uuid) owner to identity_service;

create or replace function app_public.mark_password_recovery_uncertain(p_request_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  update app_private.password_recovery_operations
    set state='uncertain',updated_at=statement_timestamp(),version=version+1
    where idempotency_key=p_request_id and state='invalidated'
  returning true;
$$;
alter function app_public.mark_password_recovery_uncertain(uuid) owner to identity_service;

create or replace function app_public.mark_password_recovery_provider_pending(p_request_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  update app_private.password_recovery_operations
    set state='provider_pending',updated_at=statement_timestamp(),version=version+1
    where idempotency_key=p_request_id and state in ('invalidated','provider_pending')
  returning true;
$$;
alter function app_public.mark_password_recovery_provider_pending(uuid) owner to identity_service;

create or replace function app_public.complete_password_recovery(p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare operation app_private.password_recovery_operations%rowtype;
begin
  select * into operation from app_private.password_recovery_operations
    where idempotency_key=p_request_id for update;
  if operation.operation_id is null then
    raise exception using errcode='42501',message='password_recovery_unavailable';
  end if;
  if operation.state='completed' then return jsonb_build_object('state','completed'); end if;
  if operation.state<>'invalidated' then return jsonb_build_object('state','retry_required'); end if;
  update app_private.password_recovery_operations set state='completed',
    completed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
    where operation_id=operation.operation_id;
  return jsonb_build_object('state','completed');
end;
$$;
alter function app_public.complete_password_recovery(uuid) owner to identity_service;

create or replace function app_public.complete_provider_revocation(p_idempotency_key text)
returns boolean language sql volatile security definer set search_path='' as $$
  update app_private.provider_revocation_outbox set state='sent',sent_at=statement_timestamp(),
    last_error_code=null,attempts=attempts+1
    where idempotency_key=p_idempotency_key and state in ('pending','calling','failed')
  returning true;
$$;
alter function app_public.complete_provider_revocation(text) owner to identity_service;

create or replace function app_public.complete_provider_revocations_for_user(p_user_id uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare settled boolean;
begin
  if p_user_id is null then
    raise exception using errcode='22023',message='password_recovery_unavailable';
  end if;
  update app_private.provider_revocation_outbox set state='sent',sent_at=statement_timestamp(),
    last_error_code=null,attempts=attempts+1
    where user_id=p_user_id and reason_code='password_recovery' and state in ('pending','calling','failed');
  settled:=found;
  update app_private.password_recovery_operations set state='completed',
    completed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
    where user_id=p_user_id and state='provider_pending';
  return settled or found;
end;
$$;
alter function app_public.complete_provider_revocations_for_user(uuid) owner to identity_service;

revoke all on function app_public.password_recovery_status(uuid),
  app_public.begin_password_recovery(uuid,uuid,uuid),
  app_public.mark_password_recovery_uncertain(uuid),
  app_public.mark_password_recovery_provider_pending(uuid),
  app_public.complete_password_recovery(uuid),
  app_public.complete_provider_revocation(text),
  app_public.complete_provider_revocations_for_user(uuid)
  from public,anon,authenticated,identity_service;
grant execute on function app_public.password_recovery_status(uuid),
  app_public.begin_password_recovery(uuid,uuid,uuid),
  app_public.mark_password_recovery_uncertain(uuid),
  app_public.mark_password_recovery_provider_pending(uuid),
  app_public.complete_password_recovery(uuid),
  app_public.complete_provider_revocation(text),
  app_public.complete_provider_revocations_for_user(uuid)
  to service_role;

revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
