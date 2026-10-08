-- Issue #580 fixture. All records are deterministic, synthetic, and rolled back
-- by the enclosing acceptance transaction. Provider results are seeded only by
-- the local media_worker test role; no provider endpoint or account is used.
\ir media_resubmission.inc

update partner_private.partner_invitations set synthetic=true,
  issuance_idempotency_key='issue580-owner-invitation',raw_returned_at=statement_timestamp()
where invitation_id='76000000-0000-4000-8000-000000000002';
update app_private.environment_stage
set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='private_beta',state='open',
  provider_key='test_sink',provider_version='contract-v1',contract_receipt_id='receipt:l01:test',
  watchdog_state='disabled',last_ack_sequence=0,last_ack_root=null,last_ack_at=null,
  changed_at=statement_timestamp(),version=version+1 where id=1;
-- This rolled-back SQL fixture uses the existing worker RPC contract with a
-- local test sink; no audit or media provider endpoint is called.
insert into app_private.privileged_audit_events(
  actor_role,action,outcome,resource_kind,reason_code,event_hash
) values('administrator','issue580_anchor_setup','completed','system','fixture',decode(repeat('00',32),'hex'));
set local role service_role;
select app_public.prepare_audit_anchor();
select set_config('test.issue580_anchor_claim',app_public.claim_audit_anchor(
  gen_random_uuid(),statement_timestamp()
)::text,true);
select app_public.acknowledge_audit_anchor(
  current_setting('test.issue580_anchor_claim')::jsonb->'payload'->>'idempotencyKey',
  (current_setting('test.issue580_anchor_claim')::jsonb->>'leaseToken')::uuid,statement_timestamp());
reset role;
select ok(app_private.privileged_anchor_is_current(),
  'private-beta fixture opens only after the worker acknowledges its current audit anchor');
update app_public.stores set synthetic=true,audience='synthetic' where id in
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
update app_public.stores set slug='issue580-clockwork-cabinet',name='Clockwork Cabinet'
  where id='00000000-0000-4000-8000-000000000009';
update app_public.stores set slug='issue580-prairie-patina',name='Prairie Patina'
  where id='00000000-0000-4000-8000-000000000001';
insert into app_public.store_categories(id,slug,label,sort_order)
  values('58000000-0000-4000-8000-000000000010','issue-580-antiques','Antiques',0)
  on conflict(id) do nothing;
insert into app_public.store_category_assignments(store_id,category_id)
  values('00000000-0000-4000-8000-000000000009','58000000-0000-4000-8000-000000000010')
  on conflict do nothing;
insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label)
select '00000000-0000-4000-8000-000000000009',group_name,statement_timestamp(),'Synthetic #580 catalog fixture'
from unnest(array['identity_location','contact','hours','categories_attributes']::app_public.verification_group[]) as groups(group_name)
on conflict(store_id,verification_group) do update set verified_at=excluded.verified_at,provenance_label=excluded.provenance_label;
update app_public.stores set publication_state='active'
  where id='00000000-0000-4000-8000-000000000009';
update app_private.profiles set verified_email_snapshot='owner580@example.test'
  where user_id='76000000-0000-4000-8000-000000000001';
update auth.users set email='owner580@example.test',email_confirmed_at=statement_timestamp()
  where id='76000000-0000-4000-8000-000000000001';

