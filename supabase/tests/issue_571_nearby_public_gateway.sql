begin;
create extension if not exists pgtap with schema extensions;
select plan(26);
grant public_catalog_gateway,identity_service to postgres;
grant usage on schema extensions to public_catalog_gateway;

select has_function('app_public','public_catalog_gateway_request',array['text','text','jsonb'],'public catalog gateway keeps its accepted signature');
select has_function('app_public','synthetic_catalog_gateway_request',array['text','uuid','uuid','text','jsonb'],'synthetic catalog gateway keeps its accepted signature');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.public_catalog_gateway_request(text,text,jsonb)'::regprocedure),'release_automation','public wrapper owner remains release_automation');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure),'synthetic_catalog_automation','synthetic wrapper owner remains constrained');
select ok(has_function_privilege('public_catalog_gateway','app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE'),
  'public gateway remains server-only');
select ok(has_function_privilege('public_catalog_gateway','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE'),
  'synthetic gateway remains server-only');
select ok(not pg_has_role('postgres','release_automation','MEMBER')
  and not pg_has_role('postgres','synthetic_catalog_automation','MEMBER')
  and not has_schema_privilege('release_automation','app_public','CREATE')
  and not has_schema_privilege('synthetic_catalog_automation','app_public','CREATE'),
  'temporary migration owner memberships and schema create grants are removed');
