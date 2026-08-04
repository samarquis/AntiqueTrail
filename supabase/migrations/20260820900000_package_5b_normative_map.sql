-- Package 5B normative Browse map projection. Provider-safe coordinates stay
-- separate from the authenticated/private preview fields in the application.

grant release_automation to postgres;
grant create on schema app_public to release_automation;
grant usage on schema shopper_private,trip_private,partner_private to release_automation;
grant select on shopper_private.saved_stores,trip_private.trips,trip_private.trip_stops,
  trip_private.trip_participants,partner_private.listing_claims to release_automation;
create policy release_map_saved_read on shopper_private.saved_stores for select to release_automation using(true);
create policy release_map_trip_read on trip_private.trips for select to release_automation using(true);
create policy release_map_stop_read on trip_private.trip_stops for select to release_automation using(true);
create policy release_map_participant_read on trip_private.trip_participants for select to release_automation using(true);
create policy release_map_claim_read on partner_private.listing_claims for select to release_automation using(true);

create type app_public.browse_map_v2_row as (
  store_id uuid,slug text,name text,town text,state_code text,address text,
  area_slug text,area_label text,summary text,categories jsonb,today_hours jsonb,
  media jsonb,latitude double precision,longitude double precision,rating double precision,
  rating_count integer,hours_label text,open_state text,category_label text,
  distance_miles double precision,claimed boolean,saved boolean,visited boolean,as_of_utc timestamptz
);

