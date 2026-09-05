begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Transaction-local synthetic actors; real sessions, grants, consent and RPCs.
insert into app_public.stores (id, slug, name, town, state_code, address, area_id, summary, description)
values ('00000000-0000-4000-8000-000000000001','db-ci-portal-media-store','Test Store','Topeka','KS','1 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Database CI fixture store')
on conflict (id) do nothing;
insert into app_public.stores (id, slug, name, town, state_code, address, area_id, summary, description)
values ('00000000-0000-4000-8000-000000000009','db-ci-portal-media-other-store','Other Store','Topeka','KS','2 Test Way','00000000-0000-4000-8000-000000000001','Database CI fixture','Other Database CI fixture store')
on conflict (id) do nothing;
insert into auth.users(id) values ('76000000-0000-4000-8000-000000000001');
insert into auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at)
values (
  '76000000-0000-4000-8000-000000000024', '76000000-0000-4000-8000-000000000001',
  'totp', 'verified', statement_timestamp(), statement_timestamp()
);
insert into partner_private.partner_invitations(
  invitation_id, token_hash, recipient_email_hmac, created_by, state, consumed_at
) values (
  '76000000-0000-4000-8000-000000000002', decode(repeat('01',32),'hex'),
  decode(repeat('02',32),'hex'), '76000000-0000-4000-8000-000000000001', 'consumed', statement_timestamp()
);
insert into partner_private.pending_partner_identities(
  pending_identity_id, invitation_id, email_hmac, auth_user_id, state,
  verified_email_at, mfa_verified_at, bound_at
) values (
  '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000002',
  decode(repeat('02',32),'hex'), '76000000-0000-4000-8000-000000000001', 'bound',
  statement_timestamp(), statement_timestamp(), statement_timestamp()
);
insert into partner_private.provisional_partner_consents(
  provisional_consent_id, invitation_id, pending_identity_id, policy_version,
  typed_name, business_title, store_name, owner_email_hmac,
  authority_ack, voluntary_ack, permitted_data_ack, no_payment_endorsement_ack,
  withdrawal_ack, idempotency_key
) values (
  '76000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000003', 'synthetic-v3', 'Portal Test Owner',
  'Owner', 'Test Store', decode(repeat('02',32),'hex'), true, true, true, true, true,
  'portal-media-history-consent'
);
insert into partner_private.pilot_consent_receipts(
  consent_receipt_id, provisional_consent_id, pending_identity_id, invitation_id,
  auth_user_id, verified_email_hmac, policy_version, receipt_checksum
) values (
  '76000000-0000-4000-8000-000000000005', '76000000-0000-4000-8000-000000000004',
  '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000001', decode(repeat('02',32),'hex'), 'synthetic-v3',
  decode(repeat('03',32),'hex')
);
insert into partner_private.store_partnerships(
  partnership_id, pending_identity_id, auth_user_id, store_id, consent_receipt_id,
  state, started_at
) values (
  '76000000-0000-4000-8000-000000000006', '76000000-0000-4000-8000-000000000003',
  '76000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000005', 'active', statement_timestamp()
);
insert into partner_private.store_partner_grants(
  grant_id, partnership_id, auth_user_id, store_id
) values (
  '76000000-0000-4000-8000-000000000007', '76000000-0000-4000-8000-000000000006',
  '76000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'
);
set local role identity_service;
insert into app_private.active_sessions(
  session_id, user_id, provider_created_at, session_epoch, last_authenticated_at,
  mfa_verified_at, access_token_expires_at
) values (
  '76000000-0000-4000-8000-000000000008', '76000000-0000-4000-8000-000000000001',
  statement_timestamp(), 1, statement_timestamp(), statement_timestamp(),
  statement_timestamp() + interval '30 minutes'
);
reset role;
do $$ begin
  perform set_config('request.jwt.claims',
    jsonb_build_object(
      'sub','76000000-0000-4000-8000-000000000001',
      'session_id','76000000-0000-4000-8000-000000000008',
      'aal','aal2',
      'amr',jsonb_build_array(
        jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
        jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)
      )
    )::text, true);
