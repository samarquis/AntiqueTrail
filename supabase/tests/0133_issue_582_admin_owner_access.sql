-- #582 access-only pgTAP contract. Source only; execution waits for the #575 lane.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
update app_public.stores set synthetic=true,audience='synthetic' where id='00000000-0000-4000-8000-000000000009';
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience) values
 ('00000000-0000-4000-8000-000000000008','owner582-store-b','Owner Store B','Topeka','KS','8 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic'),
 ('00000000-0000-4000-8000-000000000007','owner582-store-c','Owner Store C','Topeka','KS','7 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic')
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
create temporary table previews582(kind text primary key,data jsonb not null);
grant select,insert on previews582 to authenticated;
create temporary table revoke_result582(data jsonb);
grant select,insert on revoke_result582 to authenticated;

select pg_temp.seed_claim582('58200000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
insert into review_cases582 select '58200000-0000-4000-8000-000000000004',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-000000000004' and case_type='listing_claim';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-000000000004';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version+1 from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-stale')$$,'40001',null,'stale Owner review-case version fails closed');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-a')->>'state'),'approved','invitation-backed Owner approval routes through owner_admin_approve_claim');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-review-owner-a')->>'state'),'approved','Owner approval replay returns its recorded result');
reset role;

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
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000c';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'approve','Owner authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000c'),'582-review-owner-invalid-identity')$$,'42501','admin_unavailable','Owner-intake claim with unbound synthetic identity fails closed before Representative approval');
reset role;
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

-- A bound non-synthetic invitation keeps public listing approval on the Representative path.
select pg_temp.seed_claim582('58200000-0000-4000-8000-00000000000b','58200000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000007');
insert into review_cases582 select '58200000-0000-4000-8000-00000000000b',case_id,null from admin_private.admin_review_cases where target_id='58200000-0000-4000-8000-00000000000b' and case_type='listing_claim';
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
set local role authenticated;
update review_cases582 r set version=(app_public.admin_get_review_case(r.case_id::text)->>'version')::bigint where r.claim_id='58200000-0000-4000-8000-00000000000b';
select throws_ok($$select app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'approve','Representative authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-review-owner-a')$$,'22023',null,'Owner receipt cannot replay as a Representative decision');
select is((app_public.admin_decide_review_case((select case_id::text from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'approve','Representative authority verified',(select version from review_cases582 where claim_id='58200000-0000-4000-8000-00000000000b'),'582-review-rep-c')->>'state'),'approved','public listing claim retains Representative decision path');
reset role;
select is((select count(*) from app_private.role_grants where subject_user_id='58200000-0000-4000-8000-000000000012' and role='representative' and store_id='00000000-0000-4000-8000-000000000007' and state='active'),1::bigint,'Representative approval creates no Owner authority');
select is((select count(*) from partner_private.owner_claim_approvals where claim_id='58200000-0000-4000-8000-00000000000b'),0::bigint,'Representative claim has no Owner approval marker');

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
select is(jsonb_array_length(app_public.admin_list_store_scopes()),2,'Representative list remains Representative-only');
select ok(not exists(select 1 from jsonb_array_elements(app_public.admin_list_store_scopes()) r where r->>'subjectUserId'='76000000-0000-4000-8000-000000000001' and r->>'storeId' in ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000008')),'Owner grants never appear in Representative list');
select pg_temp.actor582('76000000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000011');
select throws_ok('select app_public.admin_list_owner_access()','42501',null,'Owner cannot read Site Admin access list');
select throws_ok($$select app_public.owner_admin_approve_claim('58200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'582-owner-self-approve')$$,'42501',null,'Owner cannot self-approve');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003','aal1');
select throws_ok('select app_public.admin_list_owner_access()','42501',null,'Admin without MFA assurance cannot list Owner scopes');
select pg_temp.actor582('58200000-0000-4000-8000-000000000001','58200000-0000-4000-8000-000000000003');
select throws_ok($$select app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-000000000004',(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'))$$,'40001',null,'stale Owner claim version denies preview');
select throws_ok($$select app_public.admin_preview_owner_claim_revoke('58200000-0000-4000-8000-00000000000b',(select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-00000000000b'))$$,'42501',null,'Representative claim cannot enter Owner revoke path');
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
select is((select version from partner_private.listing_claims where claim_id='58200000-0000-4000-8000-000000000004'),(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'stored Owner claim version increments once on revoke');
select is((app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))->>'accessState'),'revoked','same-key replay returns stored result before consumed-preview rejection');
select is(((app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'administrator_revoked','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))->>'claimVersion')::bigint),(select version+1 from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'same-key revoke replay preserves one-time claim version result');
select throws_ok($$select app_public.admin_revoke_owner_claim('58200000-0000-4000-8000-000000000004',(select version from owner_versions582 where claim_id='58200000-0000-4000-8000-000000000004'),'different_reason','582-owner-revoke-a',(select (data->>'previewId')::uuid from previews582 where kind='a'))$$,'22023',null,'changed replay input is rejected');
reset role;
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
select * from finish();
rollback;
