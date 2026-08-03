begin;
select plan(13);

select has_schema('app_public', 'catalog schema exists');
select has_table('app_public', 'stores', 'stores table exists');
select has_table('app_public', 'store_weekly_hours', 'weekly hours table exists');
select has_function('app_public', 'catalog_list', 'bounded catalog_list exists');
select has_function('app_public', 'catalog_details', 'bounded catalog_details exists');

set local role anon;
select is((select count(*)::integer from app_public.catalog_list(null, null, null)), 12, 'anonymous list returns all twelve synthetic stores');
select is((select count(*)::integer from app_public.catalog_list('clockwork', null, null)), 1, 'bounded search matches by name');
select is((select count(*)::integer from app_public.catalog_list(null, 'furniture', 'topeka-ks')), 3, 'exact category and area filters are server-side');
select is((select count(*)::integer from app_public.catalog_details('clockwork-cabinet')), 1, 'details returns an active synthetic store');
select is((select count(*)::integer from app_public.catalog_details('does-not-exist')), 0, 'unknown slug is indistinguishable from hidden');
select throws_ok($$select count(*) from app_public.stores$$, '42501', 'anonymous base-table reads are denied');
select throws_ok($$insert into app_public.catalog_areas(slug,label,state_code) values ('blocked','Blocked','KS')$$, '42501', 'anonymous writes are denied');
select throws_ok($$select * from app_public.catalog_list(repeat('x',101),null,null)$$, 'P0001', 'excessive search input is rejected');

reset role;
select * from finish();
rollback;
