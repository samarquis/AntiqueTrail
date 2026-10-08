-- #579: synthetic-only Owner, cancellation, Store A/B, and pending claim fixture.
-- The runner replaces each --...-- marker with generated local-only values.
begin;
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;

insert into app_public.stores(
  id,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name,
  synthetic,audience,publication_state
) values
  ('--STORE_A--','issue-579-clockwork-cabinet','Clockwork Cabinet','Topeka','KS','1 Synthetic Way',
   '00000000-0000-4000-8000-000000000001','A synthetic store for exact Owner listing proof.',
   'Baseline description before Owner confirmation.','785-555-0181','https://clockwork.example','America/Chicago',
   true,'synthetic','active'),
  ('--STORE_B--','issue-579-sibling-market','Sibling Market','Topeka','KS','2 Synthetic Way',
   '00000000-0000-4000-8000-000000000001','An unrelated synthetic store.',
   'This store is outside the Owner grant.','785-555-0182','https://sibling.example','America/Chicago',
   true,'synthetic','active');

insert into app_private.profiles(user_id,verified_email_snapshot,age_18_attested_at)
values
  ('--OWNER_A--','--OWNER_A_EMAIL--',statement_timestamp()),
  ('--OWNER_CANCEL--','--OWNER_CANCEL_EMAIL--',statement_timestamp()),
  ('--ADMIN--','--ADMIN_EMAIL--',statement_timestamp())
on conflict(user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  age_18_attested_at=coalesce(app_private.profiles.age_18_attested_at,excluded.age_18_attested_at);

insert into app_private.role_grants(subject_user_id,role,state) values
  ('--OWNER_A--','shopper','active'),
  ('--OWNER_CANCEL--','shopper','active'),
  ('--ADMIN--','administrator','active');

insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
values
  ('--STORE_A--','identity_location',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_A--','contact',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_A--','hours',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_A--','categories_attributes',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_B--','identity_location',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_B--','contact',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_B--','hours',statement_timestamp(),'Synthetic baseline','synthetic_fixture'),
  ('--STORE_B--','categories_attributes',statement_timestamp(),'Synthetic baseline','synthetic_fixture');

insert into app_public.store_category_assignments(store_id,category_id) values
  ('--STORE_A--','00000000-0000-4000-8000-000000000101'),
  ('--STORE_B--','00000000-0000-4000-8000-000000000101');

insert into app_public.store_weekly_hours(store_id,iso_weekday,interval_index,is_closed,opens_at,closes_at)
select store_id,weekday,1,weekday=7,case when weekday=7 then null else time '10:00' end,
  case when weekday=7 then null else time '16:00' end
from (values ('--STORE_A--'::uuid),('--STORE_B--'::uuid)) stores(store_id)
cross join generate_series(1,7) weekday;

insert into partner_private.partner_invitations(
  invitation_id,token_hash,recipient_email_hmac,created_by,state,synthetic,issuance_idempotency_key,raw_returned_at
) values
  ('--INVITE_A_ID--',decode('--INVITE_A_HASH--','hex'),decode('--OWNER_A_EMAIL_HMAC--','hex'),
   '--ADMIN--','active',true,'issue579-owner-a',statement_timestamp()),
  ('--INVITE_CANCEL_ID--',decode('--INVITE_CANCEL_HASH--','hex'),decode('--OWNER_CANCEL_EMAIL_HMAC--','hex'),
   '--ADMIN--','active',true,'issue579-owner-cancel',statement_timestamp());

-- Match the existing configured Owner billing fixture's synthetic authority signals.
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
values ('--CLAIM_ID--','--OWNER_A--','--STORE_A--','store owner','Synthetic exact-store authority for local proof.');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp()
where claim_id='--CLAIM_ID--';
update partner_private.listing_claims set state='verification_pending'
where claim_id='--CLAIM_ID--';
insert into partner_private.claim_authority_signals(
  claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id
) values
  ('--CLAIM_ID--','published_business_contact','domain_response','verified','--ADMIN--',statement_timestamp(),
   decode(repeat('51',32),'hex'),decode(repeat('52',32),'hex'),'--SIGNAL_EVENT_A--'),
  ('--CLAIM_ID--','callback','callback','verified','--ADMIN--',statement_timestamp(),
   decode(repeat('53',32),'hex'),decode(repeat('54',32),'hex'),'--SIGNAL_EVENT_B--');
commit;
