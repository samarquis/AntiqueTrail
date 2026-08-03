begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select has_table('community_private','community_expansion_root','singleton expansion root exists');
select has_table('community_private','community_activation_runs','durable community runs exist');
select has_table('community_private','community_catalog_projections','exact-area projections exist');
select has_table('community_private','community_projection_stores','frozen store membership exists');
select has_table('community_private','community_evidence_receipts','external evidence receipts exist');
select has_table('community_private','community_command_receipts','idempotent command receipts exist');

select is(
  (select count(*)::integer from community_private.community_expansion_root),
  1,
  'the expansion root is a seeded singleton'
);
select ok(
  exists(select 1 from community_private.community_expansion_root where root_id=1 and last_activation_ordinal=0),
  'the singleton starts at ordinal zero without inventing an activation'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='community_private'
    and indexname='community_one_non_cancelled_run_per_area'),
  'a non-cancelled area can be reserved only once'
);
select ok(
  exists(select 1 from pg_constraint where conname='community_run_prerequisite_shape'),
  'run one RG-01 and later prior-gate prerequisites are structurally exclusive'
);
select ok(
  exists(select 1 from pg_trigger where tgname='community_evidence_append_only' and not tgisinternal),
  'human evidence receipts are append-only'
);
select ok(
  exists(select 1 from pg_trigger where tgname='community_projection_store_frozen' and not tgisinternal),
  'the exact frozen store set cannot be rewritten'
);

select has_function('community_private','activate_community','protected activation RPC exists');
select has_function('community_private','rollback_community','protected rollback RPC exists');
select has_function('community_private','reactivate_community','protected same-ordinal repair RPC exists');
select ok(
  not has_function_privilege('anon','community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE')
  and not has_function_privilege('authenticated','community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE'),
  'browser roles cannot execute activation'
);
select ok(
  not has_function_privilege('anon','community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE')
  and not has_function_privilege('authenticated','community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE'),
  'browser roles cannot execute rollback'
);
select ok(
  has_function_privilege('community_deployment_service','community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE')
  and has_function_privilege('community_deployment_service','community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE')
  and has_function_privilege('community_deployment_service','community_private.reactivate_community(uuid,uuid,bigint,bigint,text,bytea)','EXECUTE'),
  'the protected deployment executor has transition-only access'
);
select ok(
  not has_table_privilege('anon','community_private.community_activation_runs','SELECT')
  and not has_table_privilege('authenticated','community_private.community_activation_runs','SELECT')
  and not has_table_privilege('community_deployment_service','community_private.community_activation_runs','UPDATE'),
  'browser and executor roles cannot read or directly rewrite runs'
);
select ok(
  not has_table_privilege('community_deployment_service','community_private.community_evidence_receipts','INSERT'),
  'the deployment executor cannot fabricate human evidence'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname in ('activate_community','rollback_community','reactivate_community')
      and p.prosecdef and pg_get_userbyid(p.proowner)='community_automation'
    group by n.nspname having count(*)=3
  ),
  'all transitions execute under the narrow non-login automation owner'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname in ('activate_community','rollback_community','reactivate_community')
      and coalesce(array_to_string(p.proconfig,','),'') not like '%search_path=%'
  ),
  'all transition functions pin their search path'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname in ('activate_community','rollback_community','reactivate_community')
      and not (
        position('from community_private.community_expansion_root where root_id=1 for update' in lower(pg_get_functiondef(p.oid)))>0
        and position('from community_private.community_activation_runs where run_id=p_run_id for update' in lower(pg_get_functiondef(p.oid)))
          > position('from community_private.community_expansion_root where root_id=1 for update' in lower(pg_get_functiondef(p.oid)))
        and position('from community_private.community_catalog_projections where run_id=p_run_id for update' in lower(pg_get_functiondef(p.oid)))
          > position('from community_private.community_activation_runs where run_id=p_run_id for update' in lower(pg_get_functiondef(p.oid)))
      )
  ),
  'every transition locks singleton root then run then exact projection'
);
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='community_private' and c.relname in (
      'community_expansion_root','community_activation_runs','community_catalog_projections',
      'community_projection_stores','community_evidence_receipts','community_command_receipts'
    ) and c.relforcerowsecurity),
  6,
  'every Package 12 persistence table forces RLS'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname in ('activate_community','rollback_community','reactivate_community')
      and lower(pg_get_functiondef(p.oid)) like '%insert into community_private.community_evidence_receipts%'
  ),
  'transition RPCs never manufacture evidence receipts'
);

insert into community_private.community_evidence_receipts(
  receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,prior_receipt_id,
  artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,predicates
) values
('12000000-0000-4000-8000-000000000002','rg01_pass','ProductOwner','pass','topeka',null,null,null,null,
 decode(repeat('02',32),'hex'),true,'{"all_predicates_pass":true}'::jsonb),
('12000000-0000-4000-8000-000000000001','selection','ProductOwner','pass','osage-city',null,'12000000-0000-4000-8000-000000000002',null,null,
 decode(repeat('01',32),'hex'),true,'{"eligible_small_community":true}'::jsonb),
