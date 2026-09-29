begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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
  ('37700000-0000-4000-8000-000000000021','unentitled@example.test',statement_timestamp())
on conflict (user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
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
select set_config('request.jwt.claims','{"sub":"sentinel-error","session_id":"sentinel-error"}',true);
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000099',
  current_setting('app.issue377_store')::uuid,'other','unregistered session',decode(repeat('03',32),'hex'))$$,
  '42501','correction_session_denied','an unregistered session remains denied');
select is(current_setting('request.jwt.claims',true),
  '{"sub":"sentinel-error","session_id":"sentinel-error"}',
  'gateway restores prior request claims after denial');
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000021','37700000-0000-4000-8000-000000000022',
  current_setting('app.issue377_store')::uuid,'other','unentitled actor',decode(repeat('04',32),'hex'))$$,
  '42501','shopper_private_access_denied','an active session without Shopper authority remains denied');
select set_config('request.jwt.claims','{"sub":"sentinel-success","session_id":"sentinel-success"}',true);
select lives_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','valid report',decode(repeat('05',32),'hex'))$$,
  'provider-verified active Shopper can submit through trusted gateway');
select is(current_setting('request.jwt.claims',true),
  '{"sub":"sentinel-success","session_id":"sentinel-success"}',
  'gateway restores prior request claims after success');
reset role;

select is((select count(*)::integer from shopper_private.store_correction_reports
  where reporter_user_id='37700000-0000-4000-8000-000000000001'),1,
  'gateway preserves actual report ownership');
select is((select count(*)::integer from shopper_private.correction_rate_events
  where device_session_digest=extensions.digest(convert_to(
    'correction-device:37700000-0000-4000-8000-000000000002','UTF8'),'sha256')),3,
  'gateway preserves account, IP, and account-store rate accounting');

set local role identity_service;
insert into shopper_private.correction_rate_events(operation,key_kind,key_digest,device_session_digest)
select 'correction_submit','account',
  extensions.digest(convert_to('correction-account:37700000-0000-4000-8000-000000000001','UTF8'),'sha256'),
  extensions.digest(convert_to('issue-377-account-seed:'||n,'UTF8'),'sha256')
from generate_series(1,4) n;
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','account limited',decode(repeat('06',32),'hex'))$$,
  '42900','correction_rate_limited','gateway preserves five-per-account daily limit');
reset role;
set local role identity_service;
delete from shopper_private.correction_rate_events
where device_session_digest in (
  select extensions.digest(convert_to('issue-377-account-seed:'||n,'UTF8'),'sha256')
  from generate_series(1,4) n
);
insert into shopper_private.correction_rate_events(operation,key_kind,key_digest,device_session_digest)
select 'correction_submit','ip',decode(repeat('07',32),'hex'),
  extensions.digest(convert_to('issue-377-ip-seed:'||n,'UTF8'),'sha256')
from generate_series(1,20) n;
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','IP limited',decode(repeat('07',32),'hex'))$$,
  '42900','correction_rate_limited','gateway preserves twenty-per-IP daily limit');
reset role;
set local role identity_service;
delete from shopper_private.correction_rate_events
where device_session_digest in (
  select extensions.digest(convert_to('issue-377-ip-seed:'||n,'UTF8'),'sha256')
  from generate_series(1,20) n
);
insert into shopper_private.correction_rate_events(operation,key_kind,key_digest,device_session_digest)
values (
  'correction_submit','account_store',
  extensions.digest(
    extensions.digest(convert_to('correction-account:37700000-0000-4000-8000-000000000001','UTF8'),'sha256')
    ||convert_to(current_setting('app.issue377_store'),'UTF8'),'sha256'
  ),
  extensions.digest(convert_to('issue-377-account-store-seed','UTF8'),'sha256')
);
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','account-store limited',decode(repeat('08',32),'hex'))$$,
  '42900','correction_rate_limited','gateway preserves two-per-account-store daily limit');
reset role;
set local role identity_service;
delete from shopper_private.correction_rate_events
where device_session_digest=extensions.digest(
  convert_to('issue-377-account-store-seed','UTF8'),'sha256');
reset role;
select is((select count(*)::integer from shopper_private.store_correction_reports
  where reporter_user_id='37700000-0000-4000-8000-000000000001'),1,
  'rate-limit denials create no correction report');
select is((select count(*)::integer from shopper_private.correction_rate_events
  where device_session_digest=extensions.digest(convert_to(
    'correction-device:37700000-0000-4000-8000-000000000002','UTF8'),'sha256')),3,
  'rate-limit denials create no rate events');

set local role identity_service;
update app_private.profiles set sessions_revoked_before=statement_timestamp()-interval '1 minute'
where user_id='37700000-0000-4000-8000-000000000001';
update app_private.active_sessions set provider_created_at=statement_timestamp()-interval '2 minutes'
where session_id='37700000-0000-4000-8000-000000000002';
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37700000-0000-4000-8000-000000000001','37700000-0000-4000-8000-000000000002',
  current_setting('app.issue377_store')::uuid,'other','revoked session',decode(repeat('09',32),'hex'))$$,
  '42501','correction_session_denied','provider session predating revocation remains denied');
reset role;

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
