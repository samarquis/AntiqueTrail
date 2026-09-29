begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_function('app_public','correction_gateway_submit',
  array['uuid','uuid','uuid','text','text','bytea','text'],
  'trusted correction gateway exists');
select ok(
  not has_function_privilege('anon','app_public.shopper_submit_correction(uuid,text,text,bytea,text)','execute')
  and not has_function_privilege('authenticated','app_public.shopper_submit_correction(uuid,text,text,bytea,text)','execute')
  and not has_function_privilege('service_role','app_public.shopper_submit_correction(uuid,text,text,bytea,text)','execute'),
  'no request role can supply the core correction rate key directly'
);
select ok(
  has_function_privilege('service_role','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)','execute')
  and not has_function_privilege('anon','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)','execute')
  and not has_function_privilege('authenticated','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)','execute'),
  'only trusted Edge transport can invoke correction gateway'
);

insert into auth.users(id) values
  ('37700000-0000-4000-8000-000000000001'),
  ('37700000-0000-4000-8000-000000000011'),
  ('37700000-0000-4000-8000-000000000021');
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at)
values
  ('37700000-0000-4000-8000-000000000001','shopper@example.test',statement_timestamp()),
  ('37700000-0000-4000-8000-000000000011','sibling@example.test',statement_timestamp()),
  ('37700000-0000-4000-8000-000000000021','unentitled@example.test',statement_timestamp());
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,state,access_token_expires_at
) values
  ('37700000-0000-4000-8000-000000000002','37700000-0000-4000-8000-000000000001',statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes'),
  ('37700000-0000-4000-8000-000000000012','37700000-0000-4000-8000-000000000011',statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes'),
  ('37700000-0000-4000-8000-000000000022','37700000-0000-4000-8000-000000000021',statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes');
insert into app_private.role_grants(subject_user_id,role,state)
values
  ('37700000-0000-4000-8000-000000000001','shopper','active'),
  ('37700000-0000-4000-8000-000000000011','shopper','active');
reset role;

select set_config('app.issue377_store',(
  select id::text from app_public.stores
  where synthetic and audience='synthetic' and publication_state='active'
  order by id limit 1
),true);

set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  null,null,current_setting('app.issue377_store')::uuid,'other','missing actor',decode(repeat('01',32),'hex'))$$,
  '42501','correction_session_denied','service role alone grants no correction authority');
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000012',
  current_setting('app.issue377_store')::uuid,'other','mismatched actor',decode(repeat('02',32),'hex'))$$,
  '42501','correction_session_denied','a sibling session cannot authorize a spoofed actor');
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000021','37700000-0000-4000-8000-000000000022',
  current_setting('app.issue377_store')::uuid,'other','unentitled actor',decode(repeat('03',32),'hex'))$$,
  '42501','shopper_private_access_denied','an active session without Shopper authority remains denied');
select lives_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','valid report',decode(repeat('04',32),'hex'))$$,
  'provider-verified active Shopper can submit through trusted gateway');
reset role;

select is((select count(*)::integer from shopper_private.store_correction_reports
  where reporter_user_id='37700000-0000-4000-8000-000000000001'),1,
  'gateway preserves actual report ownership');
select is((select count(*)::integer from shopper_private.correction_rate_events
  where device_session_digest=extensions.digest(convert_to(
    'correction-device:37700000-0000-4000-8000-000000000002','UTF8'),'sha256')),3,
  'gateway preserves account, IP, and account-store rate accounting');

set local role identity_service;
update app_private.profiles set sessions_revoked_before=statement_timestamp()-interval '1 minute'
where user_id='37700000-0000-4000-8000-000000000001';
update app_private.active_sessions set provider_created_at=statement_timestamp()-interval '2 minutes'
where session_id='37700000-0000-4000-8000-000000000002';
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','revoked session',decode(repeat('05',32),'hex'))$$,
  '42501','correction_session_denied','provider session predating revocation remains denied');
reset role;

select ok(position('limits:=array[5,20,2]' in regexp_replace(
  pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure),
  '[[:space:]]','','g'))>0,'account, IP, and account-store limits remain 5, 20, and 2');
select ok(position('app_public.shopper_submit_correction' in
  pg_get_functiondef('app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)'::regprocedure))>0,
  'gateway delegates to unchanged guarded correction core');
select ok(current_setting('request.jwt.claims',true) is null or current_setting('request.jwt.claims',true)='',
  'gateway restores request claims after invocation');

set local role authenticated;
select throws_ok($$select app_public.shopper_submit_correction(
  current_setting('app.issue377_store')::uuid,'other','fabricated rate key',decode(repeat('ff',32),'hex'))$$,
  '42501','permission denied for function shopper_submit_correction',
  'browser cannot submit a fabricated rate key');
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','gateway impersonation',decode(repeat('ff',32),'hex'))$$,
  '42501','permission denied for function correction_gateway_submit',
  'browser cannot impersonate trusted Edge gateway');

select * from finish();
rollback;