-- Separate synthetic Site Administrator provisions the existing Owner scope.
insert into auth.users(id,email,email_confirmed_at) values
  ('58000000-0000-4000-8000-000000000001','admin580@example.test',statement_timestamp());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('58000000-0000-4000-8000-000000000002','58000000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at) values
  ('58000000-0000-4000-8000-000000000003','58000000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
select ok(exists(select 1 from app_private.active_sessions
  where session_id='58000000-0000-4000-8000-000000000003'
    and last_authenticated_at>=statement_timestamp()-interval '15 minutes'
    and mfa_verified_at>=statement_timestamp()-interval '15 minutes'
    and access_token_expires_at>statement_timestamp()),
  'Administrator fixture carries current session, last-auth, and MFA state');
insert into app_private.role_grants(subject_user_id,role) values
  ('58000000-0000-4000-8000-000000000001','administrator');
insert into app_private.privileged_audit_events(
  actor_role,action,outcome,resource_kind,reason_code,event_hash
) values('administrator','issue580_admin_role_ready','completed','system','fixture',decode(repeat('00',32),'hex'));
set local role service_role;
select app_public.prepare_audit_anchor();
select set_config('test.issue580_anchor_claim',app_public.claim_audit_anchor(
  gen_random_uuid(),statement_timestamp()
)::text,true);
select app_public.acknowledge_audit_anchor(
  current_setting('test.issue580_anchor_claim')::jsonb->'payload'->>'idempotencyKey',
  (current_setting('test.issue580_anchor_claim')::jsonb->>'leaseToken')::uuid,statement_timestamp());
reset role;
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement) values
  ('58000000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','store owner','Synthetic authority documented by independent channels.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
  ('58000000-0000-4000-8000-000000000004','published_business_contact','domain_response','verified','58000000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'58000000-0000-4000-8000-000000000005'),
  ('58000000-0000-4000-8000-000000000004','callback','callback','verified','58000000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'58000000-0000-4000-8000-000000000006');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp()
  where claim_id='58000000-0000-4000-8000-000000000004';
update partner_private.listing_claims set state='verification_pending'
  where claim_id='58000000-0000-4000-8000-000000000004';
insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
  values('76000000-0000-4000-8000-000000000001','claim','58000000-0000-4000-8000-000000000004');
create temporary table issue580_claim_version(version bigint);
insert into issue580_claim_version select version from partner_private.listing_claims
  where claim_id='58000000-0000-4000-8000-000000000004';
grant select on issue580_claim_version to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','58000000-0000-4000-8000-000000000001',
  'session_id','58000000-0000-4000-8000-000000000003','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
select app_public.owner_admin_approve_claim('58000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000009',(select version from issue580_claim_version),'issue580-owner-grant');
reset role;
insert into app_private.privileged_audit_events(
  actor_role,action,outcome,resource_kind,reason_code,event_hash
) values('administrator','issue580_owner_scope_ready','completed','system','fixture',decode(repeat('00',32),'hex'));
set local role service_role;
select app_public.prepare_audit_anchor();
select set_config('test.issue580_anchor_claim',app_public.claim_audit_anchor(
  gen_random_uuid(),statement_timestamp()
)::text,true);
select app_public.acknowledge_audit_anchor(
  current_setting('test.issue580_anchor_claim')::jsonb->'payload'->>'idempotencyKey',
  (current_setting('test.issue580_anchor_claim')::jsonb->>'leaseToken')::uuid,statement_timestamp());
reset role;

insert into partner_private.store_photo_tier_state(store_id,tier,source)
  values('00000000-0000-4000-8000-000000000009','free','default')
  on conflict(store_id) do update set tier='free',source='default';

-- One cover and five full-cap gallery slots. Store 1 carries a foreign target.
insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order) values
 ('58000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000009','/assets/issue580-current-cover.webp','cover','Approved cover before replacement',0),
 ('58000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000009','/assets/issue580-current-gallery-1.webp','gallery','Approved gallery image one',1),
 ('58000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000009','/assets/issue580-current-gallery-2.webp','gallery','Approved gallery image two',2),
 ('58000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000009','/assets/issue580-current-gallery-3.webp','gallery','Approved gallery image three',3),
 ('58000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000009','/assets/issue580-current-gallery-4.webp','gallery','Approved gallery image four',4),
 ('58000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000009','/assets/issue580-current-gallery-5.webp','gallery','Approved gallery image five',5),
 ('58000000-0000-4000-8000-000000000019','00000000-0000-4000-8000-000000000001','/assets/issue580-foreign-cover.webp','cover','Another store cover',0);

insert into media_private.media_uploads(
  upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
  source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,
  public_derivative_object_key,derivative_digest,derivative_bytes,derivative_width,derivative_height,
  scan_state,metadata_stripped,reencoded,state,approved_by,approved_at,approval_reason,display_order,
  catalog_media_id,published_at
)
select v.upload_id,'76000000-0000-4000-8000-000000000001',v.store_id,v.kind,v.alt_text,
  statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,
  'quarantine/'||v.upload_id::text||'/original','quarantine/'||v.upload_id::text||'/derivative.webp',
  'official/'||v.upload_id::text||'/v1/'||repeat('a',32)||'.webp',decode(repeat('00',32),'hex'),100000,640,480,
  'clean',true,true,'published','58000000-0000-4000-8000-000000000001',statement_timestamp(),
  'administrator_approved',v.display_order,v.slot_id,statement_timestamp()
from (values
 ('58100000-0000-4000-8000-000000000011'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'cover'::text,'Approved cover before replacement'::text,0::smallint,'58000000-0000-4000-8000-000000000011'::uuid),
 ('58100000-0000-4000-8000-000000000012'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'gallery'::text,'Approved gallery image one'::text,1::smallint,'58000000-0000-4000-8000-000000000012'::uuid),
 ('58100000-0000-4000-8000-000000000013'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'gallery'::text,'Approved gallery image two'::text,2::smallint,'58000000-0000-4000-8000-000000000013'::uuid),
 ('58100000-0000-4000-8000-000000000014'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'gallery'::text,'Approved gallery image three'::text,3::smallint,'58000000-0000-4000-8000-000000000014'::uuid),
 ('58100000-0000-4000-8000-000000000015'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'gallery'::text,'Approved gallery image four'::text,4::smallint,'58000000-0000-4000-8000-000000000015'::uuid),
 ('58100000-0000-4000-8000-000000000016'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'gallery'::text,'Approved gallery image five'::text,5::smallint,'58000000-0000-4000-8000-000000000016'::uuid),
 ('58100000-0000-4000-8000-000000000019'::uuid,'00000000-0000-4000-8000-000000000001'::uuid,'cover'::text,'Another store cover'::text,0::smallint,'58000000-0000-4000-8000-000000000019'::uuid)
) as v(upload_id,store_id,kind,alt_text,display_order,slot_id);

select set_config('request.jwt.claims',jsonb_build_object('sub','76000000-0000-4000-8000-000000000001',
  'session_id','76000000-0000-4000-8000-000000000008','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
