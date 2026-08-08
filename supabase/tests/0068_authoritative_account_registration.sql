begin;
select plan(64);

select has_function('app_public','begin_account_registration',array['bytea','boolean','text'],'registration reserve exists');
select has_function('app_public','begin_account_registration_operation',array['uuid','uuid','text','text'],'provider begin exists');
select has_function('app_public','settle_account_registration_generate',array['uuid','uuid','text','text','uuid'],'provider settlement exists');
select has_function('app_public','settle_account_registration_delivery',array['uuid','uuid','text','text'],'delivery settlement exists');
select has_function('app_public','registration_exact_provider_for_admission',array['uuid'],'exact provider lookup exists');
select has_function('app_public','reconcile_account_registration_generate',array['uuid','uuid','text','text','uuid'],'generate reconciliation exists');
select has_function('app_public','reconcile_account_registration_delivery',array['uuid','uuid','text','text'],'delivery reconciliation exists');
select has_function('app_public','enqueue_account_registration_cleanup',array['uuid','uuid'],'cleanup enqueue exists');
select has_function('app_public','claim_account_registration_cleanup',array[]::text[],'cleanup claim exists');
select has_function('app_public','begin_account_registration_cleanup',array['uuid','uuid'],'cleanup begin exists');
select has_function('app_public','settle_account_registration_cleanup',array['uuid','uuid','text'],'cleanup settle exists');
select has_function('app_public','reconcile_account_registration_cleanup',array['uuid','uuid'],'cleanup reconcile exists without caller-supplied provider state');
select has_function('app_public','resolve_registration_cleanup_operator_case',array['uuid','uuid','text'],'operator cleanup recovery exists');
select has_table('app_private','registration_cleanup_tickets','provider cleanup queue exists independently of admissions');
select ok(position('call_deadline' in pg_get_functiondef('app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)'::regprocedure))>0 and position('finality_due_at' in pg_get_functiondef('app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)'::regprocedure))>0,'generate settlement enforces call and finality deadlines');
select ok(position('expected_latch_version' in pg_get_functiondef('app_public.settle_account_registration_delivery(uuid,uuid,text,text)'::regprocedure))>0 and position('expected_config_version' in pg_get_functiondef('app_public.settle_account_registration_delivery(uuid,uuid,text,text)'::regprocedure))>0 and position('expected_admission_version' in pg_get_functiondef('app_public.settle_account_registration_delivery(uuid,uuid,text,text)'::regprocedure))>0,'delivery settlement enforces expected versions');
select ok(position('orphan_quarantined' in pg_get_functiondef('app_public.settle_account_registration_generate(uuid,uuid,text,text,uuid)'::regprocedure))>0,'late provider success is quarantined');
select ok(position('raw_user_meta_data' in pg_get_functiondef('app_public.registration_exact_provider_for_admission(uuid)'::regprocedure))>0 and position('listusers' in lower(pg_get_functiondef('app_public.registration_exact_provider_for_admission(uuid)'::regprocedure)))=0,'reconciliation uses exact database lookup and never listUsers');
select ok(position('skip locked' in lower(pg_get_functiondef('app_public.claim_account_registration_cleanup()'::regprocedure)))>0,'cleanup claims are concurrency safe');
select ok(position('completed_terminal_cleanup' in pg_get_functiondef('app_public.reconcile_account_registration_cleanup(uuid,uuid)'::regprocedure))>0,'confirmed provider absence reaches terminal cleanup');
select ok(position('from auth.users' in lower(pg_get_functiondef('app_public.reconcile_account_registration_cleanup(uuid,uuid)'::regprocedure)))>0
  and position('p_provider_state' in lower(pg_get_functiondef('app_public.reconcile_account_registration_cleanup(uuid,uuid)'::regprocedure)))=0,
  'cleanup reconciliation performs its own exact auth.users lookup');