create or replace function app_public.get_browse_map_v2(
  p_q text,p_category text,p_area text,p_open_now boolean,p_visited text,p_saved boolean,
  p_claimed boolean,p_max_area_centroid_miles double precision,p_state text,
  p_north double precision,p_south double precision,p_east double precision,p_west double precision,
  p_zoom integer,p_limit integer default 500,p_actor_user_id uuid default null
) returns setof app_public.browse_map_v2_row
language plpgsql stable security definer set search_path='' as $$
declare v_as_of timestamptz:=statement_timestamp(); v_q text:=app_public.normalize_catalog_query(p_q); v_count integer;
begin
  if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'browse_map_limit_invalid'; end if;
  if p_zoom is null or p_zoom<0 or p_zoom>22 then raise exception 'browse_map_zoom_invalid'; end if;
  if p_visited is not null and p_visited not in ('visited','unvisited') then raise exception 'invalid_catalog_filter'; end if;
  if (p_visited is not null or p_saved is not null) and p_actor_user_id is null then raise exception 'browse_map_auth_required'; end if;
  if p_state is not null and p_state !~ '^[A-Z]{2}$' then raise exception 'invalid_catalog_filter'; end if;
  if p_category is not null and p_category !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  if p_area is not null and p_area !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  if p_max_area_centroid_miles is not null and (p_max_area_centroid_miles<1 or p_max_area_centroid_miles>500) then raise exception 'invalid_catalog_filter'; end if;
  if p_north is null or p_south is null or p_east is null or p_west is null
    or p_north::text in ('NaN','Infinity','-Infinity') or p_south::text in ('NaN','Infinity','-Infinity')
    or p_east::text in ('NaN','Infinity','-Infinity') or p_west::text in ('NaN','Infinity','-Infinity')
    or p_north>90 or p_south< -90 or p_east>180 or p_west< -180
    or p_north<=p_south or p_east<=p_west or p_north-p_south>2 or p_east-p_west>2
    then raise exception 'browse_map_bounds_invalid'; end if;

  with area_centers as (
    select s.area_id,avg(s.latitude)::double precision center_lat,avg(s.longitude)::double precision center_lon
    from app_public.stores s where not s.synthetic and s.audience='public' and s.publication_state='active'
      and s.latitude is not null group by s.area_id
  ), candidates as (
    select s.id,
      69.0*sqrt(power(s.latitude::double precision-ac.center_lat,2)+
        power((s.longitude::double precision-ac.center_lon)*cos(radians(ac.center_lat)),2)) distance_miles,
      today.is_open_now,
      exists(select 1 from shopper_private.saved_stores ss where ss.user_id=p_actor_user_id and ss.store_id=s.id) saved,
      exists(select 1 from trip_private.trip_stops ts join trip_private.trips t using(trip_id)
        where ts.store_id=s.id and ts.state='completed' and (t.owner_id=p_actor_user_id or exists(
          select 1 from trip_private.trip_participants tp where tp.trip_id=t.trip_id and tp.user_id=p_actor_user_id and tp.state='active'))) visited,
      exists(select 1 from partner_private.listing_claims lc where lc.store_id=s.id and lc.state='approved') claimed
    from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id
    join area_centers ac on ac.area_id=s.area_id
    cross join lateral app_public.catalog_freshness(s.id,v_as_of) f
    cross join lateral app_public.catalog_today(s.id,v_as_of,s.timezone_name) today
    where release_private.public_capability_enabled('catalog') and not s.synthetic and s.audience='public'
      and s.publication_state='active' and f.freshness_state in ('current','overdue')
      and s.latitude between p_south and p_north and s.longitude between p_west and p_east
      and (p_area is null or a.slug=p_area) and (p_state is null or s.state_code=p_state)
      and (p_category is null or exists(select 1 from app_public.store_category_assignments ca
        join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
      and (v_q is null or s.name ilike '%'||v_q||'%' or s.town ilike '%'||v_q||'%' or a.label ilike '%'||v_q||'%'
        or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id
          where ca.store_id=s.id and c.label ilike '%'||v_q||'%'))
  ) select count(*) into v_count from candidates c where
    (not coalesce(p_open_now,false) or c.is_open_now)
    and (p_visited is null or (p_visited='visited')=c.visited)
    and (p_saved is null or c.saved=p_saved) and (p_claimed is null or c.claimed=p_claimed)
    and (p_max_area_centroid_miles is null or c.distance_miles<=p_max_area_centroid_miles);
  if v_count>p_limit then raise exception 'too_many_results'; end if;

  return query with area_centers as (
    select x.area_id,avg(x.latitude)::double precision center_lat,avg(x.longitude)::double precision center_lon
    from app_public.stores x where not x.synthetic and x.audience='public' and x.publication_state='active'
      and x.latitude is not null group by x.area_id
  ), rows as (
    select s.*,a.slug area_slug,a.label area_label,today.hours today_hours,today.hours_state,today.is_open_now,
      69.0*sqrt(power(s.latitude::double precision-ac.center_lat,2)+
        power((s.longitude::double precision-ac.center_lon)*cos(radians(ac.center_lat)),2)) distance_miles,
      exists(select 1 from shopper_private.saved_stores ss where ss.user_id=p_actor_user_id and ss.store_id=s.id) saved,
      exists(select 1 from trip_private.trip_stops ts join trip_private.trips t using(trip_id)
        where ts.store_id=s.id and ts.state='completed' and (t.owner_id=p_actor_user_id or exists(
          select 1 from trip_private.trip_participants tp where tp.trip_id=t.trip_id and tp.user_id=p_actor_user_id and tp.state='active'))) visited,
      exists(select 1 from partner_private.listing_claims lc where lc.store_id=s.id and lc.state='approved') claimed
    from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id join area_centers ac on ac.area_id=s.area_id
    cross join lateral app_public.catalog_freshness(s.id,v_as_of) f
    cross join lateral app_public.catalog_today(s.id,v_as_of,s.timezone_name) today
    where release_private.public_capability_enabled('catalog') and not s.synthetic and s.audience='public'
      and s.publication_state='active' and f.freshness_state in ('current','overdue')
      and s.latitude between p_south and p_north and s.longitude between p_west and p_east
      and (p_area is null or a.slug=p_area) and (p_state is null or s.state_code=p_state)
      and (p_category is null or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
      and (v_q is null or s.name ilike '%'||v_q||'%' or s.town ilike '%'||v_q||'%' or a.label ilike '%'||v_q||'%'
        or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.label ilike '%'||v_q||'%'))
  ) select r.id,r.slug,r.name,r.town,r.state_code,r.address,r.area_slug,r.area_label,r.summary,
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]')
      from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=r.id),
    r.today_hours,(select coalesce(jsonb_agg(jsonb_build_object('src',m.asset_path,'alt',m.alt_text,'kind',m.kind) order by m.display_order),'[]') from app_public.store_media m where m.store_id=r.id),
    r.latitude::double precision,r.longitude::double precision,
    (select avg(pr.rating)::double precision from release_private.public_review_projection pr where pr.store_id=r.id and pr.withdrawn_at is null),
    (select count(*)::integer from release_private.public_review_projection pr where pr.store_id=r.id and pr.withdrawn_at is null),
    case when r.hours_state='closed' then 'Closed today' when r.hours_state='available' then 'Hours available today' else 'Hours unavailable' end,
    case when r.hours_state='unavailable' then 'unavailable' when r.is_open_now then 'open' else 'closed' end,
    (select c.label from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=r.id order by c.sort_order,c.slug limit 1),
    r.distance_miles,r.claimed,
    case when p_actor_user_id is null then null else r.saved end,
    case when p_actor_user_id is null then null else r.visited end,v_as_of
  from rows r where (not coalesce(p_open_now,false) or r.is_open_now)
    and (p_visited is null or (p_visited='visited')=r.visited)
    and (p_saved is null or r.saved=p_saved) and (p_claimed is null or r.claimed=p_claimed)
    and (p_max_area_centroid_miles is null or r.distance_miles<=p_max_area_centroid_miles)
  order by r.name,r.id;
end $$;

