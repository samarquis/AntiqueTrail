-- #629 keeps an open non-local audit anchor current through atomic Owner conversion.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled',
  watchdog_state='disabled',provider_key=null,provider_version=null,contract_receipt_id=null,
  last_ack_sequence=0,last_ack_root=null,last_ack_at=null,version=version+1 where id=1;
update app_public.stores set synthetic=true,audience='synthetic' where id='00000000-0000-4000-8000-000000000009';
insert into app_public.catalog_areas(id,slug,label,state_code,sort_order)
 values('00000000-0000-4000-8000-000000000001','owner629-area','Owner test area','KS',0)
 on conflict(id) do nothing;
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience) values
 ('62900000-0000-4000-8000-000000000001','owner629-store-b','Owner Store B','Topeka','KS','629 Test Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic'),
 ('62900000-0000-4000-8000-000000000002','owner629-store-c','Owner Store C','Topeka','KS','630 Test Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic')
on conflict(id) do update set synthetic=true,audience='synthetic';

insert into auth.users(id,email,email_confirmed_at) values
 ('62900000-0000-4000-8000-000000000001','admin629@example.test',statement_timestamp()),
 ('62900000-0000-4000-8000-000000000002','owner629@example.test',statement_timestamp()),
 ('62900000-0000-4000-8000-000000000003','other629@example.test',statement_timestamp());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
 ('62900000-0000-4000-8000-000000000004','62900000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp()),
 ('62900000-0000-4000-8000-000000000005','62900000-0000-4000-8000-000000000002','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.profiles(user_id,public_display_name,age_18_attested_at,status,verified_email_snapshot) values
 ('62900000-0000-4000-8000-000000000001','Issue 629 Administrator',statement_timestamp(),'active','admin629@example.test'),
 ('62900000-0000-4000-8000-000000000002','Issue 629 Owner',statement_timestamp(),'active','owner629@example.test'),
 ('62900000-0000-4000-8000-000000000003','Issue 629 Other',statement_timestamp(),'active','other629@example.test');
insert into app_private.role_grants(subject_user_id,role,state) values
 ('62900000-0000-4000-8000-000000000001','administrator','active');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at) values
 ('62900000-0000-4000-8000-000000000006','62900000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at) values
 ('62900000-0000-4000-8000-000000000007','62900000-0000-4000-8000-000000000002',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');

insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at,expires_at)
 values('62900000-0000-4000-8000-000000000008',decode(repeat('a1',32),'hex'),decode(repeat('a2',32),'hex'),'62900000-0000-4000-8000-000000000001','consumed',statement_timestamp(),true,'issue629-invitation',statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
 values('62900000-0000-4000-8000-000000000009','62900000-0000-4000-8000-000000000008',decode(repeat('a2',32),'hex'),'62900000-0000-4000-8000-000000000002','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
 values('62900000-0000-4000-8000-000000000010','62900000-0000-4000-8000-000000000008','62900000-0000-4000-8000-000000000009','synthetic-v3','Issue 629 Owner','Store Owner','Owner Store A',decode(repeat('a2',32),'hex'),true,true,true,true,true,'issue629-consent');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
 values('62900000-0000-4000-8000-000000000011','62900000-0000-4000-8000-000000000010','62900000-0000-4000-8000-000000000009','62900000-0000-4000-8000-000000000008','62900000-0000-4000-8000-000000000002',decode(repeat('a2',32),'hex'),'synthetic-v3',decode(repeat('a3',32),'hex'));

create function pg_temp.actor629(actor uuid,session_id uuid) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated','aal','aal2','amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true); end $$;
create function pg_temp.seed_claim629(p_claim uuid,p_applicant uuid,p_store uuid) returns void
language plpgsql as $$ begin
 insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
  values(p_claim,p_applicant,p_store,'untrusted relationship text','Synthetic exact-store authority for issue 629.');
 insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
  (p_claim,'published_business_contact','domain_response','verified','62900000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('b1',32),'hex'),decode(repeat('b2',32),'hex'),gen_random_uuid()),
  (p_claim,'callback','callback','verified','62900000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('b3',32),'hex'),decode(repeat('b4',32),'hex'),gen_random_uuid());
 update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id=p_claim;
 update partner_private.listing_claims set state='verification_pending' where claim_id=p_claim;
 insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
  values(p_applicant,'claim',p_claim)
  on conflict(applicant_id) do update set active_kind='claim',active_id=excluded.active_id,version=partner_private.store_owner_intake_roots.version+1,updated_at=statement_timestamp();
end $$;

select pg_temp.seed_claim629('62900000-0000-4000-8000-000000000012','62900000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000009');
select pg_temp.seed_claim629('62900000-0000-4000-8000-000000000013','62900000-0000-4000-8000-000000000002','62900000-0000-4000-8000-000000000001');
select pg_temp.seed_claim629('62900000-0000-4000-8000-000000000014','62900000-0000-4000-8000-000000000003','62900000-0000-4000-8000-000000000002');

-- Open a real private_beta anchor using the existing prepare/claim/ack protocol.
insert into app_private.privileged_audit_events(actor_role,action,outcome,resource_kind,reason_code,event_hash)
 values('administrator','owner_anchor_fixture','completed','system','fixture',decode(repeat('00',32),'hex'));
update app_private.audit_anchor_capability set deployment_environment='private_beta',state='open',provider_key='test_sink',
 provider_version='contract-v1',contract_receipt_id='receipt:issue629:test',watchdog_state='current',version=version+1 where id=1;
set local role service_role;
select is(app_public.prepare_audit_anchor()->>'state','pending','open private_beta anchor prepares the current audit high-water');
select set_config('test.owner_anchor629',app_public.claim_audit_anchor('62900000-0000-4000-8000-000000000015',statement_timestamp())::text,true);
reset role;
set local role service_role;
select ok(app_public.acknowledge_audit_anchor(current_setting('test.owner_anchor629')::jsonb->'payload'->>'idempotencyKey',
 (current_setting('test.owner_anchor629')::jsonb->>'leaseToken')::uuid,statement_timestamp()),'worker acknowledges the prepared root through the real lease API');
reset role;
select ok(app_private.privileged_anchor_is_current(),'genuine acknowledgement makes private_beta anchor current');

create temporary table owner_current_before629 as
 select version as claim_version from partner_private.listing_claims
 where claim_id='62900000-0000-4000-8000-000000000012';
select pg_temp.actor629('62900000-0000-4000-8000-000000000001','62900000-0000-4000-8000-000000000006');
set local role authenticated;
select lives_ok($$select app_public.owner_admin_approve_claim('62900000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000009',
 (select version from partner_private.listing_claims where claim_id='62900000-0000-4000-8000-000000000012'),'629-owner-current')$$,
 'valid Owner approval converts both protected grants while the acknowledged private_beta anchor is current');
reset role;
select is((select state from partner_private.listing_claims where claim_id='62900000-0000-4000-8000-000000000012'),'approved','current-anchor approval commits claim state');
select is((select count(*) from app_private.role_grants where subject_user_id='62900000-0000-4000-8000-000000000002' and store_id='00000000-0000-4000-8000-000000000009' and role='store_owner' and state='active'),1::bigint,'current-anchor approval converts the app role grant');
select is((select count(*) from partner_private.store_partner_grants where auth_user_id='62900000-0000-4000-8000-000000000002' and store_id='00000000-0000-4000-8000-000000000009' and role='store_owner' and state='active'),1::bigint,'current-anchor approval converts the partner scope grant');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='629-owner-current' and operation='approve'),1::bigint,'approval retains one generic claim receipt');
select ok(exists(select 1 from partner_private.claim_command_receipts where idempotency_key='629-owner-current'
 and claim_id='62900000-0000-4000-8000-000000000012' and actor_user_id='62900000-0000-4000-8000-000000000001' and result_state='approved'),
 'generic receipt binds the exact claim, administrator, operation, and result');
select is((select count(*) from partner_private.owner_claim_approvals where idempotency_key='629-owner-current'),1::bigint,'approval retains one Owner receipt');
select ok(exists(select 1 from partner_private.owner_claim_approvals where idempotency_key='629-owner-current'
 and claim_id='62900000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009'
 and approved_by='62900000-0000-4000-8000-000000000001'
 and expected_version=(select claim_version from owner_current_before629)),
 'Owner receipt binds exact store, administrator, and pre-approval claim version');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='62900000-0000-4000-8000-000000000012' and action='partner_claim_approve'),1::bigint,'approval retains one generic claim audit');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='62900000-0000-4000-8000-000000000012' and action='owner_claim_approved'),1::bigint,'approval retains one Owner audit');
