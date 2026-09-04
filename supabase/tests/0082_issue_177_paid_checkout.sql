begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

select has_table('partner_private','photo_tier_sales_control','sales generation authority exists');
select has_table('partner_private','photo_tier_paid_consents','paid consent receipts exist');
select has_table('partner_private','photo_tier_checkout_sessions','Checkout reservations exist');
select has_table('partner_private','photo_tier_refund_reconciliations','durable refund reconciliation exists');
select ok((select count(*)=4 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='partner_private' and c.relname in ('photo_tier_sales_control','photo_tier_paid_consents','photo_tier_checkout_sessions','photo_tier_refund_reconciliations')
  and c.relrowsecurity and c.relforcerowsecurity),'new money tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='partner_private'
  and table_name in ('photo_tier_sales_control','photo_tier_paid_consents','photo_tier_checkout_sessions','photo_tier_refund_reconciliations')
  and grantee in ('anon','authenticated','service_role')),'browser and generic service roles cannot read money tables');
select is(app_public.billing_get_capability()->>'enabled','false','paid surface defaults off');
select throws_ok($$select app_public.billing_record_paid_tier_consent(gen_random_uuid(),'gallery',177,repeat('11',32),0,gen_random_uuid())$$,
  '55000','billing_stage_disabled','consent cannot allocate while staged off');

grant billing_automation,commercial_research_signature_service to postgres;

insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,publication_state)
values ('17700000-0000-4000-8000-000000000001','issue-177-store','Issue 177 Store','Topeka','KS','1 Test Way',
  '00000000-0000-4000-8000-000000000001','Database fixture','Database fixture store','active');
insert into auth.users(id) values ('17700000-0000-4000-8000-000000000010');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values ('17700000-0000-4000-8000-000000000018','17700000-0000-4000-8000-000000000010','totp','verified',statement_timestamp(),statement_timestamp());
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at)
values ('17700000-0000-4000-8000-000000000011',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),
  '17700000-0000-4000-8000-000000000010','consumed',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
values ('17700000-0000-4000-8000-000000000012','17700000-0000-4000-8000-000000000011',decode(repeat('02',32),'hex'),
  '17700000-0000-4000-8000-000000000010','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
values ('17700000-0000-4000-8000-000000000013','17700000-0000-4000-8000-000000000011','17700000-0000-4000-8000-000000000012',
  'synthetic-v3','Test Owner','Owner','Issue 177 Store',decode(repeat('02',32),'hex'),true,true,true,true,true,'issue-177-consent');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
values ('17700000-0000-4000-8000-000000000014','17700000-0000-4000-8000-000000000013','17700000-0000-4000-8000-000000000012',
  '17700000-0000-4000-8000-000000000011','17700000-0000-4000-8000-000000000010',decode(repeat('02',32),'hex'),'synthetic-v3',decode(repeat('03',32),'hex'));
insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at)
values ('17700000-0000-4000-8000-000000000015','17700000-0000-4000-8000-000000000012','17700000-0000-4000-8000-000000000010',
  '17700000-0000-4000-8000-000000000001','17700000-0000-4000-8000-000000000014','active',statement_timestamp());
insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id)
values ('17700000-0000-4000-8000-000000000016','17700000-0000-4000-8000-000000000015','17700000-0000-4000-8000-000000000010',
  '17700000-0000-4000-8000-000000000001');

set local role identity_service;
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
values ('17700000-0000-4000-8000-000000000017','17700000-0000-4000-8000-000000000010',statement_timestamp(),1,
  statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
reset role;

set local role billing_automation;
insert into partner_private.photo_tier_commercial_configs(version,state,gallery_price_cents,full_gallery_price_cents,currency,tax_mode,first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,refund_policy_version,support_policy_version,terms_version,privacy_version,full_gallery_limits_version,full_gallery_limits)
values (177,'draft',1200,1900,'USD','stripe-tax','checkout','monthly','cancel-anytime','48-hours','prorated','cycle-end','14-days','30-days','refund-v1','support-v1','terms-v1','privacy-v1','limits-v1',
  '{"acceptedFileTypes":["image/jpeg"],"maxFileBytes":10000000,"maxWidthPixels":6000,"maxHeightPixels":6000,"uploadRateRule":"bounded","quotaOutageRule":"pause","moderationAbuseRule":"review","reasonRecoveryAppealRule":"appeal","paidServiceRemedy":"remedy"}'::jsonb);
insert into partner_private.commercial_research_signature_challenges(challenge_id,config_version,config_digest,protocol_digest,community_gate_receipt_ids,signer_user_id,signed_payload_digest,research_expires_at,expires_at,state,consumed_at)
values ('17700000-0000-4000-8000-000000000020',177,decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),
  array['17700000-0000-4000-8000-000000000021'::uuid,'17700000-0000-4000-8000-000000000022'::uuid,'17700000-0000-4000-8000-000000000023'::uuid],
  '17700000-0000-4000-8000-000000000010',decode(repeat('33',32),'hex'),statement_timestamp()+interval '1 day',statement_timestamp()+interval '15 minutes','consumed',statement_timestamp());
