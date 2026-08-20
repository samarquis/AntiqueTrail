-- Shared Synthetic Alpha catalog boundary. The existing public gateway secret
-- remains the only HTTP-to-database credential; this separate constrained
-- owner may read only the exact stage/session/role rows needed for admission.

do $$
begin
  if not exists(select 1 from pg_roles where rolname='synthetic_catalog_automation') then
    create role synthetic_catalog_automation nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant catalog_reader,synthetic_catalog_automation to postgres;
grant usage on schema app_private,app_public,release_private to synthetic_catalog_automation;
grant select on app_private.profiles,app_private.active_sessions,app_private.role_grants,
  app_private.environment_stage,app_private.account_registration_config,
  app_private.registration_quarantine_latch to synthetic_catalog_automation;
grant select,insert,update on release_private.public_catalog_rate_windows to synthetic_catalog_automation;

-- A single private adapter supplies the provider-verified gateway context to
-- the canonical session predicate without granting the gateway owner direct
-- execution on that predicate.
grant identity_service to postgres;
grant create on schema app_private to identity_service;
create or replace function app_private.gateway_session_is_active(
  p_user_id uuid,p_session_id uuid
)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  perform pg_catalog.set_config('request.jwt.claims',jsonb_build_object(
    'sub',p_user_id,'role','authenticated','session_id',p_session_id
  )::text,true);
  return app_private.current_session_is_active();
end;
$$;
alter function app_private.gateway_session_is_active(uuid,uuid) owner to identity_service;
revoke create on schema app_private from identity_service;
revoke all on function app_private.gateway_session_is_active(uuid,uuid)
  from public,anon,authenticated;
grant execute on function app_private.gateway_session_is_active(uuid,uuid)
  to synthetic_catalog_automation;
revoke identity_service from postgres;

create policy synthetic_catalog_identity_read on app_private.profiles
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_session_read on app_private.active_sessions
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_role_read on app_private.role_grants
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_stage_read on app_private.environment_stage
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_registration_read on app_private.account_registration_config
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_quarantine_read on app_private.registration_quarantine_latch
  for select to synthetic_catalog_automation using(true);
create policy synthetic_catalog_rate_write on release_private.public_catalog_rate_windows
  for all to synthetic_catalog_automation using(true) with check(true);

grant execute on function app_public.catalog_list(text,text,text),
  app_public.catalog_details(text) to synthetic_catalog_automation;
grant create on schema app_public to synthetic_catalog_automation;

create or replace function app_public.synthetic_catalog_gateway_request(
  p_key_hash text,p_user_id uuid,p_session_id uuid,p_operation text,p_args jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
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

  if not exists(
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
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(x) from app_public.catalog_details(
    p_args->>'p_slug') x),'[]'::jsonb);
end;
$$;

alter function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)
  owner to synthetic_catalog_automation;
revoke create on schema app_public from synthetic_catalog_automation;
revoke all on function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)
  from public,anon,authenticated;
grant execute on function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)
  to public_catalog_gateway;
revoke catalog_reader,synthetic_catalog_automation from postgres;