select ok(not app_private.privileged_anchor_is_current(),'approval audit events make the acknowledged anchor stale after the atomic transaction');
select throws_ok($$insert into app_private.role_grants(subject_user_id,role,state)
 values('62900000-0000-4000-8000-000000000003','administrator','active')$$,
 '42501','privileged_anchor_stale','next privileged activation remains denied until a genuine new acknowledgement');

-- A real generic claim action after a fresh acknowledgement makes the next Owner attempt stale at entry.
update partner_private.store_owner_intake_roots set active_kind='claim',active_id='62900000-0000-4000-8000-000000000013',version=version+1,updated_at=statement_timestamp()
 where applicant_id='62900000-0000-4000-8000-000000000002';
set local role service_role;
select is(app_public.prepare_audit_anchor()->>'state','pending','second anchor includes the committed Owner audits');
select set_config('test.owner_anchor629_second',app_public.claim_audit_anchor('62900000-0000-4000-8000-000000000016',statement_timestamp())::text,true);
reset role;
set local role service_role;
select ok(app_public.acknowledge_audit_anchor(current_setting('test.owner_anchor629_second')::jsonb->'payload'->>'idempotencyKey',
 (current_setting('test.owner_anchor629_second')::jsonb->>'leaseToken')::uuid,statement_timestamp()),'worker acknowledges the second root through the real lease API');
