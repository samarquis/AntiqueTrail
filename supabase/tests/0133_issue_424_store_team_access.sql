-- #424: exact-store invitations, acceptance, role grants, cancellation, and revocation.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
update app_public.stores set synthetic=true,audience='synthetic' where id in
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009');
update app_private.profiles set verified_email_snapshot='owner424@example.test'
  where user_id='76000000-0000-4000-8000-000000000001';
update auth.users set email='owner424@example.test',email_confirmed_at=statement_timestamp()
  where id='76000000-0000-4000-8000-000000000001';
update partner_private.partner_invitations set synthetic=true,issuance_idempotency_key='owner424-invitation',
  raw_returned_at=created_at,expires_at=created_at+interval '30 minutes'
  where invitation_id='76000000-0000-4000-8000-000000000002';

insert into auth.users(id,email,email_confirmed_at) values
  ('42400000-0000-4000-8000-000000000001','admin424@example.test',statement_timestamp()),
  ('42400000-0000-4000-8000-000000000010','editor424@example.test',statement_timestamp()),
  ('42400000-0000-4000-8000-000000000020','full424@example.test',statement_timestamp()),
  ('42400000-0000-4000-8000-000000000030','co424@example.test',statement_timestamp());
insert into app_private.profiles(user_id,verified_email_snapshot,public_display_name) values
  ('42400000-0000-4000-8000-000000000001','admin424@example.test','Admin 424'),
  ('42400000-0000-4000-8000-000000000010','editor424@example.test','Editor 424'),
  ('42400000-0000-4000-8000-000000000020','full424@example.test','Full 424'),
  ('42400000-0000-4000-8000-000000000030','co424@example.test','Co-Owner 424')
on conflict (user_id) do update set
  verified_email_snapshot=excluded.verified_email_snapshot,
  public_display_name=excluded.public_display_name;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
  ('42400000-0000-4000-8000-000000000002','42400000-0000-4000-8000-000000000001','totp','verified',statement_timestamp(),statement_timestamp()),
  ('42400000-0000-4000-8000-000000000011','42400000-0000-4000-8000-000000000010','totp','verified',statement_timestamp(),statement_timestamp()),
  ('42400000-0000-4000-8000-000000000021','42400000-0000-4000-8000-000000000020','totp','verified',statement_timestamp(),statement_timestamp()),
  ('42400000-0000-4000-8000-000000000031','42400000-0000-4000-8000-000000000030','totp','verified',statement_timestamp(),statement_timestamp());
insert into app_private.role_grants(subject_user_id,role) values
  ('42400000-0000-4000-8000-000000000001','administrator');
insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at) values
  ('42400000-0000-4000-8000-000000000003','42400000-0000-4000-8000-000000000001',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('42400000-0000-4000-8000-000000000012','42400000-0000-4000-8000-000000000010',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('42400000-0000-4000-8000-000000000022','42400000-0000-4000-8000-000000000020',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
  ('42400000-0000-4000-8000-000000000032','42400000-0000-4000-8000-000000000030',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement) values
  ('42400000-0000-4000-8000-000000000004','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000009','store owner','Synthetic authority documented by independent channels.');
insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
  ('42400000-0000-4000-8000-000000000004','published_business_contact','domain_response','verified','42400000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'42400000-0000-4000-8000-000000000005'),
  ('42400000-0000-4000-8000-000000000004','callback','callback','verified','42400000-0000-4000-8000-000000000001',statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'42400000-0000-4000-8000-000000000006');
update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id='42400000-0000-4000-8000-000000000004';
update partner_private.listing_claims set state='verification_pending' where claim_id='42400000-0000-4000-8000-000000000004';
insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id) values
  ('76000000-0000-4000-8000-000000000001','claim','42400000-0000-4000-8000-000000000004');
insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
  values('shared_alpha','store_team_invitation',1,decode(repeat('55',32),'hex'),'active');

create function pg_temp.actor424(actor uuid,session_id uuid,assurance text default 'aal2',auth_age interval default interval '0') returns void
language plpgsql as $$ begin perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',session_id,'role','authenticated','aal',assurance,'amr',jsonb_build_array(
  jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp()-auth_age)::bigint),
  jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp()-auth_age)::bigint)))::text,true); end $$;

