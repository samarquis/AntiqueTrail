-- #582 access-only pgTAP contract. Source only; execution waits for the #575 lane.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not has_function_privilege('anon','partner_private.is_owner_intent_claim(uuid)','execute')
  and not has_function_privilege('authenticated','partner_private.is_owner_intent_claim(uuid)','execute')
  and not has_function_privilege('service_role','partner_private.is_owner_intent_claim(uuid)','execute'),
  'Owner-intent classifier is not executable by application roles');
select ok(not has_function_privilege('anon','partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)','execute')
  and not has_function_privilege('authenticated','partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)','execute')
  and not has_function_privilege('service_role','partner_private.partner_admin_claim_command_core(text,uuid,bigint,text,text,uuid,boolean)','execute'),
  'private claim-command guard is not executable by application roles');
select ok(not has_function_privilege('anon','partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)','execute')
  and not has_function_privilege('authenticated','partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)','execute')
  and not has_function_privilege('service_role','partner_private.partner_admin_claim_command_core_unchecked(text,uuid,bigint,text,text,uuid)','execute'),
  'unchecked Representative mutation is not executable by application roles');
\ir fixtures/media_resubmission.inc

update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
update app_public.stores set synthetic=true,audience='synthetic' where id='00000000-0000-4000-8000-000000000009';
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience) values
 ('00000000-0000-4000-8000-000000000008','owner582-store-b','Owner Store B','Topeka','KS','8 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic'),
 ('00000000-0000-4000-8000-000000000007','owner582-store-c','Owner Store C','Topeka','KS','7 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic'),
 ('00000000-0000-4000-8000-000000000006','owner582-store-d','Owner Store D','Topeka','KS','6 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic')
on conflict (id) do update set synthetic=true,audience='synthetic';

insert into auth.users(id,email,email_confirmed_at) values
 ('58200000-0000-4000-8000-000000000001','admin582@example.test',statement_timestamp()),
 ('58200000-0000-4000-8000-000000000010','shopper582@example.test',statement_timestamp()),
 ('58200000-0000-4000-8000-000000000012','rep582@example.test',statement_timestamp());
