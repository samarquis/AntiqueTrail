begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('research_private','owner_research_cohort_grants','research cohort grants are private');
select has_table('research_private','owner_research_intakes','research intake state is private');
select has_table('research_private','owner_research_minimized_outcomes','minimized teardown outcomes exist');
select has_function('app_public','owner_research_command',array['text','text','text','jsonb'],'bounded research command exists');
select has_function('research_private','owner_intake_apply',array['uuid','uuid','text','text','jsonb'],'shared intake transaction exists');
select ok(
  not has_table_privilege('authenticated','research_private.owner_research_cohort_grants','SELECT')
  and not has_table_privilege('authenticated','research_private.owner_research_intakes','SELECT')
  and not has_table_privilege('authenticated','research_private.owner_research_intakes','INSERT'),
  'browser roles have no direct research-table access'
);
select ok(
  not has_function_privilege('authenticated','research_private.owner_intake_apply(uuid,uuid,text,text,jsonb)','EXECUTE'),
  'browser roles cannot invoke the shared private transaction'
);
select ok(
  position('research_private.owner_intake_apply' in pg_get_functiondef('app_public.owner_research_command(text,text,text,jsonb)'::regprocedure))>0
  and position('research_private.owner_intake_apply' in pg_get_functiondef('app_public.owner_intake_command(text,jsonb)'::regprocedure))>0,
  'research and normal wrappers use the same internal transaction'
);
select ok(
  position($q$p_audience <> 'synthetic'$q$ in pg_get_functiondef('research_private.owner_intake_apply(uuid,uuid,text,text,jsonb)'::regprocedure))>0,
  'the shared transaction fails closed outside the Synthetic boundary'
);

insert into auth.users(id) values
  ('80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000002'),
  ('80000000-0000-4000-8000-000000000003');

set local role service_role;
insert into research_private.owner_research_cohort_grants(
  grant_id,user_id,cohort_key,run_id,artifact_digest,consented_at,expires_at
) values (
  '80000000-0000-4000-8000-000000000010',
  '80000000-0000-4000-8000-000000000001',
  'topeka-owner-10a',
  '80000000-0000-4000-8000-000000000011',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  statement_timestamp()-interval '1 day',statement_timestamp()+interval '7 days'
),(
  '80000000-0000-4000-8000-000000000020',
  '80000000-0000-4000-8000-000000000002',
  'topeka-owner-10a',
  '80000000-0000-4000-8000-000000000021',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  statement_timestamp()-interval '1 day',statement_timestamp()+interval '7 days'
);
reset role;

create temp table owner_research_effect_baseline as
select
  (select count(*) from app_public.stores) store_count,
  (select count(*) from partner_private.listing_claims) claim_count,
  (select count(*) from partner_private.store_partner_grants) grant_count;

select set_config('request.jwt.claims','{}',true);
set local role anon;
select throws_ok(
  $$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','anonymous admission is generically denied'
);
reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select throws_ok(
  $$select app_public.owner_research_command('resume','sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','wrong artifact binding is generically denied'
);
select throws_ok(
  $$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','wrong-cohort','{}')$$,
  '42501','owner_research_unavailable','wrong cohort is generically denied'
);
select is(
  app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state',
  'ready','an admitted run can resume before starting'
);
select is(
  app_public.owner_research_command('start','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{"kind":"existing_claim"}')->>'kind',
  'existing_claim','an admitted run starts the fixed existing-claim scenario'
);
select is(
  app_public.owner_research_command('save','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a',
    '{"draft":{"fixture":"existing-store-a","relationship":"manager","ownerFactsConfirmed":true,"reviewedFactsUnderstood":true}}')->'draft'->>'relationship',
  'manager','safe fixed-fixture draft fields can be saved'
);
select is(
  app_public.owner_research_command('submit','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state',
  'submitted','a complete Synthetic draft can be submitted'
);
select is(
  app_public.owner_research_command('submit','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state',
  'submitted','submission retry is idempotent'
);
select throws_ok(
  $$select app_public.owner_research_command('save','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a',
    '{"draft":{"fixture":"real-store","relationship":"owner","ownerFactsConfirmed":true,"reviewedFactsUnderstood":true}}')$$,
  '42501','owner_research_unavailable','arbitrary or real-store fixture input is denied generically'
);
select throws_ok(
  $$select app_public.owner_intake_command('start','{"kind":"add_store"}')$$,
  '42501','owner_intake_stage_disabled','the normal owner intake remains stage-disabled'
);
reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select is(
  app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')->>'state',
  'ready','a second participant sees only their own empty run'
);
select is(
  app_public.owner_research_command('start','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{"kind":"add_store"}')->>'kind',
  'add_store','an admitted run starts the fixed add-store scenario'
);
reset role;

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000003"}',true);
set local role authenticated;
select throws_ok(
  $$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','an ungranted account cannot replay another participant artifact binding'
);
reset role;

select is((select count(*)::integer from research_private.owner_research_intakes),2,'one intake exists per exact research run');
select is((select count(distinct applicant_id)::integer from research_private.owner_research_intakes),2,'participant runs remain namespaced');
select is((select count(*)::integer from research_private.owner_research_intakes where audience<>'synthetic'),0,'research can create only Synthetic state');
select is((select count(*) from app_public.stores),(select store_count from owner_research_effect_baseline),'research creates no canonical store');
select is((select count(*) from partner_private.listing_claims),(select claim_count from owner_research_effect_baseline),'research creates no real listing claim');
select is((select count(*) from partner_private.store_partner_grants),(select grant_count from owner_research_effect_baseline),'research creates no Representative grant');

update research_private.owner_research_cohort_grants set state='revoked'
where user_id='80000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select throws_ok(
  $$select app_public.owner_research_command('status','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','revoked access is denied without status disclosure'
);
reset role;

update research_private.owner_research_cohort_grants
set expires_at=statement_timestamp()-interval '1 second'
where user_id='80000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select throws_ok(
  $$select app_public.owner_research_command('status','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','expired access is denied without status disclosure'
);
reset role;

set local role service_role;
select is(
  app_public.owner_research_teardown(
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    statement_timestamp()-interval '2 days',statement_timestamp()
  )->>'revoked','true','teardown revokes and purges the exact artifact'
);
reset role;
select is((select count(*)::integer from research_private.owner_research_cohort_grants),0,'teardown removes cohort grants and run state');
select is((select count(*)::integer from research_private.owner_research_minimized_outcomes),2,'teardown retains only one minimized outcome per run');

select set_config('request.jwt.claims','{"sub":"80000000-0000-4000-8000-000000000001"}',true);
set local role authenticated;
select throws_ok(
  $$select app_public.owner_research_command('resume','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','topeka-owner-10a','{}')$$,
  '42501','owner_research_unavailable','a torn-down grant cannot be replayed'
);
reset role;

select * from finish();
rollback;
