-- Package 13 Store Portal media history with rejection reasons tests (red-first)

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- The portal RPC resolves the store from the authenticated partner grant. Keep
-- the fixture explicit so this test exercises the real request boundary.
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
insert into app_public.store_media(id, store_id, asset_path, kind, alt_text, display_order)
values ('76000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','/assets/db-ci-portal-media.svg','gallery','Database CI fixture',0);

-- Test 1: Function exists and accessible to authenticated store partners
select has_function('app_public','portal_list_media_uploads',array[]::text[],'portal_list_media_uploads exists');
select ok(has_function_privilege('authenticated','app_public.portal_list_media_uploads()','EXECUTE'),'authenticated partners can call portal_list_media_uploads');
select ok(not has_function_privilege('anon','app_public.portal_list_media_uploads()','EXECUTE'),'anon cannot call portal_list_media_uploads');
select ok(app_private.current_session_is_active(),'representative request has an active server session');
select ok(app_private.current_session_has_mfa() and app_private.current_session_recent_auth(interval '10 minutes'),'representative request has MFA and recent authentication');
select ok(
  position('count(*)=1' in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0
  and position('portal_private.require_portal_scope()' in lower(pg_get_functiondef('app_public.portal_list_media_uploads()'::regprocedure)))>0,
  'media history uses the exact-one shared Portal scope resolver without exposing it to browser roles'
);

-- Test 2: Returns empty array for store with no uploads
select is((app_public.portal_list_media_uploads()->'uploads')::text,'[]','no uploads -> empty array');

-- Test 3: Returns uploads with rejection reasons for awaiting_review state
-- Create uploads in different states
insert into media_private.media_uploads (
  upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key,
  source_mime, source_bytes, source_width, source_height, original_object_key,
  private_derivative_object_key, public_derivative_object_key, catalog_media_id,
  derivative_digest, derivative_bytes, derivative_width, derivative_height, scan_state,
  metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, published_at
)
values
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000011/original', 'quarantine/00000000-0000-4000-8000-000000000011/derivative.webp', null, null, decode(repeat('00',32),'hex'), 100000, 640, 480, 'clean', true, true, 'awaiting_review', null, null, null, null),
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000012/original', 'quarantine/00000000-0000-4000-8000-000000000012/derivative.webp', null, null, decode(repeat('00',32),'hex'), 100000, 640, 480, 'clean', true, true, 'rejected', null, null, null, null),
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000013/original', 'quarantine/00000000-0000-4000-8000-000000000013/derivative.webp', 'official/00000000-0000-4000-8000-000000000001/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp', '76000000-0000-4000-8000-000000000008', decode(repeat('00',32),'hex'), 100000, 640, 480, 'clean', true, true, 'published', '76000000-0000-4000-8000-000000000001', now(), 'image_quality_verified', now()),
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000009', 'gallery', 'Other store image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000014/original', 'quarantine/00000000-0000-4000-8000-000000000014/derivative.webp', null, null, decode(repeat('00',32),'hex'), 100000, 640, 480, 'clean', true, true, 'awaiting_review', null, null, null, null);

update media_private.media_uploads
set created_at = case
  when original_object_key like '%000000000012/original' then now()
  when original_object_key like '%000000000013/original' then now() - interval '1 second'
  else now() - interval '2 seconds'
end
where store_id = '00000000-0000-4000-8000-000000000001';

-- Add rejection reason to rejected upload
update media_private.media_uploads
set rejection_reason = 'Image quality insufficient for storefront'
where store_id = '00000000-0000-4000-8000-000000000001' and state = 'rejected';

-- Test: list returns all uploads with rejection reasons
select is(jsonb_array_length(app_public.portal_list_media_uploads()->'uploads'),3,'returns only the 3 own-store uploads');
select is(
  (select array_agg(key order by key) from jsonb_object_keys(app_public.portal_list_media_uploads()->'uploads'->0) key),
  array['altText','kind','rejectionReason','state','submittedAt','uploadId'],
  'each upload has exactly the six Portal-authorized keys'
);
select ok(
  not exists(
    select 1 from jsonb_array_elements(app_public.portal_list_media_uploads()->'uploads') upload
    where upload ?| array['originalObjectKey','derivativeObjectKey','approvedAt','rejectedAt','derivativeWidth','derivativeHeight','bucket','url','signedUrl']
  ),
  'history never exposes storage identifiers, media metadata, or signing material'
);
select ok((app_public.portal_list_media_uploads()->'uploads'->0)->>'rejectionReason' is not null,'rejected upload has rejectionReason');
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'state'),'rejected','rejected state present');
select is((app_public.portal_list_media_uploads()->'uploads'->1->>'state'),'published','published state present');
select is((app_public.portal_list_media_uploads()->'uploads'->2->>'state'),'awaiting_review','awaiting_review state present');

-- Test ordering: most recent first
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'state'),'rejected','most recent first (rejected)');
select ok(
  position(
    'order by mu.created_at desc, mu.upload_id desc'
    in pg_get_functiondef('app_public.portal_list_media_uploads()'::regprocedure)
  ) > 0,
  'equal submission timestamps have a stable upload-id tie-breaker'
);

-- Test: rejectionReason populated for rejected uploads
select ok((app_public.portal_list_media_uploads()->'uploads'->0->>'rejectionReason') is not null,'rejected upload has rejectionReason');
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'rejectionReason'),'Image quality insufficient for storefront','rejection reason verbatim');

