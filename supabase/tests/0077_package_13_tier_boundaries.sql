-- Issue #174 cap boundary tests (red-first)
-- Closes the acceptance-criteria gaps left by 0073/0074:
-- pending/approved/rejected counting, replacement, idempotent retry,
-- legacy name normalization at the billing webhook boundary, and uncapped
-- shopper-read guards. Also rehearses the migration UPDATE statements against
-- a legacy-shaped shadow table.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
grant billing_automation to postgres;

insert into auth.users(id) values ('77000000-0000-4000-8000-000000000101');

insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description)
select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'db-ci-174-store-'||lpad(i::text,3,'0'), 'DB CI 174 Store '||i, 'Topeka', 'KS',
  '1 Test Way', '00000000-0000-4000-8000-000000000001'::uuid,
  'Database CI fixture', 'Database CI fixture store'
from generate_series(71,77) i
on conflict (id) do nothing;

-- Test 1: resolve_store_photo_cap is the single server authority; its signature
-- exposes only the store id, so a client tier/count value cannot be injected.
select has_function('partner_private','resolve_store_photo_cap',array['uuid'],'resolver authority function exists');
select is(pg_get_function_arguments('partner_private.resolve_store_photo_cap(uuid)'::regprocedure),'p_store_id uuid',
  'resolver signature exposes only store id (no tier/count override)');

-- Test 2: migration rehearsal against a legacy-shaped shadow table. Runs the
-- exact UPDATE statements from 20260831010000 in the same order (legacy check
-- dropped first, values converted, canonical check re-added).
create temp table tier_rehearsal (
  store_id uuid primary key,
  tier text not null,
  source text not null default 'subscription',
  constraint tier_rehearsal_legacy_check check (tier in ('free','featured','unlimited'))
);
insert into tier_rehearsal(store_id,tier)
values ('00000000-0000-4000-8000-000000000001','featured'),
       ('00000000-0000-4000-8000-000000000002','unlimited');
alter table tier_rehearsal drop constraint tier_rehearsal_legacy_check;
update tier_rehearsal set tier='gallery' where tier='featured';
update tier_rehearsal set tier='full_gallery' where tier='unlimited';
select is((select tier from tier_rehearsal where store_id='00000000-0000-4000-8000-000000000001'),'gallery',
  'rehearsal converts stored featured -> gallery');
select is((select tier from tier_rehearsal where store_id='00000000-0000-4000-8000-000000000002'),'full_gallery',
  'rehearsal converts stored unlimited -> full_gallery');
alter table tier_rehearsal
  add constraint tier_rehearsal_canonical_check check (tier in ('free','gallery','full_gallery'));
select throws_ok(
  'insert into tier_rehearsal(store_id,tier) values (''00000000-0000-4000-8000-000000000003'',''featured'')',
  '23514', NULL, 'canonical rehearsal constraint rejects featured after conversion');

-- Test 3: canonical constraints reject legacy values after migration.
select throws_ok(
  'insert into partner_private.store_photo_tier_state(store_id,tier,source) values (''00000000-0000-4000-8000-000000000071'',''featured'',''subscription'')',
  '23514', NULL, 'canonical tier check rejects featured');
insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
  values ('00000000-0000-4000-8000-000000000071','cus_174downgrad','sub_174downgrad','active','2099-12-31 23:59:59+00');
select throws_ok(
  'update partner_private.store_subscriptions set downgrade_to=''featured'' where store_id=''00000000-0000-4000-8000-000000000071''',
  '23514', NULL, 'downgrade_to check rejects featured');

-- Test 4: pending and rejected gallery rows never count toward the cap.
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000073','free','default')
  on conflict (store_id) do update set tier='free',source='default';
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000073', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'awaiting_review', NULL, NULL, NULL,
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,5);
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000073', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'rejected', NULL, NULL, NULL,
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,5);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000073','gallery',gen_random_uuid()))->>'allowed','true',
  'pending and rejected rows do not consume cap');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000073','gallery',gen_random_uuid()))->>'remaining','5',
  'free tier still reports 5 remaining with pending+rejected present');

-- Test 5: mixed states count only approved rows; boundary at 5.
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000074','free','default')
  on conflict (store_id) do update set tier='free',source='default';
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000074', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '77000000-0000-4000-8000-000000000101', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,4);
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000074', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'awaiting_review', NULL, NULL, NULL,
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,3);
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000074', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'rejected', NULL, NULL, NULL,
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,3);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'allowed','true',
  'four approved plus pending/rejected -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'remaining','1',
  'four approved -> 1 remaining');

-- Test 6: at cap the fifth approved flips to rejected with upgrade copy.
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000074', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '77000000-0000-4000-8000-000000000101', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,1);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'allowed','false',
  'fifth approved gallery -> rejected at free cap');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'error','media_cap_exceeded',
  'rejection error code is media_cap_exceeded');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'upgradeTier','gallery',
  'free at cap suggests gallery upgrade');

