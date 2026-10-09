begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_type('app_public','catalog_nearby_list_row','Nearby list projection type exists');
select has_function('app_public','catalog_list_nearby',array['text','text','text','double precision','double precision','integer'],'Nearby reader has one required-argument signature');
select ok(not has_function_privilege('anon','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'), 'anon cannot execute Nearby reader');
select ok(not has_function_privilege('authenticated','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'), 'authenticated cannot execute Nearby reader');
select ok(not has_function_privilege('public_catalog_gateway','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'), 'gateway cannot bypass its bounded wrapper');
select ok(has_function_privilege('release_automation','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'), 'release automation can execute Nearby reader');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'catalog_reader','Nearby function owner is catalog_reader');
select ok((select prosecdef and provolatile='s' and 'search_path=""'=any(coalesce(proconfig,'{}')) from pg_proc where oid='app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'Nearby reader is stable SECURITY DEFINER with empty search_path');
select ok(exists(select 1 from pg_attribute where attrelid='app_public.catalog_nearby_list_row'::regtype and attname='device_distance_miles' and atttypid='double precision'::regtype and not attisdropped),'projection includes device_distance_miles');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,'NaN'::double precision,0,5)$$,'P0001','invalid_nearby_input','non-finite device latitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,91,0,5)$$,'P0001','invalid_nearby_input','out-of-range device latitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,0,181,5)$$,'P0001','invalid_nearby_input','out-of-range device longitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,0,0,15)$$,'P0001','invalid_nearby_input','unsupported device radius is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,'topeka-ks',0,0,5)$$,'P0001','invalid_nearby_input','Nearby requires a null area');
select throws_ok($$select * from app_public.catalog_list_nearby(null,'INVALID',null,0,0,5)$$,'P0001','invalid_catalog_filter','unrelated category validation keeps catalog error');

select * from finish();
rollback;
