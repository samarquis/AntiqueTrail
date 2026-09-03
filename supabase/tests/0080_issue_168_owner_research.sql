begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

select has_table('research_private','owner_research_artifacts','verified artifact registry exists');
select has_table('research_private','owner_research_cohort_grants','research cohort grants are private');
select has_table('research_private','owner_intakes','shared owner intake state is audience-neutral');
select has_table('research_private','owner_research_minimized_outcomes','minimized outcomes exist');
select has_table('research_private','owner_research_teardown_receipts','idempotent teardown receipts exist');
select has_function('app_public','owner_research_command',array['text','text','text','jsonb'],'bounded research wrapper exists');
select has_function('app_public','owner_intake_command',array['text','jsonb'],'capability-gated public wrapper exists');
select has_function('research_private','owner_intake_apply',array['uuid','uuid','text','text','jsonb'],'shared intake transaction exists');
select ok(not has_table_privilege('authenticated','research_private.owner_intakes','SELECT')
  and not has_table_privilege('authenticated','research_private.owner_research_cohort_grants','SELECT'),
  'browser roles have no direct private-table access');
select ok(not has_function_privilege('authenticated','research_private.owner_intake_apply(uuid,uuid,text,text,jsonb)','EXECUTE'),
  'browser roles cannot invoke the shared transaction');
select ok(position('research_private.owner_intake_apply' in pg_get_functiondef('app_public.owner_research_command(text,text,text,jsonb)'::regprocedure))>0
  and position('research_private.owner_intake_apply' in pg_get_functiondef('app_public.owner_intake_command(text,jsonb)'::regprocedure))>0,
  'research and public wrappers call the same state transaction');
select ok(position('public_capability_enabled' in pg_get_functiondef('app_public.owner_intake_command(text,jsonb)'::regprocedure))>0
  and position('submit_listing_claim' in pg_get_functiondef('app_public.owner_intake_command(text,jsonb)'::regprocedure))>0
  and position('partner_safe_command' in pg_get_functiondef('app_public.owner_intake_command(text,jsonb)'::regprocedure))>0,
  'public wrapper has real capability-gated claim and add-store effects');
select ok(position('current_session_is_active' in pg_get_functiondef('app_public.owner_research_command(text,text,text,jsonb)'::regprocedure))>0,
  'research admission requires the live server session registry');

insert into auth.users(id) values
  ('80000000-0000-4000-8000-000000000001'),('80000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003');
