begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(14);

select has_function('app_public','account_get_settings',array[]::text[],'settings read RPC exists');
select has_function('app_public','account_update_settings',array['text','text'],'settings update RPC exists');
select ok(not has_function_privilege('anon','app_public.account_get_settings()','EXECUTE'),'anonymous cannot read settings');
select ok(not has_table_privilege('authenticated','app_private.profiles','UPDATE'),'browser cannot update profiles directly');
set local role authenticated;
select throws_ok($$select app_public.account_get_settings()$$,'42501','account_settings_access_denied','unregistered session cannot read settings');
select throws_ok($$select app_public.account_update_settings('Other Name','Other Address')$$,'42501','account_settings_access_denied','unregistered session cannot update settings');
reset role;

insert into auth.users(id) values
  ('92900000-0000-4000-8000-000000000001'),
  ('92900000-0000-4000-8000-000000000004');
insert into app_private.profiles(user_id,private_location_address) values
  ('92900000-0000-4000-8000-000000000001','123 Main Street'),
  ('92900000-0000-4000-8000-000000000004','Other Private Address')
on conflict(user_id) do update set private_location_address=excluded.private_location_address;
insert into app_private.account_export_jobs(export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at)
values('92900000-0000-4000-8000-000000000002','92900000-0000-4000-8000-000000000001','building',
       '92900000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp()+interval '5 minutes');
select is(
  app_public.build_account_export('92900000-0000-4000-8000-000000000002',
    '92900000-0000-4000-8000-000000000003')::jsonb #>> '{canonical,profile,locationAddress}',
  '123 Main Street','account export includes owner private location');
select ok(
  app_public.build_account_export('92900000-0000-4000-8000-000000000002',
    '92900000-0000-4000-8000-000000000003') not like '%Other Private Address%',
  'account export excludes another account private location');

insert into auth.sessions(id,user_id,created_at,updated_at)
values('92900000-0000-4000-8000-000000000005','92900000-0000-4000-8000-000000000001',
       statement_timestamp(),statement_timestamp());
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,access_token_expires_at)
select '92900000-0000-4000-8000-000000000005',p.user_id,statement_timestamp(),p.session_epoch,
       statement_timestamp()+interval '1 hour'
from app_private.profiles p where p.user_id='92900000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','92900000-0000-4000-8000-000000000001',
  'role','authenticated',
  'session_id','92900000-0000-4000-8000-000000000005')::text,true);
set local role authenticated;
select is(app_public.account_get_settings()->>'locationAddress','123 Main Street','owner reads own private location');
select is(app_public.account_update_settings('  Avery  ','  321 Oak  ')->>'displayName','Avery','update trims display name');
select is(app_public.account_get_settings()->>'locationAddress','321 Oak','update trims private location');
select throws_ok($$select app_public.account_update_settings('Avery',repeat('x',321))$$,
  '22023','invalid_location_address','oversize private location is rejected');
reset role;
select is((select private_location_address from app_private.profiles where user_id='92900000-0000-4000-8000-000000000004'),
  'Other Private Address','owner update cannot alter another profile');
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),
  revocation_reason='test' where session_id='92900000-0000-4000-8000-000000000005';
set local role authenticated;
select throws_ok($$select app_public.account_get_settings()$$,'42501','account_settings_access_denied',
  'revoked session loses settings access');
reset role;

select * from finish();
rollback;
