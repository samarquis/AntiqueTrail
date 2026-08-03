begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('readiness_private','readiness_runs','frozen readiness runs are durable');
select has_table('readiness_private','readiness_signing_challenges','one-use challenges are durable');
select has_table('readiness_private','readiness_receipts','verified receipts are durable');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='readiness_private' and c.relname='readiness_runs'),'runs force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='readiness_private' and c.relname='readiness_signing_challenges'),'challenges force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='readiness_private' and c.relname='readiness_receipts'),'receipts force RLS');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_runs','SELECT')
  and not has_table_privilege('authenticated','readiness_private.readiness_receipts','INSERT'),
  'browser roles cannot read or write readiness tables directly');
select has_function('readiness_private','freeze_evidence','calculation service freeze function exists');
select has_function('readiness_private','consume_signing_challenge','signature service consume function exists');
select has_function('app_public','readiness_get_status','bounded status RPC exists');
select has_function('app_public','readiness_request_signing_challenge','bounded challenge RPC exists');
select ok(has_function_privilege('readiness_calculation_service','readiness_private.freeze_evidence(uuid,bytea,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','readiness_private.freeze_evidence(uuid,bytea,jsonb)','EXECUTE'),
  'only the calculation service can freeze evidence');
select ok(has_function_privilege('readiness_signature_service','readiness_private.consume_signing_challenge(uuid,bytea,bytea,text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','readiness_private.consume_signing_challenge(uuid,bytea,bytea,text,text,text)','EXECUTE'),
  'only the signature service can consume verified signatures');
select ok(not exists(select 1 from information_schema.columns
  where table_schema='readiness_private' and column_name='signature_verified'),
  'no client-authored signatureVerified boolean is persisted');
select ok(exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='readiness_private'
    and c.relname='readiness_receipts' and t.tgname='readiness_receipts_append_only'),
  'verified receipts are append-only');
select ok(exists(select 1 from pg_indexes where schemaname='readiness_private'
  and indexname='readiness_one_live_challenge_per_run_signer'),
  'only one live challenge can exist per run and signer');

set local role authenticated;
select throws_ok($$select app_public.readiness_get_status('00000000-0000-4000-8000-000000000001')$$,
  '42501','readiness_access_denied','status route fails closed without an active privileged session');
select throws_ok($$select app_public.readiness_request_signing_challenge('00000000-0000-4000-8000-000000000001')$$,
  '42501','readiness_access_denied','challenge route fails closed without MFA and recent authentication');
reset role;

set local role readiness_calculation_service;
select lives_ok($$select readiness_private.freeze_evidence(
  '10000000-0000-4000-8000-000000000001',decode(repeat('10',32),'hex'),
  '{
    "cat01ReceiptId":"cat01-receipt",
    "cat01ReceiptRecordedByService":true,
    "firstEight":["1","2","3","4","5","6","7","8"],
    "completedJourneys":6,"returnIntents":5,"verifiedListings":12,
    "coveragePercent":70,"freshnessPercent":100,"itineraryCount":9,
    "artifactCount":8,"unresolvedCriticalDefects":0,"prerequisitesPassed":true
  }'::jsonb)$$,'calculation service can freeze evidence without browser-authored blockers');
reset role;
select is((select blockers from readiness_private.readiness_runs
  where run_id='10000000-0000-4000-8000-000000000001'),
  array['readiness_completions_below_seven']::text[],
  'the database calculates blockers from the frozen evidence snapshot');

insert into auth.users(id) values('10000000-0000-4000-8000-000000000002');
insert into readiness_private.readiness_runs(run_id,source_digest,evidence_snapshot,blockers)
values('10000000-0000-4000-8000-000000000003',decode(repeat('11',32),'hex'),'{}'::jsonb,array[]::text[]);
insert into readiness_private.readiness_signing_challenges(
  challenge_id,run_id,signer_user_id,nonce,frozen_digest,payload_digest
) values(
  '10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',decode(repeat('12',32),'hex'),
  decode(repeat('11',32),'hex'),decode(repeat('13',32),'hex')
);
set local role readiness_signature_service;
select lives_ok($$select readiness_private.consume_signing_challenge(
  '10000000-0000-4000-8000-000000000004',decode(repeat('13',32),'hex'),
  decode(repeat('14',32),'hex'),'provider-key-1','verification-1','pass')$$,
  'signature service can atomically consume a provider-verified challenge once');
select throws_ok($$select readiness_private.consume_signing_challenge(
  '10000000-0000-4000-8000-000000000004',decode(repeat('13',32),'hex'),
  decode(repeat('14',32),'hex'),'provider-key-1','verification-1','pass')$$,
  '22023','readiness_challenge_invalid_or_consumed','replaying a consumed challenge is denied');
reset role;

select * from finish();
rollback;
