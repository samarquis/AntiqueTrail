begin;

grant synthetic_catalog_automation to postgres;
grant create on schema app_public to synthetic_catalog_automation;

alter function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) owner to postgres;
create or replace function app_public.synthetic_catalog_gateway_request(
  p_key_hash text,p_user_id uuid,p_session_id uuid,p_operation text,p_args jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_internal boolean := internal_review_private.is_internal(p_user_id);
  v_stage app_private.runtime_stage;
  v_hash bytea;
  v_window timestamptz;
  v_count integer;
  v_limit integer;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_operation is null
    or p_operation not in ('list','details','map','nearby-list')
    or jsonb_typeof(p_args) is distinct from 'object'
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
    or (p_operation='nearby-list' and (p_args-array[
      'p_q','p_category','p_area','p_device_latitude','p_device_longitude','p_device_radius_miles'
    ]<>'{}'::jsonb or not (p_args ?& array[
      'p_q','p_category','p_area','p_device_latitude','p_device_longitude','p_device_radius_miles'
    ]))) then
    raise exception 'gateway_request_invalid';
  end if;
  if p_operation='nearby-list' and (
    jsonb_typeof(p_args->'p_q') not in ('string','null')
    or jsonb_typeof(p_args->'p_category') not in ('string','null')
    or jsonb_typeof(p_args->'p_device_latitude') is distinct from 'number'
    or jsonb_typeof(p_args->'p_device_longitude') is distinct from 'number'
    or jsonb_typeof(p_args->'p_device_radius_miles') is distinct from 'number'
    or p_args->'p_area' is distinct from 'null'::jsonb
  ) then raise exception 'invalid_nearby_input'; end if;
  if p_operation='nearby-list' and (
    (p_args->>'p_device_latitude')::numeric not between -90 and 90
    or (p_args->>'p_device_longitude')::numeric not between -180 and 180
    or (p_args->>'p_device_radius_miles')::numeric not in (5,10,25,50)
  ) then raise exception 'invalid_nearby_input'; end if;

  select stage into v_stage from app_private.environment_stage where id=1;
  if v_stage is distinct from 'synthetic_alpha' then
    raise exception 'synthetic_catalog_outside_stage';
  end if;
  if p_operation='map' then
    raise exception 'synthetic_catalog_map_disabled' using errcode='42501';
  end if;

  if (p_user_id is null) <> (p_session_id is null) then
    raise exception 'synthetic_catalog_forbidden' using errcode='42501';
  end if;

  if v_internal then
    if p_user_id is null or internal_review_private.valid_until(p_user_id) is null
      or not internal_review_private.session_allowed(p_user_id) then
      raise exception 'synthetic_catalog_forbidden' using errcode='42501';
    end if;
  elsif not exists(
    select 1
    from app_private.environment_stage e
    join app_private.account_registration_config c on c.id=1
    join app_private.registration_quarantine_latch q on q.id=1
    where e.id=1 and e.stage='synthetic_alpha' and e.receipt_id is not null
      and e.capabilities @> '{"private_auth":true}'::jsonb
      and (p_user_id is not null or p_session_id is not null
        or p_operation not in ('list','details')
        or e.capabilities @> '{"anonymous_catalog":true}'::jsonb)
      and c.mode='receipt_only' and c.stage_receipt_id=e.receipt_id
      and q.state='open'
  ) then raise exception 'synthetic_catalog_evidence_invalid' using errcode='42501'; end if;

  if p_user_id is null and p_session_id is null then
    if p_operation not in ('list','details') then
      raise exception 'synthetic_catalog_forbidden' using errcode='42501';
    end if;
  elsif p_user_id is null or p_session_id is null
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
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x where not v_internal or x.id in (
      select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
      from generate_series(1001,1012) n)),'[]'::jsonb);
  end if;
  if p_operation='nearby-list' then
    return coalesce((select jsonb_agg(x) from app_public.synthetic_catalog_list_nearby(
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area',
      (p_args->>'p_device_latitude')::double precision,
      (p_args->>'p_device_longitude')::double precision,
      (p_args->>'p_device_radius_miles')::integer) x
      where not v_internal or x.id in (
        select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
        from generate_series(1001,1012) n
      ) or x.id='99000000-0000-4000-8000-000000007101'::uuid),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(x) from app_public.catalog_details(
    p_args->>'p_slug') x where not v_internal or x.id in (
    select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
    from generate_series(1001,1012) n)),'[]'::jsonb);
end;
$$;
alter function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) owner to synthetic_catalog_automation;
revoke all on function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb) to public_catalog_gateway;
revoke create on schema app_public from synthetic_catalog_automation;
revoke synthetic_catalog_automation from postgres;

commit;
