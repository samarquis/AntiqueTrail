begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_schema('release_private','private release schema exists');
select has_table('release_private','regional_releases','exact frozen releases are durable');
select has_table('release_private','release_commands','release command evidence is durable');
select has_table('release_private','release_capabilities','atomic capabilities are durable');
select ok(exists(select 1 from pg_constraint where conname='release_capabilities_atomic'),'partial public capability states are forbidden');
select ok(not has_table_privilege('release_executor','release_private.release_commands','UPDATE') and not has_table_privilege('release_executor','release_private.release_commands','DELETE'),'command evidence is append-only to the execute-only deployment role');
select ok(not has_table_privilege('authenticated','release_private.regional_releases','SELECT'),'authenticated users cannot read release state directly');
select has_table('release_private','release_evidence_receipts','externally verified release evidence is durable');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='release_private' and p.proname='advance_regional_release'),'stepwise public activation is absent');
select ok(not has_function_privilege('authenticated','release_private.promote_regional_release(uuid,uuid,uuid[])','EXECUTE'),'browser sessions cannot promote releases');
select ok(has_function_privilege('release_executor','release_private.promote_regional_release(uuid,uuid,uuid[])','EXECUTE'),'deployment executor has execute-only atomic promotion access');
select ok((select r.rolsuper=false and r.rolbypassrls=false and r.rolcanlogin=false from pg_roles r where r.rolname='release_automation'),'release functions use a dedicated constrained owner');

select * from finish();
rollback;
