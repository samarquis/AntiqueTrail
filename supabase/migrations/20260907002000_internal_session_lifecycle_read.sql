-- Session hydration always reads the authoritative account lifecycle status.
-- Permit that existing actor-bound read without enabling lifecycle mutations.
grant internal_review_guard to postgres;
grant create on schema internal_review_private, app_public to internal_review_guard;
alter function internal_review_private.session_allowed(uuid) owner to postgres;
create or replace function internal_review_private.session_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when not internal_review_private.is_internal(p_user_id) then true else
    internal_review_private.valid_until(p_user_id) is not null
    and ltrim(coalesce(current_setting('request.path', true), ''), '/') in (
      'rpc/register_current_session','rpc/current_session_is_active',
      'rpc/revoke_current_session','rpc/synthetic_catalog_gateway_request','rpc/account_lifecycle_status')
    and coalesce(current_setting('request.method', true), '') = 'POST'
  end;
$$;
alter function internal_review_private.session_allowed(uuid) owner to internal_review_guard;
alter function app_public.internal_review_pre_request() owner to postgres;
create or replace function app_public.internal_review_pre_request()
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
    request_path not in ('rpc/register_current_session','rpc/current_session_is_active','rpc/revoke_current_session','rpc/account_lifecycle_status') or
    internal_review_private.valid_until(actor) is null then
    raise exception 'internal_request_denied' using errcode = '42501';
  end if;
end;
$$;
alter function app_public.internal_review_pre_request() owner to internal_review_guard;
revoke create on schema internal_review_private, app_public from internal_review_guard;
revoke internal_review_guard from postgres;
notify pgrst, 'reload schema';