-- Test: rejectionReason is null for non-rejected
select is((app_public.portal_list_media_uploads()->'uploads'->1->>'rejectionReason'),null,'published has null rejectionReason');
select is((app_public.portal_list_media_uploads()->'uploads'->2->>'rejectionReason'),null,'awaiting_review has null rejectionReason');

-- Test: resubmit creates new awaiting_review upload (via standard intake path)
-- Resubmit is just a new media upload via standard intake; no direct SQL function needed.
-- The portal calls the standard media ingest flow with the original upload_id as reference.

-- Test: rejected uploads show rejection reason verbatim
select ok((app_public.portal_list_media_uploads()->'uploads'->0->>'rejectionReason') like '%insufficient%','rejection reason verbatim');

-- Test: approved_pending_publish and published states included
select ok((select count(*) from jsonb_array_elements(app_public.portal_list_media_uploads()->'uploads') e where e->>'state' in ('published','approved_pending_publish','awaiting_review','rejected'))=3,'all states included');

-- A separately authenticated representative is granted only the other store;
-- its successful response must not reveal that this store has three uploads.
insert into auth.users(id) values ('76000000-0000-4000-8000-000000000016');
insert into auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at)
values (
  '76000000-0000-4000-8000-000000000025', '76000000-0000-4000-8000-000000000016',
  'totp', 'verified', statement_timestamp(), statement_timestamp()
);
insert into partner_private.partner_invitations(
  invitation_id, token_hash, recipient_email_hmac, created_by, state, consumed_at
) values (
  '76000000-0000-4000-8000-000000000017', decode(repeat('11',32),'hex'),
  decode(repeat('12',32),'hex'), '76000000-0000-4000-8000-000000000001', 'consumed', statement_timestamp()
);
insert into partner_private.pending_partner_identities(
  pending_identity_id, invitation_id, email_hmac, auth_user_id, state,
  verified_email_at, mfa_verified_at, bound_at
) values (
  '76000000-0000-4000-8000-000000000018', '76000000-0000-4000-8000-000000000017',
  decode(repeat('12',32),'hex'), '76000000-0000-4000-8000-000000000016', 'bound',
  statement_timestamp(), statement_timestamp(), statement_timestamp()
);
insert into partner_private.provisional_partner_consents(
  provisional_consent_id, invitation_id, pending_identity_id, policy_version,
  typed_name, business_title, store_name, owner_email_hmac,
  authority_ack, voluntary_ack, permitted_data_ack, no_payment_endorsement_ack,
  withdrawal_ack, idempotency_key
) values (
  '76000000-0000-4000-8000-000000000019', '76000000-0000-4000-8000-000000000017',
  '76000000-0000-4000-8000-000000000018', 'synthetic-v3', 'Other Portal Owner',
  'Owner', 'Other Store', decode(repeat('12',32),'hex'), true, true, true, true, true,
  'portal-media-history-other-consent'
);
insert into partner_private.pilot_consent_receipts(
  consent_receipt_id, provisional_consent_id, pending_identity_id, invitation_id,
  auth_user_id, verified_email_hmac, policy_version, receipt_checksum
) values (
  '76000000-0000-4000-8000-000000000020', '76000000-0000-4000-8000-000000000019',
  '76000000-0000-4000-8000-000000000018', '76000000-0000-4000-8000-000000000017',
  '76000000-0000-4000-8000-000000000016', decode(repeat('12',32),'hex'), 'synthetic-v3',
  decode(repeat('13',32),'hex')
);
insert into partner_private.store_partnerships(
  partnership_id, pending_identity_id, auth_user_id, store_id, consent_receipt_id,
  state, started_at
) values (
  '76000000-0000-4000-8000-000000000021', '76000000-0000-4000-8000-000000000018',
  '76000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000009',
  '76000000-0000-4000-8000-000000000020', 'active', statement_timestamp()
);
insert into partner_private.store_partner_grants(
  grant_id, partnership_id, auth_user_id, store_id
) values (
  '76000000-0000-4000-8000-000000000022', '76000000-0000-4000-8000-000000000021',
  '76000000-0000-4000-8000-000000000016', '00000000-0000-4000-8000-000000000009'
);
set local role identity_service;
insert into app_private.active_sessions(
  session_id, user_id, provider_created_at, session_epoch, last_authenticated_at,
  mfa_verified_at, access_token_expires_at
) values (
  '76000000-0000-4000-8000-000000000023', '76000000-0000-4000-8000-000000000016',
  statement_timestamp(), 1, statement_timestamp(), statement_timestamp(),
  statement_timestamp() + interval '30 minutes'
);
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','76000000-0000-4000-8000-000000000016',
  'session_id','76000000-0000-4000-8000-000000000023',
  'aal','aal2',
  'amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)
  )
)::text, true);
select is(jsonb_array_length(app_public.portal_list_media_uploads()->'uploads'),1,'a separately authorized representative receives only its own-store history');
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'altText'),'Other store image','a separately authorized representative cannot observe target-store media or count');

set local role anon;
select throws_ok($$select app_public.portal_list_media_uploads()$$,'42501',null,'anonymous callers receive no media-history response');
reset role;

insert into auth.users(id) values ('76000000-0000-4000-8000-000000000015');
select set_config('request.jwt.claims', jsonb_build_object('sub','76000000-0000-4000-8000-000000000015')::text, true);
select throws_ok($$select app_public.portal_list_media_uploads()$$,'42501','portal_unavailable','authenticated callers without a grant receive no media-history response');

select * from finish();
rollback;
