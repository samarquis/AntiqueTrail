begin;
select plan(31);

select has_table('app_private','email_delivery_capability','server-owned email capability exists');
select has_table('app_private','auth_recovery_operations','content-free recovery operation ledger exists');
select is((select state from app_private.email_delivery_capability where id=1),'disabled','email delivery is disabled by default');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='email_delivery_capability'),'email capability FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='auth_recovery_operations'),'recovery operations FORCE RLS enabled');
select ok(not exists(select 1 from information_schema.columns where table_schema='app_private' and table_name='auth_recovery_operations' and column_name in ('email','token','action_link','provider_action_link')),'recovery ledger has no email, token, or action-link columns');
select has_function('app_public','reserve_auth_recovery_delivery',array['bytea','text'],'bounded recovery reservation exists');
select has_function('app_public','begin_auth_recovery_delivery',array['uuid','text'],'provider call begins through a bounded latch recheck');
select has_function('app_public','complete_auth_recovery_delivery',array['uuid','text','text'],'bounded recovery completion exists');
select has_function('app_public','reconcile_auth_recovery_delivery',array['uuid','text','text'],'bounded recovery reconciliation exists');
select ok(has_function_privilege('service_role','app_public.reserve_auth_recovery_delivery(bytea,text)','EXECUTE'),'only the server boundary may reserve recovery delivery');
select ok(has_function_privilege('service_role','app_public.begin_auth_recovery_delivery(uuid,text)','EXECUTE'),'only the server boundary may begin provider delivery');
select ok(not has_function_privilege('anon','app_public.reserve_auth_recovery_delivery(bytea,text)','EXECUTE'),'anonymous callers cannot reserve recovery delivery');
select ok(not has_function_privilege('authenticated','app_public.reserve_auth_recovery_delivery(bytea,text)','EXECUTE'),'authenticated browsers cannot reserve recovery delivery directly');
select ok(not has_table_privilege('service_role','app_private.auth_recovery_operations','SELECT'),'service role cannot read the recovery ledger directly');
select ok(position('auth.users' in lower(pg_get_functiondef('app_public.reserve_auth_recovery_delivery(bytea,text)'::regprocedure)))=0,'reservation never looks up account existence');

set local role service_role;
select is(
  app_public.reserve_auth_recovery_delivery(decode(repeat('ab',32),'hex'),'00000000-0000-4000-8000-000000000001')->>'state',
  'blocked',
  'disabled capability records no provider work'
);
reset role;
select is((select state from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000001'),'blocked','disabled request is terminally blocked');
select is((select octet_length(recipient_hmac) from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000001'),32,'only a fixed recipient HMAC is retained');

update app_private.email_delivery_capability
set state='open',provider_key='test_provider',provider_version='contract-v1',contract_receipt_id='receipt:test',version=version+1
where id=1;

set local role service_role;
select is(
  app_public.reserve_auth_recovery_delivery(decode(repeat('cd',32),'hex'),'00000000-0000-4000-8000-000000000002')->>'state',
  'reserved',
  'accepted capability may reserve one provider-neutral operation'
);
select is(
  app_public.reserve_auth_recovery_delivery(decode(repeat('cd',32),'hex'),'00000000-0000-4000-8000-000000000002')->>'state',
  'reserved',
  'exact reservation replay is idempotent'
);
select throws_ok(
  $$select app_public.reserve_auth_recovery_delivery(decode(repeat('ef',32),'hex'),'00000000-0000-4000-8000-000000000002')$$,
  '22023','auth_recovery_request_unavailable','changed recipient under one idempotency key denies'
);
reset role;
select is((select count(*) from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000002'),1::bigint,'idempotent replay creates one operation');
select is((select state from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000002'),'reserved','no delivery is inferred from reservation');
select set_config('test.recovery_operation_id',(select operation_id::text from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000002'),true);

set local role service_role;
select is(
  app_public.begin_auth_recovery_delivery(
    current_setting('test.recovery_operation_id')::uuid,
    '00000000-0000-4000-8000-000000000002'
  )->>'state',
  'calling',
  'provider call begins only after the capability is rechecked'
);
select is(
  app_public.complete_auth_recovery_delivery(
    current_setting('test.recovery_operation_id')::uuid,
    '00000000-0000-4000-8000-000000000002','unknown'
  )->>'state',
  'reconciliation_required',
  'unknown delivery remains nonterminal'
);
select throws_ok(
  $$select app_public.complete_auth_recovery_delivery(
    current_setting('test.recovery_operation_id')::uuid,
    '00000000-0000-4000-8000-000000000002','confirmed_delivered')$$,
  '55000','auth_recovery_reconciliation_required','ordinary completion cannot guess after unknown delivery'
);
select is(
  app_public.reconcile_auth_recovery_delivery(
    current_setting('test.recovery_operation_id')::uuid,
    '00000000-0000-4000-8000-000000000002','unknown'
  )->>'state',
  'reconciliation_required',
  'repeated unknown reconciliation remains nonterminal'
);
select is(
  app_public.reconcile_auth_recovery_delivery(
    current_setting('test.recovery_operation_id')::uuid,
    '00000000-0000-4000-8000-000000000002','confirmed_delivered'
  )->>'state',
  'settled_delivered',
  'only authoritative reconciliation records delivery'
);
reset role;
select is((select provider_outcome from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000002'),'confirmed_delivered','authoritative outcome is recorded without message content');
select ok((select settled_at is not null from app_private.auth_recovery_operations where idempotency_key='00000000-0000-4000-8000-000000000002'),'terminal reconciliation records settlement time');

select * from finish();
rollback;
