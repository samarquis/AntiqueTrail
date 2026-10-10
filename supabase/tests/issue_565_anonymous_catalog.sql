begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Test-only memberships and fixtures roll back with this transaction.
grant identity_service, public_catalog_gateway to postgres;
grant usage on schema extensions to anon, authenticated, service_role, public_catalog_gateway;
-- Keep expected baseline failures inside assertions, not an aborted test file.
-- SECURITY INVOKER: every call below still exercises the actual caller role.
create function pg_temp.catalog_request(
 op text, args jsonb, actor uuid default null, session uuid default null,
 key_hash text default repeat('65',32)
) returns jsonb language plpgsql as $$
begin
 return jsonb_build_object('result',app_public.synthetic_catalog_gateway_request(key_hash,actor,session,op,args));
exception when others then
 return jsonb_build_object('state',sqlstate,'error',sqlerrm);
end $$;
create function pg_temp.denied(sql text) returns boolean language plpgsql as $$
begin execute sql; return false;
exception when insufficient_privilege then return true;
end $$;

insert into auth.users(id) values ('65700000-0000-4000-8000-000000000001');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('65700000-0000-4000-8000-000000000011','65700000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at)
values ('65700000-0000-4000-8000-000000000001','anonymous-657@review.invalid',statement_timestamp())
on conflict(user_id) do update set status='active',verified_email_snapshot=excluded.verified_email_snapshot,age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state)
values ('65700000-0000-4000-8000-000000000001','shopper','active');
update app_private.environment_stage set stage='synthetic_alpha',
 receipt_id='65700000-0000-4000-8000-000000000031',
 capabilities='{"private_auth":true,"anonymous_catalog":true}' where id=1;
update app_private.account_registration_config set mode='receipt_only',
 stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
update app_private.registration_quarantine_latch set state='open',blocked_at=null where id=1;
alter role authenticator set pgrst.db_pre_request='app_public.internal_review_pre_request';
select set_config('request.method','POST',true);
select set_config('request.path','rpc/register_current_session',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.jwt.claims','{"sub":"65700000-0000-4000-8000-000000000001","role":"authenticated","session_id":"65700000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select lives_ok($$select app_public.internal_review_pre_request()$$,'fixture registration passes installed pre-request guard');
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),
 'fixture registers an actual provider-backed session');
reset role;

insert into app_public.catalog_areas(id,slug,label,state_code)
values ('65700000-0000-4000-8000-000000000100','issue-657','Issue 657','KS');
insert into app_public.store_categories(id,slug,label)
values ('65700000-0000-4000-8000-000000000101','issue-657','Issue 657');
insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,latitude,longitude,summary,description)
values
 ('65700000-0000-4000-8000-000000000102',true,'synthetic','active','issue-657-synthetic','Issue 657 Synthetic','Fixture Town','KS','1 Fixture Street','65700000-0000-4000-8000-000000000100',0,0,'Synthetic fixture','Transaction-only fixture.'),
 ('65700000-0000-4000-8000-000000000103',false,'public','active','issue-657-public','Issue 657 Public','Fixture Town','KS','2 Fixture Street','65700000-0000-4000-8000-000000000100',0,0,'Public fixture','Transaction-only fixture.');
insert into app_public.store_category_assignments(store_id,category_id)
select id,'65700000-0000-4000-8000-000000000101' from app_public.stores
where id in ('65700000-0000-4000-8000-000000000102','65700000-0000-4000-8000-000000000103');
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
select s.id,g.name,statement_timestamp()-interval '1 day','Issue 657 fixture','two_person_public_source'
from app_public.stores s cross join (values('identity_location'::app_public.verification_group),('contact'),('hours'),('categories_attributes'))g(name)
where s.id in ('65700000-0000-4000-8000-000000000102','65700000-0000-4000-8000-000000000103');

select ok(not internal_review_private.is_internal(null),'anonymous positive fixture has no internal binding');
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
set local role public_catalog_gateway;
select lives_ok($$select app_public.internal_review_pre_request()$$,'gateway request context passes installed guard');
select is(pg_temp.catalog_request('list','{"p_category":"issue-657"}')->'result'->0->>'id',
 '65700000-0000-4000-8000-000000000102','anonymous list returns deterministic synthetic fixture');