insert into partner_private.public_claim_consent_receipts(auth_user_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum)
select '58200000-0000-4000-8000-000000000012',policy_version,true,true,'issue582-public-claim-consent',decode(repeat('58',32),'hex')
from partner_private.partner_material_terms where is_current;
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at)
 values('58200000-0000-4000-8000-000000000014',decode(repeat('81',32),'hex'),decode(repeat('82',32),'hex'),'58200000-0000-4000-8000-000000000001','consumed',statement_timestamp(),false,'issue582-rep-invitation',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
 values('58200000-0000-4000-8000-000000000015','58200000-0000-4000-8000-000000000014',decode(repeat('82',32),'hex'),'58200000-0000-4000-8000-000000000012','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at)
 values('58200000-0000-4000-8000-000000000018',decode(repeat('84',32),'hex'),decode(repeat('85',32),'hex'),'58200000-0000-4000-8000-000000000001','consumed',statement_timestamp(),true,'issue582-admin-owner-invitation',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
 values('58200000-0000-4000-8000-000000000019','58200000-0000-4000-8000-000000000018',decode(repeat('85',32),'hex'),'58200000-0000-4000-8000-000000000001','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
select '58200000-0000-4000-8000-000000000020','58200000-0000-4000-8000-000000000018','58200000-0000-4000-8000-000000000019',policy_version,'Issue 582 Administrator','Store Owner','Owner Store C',decode(repeat('85',32),'hex'),true,true,true,true,true,'issue582-admin-owner-bound-consent'
from partner_private.partner_material_terms where is_current;
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
select '58200000-0000-4000-8000-000000000021','58200000-0000-4000-8000-000000000020','58200000-0000-4000-8000-000000000019','58200000-0000-4000-8000-000000000018','58200000-0000-4000-8000-000000000001',decode(repeat('85',32),'hex'),policy_version,decode(repeat('86',32),'hex')
from partner_private.partner_material_terms where is_current;
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
select '58200000-0000-4000-8000-000000000016','58200000-0000-4000-8000-000000000014','58200000-0000-4000-8000-000000000015',policy_version,'Issue 582 Representative','Representative','Owner Store C',decode(repeat('82',32),'hex'),true,true,true,true,true,'issue582-rep-bound-consent'
from partner_private.partner_material_terms where is_current;
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
select '58200000-0000-4000-8000-000000000017','58200000-0000-4000-8000-000000000016','58200000-0000-4000-8000-000000000015','58200000-0000-4000-8000-000000000014','58200000-0000-4000-8000-000000000012',decode(repeat('82',32),'hex'),policy_version,decode(repeat('83',32),'hex')
from partner_private.partner_material_terms where is_current;
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at)
 values('58200000-0000-4000-8000-000000000030',decode(repeat('90',32),'hex'),decode(repeat('91',32),'hex'),'58200000-0000-4000-8000-000000000001','consumed',statement_timestamp(),false,'issue582-rep-two-invitation',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
 values('58200000-0000-4000-8000-000000000031','58200000-0000-4000-8000-000000000030',decode(repeat('91',32),'hex'),'58200000-0000-4000-8000-000000000010','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
select '58200000-0000-4000-8000-000000000032','58200000-0000-4000-8000-000000000030','58200000-0000-4000-8000-000000000031',policy_version,'Issue 582 Representative Two','Representative','Owner Store A',decode(repeat('91',32),'hex'),true,true,true,true,true,'issue582-rep-two-bound-consent'
from partner_private.partner_material_terms where is_current;
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
select '58200000-0000-4000-8000-000000000033','58200000-0000-4000-8000-000000000032','58200000-0000-4000-8000-000000000031','58200000-0000-4000-8000-000000000030','58200000-0000-4000-8000-000000000010',decode(repeat('91',32),'hex'),policy_version,decode(repeat('92',32),'hex')
from partner_private.partner_material_terms where is_current;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
 ('58200000-0000-4000-8000-000000000002','58200000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp()),
 ('58200000-0000-4000-8000-000000000013','58200000-0000-4000-8000-000000000012','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.profiles(user_id,public_display_name,age_18_attested_at) values
 ('58200000-0000-4000-8000-000000000001','Issue 582 Administrator',statement_timestamp()),
 ('58200000-0000-4000-8000-000000000010','Issue 582 Shopper',statement_timestamp()),
 ('58200000-0000-4000-8000-000000000012','Issue 582 Representative',statement_timestamp())
on conflict (user_id) do update set public_display_name=excluded.public_display_name;
update app_private.profiles set status='active',verified_email_snapshot='admin582@example.test'
 where user_id='58200000-0000-4000-8000-000000000001';
update app_private.profiles set status='active',verified_email_snapshot='rep582@example.test'
 where user_id='58200000-0000-4000-8000-000000000012';
insert into app_private.role_grants(subject_user_id,role,state) values
 ('58200000-0000-4000-8000-000000000001','administrator','active'),
 ('58200000-0000-4000-8000-000000000010','shopper','active');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at) values
 ('58200000-0000-4000-8000-000000000003','58200000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes'),
 ('58200000-0000-4000-8000-000000000011','76000000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');
update app_private.profiles set status='active',verified_email_snapshot='owner422@example.test'
 where user_id='76000000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=statement_timestamp() where id='76000000-0000-4000-8000-000000000001';
update auth.mfa_factors set status='verified' where user_id='76000000-0000-4000-8000-000000000001';
update partner_private.partner_invitations set synthetic=true,issuance_idempotency_key='owner582-invitation',raw_returned_at=created_at,expires_at=created_at+interval '30 minutes'
 where invitation_id='76000000-0000-4000-8000-000000000002';
update partner_private.pending_partner_identities set state='bound',verified_email_at=statement_timestamp(),mfa_verified_at=statement_timestamp(),bound_at=statement_timestamp()
 where auth_user_id='76000000-0000-4000-8000-000000000001';
insert into shopper_private.saved_stores(user_id,store_id)
 values('58200000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000009');

create function pg_temp.actor582(actor uuid,session_id uuid,assurance text default 'aal2') returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated','aal',assurance,'amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true); end $$;
create function pg_temp.seed_claim582(p_claim uuid,p_applicant uuid,p_store uuid) returns void
language plpgsql as $$ begin
 insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
  values(p_claim,p_applicant,p_store,'untrusted relationship text','Synthetic exact-store authority for issue 582.');
 insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
  (p_claim,'published_business_contact','domain_response','verified','58200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('71',32),'hex'),decode(repeat('72',32),'hex'),gen_random_uuid()),
  (p_claim,'callback','callback','verified','58200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('73',32),'hex'),decode(repeat('74',32),'hex'),gen_random_uuid());
 update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id=p_claim;
 update partner_private.listing_claims set state='verification_pending' where claim_id=p_claim;
 insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
  values(p_applicant,'claim',p_claim)
  on conflict(applicant_id) do update set active_kind='claim',active_id=excluded.active_id,version=partner_private.store_owner_intake_roots.version+1,updated_at=statement_timestamp();
end $$;

create temporary table review_cases582(claim_id uuid primary key,case_id uuid not null,version bigint);
grant select,insert,update on review_cases582 to authenticated;
create temporary table claim_versions582(claim_id uuid primary key,version bigint not null);
grant select on claim_versions582 to authenticated;
create temporary table previews582(kind text primary key,data jsonb not null);
grant select,insert on previews582 to authenticated;
create temporary table revoke_result582(data jsonb);
grant select,insert on revoke_result582 to authenticated;

select pg_temp.seed_claim582('58200000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
insert into review_cases582 select '58200000-0000-4000-8000-000000000004',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-000000000004' and case_type='listing_claim';
create temporary table owner_claim_before582 as
 select c.claim_id,c.version as claim_version,r.version as review_version
 from partner_private.listing_claims c join admin_private.admin_review_cases r
   on r.target_id=c.claim_id and r.case_type='listing_claim'
 where c.claim_id='58200000-0000-4000-8000-000000000004';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-000000000004';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version+1 from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-stale')$$,'40001',null,'stale Owner review-case version fails closed');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-a')->>'state'),'approved','invitation-backed Owner approval routes through owner_admin_approve_claim');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-a')->>'state'),'approved','Owner approval replay returns its recorded result');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),'approved','Owner approval preserves approved claim state');
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),(select claim_version+1 from owner_claim_before582),'Owner approval increments claim version once');
select is((select expected_version from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-000000000004'),(select claim_version from owner_claim_before582),'Owner receipt binds the original claim version');
select is((select version from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000009' and role='store_owner' and state='active'),2::bigint,'Owner role conversion increments its grant version once');
select is((select version from partner_private.store_partner_grants where auth_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000009' and role='store_owner' and state='active'),2::bigint,'Owner partner-scope conversion increments its grant version once');
select is((select version from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-000000000004' and case_type='listing_claim'),(select review_version+2 from owner_claim_before582),'claiming and deciding the Owner review each increment the review-case version once');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-000000000004' and idempotency_key='582-review-owner-a'),1::bigint,'Owner approval writes one claim event');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-review-owner-a' and operation='approve'),1::bigint,'Owner approval writes one generic claim command receipt');
select is((select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-review-owner-a'),1::bigint,'Owner approval writes one Owner-specific approval marker');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-000000000004' and action='partner_claim_approve'),1::bigint,'Owner approval preserves the generic claim audit');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-000000000004' and action='owner_claim_approved'),1::bigint,'Owner approval writes one Owner-specific audit');
create temporary table owner_root_before_replay582 as
 select applicant_id,active_kind,active_id,version from partner_private.store_owner_intake_roots
 where applicant_id='76000000-0000-4000-8000-000000000001';
select ok((select active_kind='none' and active_id is null from owner_root_before_replay582),'first Owner approval clears its active intake root');
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000e','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000006');
select ok(exists(select 1 from partner_private.store_owner_intake_roots r join partner_private.listing_claims c on c.claim_id=r.active_id
 where r.applicant_id='76000000-0000-4000-8000-000000000001' and r.active_kind='claim' and r.active_id='58200000-0000-4000-8000-00000000000e'
 and c.claimant_id=r.applicant_id and c.state='verification_pending'),'a later pending claim becomes the valid active root before replay');
insert into claim_versions582
 select claim_id,expected_version from partner_private.owner_claim_approvals
 where claim_id='58200000-0000-4000-8000-000000000004'
 on conflict(claim_id) do update set version=excluded.version;
create temporary table owner_replay_before582 as
 select c.version as claim_version,
   (select version from app_private.role_grants where subject_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active') as role_grant_version,
   (select version from partner_private.store_partner_grants where auth_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active') as partner_grant_version,
   (select count(*) from partner_private.claim_events where claim_id=c.claim_id) as event_count,
   (select count(*) from partner_private.claim_command_receipts where idempotency_key='582-review-owner-a') as claim_receipt_count,
   (select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-review-owner-a') as owner_receipt_count,
   (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id=c.claim_id and action in ('partner_claim_approve','owner_claim_approved')) as audit_count
 from partner_private.listing_claims c where c.claim_id='58200000-0000-4000-8000-000000000004';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select is((app_public.owner_admin_approve_claim('58200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-a')->>'claimId'),'58200000-0000-4000-8000-000000000004','recorded Owner approval replay survives a later intake-root change');
reset role;
select ok((select c.version=b.claim_version
  and (select version from app_private.role_grants where subject_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active')=b.role_grant_version
  and (select version from partner_private.store_partner_grants where auth_user_id=c.claimant_id and store_id=c.store_id and role='store_owner' and state='active')=b.partner_grant_version
  and (select count(*) from partner_private.claim_events where claim_id=c.claim_id)=b.event_count
  and (select count(*) from partner_private.claim_command_receipts where idempotency_key='582-review-owner-a')=b.claim_receipt_count
  and (select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-review-owner-a')=b.owner_receipt_count
  and (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id=c.claim_id and action in ('partner_claim_approve','owner_claim_approved'))=b.audit_count
 from partner_private.listing_claims c cross join owner_replay_before582 b where c.claim_id='58200000-0000-4000-8000-000000000004'),
 'Owner replay after root change preserves claim/grant versions and writes no duplicate events, receipts, or audits');
update partner_private.store_owner_intake_roots r
 set active_kind=prior.active_kind,active_id=prior.active_id,version=r.version+1,updated_at=statement_timestamp()
 from owner_root_before_replay582 prior where r.applicant_id=prior.applicant_id;
select ok((select r.active_kind=prior.active_kind and r.active_id is not distinct from prior.active_id and r.version>prior.version
 from partner_private.store_owner_intake_roots r join owner_root_before_replay582 prior using(applicant_id)),
 'replay fixture restores the original root pair and keeps its version monotonic');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.owner_admin_approve_claim(null,null,null,'582-direct-owner-null')$$,'22023',null,'direct Owner RPC rejects null claim and scope inputs');
reset role;
select is((select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-direct-owner-null'),0::bigint,'null claim denial writes no Owner approval receipt');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-direct-owner-null'),0::bigint,'null claim denial writes no claim command receipt');
select is((select count(*) from admin_private.admin_command_receipts where idempotency_key='582-direct-owner-null'),0::bigint,'null claim denial writes no Admin command receipt');

select pg_temp.seed_claim582('58200000-0000-4000-8000-000000000008','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000008');
insert into review_cases582 select '58200000-0000-4000-8000-000000000008',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-000000000008' and case_type='listing_claim';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-000000000008';
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000008'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-000000000008'),'582-review-owner-b')->>'state'),'approved','same invitation-backed Owner receives only the separately approved Store B scope');
reset role;

-- A synthetic invitation classifies Owner intent before identity eligibility is checked.
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000c','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');
insert into review_cases582 select '58200000-0000-4000-8000-00000000000c',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-00000000000c' and case_type='listing_claim';
update partner_private.pending_partner_identities set state='auth_pending',bound_at=null
 where auth_user_id='76000000-0000-4000-8000-000000000001';
insert into claim_versions582 select claim_id,version from partner_private.listing_claims
 where claim_id='58200000-0000-4000-8000-00000000000c'
 on conflict(claim_id) do update set version=excluded.version;
create temporary table owner_intent_before582 as
 select c.claim_id,c.claimant_id,c.store_id,c.state,c.version,
   (select count(*) from partner_private.listing_claims same_scope where same_scope.claimant_id=c.claimant_id and same_scope.store_id=c.store_id) as claim_count,
   (select count(*) from partner_private.claim_events e where e.claim_id=c.claim_id) as event_count,
   (select count(*) from app_private.role_grants g where g.subject_user_id=c.claimant_id and g.store_id=c.store_id and g.role in ('representative','store_owner') and g.state='active') as role_grant_count,
   (select count(*) from partner_private.store_partner_grants g where g.auth_user_id=c.claimant_id and g.store_id=c.store_id and g.state='active') as partner_grant_count,
   (select count(*) from app_private.privileged_audit_events a where a.resource_kind='listing_claim' and a.resource_id=c.claim_id) as audit_count
 from partner_private.listing_claims c where c.claim_id='58200000-0000-4000-8000-00000000000c';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.partner_admin_claim_command('approve','58200000-0000-4000-8000-00000000000c',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-generic-owner-approve','owner_authority_verified',null)$$,'42501',null,'generic Representative approval rejects unbound exact Owner intent');
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000c';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-review-owner-invalid-identity')$$,'42501','admin_unavailable','Owner-intake claim with unbound synthetic identity fails closed before Representative approval');
reset role;
select ok((select c.state=b.state and c.version=b.version from partner_private.listing_claims c cross join owner_intent_before582 b where c.claim_id=b.claim_id),'generic Owner-intent denial leaves claim state and version unchanged');
select is((select count(*) from partner_private.listing_claims c cross join owner_intent_before582 b where c.claimant_id=b.claimant_id and c.store_id=b.store_id),(select claim_count from owner_intent_before582),'generic Owner-intent denial creates no claim');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-00000000000c'),(select event_count from owner_intent_before582),'generic Owner-intent denial writes no claim event');
select is((select count(*) from app_private.role_grants g join partner_private.listing_claims c on c.claimant_id=g.subject_user_id and c.store_id=g.store_id where c.claim_id='58200000-0000-4000-8000-00000000000c' and g.role in ('representative','store_owner') and g.state='active'),(select role_grant_count from owner_intent_before582),'generic Owner-intent denial grants no authority');
select is((select count(*) from partner_private.store_partner_grants g join partner_private.listing_claims c on c.claimant_id=g.auth_user_id and c.store_id=g.store_id where c.claim_id='58200000-0000-4000-8000-00000000000c' and g.state='active'),(select partner_grant_count from owner_intent_before582),'generic Owner-intent denial creates no partner scope');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-generic-owner-approve'),0::bigint,'generic Owner-intent denial writes no claim command receipt');
select is((select count(*) from admin_private.admin_command_receipts where idempotency_key in ('582-generic-owner-approve','582-review-owner-invalid-identity')),0::bigint,'Owner-intent denial writes no Admin command receipt');
select is((select count(*) from app_private.privileged_audit_events a where a.resource_kind='listing_claim' and a.resource_id='58200000-0000-4000-8000-00000000000c'),(select audit_count from owner_intent_before582),'generic Owner-intent denial writes no audit event');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000c'),0::bigint,'generic Owner-intent denial creates no Owner approval marker');
update partner_private.pending_partner_identities set state='bound',bound_at=statement_timestamp()
 where auth_user_id='76000000-0000-4000-8000-000000000001';
select is((select count(*) from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and role='representative' and store_id='00000000-0000-4000-8000-000000000007' and state='active'),0::bigint,'ineligible Owner-intake claim creates no Representative grant');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000c'),0::bigint,'ineligible Owner-intake claim creates no Owner approval marker');

select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000d','58200000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000007');
insert into review_cases582 select '58200000-0000-4000-8000-00000000000d',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-00000000000d' and case_type='listing_claim';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000d';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000d'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000d'),'582-review-owner-self')$$,'42501',null,'Admin cannot self-approve an Owner-intake claim through the review wrapper');
reset role;
select is((select count(*) from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000001' and role in ('representative','store_owner') and store_id='00000000-0000-4000-8000-000000000007' and state='active'),0::bigint,'self-approval denial creates no store authority');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000d'),0::bigint,'self-approval denial creates no Owner approval marker');

-- Probe direct Owner rejection with an unrelated synthetic root, then restore the public Representative fixture.
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000007');
insert into review_cases582 select '58200000-0000-4000-8000-00000000000b',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-00000000000b' and case_type='listing_claim';
create temporary table representative_root_before_owner_probe582 as
 select applicant_id,active_kind,active_id,version from partner_private.store_owner_intake_roots
 where applicant_id='58200000-0000-4000-8000-000000000012';
select ok((select active_kind='claim' and active_id='58200000-0000-4000-8000-00000000000b' from representative_root_before_owner_probe582),'public claim starts with a valid exact active root');
update partner_private.partner_invitations set synthetic=true where invitation_id='58200000-0000-4000-8000-000000000014';
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000f','58200000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000008');
select ok(exists(select 1 from partner_private.store_owner_intake_roots r join partner_private.listing_claims c on c.claim_id=r.active_id
 where r.applicant_id='58200000-0000-4000-8000-000000000012' and r.active_kind='claim' and r.active_id='58200000-0000-4000-8000-00000000000f'
 and c.claimant_id=r.applicant_id and c.store_id='00000000-0000-4000-8000-000000000008' and c.state='verification_pending'),'synthetic invitation probe uses another real pending claim for the same claimant');
insert into claim_versions582
 select claim_id,version from partner_private.listing_claims
 where claim_id='58200000-0000-4000-8000-00000000000b'
 on conflict(claim_id) do update set version=excluded.version;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000b';
select throws_ok($$select app_public.owner_admin_approve_claim('58200000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000007',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-direct-owner-wrong-root')$$,'42501',null,'direct Owner RPC rejects a Representative claim with an unrelated bound synthetic invitation');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000b'),'verification_pending','direct Owner RPC rejection leaves claim pending');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000b'),0::bigint,'direct Owner RPC rejection creates no Owner approval marker');
select is((select count(*) from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000007' and role in ('representative','store_owner') and state='active'),0::bigint,'direct Owner RPC rejection creates no scope grant');
select is((select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-direct-owner-wrong-root'),0::bigint,'wrong-root denial writes no Owner approval receipt');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-direct-owner-wrong-root'),0::bigint,'wrong-root denial writes no claim command receipt');
select is((select count(*) from admin_private.admin_command_receipts where idempotency_key='582-direct-owner-wrong-root'),0::bigint,'wrong-root denial writes no Admin command receipt');
select is((select count(*) from app_private.privileged_audit_events where action='owner_claim_approved' and resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-00000000000b'),0::bigint,'wrong-root denial writes no Owner approval audit event');
update partner_private.partner_invitations set synthetic=false where invitation_id='58200000-0000-4000-8000-000000000014';
update partner_private.store_owner_intake_roots r
 set active_kind=prior.active_kind,active_id=prior.active_id,version=r.version+1,updated_at=statement_timestamp()
 from representative_root_before_owner_probe582 prior where r.applicant_id=prior.applicant_id;
select ok((select r.active_kind=prior.active_kind and r.active_id is not distinct from prior.active_id and r.version>prior.version
 from partner_private.store_owner_intake_roots r join representative_root_before_owner_probe582 prior using(applicant_id)),
 'Representative fixture restores the original root pair and keeps its version monotonic');
select is((select synthetic from partner_private.partner_invitations where invitation_id='58200000-0000-4000-8000-000000000014'),false,'Representative fixture restores its original non-synthetic invitation');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'approve','Representative authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-review-owner-a')$$,'22023',null,'Owner receipt cannot replay as a Representative decision');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'approve','Representative authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-review-rep-c')->>'state'),'approved','public listing claim retains Representative decision path');
-- The preserved Admin base appends '-claim'; this direct call replays that exact command receipt after approval clears the intake root.
select is((app_public.partner_admin_claim_command('approve','58200000-0000-4000-8000-00000000000b',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-review-rep-c-claim','administrator_decision',null)->>'ownerIntent')::boolean,false,'public Representative generic replay returns a boolean false Owner-intent DTO');
reset role;
select is((select count(*) from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and role='representative' and store_id='00000000-0000-4000-8000-000000000007' and state='active'),1::bigint,'Representative approval creates no Owner authority');
select is((select count(*) from partner_private.store_partner_grants where auth_user_id='58200000-0000-4000-8000-000000000012' and role='representative' and store_id='00000000-0000-4000-8000-000000000007' and state='active'),1::bigint,'Representative approval retains one Representative partner scope');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000b'),0::bigint,'Representative claim has no Owner approval marker');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-review-rep-c-claim' and operation='approve'),1::bigint,'Representative generic approval replay keeps one command receipt');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-00000000000b' and idempotency_key='582-review-rep-c-claim'),1::bigint,'Representative generic approval replay keeps one claim event');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-00000000000b' and action='partner_claim_approve'),1::bigint,'Representative generic approval replay writes one generic approval audit');