select ok(to_regprocedure('app_public.reconcile_account_registration_cleanup(uuid,uuid,text)') is null,'caller cannot forge an absent provider state parameter');
select ok(not has_function_privilege('anon','app_public.begin_account_registration(bytea,boolean,text)','EXECUTE'),'anon cannot reserve');
select ok(not has_function_privilege('authenticated','app_public.begin_account_registration(bytea,boolean,text)','EXECUTE'),'authenticated cannot reserve');
select ok(has_function_privilege('service_role','app_public.begin_account_registration(bytea,boolean,text)','EXECUTE'),'service can reserve');
select ok(not exists(select 1 from information_schema.columns where table_schema='app_private' and table_name in ('account_admission_receipts','registration_provider_operations') and column_name~'(password|action_link|callback_url|token_raw)'),'registration ledgers contain no raw secret fields');

update app_private.account_registration_config set mode='public',version=version+1 where id=1;
set local role service_role;
create temporary table registration_test_result as
  select app_public.begin_account_registration(decode(repeat('01',32),'hex'),true,'00000000-0000-4000-8000-000000000001') value;
select is((value->>'state'),'reserved','open latch reserves provider operation') from registration_test_result;
select is(
  app_public.begin_account_registration(decode(repeat('01',32),'hex'),true,'00000000-0000-4000-8000-000000000001')->>'providerOperationId',
  value->>'providerOperationId','same-key retry returns exact operation') from registration_test_result;
select is(
  app_public.begin_account_registration(decode(repeat('02',32),'hex'),true,'00000000-0000-4000-8000-000000000001')->>'state',
  'blocked','same key with changed subject binding is blocked') from registration_test_result;
select is(
  app_public.begin_account_registration_operation((value->>'providerOperationId')::uuid,(value->>'admissionId')::uuid,'00000000-0000-4000-8000-000000000001','generate_link')->>'state',
  'calling','reserved provider operation begins once') from registration_test_result;
select is(
  app_public.begin_account_registration_operation((value->>'providerOperationId')::uuid,(value->>'admissionId')::uuid,'00000000-0000-4000-8000-000000000001','generate_link')->>'state',
  'reconciliation_required','response-loss retry cannot repeat provider call') from registration_test_result;

create temporary table registration_stale_result as
  select app_public.begin_account_registration(decode(repeat('03',32),'hex'),true,'00000000-0000-4000-8000-000000000002') value;
reset role;
update app_private.registration_quarantine_latch set version=version+1 where id=1;
set local role service_role;
select is(app_public.begin_account_registration_operation((value->>'providerOperationId')::uuid,(value->>'admissionId')::uuid,'00000000-0000-4000-8000-000000000002','generate_link')->>'state','blocked','latch version change blocks reserved call') from registration_stale_result;
select is((select state from app_private.account_admission_receipts where admission_id=(value->>'admissionId')::uuid),'cleanup_pending','blocked pre-call reservation reaches cleanup terminal') from registration_stale_result;

reset role;
insert into auth.users(id) values('68000000-0000-4000-8000-000000000001');
set local role service_role;
create temporary table registration_crash_result as select app_public.begin_account_registration(decode(repeat('04',32),'hex'),true,'00000000-0000-4000-8000-000000000004') value;
select app_public.begin_account_registration_operation((value->>'providerOperationId')::uuid,(value->>'admissionId')::uuid,'00000000-0000-4000-8000-000000000004','generate_link') from registration_crash_result;
select app_public.settle_account_registration_generate((value->>'providerOperationId')::uuid,(value->>'admissionId')::uuid,'00000000-0000-4000-8000-000000000004','confirmed_generated','68000000-0000-4000-8000-000000000001') from registration_crash_result;
select is(app_public.begin_account_registration(decode(repeat('04',32),'hex'),true,'00000000-0000-4000-8000-000000000004')->>'state','blocked','crash after generate settlement never sends without memory token');
select is((select state from app_private.account_admission_receipts where idempotency_key='00000000-0000-4000-8000-000000000004'),'orphan_quarantined','abandoned delivery quarantines provider identity');
select ok(exists(select 1 from app_private.registration_quarantine_subjects where provider_user_id='68000000-0000-4000-8000-000000000001'),'abandoned delivery records quarantine subject');
create temporary table registration_cleanup_result as select app_public.claim_account_registration_cleanup() value;
select is(value->>'state','pending','due quarantine claims exact delete ticket') from registration_cleanup_result;
select is(app_public.begin_account_registration_cleanup((value->>'cleanupTicketId')::uuid,(value->>'providerUserId')::uuid)->>'state','calling','cleanup delete begins with deadline') from registration_cleanup_result;
select is(app_public.settle_account_registration_cleanup((value->>'cleanupTicketId')::uuid,(value->>'providerUserId')::uuid,'unknown')->>'state','reconciliation_required','delete response loss requires exact reconciliation') from registration_cleanup_result;
reset role;
delete from auth.users where id='68000000-0000-4000-8000-000000000001';
set local role service_role;
select is(app_public.reconcile_account_registration_cleanup((value->>'cleanupTicketId')::uuid,'68000000-0000-4000-8000-000000000001')->>'state','completed_terminal_cleanup','actual auth.users absence completes cleanup') from registration_cleanup_result;
select is((select state from app_private.account_admission_receipts where idempotency_key='00000000-0000-4000-8000-000000000004'),'completed_terminal_cleanup','receipt persists terminal cleanup') ;
select ok((select resolved_absent_at is not null from app_private.registration_quarantine_subjects where provider_user_id='68000000-0000-4000-8000-000000000001'),'quarantine receipt records confirmed absence');