end $$;

select ok(not (select distribution_enabled or measurement_enabled from promotion_private.capability),'both capabilities start off');
set local role authenticated;
select is(jsonb_array_length(app_public.promotion_channels()),4,'four separate exact-store channel controls');
select is(app_public.promotion_channel_command('flyer','consent',0)->>'allowed','true','consent can be prepared while distribution is off');
select is(app_public.promotion_channel_command('flyer','reprint',2)->>'allowed','false','reprint denies while off');
select is(app_public.promotion_channel_command('flyer','withdraw',2)->>'removalRequested','true','withdrawal remains available while paused and requests removal');
select throws_ok($$select app_public.promotion_channel_command('flyer','consent',2)$$,'40001','promotion_changed','stale consent cannot undo withdrawal');
select throws_ok($$select app_public.promotion_channel_command('owner_card','consent',0,true)$$,'42501','promotion_unavailable','Representative cannot grant generic campaign permission');
select throws_ok($$select app_public.promotion_channel_command('other','consent',0)$$,'22023','promotion_unavailable','unknown channel denies');
select throws_ok($$select app_public.promotion_channel_command('social','consent',null)$$,'22023','promotion_unavailable','null version denies');
select throws_ok($$select * from promotion_private.channel_permissions$$,'42501',null,'no direct permission-table reads');
reset role;
select is((select count(*) from promotion_private.channel_events where not allowed),1::bigint,'denied reprint is audited');
select is((select count(*) from promotion_private.channel_permissions where consented),0::bigint,'withdrawal does not grant any sibling channel');

-- Real gate rows, not mocked authority functions; all rolled back at the end.
insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state,
 migration_set_digest,config_digest,frozen_store_set_digest)
values('17300000-0000-4000-8000-000000000001','topeka-ks','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active',
 'sha256:'||repeat('4',64),'sha256:'||repeat('5',64),decode(repeat('6',64),'hex'));
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
values('17300000-0000-4000-8000-000000000001',true,true,true,true,true);
insert into release_private.release_gate_receipts(gate_receipt_id,release_id,gate_kind,receipt_digest,artifact_digest,migration_set_digest,config_digest,frozen_store_set_digest,external_verified,accepted_at)
values('17300000-0000-4000-8000-000000000002','17300000-0000-4000-8000-000000000001','promotion_rights_consent',decode(repeat('7',64),'hex'),
 'sha256:'||repeat('1',64),'sha256:'||repeat('4',64),'sha256:'||repeat('5',64),decode(repeat('6',64),'hex'),true,statement_timestamp());
insert into release_private.release_frozen_stores(release_id,store_id,ordinal,two_person_provenance,required_fields_fresh,excludes_pilot_private_fields,
 rights_and_consent_current,no_duplicate_closure_or_hold,exact_area_verified,source_evidence_digest)
