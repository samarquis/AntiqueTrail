begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
grant identity_service, public_catalog_gateway to postgres;
grant usage on schema extensions to authenticated, public_catalog_gateway;
select ok(pg_has_role('authenticator','public_catalog_gateway','MEMBER'), 'authenticator can use the constrained gateway role');
select ok(not has_schema_privilege('authenticated','internal_review_private','USAGE'), 'browser cannot enter internal schema');
select ok(not has_table_privilege('service_role','internal_review_private.authorizations','INSERT'), 'service API cannot issue authorizations');
select ok(not has_function_privilege('authenticated','internal_review_private.revoke_authorization(uuid,text)','EXECUTE'), 'browser cannot invoke operator revocation');
select ok(not has_table_privilege('public_catalog_gateway','app_public.stores','SELECT'), 'gateway membership adds no direct catalog access');
select ok(internal_review_private.session_allowed(null), 'unactivated migration preserves ordinary context');

insert into auth.users(id) values ('99000000-0000-4000-8000-000000000001'), ('99000000-0000-4000-8000-000000000002');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001',statement_timestamp(),statement_timestamp());
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at) values
 ('99000000-0000-4000-8000-000000000001','shopper-a@review-reset-20260906.invalid',statement_timestamp()),
 ('99000000-0000-4000-8000-000000000002','unlisted@review-reset-20260906.invalid',statement_timestamp())
on conflict(user_id) do update set verified_email_snapshot=excluded.verified_email_snapshot,age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
 ('99000000-0000-4000-8000-000000000001','shopper','active'),
 ('99000000-0000-4000-8000-000000000002','shopper','active');
reset role;
insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values ('99000000-0000-4000-8000-000000000001','shopper-a','review-reset-20260906','shopper-a@review-reset-20260906.invalid');
select ok(not internal_review_private.session_allowed('99000000-0000-4000-8000-000000000001'), 'identity marker denies missing authorization');
select throws_ok($$delete from internal_review_private.identities$$,'42501','internal_identity_or_authorization_immutable','identity cannot lose its internal marker');
insert into internal_review_private.runtime_binding values
 (1,'ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app','product-reset-task',statement_timestamp(),1);
insert into internal_review_private.authorizations(
 receipt_id,schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,
 fixture_manifest_digest,identity_allowlist,allowed_capabilities,excluded_provider_actions,issued_at,expires_at)
values ('99000000-0000-4000-8000-000000000021',1,'internal_synthetic_assessment','ADR0008 owner approval','product_owner',
 '01a07739-9f14-73c0-8253-2da0e5576afe','product-reset-task','ykyrvqddgnfmgftjwpts',repeat('a',40),repeat('b',64),repeat('c',64),'dpl_Test',
 'https://antique-trail-test-scott-marquis-projects.vercel.app',1,repeat('d',64),array['99000000-0000-4000-8000-000000000001']::uuid[],
 array['catalog','session'],array['email','external_participants','media','routing','payments','public_activation'],statement_timestamp(),statement_timestamp()+interval '20 minutes');
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null, 'authorization requires installed Data API guard');
alter role authenticator set pgrst.db_pre_request = 'app_public.internal_review_pre_request';
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') > statement_timestamp(), 'trusted matching record admits its exact actor');
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000002') is null, 'unlisted account cannot use authorization');
select is((select count(*)::integer from internal_review_private.cleanup_queue),1,'expiry cleanup is queued immediately');
select throws_ok($$update internal_review_private.authorizations set expires_at=expires_at+interval '1 minute'$$,
 '42501','internal_authorization_immutable','authorization cannot be silently renewed');
