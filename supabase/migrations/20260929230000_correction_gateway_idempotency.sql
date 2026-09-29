-- Add the retry-safe gateway before removing the deployed legacy overload.
-- The legacy service-role-only overload remains until the new Edge is verified.
grant identity_service to postgres;
grant create on schema app_public to identity_service;
set role identity_service;

alter table shopper_private.store_correction_reports
  add column gateway_idempotency_digest bytea
  constraint correction_gateway_idempotency_digest check(
    gateway_idempotency_digest is null or octet_length(gateway_idempotency_digest)=32
  );
create unique index correction_gateway_idempotency_idx
  on shopper_private.store_correction_reports(reporter_user_id,gateway_idempotency_digest)
  where gateway_idempotency_digest is not null;

create function app_public.correction_gateway_submit(
  p_actor_user_id uuid,p_session_id uuid,p_store_id uuid,p_type text,
  p_description text,p_idempotency_key uuid,p_ip_hmac bytea,
  p_public_source_url text default null
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  previous_claims text:=current_setting('request.jwt.claims',true);
  idempotency_digest bytea;
  result jsonb;
begin
  if p_actor_user_id is null or p_session_id is null or p_idempotency_key is null
    or p_ip_hmac is null or octet_length(p_ip_hmac)<>32
    or app_private.gateway_session_is_active(p_actor_user_id,p_session_id) is not true then
    raise exception 'correction_session_denied' using errcode='42501';
  end if;
  if shopper_private.current_user_can_use_shopper_private() is not true then
    raise exception 'shopper_private_access_denied' using errcode='42501';
  end if;

  idempotency_digest:=extensions.digest(convert_to(
    'correction-submit:'||p_idempotency_key::text,'UTF8'
  ),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_actor_user_id::text||':'||p_idempotency_key::text,0
  ));
  select jsonb_build_object('id',report_id,'state',state) into result
  from shopper_private.store_correction_reports
  where reporter_user_id=p_actor_user_id
    and gateway_idempotency_digest=idempotency_digest;
  if result is not null then
    perform pg_catalog.set_config('request.jwt.claims',coalesce(previous_claims,''),true);
    return result;
  end if;

  result:=app_public.shopper_submit_correction(
    p_store_id,p_type,p_description,p_ip_hmac,p_public_source_url
  );
  update shopper_private.store_correction_reports
  set gateway_idempotency_digest=idempotency_digest
  where report_id=(result->>'id')::uuid and reporter_user_id=p_actor_user_id;
  perform pg_catalog.set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  return result;
exception when others then
  perform pg_catalog.set_config('request.jwt.claims',coalesce(previous_claims,''),true);
  raise;
end
$$;

reset role;
revoke all on function app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,uuid,bytea,text)
  from public,anon,authenticated;
grant execute on function app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,uuid,bytea,text)
  to service_role;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
