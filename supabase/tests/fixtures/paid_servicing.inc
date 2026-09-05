grant billing_automation,commercial_research_signature_service to postgres;

insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,publication_state)
values ('17800000-0000-4000-8000-000000000001','issue-178-store','Issue 178 Store','Topeka','KS','1 Test Way',
  '00000000-0000-4000-8000-000000000001','Database fixture','Database fixture store','active');
insert into auth.users(id) values ('17800000-0000-4000-8000-000000000010');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values ('17800000-0000-4000-8000-000000000018','17800000-0000-4000-8000-000000000010','totp','verified',statement_timestamp(),statement_timestamp());
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at)
values ('17800000-0000-4000-8000-000000000011',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),
  '17800000-0000-4000-8000-000000000010','consumed',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
values ('17800000-0000-4000-8000-000000000012','17800000-0000-4000-8000-000000000011',decode(repeat('02',32),'hex'),
  '17800000-0000-4000-8000-000000000010','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
values ('17800000-0000-4000-8000-000000000013','17800000-0000-4000-8000-000000000011','17800000-0000-4000-8000-000000000012',
  'synthetic-v3','Test Owner','Owner','Issue 178 Store',decode(repeat('02',32),'hex'),true,true,true,true,true,'issue-178-consent');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
values ('17800000-0000-4000-8000-000000000014','17800000-0000-4000-8000-000000000013','17800000-0000-4000-8000-000000000012',
  '17800000-0000-4000-8000-000000000011','17800000-0000-4000-8000-000000000010',decode(repeat('02',32),'hex'),'synthetic-v3',decode(repeat('03',32),'hex'));
insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at)
values ('17800000-0000-4000-8000-000000000015','17800000-0000-4000-8000-000000000012','17800000-0000-4000-8000-000000000010',
  '17800000-0000-4000-8000-000000000001','17800000-0000-4000-8000-000000000014','active',statement_timestamp());
insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id)
values ('17800000-0000-4000-8000-000000000016','17800000-0000-4000-8000-000000000015','17800000-0000-4000-8000-000000000010',
  '17800000-0000-4000-8000-000000000001');

set local role identity_service;
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
values ('17800000-0000-4000-8000-000000000017','17800000-0000-4000-8000-000000000010',statement_timestamp(),1,
  statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
reset role;

set local role billing_automation;
insert into partner_private.photo_tier_commercial_configs(version,state,gallery_price_cents,full_gallery_price_cents,currency,tax_mode,first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,refund_policy_version,support_policy_version,terms_version,privacy_version,full_gallery_limits_version,full_gallery_limits)
values (178,'draft',1200,1900,'USD','stripe-tax','checkout','monthly','cancel-anytime','48-hours','prorated','cycle-end','14-days','30-days','refund-v1','support-v1','terms-v1','privacy-v1','limits-v1',
  '{"acceptedFileTypes":["image/jpeg"],"maxFileBytes":10000000,"maxWidthPixels":6000,"maxHeightPixels":6000,"uploadRateRule":"bounded","quotaOutageRule":"pause","moderationAbuseRule":"review","reasonRecoveryAppealRule":"appeal","paidServiceRemedy":"remedy"}'::jsonb);
insert into partner_private.commercial_research_signature_challenges(challenge_id,config_version,config_digest,protocol_digest,community_gate_receipt_ids,signer_user_id,signed_payload_digest,research_expires_at,expires_at,state,consumed_at)
values ('17800000-0000-4000-8000-000000000020',178,decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),
  array['17800000-0000-4000-8000-000000000021'::uuid,'17800000-0000-4000-8000-000000000022'::uuid,'17800000-0000-4000-8000-000000000023'::uuid],
  '17800000-0000-4000-8000-000000000010',decode(repeat('33',32),'hex'),statement_timestamp()+interval '1 day',statement_timestamp()+interval '15 minutes','consumed',statement_timestamp());
reset role;
set local role commercial_research_signature_service;
insert into partner_private.commercial_research_signature_receipts(receipt_id,challenge_id,config_version,config_digest,protocol_digest,signer_user_id,signer_responsibility,signed_payload_digest,provider_verification_id,signed_at)
values ('17800000-0000-4000-8000-000000000024','17800000-0000-4000-8000-000000000020',178,decode(repeat('11',32),'hex'),decode(repeat('22',32),'hex'),
  '17800000-0000-4000-8000-000000000010','ProductOwner',decode(repeat('33',32),'hex'),'issue-178-signature',statement_timestamp());
reset role;
set local role billing_automation;
insert into partner_private.commercial_research_authorizations(authorization_id,config_version,protocol_digest,signature_challenge_id,signature_receipt_id,signed_by,signed_at,expires_at)
values ('17800000-0000-4000-8000-000000000025',178,decode(repeat('22',32),'hex'),'17800000-0000-4000-8000-000000000020',
  '17800000-0000-4000-8000-000000000024','17800000-0000-4000-8000-000000000010',statement_timestamp(),statement_timestamp()+interval '1 day');
update partner_private.photo_tier_commercial_configs set state='approved_inactive',canonical_bytes='issue-178',digest=decode(repeat('11',32),'hex'),
  research_authorization_id='17800000-0000-4000-8000-000000000025',approved_by='17800000-0000-4000-8000-000000000010',approved_at=statement_timestamp() where version=178;
update partner_private.photo_tier_commercial_configs set state='active' where version=178;
update partner_private.photo_tier_sales_control set state='sales_open',commercial_config_version=178 where singleton;
reset role;
insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
values ('17800000-0000-4000-8000-000000000030','topeka-ks','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'sha256:'||repeat('c',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion,photo_tiers_enabled)
values ('17800000-0000-4000-8000-000000000030',true,true,true,true,true,true);
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','17800000-0000-4000-8000-000000000010','session_id','17800000-0000-4000-8000-000000000017','aal','aal2',
  'amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)
  ))::text,true);