update internal_review_private.runtime_binding set configuration_digest=repeat('e',64);
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null,'changed configuration invalidates authorization');
update internal_review_private.runtime_binding set configuration_digest=repeat('c',64);
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
select set_config('request.method','POST',true);
select set_config('request.path','/rpc/register_current_session',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
set local role authenticated;
select lives_ok($$select app_public.internal_review_pre_request()$$,'exact authenticated allowed origin/path passes pre-request');
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'real provider session registration succeeds');
select set_config('request.path','rpc/account_lifecycle_status',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,'mandatory account-status hydration is allowed');
select is(app_public.account_lifecycle_status()->>'state','active','registered shopper can hydrate authoritative account state');
select set_config('request.path','rpc/request_account_deletion',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','account-status read does not enable deletion');
select set_config('request.path','rpc/request_account_export',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','account-status read does not enable export');
select set_config('request.path','rpc/register_current_session',true);

reset role;
select ok((select access_token_expires_at <= statement_timestamp()+interval '20 minutes' from app_private.active_sessions where user_id='99000000-0000-4000-8000-000000000001'),'app session expiry clamps to authorization deadline');
select set_config('request.headers','{"origin":"https://foreign.invalid"}',true);
set local role authenticated;
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','foreign origin denied');
reset role;
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.path','rpc/create_trip',true);
set local role authenticated;
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','unsupported RPC denied before invocation');
select ok(not app_public.current_session_is_active(),'central RLS predicate also denies unsupported operation');
reset role;
select set_config('request.path','',true);
select ok(not internal_review_private.session_allowed('99000000-0000-4000-8000-000000000001'),'missing Data API context denies Storage or worker path');
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state)
select '99000000-0000-4000-8000-000000001099','unowned-review-store',name,town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state
from app_public.stores where id='00000000-0000-4000-8000-000000001001';
select set_config('request.path','rpc/synthetic_catalog_gateway_request',true);
select set_config('request.jwt.claims','{"role":"public_catalog_gateway"}',true);
set local role public_catalog_gateway;
select lives_ok($$select app_public.internal_review_pre_request()$$,'gateway origin and allowed path passes before actor validation');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','list','{}')),12,'admitted shopper reads twelve owned seed stores');
select is(jsonb_array_length(app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','details','{"p_slug":"unowned-review-store"}')),0,'foreign store detail is excluded');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000011','list','{}')$$,
 '42501','synthetic_catalog_forbidden','foreign account cannot reuse shopper session');
select throws_ok($$select app_public.synthetic_catalog_gateway_request(repeat('f',64),
 '99000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000011','map','{}')$$,
 '42501','synthetic_catalog_map_disabled','routing/map capability remains denied');
reset role;
select set_config('request.path','rpc/current_session_is_active',true);
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
set local role identity_service;
update app_private.profiles set status='deletion_scheduled',deletion_due_at=statement_timestamp()+interval '1 day' where user_id='99000000-0000-4000-8000-000000000001';
update app_private.active_sessions set state='cancellation_only' where user_id='99000000-0000-4000-8000-000000000001';
select ok(not app_private.current_session_is_cancellation_only(),'internal identity cannot escape through deletion cancellation');
reset role;
select lives_ok($$select internal_review_private.revoke_authorization('99000000-0000-4000-8000-000000000021','review_finished')$$,'trusted revocation succeeds');
select lives_ok($$select internal_review_private.revoke_authorization('99000000-0000-4000-8000-000000000021','review_finished')$$,'duplicate revocation is safe');
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null,'revoked record denies live JWT');
insert into internal_review_private.authorizations select (jsonb_populate_record(null::internal_review_private.authorizations,
 to_jsonb(a)||jsonb_build_object('receipt_id','99000000-0000-4000-8000-000000000022',
 'issued_at',statement_timestamp()-interval '2 hours','expires_at',statement_timestamp()-interval '1 hour',
 'revoked_at',null,'revocation_reason',null))).* from internal_review_private.authorizations a
 where receipt_id='99000000-0000-4000-8000-000000000021';
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null,'unrevoked expired authorization still denies access');
select throws_ok($test$insert into internal_review_private.authorizations select (jsonb_populate_record(null::internal_review_private.authorizations,
 to_jsonb(a)||jsonb_build_object('receipt_id','99000000-0000-4000-8000-000000000023',
 'issued_at',statement_timestamp(),'expires_at',statement_timestamp()+interval '25 hours',
 'revoked_at',null,'revocation_reason',null))).* from internal_review_private.authorizations a
 where receipt_id='99000000-0000-4000-8000-000000000021'$test$,'23514',null,'more than 24 hours is rejected');

select is((select state::text from app_private.active_sessions where user_id='99000000-0000-4000-8000-000000000001'),'revoked','revocation also closes cancellation-only session');
select ok((select bool_and(due_at <= statement_timestamp()) from internal_review_private.cleanup_queue),'revocation advances cleanup deadline');
select throws_ok($$update internal_review_private.authorizations set revoked_at=null,revocation_reason=null$$,'42501','internal_authorization_immutable','revoked record cannot be revived');
select throws_ok($$delete from internal_review_private.authorizations$$,'42501','internal_identity_or_authorization_immutable','receipt audit cannot be deleted');
delete from internal_review_private.runtime_binding;
select ok(not internal_review_private.session_allowed('99000000-0000-4000-8000-000000000001'),'removed binding never restores ordinary access for internal identity');
select * from finish();
rollback;