reset role;
select pg_temp.actor629('62900000-0000-4000-8000-000000000001','62900000-0000-4000-8000-000000000006');
set local role authenticated;
select lives_ok($$select app_public.partner_admin_claim_command('changes','62900000-0000-4000-8000-000000000014',
 (select version from partner_private.listing_claims where claim_id='62900000-0000-4000-8000-000000000014'),'629-stale-maker','documentation_requested',null)$$,
 'a current generic Administrator command appends a real privileged audit event');
reset role;
select ok(not app_private.privileged_anchor_is_current(),'post-acknowledgement generic command makes the anchor stale');
create temporary table owner_stale_before629 as
 select c.state,c.version,(select count(*) from partner_private.claim_events e where e.claim_id=c.claim_id) event_count,
  (select count(*) from partner_private.claim_command_receipts where idempotency_key='629-owner-stale') claim_receipts,
  (select count(*) from partner_private.owner_claim_approvals where idempotency_key='629-owner-stale') owner_receipts,
 (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id=c.claim_id and action in ('partner_claim_approve','owner_claim_approved')) approval_audits
 from partner_private.listing_claims c where c.claim_id='62900000-0000-4000-8000-000000000013';
select pg_temp.actor629('62900000-0000-4000-8000-000000000001','62900000-0000-4000-8000-000000000006');
set local role authenticated;
select throws_ok($$select app_public.owner_admin_approve_claim('62900000-0000-4000-8000-000000000013','62900000-0000-4000-8000-000000000001',
 (select version from partner_private.listing_claims where claim_id='62900000-0000-4000-8000-000000000013'),'629-owner-stale')$$,
 '42501',null,'stale private_beta anchor denies Owner approval before mutation');
reset role;
select ok((select c.state=b.state and c.version=b.version
 and (select count(*) from partner_private.claim_events e where e.claim_id=c.claim_id)=b.event_count
 and (select count(*) from partner_private.claim_command_receipts where idempotency_key='629-owner-stale')=b.claim_receipts
 and (select count(*) from partner_private.owner_claim_approvals where idempotency_key='629-owner-stale')=b.owner_receipts
 and (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id=c.claim_id and action in ('partner_claim_approve','owner_claim_approved'))=b.approval_audits
 and not exists(select 1 from app_private.role_grants where subject_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active')
 and not exists(select 1 from partner_private.store_partner_grants where auth_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active')
 from partner_private.listing_claims c cross join owner_stale_before629 b where c.claim_id='62900000-0000-4000-8000-000000000013'),
 'stale-anchor denial preserves claim, grants, receipts, and approval audits');

select * from finish();
rollback;
