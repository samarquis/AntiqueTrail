begin;
select plan(36);

select has_schema('trip_private','private trip schema exists');
select has_table('trip_private','trips','trips table exists');
select has_table('trip_private','trip_stops','trip stops table exists');
select has_table('trip_private','trip_invitations','trip invitations table exists');
select has_table('trip_private','trip_participants','trip participants table exists');
select has_table('trip_private','trip_device_bindings','device bindings table exists');
select has_table('trip_private','trip_mutation_receipts','mutation receipts table exists');
select has_table('trip_private','trip_offline_grants','offline grants table exists');
select has_table('trip_private','trip_mutation_conflicts','conflict metadata table exists');
select has_table('trip_private','trip_visit_memories','visit memories table exists');

select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trips'),'trips FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_stops'),'stops FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_invitations'),'invitations FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_participants'),'participants FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_device_bindings'),'bindings FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_mutation_receipts'),'receipts FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_offline_grants'),'offline grants FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_mutation_conflicts'),'conflicts FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='trip_private' and c.relname='trip_visit_memories'),'visit memories FORCE RLS enabled');

select ok(exists(select 1 from pg_policies where schemaname='trip_private' and policyname='trip_owner_or_participant'),'trip reads use owner/participant policy');
select ok(exists(select 1 from pg_policies where schemaname='trip_private' and policyname='stop_member_read'),'stop reads use trip membership policy');
select ok(exists(select 1 from pg_policies where schemaname='trip_private' and policyname='participant_member_read'),'participant reads require membership');
select ok(exists(select 1 from pg_policies where schemaname='trip_private' and policyname='visit_memory_author'),'visit memories are author scoped');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='trip_private' and p.proname='trip_member_can_access'),'server member gate exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='trip_private' and p.proname='trip_owner_can_access'),'server owner gate exists');

select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='trip_private' and grantee in ('anon','authenticated')),'no direct trip table grants');
select ok(not exists(select 1 from information_schema.columns where table_schema='trip_private' and column_name in ('raw_token','password','access_token','refresh_token')),'no bearer/password columns are persisted');
select ok(exists(select 1 from pg_indexes where schemaname='trip_private' and indexname='one_active_offline_grant'),'offline grant is uniquely bounded');
select ok(exists(select 1 from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='trip_private' and r.relname='trip_offline_grants' and pg_get_constraintdef(c.oid) like '%36 hours%'),'offline grant expiry is capped at 36 hours');
select ok(exists(select 1 from pg_indexes where schemaname='trip_private' and tablename='trip_mutation_receipts' and indexdef like '%trip_id%idempotency_key%'),'mutation receipt idempotency key is unique per trip');
select ok(exists(select 1 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='trip_private' and r.relname='trip_participants' and t.tgname='trip_participant_scope'),'participant owner/partner scope trigger exists');
select ok(exists(select 1 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='trip_private' and r.relname='trip_device_bindings' and t.tgname='trip_device_member_scope'),'Navigator membership trigger exists');

set local role anon;
select throws_ok($$select * from trip_private.trips$$,'42501','anonymous trip reads denied');
select throws_ok($$insert into trip_private.trip_invitations(token_hash,recipient_email_hmac,trip_id,expires_at,idempotency_key) values (extensions.digest('x','sha256'),extensions.digest('e','sha256'),'00000000-0000-0000-0000-000000000001',statement_timestamp(),'anon')$$,'42501','anonymous trip invitation writes denied');
reset role;
set local role authenticated;
select throws_ok($$select * from trip_private.trip_stops$$,'42501','authenticated direct stop reads denied');
select throws_ok($$select * from trip_private.trip_mutation_conflicts$$,'42501','authenticated direct conflict reads denied');

select * from finish();
rollback;
