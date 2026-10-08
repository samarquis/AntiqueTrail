-- #323/#582: run-owned fictional Administrator, Representative and Owner scopes.
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience) values
  ('__OWNER_DESKTOP_STORE_A__','scope-owner-desktop-a','Owner Clockwork','Topeka','KS','103 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic Owner store','Fixture only',true,'synthetic'),
  ('__OWNER_DESKTOP_STORE_B__','scope-owner-desktop-b','Owner Prairie','Topeka','KS','104 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic Owner store','Fixture only',true,'synthetic'),
  ('__OWNER_PHONE_STORE_A__','scope-owner-phone-a','Owner Walnut','Topeka','KS','105 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic Owner store','Fixture only',true,'synthetic'),
  ('__OWNER_PHONE_STORE_B__','scope-owner-phone-b','Owner Maple','Topeka','KS','106 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic Owner store','Fixture only',true,'synthetic')
on conflict (id) do update set synthetic=true,audience='synthetic';

insert into app_private.profiles(user_id,public_display_name,age_18_attested_at) values
  ('__ADMIN__','Scope Administrator',statement_timestamp()),('__SUBJECT__','Clockwork Scope Subject',statement_timestamp()),('__SIBLING__','Prairie Scope Subject',statement_timestamp()),('__SHOPPER__','Scope Shopper',statement_timestamp()),
  ('__OWNER_DESKTOP__','Desktop Store Owner',statement_timestamp()),('__OWNER_PHONE__','Phone Store Owner',statement_timestamp())
on conflict (user_id) do update set public_display_name=excluded.public_display_name,age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
  ('__ADMIN__','administrator','active'),('__PHONE_ADMIN__','administrator','active'),('__SHOPPER__','shopper','active');
insert into shopper_private.saved_stores(user_id,store_id)
values ('__SHOPPER__','00000000-0000-4000-8000-000000001001');
insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at)
values
  ('__INVITE_A__',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'__ADMIN__','consumed',statement_timestamp()),
  ('__INVITE_B__',decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),'__ADMIN__','consumed',statement_timestamp());
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
values
  ('__PENDING_A__','__INVITE_A__',decode(repeat('02',32),'hex'),'__SUBJECT__','bound',statement_timestamp(),statement_timestamp(),statement_timestamp()),
  ('__PENDING_B__','__INVITE_B__',decode(repeat('04',32),'hex'),'__SIBLING__','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
values
  ('__CONSENT_A__','__INVITE_A__','__PENDING_A__','synthetic-v3','Scope Subject','Owner','Clockwork Cabinet',decode(repeat('02',32),'hex'),true,true,true,true,true,'scope-consent-a'),
  ('__CONSENT_B__','__INVITE_B__','__PENDING_B__','synthetic-v3','Sibling Subject','Owner','Prairie Patina',decode(repeat('04',32),'hex'),true,true,true,true,true,'scope-consent-b');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
values
  ('__RECEIPT_A__','__CONSENT_A__','__PENDING_A__','__INVITE_A__','__SUBJECT__',decode(repeat('02',32),'hex'),'synthetic-v3',decode(repeat('05',32),'hex')),
  ('__RECEIPT_B__','__CONSENT_B__','__PENDING_B__','__INVITE_B__','__SIBLING__',decode(repeat('04',32),'hex'),'synthetic-v3',decode(repeat('06',32),'hex'));
insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at,consent_policy_version)
values
  ('__PARTNERSHIP_A__','__PENDING_A__','__SUBJECT__','00000000-0000-4000-8000-000000001001','__RECEIPT_A__','active',statement_timestamp(),'synthetic-v3'),
  ('__PARTNERSHIP_B__','__PENDING_B__','__SIBLING__','00000000-0000-4000-8000-000000001002','__RECEIPT_B__','active',statement_timestamp(),'synthetic-v3');
insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id,consent_policy_version)
values
  ('__GRANT_A__','__PARTNERSHIP_A__','__SUBJECT__','00000000-0000-4000-8000-000000001001','synthetic-v3'),
  ('__GRANT_B__','__PARTNERSHIP_B__','__SIBLING__','00000000-0000-4000-8000-000000001002','synthetic-v3');
insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by)
values
  ('__SUBJECT__','representative','00000000-0000-4000-8000-000000001001','active','__ADMIN__'),
  ('__SIBLING__','representative','00000000-0000-4000-8000-000000001002','active','__ADMIN__');
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
values
  ('__CLAIM_A__','__SUBJECT__','00000000-0000-4000-8000-000000001001','store owner','I am authorized to represent this store.'),
  ('__CLAIM_B__','__SIBLING__','00000000-0000-4000-8000-000000001002','store owner','I am authorized to represent this store.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id)
values
  ('__CLAIM_A__','published_business_contact','domain_response','verified','__ADMIN__',statement_timestamp(),decode(repeat('11',32),'hex'),decode(repeat('12',32),'hex'),'__CLAIM_A__'),
  ('__CLAIM_A__','callback','callback','verified','__ADMIN__',statement_timestamp(),decode(repeat('13',32),'hex'),decode(repeat('14',32),'hex'),'__PENDING_A__'),
  ('__CLAIM_B__','published_business_contact','domain_response','verified','__ADMIN__',statement_timestamp(),decode(repeat('15',32),'hex'),decode(repeat('16',32),'hex'),'__CLAIM_B__'),
  ('__CLAIM_B__','callback','callback','verified','__ADMIN__',statement_timestamp(),decode(repeat('17',32),'hex'),decode(repeat('18',32),'hex'),'__PENDING_B__');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id in ('__CLAIM_A__','__CLAIM_B__');
update partner_private.listing_claims set state='verification_pending' where claim_id in ('__CLAIM_A__','__CLAIM_B__');
update partner_private.listing_claims set state='approved',assigned_admin_id='__ADMIN__',approved_by='__ADMIN__',approved_at=statement_timestamp() where claim_id in ('__CLAIM_A__','__CLAIM_B__');

insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at,expires_at)
values
  ('__OWNER_DESKTOP_INVITE__',decode(repeat('21',32),'hex'),decode(repeat('22',32),'hex'),'__ADMIN__','consumed',statement_timestamp(),true,'scope-owner-desktop-invite',statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('__OWNER_PHONE_INVITE__',decode(repeat('23',32),'hex'),decode(repeat('24',32),'hex'),'__ADMIN__','consumed',statement_timestamp(),true,'scope-owner-phone-invite',statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
values
  ('__OWNER_DESKTOP_PENDING__','__OWNER_DESKTOP_INVITE__',decode(repeat('22',32),'hex'),'__OWNER_DESKTOP__','bound',statement_timestamp(),statement_timestamp(),statement_timestamp()),
  ('__OWNER_PHONE_PENDING__','__OWNER_PHONE_INVITE__',decode(repeat('24',32),'hex'),'__OWNER_PHONE__','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
values
  ('__OWNER_DESKTOP_CONSENT__','__OWNER_DESKTOP_INVITE__','__OWNER_DESKTOP_PENDING__','synthetic-v3','Desktop Store Owner','Owner','Owner Clockwork',decode(repeat('22',32),'hex'),true,true,true,true,true,'scope-owner-desktop-consent'),
  ('__OWNER_PHONE_CONSENT__','__OWNER_PHONE_INVITE__','__OWNER_PHONE_PENDING__','synthetic-v3','Phone Store Owner','Owner','Owner Walnut',decode(repeat('24',32),'hex'),true,true,true,true,true,'scope-owner-phone-consent');
insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
values
  ('__OWNER_DESKTOP_RECEIPT__','__OWNER_DESKTOP_CONSENT__','__OWNER_DESKTOP_PENDING__','__OWNER_DESKTOP_INVITE__','__OWNER_DESKTOP__',decode(repeat('22',32),'hex'),'synthetic-v3',decode(repeat('25',32),'hex')),
  ('__OWNER_PHONE_RECEIPT__','__OWNER_PHONE_CONSENT__','__OWNER_PHONE_PENDING__','__OWNER_PHONE_INVITE__','__OWNER_PHONE__',decode(repeat('24',32),'hex'),'synthetic-v3',decode(repeat('26',32),'hex'));
insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at,consent_policy_version)
values
  ('__OWNER_DESKTOP_PARTNERSHIP_A__','__OWNER_DESKTOP_PENDING__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_A__','__OWNER_DESKTOP_RECEIPT__','active',statement_timestamp(),'synthetic-v3'),
  ('__OWNER_DESKTOP_PARTNERSHIP_B__','__OWNER_DESKTOP_PENDING__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_B__','__OWNER_DESKTOP_RECEIPT__','active',statement_timestamp(),'synthetic-v3'),
  ('__OWNER_PHONE_PARTNERSHIP_A__','__OWNER_PHONE_PENDING__','__OWNER_PHONE__','__OWNER_PHONE_STORE_A__','__OWNER_PHONE_RECEIPT__','active',statement_timestamp(),'synthetic-v3'),
  ('__OWNER_PHONE_PARTNERSHIP_B__','__OWNER_PHONE_PENDING__','__OWNER_PHONE__','__OWNER_PHONE_STORE_B__','__OWNER_PHONE_RECEIPT__','active',statement_timestamp(),'synthetic-v3');
insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id,consent_policy_version,role)
values
  ('__OWNER_DESKTOP_GRANT_A__','__OWNER_DESKTOP_PARTNERSHIP_A__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_A__','synthetic-v3','store_owner'),
  ('__OWNER_DESKTOP_GRANT_B__','__OWNER_DESKTOP_PARTNERSHIP_B__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_B__','synthetic-v3','store_owner'),
  ('__OWNER_PHONE_GRANT_A__','__OWNER_PHONE_PARTNERSHIP_A__','__OWNER_PHONE__','__OWNER_PHONE_STORE_A__','synthetic-v3','store_owner'),
  ('__OWNER_PHONE_GRANT_B__','__OWNER_PHONE_PARTNERSHIP_B__','__OWNER_PHONE__','__OWNER_PHONE_STORE_B__','synthetic-v3','store_owner');
insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by)
values
  ('__OWNER_DESKTOP__','store_owner','__OWNER_DESKTOP_STORE_A__','active','__ADMIN__'),
  ('__OWNER_DESKTOP__','store_owner','__OWNER_DESKTOP_STORE_B__','active','__ADMIN__'),
  ('__OWNER_PHONE__','store_owner','__OWNER_PHONE_STORE_A__','active','__PHONE_ADMIN__'),
  ('__OWNER_PHONE__','store_owner','__OWNER_PHONE_STORE_B__','active','__PHONE_ADMIN__');
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
values
  ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_A__','store owner','Synthetic exact-store Owner claim.'),
  ('__OWNER_DESKTOP_CLAIM_B__','__OWNER_DESKTOP__','__OWNER_DESKTOP_STORE_B__','store owner','Synthetic exact-store Owner claim.'),
  ('__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE__','__OWNER_PHONE_STORE_A__','store owner','Synthetic exact-store Owner claim.'),
  ('__OWNER_PHONE_CLAIM_B__','__OWNER_PHONE__','__OWNER_PHONE_STORE_B__','store owner','Synthetic exact-store Owner claim.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id)
values
  ('__OWNER_DESKTOP_CLAIM_A__','published_business_contact','domain_response','verified','__ADMIN__',statement_timestamp(),decode(repeat('31',32),'hex'),decode(repeat('32',32),'hex'),'__OWNER_DESKTOP_CLAIM_A__'),
  ('__OWNER_DESKTOP_CLAIM_A__','callback','callback','verified','__ADMIN__',statement_timestamp(),decode(repeat('33',32),'hex'),decode(repeat('34',32),'hex'),'__OWNER_DESKTOP_PARTNERSHIP_A__'),
  ('__OWNER_DESKTOP_CLAIM_B__','published_business_contact','domain_response','verified','__ADMIN__',statement_timestamp(),decode(repeat('35',32),'hex'),decode(repeat('36',32),'hex'),'__OWNER_DESKTOP_CLAIM_B__'),
  ('__OWNER_DESKTOP_CLAIM_B__','callback','callback','verified','__ADMIN__',statement_timestamp(),decode(repeat('37',32),'hex'),decode(repeat('38',32),'hex'),'__OWNER_DESKTOP_PARTNERSHIP_B__'),
  ('__OWNER_PHONE_CLAIM_A__','published_business_contact','domain_response','verified','__PHONE_ADMIN__',statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'__OWNER_PHONE_CLAIM_A__'),
  ('__OWNER_PHONE_CLAIM_A__','callback','callback','verified','__PHONE_ADMIN__',statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'__OWNER_PHONE_PARTNERSHIP_A__'),
  ('__OWNER_PHONE_CLAIM_B__','published_business_contact','domain_response','verified','__PHONE_ADMIN__',statement_timestamp(),decode(repeat('45',32),'hex'),decode(repeat('46',32),'hex'),'__OWNER_PHONE_CLAIM_B__'),
  ('__OWNER_PHONE_CLAIM_B__','callback','callback','verified','__PHONE_ADMIN__',statement_timestamp(),decode(repeat('47',32),'hex'),decode(repeat('48',32),'hex'),'__OWNER_PHONE_PARTNERSHIP_B__');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp()
where claim_id in ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP_CLAIM_B__','__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE_CLAIM_B__');
update partner_private.listing_claims set state='verification_pending'
where claim_id in ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP_CLAIM_B__','__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE_CLAIM_B__');
update partner_private.listing_claims set state='approved',assigned_admin_id='__ADMIN__',approved_by='__ADMIN__',approved_at=statement_timestamp()
where claim_id in ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP_CLAIM_B__','__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE_CLAIM_B__');
insert into partner_private.owner_claim_approvals(claim_id,store_id,approved_by,expected_version,idempotency_key)
select claim_id,store_id,approved_by,version,'configured-owner-'||claim_id::text
from partner_private.listing_claims where claim_id in
 ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP_CLAIM_B__','__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE_CLAIM_B__');
insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
select c.approved_by,'administrator','owner_claim_approved','completed','listing_claim',c.claim_id,'owner_boundary_confirmed',
  extensions.digest(convert_to(c.claim_id::text||'|'||c.store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex')
from partner_private.listing_claims c where c.claim_id in
 ('__OWNER_DESKTOP_CLAIM_A__','__OWNER_DESKTOP_CLAIM_B__','__OWNER_PHONE_CLAIM_A__','__OWNER_PHONE_CLAIM_B__');