select is(jsonb_array_length(pg_temp.catalog_request('list','{"p_category":"issue-657"}')->'result'),1,
 'anonymous list excludes the qualifying public fixture');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->'result'->0->>'id',
 '65700000-0000-4000-8000-000000000102','anonymous details returns the synthetic fixture');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-public"}')->'result','[]'::jsonb,
 'anonymous details excludes public audience');
-- Same statement gives both projections the same as_of_utc timestamp.
select is(pg_temp.catalog_request('list','{"p_category":"issue-657"}')->'result',
 pg_temp.catalog_request('list','{"p_category":"issue-657"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result',
 'anonymous list equals the entire existing authenticated public projection');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->'result',
 pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result',
 'anonymous details equals the entire existing authenticated public projection');
select is(pg_temp.catalog_request('list','{"p_category":"issue-657"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result'->0->>'id',
 '65700000-0000-4000-8000-000000000102','authenticated active Shopper still receives fixture');
select is(pg_temp.catalog_request('list','{}','65700000-0000-4000-8000-000000000001',null)->>'state','42501','user-only identity cannot use anonymous branch');
select is(pg_temp.catalog_request('list','{}',null,'65700000-0000-4000-8000-000000000011')->>'state','42501','session-only identity cannot use anonymous branch');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001',null)->>'state','42501','details user-only identity denied');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}',null,'65700000-0000-4000-8000-000000000011')->>'state','42501','details session-only identity denied');
select is(pg_temp.catalog_request('map','{}')->>'error','synthetic_catalog_map_disabled','anonymous map remains disabled');
select is(pg_temp.catalog_request('nearby-list','{"p_q":null,"p_category":null,"p_area":null,"p_device_latitude":0,"p_device_longitude":0,"p_device_radius_miles":5}')->>'state','42501','valid anonymous Nearby input is denied');
select is(pg_temp.catalog_request('list','{}',null,null,'bad')->>'error','gateway_request_invalid','anonymous malformed rate key rejected');
select is(pg_temp.catalog_request('list','{"unexpected":true}')->>'error','gateway_request_invalid','anonymous unknown list argument rejected');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic","actor_id":"forged"}')->>'error','gateway_request_invalid','anonymous forged details argument rejected');
select is(pg_temp.catalog_request('list','[]')->>'error','gateway_request_invalid','anonymous non-object args rejected');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=capabilities-'anonymous_catalog' where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','missing anonymous capability denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','missing anonymous capability denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=jsonb_set(capabilities,'{anonymous_catalog}','false') where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','false anonymous capability denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','false anonymous capability denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=capabilities-'private_auth' where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','missing private_auth capability denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','missing private_auth capability denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=jsonb_set(capabilities,'{private_auth}','false') where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','false private_auth capability denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','false private_auth capability denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.environment_stage set receipt_id=null where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','missing stage receipt denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','missing stage receipt denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000032' where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','mismatched registration receipt denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','mismatched registration receipt denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities='{"private_auth":true,"anonymous_catalog":true}',receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
reset role;
set local role identity_service;
update app_private.account_registration_config set mode='closed' where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','closed registration denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','closed registration denies anonymous details');
reset role;
set local role identity_service;
update app_private.account_registration_config set mode='receipt_only' where id=1;
reset role;
update app_private.registration_quarantine_latch set state='blocked',blocked_at=statement_timestamp() where id=1;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','blocked quarantine denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','blocked quarantine denies anonymous details');
reset role;
update app_private.registration_quarantine_latch set state='open',blocked_at=null where id=1;
set local role identity_service;
update app_private.environment_stage set stage='private_beta' where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'error','synthetic_catalog_outside_stage','wrong stage denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'error','synthetic_catalog_outside_stage','wrong stage denies anonymous details');
reset role;
set local role identity_service;
update app_private.environment_stage set stage='synthetic_alpha' where id=1;
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp()
where session_id='65700000-0000-4000-8000-000000000011';
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->>'error',
 'synthetic_catalog_forbidden','explicit anonymous capability does not admit revoked authenticated session');
reset role;
set local role identity_service;
update app_private.active_sessions set state='active',revoked_at=null where session_id='65700000-0000-4000-8000-000000000011';
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000099')->>'error',
 'synthetic_catalog_forbidden','explicit anonymous capability does not admit unknown authenticated session');
