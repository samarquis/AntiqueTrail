begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_type('app_public','catalog_nearby_list_row','reader reuses the accepted nearby projection');
select has_function('app_public','synthetic_catalog_list_nearby',array['text','text','text','double precision','double precision','integer'],'synthetic Nearby reader has one required-argument signature');
select ok((select pronargs=6 and pronargdefaults=0 from pg_proc where oid='app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'reader has six required arguments and no defaults');
select is((select pg_get_userbyid(typowner) from pg_type where oid='app_public.catalog_nearby_list_row'::regtype),'catalog_reader','accepted projection owner remains catalog_reader');
select is((select pg_get_userbyid(proowner) from pg_proc where oid='app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'catalog_reader','synthetic reader owner is catalog_reader');
select ok((select prosecdef and provolatile='s' and 'search_path=""'=any(coalesce(proconfig,'{}')) from pg_proc where oid='app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure),'reader is stable SECURITY DEFINER with empty search_path');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC has no function EXECUTE grant');
select ok(has_function_privilege('synthetic_catalog_automation','app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'synthetic automation has function EXECUTE');
select ok(not has_function_privilege('anon','app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'anon has no function EXECUTE');
select ok(not has_function_privilege('authenticated','app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'authenticated has no function EXECUTE');
select ok(not has_function_privilege('public_catalog_gateway','app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)','EXECUTE'),'gateway has no direct function EXECUTE');
select ok(has_type_privilege('synthetic_catalog_automation','app_public.catalog_nearby_list_row','USAGE'),'synthetic automation can use the result type');
select ok(has_type_privilege('release_automation','app_public.catalog_nearby_list_row','USAGE'),'existing release automation type grant remains');
select ok(not has_type_privilege('anon','app_public.catalog_nearby_list_row','USAGE') and not has_type_privilege('authenticated','app_public.catalog_nearby_list_row','USAGE'),'browser roles have no result type usage');
select ok(position('public_capability_enabled' in lower(pg_get_functiondef('app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure)))=0,'reader does not consult the public catalog capability');
select ok(position('insert ' in lower(pg_get_functiondef('app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure)))=0 and position('update ' in lower(pg_get_functiondef('app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure)))=0 and position('delete ' in lower(pg_get_functiondef('app_public.synthetic_catalog_list_nearby(text,text,text,double precision,double precision,integer)'::regprocedure)))=0,'reader performs no writes or persistence');
select ok(exists(select 1 from pg_attribute where attrelid=(select typrelid from pg_type where oid='app_public.catalog_nearby_list_row'::regtype) and attname='device_distance_miles' and atttypid='double precision'::regtype and not attisdropped),'accepted projection includes device_distance_miles');

insert into app_public.catalog_areas(id,slug,label,state_code)
values('99000000-0000-4000-8000-000000006350','issue-635-synth','Issue 635 Synthetic Region','KS');
insert into app_public.store_categories(id,slug,label)
values('99000000-0000-4000-8000-000000006351','issue-635-synth','Nearby Fixture'),
      ('99000000-0000-4000-8000-000000006352','other-635-synth','Other Fixture');

create temporary table nearby_fixtures(
  id uuid primary key,slug text,name text,synthetic boolean,audience text,
  publication_state app_public.publication_state,latitude numeric(8,5),longitude numeric(8,5),
  category_slug text,verified_days integer
);
insert into nearby_fixtures values
 ('99000000-0000-4000-8000-000000007101','nearby-635-7101','Nearby Boundary Pair 7101',true,'synthetic','active',0,0,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007102','nearby-635-7102','Nearby Boundary Pair 7102',true,'synthetic','active',0,0.001,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007103','nearby-635-7103','Nearby Boundary Edge',true,'synthetic','active',0,0.07237,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007104','nearby-635-7104','Nearby Boundary Outside',true,'synthetic','active',0,0.07251,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007105','nearby-635-7105','Nearby Boundary Pair Public',false,'public','active',0,0,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007106','nearby-635-7106','Nearby Boundary Pair Wrong Category',true,'synthetic','active',0,0,'other-635-synth',20),
 ('99000000-0000-4000-8000-000000007107','nearby-635-7107','Unrelated Shop',true,'synthetic','active',0,0,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007108','nearby-635-7108','Nearby Boundary Inactive',true,'synthetic','hidden',0,0,'issue-635-synth',20),
 ('99000000-0000-4000-8000-000000007109','nearby-635-7109','Nearby Boundary Stale',true,'synthetic','active',0,0,'issue-635-synth',400),
 ('99000000-0000-4000-8000-000000007110','nearby-635-7110','Nearby Boundary Overdue',true,'synthetic','active',0,0,'issue-635-synth',200),
 ('99000000-0000-4000-8000-000000007111','nearby-635-7111','Nearby Boundary No Coordinates',true,'synthetic','active',null,null,'issue-635-synth',20);
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
select id,synthetic,audience,publication_state,slug,name,'Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006350',latitude,longitude,'Issue 635 synthetic Nearby fixture','Transaction-isolated synthetic Nearby SQL test fixture.' from nearby_fixtures;
insert into app_public.store_category_assignments(store_id,category_id)
select f.id,c.id from nearby_fixtures f join app_public.store_categories c on c.slug=f.category_slug;
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select f.id,g.group_name,statement_timestamp()-make_interval(days=>f.verified_days),'Synthetic Nearby fixture','two_person_public_source'
from nearby_fixtures f cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes')) g(group_name);
update app_public.stores set phone='555-555-0135',website='https://nearby-635.example'
where id='99000000-0000-4000-8000-000000007101';
insert into app_public.store_media(store_id,asset_path,kind,alt_text)
values('99000000-0000-4000-8000-000000007101','/assets/nearby-635-cover.webp','cover','Nearby fixture cover');

create temporary table nearby_many(kind text,id uuid primary key);
insert into nearby_many
select 'remote',('99000000-0000-4000-8000-'||lpad((7800+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'overflow',('99000000-0000-4000-8000-'||lpad((7900+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'wrong_category',('99000000-0000-4000-8000-'||lpad((8000+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'wrong_query',('99000000-0000-4000-8000-'||lpad((8100+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'inactive',('99000000-0000-4000-8000-'||lpad((8200+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'stale',('99000000-0000-4000-8000-'||lpad((8300+n)::text,12,'0'))::uuid from generate_series(1,51)n
union all select 'public',('99000000-0000-4000-8000-'||lpad((8400+n)::text,12,'0'))::uuid from generate_series(1,51)n;
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
select id,kind<>'public',case when kind='public' then 'public' else 'synthetic' end,
 case when kind='inactive' then 'hidden'::app_public.publication_state else 'active'::app_public.publication_state end,
 'nearby-many-'||kind||'-'||id::text,
 case kind when 'remote' then 'Nearby Bulk Remote '||id::text when 'wrong_category' then 'Nearby Bulk Wrong Category '||id::text when 'wrong_query' then 'Other Bulk Query '||id::text when 'inactive' then 'Nearby Bulk Inactive '||id::text when 'stale' then 'Nearby Bulk Stale '||id::text when 'public' then 'Nearby Bulk Public '||id::text else 'Nearby Bulk Overflow '||id::text end,
 'Fixture Town','KS','1 Test Street','99000000-0000-4000-8000-000000006350',case when kind='remote' then 1 else 0 end,0,
 'Issue 635 generated fixture','Transaction-isolated synthetic Nearby SQL test fixture.' from nearby_many;
insert into app_public.store_category_assignments(store_id,category_id)
select id,case when kind='wrong_category' then '99000000-0000-4000-8000-000000006352'::uuid else '99000000-0000-4000-8000-000000006351'::uuid end from nearby_many;
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select f.id,g.group_name,statement_timestamp()-case when f.kind='stale' then interval '400 days' else interval '20 days' end,'Synthetic Nearby fixture','two_person_public_source'
from nearby_many f cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes')) g(group_name);

create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql;return false;exception when insufficient_privilege then return true;end $$;
set local role anon;
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,5)$$),'actual anon execution is denied');
reset role;
set local role authenticated;
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,5)$$),'actual authenticated execution is denied');
reset role;
set local role public_catalog_gateway;
select ok(pg_temp.denied($$select * from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,5)$$),'actual gateway execution is denied');
reset role;
set local role synthetic_catalog_automation;
create temporary table nearby_pair as select * from app_public.synthetic_catalog_list_nearby(' Nearby   Boundary Pair ','issue-635-synth',null,0,0.000004207810051198857,5);
reset role;
select is((select array_agg(id order by id) from nearby_pair),array['99000000-0000-4000-8000-000000007101'::uuid,'99000000-0000-4000-8000-000000007102'::uuid],'reader returns both 7101 and 7102 without actor-specific subset filtering');
select is((select array_agg(id order by ordinality) from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,5) with ordinality),array['99000000-0000-4000-8000-000000007101'::uuid,'99000000-0000-4000-8000-000000007102'::uuid],'reader orders rows by name and ID');
select ok((select id='99000000-0000-4000-8000-000000007101' and slug='nearby-635-7101'
  and name='Nearby Boundary Pair 7101' and town='Fixture Town' and state_code='KS'
  and area_slug='issue-635-synth' and area_label='Issue 635 Synthetic Region' and summary='Issue 635 synthetic Nearby fixture'
  and phone='555-555-0135' and website='https://nearby-635.example' and timezone_name='America/Chicago'
  and cover_asset_path='/assets/nearby-635-cover.webp' and cover_alt_text='Nearby fixture cover'
  and media=jsonb_build_array(jsonb_build_object('src','/assets/nearby-635-cover.webp','alt','Nearby fixture cover','kind','cover'))
  and categories=jsonb_build_array(jsonb_build_object('slug','issue-635-synth','label','Nearby Fixture'))
  and jsonb_typeof(today_hours)='object' and hours_state='unavailable' and is_open_now=false
  and freshness_state='current' and oldest_verified_at<=as_of_utc and device_distance_miles is not null
  from nearby_pair where id='99000000-0000-4000-8000-000000007101'),'projection fields and request distance match accepted Nearby row');
select ok(abs((select device_distance_miles from nearby_pair where id='99000000-0000-4000-8000-000000007102')-0.069)<0.0001,'reader reports Haversine distance in miles');
select ok((select count(*)>=3 from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,5)),'null filters return qualifying synthetic rows without a capability gate');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('No Such Synthetic Nearby Match',null,null,0,0,5)),0,'empty synthetic result stays empty independent of public capability');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Edge','issue-635-synth',null,0,0.000004207810051198857,5) where id='99000000-0000-4000-8000-000000007103'),1,'five-mile boundary is inclusive');
select ok(abs((select device_distance_miles from app_public.synthetic_catalog_list_nearby('Nearby Boundary Edge','issue-635-synth',null,0,0.000004207810051198857,5) where id='99000000-0000-4000-8000-000000007103')-5.0)<0.0001,'boundary reports five-mile Haversine distance');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Outside','issue-635-synth',null,0,0.000004207810051198857,5)),0,'outside-radius row is excluded');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Outside','issue-635-synth',null,0,0.000004207810051198857,10)),1,'ten-mile radius admits outside-five-mile row');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,25)),2,'twenty-five-mile radius accepts the filtered request');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','issue-635-synth',null,0,0.000004207810051198857,50)),2,'fifty-mile radius accepts the filtered request');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Pair','missing-635',null,0,0.000004207810051198857,5)),0,'category mismatch filters before returned rows');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Missing Nearby Keyword','issue-635-synth',null,0,0.000004207810051198857,5)),0,'query mismatch filters before returned rows');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary Overdue','issue-635-synth',null,0,0.000004207810051198857,5) where id='99000000-0000-4000-8000-000000007110'),1,'overdue synthetic stores remain eligible');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Boundary','issue-635-synth',null,0,0.000004207810051198857,5) where id in ('99000000-0000-4000-8000-000000007105','99000000-0000-4000-8000-000000007106','99000000-0000-4000-8000-000000007107','99000000-0000-4000-8000-000000007108','99000000-0000-4000-8000-000000007109','99000000-0000-4000-8000-000000007111')),0,'public, wrong category/query, inactive, stale, and missing-coordinate rows are excluded');

select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Bulk Remote','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 out-of-radius rows are filtered before the cap');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Bulk Wrong Category','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 wrong-category rows do not trip the cap');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Missing Bulk Query','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 wrong-query rows do not trip the cap');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Bulk Inactive','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 inactive rows do not trip the cap');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Bulk Stale','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 stale rows do not trip the cap');
select is((select count(*)::integer from app_public.synthetic_catalog_list_nearby('Nearby Bulk Public','issue-635-synth',null,0,0.000004207810051198857,5)),0,'51 non-synthetic rows do not trip the cap');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby('Nearby Bulk Overflow','issue-635-synth',null,0,0.000004207810051198857,5)$$,'P0001','catalog_too_large','51 eligible synthetic rows trigger the existing catalog cap');

select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,null,0,5)$$,'P0001','invalid_nearby_input','null latitude is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,null,5)$$,'P0001','invalid_nearby_input','null longitude is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,'NaN'::double precision,0,5)$$,'P0001','invalid_nearby_input','NaN latitude is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,'Infinity'::double precision,5)$$,'P0001','invalid_nearby_input','infinite longitude is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,91,0,5)$$,'P0001','invalid_nearby_input','latitude above 90 is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,-181,5)$$,'P0001','invalid_nearby_input','longitude below -180 is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,null)$$,'P0001','invalid_nearby_input','null radius is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,null,0,0,15)$$,'P0001','invalid_nearby_input','unsupported radius is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,null,'topeka-ks',0,0,5)$$,'P0001','invalid_nearby_input','area filter is rejected');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(null,'INVALID',null,0,0,5)$$,'P0001','invalid_catalog_filter','malformed category keeps catalog validation error');
select throws_ok($$select * from app_public.synthetic_catalog_list_nearby(E'bad\nquery',null,null,0,0,5)$$,'P0001','invalid_catalog_filter','malformed query keeps catalog validation error');

select * from finish();
rollback;
