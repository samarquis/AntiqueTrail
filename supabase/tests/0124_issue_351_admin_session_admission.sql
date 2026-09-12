begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant identity_service to postgres;

insert into auth.users(id) values
  ('35100000-0000-4000-8000-000000000001'),
  ('35100000-0000-4000-8000-000000000002'),
  ('35100000-0000-4000-8000-000000000003');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('35100000-0000-4000-8000-000000000011','35100000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp()),
  ('35100000-0000-4000-8000-000000000012','35100000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp()),
  ('35100000-0000-4000-8000-000000000013','35100000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
  ('35100000-0000-4000-8000-000000000001','admin-only@issue-351.invalid',statement_timestamp()),
  ('35100000-0000-4000-8000-000000000002','representative-only@issue-351.invalid',statement_timestamp()),
  ('35100000-0000-4000-8000-000000000003','shopper-positive@issue-351.invalid',statement_timestamp())
on conflict(user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,store_id,state) values
  ('35100000-0000-4000-8000-000000000001','administrator',null,'active'),
  ('35100000-0000-4000-8000-000000000002','representative','00000000-0000-4000-8000-000000001001','active'),
  ('35100000-0000-4000-8000-000000000003','shopper',null,'active');
insert into shopper_private.saved_stores(user_id,store_id)
values ('35100000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000001001');
reset role;

select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"35100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select throws_ok($$select app_public.register_current_session(null)$$,'P0001','session_expiry_invalid','null expiry is rejected');
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'Admin-only provider session registers without shopper role');
select ok(app_private.current_session_is_active(),'Admin-only registered session is active');
select throws_ok($$select app_public.shopper_list_saved()$$,'42501','shopper_private_access_denied','Admin-only session cannot read shopper-private data');
select throws_ok($$select app_public.shopper_set_save('00000000-0000-4000-8000-000000001001',true)$$,'42501','shopper_private_access_denied','Admin-only session cannot write shopper-private data');
select ok(not app_private.current_user_has_role('shopper'::app_private.app_role,null),'Admin session registration does not create shopper admission');
reset role;

select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"35100000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select throws_ok($$select app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint)$$,'P0001','admission_required','representative-only identity cannot register a general session');
reset role;

select set_config('request.jwt.claims','{"sub":"35100000-0000-4000-8000-000000000003","role":"authenticated","session_id":"35100000-0000-4000-8000-000000000013"}',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'ordinary shopper session still registers');
select is(jsonb_array_length(app_public.shopper_list_saved()),1,'shopper positive control reads its populated private save');
select is(app_public.shopper_list_saved()->0->>'storeId','00000000-0000-4000-8000-000000001001','shopper reads its own exact saved row');
reset role;
select * from finish();
rollback;
