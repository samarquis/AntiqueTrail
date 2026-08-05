-- Package 5B: provider-neutral, bounded Browse map projection.
-- Exact coordinates never leave the public catalog boundary for synthetic,
-- readiness, hidden, stale, or otherwise non-public stores.

grant catalog_reader,release_automation to postgres;
grant create on schema app_public to catalog_reader;

create type app_public.browse_map_row as (
  store_id uuid,
  slug text,
  name text,
  latitude double precision,
  longitude double precision,
  as_of_utc timestamptz
);

create or replace function app_public.get_browse_map(
  p_q text,
  p_category text,
  p_area text,
  p_north double precision,
  p_south double precision,
  p_east double precision,
  p_west double precision,
  p_limit integer default 50
)
returns setof app_public.browse_map_row
language plpgsql stable security definer set search_path=''
as $$
declare
  v_as_of timestamptz := statement_timestamp();
  v_q text := app_public.normalize_catalog_query(p_q);
  v_matched integer;
begin
  if p_category is not null and p_category !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_catalog_filter';
  end if;
  if p_area is not null and p_area !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_catalog_filter';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'browse_map_limit_invalid';
  end if;
  if p_north is null or p_south is null or p_east is null or p_west is null
    or p_north::text in ('NaN','Infinity','-Infinity')
    or p_south::text in ('NaN','Infinity','-Infinity')
    or p_east::text in ('NaN','Infinity','-Infinity')
    or p_west::text in ('NaN','Infinity','-Infinity')
    or p_north > 90 or p_south < -90 or p_east > 180 or p_west < -180
    or p_north <= p_south or p_east <= p_west
    or p_north - p_south > 2 or p_east - p_west > 2 then
    raise exception 'browse_map_bounds_invalid';
  end if;

  select count(*) into v_matched
  from app_public.stores s
  join app_public.catalog_areas a on a.id=s.area_id
  cross join lateral app_public.catalog_freshness(s.id,v_as_of) f
  where release_private.public_capability_enabled('catalog')
    and not s.synthetic and s.audience='public' and s.publication_state='active'
    and f.freshness_state in ('current','overdue')
    and s.latitude is not null and s.longitude is not null
    and s.latitude between p_south and p_north
    and s.longitude between p_west and p_east
    and (p_area is null or a.slug=p_area)
    and (p_category is null or exists(
      select 1 from app_public.store_category_assignments ca
      join app_public.store_categories c on c.id=ca.category_id
      where ca.store_id=s.id and c.slug=p_category
    ))
    and (v_q is null or s.name ilike '%'||v_q||'%' or s.town ilike '%'||v_q||'%' or a.label ilike '%'||v_q||'%');
  if v_matched > p_limit then raise exception 'browse_map_too_large'; end if;

  return query
  select s.id,s.slug,s.name,s.latitude::double precision,s.longitude::double precision,v_as_of
  from app_public.stores s
  join app_public.catalog_areas a on a.id=s.area_id
  cross join lateral app_public.catalog_freshness(s.id,v_as_of) f
  where release_private.public_capability_enabled('catalog')
    and not s.synthetic and s.audience='public' and s.publication_state='active'
    and f.freshness_state in ('current','overdue')
    and s.latitude is not null and s.longitude is not null
    and s.latitude between p_south and p_north
    and s.longitude between p_west and p_east
    and (p_area is null or a.slug=p_area)
    and (p_category is null or exists(
      select 1 from app_public.store_category_assignments ca
      join app_public.store_categories c on c.id=ca.category_id
      where ca.store_id=s.id and c.slug=p_category
    ))
    and (v_q is null or s.name ilike '%'||v_q||'%' or s.town ilike '%'||v_q||'%' or a.label ilike '%'||v_q||'%')
  order by s.name,s.id;
end;
$$;

alter type app_public.browse_map_row owner to catalog_reader;
alter function app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer) owner to catalog_reader;
revoke all on function app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)
  from public,anon,authenticated,public_catalog_gateway;
grant execute on function app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)
  to release_automation;

alter table release_private.public_catalog_rate_windows
  drop constraint public_catalog_rate_windows_operation_check;
alter table release_private.public_catalog_rate_windows
  add constraint public_catalog_rate_windows_operation_check check(operation in ('list','details','map'));

grant create on schema app_public to release_automation;
create or replace function app_public.public_catalog_gateway_request(
  p_key_hash text,p_operation text,p_args jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_hash bytea;
  v_window timestamptz;
  v_count integer;
  v_limit integer;
  v_points jsonb;
  v_as_of timestamptz;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_operation not in ('list','details','map')
    or jsonb_typeof(p_args)<>'object' then raise exception 'gateway_request_invalid'; end if;
  if p_operation='map' and p_args - array[
    'p_q','p_category','p_area','p_north','p_south','p_east','p_west','p_limit'
  ] <> '{}'::jsonb then raise exception 'gateway_request_invalid'; end if;
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
    return coalesce((select jsonb_agg(x) from app_public.regional_catalog_list(
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x),'[]'::jsonb);
  elsif p_operation='details' then
    return coalesce((select jsonb_agg(x) from app_public.regional_catalog_details(p_args->>'p_slug') x),'[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x)-'as_of_utc'),'[]'::jsonb),max(x.as_of_utc)
    into v_points,v_as_of
    from app_public.get_browse_map(
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area',
      (p_args->>'p_north')::double precision,(p_args->>'p_south')::double precision,
      (p_args->>'p_east')::double precision,(p_args->>'p_west')::double precision,
      (p_args->>'p_limit')::integer
    ) x;
  return jsonb_build_object('points',v_points,'as_of_utc',v_as_of);
end;
$$;
alter function app_public.public_catalog_gateway_request(text,text,jsonb) owner to release_automation;
revoke create on schema app_public from catalog_reader;
revoke create on schema app_public from release_automation;
revoke catalog_reader,release_automation from postgres;
revoke all on function app_public.public_catalog_gateway_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function app_public.public_catalog_gateway_request(text,text,jsonb) to public_catalog_gateway;