alter type app_public.browse_map_v2_row owner to release_automation;
alter function app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid) owner to release_automation;
revoke all on function app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid) from public,anon,authenticated;
grant execute on function app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid) to release_automation;

create or replace function app_public.public_catalog_gateway_request(
  p_key_hash text,p_operation text,p_args jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_hash bytea; v_window timestamptz; v_count integer; v_limit integer; v_points jsonb; v_as_of timestamptz;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_operation not in ('list','details','map') or jsonb_typeof(p_args)<>'object'
    then raise exception 'gateway_request_invalid'; end if;
  if p_operation='map' and p_args ? 'p_zoom' and p_args-array[
    'p_q','p_category','p_area','p_open_now','p_visited','p_saved','p_claimed',
    'p_max_area_centroid_miles','p_state','p_north','p_south','p_east','p_west','p_zoom','p_limit','p_actor_user_id'
  ]<>'{}'::jsonb then raise exception 'gateway_request_invalid'; end if;
  if p_operation='map' and not p_args ? 'p_zoom' and p_args-array[
    'p_q','p_category','p_area','p_north','p_south','p_east','p_west','p_limit'
  ]<>'{}'::jsonb then raise exception 'gateway_request_invalid'; end if;
  v_hash:=decode(p_key_hash,'hex');
  v_window:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
  v_limit:=case p_operation when 'details' then 120 else 60 end;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash||p_operation||v_window::text,0));
  insert into release_private.public_catalog_rate_windows(key_hash,operation,window_start,request_count)
    values(v_hash,p_operation,v_window,1) on conflict(key_hash,operation,window_start) do update
      set request_count=release_private.public_catalog_rate_windows.request_count+1 returning request_count into v_count;
  if v_count>v_limit then raise exception 'catalog_rate_limited'; end if;
  if p_operation='list' then return coalesce((select jsonb_agg(x) from app_public.regional_catalog_list(
    p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x),'[]'::jsonb); end if;
  if p_operation='details' then return coalesce((select jsonb_agg(x) from app_public.regional_catalog_details(p_args->>'p_slug') x),'[]'::jsonb); end if;
  if p_args ? 'p_zoom' then
    select coalesce(jsonb_agg(to_jsonb(x)-'as_of_utc'),'[]'),max(x.as_of_utc) into v_points,v_as_of
    from app_public.get_browse_map_v2(p_args->>'p_q',p_args->>'p_category',p_args->>'p_area',
      (p_args->>'p_open_now')::boolean,p_args->>'p_visited',(p_args->>'p_saved')::boolean,
      (p_args->>'p_claimed')::boolean,(p_args->>'p_max_area_centroid_miles')::double precision,p_args->>'p_state',
      (p_args->>'p_north')::double precision,(p_args->>'p_south')::double precision,
      (p_args->>'p_east')::double precision,(p_args->>'p_west')::double precision,
      (p_args->>'p_zoom')::integer,(p_args->>'p_limit')::integer,(p_args->>'p_actor_user_id')::uuid) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x)-'as_of_utc'),'[]'),max(x.as_of_utc) into v_points,v_as_of
    from app_public.get_browse_map(p_args->>'p_q',p_args->>'p_category',p_args->>'p_area',
      (p_args->>'p_north')::double precision,(p_args->>'p_south')::double precision,
      (p_args->>'p_east')::double precision,(p_args->>'p_west')::double precision,(p_args->>'p_limit')::integer) x;
  end if;
  return jsonb_build_object('points',v_points,'as_of_utc',v_as_of);
end $$;
alter function app_public.public_catalog_gateway_request(text,text,jsonb) owner to release_automation;

create or replace function rg01_private.support_case_in_scope(p_case_id uuid,p_release_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with eligible_stores as (
    select s.id from release_private.release_frozen_stores fs join app_public.stores s on s.id=fs.store_id
    join app_public.catalog_areas a on a.id=s.area_id and a.slug='topeka-ks'
    where fs.release_id=p_release_id and not s.synthetic and s.audience='public' and s.publication_state='active'
  ), scoped_trips as (
    select distinct t.trip_id from trip_private.trips t join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    where exists(select 1 from trip_private.trip_stops ts join eligible_stores s on s.id=ts.store_id where ts.trip_id=t.trip_id and ts.kind='store')
  ) select exists(select 1 from admin_private.admin_review_cases c where c.case_id=p_case_id and c.case_type='support' and (
    c.store_id in(select id from eligible_stores)
    or (c.store_id is null and c.target_kind='trip' and c.target_id in(select trip_id from scoped_trips))
    or (c.store_id is null and c.target_kind in('general','regional_release') and c.target_id=p_release_id)
  ))
$$;
alter function rg01_private.support_case_in_scope(uuid,uuid) owner to rg01_automation;

revoke create on schema app_public from release_automation;
revoke release_automation from postgres;
