begin;
select plan(24);

select has_schema('shopper_private','shopper-private schema exists');
select has_table('shopper_private','saved_stores','saved stores table exists');
select has_table('shopper_private','private_store_memories','private memories table exists');
select has_table('shopper_private','catalog_last_seen','last-seen table exists');
select has_table('shopper_private','catalog_new_dismissals','dismissals table exists');
select has_table('shopper_private','store_correction_reports','correction reports table exists');
select has_table('shopper_private','correction_case_events','correction events table exists');

select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='saved_stores'),'saved stores FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='private_store_memories'),'private memories FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='catalog_last_seen'),'last-seen FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='catalog_new_dismissals'),'dismissals FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='store_correction_reports'),'corrections FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='shopper_private' and c.relname='correction_case_events'),'correction events FORCE RLS enabled');

select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_saved_stores_owner' and coalesce(qual,'') like '%current_session_is_active%'),'saved stores require active owner session');
select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_memories_owner' and coalesce(qual,'') like '%current_session_is_active%'),'memories require active owner session');
select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_last_seen_owner' and coalesce(qual,'') like '%current_session_is_active%'),'last-seen requires active owner session');
select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_dismissals_owner' and coalesce(qual,'') like '%current_session_is_active%'),'dismissals require active owner session');
select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_correction_report_owner_read' and coalesce(qual,'') like '%current_session_is_active%'),'correction reads require active owner session');
select ok(exists(select 1 from pg_policies where schemaname='shopper_private' and policyname='shopper_correction_report_owner_insert' and coalesce(with_check,'') like '%current_session_is_active%'),'correction writes require active owner session');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='shopper_private' and grantee in ('anon','authenticated') and not (grantee='authenticated' and table_name='private_memory_merge_conflicts' and privilege_type='SELECT')),'only the exact owner-scoped merge-conflict projection has an authenticated table grant');

set local role anon;
select throws_ok($$select * from shopper_private.saved_stores$$,'42501',null,'anonymous saved-store read denied');
select throws_ok($$insert into shopper_private.store_correction_reports(reporter_user_id,store_id,correction_type,description) values ('00000000-0000-0000-0000-000000000001','00000000-0000-4000-8000-000000001001','hours','wrong')$$,'42501',null,'anonymous correction write denied');
reset role;
set local role authenticated;
select throws_ok($$select * from shopper_private.private_store_memories$$,'42501',null,'authenticated direct memory read denied');
select throws_ok($$select * from shopper_private.correction_case_events$$,'42501',null,'authenticated correction event read denied');

select * from finish();
rollback;
