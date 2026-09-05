begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('17100000-0000-4000-8000-000000000001','owner171@example.test',statement_timestamp()),
 ('17100000-0000-4000-8000-000000000002','admin171@example.test',statement_timestamp());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 select id,id,'totp','verified',statement_timestamp(),statement_timestamp() from auth.users where id in ('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-000000000002');
update app_private.profiles set verified_email_snapshot='verified@example.test' where user_id in ('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-000000000002');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
 select id,id,statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'
 from auth.users where id in ('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-000000000002');
insert into app_private.role_grants(subject_user_id,role) values('17100000-0000-4000-8000-000000000002','administrator');
insert into partner_private.public_claim_consent_receipts(auth_user_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum)
 select u.id,policy_version,true,true,'issue171-consent-'||u.id,decode(repeat('17',32),'hex') from partner_private.partner_material_terms cross join auth.users u where is_current and u.id in ('17100000-0000-4000-8000-000000000001','17100000-0000-4000-8000-000000000002');
create function pg_temp.actor(id uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',id,'session_id',id,'aal','aal2','amr',jsonb_build_array(
 jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
 jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true)::text::void
$$;
select pg_temp.actor('17100000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok($$select app_public.store_application_command('start','{}')$$,'42501','store_application_stage_disabled','public add stays off');
select throws_ok($$select partner_private.store_application_command('start','{}',true)$$,'42501',null,'public caller cannot forge synthetic seam');
select is(app_public.store_application_command('status','{}'),null::jsonb,'stage-off status has no application data');
reset role;
select is((select count(*) from partner_private.store_add_applications),0::bigint,'stage denial writes no application');
set local role identity_service;
create temp table state171(d jsonb, s jsonb, a jsonb);
insert into state171(d) select jsonb_build_object('name','Synthetic New Antiques 171','address','171 Fictional Street','areaId','00000000-0000-4000-8000-000000000001',
 'categoryId',(select id from app_public.store_categories order by id limit 1),'summary','Synthetic summary','description','Synthetic description','phone','','website','','ownerConfirmed',true,
 'hours',(select jsonb_agg(jsonb_build_object('day',day,'closed',false,'opens','09:00','closes','17:00')) from generate_series(1,7) day));
select throws_ok($$select partner_private.store_application_command('start',jsonb_build_object('draft',d),true) from state171$$,'42501','store_application_unavailable','search-before-add cannot be bypassed');
update state171 set s=partner_private.store_application_command('search',jsonb_build_object('draft',d),true);
select is(jsonb_array_length(s->'matches'),0,'new identity has no matching store') from state171;
update state171 set a=partner_private.store_application_command('start',jsonb_build_object('draft',d,'searchId',s->>'searchId'),true);
select is(a->>'state','draft','start creates ordinary draft') from state171;
select is(partner_private.store_application_command('start',jsonb_build_object('draft',d,'searchId',s->>'searchId'),true)->>'applicationId',a->>'applicationId','start retry resumes exact draft') from state171;
select is((select count(*) from app_private.role_grants where subject_user_id='17100000-0000-4000-8000-000000000001' and role='representative'),0::bigint,'draft creates no role');
update state171 set a=partner_private.store_application_command('submit',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version'),true);
select is(a->>'state','submitted','new draft submits') from state171;
select pg_temp.actor('17100000-0000-4000-8000-000000000002');
update state171 set a=partner_private.store_application_admin_command('verify_signal',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','channelClass','published_business_contact','verificationEventId','17100000-0000-4000-8000-000000000017','evidenceHmac',repeat('17',32)),true);
update state171 set a=partner_private.store_application_admin_command('verify_signal',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','channelClass','callback','verificationEventId','17100000-0000-4000-8000-000000000018','evidenceHmac',repeat('18',32)),true);
select throws_ok($q$select partner_private.store_application_admin_command('verify_signal',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','channelClass','filing_lookup','evidenceHmac',repeat('20',32),'verificationEventId','17100000-0000-4000-8000-000000000017'),true) from state171$q$,'23505',null,'one verification event cannot count as independent channels');
update state171 set a=partner_private.store_application_admin_command('changes',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review'),true);
select pg_temp.actor('17100000-0000-4000-8000-000000000001');
select throws_ok($q$select partner_private.store_application_command('save',jsonb_build_object('applicationId',a->>'applicationId','version',0,'draft',d),true) from state171$q$,'40001','store_application_unavailable','stale writer cannot overwrite draft');
update state171 set a=partner_private.store_application_command('save',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','draft',d),true);
select is((select count(*) from partner_private.store_application_signals where verified_at is not null),0::bigint,'draft changes invalidate every verified authority signal');
update state171 set a=partner_private.store_application_command('submit',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version'),true);
select pg_temp.actor('17100000-0000-4000-8000-000000000002');
update state171 set a=partner_private.store_application_admin_command('verify',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','exactTopekaEligible',true,'noClosureOrHold',true,'factsConfirmed',true),true);
select is(a->>'state','verification_pending','independent facts and two channels ready for approval') from state171;
select throws_ok($q$select partner_private.store_application_admin_command('approve',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','idempotencyKey','old-evidence'),true) from state171$q$,'42501','store_application_unavailable','old evidence cannot authorize revised application');
update state171 set a=partner_private.store_application_admin_command('verify_signal',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','channelClass','published_business_contact','verificationEventId','17100000-0000-4000-8000-000000000017','evidenceHmac',repeat('17',32)),true);
update state171 set a=partner_private.store_application_admin_command('verify_signal',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','channelClass','callback','verificationEventId','17100000-0000-4000-8000-000000000018','evidenceHmac',repeat('18',32)),true);
update state171 set a=partner_private.store_application_admin_command('verify',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','exactTopekaEligible',true,'noClosureOrHold',true,'factsConfirmed',true),true);
create temp table approval171 as select jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','idempotencyKey','approval171') payload from state171;
reset role;
create function pg_temp.fail_application_audit() returns trigger language plpgsql as $f$ begin if new.action='store_application_approve' then raise exception 'audit unavailable'; end if; return new; end $f$;
create trigger issue171_audit_failure before insert on app_private.privileged_audit_events for each row execute function pg_temp.fail_application_audit();
set local role identity_service;
select throws_ok($q$select partner_private.store_application_admin_command('approve',payload,true) from approval171$q$,'P0001','audit unavailable','audit failure aborts approval');
select is((select count(*) from app_public.stores where name='Synthetic New Antiques 171'),0::bigint,'failed approval leaves no canonical store');
select is((select count(*) from partner_private.store_application_approval_receipts),0::bigint,'failed approval leaves no receipt');
select is((select count(*) from app_private.role_grants where subject_user_id='17100000-0000-4000-8000-000000000001' and role='representative'),0::bigint,'failed approval leaves no grant');
reset role;
drop trigger issue171_audit_failure on app_private.privileged_audit_events;
set local role identity_service;
update state171 set a=partner_private.store_application_admin_command('approve',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','reasonCode','owner_review','idempotencyKey','approval171'),true);
select is(a->>'state','approved','approval succeeds atomically') from state171;
select is((select tier from partner_private.store_photo_tier_state where store_id=(a->>'storeId')::uuid),'free','approved store has default Free') from state171;
select is((select count(*) from app_private.role_grants where subject_user_id='17100000-0000-4000-8000-000000000001' and role='representative' and store_id=(a->>'storeId')::uuid),1::bigint,'one exact grant') from state171;
select is((select count(*) from app_public.store_fact_verifications where store_id=(a->>'storeId')::uuid),4::bigint,'required provenance groups exist') from state171;
select is((select active_kind from partner_private.store_owner_intake_roots where applicant_id='17100000-0000-4000-8000-000000000001'),'none','approval clears own root');
select is(partner_private.store_application_admin_command('approve',payload,true)->>'storeId',(select a->>'storeId' from state171),'exact approval retry returns same store') from approval171;
select throws_ok($q$select partner_private.store_application_admin_command('approve',payload||'{"reasonCode":"changed"}',true) from approval171$q$,'42501','store_application_unavailable','changed approval replay denied');
select pg_temp.actor('17100000-0000-4000-8000-000000000001');
select throws_ok($q$select partner_private.store_application_command('start',jsonb_build_object('draft',d,'searchId',s->>'searchId'),true) from state171$q$,'42501','store_application_unavailable','approved representative cannot start a second store');
select pg_temp.actor('17100000-0000-4000-8000-000000000002');
select is(partner_private.store_application_command('status',jsonb_build_object('applicationId',a->>'applicationId'),true),null::jsonb,'another applicant cannot read status') from state171;
reset role;
-- A separate eligible applicant hits a store that appeared after the original search.
insert into auth.users(id,email,email_confirmed_at) values ('17100000-0000-4000-8000-000000000003','duplicate171@example.test',statement_timestamp());
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values('17100000-0000-4000-8000-000000000003','17100000-0000-4000-8000-000000000003','totp','verified',statement_timestamp(),statement_timestamp());
update app_private.profiles set verified_email_snapshot='duplicate171@example.test' where user_id='17100000-0000-4000-8000-000000000003';
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at) values('17100000-0000-4000-8000-000000000003','17100000-0000-4000-8000-000000000003',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into partner_private.public_claim_consent_receipts(auth_user_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum) select '17100000-0000-4000-8000-000000000003',policy_version,true,true,'duplicate171-consent',decode(repeat('17',32),'hex') from partner_private.partner_material_terms where is_current;
select pg_temp.actor('17100000-0000-4000-8000-000000000003');
set local role identity_service;
update state171 set s=partner_private.store_application_command('search',jsonb_build_object('draft',d),true);
update state171 set a=partner_private.store_application_command('start',jsonb_build_object('draft',d,'searchId',s->>'searchId'),true);
update state171 set a=partner_private.store_application_command('submit',jsonb_build_object('applicationId',a->>'applicationId','version',a->'version'),true);
select is(a->>'state','duplicate_review','submit rechecks canonical identity') from state171;
create temp table conversion171 as select jsonb_build_object('applicationId',a->>'applicationId','version',a->'version','storeId',a->>'matchedStoreId','confirmed',true) payload from state171;
select throws_ok($q$select partner_private.store_application_command('convert',payload||'{"confirmed":false}',true) from conversion171$q$,'42501','store_application_unavailable','duplicate conversion requires applicant confirmation');
update state171 set a=partner_private.store_application_command('convert',(select payload from conversion171),true);
select is(a->>'state','withdrawn','confirmed duplicate closes add application') from state171;
select is(partner_private.store_application_command('convert',payload,true)->>'claimId',(select a->>'claimId' from state171),'conversion retry returns same claim') from conversion171;
select is((select count(*) from app_public.stores where name='Synthetic New Antiques 171'),1::bigint,'conversion creates no second store');
select is((select active_kind from partner_private.store_owner_intake_roots where applicant_id='17100000-0000-4000-8000-000000000003'),'claim','conversion atomically transfers intake root');
reset role;
insert into app_private.account_export_jobs(export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at,attempt_count)
values('17100000-0000-4000-8000-000000000060','17100000-0000-4000-8000-000000000001','building','17100000-0000-4000-8000-000000000061',statement_timestamp(),statement_timestamp()+interval '5 minutes',1);
set local role identity_service;
select is(jsonb_array_length(app_public.build_account_export_canonical_json('17100000-0000-4000-8000-000000000060','17100000-0000-4000-8000-000000000061')::jsonb->'storeApplications'),1,'export includes exactly the applicants own application');
select is(app_public.build_account_export_canonical_json('17100000-0000-4000-8000-000000000060','17100000-0000-4000-8000-000000000061')::jsonb#>>'{storeApplications,0,state}','approved','export includes own approval outcome');
select throws_ok($q$select app_public.build_account_export_canonical_json('17100000-0000-4000-8000-000000000060','17100000-0000-4000-8000-000000000062')$q$,'42501','account_export_claim_invalid','export requires exact live worker claim');
reset role;
update partner_private.store_add_applications set applicant_id=null,draft='{ "private": "removed account" }',state='submitted' where converted_claim_id is not null;
set local role account_lifecycle_service;
select is(app_public.store_application_retention(),1,'worker purges pending application after account removal');
reset role;
select is((select draft from partner_private.store_add_applications where converted_claim_id is not null),'{}'::jsonb,'orphaned draft is removed');
select is((select state from partner_private.store_add_applications where converted_claim_id is not null),'withdrawn','orphaned pending application closes');
reset role;
select * from finish();
rollback;
