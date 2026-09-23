begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(69);

-- Invoke the real lifecycle RPCs with a fresh provider-shaped password AMR.
-- The archive metadata below is an isolated worker fixture, not Storage proof.
create function pg_temp.check_lifecycle(p_phase text,p_session uuid)
returns setof text language plpgsql as $$
declare result jsonb; job uuid; handoff uuid; verified_claims jsonb;
begin
 insert into auth.sessions(id,user_id,created_at,updated_at)
 values(p_session,'37600000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp());
 verified_claims:=jsonb_build_object('sub','37600000-0000-4000-8000-000000000003',
  'role','authenticated','session_id',p_session,'amr',jsonb_build_array(jsonb_build_object('method','password',
    'timestamp',floor(extract(epoch from statement_timestamp())))));
 perform set_config('request.jwt.claims',verified_claims::text,true);
 perform set_config('request.path','/rpc/register_current_session',true);
 perform set_config('role','authenticated',true);
 perform app_public.internal_review_pre_request();
 return next extensions.is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,p_phase||': fresh lifecycle session registers');
 perform set_config('request.path','/rpc/current_session_is_active',true);
 return next extensions.is(app_public.current_session_is_active(),true,p_phase||': session status works');
 perform set_config('request.path','/rpc/account_lifecycle_status',true);
 return next extensions.is(app_public.account_lifecycle_status()->>'state','active',p_phase||': account status works');
 perform set_config('request.path','/rpc/request_account_export',true);
 perform set_config('request.jwt.claims',(verified_claims-'amr')::text,true);
 return next extensions.throws_ok('select app_public.request_account_export()','42501','privacy_reauthentication_required',p_phase||': lifecycle access still requires provider privacy reauthentication');
 perform set_config('request.jwt.claims',verified_claims::text,true);
 result:=app_public.request_account_export(); job:=(result->>'id')::uuid;
 return next extensions.ok(job is not null,p_phase||': fresh privacy reauthentication permits export');
 perform set_config('request.path','/rpc/get_account_export_status',true);
 return next extensions.throws_ok('select app_public.get_account_export_status(''37600000-0000-4000-8000-000000000016''::uuid)','P0002','account_export_unavailable',p_phase||': another account export remains private');
 perform set_config('role','none',true);
 update app_private.account_export_jobs set state='ready',completed_at=statement_timestamp(),expires_at=statement_timestamp()+interval '1 day',
  archive_object_key='public-test-fixture.zip',archive_checksum=decode(repeat('a',64),'hex'),archive_bytes=1 where export_job_id=job;
 perform set_config('role','authenticated',true);
 perform set_config('request.path','/rpc/issue_account_export_download',true);
 perform app_public.internal_review_pre_request();
 handoff:=(app_public.issue_account_export_download(job)->>'handoffId')::uuid;
 return next extensions.ok(handoff is not null,p_phase||': owned export download handoff remains available');
 perform set_config('request.path','/rpc/request_account_deletion',true);
 return next extensions.is(app_public.request_account_deletion()->>'state','deletion_scheduled',p_phase||': account deletion remains available');
 perform set_config('request.path','/rpc/cancel_account_deletion',true);
 return next extensions.is(app_public.cancel_account_deletion()->>'state','active',p_phase||': deletion can be cancelled');
 perform set_config('request.path','/rpc/shopper_list_saved',true);
 return next extensions.throws_ok('select app_public.shopper_list_saved()','42501','shopper_private_access_denied',p_phase||': lifecycle session cannot resume saves');
 perform set_config('request.path','/rpc/create_trip',true);
 return next extensions.throws_ok('select app_public.internal_review_pre_request()','42501','public_test_request_denied',p_phase||': lifecycle session cannot access trips');
 perform set_config('role','none',true);
end $$;

