begin;
select plan(13);

select has_schema('app_public', 'catalog schema exists');
select has_table('app_public', 'stores', 'stores table exists');
select has_table('app_public', 'store_weekly_hours', 'weekly hours table exists');
select has_function('app_public', 'catalog_list', 'bounded catalog_list exists');
select has_function('app_public', 'catalog_details', 'bounded catalog_details exists');

set local role anon;
select throws_ok($$select * from app_public.catalog_list(null,null,null)$$,'42501',null,'anonymous callers cannot bypass the catalog gateway');
select throws_ok($$select * from app_public.catalog_details('clockwork-cabinet')$$,'42501',null,'anonymous detail reads cannot bypass the catalog gateway');
select throws_ok($$select count(*) from app_public.stores$$, '42501',null, 'anonymous base-table reads are denied');
select throws_ok($$insert into app_public.catalog_areas(slug,label,state_code) values ('blocked','Blocked','KS')$$, '42501',null, 'anonymous writes are denied');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('0',64),'list','{}')$$,'42501',null,'anonymous callers cannot invoke the server gateway role');

reset role;
set local role public_catalog_gateway;
select is(jsonb_array_length(app_public.public_catalog_gateway_request(repeat('0',64),'list','{}')),0,'gateway hides synthetic stores from the public catalog');
select is(jsonb_array_length(app_public.public_catalog_gateway_request(repeat('1',64),'list','{"p_q":"clockwork"}')),0,'bounded search does not bypass the public-release gate');
select throws_ok($$select app_public.public_catalog_gateway_request(repeat('2',64),'list',jsonb_build_object('p_q',repeat('x',101)))$$,'P0001',null,'excessive search input is rejected');

reset role;
select * from finish();
rollback;