select pg_temp.actor424('42400000-0000-4000-8000-000000000001','42400000-0000-4000-8000-000000000003');
create temporary table approval424(version bigint);
insert into approval424 select version from partner_private.listing_claims where claim_id='42400000-0000-4000-8000-000000000004';
grant select on approval424 to authenticated;
set local role authenticated;
select lives_ok($$select app_public.owner_admin_approve_claim('42400000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000009',(select version from approval424),'owner424-approve')$$,'test Owner receives approved synthetic scope');
reset role;

select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_list_stores()->'stores'),1,'Owner sees exact approved store');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000001','editor424@example.test','listing_editor','owner424-cross-store')->>'state',
  'denied','different store scope denies invitation');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','editor424@example.test','administrator','owner424-admin')->>'state',
  'denied','Administrator role cannot be delegated');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','owner424@example.test','co_owner','owner424-self')->>'state',
  'denied','Owner cannot invite their own account');
select is(app_public.owner_admin_team_list('00000000-0000-4000-8000-000000000009')->>'state',
  'denied','Owner cannot use Site Admin team authority');
create temporary table invited424 as
  select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009',' editor424@example.test ','listing_editor','owner424-invite') as result;
select is((select result->>'state' from invited424),'pending','verified-email invitation remains pending until acceptance');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','editor424@example.test','listing_editor','owner424-invite'),
  (select result from invited424),'same idempotency key replays the invitation');
select is(jsonb_array_length(app_public.owner_team_list('00000000-0000-4000-8000-000000000009')->'invitations'),1,
  'replay creates one invitation');
select ok(not exists(select 1 from information_schema.columns where table_schema='partner_private'
  and table_name='store_team_invitations' and column_name like '%email' and column_name not like '%hmac%'),
  'invitation never stores a cleartext recipient address');
select throws_ok($$select * from partner_private.store_team_invitations$$,'42501',null,'browser cannot read private invitation rows');
reset role;

create temporary table invite_ref424 as
select invitation_id,version from partner_private.store_team_invitations
where store_id='00000000-0000-4000-8000-000000000009';
grant select on invite_ref424 to authenticated;
select pg_temp.actor424('42400000-0000-4000-8000-000000000010','42400000-0000-4000-8000-000000000012');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_team_invitations()->'invitations'),1,'only matching verified email can discover invite');
create temporary table acceptance424 as
select app_public.owner_team_accept((select invitation_id from invite_ref424),(select version from invite_ref424),'editor424-accept') as result;
select is((select result->>'role' from acceptance424),'listing_editor','acceptance creates only invited role');
select is(app_public.owner_team_accept((select invitation_id from invite_ref424),(select version from invite_ref424),'editor424-accept'),
  (select result from acceptance424),'same acceptance idempotency key replays safely');
select is(app_public.owner_team_accept((select invitation_id from invite_ref424),99,'editor424-wrong-version')->>'state',
  'conflict','stale acceptance returns a package conflict');
select is(app_public.owner_team_accept((select invitation_id from invite_ref424),99,'editor424-wrong-version')->>'version',
  (select (version+1)::text from invite_ref424),'stale acceptance returns the current invitation version');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select is(app_public.portal_get_home()->'store'->>'id','00000000-0000-4000-8000-000000000009','accepted teammate opens only invited store');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','peer424@example.test','listing_editor','editor424-peer-invite')->>'state',
  'denied','Listing Editor cannot invite teammates');
select throws_ok($$select app_public.promotion_channels()$$,'42501','promotion_unavailable','Listing Editor cannot read promotion controls');
select throws_ok($$select app_public.promotion_channel_command('social','consent',0,false)$$,'42501','promotion_unavailable','Listing Editor cannot change promotion permissions');
reset role;
select ok((select recipient_email_hmac is null from partner_private.store_team_invitations
  where invitation_id=(select invitation_id from invite_ref424)),
  'accepted invitation immediately drops the recipient email HMAC');

select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','full424@example.test','full_store_access','owner424-full-invite')$$,
  'Owner grants Full Store Access only through an invitation');
reset role;