create temporary table rep_transfer_before582 as
 select c.state,c.version as claim_version,
   (select version from app_private.role_grants where subject_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active') as role_grant_version,
   (select version from partner_private.store_partner_grants where auth_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active') as partner_grant_version,
   (select count(*) from partner_private.claim_events where claim_id in ('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-00000000000c')) as event_count,
   (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id in ('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-00000000000c') and action like 'partner_claim_%') as audit_count
 from partner_private.listing_claims c where c.claim_id='58200000-0000-4000-8000-00000000000b';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.partner_admin_claim_command('transfer','58200000-0000-4000-8000-00000000000c',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-generic-owner-transfer','verified_authority_transfer','58200000-0000-4000-8000-00000000000b')$$,'42501',null,'generic transfer rejects exact Owner-intent target before source revocation');
reset role;
select ok((select c.state=b.state and c.version=b.claim_version from partner_private.listing_claims c cross join rep_transfer_before582 b where c.claim_id='58200000-0000-4000-8000-00000000000b'),'Owner-intent transfer denial leaves the Representative source claim unchanged');
select is((select version from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000007' and role='representative' and state='active'),(select role_grant_version from rep_transfer_before582),'Owner-intent transfer denial leaves the Representative role grant unchanged');
select is((select version from partner_private.store_partner_grants where auth_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000007' and role='representative' and state='active'),(select partner_grant_version from rep_transfer_before582),'Owner-intent transfer denial leaves the Representative partner grant unchanged');
select is((select count(*) from partner_private.claim_events where claim_id in ('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-00000000000c')),(select event_count from rep_transfer_before582),'Owner-intent transfer denial writes no claim event');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-generic-owner-transfer'),0::bigint,'Owner-intent transfer denial writes no command receipt');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id in ('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-00000000000c') and action like 'partner_claim_%'),(select audit_count from rep_transfer_before582),'Owner-intent transfer denial writes no claim audit');

-- Reuse the already-denied Owner-intake claim; active claimant/store pairs are unique.
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000c';
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'reject','authority not verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-review-reject-c')->>'state'),'rejected','Owner request rejection uses existing claim lifecycle without granting Owner access');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000c'),'rejected','rejected Owner-intake claim uses the existing claim lifecycle');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000c'),0::bigint,'rejected Owner request has no Owner approval marker');

create temporary table owner_versions582 as
 select claim_id,version from partner_private.listing_claims where claim_id in
 ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000008');
grant select on owner_versions582 to authenticated;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select is(jsonb_array_length(app_public.admin_list_owner_access()),2,'Owner list includes only approved Owner claims');
select ok(exists(select 1 from jsonb_array_elements(app_public.admin_list_owner_access()) r where r->>'claimId'='58200000-0000-4000-8000-000000000004' and r->>'ownerUserId'='76000000-0000-4000-8000-000000000001' and r->>'storeId'='00000000-0000-4000-8000-000000000009' and r->>'accessState'='active' and jsonb_typeof(r->'history')='array'),'Owner list binds exact claim, account, store and minimized history');
select ok(not exists(select 1 from jsonb_array_elements(app_public.admin_list_owner_access()) r where r ?| array['shopperActivity','privateNotes','savedStores','authorityStatement','evidence']),'Owner list omits Shopper-private data and raw authority evidence');
select is(jsonb_array_length(app_public.admin_list_store_scopes()),2,'Representative list includes the approved public claim and remains Representative-only');
select ok(exists(select 1 from jsonb_array_elements(app_public.admin_list_store_scopes()) r where r->>'subjectUserId'='58200000-0000-4000-8000-000000000012' and r->>'storeId'='00000000-0000-4000-8000-000000000007' and r->>'state'='active'),'public claim appears as the exact Representative store scope');
select ok(not exists(select 1 from jsonb_array_elements(app_public.admin_list_store_scopes()) r where r->>'subjectUserId'='76000000-0000-4000-8000-000000000001' and r->>'storeId' in ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000008')),'Owner grants never appear in Representative list');
select pg_temp.actor582('76000000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000011');
select throws_ok('select app_public.admin_list_owner_access()','42501',null,'Owner cannot read Site Admin access list');
select throws_ok($$select app_public.owner_admin_approve_claim('58200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-owner-self-approve')$$,'42501',null,'Owner cannot self-approve');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003','aal1');
select throws_ok('select app_public.admin_list_owner_access()','42501',null,'Admin without MFA assurance cannot list Owner scopes');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
select throws_ok($$select app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-000000000004',(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'))$$,'40001',null,'stale Owner claim version denies preview');
select throws_ok($$select app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-00000000000b',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000b'))$$,'42501',null,'Representative claim cannot enter Owner revoke path');
insert into previews582 select 'a',app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'));
insert into previews582 select 'b',app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-000000000008',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000008'));
select is((select data->>'storeId' from previews582 where kind='a'),'00000000-0000-4000-8000-000000000009','preview resolves Store A from exact Owner claim');
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-cross-preview',(select (data->>'previewId')::uuid from previews582 where kind='b'))$$,'42501',null,'Store B preview cannot revoke Store A');
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'invalid reason','582-owner-invalid-reason',(select (data->>'previewId')::uuid from previews582 where kind='a'))$$,'22023',null,'invalid reason code denies revoke');
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-stale-claim-version',(select (data->>'previewId')::uuid from previews582 where kind='a'))$$,'40001',null,'stale Owner claim version denies commit without consuming the valid preview');
reset role;