select ok((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.public_test_catalog_gateway_request(text,text,jsonb)'::regprocedure)='public_test_catalog_composer'
  and has_function_privilege('public_catalog_gateway','app_public.public_test_catalog_gateway_request(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.public_test_catalog_gateway_request(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.public_test_catalog_gateway_request(text,text,jsonb)','EXECUTE'),
  'public-test wrapper owner and server-only grant remain unchanged');
select ok(not has_function_privilege('public_catalog_gateway','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE')
  and not has_function_privilege('anon','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),
  'base Nearby reader remains unavailable to gateway and browser roles');
select ok(position('catalog_list_nearby' in pg_get_functiondef('app_public.public_test_catalog_gateway_request(text,text,jsonb)'::regprocedure))=0
  and position('catalog_list_nearby' in pg_get_functiondef('public_test_private.catalog_gateway_base(text,text,jsonb)'::regprocedure))=0,
  'public-test gateway does not expose the Nearby reader');
select ok(position('p_operation not in (''list'',''details'')' in pg_get_functiondef('public_test_private.catalog_gateway_base(text,text,jsonb)'::regprocedure))>0,
  'public-test gateway retains its list/details-only operation allowlist');

insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values('00000000-0000-4000-8000-000000006230','topeka-ks','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
values('00000000-0000-4000-8000-000000006230',true,true,true,true,true);
insert into app_public.catalog_areas(id,slug,label,state_code)
values('99000000-0000-4000-8000-000000006230','issue-623','Issue Region','KS');
insert into app_public.store_categories(id,slug,label)
values('99000000-0000-4000-8000-000000006231','issue-623','Nearby Fixture');
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
values
 ('99000000-0000-4000-8000-000000007001',false,'public','active','nearby-623-7001','Nearby Boundary 7001','Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006230',0,0,'Issue 623 public list fixture','Transaction-isolated Nearby SQL test fixture.'),
 ('99000000-0000-4000-8000-000000007002',false,'public','active','nearby-623-7002','Nearby Boundary 7002','Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006230',0,0.0723657921899488,'Issue 623 public list fixture','Transaction-isolated Nearby SQL test fixture.');
insert into app_public.store_category_assignments(store_id,category_id)
select s.id,c.id from app_public.stores s cross join app_public.store_categories c
where s.id in ('99000000-0000-4000-8000-000000007001','99000000-0000-4000-8000-000000007002') and c.slug='issue-623';
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select s.id,g.group_name,statement_timestamp()-interval '20 days','Nearby fixture','two_person_public_source'
from app_public.stores s cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes')) g(group_name)
where s.id in ('99000000-0000-4000-8000-000000007001','99000000-0000-4000-8000-000000007002');

set local role public_catalog_gateway;
select is((select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(app_public.public_catalog_gateway_request(
  repeat('a',64),'nearby-list',jsonb_build_object('p_q','Nearby Boundary','p_category','issue-623','p_area',null,
    'p_device_latitude',0,'p_device_longitude',0.000004207810051198857,'p_device_radius_miles',5)) x),
  array['99000000-0000-4000-8000-000000007001','99000000-0000-4000-8000-000000007002']::text[],
  'public wrapper returns only the two accepted #623 fixtures');
select ok(abs((select (x->>'device_distance_miles')::double precision from jsonb_array_elements(app_public.public_catalog_gateway_request(
  repeat('b',64),'nearby-list',jsonb_build_object('p_q','Nearby Boundary','p_category','issue-623','p_area',null,
    'p_device_latitude',0,'p_device_longitude',0.000004207810051198857,'p_device_radius_miles',5)) x
  where x->>'id'='99000000-0000-4000-8000-000000007001')-0.00029073198287901127)<0.0001,
  'nearby-7001 distance matches the #623 answer key');
select ok(abs((select (x->>'device_distance_miles')::double precision from jsonb_array_elements(app_public.public_catalog_gateway_request(
  repeat('c',64),'nearby-list',jsonb_build_object('p_q','Nearby Boundary','p_category','issue-623','p_area',null,
    'p_device_latitude',0,'p_device_longitude',0.000004207810051198857,'p_device_radius_miles',5)) x
  where x->>'id'='99000000-0000-4000-8000-000000007002')-5.0)<0.0001,
  'nearby-7002 boundary distance matches the #623 answer key');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('d',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5,"extra":true}')$$,'P0001','gateway_request_invalid','Nearby rejects unknown arguments');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('e',64),'nearby-list','{"p_q":null,"p_category":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,'P0001','gateway_request_invalid','Nearby rejects a missing accepted argument');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('f',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":"bad","p_device_longitude":0,"p_device_radius_miles":5}')$$,'P0001','invalid_nearby_input','Nearby rejects malformed coordinates');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('0',64),'nearby-list','{"p_q":null,"p_category":7,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,'P0001','invalid_nearby_input','Nearby rejects non-text filter values');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('1',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":91,"p_device_longitude":0,"p_device_radius_miles":5}')$$,'P0001','invalid_nearby_input','Nearby rejects out-of-range coordinates');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('2',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":null,"p_device_radius_miles":5}')$$,'P0001','invalid_nearby_input','Nearby rejects a partial coordinate tuple');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('3',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5.5}')$$,'P0001','invalid_nearby_input','Nearby rejects a non-integer radius');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('4',64),'nearby-list','{"p_q":null,"p_category":null,"p_area":"topeka-ks","p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')$$,'P0001','invalid_nearby_input','Nearby rejects area filters');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('5',64),'nearby-list','{}')$$,'P0001','gateway_request_invalid','Nearby rejects missing arguments');
set local role identity_service;
update app_private.environment_stage set stage='private_beta' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('7',64),null,null,'nearby-list',
  '{"p_q":"Nearby Boundary","p_category":"issue-623","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}')$$,
  'P0001','synthetic_catalog_outside_stage','valid Nearby request preserves the Edge public-fallback signal outside alpha');
reset role;
set local role identity_service;
update app_private.environment_stage set stage='synthetic_alpha' where id=1;
reset role;
set local role public_catalog_gateway;
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('8',64),null,null,'nearby-list',
  '{"p_q":"Nearby Boundary","p_category":"issue-623","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}')$$,
  '42501','synthetic_catalog_map_disabled','synthetic alpha denies Nearby without the public fallback signal');
reset role;

update release_private.release_capabilities set public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false
where release_id='00000000-0000-4000-8000-000000006230';
set local role public_catalog_gateway;
select is(app_public.public_catalog_gateway_request(repeat('9',64),'nearby-list',
  '{"p_q":"Nearby Boundary","p_category":"issue-623","p_area":null,"p_device_latitude":0,"p_device_longitude":0.000004207810051198857,"p_device_radius_miles":5}'),'[]'::jsonb,
  'disabled public capability returns no Nearby rows');
reset role;

select * from finish();
rollback;