set local role identity_service;
insert into app_private.profiles(user_id) values
  ('80000000-0000-4000-8000-000000000001'),('80000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003') on conflict(user_id) do nothing;
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at)
values
  ('81000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('81000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('81000000-0000-4000-8000-000000000003','80000000-0000-4000-8000-000000000003',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');
reset role;

set local role service_role;
insert into research_private.owner_research_artifacts(artifact_digest,deployment_id,manifest_file_count,research_receipt_at)
values('sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','dpl_issue168',4,statement_timestamp());
select throws_ok($$insert into research_private.owner_research_cohort_grants(user_id,cohort_key,run_id,artifact_digest,consented_at,expires_at)
  values('80000000-0000-4000-8000-000000000003','topeka-owner-10a','80000000-0000-4000-8000-000000000031',
  'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',statement_timestamp(),statement_timestamp()+interval '1 day')$$,
  '23503',null,'a grant cannot bind an unverified operator-supplied digest');
insert into research_private.owner_research_cohort_grants(grant_id,user_id,cohort_key,run_id,artifact_digest,consented_at,expires_at)
values
  ('80000000-0000-4000-8000-000000000010','80000000-0000-4000-8000-000000000001','topeka-owner-10a','80000000-0000-4000-8000-000000000011','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',statement_timestamp()-interval '1 day',statement_timestamp()+interval '7 days'),
  ('80000000-0000-4000-8000-000000000020','80000000-0000-4000-8000-000000000002','topeka-owner-10a','80000000-0000-4000-8000-000000000021','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',statement_timestamp()-interval '1 day',statement_timestamp()+interval '7 days');
reset role;

create temp table owner_effect_baseline as select
  (select count(*) from app_public.stores) stores,
  (select count(*) from partner_private.listing_claims) claims,
  (select count(*) from partner_private.store_partner_grants) grants;

select set_config('request.jwt.claims','{}',true); set local role anon;
select throws_ok($$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','anonymous admission is generically denied'); reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('resume','sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','wrong artifact digest is denied');
select throws_ok($$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','wrong-cohort','{}')$$,
  '42501','owner_research_unavailable','wrong cohort is denied');
select is(app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state','ready','admitted run resumes before start');
select is(app_public.owner_research_command('start','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{"kind":"existing_claim"}')->>'kind','existing_claim','existing claim starts');
select is(app_public.owner_research_command('save','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a',
  '{"draft":{"fixture":"existing-store-a","relationship":"manager","ownerFactsConfirmed":true,"reviewedFactsUnderstood":true}}')->'draft'->>'relationship','manager','fixed safe draft saves');
select is(app_public.owner_research_command('submit','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state','submitted','complete research draft submits');
select is(app_public.owner_research_command('submit','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state','submitted','research submit retry is idempotent');
select throws_ok($$select app_public.owner_research_command('save','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a',
  '{"draft":{"fixture":"real-store","relationship":"owner","ownerFactsConfirmed":true,"reviewedFactsUnderstood":true}}')$$,
  '42501','owner_research_unavailable','real or mutated fixture is denied'); reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000003","session_id":"81000000-0000-4000-8000-000000000003"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','wrong account cannot replay another grant'); reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000002","session_id":"81000000-0000-4000-8000-000000000002"}',true); set local role authenticated;
select is(app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state','ready','second participant sees own empty run');
select is(app_public.owner_research_command('start','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{"kind":"add_store"}')->>'kind','add_store','add-store scenario starts'); reset role;

select is((select count(*)::integer from research_private.owner_intakes where run_id in('80000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000021')),2,'one intake per research run');
select is((select count(distinct applicant_id)::integer from research_private.owner_intakes where audience='synthetic'),2,'research runs remain applicant-namespaced');
select is((select count(*)::integer from research_private.owner_intakes where audience<>'synthetic'),0,'research wrapper creates only Synthetic state');
select is((select count(*) from app_public.stores),(select stores from owner_effect_baseline),'research creates no canonical store');
select is((select count(*) from partner_private.listing_claims),(select claims from owner_effect_baseline),'research creates no listing claim');
select is((select count(*) from partner_private.store_partner_grants),(select grants from owner_effect_baseline),'research creates no Representative grant');

update research_private.owner_research_cohort_grants set state='revoked' where user_id='80000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000002","session_id":"81000000-0000-4000-8000-000000000002"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('status','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','revoked grant is denied'); reset role;

update research_private.owner_research_cohort_grants set expires_at=statement_timestamp()-interval '1 second' where user_id='80000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('status','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','expired grant is denied'); reset role;
update research_private.owner_research_cohort_grants set expires_at=statement_timestamp()+interval '7 days' where user_id='80000000-0000-4000-8000-000000000001';

set local role identity_service; update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),revocation_reason='test' where session_id='81000000-0000-4000-8000-000000000001'; reset role;
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('save','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a',
  '{"draft":{"fixture":"existing-store-a","relationship":"owner","ownerFactsConfirmed":true,"reviewedFactsUnderstood":true}}')$$,
  '42501','owner_research_unavailable','revoked application session blocks research writes'); reset role;
set local role identity_service; update app_private.active_sessions set state='active',revoked_at=null,revocation_reason=null where session_id='81000000-0000-4000-8000-000000000001'; reset role;

set local role identity_service;
select is(research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','synthetic','start',
  '{"kind":"add_store","initialDraft":{"value":"same"}}')->>'state','draft','shared machine starts Synthetic audience');
select is(research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','public','start',
  '{"kind":"add_store","initialDraft":{"value":"same"}}')->>'state','draft','shared machine starts public audience');
select is(research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','synthetic','save','{"draft":{"value":"saved"}}')->>'state',
  research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','public','save','{"draft":{"value":"saved"}}')->>'state','save transition is audience-parity');
select is(research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','synthetic','submit','{}')->>'state',
  research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','public','submit','{}')->>'state','submit transition is audience-parity');
select is(research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','synthetic','status','{}')->>'state',
  research_private.owner_intake_apply('80000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000002','public','status','{}')->>'state','status behavior is audience-parity');
reset role;

set local role service_role;
create temp table teardown_result as select app_public.owner_research_teardown(
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',(select research_receipt_at from research_private.owner_research_artifacts where artifact_digest='sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),statement_timestamp()) value;
select is(value->>'revoked','true','teardown revokes and purges before deployment deletion') from teardown_result;
select matches(value->>'receiptDigest','^sha256:[0-9a-f]{64}$','teardown returns a verifiable receipt') from teardown_result;
select is(app_public.owner_research_teardown('sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  (select research_receipt_at from research_private.owner_research_artifacts where artifact_digest='sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),statement_timestamp())->>'receiptDigest',
  (select value->>'receiptDigest' from teardown_result),'teardown retry returns the same receipt');
reset role;
select is((select count(*)::integer from research_private.owner_research_cohort_grants),0,'teardown removes all artifact grants');
select is((select count(*)::integer from research_private.owner_intakes where run_id in('80000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000021')),0,'teardown purges artifact run state');
select is((select count(*)::integer from research_private.owner_research_minimized_outcomes),2,'teardown retains one minimized outcome per research run');
select is((select state from research_private.owner_research_artifacts where artifact_digest='sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'torn_down','artifact is durably marked torn down');
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001","session_id":"81000000-0000-4000-8000-000000000001"}',true); set local role authenticated;
select throws_ok($$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','torn-down grant cannot be replayed'); reset role;

select * from finish();
rollback;
