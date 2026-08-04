begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_type('app_public','browse_map_row','bounded Browse map projection exists');
select has_function('app_public','get_browse_map',array['text','text','text','double precision','double precision','double precision','double precision','integer'],'Browse map has one typed bounded entry point');
select ok(not has_function_privilege('anon','app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)','EXECUTE'),
  'browser roles cannot bypass the public catalog gateway for exact coordinates');
select ok(not has_function_privilege('public_catalog_gateway','app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)','EXECUTE'),
  'gateway login role cannot call the map projection outside its bounded wrapper');
select ok(position("not s.synthetic" in pg_get_functiondef('app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)'::regprocedure))>0
  and position("s.audience='public'" in pg_get_functiondef('app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)'::regprocedure))>0,
  'exact coordinates are limited to non-synthetic public stores');
select ok(position("f.freshness_state in ('current','overdue')" in pg_get_functiondef('app_public.get_browse_map(text,text,text,double precision,double precision,double precision,double precision,integer)'::regprocedure))>0,
  'Browse map uses the same catalog freshness eligibility');

select throws_ok($$select * from app_public.get_browse_map(null,null,null,45,39,-95,-96,50)$$,'P0001','browse_map_bounds_invalid','oversized bounds fail closed');
select throws_ok($$select * from app_public.get_browse_map(null,null,null,40,39,-95,-96,51)$$,'P0001','browse_map_limit_invalid','result limits above fifty fail closed');
select throws_ok($$select * from app_public.get_browse_map(null,null,null,39,40,-95,-96,50)$$,'P0001','browse_map_bounds_invalid','inverted bounds fail closed');

insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values('00000000-0000-4000-8000-000000009019','topeka-ks','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
values('00000000-0000-4000-8000-000000009019',true,true,true,true,true);
update app_public.stores set synthetic=false,audience='public',latitude=39.05,longitude=-95.68
where id='00000000-0000-4000-8000-000000001001';
update app_public.stores set latitude=39.06,longitude=-95.69
where id='00000000-0000-4000-8000-000000001002';

select is((select count(*)::integer from app_public.get_browse_map(null,null,'topeka-ks',40,39,-95,-96,50)),1,'only the eligible public store enters map results');
select is((select name from app_public.get_browse_map('Clockwork',null,'topeka-ks',40,39,-95,-96,50)),'Clockwork Cabinet','map query stays synchronized with Browse filters');
select is((select count(*)::integer from app_public.get_browse_map(null,'furniture','topeka-ks',40,39,-95,-96,50)),0,'category filters stay synchronized with Browse results');
select is((select count(*)::integer from app_public.get_browse_map(null,null,'topeka-ks',39.04,39,-95,-96,50)),0,'stores outside the requested bounds are excluded');

set local role public_catalog_gateway;
select is(jsonb_array_length(app_public.public_catalog_gateway_request(repeat('a',64),'map',jsonb_build_object(
  'p_q',null,'p_category',null,'p_area','topeka-ks','p_north',40,'p_south',39,'p_east',-95,'p_west',-96,'p_limit',50
))->'points'),1,'typed gateway returns the bounded map projection');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('b',64),'map',jsonb_build_object(
  'p_north',40,'p_south',39,'p_east',-95,'p_west',-96,'p_limit',50,'shopper_id','private'
))$$,'P0001','gateway_request_invalid','map gateway rejects shopper or tracking fields');

reset role;
select * from finish();
rollback;