update admin_private.admin_scope_previews set expires_at=created_at+interval '1 second'
 where preview_id=(select (data->>'previewId')::uuid from previews582 where kind='b');
select pg_sleep(1.1);
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000008',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000008'),'administrator_revoked','582-owner-expired-preview',(select (data->>'previewId')::uuid from previews582 where kind='b'))$$,'42501',null,'expired preview denies Store B revoke');
reset role;

-- A changed grant version invalidates the prior preview; Store B remains active.
update partner_private.store_partner_grants set version=version+1
 where auth_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000008' and role='store_owner' and state='active';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
insert into previews582 select 'b-stale',app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-000000000008',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000008'));
reset role;
update partner_private.store_partner_grants set version=version+1
 where auth_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000008' and role='store_owner' and state='active';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000008',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000008'),'administrator_revoked','582-owner-stale-grant',(select (data->>'previewId')::uuid from previews582 where kind='b-stale'))$$,'40001',null,'stale Owner grant version denies revoke');
insert into revoke_result582 select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'));
select is((select data->>'accessState' from revoke_result582),'revoked','Admin revokes only exact Store A Owner claim');
select is((select (data->>'claimVersion')::bigint from revoke_result582),(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'Owner claim version increments once on revoke');
select is((app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))->>'accessState'),'revoked','same-key replay returns stored result before consumed-preview rejection');
select is(((app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))->>'claimVersion')::bigint),(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'same-key revoke replay preserves one-time claim version result');
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'different_reason','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))$$,'22023',null,'changed replay input is rejected');
reset role;
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'stored Owner claim version increments once on revoke');
select is((select count(*) from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and role='store_owner' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),0::bigint,'Store A Owner role is revoked');
select is((select count(*) from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and role='store_owner' and store_id='00000000-0000-4000-8000-000000000008' and state='active'),1::bigint,'Store B Owner grant remains independently active');
select ok(exists(select 1 from admin_private.admin_scope_actions a where a.decided_by='58200000-0000-4000-8000-000000000001' and a.subject_user_id='76000000-0000-4000-8000-000000000001' and a.store_id='00000000-0000-4000-8000-000000000009' and a.role='store_owner' and a.action='revoke' and a.reason_code='administrator_revoked' and a.outcome='completed'),'Admin scope audit records actual actor, Owner, exact store, action and reason');
select ok(exists(select 1 from app_private.privileged_audit_events e where e.actor_user_id='58200000-0000-4000-8000-000000000001' and e.actor_role='administrator' and e.action='partner_claim_revoke' and e.outcome='completed' and e.resource_kind='listing_claim' and e.resource_id='58200000-0000-4000-8000-000000000004' and e.reason_code='administrator_revoked'),'claim lifecycle retains its exact Owner revoke audit');
select is((select count(*) from shopper_private.saved_stores where user_id='58200000-0000-4000-8000-000000000010'),1::bigint,'Owner scope changes leave Shopper-private data unchanged');