select ok(not has_schema_privilege('anon','public_test_private','USAGE'),'anonymous cannot inspect the operator scope');
select ok(not has_table_privilege('authenticated','app_private.account_export_jobs','UPDATE'),'export repair grants no browser table mutation');
select ok(not has_function_privilege('service_role','public_test_private.activate(uuid,bigint)','EXECUTE'),'application service cannot activate its own scope');
select ok(not has_function_privilege('authenticated','app_public.public_test_catalog_gateway_request(text,text,jsonb)','EXECUTE'),'browser cannot bypass the catalog Edge boundary');
select is(public_test_private.active_binding('catalog'),null::uuid,'migration starts inactive');

create temporary table public_test_spec as select jsonb_build_object(
 'backendRef','uaupykgpegbseboklubv','origin','https://antique-trail.vercel.app',
 'sourceSha',repeat('a',40),'artifactDigest',repeat('b',64),'configurationDigest',repeat('c',64),
 'schemaDigest',repeat('d',64),'evidenceDigest',repeat('e',64),
 'decisionRef','isolated transaction test','reviewRef','https://github.com/samarquis/AntiqueTrail/pull/376',
 'operatorRef','local test','stopOwner','local test','capabilities',jsonb_build_array('catalog','saved'),
 'storeIds',(select jsonb_agg(id order by id) from app_public.stores where synthetic and audience='synthetic' and publication_state='active'),
 'startsAt',statement_timestamp()-interval '1 minute','expiresAt',statement_timestamp()+interval '1 day',
 'testers',jsonb_build_array(jsonb_build_object('email','public-test-376@example.test','emailHmac',repeat('f',64)))
) spec;
create temporary table public_test_receipt as select public_test_private.prepare(spec,'37600000-0000-4000-8000-000000000001',1) id from public_test_spec;
insert into app_public.stores
 select (jsonb_populate_record(null::app_public.stores,to_jsonb(s)||jsonb_build_object(
  'id','37600000-0000-4000-8000-000000000017','slug','nonfictional-scope-fixture',
  'synthetic',false,'audience','public','publication_state','draft'))).*
 from app_public.stores s where synthetic and publication_state='active' order by id limit 1;
select throws_ok($$select public_test_private.prepare(jsonb_set(spec,'{storeIds,1}',to_jsonb('37600000-0000-4000-8000-000000000017'::text)),'37600000-0000-4000-8000-000000000018',1) from public_test_spec$$,'42501','public_test_scope_invalid','a non-fictional store is rejected');
select throws_ok($$select public_test_private.prepare(jsonb_set(spec,'{storeIds}',(spec->'storeIds')-0),'37600000-0000-4000-8000-000000000011',1) from public_test_spec$$,'42501','public_test_scope_invalid','fewer than the exact twelve stores is rejected');
select throws_ok($$select public_test_private.prepare(jsonb_set(spec,'{storeIds,1}',spec->'storeIds'->0),'37600000-0000-4000-8000-000000000012',1) from public_test_spec$$,'42501','public_test_scope_invalid','duplicate store inventory is rejected');
select throws_ok($$select public_test_private.prepare(jsonb_set(spec,'{storeIds,1}',to_jsonb('37600000-0000-4000-8000-000000000013'::text)),'37600000-0000-4000-8000-000000000014',1) from public_test_spec$$,'42501','public_test_scope_invalid','a store outside the active fictional inventory is rejected');
select is((select public_test_private.prepare(spec,'37600000-0000-4000-8000-000000000001',1) from public_test_spec),
 (select id from public_test_receipt),'same request is idempotent');
select throws_ok($$select public_test_private.prepare(spec||'{"origin":"https://evil.example"}', '37600000-0000-4000-8000-000000000002',1) from public_test_spec$$,
 '42501','public_test_target_invalid','wrong origin cannot be prepared');
select throws_ok($$select public_test_private.activate(id,2) from public_test_receipt$$,'42501','public_test_activation_denied','stale version cannot activate');
select is((select public_test_private.activate(id,1) from public_test_receipt),2::bigint,'operator activates exact prepared binding');
select is((select public_test_private.activate(id,1) from public_test_receipt),2::bigint,'activation retry does not extend lifetime');
select is(public_test_private.active_binding('catalog'),null::uuid,'missing request origin denied');
select set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);
select is(public_test_private.active_binding('catalog'),(select id from public_test_receipt),'exact request origin admitted');
set local role public_catalog_gateway;
select is(jsonb_array_length(app_public.public_test_catalog_gateway_request(repeat('a',64),'list','{}')),12,'constrained gateway returns only twelve fictional stores');
select throws_ok($$select app_public.public_test_catalog_gateway_request(repeat('a',64),'map','{}')$$,'22023','gateway_request_invalid','omitted map capability denied');
reset role;

