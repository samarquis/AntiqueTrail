-- Privileged server authorization requires provider-signed password freshness
-- plus fresh MFA AMR when a verified provider factor is enrolled. Callers may
-- request a shorter window, but can never widen the ten-minute ceiling.

grant identity_service to postgres;
grant create on schema app_private to identity_service;

create or replace function app_private.current_session_has_privileged_reauth(
  p_window interval default interval '10 minutes'
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  claims jsonb;
  enrolled boolean;
  effective_window interval;
begin
  if p_window<=interval '0 seconds' then return false; end if;
  effective_window:=least(p_window,interval '10 minutes');
  if not app_private.current_session_is_active()
    or not app_private.current_jwt_has_recent_amr(array['password'],effective_window) then
    return false;
  end if;
  enrolled:=app_private.provider_user_has_verified_mfa(app_public.request_user_id());
  if not enrolled then return true; end if;
  begin
    claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    return claims->>'aal'='aal2'
      and app_private.current_jwt_has_recent_amr(array['totp','recovery_code'],effective_window);
  exception when others then
    return false;
  end;
end $$;
alter function app_private.current_session_has_privileged_reauth(interval) owner to identity_service;
revoke all on function app_private.current_session_has_privileged_reauth(interval) from public,anon,authenticated;

create or replace function app_private.current_session_recent_auth(
  p_window interval default interval '10 minutes'
)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_session_has_privileged_reauth(p_window);
$$;
alter function app_private.current_session_recent_auth(interval) owner to identity_service;

create or replace function app_private.current_session_has_mfa()
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.provider_user_has_verified_mfa(app_public.request_user_id())
    and app_private.current_session_has_privileged_reauth(interval '10 minutes');
$$;
alter function app_private.current_session_has_mfa() owner to identity_service;

create or replace function app_private.current_session_has_privacy_reauth()
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_session_has_privileged_reauth(interval '10 minutes');
$$;
alter function app_private.current_session_has_privacy_reauth() owner to identity_service;
revoke all on function app_private.current_session_has_privacy_reauth() from public,anon,authenticated;

revoke create on schema app_private from identity_service;
revoke identity_service from postgres;
