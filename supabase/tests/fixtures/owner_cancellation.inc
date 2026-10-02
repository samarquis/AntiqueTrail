-- The approved Owner and paid subscription from 0132 are still active here.
set local role authenticated;
select is(app_public.billing_get_owner_cancellation(),null::jsonb,'fake cancellation is disabled by default');
reset role;
grant billing_automation to postgres;
update partner_private.owner_cancellation_test_control set enabled=true;
set local role authenticated;
select throws_ok('select app_public.billing_get_owner_cancellation()','42501','billing_action_denied','subscription without a bound fake provider denies');
reset role;
update partner_private.store_subscriptions set stripe_subscription_id='sub_fake42600000001'
 where store_id='00000000-0000-4000-8000-000000000009';
insert into partner_private.owner_cancellation_fake_provider(store_id,subscription_id)
 values('00000000-0000-4000-8000-000000000009','sub_fake42600000001');
create temporary table cancellation426(snapshot text,consent_id uuid,intent_id uuid);
grant select,insert,update on cancellation426 to authenticated,billing_automation;
set local role authenticated;
select is(app_public.billing_get_owner_cancellation()->>'state','available','approved Owner may cancel active exact-store subscription');
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008','aal1');
select throws_ok('select app_public.billing_get_owner_cancellation()','42501','billing_action_denied','MFA is required for Owner cancellation');
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb || jsonb_build_object('amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp()-interval '11 minutes')::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp()-interval '11 minutes')::bigint))))::text,true);
select throws_ok('select app_public.billing_get_owner_cancellation()','42501','billing_action_denied','authentication older than ten minutes denies');
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
select pg_temp.actor422('42200000-0000-4000-8000-000000000001','42200000-0000-4000-8000-000000000003');
select throws_ok('select app_public.billing_get_owner_cancellation()','42501','billing_action_denied','another account cannot cancel the Owner subscription');
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
insert into cancellation426(snapshot) select app_public.billing_get_owner_cancellation()->>'snapshot';
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000001"}',true);
select throws_ok('select app_public.billing_get_owner_cancellation()','42501','billing_action_denied','sibling Representative store does not inherit cancellation authority');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select throws_ok($$select app_public.billing_record_owner_cancel_consent(repeat('0',64),'42600000-0000-4000-8000-000000000001')$$,'42501','billing_consent_invalid','changed confirmation snapshot denies');
update cancellation426 set consent_id=(app_public.billing_record_owner_cancel_consent(snapshot,'42600000-0000-4000-8000-000000000001')->>'consentId')::uuid;
select is((app_public.billing_record_owner_cancel_consent((select snapshot from cancellation426),'42600000-0000-4000-8000-000000000001')->>'consentId')::uuid,
 (select consent_id from cancellation426),'identical confirmation replay returns same receipt');
reset role;
update partner_private.store_subscriptions set version=version+1 where store_id='00000000-0000-4000-8000-000000000009';
set local role authenticated;
select throws_ok($$select app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000002')$$,'42501','billing_consent_invalid','concurrent subscription version change denies stale consent');
reset role;
update partner_private.store_subscriptions set version=version-1 where store_id='00000000-0000-4000-8000-000000000009';
update partner_private.owner_cancellation_consents set expires_at=statement_timestamp()-interval '1 second';
set local role authenticated;
select throws_ok($$select app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000002')$$,'42501','billing_consent_invalid','expired consent denies');
reset role;
update partner_private.owner_cancellation_consents set expires_at=statement_timestamp()+interval '15 minutes';
update partner_private.photo_tier_sales_control set state='off_prelaunch',commercial_config_version=null;
set local role authenticated;
select throws_ok($$select app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000002')$$,'55000','billing_stage_disabled','off-prelaunch cannot request cancellation');
reset role;
update partner_private.photo_tier_sales_control set state='sales_open',commercial_config_version=425132;
set local role authenticated;
select is(app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000002')->>'state','pending','intent commits pending without claiming success');
select is(app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000002')->>'state','pending','identical request replay applies no new effect');
select throws_ok($$select app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000003')$$,'42501','billing_consent_invalid','consumed receipt cannot create another request');
select throws_ok($$select app_public.billing_request_owner_cancellation('42600000-0000-4000-8000-000000000004','42600000-0000-4000-8000-000000000002')$$,'22023','billing_idempotency_mismatch','changed replay cannot reuse an intent key');
select throws_ok($$select app_public.billing_execute_owner_fake_cancellation('42600000-0000-4000-8000-000000000003')$$,'42501',null,'Owner cannot execute worker RPC');
select throws_ok('select * from partner_private.owner_cancellation_consents','42501',null,'Owner cannot read private consent ledger');
reset role;
update cancellation426 set intent_id=(select intent_id from partner_private.owner_cancellation_intents);
update partner_private.owner_cancellation_fake_provider set schedule_version=schedule_version+1;
set local role billing_automation;
select is(app_public.billing_execute_owner_fake_cancellation((select intent_id from cancellation426))->>'state','reconciliation_pending','concurrent provider schedule change retains obligation without effect');
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','failed','verified never-executed key resolves permanent version conflict without success');
reset role;
select is((select effects from partner_private.owner_cancellation_fake_provider),0,'stale provider version applies no cancellation');
set local role authenticated;
update cancellation426 set snapshot=app_public.billing_get_owner_cancellation()->>'snapshot';
update cancellation426 set consent_id=(app_public.billing_record_owner_cancel_consent(snapshot,'42600000-0000-4000-8000-000000000007')->>'consentId')::uuid;
select is(app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000008')->>'state','pending','fresh confirmation recovers after verified no-effect failure');
reset role;
update cancellation426 set intent_id=(select intent_id from partner_private.owner_cancellation_intents where state='pending');
set local role billing_automation;
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','reconciliation_pending','unknown provider state retains reconciliation obligation');
select is(app_public.billing_execute_owner_fake_cancellation((select intent_id from cancellation426))->>'state','verified','worker applies exact fake effect');
reset role;
select is((select state from partner_private.owner_cancellation_intents where intent_id=(select intent_id from cancellation426)),'reconciliation_pending','lost provider response never reports success');
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000009'),'gallery','pending cancellation retains paid entitlement');
update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp()
 where store_id='00000000-0000-4000-8000-000000000009';
set local role authenticated;
select throws_ok($$select app_public.billing_request_owner_cancellation((select consent_id from cancellation426),'42600000-0000-4000-8000-000000000008')$$,'42501','billing_action_denied','revoked access denies even an identical replay');
reset role;
set local role billing_automation;
select is(app_public.billing_execute_owner_fake_cancellation((select intent_id from cancellation426))->>'state','verified','worker restart repeats the same provider key');
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','scheduled','verified provider effect schedules cancellation');
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','scheduled','duplicate observation cannot apply twice');
reset role;
update partner_private.store_partner_grants set state='active',revoked_at=null
 where store_id='00000000-0000-4000-8000-000000000009';
select is((select effects from partner_private.owner_cancellation_fake_provider),1,'fake provider has exactly one cancellation effect');
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000009'),'gallery','scheduled cancellation retains paid entitlement through boundary');
set local role authenticated;
select is(app_public.billing_get_owner_cancellation()->>'state','scheduled','UI observes verified scheduled outcome');
reset role;
create temporary table old_subscription426 as select * from partner_private.store_subscriptions where store_id='00000000-0000-4000-8000-000000000009';
create temporary table old_tier426 as select * from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000009';
update partner_private.owner_cancellation_fake_provider set ended=true,
 observed_at=(select current_period_end from old_subscription426)+interval '1 second';
update partner_private.store_subscriptions set stripe_subscription_id='sub_replacement42600001',version=version+1
 where store_id='00000000-0000-4000-8000-000000000009';
update partner_private.store_photo_tier_state set tier='full_gallery',version=version+1
 where store_id='00000000-0000-4000-8000-000000000009';
set local role billing_automation;
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','reconciliation_pending','old ended intent cannot take ownership of a replacement subscription');
reset role;
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000009'),'full_gallery','replacement paid entitlement survives stale completion');
update partner_private.store_subscriptions set stripe_subscription_id='sub_fake42600000001',version=(select version from old_subscription426)
 where store_id='00000000-0000-4000-8000-000000000009';
update partner_private.store_photo_tier_state set tier='gallery',version=(select version from old_tier426)
 where store_id='00000000-0000-4000-8000-000000000009';
set local role billing_automation;
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','completed','verified fake period boundary ends the bound subscription');
select is(app_public.billing_reconcile_owner_cancellation((select intent_id from cancellation426))->>'state','completed','terminal completion replay is stable');
reset role;
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000009'),'free','verified period end applies Free once');
-- Restore the paid baseline used by the remaining historical read/revocation assertions.
update partner_private.store_subscriptions set state='active',version=(select version from old_subscription426)
 where store_id='00000000-0000-4000-8000-000000000009';
update partner_private.store_photo_tier_state set tier='gallery',version=(select version from old_tier426)
 where store_id='00000000-0000-4000-8000-000000000009';
-- Leave ordinary billing and later existing Owner tests at their original read-only baseline.
update partner_private.owner_cancellation_test_control set enabled=false;
