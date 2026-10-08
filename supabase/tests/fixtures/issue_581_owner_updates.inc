-- Isolated MFA Owner A, separate MFA Site Admin and Shopper, and ungranted Store B.
update app_private.environment_stage
set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability
set deployment_environment='local',state='disabled' where id=1;

insert into app_public.catalog_areas(id,slug,label,state_code,sort_order)
values ('58100000-0000-4000-8000-000000000010','issue-581-area','Issue 581 area','KS',0)
on conflict (id) do nothing;
insert into app_public.stores(
  id,slug,name,town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state
) values
 ('58100000-0000-4000-8000-000000000011','issue-581-store-a','Issue 581 Store A','Topeka','KS','1 Synthetic Way',
  '58100000-0000-4000-8000-000000000010','Synthetic update fixture','Owner A store','America/Chicago',true,'synthetic','active'),
 ('58100000-0000-4000-8000-000000000012','issue-581-store-b','Issue 581 Store B','Topeka','KS','2 Synthetic Way',
  '58100000-0000-4000-8000-000000000010','Synthetic update fixture','Unowned store','America/Chicago',true,'synthetic','active')
on conflict (id) do nothing;

insert into auth.users(id,email,email_confirmed_at) values
 ('58100000-0000-4000-8000-000000000001','owner581@example.test',statement_timestamp()),
 ('58100000-0000-4000-8000-000000000002','admin581@example.test',statement_timestamp()),
 ('58100000-0000-4000-8000-000000000013','shopper581@example.test',statement_timestamp());
update app_private.profiles set verified_email_snapshot=case user_id
  when '58100000-0000-4000-8000-000000000001' then 'owner581@example.test'
  when '58100000-0000-4000-8000-000000000002' then 'admin581@example.test'
  when '58100000-0000-4000-8000-000000000013' then 'shopper581@example.test'
end where user_id in (
  '58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000002',
  '58100000-0000-4000-8000-000000000013'
);
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
 ('58100000-0000-4000-8000-000000000008','58100000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp()),
 ('58100000-0000-4000-8000-000000000009','58100000-0000-4000-8000-000000000002','totp','verified',statement_timestamp(),statement_timestamp()),
 ('58100000-0000-4000-8000-000000000015','58100000-0000-4000-8000-000000000013','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.role_grants(subject_user_id,role) values
 ('58100000-0000-4000-8000-000000000002','administrator'),
 ('58100000-0000-4000-8000-000000000013','shopper');
set local role identity_service;
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at) values
 ('58100000-0000-4000-8000-000000000003','58100000-0000-4000-8000-000000000002',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
 ('58100000-0000-4000-8000-000000000004','58100000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
 ('58100000-0000-4000-8000-000000000014','58100000-0000-4000-8000-000000000013',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
 ('58100000-0000-4000-8000-000000000017','58100000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),null,statement_timestamp()+interval '30 minutes');
reset role;

insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label)
select stores.store_id,groups.verification_group,statement_timestamp(),'Issue 581 synthetic catalog fixture'
from (values
  ('58100000-0000-4000-8000-000000000011'::uuid),
  ('58100000-0000-4000-8000-000000000012'::uuid)
) stores(store_id)
cross join unnest(array['identity_location','contact','hours','categories_attributes']::app_public.verification_group[]) groups(verification_group);

insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
values ('58100000-0000-4000-8000-000000000005','58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000011','store owner','Synthetic Owner fixture approved for local RLS tests.');
insert into partner_private.claim_authority_signals(
  claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id
) values
 ('58100000-0000-4000-8000-000000000005','published_business_contact','domain_response','verified',
  '58100000-0000-4000-8000-000000000002',statement_timestamp(),decode(repeat('51',32),'hex'),decode(repeat('52',32),'hex'),
  '58100000-0000-4000-8000-000000000006'),
 ('58100000-0000-4000-8000-000000000005','callback','callback','verified',
  '58100000-0000-4000-8000-000000000002',statement_timestamp(),decode(repeat('53',32),'hex'),decode(repeat('54',32),'hex'),
  '58100000-0000-4000-8000-000000000007');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp()
where claim_id='58100000-0000-4000-8000-000000000005';
update partner_private.listing_claims set state='verification_pending'
where claim_id='58100000-0000-4000-8000-000000000005';
insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
values ('58100000-0000-4000-8000-000000000001','claim','58100000-0000-4000-8000-000000000005');

create function pg_temp.issue581_actor(actor uuid,session_id uuid,assurance text default 'aal2')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'session_id',session_id,'role','authenticated','aal',assurance,'amr',jsonb_build_array(
      jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
      jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
end
$$;

create temporary table issue581_approval_version(version bigint);
insert into issue581_approval_version
select version from partner_private.listing_claims where claim_id='58100000-0000-4000-8000-000000000005';
grant select on issue581_approval_version to authenticated;
select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000002','58100000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select app_public.owner_admin_approve_claim(
  '58100000-0000-4000-8000-000000000005','58100000-0000-4000-8000-000000000011',
  (select version from issue581_approval_version),'issue581-owner-approval')$$,
  'separate MFA Site Admin approves synthetic Owner A for Store A');
reset role;

insert into portal_private.store_updates(
  update_id,store_id,author_user_id,update_type,headline,details,end_date,content_digest
) values (
  '58100000-0000-4000-8000-000000000016','58100000-0000-4000-8000-000000000012',
  '58100000-0000-4000-8000-000000000001','announcement','Sibling update','Store B only.',null,
  extensions.digest(convert_to(jsonb_strip_nulls(
    '{"type":"announcement","headline":"Sibling update","details":"Store B only."}'::jsonb
  )::text,'utf8'),'sha256')
),(
  '58100000-0000-4000-8000-000000000018','58100000-0000-4000-8000-000000000012',
  '58100000-0000-4000-8000-000000000001','sale','Expired sibling sale','No longer current.',
  (statement_timestamp() at time zone 'America/Chicago')::date-1,
  extensions.digest(convert_to(jsonb_strip_nulls(jsonb_build_object(
    'type','sale','headline','Expired sibling sale','details','No longer current.',
    'endDate',to_char((statement_timestamp() at time zone 'America/Chicago')::date-1,'YYYY-MM-DD')
  ))::text,'utf8'),'sha256')
);