select pg_temp.actor582('76000000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000011');
set local role authenticated;
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select throws_ok($$select app_public.owner_select_store('00000000-0000-4000-8000-000000000009')$$,'42501',null,'same Owner session cannot select revoked Store A');
select lives_ok($$select app_public.owner_select_store('00000000-0000-4000-8000-000000000008')$$,'same Owner session retains separately approved Store B');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000008"}',true);
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000008','Store B Owner service remains available');
reset role;

-- A durable Owner claim stays out of generic transfer after its root is cleared.
-- The Representative source and target use separate bound public identities.
select pg_temp.seed_claim582('58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000009');
select pg_temp.seed_claim582('58200000-0000-4000-8000-000000000041','58200000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000009');
insert into claim_versions582 select claim_id,version from partner_private.listing_claims
 where claim_id in ('58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')
 on conflict(claim_id) do update set version=excluded.version;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select is((app_public.partner_admin_claim_command('approve','58200000-0000-4000-8000-000000000040',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-000000000040'),'582-rep-transfer-source-approve','verified_authority_review',null)->>'state'),'approved','public Representative source can be approved after the prior Owner scope is revoked');
reset role;
insert into claim_versions582 select claim_id,version from partner_private.listing_claims
 where claim_id in ('58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')
 on conflict(claim_id) do update set version=excluded.version;
create temporary table generic_owner_transfer_before582 as
 select
  (select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004') as owner_state,
  (select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004') as owner_version,
  (select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000040') as rep_source_state,
  (select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000040') as rep_source_version,
  (select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041') as rep_target_state,
  (select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041') as rep_target_version,
  (select count(*) from partner_private.claim_events where claim_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')) as event_count,
  (select count(*) from partner_private.claim_command_receipts where claim_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')) as receipt_count,
  (select count(*) from app_private.privileged_audit_events where resource_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041') and action like 'partner_claim_%') as audit_count,
  (select count(*) from partner_private.partner_access_revocations where store_id='00000000-0000-4000-8000-000000000009') as access_revocation_count,
  (select count(*) from partner_private.store_partner_grants where store_id='00000000-0000-4000-8000-000000000009' and state='active') as active_partner_grants,
  (select count(*) from app_private.role_grants where store_id='00000000-0000-4000-8000-000000000009' and role='representative' and state='active') as active_rep_role_grants,
  (select count(*) from partner_private.store_partnerships where store_id='00000000-0000-4000-8000-000000000009' and state='active') as active_partnerships,
  (select version from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and role='representative' and state='active') as source_role_version,
  (select version from partner_private.store_partner_grants where auth_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and state='active') as source_partner_version,
  (select version from partner_private.store_partnerships where auth_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and state='active') as source_partnership_version;
grant select on generic_owner_transfer_before582 to authenticated;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.partner_admin_claim_command('transfer','58200000-0000-4000-8000-000000000004',(select owner_version from generic_owner_transfer_before582),'582-owner-target-transfer-guard','verified_authority_transfer','58200000-0000-4000-8000-000000000040')$$,'42501','partner_admin_owner_path_required','durable Owner claim cannot be a generic transfer target after its intake root clears');
select throws_ok($$select app_public.partner_admin_claim_command('transfer','58200000-0000-4000-8000-000000000041',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-000000000041'),'582-owner-source-transfer-guard','verified_authority_transfer','58200000-0000-4000-8000-000000000004')$$,'42501','partner_admin_owner_path_required','durable Owner claim cannot be a generic transfer source after its intake root clears');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),(select owner_state from generic_owner_transfer_before582),'Owner transfer-target denial preserves Owner claim state');
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),(select owner_version from generic_owner_transfer_before582),'Owner transfer-target denial preserves Owner claim version');
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000040'),(select rep_source_state from generic_owner_transfer_before582),'Owner transfer denials preserve Representative source state');
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000040'),(select rep_source_version from generic_owner_transfer_before582),'Owner transfer denials preserve Representative source version');
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041'),(select rep_target_state from generic_owner_transfer_before582),'Owner transfer denials preserve Representative target state');
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041'),(select rep_target_version from generic_owner_transfer_before582),'Owner transfer denials preserve Representative target version');
select is((select count(*) from partner_private.claim_events where claim_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')),(select event_count from generic_owner_transfer_before582),'Owner transfer denials write no claim events');
select is((select count(*) from partner_private.claim_command_receipts where claim_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041')),(select receipt_count from generic_owner_transfer_before582),'Owner transfer denials write no claim receipts');
select is((select count(*) from app_private.privileged_audit_events where resource_id in ('58200000-0000-4000-8000-000000000004','58200000-0000-4000-8000-000000000040','58200000-0000-4000-8000-000000000041') and action like 'partner_claim_%'),(select audit_count from generic_owner_transfer_before582),'Owner transfer denials write no claim audit');
select is((select count(*) from partner_private.partner_access_revocations where store_id='00000000-0000-4000-8000-000000000009'),(select access_revocation_count from generic_owner_transfer_before582),'Owner transfer denials write no scope revocations');
select is((select count(*) from partner_private.store_partner_grants where store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select active_partner_grants from generic_owner_transfer_before582),'Owner transfer denials preserve active partner grants');
select is((select count(*) from app_private.role_grants where store_id='00000000-0000-4000-8000-000000000009' and role='representative' and state='active'),(select active_rep_role_grants from generic_owner_transfer_before582),'Owner transfer denials preserve active Representative roles');
select is((select count(*) from partner_private.store_partnerships where store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select active_partnerships from generic_owner_transfer_before582),'Owner transfer denials preserve active partnerships');
select is((select version from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and role='representative' and state='active'),(select source_role_version from generic_owner_transfer_before582),'Owner transfer denials preserve source role-grant version');
select is((select version from partner_private.store_partner_grants where auth_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select source_partner_version from generic_owner_transfer_before582),'Owner transfer denials preserve source partner-grant version');
select is((select version from partner_private.store_partnerships where auth_user_id='58200000-0000-4000-8000-000000000012' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select source_partnership_version from generic_owner_transfer_before582),'Owner transfer denials preserve source partnership version');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key in ('582-owner-target-transfer-guard','582-owner-source-transfer-guard')),0::bigint,'Owner transfer denials write no idempotency receipts');

-- Representative transfer/revoke and exact receipt replay remain available.
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select is((app_public.partner_admin_claim_command('transfer','58200000-0000-4000-8000-000000000041',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-000000000041'),'582-rep-transfer-valid','verified_authority_transfer','58200000-0000-4000-8000-000000000040')->>'state'),'approved','Representative transfer succeeds after Owner-boundary denials');
select is((app_public.partner_admin_claim_command('transfer','58200000-0000-4000-8000-000000000041',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-000000000041'),'582-rep-transfer-valid','verified_authority_transfer','58200000-0000-4000-8000-000000000040')->>'state'),'approved','exact Representative transfer receipt replay remains read-only and succeeds');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000040'),'revoked','Representative transfer revokes only its exact source claim');
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041'),'approved','Representative transfer approves only its exact target claim');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-rep-transfer-valid'),1::bigint,'Representative transfer replay retains one receipt');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-000000000041' and idempotency_key='582-rep-transfer-valid'),1::bigint,'Representative transfer replay retains one event');
select is((select count(*) from app_private.privileged_audit_events where resource_id='58200000-0000-4000-8000-000000000041' and action='partner_claim_transfer'),1::bigint,'Representative transfer replay retains one audit event');
create temporary table rep_revoke_version582 as select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000041';
grant select on rep_revoke_version582 to authenticated;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select is((app_public.partner_admin_claim_command('revoke','58200000-0000-4000-8000-000000000041',(select version from rep_revoke_version582),'582-rep-revoke-valid','administrator_revoked',null)->>'state'),'revoked','generic Representative revoke remains available');
select is((app_public.partner_admin_claim_command('revoke','58200000-0000-4000-8000-000000000041',(select version from rep_revoke_version582),'582-rep-revoke-valid','administrator_revoked',null)->>'state'),'revoked','exact Representative revoke receipt replay remains read-only and succeeds');
reset role;
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-rep-revoke-valid'),1::bigint,'Representative revoke replay retains one receipt');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-000000000041' and idempotency_key='582-rep-revoke-valid'),1::bigint,'Representative revoke replay retains one event');
select is((select count(*) from app_private.privileged_audit_events where resource_id='58200000-0000-4000-8000-000000000041' and action='partner_claim_revoke'),1::bigint,'Representative revoke replay retains one audit event');
select is((select count(*) from partner_private.store_partner_grants where store_id='00000000-0000-4000-8000-000000000009' and state='active'),0::bigint,'Representative revoke releases Store A before the separate Owner regrant');

-- Regrant is a fresh claim and approval, never reactivation of the revoked claim.
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000a','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
insert into review_cases582 select '58200000-0000-4000-8000-00000000000a',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-00000000000a' and case_type='listing_claim';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000a';
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000a'),'approve','Fresh authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000a'),'582-review-owner-a2')->>'state'),'approved','fresh exact Store A claim can be independently approved');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),'revoked','old revoked claim remains historical');
select isnt((select claim_id::text from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000a'),'58200000-0000-4000-8000-000000000004','fresh Owner approval has a new claim ID');
select is((select count(*) from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and role='store_owner' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),1::bigint,'fresh claim restores only exact Store A Owner scope');

-- Test the inactive-claim denial after the exact-root and identity gates, using a valid claim/id root pair.
update partner_private.store_owner_intake_roots set active_kind='claim',active_id='58200000-0000-4000-8000-00000000000c'
 where applicant_id='76000000-0000-4000-8000-000000000001';
insert into claim_versions582
 select claim_id,version from partner_private.listing_claims
 where claim_id='58200000-0000-4000-8000-00000000000c'
 on conflict(claim_id) do update set version=excluded.version;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.owner_admin_approve_claim('58200000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000007',(select version from claim_versions582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-direct-owner-inactive')$$,'42501',null,'direct Owner RPC rejects a rejected claim with the privacy-neutral approval denial');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000c'),'rejected','inactive Owner claim remains rejected');
select is((select count(*) from partner_private.owner_claim_approvals where idempotency_key='582-direct-owner-inactive'),0::bigint,'inactive claim denial writes no Owner approval receipt');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key='582-direct-owner-inactive'),0::bigint,'inactive claim denial writes no claim command receipt');
select is((select count(*) from admin_private.admin_command_receipts where idempotency_key='582-direct-owner-inactive'),0::bigint,'inactive claim denial writes no Admin command receipt');
select is((select count(*) from app_private.privileged_audit_events where action='owner_claim_approved' and resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-00000000000c'),0::bigint,'inactive claim denial writes no Owner approval audit event');
select is((select count(*) from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000007' and role in ('representative','store_owner') and state='active'),0::bigint,'inactive claim denial grants no Representative or Owner scope');

-- Durable Owner markers guard generic revoke/recheck after the intake root clears.
update partner_private.store_owner_intake_roots set active_kind='none',active_id=null,version=version+1,updated_at=statement_timestamp()
 where applicant_id='76000000-0000-4000-8000-000000000001';
select ok(exists(select 1 from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000a' and store_id='00000000-0000-4000-8000-000000000009'),'fresh Owner claim retains its durable approval marker');
select ok(exists(select 1 from partner_private.store_owner_intake_roots where applicant_id='76000000-0000-4000-8000-000000000001' and active_kind='none' and active_id is null),'Owner intake root is cleared before generic command probes');
create temporary table generic_owner_command_before582 as
 select c.state,c.version,
  (select version from app_private.role_grants where subject_user_id=c.claimant_id and role='store_owner' and store_id=c.store_id and state='active') as role_version,
  (select version from partner_private.store_partner_grants where auth_user_id=c.claimant_id and role='store_owner' and store_id=c.store_id and state='active') as partner_grant_version,
  (select version from partner_private.store_partnerships where auth_user_id=c.claimant_id and store_id=c.store_id and state='active') as partnership_version,
  (select count(*) from partner_private.claim_events where claim_id=c.claim_id) as event_count,
  (select count(*) from partner_private.claim_command_receipts where claim_id=c.claim_id) as receipt_count,
  (select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id=c.claim_id) as audit_count,
  (select count(*) from partner_private.partner_access_revocations where auth_user_id=c.claimant_id and store_id=c.store_id) as access_revocation_count
 from partner_private.listing_claims c where c.claim_id='58200000-0000-4000-8000-00000000000a';
grant select on generic_owner_command_before582 to authenticated;
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok($$select app_public.partner_admin_claim_command('revoke','58200000-0000-4000-8000-00000000000a',(select version from generic_owner_command_before582),'582-generic-owner-revoke-guard','administrator_revoked',null)$$,'42501','partner_admin_owner_path_required','generic revoke cannot bypass the dedicated Owner scope path after root clearing');
select throws_ok($$select app_public.partner_admin_claim_command('recheck','58200000-0000-4000-8000-00000000000a',(select version from generic_owner_command_before582),'582-generic-owner-recheck-guard','verified_authority_refresh',null)$$,'42501','partner_admin_owner_path_required','generic recheck cannot mutate the approved Owner scope after root clearing');
reset role;
select is((select state from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000a'),(select state from generic_owner_command_before582),'generic Owner denials preserve claim state');
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000a'),(select version from generic_owner_command_before582),'generic Owner denials preserve claim version');
select is((select version from app_private.role_grants where subject_user_id='76000000-0000-4000-8000-000000000001' and role='store_owner' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select role_version from generic_owner_command_before582),'generic Owner denials preserve Owner role-grant version');
select is((select version from partner_private.store_partner_grants where auth_user_id='76000000-0000-4000-8000-000000000001' and role='store_owner' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select partner_grant_version from generic_owner_command_before582),'generic Owner denials preserve Owner partner-grant version');
select is((select version from partner_private.store_partnerships where auth_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000009' and state='active'),(select partnership_version from generic_owner_command_before582),'generic Owner denials preserve Owner partnership version');
select is((select count(*) from partner_private.claim_events where claim_id='58200000-0000-4000-8000-00000000000a'),(select event_count from generic_owner_command_before582),'generic Owner denials write no claim event');
select is((select count(*) from partner_private.claim_command_receipts where claim_id='58200000-0000-4000-8000-00000000000a'),(select receipt_count from generic_owner_command_before582),'generic Owner denials write no claim receipt');
select is((select count(*) from app_private.privileged_audit_events where resource_kind='listing_claim' and resource_id='58200000-0000-4000-8000-00000000000a'),(select audit_count from generic_owner_command_before582),'generic Owner denials write no privileged audit');
select is((select count(*) from partner_private.partner_access_revocations where auth_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000009'),(select access_revocation_count from generic_owner_command_before582),'generic Owner denials write no scope-revocation records');
select is((select count(*) from partner_private.claim_command_receipts where idempotency_key in ('582-generic-owner-revoke-guard','582-generic-owner-recheck-guard')),0::bigint,'generic Owner denials write no idempotency receipts');
select is((select count(*) from admin_private.admin_command_receipts where idempotency_key in ('582-generic-owner-revoke-guard','582-generic-owner-recheck-guard')),0::bigint,'generic Owner denials write no Admin command receipts');

select * from finish();
rollback;