select pg_temp.actor424('42400000-0000-4000-8000-000000000020','42400000-0000-4000-8000-000000000022');
create temporary table full_invite_ref424 as
select invitation_id,version from partner_private.store_team_invitations
where store_id='00000000-0000-4000-8000-000000000009' and invited_role='full_store_access';
grant select on full_invite_ref424 to authenticated;
set local role authenticated;
select is(jsonb_array_length(app_public.owner_team_invitations()->'invitations'),1,'Full Store invitation matches only the verified email');
select is(app_public.owner_team_accept((select invitation_id from full_invite_ref424),(select version from full_invite_ref424),'full424-accept')->>'role',
  'full_store_access','acceptance activates only the invited Full Store Access role');
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select is(jsonb_array_length(app_public.promotion_channels()),4,'Full Store Access can read store promotion controls');
select is(app_public.promotion_channel_command('social','consent',0,false)->>'allowed','true','Full Store Access can record store promotion consent');
reset role;

select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','co424@example.test','co_owner','owner424-co-invite')$$,
  'Owner invites a Co-Owner through the verified invitation flow');
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','cancel424@example.test','listing_editor','owner424-cancel-invite')$$,
  'Owner can create an invitation for Co-Owner cancellation proof');
reset role;

create temporary table co_invite_ref424 as
select invitation_id,version from partner_private.store_team_invitations where idempotency_key='owner424-co-invite';
create temporary table cancel_invite_ref424 as
select invitation_id,version from partner_private.store_team_invitations where idempotency_key='owner424-cancel-invite';
grant select on co_invite_ref424,cancel_invite_ref424 to authenticated;
select pg_temp.actor424('42400000-0000-4000-8000-000000000030','42400000-0000-4000-8000-000000000032');
set local role authenticated;
select is(app_public.owner_team_accept((select invitation_id from co_invite_ref424),(select version from co_invite_ref424),'co424-accept')->>'role',
  'co_owner','verified Co-Owner acceptance creates the delegated role');
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','peer424@example.test','co_owner','co424-peer-invite')$$,
  'Co-Owner can invite another Co-Owner');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','co-full424@example.test','full_store_access','co424-full-denied')->>'state',
  'denied','Co-Owner cannot invite Full Store Access');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','co-editor424@example.test','listing_editor','co424-editor-denied')->>'state',
  'denied','Co-Owner cannot invite Listing Editors');
select is(app_public.owner_team_cancel('00000000-0000-4000-8000-000000000009',(select invitation_id from cancel_invite_ref424),
  (select version from cancel_invite_ref424)+1,'co424-stale-cancel')->>'state','conflict',
  'stale invitation cancellation returns a package conflict');
select is(app_public.owner_team_cancel('00000000-0000-4000-8000-000000000009',(select invitation_id from cancel_invite_ref424),
  (select version from cancel_invite_ref424)+1,'co424-stale-cancel')->>'version',(select version::text from cancel_invite_ref424),
  'stale cancellation returns the current invitation version');
select is(app_public.owner_team_cancel('00000000-0000-4000-8000-000000000009',(select invitation_id from cancel_invite_ref424),
  (select version from cancel_invite_ref424),'co424-cancel')->>'state','cancelled','Co-Owner can cancel another inviter’s pending invitation');
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','expired424@example.test','co_owner','co424-expiring')$$,
  'Co-Owner can create a short-lived Co-Owner invitation');
reset role;
select ok((select recipient_email_hmac is null from partner_private.store_team_invitations
  where idempotency_key='owner424-cancel-invite'),
  'cancelled invitation immediately drops the recipient email HMAC');
update partner_private.store_team_invitations set expires_at=statement_timestamp()-interval '1 minute'
  where idempotency_key='co424-expiring';
set local role account_lifecycle_service;
select is((app_public.run_due_review_lifecycle(statement_timestamp(),100)->>'teamInvitationsExpired')::integer,1,
  'existing lifecycle worker expires due team invitations');
reset role;
select ok((select state='expired' and recipient_email_hmac is null from partner_private.store_team_invitations
  where idempotency_key='co424-expiring'),
  'expired invitation drops recipient email HMAC at lifecycle cleanup');

create temporary table peer_invite_ref424 as
select invitation_id,version from partner_private.store_team_invitations where idempotency_key='co424-peer-invite';
grant select on peer_invite_ref424 to authenticated;
select pg_temp.actor424('42400000-0000-4000-8000-000000000020','42400000-0000-4000-8000-000000000022');
set local role authenticated;
select lives_ok($$select app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','full-editor424@example.test','listing_editor','full424-editor-invite')$$,
  'Full Store Access can invite Listing Editors');
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','peer424@example.test','co_owner','full424-co-invite')->>'state',
  'denied','Full Store Access cannot invite Co-Owners');
