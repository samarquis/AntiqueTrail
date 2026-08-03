begin;
select plan(27);

select has_function('community_private','prepare_community',array['uuid','text','smallint','uuid','uuid','bigint','text','bytea'],'prepare command exists');
select has_function('community_private','freeze_community',array['uuid','uuid','bigint','bigint','bytea','bytea','uuid[]','text','bytea'],'freeze command exists');
select has_function('community_private','sign_community_readiness',array['uuid','uuid','bigint','bigint','text','bytea'],'sign command exists');
select has_function('community_private','cancel_community',array['uuid','uuid','text','bigint','bigint','text','bytea'],'cancel command exists');
select ok(not has_function_privilege('anon','community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea)','EXECUTE'),'anon cannot prepare');
select ok(not has_function_privilege('authenticated','community_private.freeze_community(uuid,uuid,bigint,bigint,bytea,bytea,uuid[],text,bytea)','EXECUTE'),'browser users cannot freeze');
select ok(not has_function_privilege('anon','community_private.sign_community_readiness(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE'),'anon cannot sign');
select ok(not has_function_privilege('authenticated','community_private.cancel_community(uuid,uuid,text,bigint,bigint,text,bytea)','EXECUTE'),'browser users cannot cancel');
select ok(has_function_privilege('community_deployment_service','community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea)','EXECUTE'),'deployment service can prepare');
select ok(has_function_privilege('community_deployment_service','community_private.freeze_community(uuid,uuid,bigint,bigint,bytea,bytea,uuid[],text,bytea)','EXECUTE'),'deployment service can freeze');
select ok(has_function_privilege('community_deployment_service','community_private.sign_community_readiness(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE'),'deployment service can sign');
select ok(has_function_privilege('community_deployment_service','community_private.cancel_community(uuid,uuid,text,bigint,bigint,text,bytea)','EXECUTE'),'deployment service can cancel');
select ok(not has_table_privilege('community_deployment_service','community_private.community_activation_runs','INSERT'),'deployment service remains execute-only');
select ok(not exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='community_private'
    and p.proname in ('prepare_community','freeze_community','sign_community_readiness','cancel_community')
    and lower(pg_get_functiondef(p.oid)) like '%insert into community_private.community_evidence_receipts%'
),'commands never manufacture evidence');
select ok((select convalidated from pg_constraint where conname='community_command_receipts_operation_check'),'extended operation constraint is validated');

insert into community_private.community_evidence_receipts(
  receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,prior_receipt_id,
  artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,predicates
) values
('16000000-0000-4000-8000-000000000002','rg01_pass','ProductOwner','pass','topeka',null,null,null,null,
 decode(repeat('02',32),'hex'),true,'{"all_predicates_pass":true}'::jsonb),
('16000000-0000-4000-8000-000000000001','selection','ProductOwner','pass','osage-city',null,'16000000-0000-4000-8000-000000000002',null,null,
 decode(repeat('01',32),'hex'),true,'{"eligible_small_community":true}'::jsonb),
('16000000-0000-4000-8000-000000000003','catalog_freeze','ProductOwner','pass','osage-city','16000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('05',32),'hex'),true,
 '{"artifact_binding_frozen":true,"store_set_frozen":true}'::jsonb),
('16000000-0000-4000-8000-000000000004','readiness','ProductOwner','pass','osage-city','16000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('06',32),'hex'),true,
 '{"all_predicates_pass":true}'::jsonb),
('16000000-0000-4000-8000-000000000005','cancellation','ProductOwner','cancel','osage-city','16000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('07',32),'hex'),true,
 '{"cancel_authorized":true}'::jsonb);

set local role community_deployment_service;
select lives_ok(
  $$select community_private.prepare_community(
    '16000000-0000-4000-8000-000000000101','osage-city',1,
    '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002',
    1,'prepare-osage',decode(repeat('10',32),'hex'))$$,
  'verified selection and prerequisite prepare the singleton run'
);
select lives_ok(
  $$select community_private.prepare_community(
    '16000000-0000-4000-8000-000000000101','osage-city',1,
    '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002',
    1,'prepare-osage',decode(repeat('10',32),'hex'))$$,
  'exact prepare replay succeeds despite stale expected version'
);
select throws_ok(
  $$select community_private.prepare_community(
    '16000000-0000-4000-8000-000000000101','osage-city',1,
    '16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000002',
    1,'prepare-osage',decode(repeat('11',32),'hex'))$$,
  '22023','community_idempotency_mismatch','changed prepare input cannot reuse a key'
);
select lives_ok(
  $$select community_private.freeze_community(
    '16000000-0000-4000-8000-000000000101','16000000-0000-4000-8000-000000000003',
    2,1,decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),
    array['16000000-0000-4000-8000-000000000201'::uuid,'16000000-0000-4000-8000-000000000202'::uuid],
    'freeze-osage',decode(repeat('12',32),'hex'))$$,
  'verified freeze binds the exact projection and store set'
);
reset role;
select is((select count(*)::integer from community_private.community_projection_stores where run_id='16000000-0000-4000-8000-000000000101'),2,'freeze persists exactly two stores');
select ok(not (select visible from community_private.community_catalog_projections where run_id='16000000-0000-4000-8000-000000000101'),'frozen projection stays private');
set local role community_deployment_service;
select lives_ok(
  $$select community_private.sign_community_readiness(
    '16000000-0000-4000-8000-000000000101','16000000-0000-4000-8000-000000000004',
    2,2,'sign-osage',decode(repeat('13',32),'hex'))$$,
  'externally verified readiness signs the frozen run'
);
reset role;
select is((select state from community_private.community_activation_runs where run_id='16000000-0000-4000-8000-000000000101'),'readiness_signed','sign persists readiness state');
set local role community_deployment_service;
select lives_ok(
  $$select community_private.cancel_community(
    '16000000-0000-4000-8000-000000000101','16000000-0000-4000-8000-000000000005',
    'Product Owner cancelled before activation',2,3,'cancel-osage',decode(repeat('14',32),'hex'))$$,
  'verified cancellation closes the active preparation'
);
reset role;
select is((select state from community_private.community_activation_runs where run_id='16000000-0000-4000-8000-000000000101'),'cancelled','cancel persists terminal state');
select ok((select active_run_id is null from community_private.community_expansion_root where root_id=1),'cancel releases the singleton root');
select is((select count(*)::integer from community_private.community_command_receipts where run_id='16000000-0000-4000-8000-000000000101'),4,'one durable ledger row exists per completed command');

select * from finish();
rollback;