reset role;
set local role identity_service;
update app_private.role_grants set state='revoked',revoked_at=statement_timestamp()
where subject_user_id='65700000-0000-4000-8000-000000000001' and role='shopper';
insert into app_private.role_grants(subject_user_id,role,store_id,state)
values ('65700000-0000-4000-8000-000000000001','representative','65700000-0000-4000-8000-000000000102','active');
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->>'error',
 'synthetic_catalog_forbidden','active Representative with revoked Shopper is not admitted');
reset role;
set local role identity_service;
update app_private.role_grants set state='active',revoked_at=null
where subject_user_id='65700000-0000-4000-8000-000000000001' and role='shopper';
reset role;

-- Independently anchor details comparison to a successful authenticated result.
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result'->0->>'id',
 '65700000-0000-4000-8000-000000000102','authenticated details retains expected fixture');
reset role;
set local role identity_service;
update app_private.account_registration_config set stage_receipt_id=null where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','missing registration receipt denies anonymous list');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','missing registration receipt denies anonymous details');
reset role;
set local role identity_service;
update app_private.account_registration_config set stage_receipt_id='65700000-0000-4000-8000-000000000031' where id=1;
update app_private.environment_stage set capabilities=jsonb_set(capabilities,'{anonymous_catalog}','"true"') where id=1;
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','string true is not explicit boolean anonymous capability');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','details rejects string anonymous capability');
reset role;
set local role identity_service;
update app_private.environment_stage set capabilities=jsonb_set(capabilities,'{anonymous_catalog}','true') where id=1;
update app_private.profiles set status='deletion_pending',deletion_due_at=statement_timestamp()+interval '7 days'
where user_id='65700000-0000-4000-8000-000000000001';
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->>'error',
 'synthetic_catalog_forbidden','inactive authenticated profile cannot fall back to anonymous');
reset role;
set local role identity_service;
update app_private.profiles set status='active',deletion_due_at=null where user_id='65700000-0000-4000-8000-000000000001';
update app_private.active_sessions set access_token_expires_at=statement_timestamp()-interval '1 second'
where session_id='65700000-0000-4000-8000-000000000011';
reset role;
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->>'error',
 'synthetic_catalog_forbidden','expired authenticated token cannot fall back to anonymous');
reset role;
set local role identity_service;
update app_private.active_sessions set access_token_expires_at=statement_timestamp()+interval '1 hour'
where session_id='65700000-0000-4000-8000-000000000011';
reset role;
-- Rate seeds and calls share one statement, avoiding five-minute boundary races.
grant release_automation to postgres;
select lives_ok($test$
do $block$
declare w timestamptz:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
 set local role release_automation;
 insert into release_private.public_catalog_rate_windows values(decode(repeat('a6',32),'hex'),'list',w,59);
 reset role;
 set local role public_catalog_gateway;
 perform app_public.synthetic_catalog_gateway_request(repeat('a6',32),null,null,'list','{}');
 reset role;
 set local role release_automation;
 if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('a6',32),'hex') and operation='list' and window_start=w and request_count=60) then raise exception 'expected list count 60'; end if;
 reset role;
end $block$;
$test$,'anonymous list request 60 succeeds and persists count');
reset role;
select throws_ok($test$
do $block$
declare w timestamptz:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
 set local role release_automation;
 insert into release_private.public_catalog_rate_windows values(decode(repeat('b6',32),'hex'),'list',w,60);
 reset role;
 set local role public_catalog_gateway;
 perform app_public.synthetic_catalog_gateway_request(repeat('b6',32),null,null,'list','{}');
end $block$;
$test$,'P0001','catalog_rate_limited','anonymous list request 61 is denied');
reset role;
select lives_ok($test$
do $block$
declare w timestamptz:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
 set local role release_automation;
 insert into release_private.public_catalog_rate_windows values(decode(repeat('c6',32),'hex'),'details',w,119);
 reset role;
 set local role public_catalog_gateway;
 perform app_public.synthetic_catalog_gateway_request(repeat('c6',32),null,null,'details','{"p_slug":"issue-657-synthetic"}');
 reset role;
 set local role release_automation;
 if not exists(select 1 from release_private.public_catalog_rate_windows where key_hash=decode(repeat('c6',32),'hex') and operation='details' and window_start=w and request_count=120) then raise exception 'expected details count 120'; end if;
 reset role;
end $block$;
$test$,'anonymous details request 120 succeeds and persists count');
reset role;
select throws_ok($test$
do $block$
declare w timestamptz:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
begin
 set local role release_automation;
 insert into release_private.public_catalog_rate_windows values(decode(repeat('d6',32),'hex'),'details',w,120);
 reset role;
 set local role public_catalog_gateway;
 perform app_public.synthetic_catalog_gateway_request(repeat('d6',32),null,null,'details','{"p_slug":"issue-657-synthetic"}');
end $block$;
$test$,'P0001','catalog_rate_limited','anonymous details request 121 is denied');
reset role;
revoke release_automation from postgres;