reset role;
set local role commercial_research_signature_service;
insert into partner_private.commercial_research_signature_receipts(receipt_id,challenge_id,config_version,config_digest,protocol_digest,signer_user_id,signer_responsibility,signed_payload_digest,provider_verification_id,signed_at)
values ('17700000-0000-4000-8000-000000000024','17700000-0000-4000-8000-000000000020',177,decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),
  '17700000-0000-4000-8000-000000000010','ProductOwner',decode(repeat('33',32),'hex'),'issue-177-signature',statement_timestamp());
reset role;
set local role billing_automation;
insert into partner_private.commercial_research_authorizations(authorization_id,config_version,protocol_digest,signature_challenge_id,signature_receipt_id,signed_by,signed_at,expires_at)
values ('17700000-0000-4000-8000-000000000025',177,decode(repeat('22',32),'hex'),'17700000-0000-4000-8000-000000000020',
  '17700000-0000-4000-8000-000000000024','17700000-0000-4000-8000-000000000010',statement_timestamp(),statement_timestamp()+interval '1 day');
update partner_private.photo_tier_commercial_configs set state='approved_inactive',canonical_bytes='issue-177',digest=decode(repeat('11',32),'hex'),
  research_authorization_id='17700000-0000-4000-8000-000000000025',approved_by='17700000-0000-4000-8000-000000000010',approved_at=statement_timestamp() where version=177;
update partner_private.photo_tier_commercial_configs set state='active' where version=177;
update partner_private.photo_tier_sales_control set state='sales_open',commercial_config_version=177 where singleton;
reset role;
insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values ('17700000-0000-4000-8000-000000000030','topeka-ks','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'sha256:'||repeat('c',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion,photo_tiers_enabled)
values ('17700000-0000-4000-8000-000000000030',true,true,true,true,true,true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','17700000-0000-4000-8000-000000000010','session_id','17700000-0000-4000-8000-000000000017','aal','aal2',
  'amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)
  ))::text,true);

select is(app_public.billing_get_capability()->>'enabled','true','exact active config and sales generation expose the server capability');
select throws_ok($$select app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','gallery',177,repeat('99',32),0,'17700000-0000-4000-8000-000000000039')$$,
  '42501','billing_action_denied','consent rejects a disclosure digest that is not the active config digest');
select app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','full_gallery',177,repeat('11',32),0,'17700000-0000-4000-8000-000000000038');
set local role billing_automation;
update partner_private.photo_tier_paid_consents set expires_at=statement_timestamp()-interval '1 second'
  where idempotency_key='17700000-0000-4000-8000-000000000038';
reset role;
select throws_ok($$select app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000038'),177,'17700000-0000-4000-8000-000000000037')$$,
  '42501','billing_action_denied','expired consent cannot reserve Checkout');
select app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','full_gallery',177,repeat('11',32),0,'17700000-0000-4000-8000-000000000036');
set local role billing_automation;
update partner_private.photo_tier_paid_consents set state='revoked' where idempotency_key='17700000-0000-4000-8000-000000000036';
reset role;
select throws_ok($$select app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000036'),177,'17700000-0000-4000-8000-000000000035')$$,
  '42501','billing_action_denied','revoked consent cannot reserve Checkout');
select is(app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','gallery',177,repeat('11',32),0,'17700000-0000-4000-8000-000000000040')->>'state','unused','exact representative records consent');
select is((select commercial_config_version::text||':'||target_tier from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),'177:gallery','consent binds config and target tier');
select is(app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','gallery',177,repeat('11',32),0,'17700000-0000-4000-8000-000000000040')->>'consentId',
  (select consent_id::text from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),'same-key consent retry returns the first receipt');
select throws_ok($$select app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','full_gallery',177,repeat('11',32),0,'17700000-0000-4000-8000-000000000040')$$,
  '22023','billing_idempotency_mismatch','same consent key with changed input denies');

select is(app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),177,'17700000-0000-4000-8000-000000000041')->>'priceCents','1200','Checkout derives price from active config');
select is((select state from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),'checkout_pending','Checkout atomically reserves consent');
select is((select sales_generation::text from partner_private.photo_tier_checkout_sessions),'1','Checkout binds current sales generation');
select is((select count(*)::text from partner_private.photo_tier_checkout_sessions),'1','response-loss retry cannot create another session');
select is(app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),177,'17700000-0000-4000-8000-000000000041')->>'state','open','Checkout retry returns the open reservation');
select set_config('request.jwt.claims',jsonb_build_object('sub','17700000-0000-4000-8000-000000000099','session_id','17700000-0000-4000-8000-000000000017','aal','aal2')::text,true);
select throws_ok($$select app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),177,'17700000-0000-4000-8000-000000000041')$$,
  '42501','billing_action_denied','wrong actor cannot read a prior Checkout reservation');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','17700000-0000-4000-8000-000000000010','session_id','17700000-0000-4000-8000-000000000017','aal','aal2',
  'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp() where grant_id='17700000-0000-4000-8000-000000000016';
