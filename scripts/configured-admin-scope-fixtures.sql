-- #323: run-owned fictional Administrator scope subjects. Tokens are substituted only by the runner.
insert into app_private.profiles(user_id,public_display_name,age_18_attested_at) values
  ('__ADMIN__','Scope Administrator',statement_timestamp()),('__SUBJECT__','Clockwork Scope Subject',statement_timestamp()),('__SIBLING__','Prairie Scope Subject',statement_timestamp()),('__SHOPPER__','Scope Shopper',statement_timestamp())
on conflict (user_id) do update set public_display_name=excluded.public_display_name,age_18_attested_at=excluded.age_18_attested_at;
insert into app_private.role_grants(subject_user_id,role,state) values
  ('__ADMIN__','administrator','active'),('__SHOPPER__','shopper','active');
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
