begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_function('app_public','community_deployment_command',array['text','jsonb'],'one operational Package 12 command RPC exists');
select has_function('community_private','validate_deployment_payload',array['text','jsonb'],'private exact-payload validator exists');
select ok(has_function_privilege('community_deployment_service','app_public.community_deployment_command(text,jsonb)','EXECUTE'),'constrained deployment role may execute the command');
select ok(not has_function_privilege('anon','app_public.community_deployment_command(text,jsonb)','EXECUTE'),'anonymous callers have no community command authority');
select ok(not has_function_privilege('authenticated','app_public.community_deployment_command(text,jsonb)','EXECUTE'),'browser sessions have no community command authority');
select ok(not has_function_privilege('service_role','app_public.community_deployment_command(text,jsonb)','EXECUTE'),'generic service role cannot bypass the constrained deployment JWT');
select ok(not has_function_privilege('community_deployment_service','community_private.validate_deployment_payload(text,jsonb)','EXECUTE'),'deployment role cannot invoke private helpers directly');
select ok(pg_has_role('authenticator','community_deployment_service','MEMBER'),'PostgREST can assume only the role asserted by the constrained deployment JWT');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public' and p.proname='community_deployment_command'),1,'there is exactly one app-public deployment command boundary');

select ok(position('prepare_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates prepare to the durable state machine');
select ok(position('freeze_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates freeze to the durable state machine');
select ok(position('sign_community_readiness' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates sign to the durable state machine');
select ok(position('activate_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates activation to the durable state machine');
select ok(position('rollback_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates rollback to the durable state machine');
select ok(position('reactivate_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates same-ordinal repair to the durable state machine');
select ok(position('cancel_community' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'boundary delegates cancellation to the durable state machine');

select ok(position('extensions.digest' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0
  and position('p_payload::text' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))>0,'server derives the idempotency fingerprint from canonical typed payload');
select ok(position('community_evidence_receipts' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))=0
  and position('insert into' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))=0,'operational boundary cannot fabricate evidence or receipts');
select ok(position('update community_private' in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))=0,'wrapper cannot bypass existing transition functions with direct state updates');
select ok(position($q$when 'prepare'$q$ in lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)))>0
  and position($q$when 'cancel'$q$ in lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)))>0,'validator allowlists exactly the seven named operations');
select ok(position('deployment_payload_exact' in lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)))>0,'unknown and extra payload fields fail closed');
select ok(position($q$jsonb_typeof(p_payload->'expectedrootversion')<>'number'$q$ in regexp_replace(lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0,'versions must be JSON numbers rather than coercible strings');
select ok(position('targetordinal' in lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)))=0,'prepare rejects caller-authored ordinal authority');
select ok(position('last_activation_ordinal+1' in regexp_replace(lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0
  and position($q$p_payload ->> 'targetordinal'$q$ in lower(pg_get_functiondef('app_public.community_deployment_command(text,jsonb)'::regprocedure)))=0,'prepare derives the exact next ordinal from server state');
select ok(position($q$jsonb_array_length(p_payload->'storeids')<2$q$ in regexp_replace(lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0
  and position('count(distinctvalue)' in regexp_replace(lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0,'freeze requires at least two distinct typed stores');
select ok(position($q$^[0-9a-f]{64}$$q$ in lower(pg_get_functiondef('community_private.validate_deployment_payload(text,jsonb)'::regprocedure)))>0,'artifact and exact store-set digests are constrained SHA-256 hex');

select ok(position('p_target_ordinal<>root_row.last_activation_ordinal+1' in replace(lower(pg_get_functiondef('community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea)'::regprocedure)),' ',''))>0,'existing preparation preserves separate one-at-a-time community selection');
select ok(position('p_target_ordinal not between 1 and 3' in lower(pg_get_functiondef('community_private.prepare_community(uuid,text,smallint,uuid,uuid,bigint,text,bytea)'::regprocedure)))>0,'existing state machine stops after ordinal three');
select has_trigger('community_private','community_activation_runs','community_run_current_rg01','Store 1 retains the authoritative RG-01 insertion guard');
select ok(position('receipt_is_current_pass' in lower(pg_get_functiondef('community_private.require_current_rg01(uuid)'::regprocedure)))>0,'RG-01 prerequisite must remain a current authoritative PASS');
select ok(position('assert_action_receipt' in lower(pg_get_functiondef('community_private.activate_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)))>0
  and position('external_verified' in lower(pg_get_functiondef('community_private.assert_action_receipt(uuid,text,uuid,text,bytea,bytea,text[])'::regprocedure)))>0,'activation consumes externally verified signed receipts rather than booleans');
select ok(position('visible=false' in regexp_replace(lower(pg_get_functiondef('community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)),'[[:space:]]','','g'))>0
  and position($q$state='withdrawn'$q$ in regexp_replace(lower(pg_get_functiondef('community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)),'[[:space:]]','','g'))>0,'rollback hides the exact projection and withdraws the same run');
select ok(position('last_activation_ordinal' in lower(pg_get_functiondef('community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)))>0
  and position('set last_activation_ordinal' in lower(pg_get_functiondef('community_private.rollback_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)))=0
  and position('set last_activation_ordinal' in lower(pg_get_functiondef('community_private.reactivate_community(uuid,uuid,bigint,bigint,text,bytea)'::regprocedure)))=0,'rollback and reactivation never auto-promote an ordinal');

set local role community_deployment_service;
select throws_ok(
  $$select app_public.community_deployment_command('unknown','{}'::jsonb)$$,
  '22023','community_command_input_invalid','unknown operation fails before reaching private state'
);
select throws_ok(
  $$select app_public.community_deployment_command('prepare',jsonb_build_object(
    'runId','12000000-0000-4000-8000-000000000101','areaSlug','osage-city',
    'selectionReceiptId','12000000-0000-4000-8000-000000000001',
    'prerequisiteReceiptId','12000000-0000-4000-8000-000000000002',
    'expectedRootVersion',1,'idempotencyKey','prepare-osage','externalVerified',true))$$,
  '22023','community_command_input_invalid','caller cannot add evidence authority to an exact command'
);
select throws_ok(
  $$select app_public.community_deployment_command('prepare',jsonb_build_object(
    'runId','12000000-0000-4000-8000-000000000101','areaSlug','osage-city','targetOrdinal',1,
    'selectionReceiptId','12000000-0000-4000-8000-000000000001',
    'prerequisiteReceiptId','12000000-0000-4000-8000-000000000002',
    'expectedRootVersion',1,'idempotencyKey','prepare-osage'))$$,
  '22023','community_command_input_invalid','caller cannot choose the activation ordinal'
);
reset role;

select * from finish();
rollback;