select is(app_public.owner_team_cancel('00000000-0000-4000-8000-000000000009',(select invitation_id from peer_invite_ref424),
  (select version from peer_invite_ref424),'full424-cancel-peer')->>'state','denied','Full Store Access cannot cancel another inviter’s pending invitation');
reset role;

create temporary table grant_ref424 as
select g.grant_id,g.version from app_private.role_grants g
join partner_private.store_team_invitations i on i.grant_id=g.grant_id
where i.invitation_id=(select invitation_id from invite_ref424);
grant select on grant_ref424 to authenticated;
create temporary table primary_owner_grant424 as
select grant_id,version from app_private.role_grants
where subject_user_id='76000000-0000-4000-8000-000000000001' and store_id='00000000-0000-4000-8000-000000000009'
  and role='store_owner' and state='active';
grant select on primary_owner_grant424 to authenticated;
select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_team_list('00000000-0000-4000-8000-000000000009')->'members'),4,
  'Owner sees active team role without recipient email');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from primary_owner_grant424),(select version from primary_owner_grant424),'owner424-admin-revoke','Denied admin access')->>'state',
  'denied','Owner cannot invoke Site Admin team revocation');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from primary_owner_grant424),(select version from primary_owner_grant424),'owner424-self-revoke')->>'state',
  'denied','Owner cannot revoke their own primary claim');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000001',(select grant_id from grant_ref424),(select version from grant_ref424),'owner424-cross-store-revoke')->>'state',
  'denied','Owner cannot revoke a grant through another store scope');
select lives_ok($$select app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from grant_ref424),(select version from grant_ref424),'owner424-revoke')$$,
  'Owner revokes exact-store teammate grant');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from grant_ref424),(select version from grant_ref424),'owner424-revoke')->>'state',
  'revoked','revocation replay is idempotent');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from grant_ref424),(select version from grant_ref424),'owner424-stale')->>'state',
  'conflict','stale grant version returns a package conflict');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from grant_ref424),(select version from grant_ref424),'owner424-stale')->>'version',
  (select (version+1)::text from grant_ref424),'stale revocation returns the current grant version');
reset role;

create temporary table admin_team_grant424 as
select g.grant_id,g.version from app_private.role_grants g
where g.store_id='00000000-0000-4000-8000-000000000009' and g.role='full_store_access' and g.state='active';
grant select on admin_team_grant424 to authenticated;
select pg_temp.actor424('42400000-0000-4000-8000-000000000001','42400000-0000-4000-8000-000000000003');
set local role authenticated;
select is(jsonb_array_length(app_public.owner_admin_team_list('00000000-0000-4000-8000-000000000009')->'members'),2,
  'Site Admin sees exact synthetic store team grants');
select is(app_public.owner_admin_team_list('99999999-9999-4999-8999-999999999999')->>'state',
  'denied','Site Admin team view requires an exact eligible store');
select throws_ok($$select app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424),'admin424-empty-reason','   ')$$,
  '22023','owner_team_input_invalid','Site Admin team removal requires a plain reason');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424)+1,'admin424-stale-revoke',
  'Stale version')->>'state','conflict','stale Site Admin revocation returns a package conflict');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424)+1,'admin424-stale-revoke',
  'Stale version')->>'version',(select version::text from admin_team_grant424),
  'stale Site Admin revocation returns the current grant version');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424),'admin424-team-remove',
  'Access removed after authorization mismatch')->>'state','revoked',
  'Site Admin can revoke one exact-store active team grant');
select lives_ok($$select app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424),'admin424-team-remove',
  'Access removed after authorization mismatch')$$,
  'Site Admin can safely replay the same revocation reason');
select throws_ok($$select app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424),'admin424-team-remove',
  'Different reason')$$,
  '22023','owner_team_idempotency_mismatch','Site Admin cannot replay a revocation key with another reason');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000001',
  (select grant_id from admin_team_grant424),(select version from admin_team_grant424),'admin424-cross-store-remove','Wrong store')->>'state',
  'denied','Site Admin mutation cannot retarget another store’s grant');
