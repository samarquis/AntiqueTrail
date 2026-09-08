begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_function('app_public','rg01_get_own_consent',array[]::text[],'shopper RG-01 own-consent projection exists');
select ok(has_function_privilege('authenticated','app_public.rg01_get_own_consent()','EXECUTE')
  and not has_function_privilege('anon','app_public.rg01_get_own_consent()','EXECUTE'),
  'own-consent projection is authenticated-only');
select ok(position('rg01_private.rg01_capability' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0
  and position('rg01_private.rg01_subject_consents' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0,
  'projection reads capability and only the own subject row');
select ok(position('request_user_id()' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0
  and position('current_session_is_active()' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0
  and position('current_user_has_role' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0,
  'projection derives actor, session, and shopper authorization on the server');
select ok(position('user_id' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0
  and position('subject_id' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0,
  'projection binds the own row without accepting a caller-selected ID');
select ok(position('metrics' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))=0
  and position('dedup' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))=0
  and position('user_id' in lower(pg_get_functiondef('app_public.rg01_get_own_consent()'::regprocedure)))>0,
  'projection does not construct aggregate, dedup, or returned identity fields');

insert into auth.users(id) values
  ('26100000-0000-4000-8000-000000000001'),
  ('26100000-0000-4000-8000-000000000002');
insert into app_private.profiles(user_id,age_18_attested_at,status)
values ('26100000-0000-4000-8000-000000000001',statement_timestamp(),'active'),
       ('26100000-0000-4000-8000-000000000002',statement_timestamp(),'active')
on conflict (user_id) do update set
  age_18_attested_at=excluded.age_18_attested_at,
  status=excluded.status;
insert into app_private.role_grants(subject_user_id,role,state)
values ('26100000-0000-4000-8000-000000000001','shopper','active');
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,state,last_authenticated_at,access_token_expires_at
) values (
  '26100000-0000-4000-8000-000000000101',
  '26100000-0000-4000-8000-000000000001',
  statement_timestamp(),1,'active',statement_timestamp(),statement_timestamp()+interval '1 hour'
), (
  '26100000-0000-4000-8000-000000000102',
  '26100000-0000-4000-8000-000000000002',
  statement_timestamp(),1,'active',statement_timestamp(),statement_timestamp()+interval '1 hour'
);
insert into release_private.regional_releases(
  release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state,step_ordinal,signed_release_receipt
) values (
  '26100000-0000-4000-8000-000000000201','topeka-ks',
  'sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),
  'active',9,'release-261'
);
insert into release_private.release_capabilities(
  release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion
) values ('26100000-0000-4000-8000-000000000201',true,true,true,true,true);
update rg01_private.rg01_capability
   set collection_enabled=true,release_id='26100000-0000-4000-8000-000000000201',version=version+1
 where singleton_id=1;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','26100000-0000-4000-8000-000000000001',
  'session_id','26100000-0000-4000-8000-000000000101'
)::text,true);
select is((app_public.rg01_get_own_consent()->>'status'),'available','eligible shopper receives an available projection');
select is((app_public.rg01_get_own_consent()->>'consentState'),'not_consented','loading and first read never imply consent');
select is((select array_agg(key order by key) from jsonb_object_keys(app_public.rg01_get_own_consent()) key),
  array['collectionActive','consentState','consentedAt','status','withdrawnAt']::text[],
  'available response has an exact privacy allowlist');
select ok((app_public.rg01_get_own_consent()::text not like '%26100000%')
  and (app_public.rg01_get_own_consent()::text not like '%metrics%'),
  'available response contains no subject ID or metric fields');
select lives_ok($$select app_public.rg01_set_own_consent(true)$$,'eligible shopper can explicitly consent');
select is((app_public.rg01_get_own_consent()->>'consentState'),'consented','consent is confirmed by a fresh server read');
select lives_ok($$select app_public.rg01_set_own_consent(false)$$,'eligible shopper can explicitly withdraw');
select is((app_public.rg01_get_own_consent()->>'consentState'),'withdrawn','withdrawal remains visible as own state');
select ok((select withdrawn_at is not null from rg01_private.rg01_subject_consents
  where user_id='26100000-0000-4000-8000-000000000001'),'withdrawal is durable on the subject row');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','26100000-0000-4000-8000-000000000002',
  'session_id','26100000-0000-4000-8000-000000000102'
)::text,true);
select is((app_public.rg01_get_own_consent()->>'status'),'unavailable','wrong actor receives generic denial');
select throws_ok($$select app_public.rg01_set_own_consent(true)$$,'42501','rg01_shopper_required','ineligible actor cannot re-consent');
select is((select count(*) from rg01_private.rg01_subject_consents
  where user_id='26100000-0000-4000-8000-000000000002'),0,'denied actor cannot create or mutate consent');

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','26100000-0000-4000-8000-000000000001'
)::text,true);
select is((app_public.rg01_get_own_consent()->>'status'),'unavailable','missing or revoked session receives generic denial');

select * from finish();
rollback;
