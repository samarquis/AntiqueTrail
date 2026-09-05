begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('partner_private','photo_tier_change_consents','paid changes have separate immutable consent');
select has_table('partner_private','photo_tier_subscription_changes','paid changes remain durable until verified application or compensation');
select has_table('partner_private','photo_tier_charge_refunds','refund request time survives processing delays');
select has_function('app_public','billing_record_paid_change_consent',array['uuid','bigint','bigint','bigint','text','uuid'],'upgrade consent binds source and config versions');
select has_function('app_public','billing_request_subscription_change',array['uuid','text','uuid','bigint','uuid'],'exact-store servicing command exists');
select has_function('app_public','billing_request_charge_refund',array['uuid','text','uuid'],'charge refund requests are server-owned');
select has_function('app_public','billing_due_servicing',array[]::text[],'servicing recovery is runnable');
\ir fixtures/paid_servicing.inc
insert into partner_private.store_photo_tier_state(store_id,tier,source)
values('17800000-0000-4000-8000-000000000001','gallery','subscription');
insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
values('17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','active',statement_timestamp()+interval '20 days');
select throws_ok($$select app_public.billing_record_paid_tier_consent('17800000-0000-4000-8000-000000000001','full_gallery',178,repeat('11',32),1,gen_random_uuid())$$,
  '42501','billing_action_denied','initial Checkout consent remains Free-only');
set local role authenticated;
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',2,1,178,repeat('11',32),gen_random_uuid())$$,
  '42501','billing_action_denied','stale subscription version cannot consent');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000002',1,1,178,repeat('11',32),gen_random_uuid())$$,
  '42501','billing_action_denied','wrong-store consent is denied');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('99',32),gen_random_uuid())$$,
  '42501','billing_action_denied','disclosure mismatch is denied');
select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),'17800000-0000-4000-8000-000000000040');
reset role;
select is((select count(*)::integer from partner_private.photo_tier_change_consents),1,'one immutable consent');
select throws_ok($$update partner_private.photo_tier_change_consents set expires_at=expires_at+interval '1 hour'$$,
  '42501','billing_append_only','consent terms cannot mutate');
select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),'17800000-0000-4000-8000-000000000040');
select is((select count(*)::integer from partner_private.photo_tier_change_consents),1,'same consent retry returns prior receipt');
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_change_consents),1,'17800000-0000-4000-8000-000000000041');
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'gallery','reservation cannot apply entitlement');
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_change_consents),1,'17800000-0000-4000-8000-000000000041');
select is((select count(*)::integer from partner_private.photo_tier_subscription_changes),1,'lost response cannot allocate another change');
select throws_ok($$select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','free',null,1,'17800000-0000-4000-8000-000000000041')$$,
  '22023','billing_idempotency_mismatch','same change key different input denies');
set local role billing_automation;
update partner_private.photo_tier_sales_control set state='servicing_only',sales_generation=sales_generation+1;
reset role;
select is(app_public.billing_prepare_subscription_change((select change_id from partner_private.photo_tier_subscription_changes))->>'state','superseded','pause before dispatch prevents provider work');
select is((select state from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),'active','pause never cancels existing subscription');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),gen_random_uuid())$$,
  '55000','billing_stage_disabled','servicing-only denies fresh upgrade consent');
insert into partner_private.photo_tier_charge_refunds(store_id,subscription_id,charge_id,charged_at,amount,currency)
values('17800000-0000-4000-8000-000000000001','sub_servicing178','ch_servicing178',statement_timestamp()-interval '47 hours',1200,'usd');
set local role authenticated;
select app_public.billing_request_charge_refund('17800000-0000-4000-8000-000000000001','ch_servicing178','17800000-0000-4000-8000-000000000051');
reset role;
select is((select state from partner_private.photo_tier_charge_refunds where charge_id='ch_servicing178'),'pending','eligible charge request is durable in servicing-only');
select is((select amount from partner_private.photo_tier_charge_refunds where charge_id='ch_servicing178'),1200::bigint,'full charge is reserved for refund');
select ok(not has_table_privilege('authenticated','partner_private.photo_tier_charge_refunds','select'),'charge records are private');
select ok(not has_function_privilege('authenticated','app_public.billing_prepare_subscription_change(uuid)','execute'),'browser cannot dispatch provider work');
select * from finish();
rollback;
