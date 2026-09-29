-- Require Edge-derived rate context. Browser roles can no longer choose the
-- low-level IP key; only provider-verified Edge traffic reaches this gateway.
revoke all on function app_public.shopper_submit_correction(uuid,text,text,bytea,text)
  from public,anon,authenticated,service_role;

grant identity_service to postgres;
grant create on schema app_public to identity_service;
set role identity_service;

create function app_public.correction_gateway_submit(
  p_actor_user_id uuid,p_session_id uuid,p_store_id uuid,p_type text,
  p_description text,p_ip_hmac bytea,p_public_source_url text default null
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text:=current_setting('request.jwt.claims',true);
  result jsonb;
begin
  if p_actor_user_id is null or p_session_id is null or p_ip_hmac is null
    or octet_length(p_ip_hmac)<>32
    or app_private.gateway_session_is_active(p_actor_user_id,p_session_id) is not true then
    raise exception 'correction_session_denied' using errcode='42501';
  end if;

  result:=app_public.shopper_submit_correction(
    p_store_id,p_type,p_description,p_ip_hmac,p_public_source_url
  );
  perform pg_catalog.set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return result;
exception when others then
  perform pg_catalog.set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  raise;
end
$$;

reset role;
revoke all on function app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)
  from public,anon,authenticated;
grant execute on function app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)
  to service_role;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
