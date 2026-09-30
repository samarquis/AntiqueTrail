-- #422: real public RPC boundary; fixtures are rolled back, never hosted.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

-- Keep the fixture's Representative on store 1, approve a separate Owner scope on 9.
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
update app_public.stores set synthetic=true,audience='synthetic' where id in
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
update app_private.profiles set verified_email_snapshot='owner422@example.test' where user_id='76000000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=statement_timestamp() where id='76000000-0000-4000-8000-000000000001';
update partner_private.partner_invitations set synthetic=true where invitation_id='76000000-0000-4000-8000-000000000002';
insert into auth.users(id,email,email_confirmed_at) values
 ('42200000-0000-4000-8000-000000000001','admin422@example.test',statement_timestamp());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
 ('42200000-0000-4000-8000-000000000002','42200000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.role_grants(subject_user_id,role) values
 ('42200000-0000-4000-8000-000000000001','administrator');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at) values
 ('42200000-0000-4000-8000-000000000003','42200000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement) values
 ('42200000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','store owner','Synthetic authority documented by independent channels.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
 ('42200000-0000-4000-8000-000000000004','published_business_contact','domain_response','verified','42200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'42200000-0000-4000-8000-000000000005'),
 ('42200000-0000-4000-8000-000000000004','callback','callback','verified','42200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'42200000-0000-4000-8000-000000000006');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id='42200000-0000-4000-8000-000000000004';
update partner_private.listing_claims set state='verification_pending' where claim_id='42200000-0000-4000-8000-000000000004';
insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id) values
 ('76000000-0000-4000-8000-000000000001','claim','42200000-0000-4000-8000-000000000004');

-- Test-only helper supplies provider-shaped signed claims, not client role metadata.
create function pg_temp.actor422(actor uuid,session_id uuid,assurance text default 'aal2') returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated','aal',assurance,'amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true); end $$;

select pg_temp.actor422('42200000-0000-4000-8000-000000000001','42200000-0000-4000-8000-000000000003');
create temporary table approval422(version bigint);
insert into approval422 select version from partner_private.listing_claims where claim_id='42200000-0000-4000-8000-000000000004';
grant select on approval422 to authenticated;
set local role authenticated;
select throws_ok($$select app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',(select version from approval422),'owner422-approve')$$,'42501','owner_access_unavailable','wrong confirmed store denies approval');
select is(app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from approval422),'owner422-approve')->>'role','Store Owner','approved verified claim produces distinct Owner role');
select is(app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from approval422),'owner422-approve')->>'storeId','00000000-0000-4000-8000-000000000009','unchanged replay retains exact scope');
select throws_ok($$select app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version+1 from approval422),'owner422-approve')$$,'22023',null,'mismatched replay denies');
reset role;
select is((select count(*) from app_private.role_grants where role='store_owner' and state='active'),1::bigint,'replay mints one Owner grant');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_claim_approved' and resource_id='42200000-0000-4000-8000-000000000004'),'approval is audited');

select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_list_stores()->'stores'),1,'Owner list exposes only approved Owner store');
select throws_ok($$select app_public.owner_select_store('00000000-0000-4000-8000-000000000001')$$,'42501','owner_access_unavailable','Representative store is not an Owner scope');
select is(app_public.owner_select_store('00000000-0000-4000-8000-000000000009')->>'storeId','00000000-0000-4000-8000-000000000009','exact Owner selection succeeds');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000009','existing Portal reads selected exact store');
select is(app_public.portal_save_managed_fields('{"description":"Owner-scoped synthetic edit","phone":"785-555-0422"}'::jsonb)->'store'->>'id',
 '00000000-0000-4000-8000-000000000009','Owner publishes existing managed fields to selected scope');
