begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('readiness_private','readiness_cohorts','exact readiness cohorts exist');
select has_table('readiness_private','readiness_admin_responsibility_grants','responsibility grants are durable');
select has_table('readiness_private','readiness_subjects','cohort subjects are durable');
select has_table('readiness_private','readiness_invitations','invitations are durable');
select has_table('readiness_private','readiness_visibility_grants','visibility grants are durable');
select has_table('readiness_private','readiness_admin_runs','admin runs are durable');
select has_table('readiness_private','readiness_admin_signing_capabilities','one-use signing capabilities are durable');

select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_cohorts'),'cohort table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_admin_responsibility_grants'),'responsibility table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_subjects'),'subject table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_invitations'),'invitation table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_visibility_grants'),'visibility table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_admin_runs'),'admin run table force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private' and c.relname='readiness_admin_signing_capabilities'),'capability table force RLS');

select ok(not has_table_privilege('authenticated','readiness_private.readiness_cohorts','SELECT'),'authenticated cannot read cohorts directly');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_admin_responsibility_grants','SELECT'),'authenticated cannot read responsibility grants');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_subjects','SELECT'),'authenticated cannot read subjects directly');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_invitations','SELECT'),'authenticated cannot read invitations directly');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_visibility_grants','SELECT'),'authenticated cannot read visibility grants');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_admin_runs','SELECT'),'authenticated cannot read admin runs directly');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_admin_signing_capabilities','SELECT'),'authenticated cannot read signing capabilities');

select has_function('app_public','readiness_admin_workspace',array['uuid','uuid'],'bounded workspace RPC exists');
select has_function('app_public','readiness_admin_create_invitation',array['uuid','text','text','integer'],'invitation RPC exists');
select has_function('app_public','readiness_admin_revoke_invitation',array['uuid','bigint'],'revoke RPC exists');
select has_function('app_public','readiness_admin_exclude_subject',array['uuid','text','bigint'],'exclude RPC exists');
select has_function('app_public','readiness_admin_calculate_gate',array['uuid'],'calculate RPC exists');
select has_function('app_public','readiness_admin_freeze_receipt',array['uuid'],'freeze RPC exists');
select has_function('app_public','readiness_admin_request_signing_capability',array['uuid','text'],'exact ProductOwner capability RPC exists');
select has_function('app_public','readiness_admin_decide_receipt',array['text','text','text','text','text','text','text'],'decision RPC exists');

select ok(not has_function_privilege('anon','app_public.readiness_admin_create_invitation(uuid,text,text,integer)','EXECUTE')
  and has_function_privilege('authenticated','app_public.readiness_admin_create_invitation(uuid,text,text,integer)','EXECUTE'),
  'only authenticated callers reach the invitation RPC');
select ok(not exists(select 1 from information_schema.columns where table_schema='readiness_private'
  and table_name in ('readiness_invitations','readiness_subjects','readiness_admin_responsibility_grants','readiness_admin_signing_capabilities')
  and column_name in ('raw_token','token','email','email_address','precise_location','private_notes')),
  'private cohort tables exclude raw token/email/location payloads');

select throws_ok($$select app_public.readiness_admin_workspace(null,null)$$,'42501','readiness_admin_access_denied','unauthenticated workspace access denies');
select throws_ok($$select app_public.readiness_admin_create_invitation('00000000-0000-0000-0000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','test-key')$$,'42501','readiness_admin_access_denied','unauthenticated invitation creation denies');
select throws_ok($$select app_public.readiness_admin_request_signing_capability('00000000-0000-0000-0000-000000000001',repeat('a',64))$$,'42501','readiness_signing_denied','unauthenticated signing denies');

select * from finish();
rollback;