reset role;
insert into auth.users(id) values('68000000-0000-4000-8000-000000000099');
set local role service_role;
create temporary table independent_cleanup_result as
  select app_public.enqueue_account_registration_cleanup(null,'68000000-0000-4000-8000-000000000099')->'cleanupTicketId' ticket_id;
select ok((select asserted_admission_id is null from app_private.registration_cleanup_tickets where cleanup_ticket_id=(ticket_id#>>'{}')::uuid),'missing admission still creates durable provider cleanup ticket') from independent_cleanup_result;
select is(app_public.begin_account_registration(decode(repeat('09',32),'hex'),true,'00000000-0000-4000-8000-000000000099')->>'state','blocked','any unresolved provider cleanup ticket closes registration latch');
select is(app_public.begin_account_registration_cleanup((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099')->>'state','calling','independent provider ticket begins') from independent_cleanup_result;
reset role;
update app_private.registration_cleanup_tickets set attempt_count=6 where provider_user_id='68000000-0000-4000-8000-000000000099';
set local role service_role;
select is(app_public.settle_account_registration_cleanup((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099','confirmed_not_deleted')->>'state','escalated','permanent provider denial exhausts bounded attempts') from independent_cleanup_result;
select ok((select operator_case_id is not null from app_private.registration_cleanup_tickets where provider_user_id='68000000-0000-4000-8000-000000000099'),'exhaustion persists an operator case');
select is(app_public.resolve_registration_cleanup_operator_case((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099','retry')->>'state','retry','operator can restart a repaired provider cleanup') from independent_cleanup_result;
select is(app_public.begin_account_registration_cleanup((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099')->>'state','calling','operator recovery makes ticket claimable') from independent_cleanup_result;
select is(app_public.settle_account_registration_cleanup((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099','unknown')->>'state','reconciliation_required','recovered response loss enters reconciliation') from independent_cleanup_result;
reset role;
update app_private.registration_cleanup_tickets set finality_due_at=statement_timestamp()-interval '1 second' where provider_user_id='68000000-0000-4000-8000-000000000099';
set local role service_role;
select is(app_public.reconcile_account_registration_cleanup((ticket_id#>>'{}')::uuid,'68000000-0000-4000-8000-000000000099')->>'state','retry','present provider user cannot be forged absent and schedules bounded backoff') from independent_cleanup_result;
select isnt((select state from app_private.registration_cleanup_tickets where provider_user_id='68000000-0000-4000-8000-000000000099'),'completed_absent','present provider user remains unresolved after reconciliation');

reset role;
insert into auth.users(id) values('68000000-0000-4000-8000-000000000088'),('68000000-0000-4000-8000-000000000089');
insert into app_private.account_admission_receipts(admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,claim_expires_at,state,claimed_at)
  values('68000000-0000-4000-8000-000000000188',decode(repeat('08',32),'hex'),'shopper',decode(repeat('08',32),'hex'),statement_timestamp(),
    '00000000-0000-4000-8000-000000000088',statement_timestamp()+interval '30 minutes','provider_pending',statement_timestamp());
insert into app_private.registration_provider_operations(operation_id,admission_id,kind,state,expected_latch_version,expected_admission_version,expected_config_version,
  external_idempotency_key,call_started_at,call_deadline,finality_due_at)
  select '68000000-0000-4000-8000-000000000288','68000000-0000-4000-8000-000000000188','generate_link','calling',l.version,1,c.version,
    'late-generate-test',statement_timestamp()-interval '20 seconds',statement_timestamp()-interval '10 seconds',statement_timestamp()+interval '10 minutes'
  from app_private.registration_quarantine_latch l cross join app_private.account_registration_config c where l.id=1 and c.id=1;
set local role service_role;
select is(app_public.settle_account_registration_generate('68000000-0000-4000-8000-000000000288','68000000-0000-4000-8000-000000000188',
  '00000000-0000-4000-8000-000000000088','confirmed_generated','68000000-0000-4000-8000-000000000088')->>'state','blocked','late provider success is behaviorally quarantined');
select ok(exists(select 1 from app_private.registration_cleanup_tickets where provider_user_id='68000000-0000-4000-8000-000000000088' and state='pending'),'late success creates claimable exact-provider deletion ticket');

reset role;
insert into app_private.account_admission_receipts(admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,provider_user_id,
  delivery_state,claim_expires_at,state,claimed_at)
  values('68000000-0000-4000-8000-000000000189',decode(repeat('09',32),'hex'),'shopper',decode(repeat('09',32),'hex'),statement_timestamp(),
    '00000000-0000-4000-8000-000000000089','68000000-0000-4000-8000-000000000089','unknown',statement_timestamp()+interval '30 minutes','delivery_pending',statement_timestamp());
insert into app_private.registration_provider_operations(operation_id,admission_id,kind,state,expected_latch_version,expected_admission_version,expected_config_version,
  provider_user_id,external_idempotency_key,call_started_at,call_deadline,finality_due_at)
  select '68000000-0000-4000-8000-000000000289','68000000-0000-4000-8000-000000000189','send_verification','reconciliation_required',l.version,1,c.version,
    '68000000-0000-4000-8000-000000000089','delivery-reconcile-test',statement_timestamp(),statement_timestamp()+interval '10 seconds',statement_timestamp()+interval '15 minutes'
  from app_private.registration_quarantine_latch l cross join app_private.account_registration_config c where l.id=1 and c.id=1;
set local role service_role;
select is(app_public.reconcile_account_registration_delivery('68000000-0000-4000-8000-000000000289','68000000-0000-4000-8000-000000000189',
  '00000000-0000-4000-8000-000000000089','confirmed_delivered')->>'state','pending_verification','delivery reconciliation behaviorally captures confirmed delivery');
select is((select delivery_state from app_private.account_admission_receipts where admission_id='68000000-0000-4000-8000-000000000189'),'delivered','delivery reconciliation persists the authoritative delivery state');

select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000099','confirmed_absent')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','single-operator absence assertion cannot clear cleanup');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000099','one_signer')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','one-signer decision has no terminalization surface');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000099','same_signer')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','same-signer decision has no terminalization surface');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000099','replay')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','replayed decision has no terminalization surface');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000099','still_present')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','still-present decision cannot clear cleanup');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000099','68000000-0000-4000-8000-000000000098','retry')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','provider UUID mismatch cannot mutate cleanup ticket');
select throws_ok($$select app_public.resolve_registration_cleanup_operator_case('68000000-0000-4000-8000-000000000098','68000000-0000-4000-8000-000000000099','retry')$$,
  '22023','registration_cleanup_operator_resolution_unavailable','cleanup ticket mismatch cannot mutate provider cleanup');
select isnt((select state from app_private.registration_cleanup_tickets where provider_user_id='68000000-0000-4000-8000-000000000099'),'completed_absent','denied manual decisions leave cleanup unresolved');

select * from finish();
rollback;
