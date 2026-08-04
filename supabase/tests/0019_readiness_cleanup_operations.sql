begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_function('readiness_private','authoritative_fact_shape_valid',array['text','text','jsonb'],'typed fact validator exists');
select ok(not readiness_private.authoritative_fact_shape_valid('cohort_subject','s1',
  '{"subjectId":"s1","ageBand":"70+","adaptation":true,"eligible":true,"selectedFirstEight":true}'::jsonb),
  'callers cannot self-select the first eight');
select ok(readiness_private.authoritative_fact_shape_valid('cohort_subject','s1',
  '{"subjectId":"s1","ageBand":"70+","adaptation":true,"eligible":true}'::jsonb),
  'bounded cohort shape is accepted');
select ok((select pg_get_functiondef(p.oid) like '%count(distinct concat(payload->>''reviewerId''%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='readiness_private' and p.proname='calculate_authoritative_blockers'),
  'CAT-01 requires all six reviewer/listing pairs');
select ok((select pg_get_functiondef(p.oid) like '%count(distinct payload->>''storeSetDigest'')%'
  and pg_get_functiondef(p.oid) like '%count(distinct payload->>''namedDay'')%'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='readiness_private' and p.proname='calculate_authoritative_blockers'),
  'itinerary gate requires unique store sets across all three named days');
select has_function('candidate_private','expire_candidate_shares',array['timestamp with time zone','integer'],'expiry producer exists');
select has_function('candidate_private','fail_candidate_cleanup',array['uuid','uuid','timestamp with time zone','text'],'durable failure command exists');
select has_table('candidate_private','candidate_cleanup_operations_cases','exhausted cleanup opens a durable operations case');
select has_function('app_public','expire_candidate_shares',array['timestamp with time zone','integer'],'exposed cleanup expiry wrapper exists');
select has_function('app_public','claim_candidate_cleanup',array['timestamp with time zone','integer'],'exposed cleanup claim wrapper exists');
select ok(not has_function_privilege('authenticated','app_public.claim_candidate_cleanup(timestamp with time zone,integer)','EXECUTE'),
  'browser roles cannot invoke cleanup worker commands');
select ok(has_function_privilege('candidate_cleanup_service','candidate_private.expire_candidate_shares(timestamp with time zone,integer)','EXECUTE'),
  'cleanup service can produce expiry work');
select ok(not has_table_privilege('candidate_cleanup_service','candidate_private.candidate_cleanup_jobs','UPDATE'),
  'cleanup service still has no direct queue mutation');

insert into auth.users(id) values('18000000-0000-4000-8000-000000000001');
insert into candidate_private.candidate_links(candidate_id,owner_user_id,title)
values('18000000-0000-4000-8000-000000000010','18000000-0000-4000-8000-000000000001','Expired');
insert into candidate_private.candidate_shares(share_id,candidate_id,sender_id,recipient_email_hmac,expires_at)
values('18000000-0000-4000-8000-000000000100','18000000-0000-4000-8000-000000000010',
  '18000000-0000-4000-8000-000000000001',decode(repeat('11',32),'hex'),'2026-08-01T00:00:00Z');
set local role candidate_cleanup_service;
select is(candidate_private.expire_candidate_shares('2026-08-03T00:00:00Z',10),1,'scheduler closes expired pending share');
reset role;
select is((select terminal_reason from candidate_private.candidate_cleanup_jobs where share_id='18000000-0000-4000-8000-000000000100'),'expired','expiry enqueues durable cleanup');
select is((select count(*)::integer from candidate_private.claim_candidate_cleanup('2026-08-03T00:00:00Z',1)),1,'expiry work is claimable');
select is(candidate_private.fail_candidate_cleanup('18000000-0000-4000-8000-000000000100',
  (select claim_token from candidate_private.candidate_cleanup_jobs where share_id='18000000-0000-4000-8000-000000000100'),
  '2026-08-03T00:00:01Z','storage_unavailable'),'pending','failure schedules bounded retry');
select ok((select cleanup_due_at>'2026-08-03T00:00:01Z' and last_error_code='storage_unavailable'
  from candidate_private.candidate_cleanup_jobs where share_id='18000000-0000-4000-8000-000000000100'),
  'retry state and safe error code are durable');

select * from finish();
rollback;