select throws_ok('select * from app_private.role_grants','42501',null,'Owner cannot bulk-read grants');
select throws_ok($$select app_public.partner_admin_claim_case('42200000-0000-4000-8000-000000000004')$$,'42501',null,'Owner cannot escalate to Administrator');
select throws_ok($$select app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',1,'self-approve')$$,'42501',null,'Owner cannot self-approve');
reset role;
select is((select description from app_public.stores where id='00000000-0000-4000-8000-000000000009'),
 'Owner-scoped synthetic edit','selected store receives authorized mutation');
select isnt((select description from app_public.stores where id='00000000-0000-4000-8000-000000000001'),
 'Owner-scoped synthetic edit','sibling Representative store remains unchanged');
set local role authenticated;
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000001"}',true);
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','forged Owner header cannot borrow Representative scope');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
reset role;

-- A second independently reviewed claim, same Owner; no implied sibling authority.
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience)
 values('00000000-0000-4000-8000-000000000008','owner422-second-store','Second Owner Store','Topeka','KS',
 '8 Synthetic Way','00000000-0000-4000-8000-000000000001','Synthetic test store','Synthetic fixture',true,'synthetic');
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
 values('42200000-0000-4000-8000-000000000007','76000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000008','store owner','Separate documented synthetic store authority.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
 ('42200000-0000-4000-8000-000000000007','published_business_contact','domain_response','verified','42200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('61',32),'hex'),decode(repeat('62',32),'hex'),gen_random_uuid()),
 ('42200000-0000-4000-8000-000000000007','callback','callback','verified','42200000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('63',32),'hex'),decode(repeat('64',32),'hex'),gen_random_uuid());
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id='42200000-0000-4000-8000-000000000007';
update partner_private.listing_claims set state='verification_pending' where claim_id='42200000-0000-4000-8000-000000000007';
update partner_private.store_owner_intake_roots set active_kind='claim',active_id='42200000-0000-4000-8000-000000000007',version=version+1
 where applicant_id='76000000-0000-4000-8000-000000000001';
create temporary table approval422_b(version bigint);
insert into approval422_b select version from partner_private.listing_claims where claim_id='42200000-0000-4000-8000-000000000007';
grant select on approval422_b to authenticated;
select pg_temp.actor422('42200000-0000-4000-8000-000000000001','42200000-0000-4000-8000-000000000003');
set local role authenticated;
select lives_ok($$select app_public.owner_admin_approve_claim('42200000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008',(select version from approval422_b),'owner422-approve-b')$$,'same Owner receives independently approved second-store grant');
reset role;
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_list_stores()->'stores'),2,'multi-store Owner sees exactly two approved stores');
select lives_ok($$select app_public.owner_select_store('00000000-0000-4000-8000-000000000008')$$,'another tab may validate second Owner scope');
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000009','other tab selection cannot change current request scope');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000008"}',true);
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000008','explicit second-store request is separately authorized');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
reset role;

update auth.users set email_confirmed_at=null where id='76000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok('select app_public.owner_list_stores()','42501','owner_access_unavailable','unconfirmed provider identity denies despite old profile snapshot');
reset role;
update auth.users set email_confirmed_at=statement_timestamp() where id='76000000-0000-4000-8000-000000000001';
update app_private.active_sessions set access_token_expires_at=statement_timestamp()-interval '1 second' where session_id='76000000-0000-4000-8000-000000000008';
set local role authenticated;
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','expired Owner token/session denies direct Portal read');
reset role;
update app_private.active_sessions set access_token_expires_at=statement_timestamp()+interval '30 minutes' where session_id='76000000-0000-4000-8000-000000000008';

select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008','aal1');
set local role authenticated;
select throws_ok('select app_public.owner_list_stores()','42501','owner_access_unavailable','MFA downgrade denies Owner reads');
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','MFA downgrade denies direct Portal read');
reset role;
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp() where session_id='76000000-0000-4000-8000-000000000008';
set local role authenticated;
select throws_ok('select app_public.owner_list_stores()','42501','owner_access_unavailable','revoked session denies Owner reads');
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','revoked session denies direct Portal read');
reset role;
update app_private.active_sessions set state='active',revoked_at=null where session_id='76000000-0000-4000-8000-000000000008';

select pg_temp.actor422('42200000-0000-4000-8000-000000000001','42200000-0000-4000-8000-000000000003');
create temporary table revocation422(version bigint);
insert into revocation422 select version from partner_private.listing_claims where claim_id='42200000-0000-4000-8000-000000000004';
grant select on revocation422 to authenticated;
set local role authenticated;
select lives_ok($$select app_public.partner_admin_claim_command('revoke','42200000-0000-4000-8000-000000000004',(select version from revocation422),'owner422-revoke','administrator_revoked')$$,'Site Admin revokes primary Owner claim');
reset role;
select is((select count(*) from app_private.role_grants where role='store_owner' and state='active'),1::bigint,'one-store revocation preserves separately approved Owner scope');
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_list_stores()->'stores'),1,'revoked store disappears immediately; second store remains');
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','selected revoked store never falls back to Representative');
select throws_ok($$select app_public.portal_save_managed_fields('{}'::jsonb)$$,'42501','portal_unavailable','revoked Owner direct mutation denies before payload handling');
reset role;
select pg_temp.actor422('42200000-0000-4000-8000-000000000001','42200000-0000-4000-8000-000000000003');
create temporary table revocation422_b(version bigint);
insert into revocation422_b select version from partner_private.listing_claims where claim_id='42200000-0000-4000-8000-000000000007';
grant select on revocation422_b to authenticated;
set local role authenticated;
select lives_ok($$select app_public.partner_admin_claim_command('revoke','42200000-0000-4000-8000-000000000007',(select version from revocation422_b),'owner422-revoke-b','administrator_revoked')$$,'Site Admin removes remaining Owner scope through independently audited command');
reset role;
select pg_temp.actor422('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select throws_ok('select app_public.owner_list_stores()','42501','owner_access_unavailable','all-store revocation removes Owner workspace access');
reset role;
select set_config('request.headers','{}',true);
set local role authenticated;
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000001','existing Representative scope remains unchanged');
reset role;
set local role anon;
select throws_ok('select app_public.owner_list_stores()','42501',null,'anonymous Owner read denied');
select throws_ok($$select app_public.owner_select_store('00000000-0000-4000-8000-000000000009')$$,'42501',null,'anonymous selection denied');
reset role;
select * from finish();
rollback;
