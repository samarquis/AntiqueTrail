-- Issue #252: make provider-revocation retry state forward-only and replay-safe.
grant identity_service to postgres;
grant create, usage on schema app_public to identity_service;

alter table app_private.password_recovery_operations
  drop constraint if exists password_recovery_operations_state_check;
alter table app_private.password_recovery_operations
  add constraint password_recovery_operations_state_check
  check (state in ('invalidated','provider_pending','completed','uncertain'));

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
  if exists(select 1 from app_private.password_recovery_operations
      where user_id=p_user_id and state in ('invalidated','uncertain')) then
    return jsonb_build_object('state','retry_required');
  end if;
  if exists(select 1 from app_private.password_recovery_operations
      where user_id=p_user_id and state='provider_pending') then
    insert into app_private.password_recovery_operations(
      idempotency_key,user_id,recovery_session_id,state,invalidated_at,updated_at
    ) values (p_request_id,p_user_id,p_session_id,'provider_pending',v_revoked_at,v_revoked_at);
    return jsonb_build_object('state','provider_retry');
  end if;
  update app_private.active_sessions set state='revoked',revoked_at=v_revoked_at,
    revocation_reason='password_recovery',version=version+1
    where user_id=p_user_id and state in ('active','cancellation_only');
  update app_private.profiles set session_epoch=session_epoch+1,
    sessions_revoked_before=v_revoked_at,updated_at=v_revoked_at,version=version+1
    where user_id=p_user_id;
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

create or replace function app_public.mark_password_recovery_provider_pending(p_request_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  update app_private.password_recovery_operations
    set state='provider_pending',updated_at=statement_timestamp(),version=version+1
    where idempotency_key=p_request_id and state in ('invalidated','provider_pending')
  returning true;
$$;
alter function app_public.mark_password_recovery_provider_pending(uuid) owner to identity_service;

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
