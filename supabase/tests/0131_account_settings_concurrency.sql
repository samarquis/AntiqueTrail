begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(29);

select set_config('request.jwt.claims','',true);
set local role authenticated;
select throws_ok($$select app_public.account_get_settings()$$,'P0001','authentication_required',
 'settings read without authentication uses the canonical error');
reset role;

select has_function('app_public','account_update_settings',array['text','text','bigint','text'],
  'settings writes require version and retry key');
select ok(to_regprocedure('app_public.account_update_settings(text,text)') is null,
  'legacy write cannot bypass concurrency');
insert into auth.users(id) values
 ('93100000-0000-4000-8000-000000000001'),('93100000-0000-4000-8000-000000000002');
insert into app_private.profiles(user_id,public_display_name,private_location_address) values
 ('93100000-0000-4000-8000-000000000001','Owner','Owner Address'),
 ('93100000-0000-4000-8000-000000000002','Sibling','Sibling Address')
on conflict(user_id) do update set public_display_name=excluded.public_display_name,
 private_location_address=excluded.private_location_address;
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('93100000-0000-4000-8000-000000000003','93100000-0000-4000-8000-000000000001',now(),now()),
 ('93100000-0000-4000-8000-000000000004','93100000-0000-4000-8000-000000000002',now(),now());
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,access_token_expires_at)
select s.id,p.user_id,now(),p.session_epoch,now()+interval '1 hour'
from auth.sessions s join app_private.profiles p on p.user_id=s.user_id
where s.id in ('93100000-0000-4000-8000-000000000003','93100000-0000-4000-8000-000000000004');
select set_config('request.jwt.claims', '{"sub":"93100000-0000-4000-8000-000000000001","role":"authenticated","session_id":"93100000-0000-4000-8000-000000000003"}',true);
create temp table settings_proof (kind text primary key, value jsonb);
grant all on settings_proof to authenticated;
set local role authenticated;
insert into settings_proof values('before',app_public.account_get_settings());
select ok((select (value->>'version')::bigint>0 from settings_proof where kind='before'), 'GET returns positive version');
insert into settings_proof values('first',app_public.account_update_settings('First Name','First Address',
 (select (value->>'version')::bigint from settings_proof where kind='before'),'attempt-1'));
insert into settings_proof values('first_settings',app_public.account_get_settings());
select is((select (value->>'version')::bigint from settings_proof where kind='first'),
 (select (value->>'version')::bigint+1 from settings_proof where kind='before'),'write increments version once');
select is((select value from settings_proof where kind='first'),
 jsonb_build_object('state','saved','version',
 (select (value->>'version')::bigint from settings_proof where kind='first')),
 'success contains only outcome and version, never settings payload');
select is(app_public.account_update_settings('First Name','First Address',
 (select (value->>'version')::bigint from settings_proof where kind='before'),'attempt-1'),
 (select value from settings_proof where kind='first'),'exact replay returns original success');
select is(app_public.account_get_settings(),(select value from settings_proof where kind='first_settings'),
 'replay does not increment version');
select is(app_public.account_update_settings('Stale Name','Stale Address',
 (select (value->>'version')::bigint from settings_proof where kind='before'),'attempt-stale'),
 jsonb_build_object('state','conflict','latest',jsonb_build_object('version',
 (select (value->>'version')::bigint from settings_proof where kind='first'))),
 'second tab stale version conflicts with current version');
select is(app_public.account_update_settings('Changed Payload','Changed Address',
 (select (value->>'version')::bigint from settings_proof where kind='before'),'attempt-1'),
 (select value from settings_proof where kind='first'),'same key returns prior success even with changed payload');
select is(app_public.account_get_settings(),(select value from settings_proof where kind='first_settings'),
 'conflicts and changed-payload replay leave both values and version unchanged');
select throws_ok($$select app_public.account_update_settings('Bad','Bad',0,'invalid-version')$$,
 '22023','validation_failed','nonpositive version rejected');
