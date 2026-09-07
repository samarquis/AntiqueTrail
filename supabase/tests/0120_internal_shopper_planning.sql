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
 array['catalog','session','shopper_planning'],array['email','external_participants','media','routing','payments','public_activation'],statement_timestamp(),statement_timestamp()+interval '20 minutes');
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is null, 'authorization requires installed Data API guard');
alter role authenticator set pgrst.db_pre_request = 'app_public.internal_review_pre_request';
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') > statement_timestamp(), 'trusted matching record admits its exact actor');
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state)
select '99000000-0000-4000-8000-000000001099','unowned-review-store','Unowned review store',town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state
from app_public.stores where id='00000000-0000-4000-8000-000000001001';
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
select set_config('request.method','POST',true);
select set_config('request.headers','{"origin":"https://antique-trail-test-scott-marquis-projects.vercel.app"}',true);
select set_config('request.path','rpc/register_current_session',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'planning shopper registers');
select set_config('request.path','rpc/shopper_set_save',true);
select lives_ok($$select app_public.internal_review_pre_request()$$,'planning capability admits an exact saved-store path');
select is(app_public.shopper_set_save('00000000-0000-4000-8000-000000001001',true)->>'saved','true','owned store saved');
select is(app_public.shopper_set_save('00000000-0000-4000-8000-000000001001',true)->>'saved','true','save retry remains idempotent');
select throws_ok($$select app_public.shopper_set_save('99000000-0000-4000-8000-000000001099',true)$$,'22023','store_not_available','foreign store cannot be saved');
select set_config('request.path','rpc/shopper_upsert_memory',true);
select is(app_public.shopper_upsert_memory('00000000-0000-4000-8000-000000001001',4::smallint,'Owned synthetic note',null,0)->>'note','Owned synthetic note','owned private memory written');
select throws_ok($$select app_public.shopper_upsert_memory('00000000-0000-4000-8000-000000001001',4::smallint,'Stale',null,0)$$,'40001','private_memory_version_conflict','memory concurrency check preserved');
select throws_ok($$select app_public.shopper_upsert_memory('99000000-0000-4000-8000-000000001099',4::smallint,'Foreign',null,0)$$,'22023','store_not_available','foreign memory denied');
select set_config('request.path','rpc/create_trip',true);
select set_config('test.owned_trip',app_public.create_trip('Owned synthetic trip','2026-09-08')->>'id',true);
select ok(current_setting('test.owned_trip') is not null,'owned trip created');
reset role;
select is((select count(*) from internal_review_private.owned_trips),1::bigint,'trip fixture registered atomically before creation');
select ok(not has_table_privilege('authenticated','internal_review_private.owned_trips','INSERT'),'browser cannot register an arbitrary trip fixture');
set local role authenticated;
select set_config('request.path','rpc/add_trip_stop',true);
select is(jsonb_array_length(app_public.add_trip_stop(current_setting('test.owned_trip'),'store','Clockwork Cabinet','prefer',60)->'stops'),1,'owned catalog stop added');
select throws_ok($$select app_public.add_trip_stop(current_setting('test.owned_trip'),'store','Unowned review store','prefer',60)$$,'P0001','store_stop_not_found','name lookup cannot resolve foreign store');
select set_config('request.path','rpc/get_trip',true);
select is(app_public.get_trip(current_setting('test.owned_trip'))->>'name','Owned synthetic trip','owner reads own trip');
select throws_ok($$select app_public.get_trip('99000000-0000-4000-8000-000000009999')$$,'P0001','authorization_lost','unowned trip denied');
select set_config('request.path','rpc/create_trip',true);
select lives_ok($$select app_public.create_trip('Second owned trip','2026-09-08')$$,'second bounded fixture succeeds');
select lives_ok($$select app_public.create_trip('Third owned trip','2026-09-08')$$,'third bounded fixture succeeds');
select throws_ok($$select app_public.create_trip('Excess trip','2026-09-08')$$,'42501','internal_trip_fixture_limit','fourth fixture denied');
select set_config('request.path','rpc/start_trip',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','Go lifecycle excluded');
select set_config('request.path','rpc/request_account_export',true);
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','export remains excluded');
reset role;
-- A separately admitted sibling must not inherit any saved rows, memories or trips.
insert into internal_review_private.identities(user_id,alias,fixture_namespace,controlled_address)
values('99000000-0000-4000-8000-000000000002','shopper-b','review-reset-20260906','shopper-b@review-reset-20260906.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('99000000-0000-4000-8000-000000000012','99000000-0000-4000-8000-000000000002',statement_timestamp(),statement_timestamp());
insert into internal_review_private.authorizations
select '99000000-0000-4000-8000-000000000022',schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,fixture_manifest_digest,
 array['99000000-0000-4000-8000-000000000002']::uuid[],allowed_capabilities,excluded_provider_actions,issued_at,expires_at,null,null
from internal_review_private.authorizations where receipt_id='99000000-0000-4000-8000-000000000021';
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000012"}',true);
select set_config('request.path','rpc/register_current_session',true);
set local role authenticated;
select ok(app_public.register_current_session((extract(epoch from statement_timestamp()+interval '1 hour')*1000)::bigint),'sibling registers independently');
select set_config('request.path','rpc/shopper_list_saved',true);
select is(app_public.shopper_list_saved(),'[]'::jsonb,'sibling saved list excludes first account');
select set_config('request.path','rpc/shopper_list_memories',true);
select is(app_public.shopper_list_memories(),'[]'::jsonb,'sibling memory list excludes first account');
select set_config('request.path','rpc/get_trip',true);
select throws_ok($$select app_public.get_trip(current_setting('test.owned_trip'))$$,'P0001','authorization_lost','real sibling trip denied');
select set_config('request.path','rpc/list_trips',true);
select is(app_public.list_trips(),'[]'::jsonb,'sibling trip list excludes first account');
reset role;
select internal_review_private.revoke_authorization('99000000-0000-4000-8000-000000000022','Planning test revocation');
set local role authenticated;
select throws_ok($$select app_public.internal_review_pre_request()$$,'42501','internal_request_denied','revoked planning admission denied before RPC');
select ok(not app_public.current_session_is_active(),'revoked session fails central predicate');
reset role;
update internal_review_private.runtime_binding set configuration_digest=repeat('e',64);
select ok(internal_review_private.planning_receipt('99000000-0000-4000-8000-000000000001') is null,'runtime mismatch denies planning capability');
update internal_review_private.runtime_binding set configuration_digest=repeat('c',64);
-- Catalog admission cannot lend its freshness to an expired planning record.
select internal_review_private.revoke_authorization('99000000-0000-4000-8000-000000000021','Replace planning record with catalog-only record');
insert into internal_review_private.authorizations
select '99000000-0000-4000-8000-000000000023',schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,fixture_manifest_digest,
 identity_allowlist,allowed_capabilities,excluded_provider_actions,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour',null,null
from internal_review_private.authorizations where receipt_id='99000000-0000-4000-8000-000000000021';
insert into internal_review_private.authorizations
select '99000000-0000-4000-8000-000000000024',schema_version,context,owner_decision_reference,issuer_role,executor_task_id,teardown_owner,
 backend_project_ref,source_sha,artifact_digest,configuration_digest,deployment_id,exact_origin,runtime_version,fixture_manifest_digest,
 identity_allowlist,array['catalog','session'],excluded_provider_actions,issued_at,expires_at,null,null
from internal_review_private.authorizations where receipt_id='99000000-0000-4000-8000-000000000021';
select ok(internal_review_private.valid_until('99000000-0000-4000-8000-000000000001') is not null,'catalog record remains fresh');
select ok(internal_review_private.planning_receipt('99000000-0000-4000-8000-000000000001') is null,'expired planning record cannot borrow catalog validity');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"99000000-0000-4000-8000-000000000011"}',true);
select set_config('request.path','rpc/shopper_set_save',true);
set local role authenticated;
select throws_ok($$select app_public.shopper_set_save('00000000-0000-4000-8000-000000001001',false)$$,'42501','shopper_private_access_denied','expired planning capability denies writes');
select set_config('request.path','rpc/shopper_list_memories',true);
select throws_ok($$select app_public.shopper_list_memories()$$,'42501','shopper_private_access_denied','expired planning capability denies reads');
reset role;
select * from finish();
rollback;
