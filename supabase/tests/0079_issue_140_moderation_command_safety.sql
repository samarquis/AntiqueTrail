begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table(
  'review_private',
  'moderation_command_receipts',
  'moderation retry receipts are durable'
);
select has_function(
  'app_public',
  'reviews_moderate',
  array['uuid','text','text','bigint','text'],
  'moderation command requires a case version and retry key'
);
select ok(
  not has_function_privilege('authenticated','app_public.reviews_moderate(uuid,text,text)','EXECUTE')
  and has_function_privilege('authenticated','app_public.reviews_moderate(uuid,text,text,bigint,text)','EXECUTE')
  and not has_function_privilege('anon','app_public.reviews_moderate(uuid,text,text,bigint,text)','EXECUTE'),
  'only the versioned moderation command is exposed to authenticated sessions'
);
select ok(
  position('pg_advisory_xact_lock' in lower(pg_get_functiondef('app_public.reviews_moderate(uuid,text,text,bigint,text)'::regprocedure)))>0,
  'retry keys are serialized before receipt lookup'
);
select ok(
  position($q$'version',c.version$q$ in replace(lower(pg_get_functiondef('app_public.reviews_list_moderation_cases()'::regprocedure)),' ',''))>0,
  'the moderation queue exposes the exact case version'
);

insert into auth.users(id) values
  ('79000000-0000-4000-8000-000000000001'),
  ('79000000-0000-4000-8000-000000000002');
insert into app_public.catalog_areas(id,slug,label,state_code)
values('79000000-0000-4000-8000-000000000010','issue-140-test','Issue 140 Test','KS');
insert into app_public.stores(
  id,slug,name,town,state_code,address,area_id,summary,description
) values (
  '79000000-0000-4000-8000-000000000011','issue-140-store','Issue 140 Store','Topeka','KS',
  '140 Test Street','79000000-0000-4000-8000-000000000010','Test store','Test store'
);
insert into review_private.public_reviews(
  review_id,author_id,store_id,rating,review_text,display_name,visit_month,visit_year,
  eligibility_kind,conflict_kind
) values (
  '79000000-0000-4000-8000-000000000020','79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000011',5,'Review under moderation','Reviewer',8,2026,
  'manual_attestation','none'
);
insert into review_private.moderation_cases(
  case_id,review_id,store_id,reason_code,assigned_admin_id
) values (
  '79000000-0000-4000-8000-000000000021','79000000-0000-4000-8000-000000000020',
  '79000000-0000-4000-8000-000000000011','spam','79000000-0000-4000-8000-000000000001'
);

grant review_automation to postgres;
grant usage,create on schema review_private to review_automation;
set role review_automation;
create or replace function review_private.require_review_admin() returns uuid
language sql stable security definer set search_path='' as $$
  select '79000000-0000-4000-8000-000000000001'::uuid
$$;
reset role;

select lives_ok(
  $$select app_public.reviews_moderate(
    '79000000-0000-4000-8000-000000000021','remove','Confirmed spam',1,'issue-140-remove'
  )$$,
  'the exact assigned case version can be moderated'
);
select results_eq(
  $$select state,version from review_private.moderation_cases
    where case_id='79000000-0000-4000-8000-000000000021'$$,
  $$values ('removed'::text,2::bigint)$$,
  'the moderation transition advances the case exactly once'
);
select lives_ok(
  $$select app_public.reviews_moderate(
    '79000000-0000-4000-8000-000000000021','remove','Confirmed spam',1,'issue-140-remove'
  )$$,
  'an identical retry returns its stored receipt'
);
select results_eq(
  $$select count(*) from review_private.moderation_command_receipts
    where idempotency_key='issue-140-remove'$$,
  array[1::bigint],
  'an identical retry creates one receipt'
);
select results_eq(
  $$select count(*) from review_private.moderation_case_evidence
    where case_id='79000000-0000-4000-8000-000000000021'$$,
  array[1::bigint],
  'an identical retry does not duplicate side effects'
);
select throws_ok(
  $$select app_public.reviews_moderate(
    '79000000-0000-4000-8000-000000000021','hold','Different input',1,'issue-140-remove'
  )$$,
  '22023',
  'review_moderation_idempotency_reused',
  'a retry key cannot be reused for different input'
);
select throws_ok(
  $$select app_public.reviews_moderate(
    '79000000-0000-4000-8000-000000000021','restore','Stale command',1,'issue-140-stale'
  )$$,
  '42501',
  'review_moderation_denied',
  'a stale case version is denied'
);

select * from finish();
rollback;