select throws_ok($$select app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),177,'17700000-0000-4000-8000-000000000041')$$,
  '42501','billing_action_denied','revoked representative cannot read a prior Checkout reservation');
update partner_private.store_partner_grants set state='active',revoked_at=null,revoked_by=null where grant_id='17700000-0000-4000-8000-000000000016';
select app_public.billing_bind_checkout_provider((select session_id from partner_private.photo_tier_checkout_sessions),repeat('ab',32),1);
select is(app_public.billing_record_checkout_event('evt_issue177wrongkey',statement_timestamp(),repeat('ef',32),1,'cus_issue177valid','sub_issue177valid'),
  'unbound','wrong provider HMAC cannot select a Checkout');
select is(app_public.billing_record_checkout_event('evt_issue177valid01',statement_timestamp(),repeat('ab',32),1,'cus_issue177valid','sub_issue177valid'),
  'applied','verified worker event atomically applies the exact Checkout');
select is((select state from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000040'),'consumed','verified completion consumes consent');
select is((select tier from partner_private.store_photo_tier_state where store_id='17700000-0000-4000-8000-000000000001'),'gallery','verified completion upgrades exact store');
select is(app_public.billing_record_checkout_event('evt_issue177valid01',statement_timestamp(),repeat('ab',32),1,'cus_issue177valid','sub_issue177valid'),
  'completed','webhook replay returns the stable completed state');

set local role billing_automation;
update partner_private.store_photo_tier_state set tier='free',source='default',version=2 where store_id='17700000-0000-4000-8000-000000000001';
reset role;
select is(app_public.billing_record_paid_tier_consent('17700000-0000-4000-8000-000000000001','full_gallery',177,repeat('11',32),2,'17700000-0000-4000-8000-000000000050')->>'state','unused','fresh generation can record another exact consent');
select app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000050'),177,'17700000-0000-4000-8000-000000000051');
select app_public.billing_bind_checkout_provider((select session_id from partner_private.photo_tier_checkout_sessions where target_tier='full_gallery'),repeat('cd',32),2);
set local role billing_automation;
update partner_private.photo_tier_sales_control set state='servicing_only',sales_generation=2,version=2 where singleton;
reset role;
select is(app_public.billing_create_checkout_session('17700000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_paid_consents where idempotency_key='17700000-0000-4000-8000-000000000050'),177,'17700000-0000-4000-8000-000000000051')->>'state','open',
  'authorized response-loss retry returns its reservation after sales pause');
select is(app_public.billing_record_checkout_event('evt_issue177stale01',statement_timestamp(),repeat('cd',32),2,'cus_issue177stale','sub_issue177stale'),
  'refund_pending','old-generation completion enters refund reconciliation');
select is((select state from partner_private.photo_tier_checkout_sessions where target_tier='full_gallery'),'refund_pending','late Checkout never completes');
select is((select tier from partner_private.store_photo_tier_state where store_id='17700000-0000-4000-8000-000000000001'),'free','late completion cannot upgrade Free');
select is((select count(*)::text from partner_private.store_billing_outbox where event_kind='checkout_cancel_full_refund'),'1','late completion queues one cancel/full-refund reconciliation');
select is((select provider_subscription_id from partner_private.photo_tier_refund_reconciliations),'sub_issue177stale','reconciliation durably stores the provider subscription reference');
select is(app_public.billing_confirm_checkout_refund('evt_issue177stale01',repeat('cd',32),2,'sub_issue177stale','re_issue177refund01'),
  'refunded','provider-confirmed full refund settles reconciliation');
select is((select state from partner_private.photo_tier_checkout_sessions where target_tier='full_gallery'),'refunded','Checkout becomes refunded only after provider confirmation');
select is((select state from partner_private.photo_tier_refund_reconciliations),'provider_confirmed','reconciliation records provider-confirmed evidence');
select is((select state from partner_private.store_billing_outbox where event_kind='checkout_cancel_full_refund'),'consumed','confirmed reconciliation consumes its outbox item');
select is(app_public.billing_confirm_checkout_refund('evt_issue177stale01',repeat('cd',32),2,'sub_issue177stale','re_issue177refund01'),
  'refunded','lost confirmation response safely replays');
select is(app_public.billing_get_capability()->>'enabled','false','servicing-only removes the paid acquisition surface');
select ok(not has_function_privilege('authenticated','app_public.billing_record_checkout_event(text,timestamptz,text,integer,text,text)','EXECUTE')
  and has_function_privilege('billing_mirror_service','app_public.billing_record_checkout_event(text,timestamptz,text,integer,text,text)','EXECUTE'),'only the verified webhook worker can apply completion');

select * from finish();
rollback;
