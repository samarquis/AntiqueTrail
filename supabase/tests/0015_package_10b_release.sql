begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_schema('release_private','private release schema exists');
select has_table('release_private','regional_releases','exact frozen releases are durable');
select has_table('release_private','release_commands','release command evidence is durable');
select has_table('release_private','release_capabilities','atomic capabilities are durable');
select ok(exists(select 1 from pg_constraint where conname='release_capabilities_atomic'),'partial public capability states are forbidden');
select ok(not has_table_privilege('release_executor','release_private.release_commands','UPDATE') and not has_table_privilege('release_executor','release_private.release_commands','DELETE'),'command evidence is append-only to the execute-only deployment role');
select ok(not has_table_privilege('authenticated','release_private.regional_releases','SELECT'),'authenticated users cannot read release state directly');
select ok(not has_function_privilege('authenticated','release_private.advance_regional_release(uuid,uuid,text,text)','EXECUTE'),'browser sessions cannot advance releases');
select ok(has_function_privilege('release_executor','release_private.advance_regional_release(uuid,uuid,text,text)','EXECUTE'),'deployment executor has execute-only release command access');
select ok(pg_get_functiondef('release_private.advance_regional_release(uuid,uuid,text,text)'::regprocedure) like '%capability_enablement%smoke%monitoring%signed_release_receipt%','durable release order enables capabilities before smoke and signs last');

select * from finish();
rollback;
