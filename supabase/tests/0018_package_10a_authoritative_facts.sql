begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('readiness_private','readiness_fact_collections','authoritative fact collections exist');
select has_table('readiness_private','readiness_fact_events','authoritative per-source facts exist');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='readiness_private' and c.relname='readiness_fact_collections'),'fact collections force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='readiness_private' and c.relname='readiness_fact_events'),'fact events force RLS');
select ok(not has_table_privilege('authenticated','readiness_private.readiness_fact_events','SELECT')
  and not has_table_privilege('authenticated','readiness_private.readiness_fact_events','INSERT'),
  'browser roles cannot read or author readiness facts');
select has_function('readiness_private','begin_fact_collection','service collection function exists');
select has_function('readiness_private','append_authoritative_fact','service fact append function exists');
select has_function('readiness_private','freeze_authoritative_facts','authoritative freeze function exists');
select ok(not has_function_privilege('readiness_calculation_service',
  'readiness_private.freeze_evidence(uuid,bytea,jsonb)','EXECUTE'),
  'the editable aggregate snapshot freeze path is disabled');
select ok(has_function_privilege('readiness_calculation_service',
  'readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamp with time zone)','EXECUTE')
  and not has_function_privilege('authenticated',
  'readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamp with time zone)','EXECUTE'),
  'only the calculation service can append facts');
select ok(exists(select 1 from pg_trigger where tgname='readiness_fact_events_append_only' and not tgisinternal),
  'authoritative facts are append-only');
select ok(not exists(select 1 from information_schema.columns where table_schema='readiness_private'
  and table_name='readiness_fact_events' and column_name in ('completed_journeys','coverage_percent','blockers')),
  'fact storage has no editable aggregate columns');

set local role readiness_calculation_service;
select lives_ok($$select readiness_private.begin_fact_collection(
  '17000000-0000-4000-8000-000000000001')$$,'calculation service begins a fact collection');
select throws_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','journey_attempt','attempt-aggregate',
  '{"completedJourneys":8}'::jsonb,statement_timestamp())$$,'22023',
  'readiness_fact_invalid_or_aggregate_shaped','client-shaped aggregate totals are rejected');
select lives_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','cohort_subject','subject-1',
  '{"subjectId":"subject-1","ageBand":"70+","adaptation":true,"eligible":true}'::jsonb,
  '2026-08-03T11:00:00Z')$$,'a typed eligible cohort subject is accepted before attempts');
select lives_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','journey_attempt','attempt-1',
  '{"subjectId":"subject-1","attemptSequence":1,"attemptedCoreJourney":true,"completedWithoutBlockingDefect":true,"returnIntent":true,"completedSecondTrip":false}'::jsonb,
  '2026-08-03T12:00:00Z')$$,'an individual journey fact is accepted');
select lives_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','journey_attempt','attempt-1',
  '{"subjectId":"subject-1","attemptSequence":1,"attemptedCoreJourney":true,"completedWithoutBlockingDefect":true,"returnIntent":true,"completedSecondTrip":false}'::jsonb,
  '2026-08-03T12:00:00Z')$$,'an exact fact retry is idempotent');
select throws_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','journey_attempt','attempt-1',
  '{"subjectId":"subject-1","attemptSequence":1,"attemptedCoreJourney":true,"completedWithoutBlockingDefect":false,"returnIntent":true,"completedSecondTrip":false}'::jsonb,
  '2026-08-03T12:00:00Z')$$,'22023','readiness_fact_idempotency_mismatch',
  'a duplicate source key cannot edit an authoritative fact');
select lives_ok($$select readiness_private.freeze_authoritative_facts(
  '17000000-0000-4000-8000-000000000001')$$,'the service freezes facts and derives blockers');
select throws_ok($$select readiness_private.append_authoritative_fact(
  '17000000-0000-4000-8000-000000000001','artifact','late-artifact',
  '{"artifactKind":"security","artifactDigest":"late"}'::jsonb,statement_timestamp())$$,
  '55000','readiness_fact_collection_not_collecting','frozen facts cannot be appended or edited');
reset role;

select ok((select blockers @> array['readiness_attempts_below_eight','readiness_completions_below_seven']
  from readiness_private.readiness_runs where run_id='17000000-0000-4000-8000-000000000001'),
  'blockers are derived from the individual journey rows');
select is((select evidence_snapshot->>'schemaVersion' from readiness_private.readiness_runs
  where run_id='17000000-0000-4000-8000-000000000001'),'2','frozen snapshot identifies canonical-facts schema');
select ok((select source_digest=readiness_private.canonical_fact_digest(run_id)
  from readiness_private.readiness_runs where run_id='17000000-0000-4000-8000-000000000001'),
  'the frozen receipt digest is computed from canonical ordered facts');
select ok((select source_digest<>decode(repeat('00',32),'hex') from readiness_private.readiness_runs
  where run_id='17000000-0000-4000-8000-000000000001'),'the caller cannot supply the frozen digest');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_public' and p.proname='readiness_request_signing_challenge'
    and pg_get_functiondef(p.oid) like '%run_row.source_digest%'),
  'one-use signing challenges remain bound to the canonical run digest');
select is((select count(*)::integer from readiness_private.readiness_fact_events
  where run_id='17000000-0000-4000-8000-000000000001'),2,
  'idempotent retry did not duplicate an authoritative fact');

select * from finish();
rollback;