-- Test 7: replacement frees a slot without changing tier.
update media_private.media_uploads
  set state='rejected', rejected_by='77000000-0000-4000-8000-000000000101', rejected_at=statement_timestamp()
  where store_id='00000000-0000-4000-8000-000000000074'
    and state='approved_pending_publish'
    and upload_id=(select upload_id from media_private.media_uploads
      where store_id='00000000-0000-4000-8000-000000000074' and state='approved_pending_publish' limit 1);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'allowed','true',
  'replacement (approved -> rejected) frees a slot');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000074','gallery',gen_random_uuid()))->>'remaining','1',
  'replacement recovers 1 remaining');

-- Test 8: idempotent retry returns the identical result and cannot double-count.
select is(
  (select partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000075','gallery','22222222-2222-4222-8222-222222222222')::text),
  (select partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000075','gallery','22222222-2222-4222-8222-222222222222')::text),
  'same idempotency key returns identical intake result');
insert into media_private.media_uploads (upload_id, actor_user_id, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  values ('75000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000075','gallery','Test image',statement_timestamp(),'22222222-2222-4222-8222-222222222222','image/png',1000,640,480,'clean',true,true,'approved_pending_publish','77000000-0000-4000-8000-000000000101',statement_timestamp(),'image_quality_verified',
    'quarantine/75000000-0000-4000-8000-000000000001/original','quarantine/75000000-0000-4000-8000-000000000001/derivative.webp',decode(repeat('00',32),'hex'),640,480,100000);
select throws_ok(
  'insert into media_private.media_uploads (upload_id, actor_user_id, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes) values (''75000000-0000-4000-8000-000000000002'',''77000000-0000-4000-8000-000000000101'',''00000000-0000-4000-8000-000000000075'',''gallery'',''Test image'',statement_timestamp(),''22222222-2222-4222-8222-222222222222'',''image/png'',1000,640,480,''clean'',true,true,''approved_pending_publish'',''77000000-0000-4000-8000-000000000101'',statement_timestamp(),''image_quality_verified'',''quarantine/75000000-0000-4000-8000-000000000002/original'',''quarantine/75000000-0000-4000-8000-000000000002/derivative.webp'',decode(repeat(''00'',32),''hex''),640,480,100000)',
  '23505', NULL, 'idempotent retry with the same key cannot double-insert');

-- Test 9: Full Gallery never applies an undisclosed count cap.
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000076','full_gallery','subscription')
  on conflict (store_id) do update set tier='full_gallery',source='subscription';
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000076', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '77000000-0000-4000-8000-000000000101', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,20);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000076','gallery',gen_random_uuid()))->>'allowed','true',
  'full_gallery with 20 approved gallery -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000076','gallery',gen_random_uuid()))->>'remaining','-1',
  'full_gallery reports uncapped remaining');

-- Test 10: legacy webhook tier names normalize to canonical at the
-- migration-compatibility boundary (featured -> gallery, unlimited -> full_gallery).
insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
  values ('77000000-0000-4000-8000-000000000099','topeka-ks','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'sha256:'||repeat('c',64),'active');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion,photo_tiers_enabled)
  values ('77000000-0000-4000-8000-000000000099',true,true,true,true,true,true);
insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
  values ('00000000-0000-4000-8000-000000000077','cus_174webtest','sub_174webtest','active','2099-12-31 23:59:59+00');
select is(partner_private.billing_apply_subscription_event('evt_174Galler','subscription.updated',statement_timestamp(),
    '00000000-0000-4000-8000-000000000077','cus_174webtest','sub_174webtest','active','2099-12-31 23:59:59+00','featured'),
  'applied','legacy featured webhook event applies');
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000077'),'gallery',
  'featured webhook tier normalizes to gallery');
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000077'),15,
  'gallery cap applies after normalized webhook');
select is(partner_private.billing_apply_subscription_event('evt_174FullGa','subscription.updated',statement_timestamp(),
    '00000000-0000-4000-8000-000000000077','cus_174webtest','sub_174webtest','active','2099-12-31 23:59:59+00','unlimited'),
  'applied','legacy unlimited webhook event applies');
select is((select tier from partner_private.store_photo_tier_state where store_id='00000000-0000-4000-8000-000000000077'),'full_gallery',
  'unlimited webhook tier normalizes to full_gallery');
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000077'),null,
  'full_gallery cap applies after normalized webhook');

-- Test 11: shopper read path carries no hidden cap and never touches the intake ledger.
select ok(not position('limit' in lower(pg_get_functiondef('app_public.catalog_details(text)'::regprocedure)))>0,
  'catalog_details applies no row limit');
select ok(not exists(select 1 from information_schema.columns
    where table_schema='app_public' and table_name='store_media'
      and column_name in ('tier','cap','photo_count','count')),
  'catalog store_media carries no tier or count column');
select ok(position('store_media' in pg_get_functiondef('app_public.catalog_details(text)'::regprocedure))>0
    and not position('media_private.media_uploads' in pg_get_functiondef('app_public.catalog_details(text)'::regprocedure))>0,
  'catalog_details aggregates app_public.store_media only, never the intake ledger');

select * from finish();
rollback;
