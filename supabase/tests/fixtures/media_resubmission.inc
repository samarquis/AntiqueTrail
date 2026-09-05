-- ---- Fixture: actor with active session/MFA and one exact grant on store 1.
insert into app_public.catalog_areas(id,slug,label,state_code,sort_order)
values ('00000000-0000-4000-8000-000000000001','db-ci-resubmit-area','Database CI area','KS',0)
on conflict (id) do nothing;
insert into app_public.stores (id, slug, name, town, state_code, address, area_id, summary, description, synthetic, audience)
values ('00000000-0000-4000-8000-000000000001','db-ci-resubmit-store','Resubmit Store','Topeka','KS','1 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Resubmit fixture store',false,'regional_readiness')
  ,('00000000-0000-4000-8000-000000000009','db-ci-resubmit-other-store','Other Store','Topeka','KS','2 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Other resubmit fixture store',false,'regional_readiness')
on conflict (id) do nothing;
insert into auth.users(id) values ('76000000-0000-4000-8000-000000000001');
insert into auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at)
values ('76000000-0000-4000-8000-000000000024','76000000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp());
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at)
values ('76000000-0000-4000-8000-000000000002',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'76000000-0000-4000-8000-000000000001','consumed',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
values ('76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000002',decode(repeat('02',32),'hex'),'76000000-0000-4000-8000-000000000001','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
values ('76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000003','synthetic-v3','Resubmit Owner','Owner','Resubmit Store',decode(repeat('02',32),'hex'),true,true,true,true,true,'resubmit-consent');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
values ('76000000-0000-4000-8000-000000000005','76000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000001',decode(repeat('02',32),'hex'),'synthetic-v3',decode(repeat('03',32),'hex'));
insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at)
values ('76000000-0000-4000-8000-000000000006','76000000-0000-4000-8000-000000000003','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000005','active',statement_timestamp());
insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id)
values ('76000000-0000-4000-8000-000000000007','76000000-0000-4000-8000-000000000006','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
set local role identity_service;
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
values ('76000000-0000-4000-8000-000000000008','76000000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
reset role;
do $$ begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub','76000000-0000-4000-8000-000000000001','session_id','76000000-0000-4000-8000-000000000008',
    'aal','aal2','amr',jsonb_build_array(
      jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
      jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text, true);
end $$;

-- ---- Enable the media capability (M-01 provider gate) so the resubmission
-- ---- RPC's capability gate is satisfied. This is the same chain the intake
-- ---- path requires; without it every reserve call fails closed at 42501.
insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
  values ('78000000-0000-4000-8000-000000000099','topeka-ks','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'sha256:'||repeat('c',64),'active');
insert into release_private.release_gate_receipts(gate_receipt_id,release_id,gate_kind,receipt_digest,artifact_digest,migration_set_digest,config_digest,frozen_store_set_digest,external_verified,accepted_at)
  values ('78000000-0000-4000-8000-0000000000a1','78000000-0000-4000-8000-000000000099','provider_m',decode(repeat('d',64),'hex'),'sha256:'||repeat('e',64),'sha256:'||repeat('f',64),'sha256:'||repeat('a',64),decode(repeat('b',64),'hex'),true,statement_timestamp());
update app_private.environment_stage set
  stage='private_beta',
  capabilities=jsonb_build_object(
    'private_auth',true,'shopper_private',true,'representative_portal',true,
    'administrator',true,'official_media_upload',true),
  version=version+1
  where id=1;
insert into media_private.media_provider_config(
  id,state,gate_receipt_id,provider_key,contract_version,processing_region,
  provider_retention_days,hard_storage_bytes,provider_daily_operation_limit,provider_concurrent_limit,config_digest,accepted_at)
  values (1,'accepted','78000000-0000-4000-8000-0000000000a1','axiom','m01-v1','us-central1',
    30,10737418240,100000,100,decode(repeat('c',64),'hex'),statement_timestamp())
  on conflict (id) do update set state='accepted',gate_receipt_id=excluded.gate_receipt_id,provider_key=excluded.provider_key,contract_version=excluded.contract_version,processing_region=excluded.processing_region,provider_retention_days=excluded.provider_retention_days,hard_storage_bytes=excluded.hard_storage_bytes,provider_daily_operation_limit=excluded.provider_daily_operation_limit,provider_concurrent_limit=excluded.provider_concurrent_limit,config_digest=excluded.config_digest,accepted_at=excluded.accepted_at;
select ok(
  (select state from media_private.media_provider_config where id=1)='accepted'
  and (select stage from app_private.environment_stage where id=1)='private_beta'
  and (select capabilities->>'official_media_upload' from app_private.environment_stage where id=1)='true'
  and exists(select 1 from release_private.release_gate_receipts where gate_kind='provider_m' and external_verified),
  'media capability chain is provisioned for the resubmission tests');

-- ---- Rejected originals for store 1 and store 9, plus a non-rejected store-1 row.
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state,rejection_reason,rejected_at)
values
  ('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'00000000-0000-4000-8000-000000000001','gallery','Rejected storefront',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/80000000-0000-4000-8000-000000000001/original','quarantine/80000000-0000-4000-8000-000000000001/derivative.webp',decode(repeat('00',32),'hex'),100000,640,480,'clean',true,true,'rejected','Image quality insufficient for storefront',statement_timestamp()),
  ('80000000-0000-4000-8000-000000000002',gen_random_uuid(),'00000000-0000-4000-8000-000000000001','gallery','Waiting review',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/80000000-0000-4000-8000-000000000002/original','quarantine/80000000-0000-4000-8000-000000000002/derivative.webp',decode(repeat('00',32),'hex'),100000,640,480,'clean',true,true,'awaiting_review',null,null),
  ('80000000-0000-4000-8000-000000000003',gen_random_uuid(),'00000000-0000-4000-8000-000000000009','gallery','Foreign rejected',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/80000000-0000-4000-8000-000000000003/original','quarantine/80000000-0000-4000-8000-000000000003/derivative.webp',decode(repeat('00',32),'hex'),100000,640,480,'clean',true,true,'rejected','Foreign reason',statement_timestamp()),
  ('80000000-0000-4000-8000-000000000005',gen_random_uuid(),'00000000-0000-4000-8000-000000000001','gallery','Purged rejected',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/80000000-0000-4000-8000-000000000005/original','quarantine/80000000-0000-4000-8000-000000000005/derivative.webp',decode(repeat('00',32),'hex'),100000,640,480,'clean',true,true,'rejected','Purged reason',statement_timestamp());
update media_private.media_uploads set purge_due_at=statement_timestamp() where upload_id='80000000-0000-4000-8000-000000000005';