values('17300000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',1,true,true,true,true,true,true,decode(repeat('8',64),'hex'));
update promotion_private.capability set distribution_enabled=true,measurement_enabled=true;
set local role authenticated;
select is(app_public.promotion_channel_command('flyer','reprint',3)->>'allowed','false','release activation cannot resurrect withdrawn permission');
select is(app_public.promotion_channel_command('flyer','consent',3)->>'allowed','true','fresh channel consent succeeds');
select is(app_public.promotion_channel_command('flyer','reprint',4)->>'allowed','true','current exact-store consent plus release receipt allows reprint authorization');
select throws_ok($$select app_public.promotion_channel_command('flyer','reprint',4)$$,'40001','promotion_changed','consumed version cannot replay authorization');
select is(app_public.promotion_channel_command('co_brand','distribute',0)->>'allowed','false','flyer authority cannot authorize co-branding');
select is(app_public.promotion_channel_command('social','consent',0)->>'allowed','true','social consent is separate');
select is(app_public.promotion_channel_command('social','reprint',2)->>'allowed','false','social permission cannot be repurposed as printing');
select is(app_public.promotion_channel_command('social','post',2)->>'allowed','true','one voluntary post authorized');
select is(app_public.promotion_channel_command('social','post',3)->>'allowed','false','one permission cannot authorize a second post');
reset role;
update release_private.release_frozen_stores set rights_and_consent_current=false where release_id='17300000-0000-4000-8000-000000000001';
set local role authenticated;
select is(app_public.promotion_channel_command('flyer','reprint',5)->>'allowed','false','stale exact-store release consent denies');
reset role;
update release_private.regional_releases set state='rolled_back' where release_id='17300000-0000-4000-8000-000000000001';
set local role authenticated;
select is(app_public.promotion_channel_command('flyer','reprint',5)->>'allowed','false','release rollback denies future use');
select is(app_public.promotion_channel_command('flyer','withdraw',5)->>'allowed','true','rollback never prevents withdrawal');
reset role;
update partner_private.store_partner_grants set state='revoked' where grant_id='76000000-0000-4000-8000-000000000007';
set local role authenticated;
select throws_ok($$select app_public.promotion_channels()$$,'42501','portal_unavailable','revoked grant cannot read channel state');
select throws_ok($$select app_public.promotion_channel_command('flyer','consent',6)$$,'42501','portal_unavailable','revoked grant cannot renew consent');
reset role;

-- Aggregate-only API: strict source allowlist, no caller day or personal payload.
insert into promotion_private.sources(code,active) values(repeat('a',32),true);
set local role anon;
select is(app_public.promotion_count(repeat('a',32),'open'),false,'rollback also disables campaign measurement');
select throws_ok($$select app_public.promotion_channels()$$,'42501',null,'anonymous caller cannot read owner permissions');
select throws_ok($$select app_public.promotion_retention()$$,'42501',null,'anonymous caller cannot run lifecycle job');
reset role;
update release_private.regional_releases set state='active' where release_id='17300000-0000-4000-8000-000000000001';
set local role anon;
select is(app_public.promotion_count(repeat('a',32),'open'),true,'allowlisted source counts an open');
select is(app_public.promotion_count(repeat('a',32),'open'),true,'second open increments same daily row');
select is(app_public.promotion_count(repeat('b',32),'open'),false,'unknown opaque source does not count');
select is(app_public.promotion_count('owner@example.test','open'),false,'identity-shaped source denied');
select is(app_public.promotion_count(repeat('a',32),'account_signup'),false,'unapproved event denied');
reset role;
select is((select count(*) from promotion_private.daily_counts),1::bigint,'no event-level records');
select is((select count from promotion_private.daily_counts),2::bigint,'daily count aggregates calls');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
 where table_schema='promotion_private' and table_name='daily_counts'),array['code','day','event','count'],'aggregate schema has no identity, store or request fields');
insert into promotion_private.daily_counts values(repeat('a',32),(statement_timestamp() at time zone 'UTC')::date-180,'open',1),
 (repeat('a',32),(statement_timestamp() at time zone 'UTC')::date-179,'open',1);
insert into promotion_private.channel_events(permission_id,operation,allowed,created_at)
values('17300000-0000-4000-8000-000000000099','withdraw',true,statement_timestamp()-interval '3 years');
set local role account_lifecycle_service;
select lives_ok($$select app_public.promotion_retention()$$,'scoped retention job runs');
reset role;
select is((select count(*) from promotion_private.daily_counts),2::bigint,'180-day boundary purges old aggregate and retains newer rows');
select is((select count(*) from promotion_private.channel_events where permission_id='17300000-0000-4000-8000-000000000099'),0::bigint,'content-free event expires at three years');
select * from finish();
rollback;

