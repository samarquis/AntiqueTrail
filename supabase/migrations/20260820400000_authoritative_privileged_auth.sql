-- Privileged authorization derives only from provider-signed JWT AMR/AAL claims
-- and provider-owned MFA enrollment. Session registration cannot mint freshness.

grant identity_service to postgres;
grant create on schema app_private,app_public to identity_service;

create or replace function app_private.current_jwt_has_recent_amr(
  p_methods text[],
  p_window interval
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb; proof_epoch numeric;
begin
  if p_window<=interval '0 seconds' or p_window>interval '1 hour' then return false; end if;
  begin
    claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    select max((entry->>'timestamp')::numeric) into proof_epoch
    from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) entry
    where entry->>'method'=any(p_methods)
      and entry->>'timestamp'~'^[0-9]{1,12}$';
    return proof_epoch is not null
      and to_timestamp(proof_epoch)>=statement_timestamp()-p_window
      and to_timestamp(proof_epoch)<=statement_timestamp()+interval '1 minute';
  exception when others then
    return false;
  end;
end $$;
alter function app_private.current_jwt_has_recent_amr(text[],interval) owner to identity_service;
revoke all on function app_private.current_jwt_has_recent_amr(text[],interval) from public,anon,authenticated;

create or replace function app_private.current_session_recent_auth(
  p_window interval default interval '15 minutes'
)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_session_is_active()
    and app_private.current_jwt_has_recent_amr(array['password'],p_window);
$$;
alter function app_private.current_session_recent_auth(interval) owner to identity_service;

create or replace function app_private.current_session_has_mfa()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb;
begin
  if not app_private.current_session_is_active()
    or not app_private.provider_user_has_verified_mfa(auth.uid()) then return false; end if;
  begin
    claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    return claims->>'aal'='aal2' and exists(
      select 1 from jsonb_array_elements(coalesce(claims->'amr','[]'::jsonb)) entry
      where entry->>'method' in ('totp','recovery_code')
        and entry->>'timestamp'~'^[0-9]{1,12}$'
    );
  exception when others then
    return false;
  end;
end $$;
alter function app_private.current_session_has_mfa() owner to identity_service;

create or replace function app_public.register_current_session(access_token_expires_at bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); session_id uuid:=app_private.claim_session_id();
  epoch bigint; expires_at timestamptz; provider_created timestamptz; revoked_before timestamptz;
begin
  if actor is null or session_id is null then raise exception 'authentication_required'; end if;
  if access_token_expires_at<=(extract(epoch from statement_timestamp())*1000)::bigint
    or access_token_expires_at>(extract(epoch from statement_timestamp()+interval '24 hours')*1000)::bigint
    then raise exception 'session_expiry_invalid'; end if;
  expires_at:=to_timestamp(access_token_expires_at::numeric/1000);
  provider_created:=app_private.provider_session_created_at(session_id,actor);
  if provider_created is null then raise exception 'provider_session_unavailable'; end if;
  select session_epoch,sessions_revoked_before into epoch,revoked_before
    from app_private.profiles where user_id=actor and status='active' for update;
  if epoch is null then raise exception 'account_unavailable'; end if;
  if not exists(select 1 from app_private.role_grants
    where subject_user_id=actor and role='shopper' and state='active') then raise exception 'admission_required'; end if;
  if revoked_before is not null and provider_created<=revoked_before then raise exception 'provider_session_revoked'; end if;
  insert into app_private.active_sessions(
    session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
  ) values(session_id,actor,provider_created,epoch,'active',provider_created,expires_at)
  on conflict (session_id) do update set
    access_token_expires_at=excluded.access_token_expires_at,
    version=app_private.active_sessions.version+1
  where app_private.active_sessions.user_id=excluded.user_id
    and app_private.active_sessions.session_epoch=excluded.session_epoch
    and app_private.active_sessions.provider_created_at=excluded.provider_created_at
    and app_private.active_sessions.state='active';
  return app_private.current_session_is_active();
end $$;
alter function app_public.register_current_session(bigint) owner to identity_service;

revoke create on schema app_private,app_public from identity_service;
revoke identity_service from postgres;