-- Exact actual-role ACLs, not a grant inferred from JWT labels.
select ok((select prosecdef and provolatile='v' and 'search_path=""'=any(coalesce(proconfig,'{}'))
 and pg_get_userbyid(proowner)='synthetic_catalog_automation'
 from pg_proc where oid='app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)'::regprocedure),
 'wrapper retains constrained owner, volatility, SECURITY DEFINER and empty search_path');
select ok(has_function_privilege('public_catalog_gateway','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('anon','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('authenticated','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE')
 and not has_function_privilege('service_role','app_public.synthetic_catalog_gateway_request(text,uuid,uuid,text,jsonb)','EXECUTE'),
 'effective gateway ACL unchanged');
set local role anon;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('65',32),null,null,'list','{}')$$),'actual anon cannot directly execute gateway');
select ok(pg_temp.denied($$select * from app_private.profiles$$),'actual anon cannot read private profiles');
select ok(pg_temp.denied($$insert into shopper_private.saved_stores(user_id,store_id) values ('65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000102')$$),'actual anon cannot write Saved stores');
reset role;
set local role authenticated;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('65',32),null,null,'list','{}')$$),'actual authenticated cannot directly execute gateway');
reset role;
set local role service_role;
select ok(pg_temp.denied($$select app_public.synthetic_catalog_gateway_request(repeat('65',32),null,null,'list','{}')$$),'actual service_role cannot directly execute gateway');
reset role;
set local role public_catalog_gateway;
select ok(pg_temp.denied($$select * from app_public.catalog_list(null,null,null)$$),'gateway cannot bypass wrapper through list reader');
select ok(pg_temp.denied($$select * from app_public.catalog_details('issue-657-synthetic')$$),'gateway cannot bypass wrapper through details reader');
reset role;

-- Install valid internal context last: immutable identities/receipts are never deleted.
insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values ('65700000-0000-4000-8000-000000000001','shopper-a','review-reset-20260906','shopper-a@review-reset-20260906.invalid');
insert into internal_review_private.runtime_binding values
 (1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
insert into internal_review_private.authorizations(
 receipt_id,schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,
 fixture_manifest_digest,identity_allowlist,allowed_capabilities,excluded_provider_actions,issued_at,expires_at)
values ('65700000-0000-4000-8000-000000000021',1,'internal_synthetic_assessment','Issue 657 isolated fixture','product_owner',
 '01a07739-9f14-73c0-8253-2da0e5576afe','product-reset-task','ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app',1,repeat('d',64),array['65700000-0000-4000-8000-000000000001']::uuid[],
 array['catalog','session'],array['email','external_participants','media','routing','payments','public_activation'],statement_timestamp(),statement_timestamp()+interval '20 minutes');
select ok(internal_review_private.is_internal(null),'active binding marks null actor internal');
select ok(internal_review_private.valid_until('65700000-0000-4000-8000-000000000001') is not null,'internal fixture has matching unexpired immutable receipt');
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.method','POST',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
set local role public_catalog_gateway;
select is(pg_temp.catalog_request('list','{}')->>'state','42501','active internal binding denies anonymous list despite both capabilities');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}')->>'state','42501','active internal binding denies anonymous details despite both capabilities');
select is(pg_temp.catalog_request('list','{"p_category":"issue-657"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result','[]'::jsonb,
 'authorized internal list filters otherwise eligible fixture outside fixed store set');
select is(pg_temp.catalog_request('details','{"p_slug":"issue-657-synthetic"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result','[]'::jsonb,
 'authorized internal details filters outside fixed store set');
select is(pg_temp.catalog_request('details','{"p_slug":"clockwork-cabinet"}','65700000-0000-4000-8000-000000000001','65700000-0000-4000-8000-000000000011')->'result'->0->>'id',
 '00000000-0000-4000-8000-000000001001','authorized internal details still returns fixed seed');
reset role;

select * from finish();
rollback;
