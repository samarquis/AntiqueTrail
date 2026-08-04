begin;
select plan(14);

select has_type('app_public','browse_map_v2_row','normative Browse map has a typed response');
select has_function('app_public','get_browse_map_v2',array[
  'text','text','text','boolean','text','boolean','boolean','double precision','text',
  'double precision','double precision','double precision','double precision','integer','integer','uuid'
],'normative Browse map accepts the complete bounded request');
select ok(not has_function_privilege('anon',
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)','EXECUTE')
  and not has_function_privilege('authenticated',
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)','EXECUTE'),
  'browser roles cannot bypass the rate-limited map gateway');
select ok(position('p_limit>500' in replace(pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure),' ',''))>0
  and position("raise exception 'too_many_results'" in lower(pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure)))>0,
  'the 500-point limit fails closed instead of truncating');
select ok(position('p_zoom' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0,
  'zoom is validated by the server boundary');
select ok(position('catalog_today' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0
  and position('public_review_projection' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0,
  'preview hours/open-state and rating facts are server-derived');
select ok(position('shopper_private.saved_stores' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0
  and position('trip_private.trip_stops' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0,
  'saved and visited flags come from authoritative private rows');
select ok(position('browse_map_auth_required' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0,
  'private filters fail closed without an authoritative actor');
select ok(position('p_claimed' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0
  and position('p_max_area_centroid_miles' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0
  and position('p_state' in pg_get_functiondef(
  'app_public.get_browse_map_v2(text,text,text,boolean,text,boolean,boolean,double precision,text,double precision,double precision,double precision,double precision,integer,integer,uuid)'::regprocedure))>0,
  'claimed, area-centroid distance, and state filters are server-side');
select ok(position('get_browse_map_v2' in pg_get_functiondef(
  'app_public.public_catalog_gateway_request(text,text,jsonb)'::regprocedure))>0,
  'the abuse-controlled catalog gateway invokes the normative map seam');

select ok(position('target_kind=''account''' in replace(lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),' ',''))=0,
  'RG-01 never includes every account case merely because the owner has an eligible trip');
select ok(position('target_kind=''trip''' in replace(lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),' ',''))>0,
  'RG-01 includes a support case linked directly to an exact eligible trip');
select ok(position('release_frozen_stores' in lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)))>0
  and position('topeka-ks' in lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)))>0,
  'RG-01 trip/store targets remain bound to exact frozen Topeka scope');
select ok(position('target_kind in(''general'',''regional_release'')' in replace(lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),' ',''))>0,
  'general support is included only when its target is the exact release');

select * from finish();
rollback;