('12000000-0000-4000-8000-000000000003','readiness','ProductOwner','pass','osage-city','12000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('05',32),'hex'),true,
 '{"all_predicates_pass":true}'::jsonb),
('12000000-0000-4000-8000-000000000004','activation','ProductOwner','pass','osage-city','12000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('06',32),'hex'),true,
 '{"signed_frozen_artifacts":true,"recovery_capacity":true,"channel_consents":true,"canonical_route_bound":true,"canonical_route":"/stores?area=osage-city","schema_config_bound":true,"zero_blocking_defects":true}'::jsonb);

insert into community_private.community_activation_runs(
  run_id,attempt_sequence,target_ordinal,area_slug,selection_receipt_id,rg01_receipt_id,
  state,version,readiness_receipt_id,artifact_binding_digest,store_set_digest
) values (
  '12000000-0000-4000-8000-000000000101',1,1,'osage-city',
  '12000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002',
  'readiness_signed',1,'12000000-0000-4000-8000-000000000003',
  decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex')
);
insert into community_private.community_catalog_projections(
  run_id,area_slug,artifact_binding_digest,store_set_digest,visible,version
) values (
  '12000000-0000-4000-8000-000000000101','osage-city',decode(repeat('03',32),'hex'),
  decode(repeat('04',32),'hex'),false,1
);
insert into community_private.community_projection_stores(run_id,store_id) values
('12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000201'),
('12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000202');
update community_private.community_expansion_root
set last_attempt_sequence=1,active_run_id='12000000-0000-4000-8000-000000000101',version=2
where root_id=1;

set local role community_deployment_service;
select lives_ok(
  $$select community_private.activate_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000004',
    2,1,'activate-osage',decode(repeat('10',32),'hex'))$$,
  'a complete external receipt atomically activates the exact projection'
);
select lives_ok(
  $$select community_private.activate_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000004',
    2,1,'activate-osage',decode(repeat('10',32),'hex'))$$,
  'a lost-response activation retry returns prior success despite stale versions'
);
select throws_ok(
  $$select community_private.activate_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000004',
    2,1,'activate-osage',decode(repeat('11',32),'hex'))$$,
  '22023','community_idempotency_mismatch',
  'the same idempotency key with changed input is denied'
);
reset role;

select is((select state from community_private.community_activation_runs where run_id='12000000-0000-4000-8000-000000000101'),'live','activation persists live state');
select ok((select visible from community_private.community_catalog_projections where run_id='12000000-0000-4000-8000-000000000101'),'activation exposes only the bound projection');
select is((select last_activation_ordinal::integer from community_private.community_expansion_root where root_id=1),1,'activation advances exactly one ordinal');

insert into community_private.community_evidence_receipts(
  receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,prior_receipt_id,
  artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,predicates
) values
('12000000-0000-4000-8000-000000000005','rollback','ProductOwner','pass','osage-city','12000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('07',32),'hex'),true,
 '{"rollback_authorized":true,"projection_stop_confirmed":true,"artifact_bound":true,"canonical_route":"/stores?area=osage-city"}'::jsonb),
('12000000-0000-4000-8000-000000000006','reactivation','ProductOwner','pass','osage-city','12000000-0000-4000-8000-000000000101',null,
 decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('08',32),'hex'),true,
 '{"repair_readiness":true,"recovery_capacity":true,"same_store_set":true,"channel_consents":true,"canonical_route":"/stores?area=osage-city"}'::jsonb);

set local role community_deployment_service;
select lives_ok(
  $$select community_private.rollback_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000005',
    3,2,'rollback-osage',decode(repeat('12',32),'hex'))$$,
  'rollback withdraws the exact current projection'
);
select lives_ok(
  $$select community_private.reactivate_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000006',
    4,3,'reactivate-osage',decode(repeat('13',32),'hex'))$$,
  'repair restores the same area and store set at the same ordinal'
);
reset role;

select is((select last_activation_ordinal::integer from community_private.community_expansion_root where root_id=1),1,'rollback and repair never auto-advance');
select is((select state from community_private.community_activation_runs where run_id='12000000-0000-4000-8000-000000000101'),'live','repair returns the same run to live');
select is((select count(*)::integer from community_private.community_projection_stores where run_id='12000000-0000-4000-8000-000000000101'),2,'repair preserves the frozen store set exactly');

insert into community_private.community_evidence_receipts(
  receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,prior_receipt_id,
  artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,predicates
) values (
  '12000000-0000-4000-8000-000000000007','rollback','ProductOwner','pass','osage-city','12000000-0000-4000-8000-000000000101',null,
  decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('09',32),'hex'),false,
  '{"rollback_authorized":true,"projection_stop_confirmed":true,"artifact_bound":true,"canonical_route":"/stores?area=osage-city"}'::jsonb
);
set local role community_deployment_service;
select throws_ok(
  $$select community_private.rollback_community(
    '12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000007',
    5,4,'unverified-rollback',decode(repeat('14',32),'hex'))$$,
  '42501','community_receipt_not_verified',
  'missing external verification fails closed and is never synthesized'
);
reset role;
select ok((select visible from community_private.community_catalog_projections where run_id='12000000-0000-4000-8000-000000000101'),'failed rollback leaves visibility unchanged');

select * from finish();
rollback;