insert into auth.users(id,email,email_confirmed_at) values('37600000-0000-4000-8000-000000000003','public-test-376@example.test',statement_timestamp());
insert into auth.users(id,email,email_confirmed_at) values('37600000-0000-4000-8000-000000000015','other-376@example.test',statement_timestamp());
insert into app_private.account_export_jobs(export_job_id,user_id) values('37600000-0000-4000-8000-000000000016','37600000-0000-4000-8000-000000000015');
update public_test_private.testers set auth_user_id='37600000-0000-4000-8000-000000000003' where binding_id=(select id from public_test_receipt);
select set_config('request.method','POST',true);
select set_config('request.path','/rpc/create_trip',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'test identity cannot call trips');
select set_config('request.path','/rpc/shopper_set_save',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'allowlisted email alone never admits private saves');
select set_config('request.path','/rpc/register_current_session',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'unadmitted identity cannot use lifecycle bootstrap exception');
select set_config('request.jwt.claims','{"sub":"37600000-0000-4000-8000-000000000003","role":"authenticated","session_id":"37600000-0000-4000-8000-000000000007"}',true);
set local role authenticated;
select throws_ok($$select app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint)$$,'42501','internal_request_denied','actual session bootstrap rejects unadmitted identity');
reset role;
select set_config('request.path','/rpc/shopper_set_save',true);
select is(public_test_private.begin_registration(decode(repeat('0',64),'hex'),true,'37600000-0000-4000-8000-000000000099')->>'state','reserved','public signup can reserve outside tester allowlist');
select is(public_test_private.complete_callback('37600000-0000-4000-8000-000000000005','37600000-0000-4000-8000-000000000003'),false,'verified email without authoritative receipt cannot grant shopper');
-- Simulate only already recorded provider delivery in this rollback fixture;
-- this is not real-email evidence or authority to activate a hosted receipt.
insert into app_private.account_admission_receipts(admission_id,token_hash,purpose,email_hmac,age_18_attested_at,
 idempotency_key,provider_user_id,claim_expires_at,verification_link_expires_at,state,claimed_at)
values('37600000-0000-4000-8000-000000000005',decode(repeat('a',64),'hex'),'shopper',decode(repeat('f',64),'hex'),
 statement_timestamp(),'37600000-0000-4000-8000-000000000004','37600000-0000-4000-8000-000000000003',
 statement_timestamp()+interval '1 day',statement_timestamp()+interval '1 day','verification_pending',statement_timestamp());
