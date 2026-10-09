-- Synthetic Nearby reader. Device coordinates are request-scoped inputs only.
grant create on schema app_public to catalog_reader;

create function app_public.synthetic_catalog_list_nearby(
  p_q text,
  p_category text,
  p_area text,
  p_device_latitude double precision,
  p_device_longitude double precision,
  p_device_radius_miles integer
)
returns setof app_public.catalog_nearby_list_row
language plpgsql stable security definer set search_path='' as $$
declare
  as_of timestamptz:=statement_timestamp();
  normalized_q text;
  matched integer;
begin
  if p_device_latitude is null or not (p_device_latitude between -90 and 90)
    or p_device_longitude is null or not (p_device_longitude between -180 and 180)
    or p_device_radius_miles is null or p_device_radius_miles not in (5,10,25,50)
    or p_area is not null then
    raise exception 'invalid_nearby_input';
  end if;
  normalized_q:=app_public.normalize_catalog_query(p_q);
  if p_category is not null and p_category !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'invalid_catalog_filter';
  end if;

  select count(*) into matched
  from app_public.stores s
  join app_public.catalog_areas a on a.id=s.area_id
  cross join lateral app_public.catalog_freshness(s.id,as_of) f
  cross join lateral (
    select 2.0::double precision*3958.7613::double precision*asin(least(1.0::double precision,sqrt(
      power(sin(radians(s.latitude::double precision-p_device_latitude)/2),2)
      +cos(radians(p_device_latitude))*cos(radians(s.latitude::double precision))
        *power(sin(radians(s.longitude::double precision-p_device_longitude)/2),2)
    ))) as miles
  ) d
  where s.synthetic and s.audience='synthetic' and s.publication_state='active'
    and s.latitude is not null and s.longitude is not null
    and f.freshness_state in ('current','overdue') and d.miles<=p_device_radius_miles
    and (p_category is null or exists(
      select 1 from app_public.store_category_assignments ca
      join app_public.store_categories c on c.id=ca.category_id
      where ca.store_id=s.id and c.slug=p_category))
    and (normalized_q is null or s.name ilike '%'||normalized_q||'%'
      or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%');
  if matched>50 then raise exception 'catalog_too_large'; end if;

  return query
  select s.id,s.slug,s.name,s.town,s.state_code,a.slug,a.label,s.summary,s.phone,s.website,s.timezone_name,
    (select m.asset_path from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select m.alt_text from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('src',m.asset_path,'alt',m.alt_text,'kind',m.kind) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    today.hours,today.hours_state,today.is_open_now,f.freshness_state,f.oldest_verified_at,as_of,d.miles
  from app_public.stores s
  join app_public.catalog_areas a on a.id=s.area_id
  cross join lateral app_public.catalog_today(s.id,as_of,s.timezone_name) today
  cross join lateral app_public.catalog_freshness(s.id,as_of) f
  cross join lateral (
    select 2.0::double precision*3958.7613::double precision*asin(least(1.0::double precision,sqrt(
      power(sin(radians(s.latitude::double precision-p_device_latitude)/2),2)
      +cos(radians(p_device_latitude))*cos(radians(s.latitude::double precision))
        *power(sin(radians(s.longitude::double precision-p_device_longitude)/2),2)
    ))) as miles
  ) d
  where s.synthetic and s.audience='synthetic' and s.publication_state='active'
    and s.latitude is not null and s.longitude is not null
    and f.freshness_state in ('current','overdue') and d.miles<=p_device_radius_miles
    and (p_category is null or exists(
      select 1 from app_public.store_category_assignments ca
      join app_public.store_categories c on c.id=ca.category_id
      where ca.store_id=s.id and c.slug=p_category))
    and (normalized_q is null or s.name ilike '%'||normalized_q||'%'
      or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%')
  order by s.name,s.id;
end
$$;

alter function app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer) owner to catalog_reader;
revoke create on schema app_public from catalog_reader;
grant usage on type app_public.catalog_nearby_list_row to synthetic_catalog_automation;
revoke all on function app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)
  from public,anon,authenticated,public_catalog_gateway,release_automation;
grant execute on function app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)
  to synthetic_catalog_automation;