select throws_ok($$select app_public.account_update_settings('Bad','Bad',1,repeat('x',129))$$,
 '22023','validation_failed','unbounded key rejected');
select throws_ok($$select app_public.account_update_settings('Bad','Bad',1,null)$$,
 '22023','validation_failed','missing key rejected');
select throws_ok($$select app_public.account_update_settings(repeat('x',81),null,
 (app_public.account_get_settings()->>'version')::bigint,'invalid-name')$$,
 '22023','validation_failed','invalid display name uses the canonical error');
select throws_ok($$select app_public.account_update_settings('Valid',repeat('x',321),
 (app_public.account_get_settings()->>'version')::bigint,'invalid-address')$$,
 '22023','validation_failed','invalid private address uses the canonical error');
insert into settings_proof values('second',app_public.account_update_settings('Second Name',null,
 (select (value->>'version')::bigint from settings_proof where kind='first'),'attempt-2'));
insert into settings_proof values('second_settings',app_public.account_get_settings());
select is(app_public.account_update_settings('First Name','First Address',
 (select (value->>'version')::bigint from settings_proof where kind='before'),'attempt-1'),
 (select value from settings_proof where kind='first'),'replay remains original success after later write');
select is(app_public.account_get_settings(),(select value from settings_proof where kind='second_settings'),
 'old replay does not restore a cleared address');
reset role;
select ok(not has_table_privilege('authenticated','app_private.account_settings_receipts','SELECT'),
 'browser cannot read receipts');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='app_private.account_settings_receipts'::regclass),
 'receipt RLS is enabled and forced');
select ok(not exists(select 1 from app_private.account_settings_receipts r where r::text like '%First Address%'),
 'receipts retain no historical address');
select is((select array_agg(attname::text order by attname) from pg_attribute
 where attrelid='app_private.account_settings_receipts'::regclass and attnum>0 and not attisdropped),
 array['created_at','idempotency_key','result_version','user_id']::text[],
 'cleared account receipts contain only command identity and outcome, never payload-derived data');
select is((select public_display_name from app_private.profiles where user_id='93100000-0000-4000-8000-000000000002'),
 'Sibling','owner writes leave sibling unchanged');
select set_config('request.jwt.claims', '{"sub":"93100000-0000-4000-8000-000000000002","role":"authenticated","session_id":"93100000-0000-4000-8000-000000000004"}',true);
set local role authenticated;
select is(app_public.account_update_settings('Sibling New','Sibling New Address',
 (app_public.account_get_settings()->>'version')::bigint,'attempt-1')->>'state',
 'saved','same key is scoped to the authenticated owner');
reset role;
select is((select public_display_name from app_private.profiles where user_id='93100000-0000-4000-8000-000000000001'),
 'Second Name','sibling write leaves owner unchanged');
update app_private.active_sessions set state='revoked',revoked_at=now(),revocation_reason='test'
where session_id='93100000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok($$select app_public.account_update_settings('Sibling New','Sibling New Address',1,'attempt-1')$$,
 'P0001','authentication_required','revoked sessions cannot replay receipts');
reset role;
select ok((select p.public_display_name='Sibling New'
  and p.private_location_address='Sibling New Address' and p.version=2
  and (select count(*)=1 from app_private.account_settings_receipts r where r.user_id=p.user_id)
  from app_private.profiles p where p.user_id='93100000-0000-4000-8000-000000000002'),
 'revoked-session denial leaves profile and retry receipt unchanged');
delete from app_private.profiles where user_id='93100000-0000-4000-8000-000000000002';
select is((select count(*)::integer from app_private.account_settings_receipts where user_id='93100000-0000-4000-8000-000000000002'),
 0,'deletion removes owner receipts');
select ok(not has_function_privilege('anon','app_public.account_update_settings(text,text,bigint,text)','EXECUTE'),
 'anonymous cannot execute versioned writes');
select * from finish();
rollback;