select is(app_public.owner_admin_team_revoke('00000000-0000-4000-8000-000000000009',
  (select grant_id from primary_owner_grant424),(select version from primary_owner_grant424),'admin424-owner-remove','Primary owner')->>'state',
  'denied','Site Admin team action cannot revoke the primary Owner claim');
reset role;

select pg_temp.actor424('42400000-0000-4000-8000-000000000010','42400000-0000-4000-8000-000000000012');
set local role authenticated;
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
select throws_ok('select app_public.portal_get_home()','42501','portal_unavailable','revoked teammate is denied by direct Portal RPC');
select is(app_public.owner_team_revoke('00000000-0000-4000-8000-000000000009',(select grant_id from grant_ref424),(select version from grant_ref424),'editor424-self-revoke')->>'state',
  'denied','Listing Editor cannot revoke team roles');
reset role;

update app_private.active_sessions set last_authenticated_at=statement_timestamp()-interval '11 minutes'
where session_id='76000000-0000-4000-8000-000000000008' and state='active';
create temporary table stale_auth_audit_baseline424 as
select coalesce(max(sequence_no),0)::bigint as sequence_no from app_private.privileged_audit_events;
select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008','aal2',interval '11 minutes');
set local role authenticated;
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','stale-owner424@example.test','listing_editor','owner424-stale-session')->>'state',
  'denied','Owner session outside the recent-auth window cannot use the direct invitation RPC');
reset role;
select is((select count(*)::integer from partner_private.store_team_invitations where idempotency_key='owner424-stale-session'),0,
  'stale-auth Owner denial does not create an invitation');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_manage' and actor_user_id='76000000-0000-4000-8000-000000000001'
  and resource_id='00000000-0000-4000-8000-000000000009'
  and sequence_no>(select sequence_no from stale_auth_audit_baseline424)),
  'stale-auth Owner denial is durably audited');

update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),
  revocation_reason='issue_424_test_revoked_owner',version=version+1
where session_id='76000000-0000-4000-8000-000000000008' and state='active';
create temporary table revoked_auth_audit_baseline424 as
select coalesce(max(sequence_no),0)::bigint as sequence_no from app_private.privileged_audit_events;
select pg_temp.actor424('76000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000008');
set local role authenticated;
select is(app_public.owner_team_invite('00000000-0000-4000-8000-000000000009','revoked-owner424@example.test','listing_editor','owner424-revoked-session')->>'state',
  'denied','revoked Owner session cannot use the direct team invitation RPC');
reset role;

select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_invited' and resource_kind='team_invitation'),
  'invitation request is audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_invitation_accepted' and resource_kind='team_invitation'),
  'acceptance is audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_invitation_cancelled' and resource_kind='team_invitation'),
  'cancellation is audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_revoked' and resource_kind='team_access'),
  'owner and Site Admin team revocations are audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_invite_role' and actor_user_id='76000000-0000-4000-8000-000000000001'
  and resource_id='00000000-0000-4000-8000-000000000009'),
  'Administrator role assignment denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_manage' and actor_user_id='76000000-0000-4000-8000-000000000001'
  and resource_id='00000000-0000-4000-8000-000000000001'),
  'cross-store denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_self_invite' and actor_user_id='76000000-0000-4000-8000-000000000001'),
  'self-invitation denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_revoke_scope' and actor_user_id='76000000-0000-4000-8000-000000000001'),
  'primary Owner self-revocation denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='admin_team_revoke' and actor_user_id='76000000-0000-4000-8000-000000000001'),
  'Site Admin RPC denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where action='owner_team_access_denied'
  and outcome='denied' and reason_code='team_manage' and actor_user_id='76000000-0000-4000-8000-000000000001'
  and resource_id='00000000-0000-4000-8000-000000000009'
  and sequence_no>(select sequence_no from revoked_auth_audit_baseline424)),
  'revoked Owner session denial is durably audited');
select ok(exists(select 1 from app_private.privileged_audit_events where actor_role='administrator'
  and action='owner_team_access_revoked' and reason_code='site_admin_removed'
  and reason_text='Access removed after authorization mismatch'),
  'Site Admin removal is audited with the administrator actor and reason');
select is((select revocation_reason from app_private.role_grants
  where grant_id=(select grant_id from admin_team_grant424)),
  'Access removed after authorization mismatch',
  'Site Admin removal retains the supplied reason on the revoked grant');
select * from finish();
rollback;