update public_test_private.testers set admission_id='37600000-0000-4000-8000-000000000005';
update public_test_private.bindings set capabilities=array['catalog','saved','registration'] where binding_id=(select id from public_test_receipt);
update app_private.registration_quarantine_latch set state='open' where id=1;
select is(app_public.complete_public_test_registration_callback('37600000-0000-4000-8000-000000000003'),true,'legacy callback completes exact verified receipt');
select is((select count(*) from app_private.role_grants where subject_user_id='37600000-0000-4000-8000-000000000003' and state='active' and role='shopper'),0::bigint,'legacy callback alone grants no role');
select is(app_public.complete_account_registration_callback('37600000-0000-4000-8000-000000000005','37600000-0000-4000-8000-000000000003'),true,'production callback grants verified shopper');
select is((select count(*) from app_private.role_grants where subject_user_id='37600000-0000-4000-8000-000000000003' and state='active' and role='shopper'),1::bigint,'production callback grants one ordinary shopper role');
update public_test_private.testers set admitted_at=statement_timestamp() where binding_id=(select id from public_test_receipt);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),true,'admitted tester may use the saved RPC');
update app_private.role_grants set state='revoked',revoked_at=statement_timestamp()
where subject_user_id='37600000-0000-4000-8000-000000000003' and role='shopper' and state='active';
select is(app_public.complete_account_registration_callback('37600000-0000-4000-8000-000000000005','37600000-0000-4000-8000-000000000003'),true,'production callback remains idempotently authoritative');
select is((select count(*) from app_private.role_grants where subject_user_id='37600000-0000-4000-8000-000000000003' and state='active' and role='shopper'),1::bigint,'production callback restores exactly one ordinary shopper role');
insert into auth.sessions(id,user_id,created_at,updated_at) values('37600000-0000-4000-8000-000000000007','37600000-0000-4000-8000-000000000003',statement_timestamp(),statement_timestamp());
select set_config('request.jwt.claims','{"sub":"37600000-0000-4000-8000-000000000003","role":"authenticated","session_id":"37600000-0000-4000-8000-000000000007"}',true);
select set_config('request.path','/rpc/register_current_session',true);
select set_config('public_test.store_id',(select store_ids[1]::text from public_test_private.bindings where binding_id=(select id from public_test_receipt)),true);
set local role authenticated;
select is(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),true,'verified test account registers an actual provider-shaped session');
select set_config('request.path','/rpc/shopper_set_save',true);
select is(app_public.shopper_set_save(current_setting('public_test.store_id')::uuid,true)->>'saved','true','admitted session writes its private save');
select set_config('request.path','/rpc/shopper_list_saved',true);
select is(jsonb_array_length(app_public.shopper_list_saved()),1,'admitted session reads its private saved list');
reset role;
select set_config('request.path','/rpc/create_trip',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'shopper grant does not unlock omitted trip RPCs');
select set_config('request.jwt.claims','{"sub":"37600000-0000-4000-8000-000000000003","role":"authenticated","session_id":"37600000-0000-4000-8000-000000000007"}',true);
set local role authenticated;
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','public_test_request_denied','actual PostgREST guard rejects direct trip transport');
reset role;
select set_config('request.headers','{"origin":"https://evil.example"}',true);
select set_config('request.path','/rpc/shopper_set_save',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'admitted tester cannot switch origins');
select set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);
update public_test_private.bindings set expires_at=statement_timestamp()-interval '1 second' where binding_id=(select id from public_test_receipt);
select is(public_test_private.active_binding('catalog'),null::uuid,'clock expiry closes catalog without a frontend flag');
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),false,'clock expiry closes saved operations');
select is(app_public.begin_account_registration_operation('37600000-0000-4000-8000-000000000006','37600000-0000-4000-8000-000000000005','37600000-0000-4000-8000-000000000004','generate_link')->>'state','calling','public signup provider work survives catalog scope expiry');
select * from pg_temp.check_lifecycle('expired','37600000-0000-4000-8000-000000000008');
update public_test_private.bindings set expires_at=statement_timestamp()+interval '1 day' where binding_id=(select id from public_test_receipt);
select is((select public_test_private.revoke(id,2) from public_test_receipt),3::bigint,'operator stop revokes the binding');
select is((select mode from app_private.account_registration_config where id=1),'closed','stop invalidates registration provider configuration');
select is(public_test_private.active_binding('catalog'),null::uuid,'stop closes anonymous catalog');
select set_config('request.path','/rpc/shopper_list_saved',true);
set local role authenticated;
select throws_ok($$select app_public.shopper_list_saved()$$,'42501','shopper_private_access_denied','already-open authenticated session loses save access after stop');
reset role;
select is(app_public.complete_public_test_registration_callback('37600000-0000-4000-8000-000000000003'),false,'completed callback cannot re-admit after stop');
select * from pg_temp.check_lifecycle('stopped','37600000-0000-4000-8000-000000000009');
select set_config('request.path','/rpc/request_account_deletion',true);
select is(public_test_private.actor_allowed('37600000-0000-4000-8000-000000000003'),true,'stop preserves necessary lifecycle access');
select throws_ok($$select public_test_private.activate(id,3) from public_test_receipt$$,'42501','public_test_activation_denied','revoked receipt cannot reactivate');
select * from finish();
rollback;
