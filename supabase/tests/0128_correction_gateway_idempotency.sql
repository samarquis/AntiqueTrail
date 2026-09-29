begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_function('app_public','correction_gateway_submit',
  array['uuid','uuid','uuid','text','text','uuid','bytea','text'],
  'retry-safe correction gateway exists');
select ok(
  has_function_privilege('service_role','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,uuid,bytea,text)','execute')
  and not has_function_privilege('anon','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,uuid,bytea,text)','execute')
  and not has_function_privilege('authenticated','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,uuid,bytea,text)','execute'),
  'only trusted Edge transport can invoke retry-safe gateway'
);
select ok(
  has_function_privilege('service_role','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)','execute')
  and not has_function_privilege('authenticated','app_public.correction_gateway_submit(uuid,uuid,uuid,text,text,bytea,text)','execute'),
  'legacy Edge overload remains service-only during additive cutover'
);

insert into auth.users(id) values
  ('37800000-0000-4000-8000-000000000001'),
  ('37800000-0000-4000-8000-000000000011');
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at)
values
  ('37800000-0000-4000-8000-000000000001','retry-a@example.test',statement_timestamp()),
  ('37800000-0000-4000-8000-000000000011','retry-b@example.test',statement_timestamp())
on conflict(user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,state,access_token_expires_at
) values
  ('37800000-0000-4000-8000-000000000002','37800000-0000-4000-8000-000000000001',statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes'),
  ('37800000-0000-4000-8000-000000000012','37800000-0000-4000-8000-000000000011',statement_timestamp(),1,'active',statement_timestamp()+interval '30 minutes');
insert into app_private.role_grants(subject_user_id,role,state) values
  ('37800000-0000-4000-8000-000000000001','shopper','active'),
  ('37800000-0000-4000-8000-000000000011','shopper','active');
reset role;

select set_config('app.issue377_retry_store',(
  select id::text from app_public.stores
  where synthetic and audience='synthetic' and publication_state='active'
  order by id limit 1
),true);

set local role service_role;
select lives_ok($$select app_public.correction_gateway_submit(
  '37800000-0000-4000-8000-000000000001','37800000-0000-4000-8000-000000000002',
  current_setting('app.issue377_retry_store')::uuid,'other','first payload','37800000-0000-4000-8000-000000000021',decode(repeat('31',32),'hex'))$$,
  'first idempotent correction succeeds');
select lives_ok($$select app_public.correction_gateway_submit(
  '37800000-0000-4000-8000-000000000001','37800000-0000-4000-8000-000000000002',
  current_setting('app.issue377_retry_store')::uuid,'other','retry payload is ignored','37800000-0000-4000-8000-000000000021',decode(repeat('32',32),'hex'))$$,
  'same actor and key return prior success');
reset role;
select is((select count(*)::integer from shopper_private.store_correction_reports
  where reporter_user_id='37800000-0000-4000-8000-000000000001'),1,
  'retry creates one report');
select is((select count(*)::integer from shopper_private.correction_rate_events
  where device_session_digest=extensions.digest(convert_to(
    'correction-device:37800000-0000-4000-8000-000000000002','UTF8'),'sha256')),3,
  'retry consumes one set of rate events');

set local role identity_service;
update app_private.role_grants set state='revoked'
where subject_user_id='37800000-0000-4000-8000-000000000001' and role='shopper';
reset role;
set local role service_role;
select throws_ok($$select app_public.correction_gateway_submit(
  '37800000-0000-4000-8000-000000000001','37800000-0000-4000-8000-000000000002',
  current_setting('app.issue377_retry_store')::uuid,'other','revoked replay','37800000-0000-4000-8000-000000000021',decode(repeat('32',32),'hex'))$$,
  '42501','shopper_private_access_denied','replay rechecks current Shopper authority');
reset role;

set local role service_role;
select lives_ok($$select app_public.correction_gateway_submit(
  '37800000-0000-4000-8000-000000000011','37800000-0000-4000-8000-000000000012',
  current_setting('app.issue377_retry_store')::uuid,'other','other actor','37800000-0000-4000-8000-000000000021',decode(repeat('33',32),'hex'))$$,
  'same key remains independent across actors');
reset role;
select is((select count(*)::integer from shopper_private.store_correction_reports
  where reporter_user_id in ('37800000-0000-4000-8000-000000000001','37800000-0000-4000-8000-000000000011')),2,
  'actor-scoped receipt preserves both reports');

select * from finish();
rollback;
