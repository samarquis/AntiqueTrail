begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

select has_type('app_public','catalog_nearby_list_row','Nearby list projection type exists');
select has_function('app_public','catalog_list_nearby',array['text','text','text','double precision','double precision','integer'],'Nearby reader has one required-argument signature');
select ok((select pronargs=6 and pronargdefaults=0 from pg_proc where oid='app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'Nearby function has six required arguments and no defaults');
select is((select pg_get_userbyid(typowner) from pg_type where oid='app_public.catalog_nearby_list_row'::regtype),'catalog_reader','projection type owner is catalog_reader');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'catalog_reader','Nearby function owner is catalog_reader');
select ok((select prosecdef and provolatile='s' and 'search_path=""'=any(coalesce(proconfig,'{}')) from pg_proc where oid='app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'Nearby reader is stable SECURITY DEFINER with empty search_path');
select ok(exists(select 1 from pg_attribute where attrelid=(select typrelid from pg_type where oid='app_public.catalog_nearby_list_row'::regtype) and attname='device_distance_miles' and atttypid='double precision'::regtype and not attisdropped),'projection includes device_distance_miles');
select ok(has_type_privilege('release_automation','app_public.catalog_nearby_list_row','USAGE'),'release automation has projection type usage');
select ok(not has_type_privilege('anon','app_public.catalog_nearby_list_row','USAGE') and not has_type_privilege('authenticated','app_public.catalog_nearby_list_row','USAGE'),'browser roles have no projection type usage');
select ok(not has_function_privilege('anon','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'anon has no execute grant');
select ok(not has_function_privilege('authenticated','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'authenticated has no execute grant');
select ok(not has_function_privilege('public_catalog_gateway','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'gateway has no direct execute grant');
select ok(has_function_privilege('release_automation','app_public.catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'release automation has execute grant');

insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values('00000000-0000-4000-8000-000000006230','topeka-ks','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
values('00000000-0000-4000-8000-000000006230',true,true,true,true,true);
insert into app_public.catalog_areas(id,slug,label,state_code)
values('99000000-0000-4000-8000-000000006230','issue-623','Issue Region','KS');
insert into app_public.store_categories(id,slug,label)
values('99000000-0000-4000-8000-000000006231','issue-623','Nearby Fixture'),
      ('99000000-0000-4000-8000-000000006232','other-623','Other Fixture');

create temporary table nearby_fixtures(
  id uuid primary key,slug text,name text,synthetic boolean,audience text,
  publication_state app_public.publication_state,latitude numeric,longitude numeric,
  category_slug text,verified_days integer
);
insert into nearby_fixtures values
 ('99000000-0000-4000-8000-000000007001','nearby-623-7001','Nearby Boundary 7001',false,'public','active',0,0,'issue-623',20),
 ('99000000-0000-4000-8000-000000007002','nearby-623-7002','Nearby Boundary 7002',false,'public','active',0,0.0723657921899488,'issue-623',20),
 ('99000000-0000-4000-8000-000000007003','nearby-623-7003','Nearby Boundary 7003',false,'public','active',0,0.0725105237743287,'issue-623',20),
 ('99000000-0000-4000-8000-000000007004','nearby-623-7004','Nearby Boundary 7004',false,'public','active',0,0.3618289609497440,'issue-623',20),
 ('99000000-0000-4000-8000-000000007010','nearby-623-7010','Nearby Boundary Wrong Category',false,'public','active',0,0,'other-623',20),
 ('99000000-0000-4000-8000-000000007011','nearby-623-7011','Unrelated Shop',false,'public','active',0,0,'issue-623',20),
 ('99000000-0000-4000-8000-000000007012','nearby-623-7012','Nearby Boundary Synthetic',true,'synthetic','active',0,0,'issue-623',20),
 ('99000000-0000-4000-8000-000000007013','nearby-623-7013','Nearby Boundary Regional',false,'regional_readiness','active',0,0,'issue-623',20),
 ('99000000-0000-4000-8000-000000007014','nearby-623-7014','Nearby Boundary Inactive',false,'public','hidden',0,0,'issue-623',20),
 ('99000000-0000-4000-8000-000000007015','nearby-623-7015','Nearby Boundary Stale',false,'public','active',0,0,'issue-623',400),
 ('99000000-0000-4000-8000-000000007016','nearby-623-7016','Nearby Boundary No Coordinates',false,'public','active',null,null,'issue-623',20),
 ('99000000-0000-4000-8000-000000007017','nearby-623-7017','Nearby Overdue',false,'public','active',0,0,'issue-623',200);
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
select id,synthetic,audience,publication_state,slug,name,'Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006230',latitude,longitude,'Issue 623 public list fixture','Transaction-isolated Nearby SQL test fixture.'
from nearby_fixtures;
insert into app_public.store_category_assignments(store_id,category_id)
select f.id,c.id from nearby_fixtures f join app_public.store_categories c on c.slug=f.category_slug;
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select f.id,g.group_name,statement_timestamp()-make_interval(days=>f.verified_days),'Nearby fixture','two_person_public_source'
from nearby_fixtures f cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes')) g(group_name);

create temporary table nearby_many(kind text,id uuid primary key);
insert into nearby_many
select 'remote',('99000000-0000-4000-8000-'||lpad((7200+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'overflow',('99000000-0000-4000-8000-'||lpad((7300+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'wrong_category',('99000000-0000-4000-8000-'||lpad((7400+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'wrong_keyword',('99000000-0000-4000-8000-'||lpad((7500+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'synthetic',('99000000-0000-4000-8000-'||lpad((7600+n)::text,12,'0'))::uuid from generate_series(1,51)n;
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
select id,kind='synthetic',case when kind='synthetic' then 'synthetic' else 'public' end,'active','nearby-many-'||kind||'-'||id::text,
 case kind when 'remote' then 'Nearby Boundary Remote '||id::text when 'wrong_category' then 'Nearby Boundary Wrong Category Bulk '||id::text when 'wrong_keyword' then 'Other Query Bulk '||id::text when 'synthetic' then 'Nearby Boundary Synthetic Bulk '||id::text else 'Overflow Fixture '||id::text end,
 'Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006230',case when kind='remote' then 1 else 0 end,0,
 'Issue 623 generated fixture','Transaction-isolated Nearby SQL test fixture.' from nearby_many;
insert into app_public.store_category_assignments(store_id,category_id)
select id,case when kind='wrong_category' then '99000000-0000-4000-8000-000000006232'::uuid else '99000000-0000-4000-8000-000000006231'::uuid end from nearby_many;
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select f.id,g.group_name,statement_timestamp()-interval '20 days','Nearby fixture','two_person_public_source'
from nearby_many f cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes')) g(group_name);

create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql;return false;exception when insufficient_privilege then return true;end $$;
set local role anon;
select ok(pg_temp.denied($$select * from app_public.catalog_list_nearby('Nearby Boundary','issue-623',null,0,0,5)$$),'actual anon execution is denied');
reset role;
set local role authenticated;
select ok(pg_temp.denied($$select * from app_public.catalog_list_nearby('Nearby Boundary','issue-623',null,0,0,5)$$),'actual authenticated execution is denied');
reset role;
set local role public_catalog_gateway;
select ok(pg_temp.denied($$select * from app_public.catalog_list_nearby('Nearby Boundary','issue-623',null,0,0,5)$$),'actual gateway execution is denied');
reset role;
set local role release_automation;
select is((select count(*)::integer from app_public.catalog_list_nearby(' Nearby   Boundary ','issue-623',null,0,0.000004207810051198857,5)),2,'release automation executes normalized Nearby query');
reset role;

create temporary table nearby_5 as select * from app_public.catalog_list_nearby(' Nearby   Boundary ','issue-623',null,0,0.000004207810051198857,5);
select is((select array_agg(id order by id) from nearby_5),array['99000000-0000-4000-8000-000000007001'::uuid,'99000000-0000-4000-8000-000000007002'::uuid],'five-mile radius includes center and exact boundary only');
select ok(abs((select device_distance_miles from nearby_5 where id='99000000-0000-4000-8000-000000007002')-5.0)<0.0001,'five-mile boundary distance is reported within tolerance');
select is((select count(*)::integer from nearby_5 where id in ('99000000-0000-4000-8000-000000007003','99000000-0000-4000-8000-000000007004')),0,'distance tolerance does not widen radius inclusion');
select is((select array_agg(id order by ordinality) from app_public.catalog_list_nearby(' Nearby   Boundary ','issue-623',null,0,0.000004207810051198857,5) with ordinality),array['99000000-0000-4000-8000-000000007001'::uuid,'99000000-0000-4000-8000-000000007002'::uuid],'reader preserves regional name and ID ordering');
select ok((select name='Nearby Boundary 7001' and town='Fixture Town' and state_code='KS' and area_slug='issue-623' and area_label='Issue Region' and summary='Issue 623 public list fixture' and freshness_state='current' and device_distance_miles is not null from nearby_5 where id='99000000-0000-4000-8000-000000007001'),'projection retains normal public catalog fields and adds distance');
select ok(not exists(select 1 from app_public.catalog_list(null,null,null) where id='99000000-0000-4000-8000-000000007001'),'legacy catalog list does not expose public Nearby fixtures');

create temporary table nearby_25 as select * from app_public.catalog_list_nearby('Nearby Boundary','issue-623',null,0,0.000004207810051198857,25);
select is((select array_agg(id order by id) from nearby_25),array['99000000-0000-4000-8000-000000007001'::uuid,'99000000-0000-4000-8000-000000007002'::uuid,'99000000-0000-4000-8000-000000007003'::uuid,'99000000-0000-4000-8000-000000007004'::uuid],'twenty-five-mile radius includes all answer-key fixtures');
select ok(abs((select device_distance_miles from nearby_25 where id='99000000-0000-4000-8000-000000007001')-0.00029073198287901127)<0.0001 and abs((select device_distance_miles from nearby_25 where id='99000000-0000-4000-8000-000000007002')-5.0)<0.0001 and abs((select device_distance_miles from nearby_25 where id='99000000-0000-4000-8000-000000007003')-5.009673078657974)<0.0001 and abs((select device_distance_miles from nearby_25 where id='99000000-0000-4000-8000-000000007004')-24.999781059551804)<0.0001,'Haversine distance reports quantized-coordinate fixtures within 0.0001 miles');
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Boundary','missing-623',null,0,0.000004207810051198857,25)),0,'category filter applies before returned results');
select is((select count(*)::integer from app_public.catalog_list_nearby('Missing Match','issue-623',null,0,0.000004207810051198857,25)),0,'keyword filter applies before returned results');
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Overdue','issue-623',null,0,0.000004207810051198857,5) where id='99000000-0000-4000-8000-000000007017'),1,'overdue stores remain eligible');
select is((select count(*)::integer from nearby_25 where id in ('99000000-0000-4000-8000-000000007010','99000000-0000-4000-8000-000000007011','99000000-0000-4000-8000-000000007012','99000000-0000-4000-8000-000000007013','99000000-0000-4000-8000-000000007014','99000000-0000-4000-8000-000000007015','99000000-0000-4000-8000-000000007016')),0,'wrong category, query, synthetic, non-public, inactive, stale and missing-coordinate stores are excluded');
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Boundary Remote','issue-623',null,0,0.000004207810051198857,5)),0,'51 out-of-radius matches are filtered before the 50-row guard');
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Boundary Wrong Category Bulk','issue-623',null,0,0.000004207810051198857,5)),0,'51 category-excluded matches do not trigger the 50-row guard');
select is((select count(*)::integer from app_public.catalog_list_nearby('Keyword Missing','issue-623',null,0,0.000004207810051198857,5)),0,'51 keyword-nonmatching stores do not trigger the 50-row guard');
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Boundary Synthetic Bulk','issue-623',null,0,0.000004207810051198857,5)),0,'51 non-public stores are excluded before the 50-row guard');
select throws_ok($$select * from app_public.catalog_list_nearby('Overflow Fixture','issue-623',null,0,0.000004207810051198857,5)$$,'P0001','catalog_too_large','51 eligible matching stores trigger the existing catalog guard');

select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,'NaN'::double precision,0,5)$$,'P0001','invalid_nearby_input','non-finite latitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,0,'Infinity'::double precision,5)$$,'P0001','invalid_nearby_input','non-finite longitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,91,0,5)$$,'P0001','invalid_nearby_input','out-of-range latitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,0,181,5)$$,'P0001','invalid_nearby_input','out-of-range longitude is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,null,0,5)$$,'P0001','invalid_nearby_input','null device coordinate is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,null,0,0,15)$$,'P0001','invalid_nearby_input','unsupported radius is rejected');
select throws_ok($$select * from app_public.catalog_list_nearby(null,null,'topeka-ks',0,0,5)$$,'P0001','invalid_nearby_input','Nearby rejects area filters');
select throws_ok($$select * from app_public.catalog_list_nearby(null,'INVALID',null,0,0,5)$$,'P0001','invalid_catalog_filter','unrelated category validation retains catalog error');
select throws_ok($$select * from app_public.catalog_list_nearby(E'bad\nquery',null,null,0,0,5)$$,'P0001','invalid_catalog_filter','unrelated query validation retains catalog error');

update release_private.release_capabilities set public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false where release_id='00000000-0000-4000-8000-000000006230';
select is((select count(*)::integer from app_public.catalog_list_nearby('Nearby Boundary','issue-623',null,0,0.000004207810051198857,25)),0,'disabled public catalog capability returns no rows');
select ok(exists(select 1 from pg_policy where polname='macvicar_general_catalog_exclusion' and polrelid='app_public.stores'::regclass),'curated public-test exclusion policy remains intact');

select * from finish();
rollback;
