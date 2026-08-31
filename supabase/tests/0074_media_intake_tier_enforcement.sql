-- Package 13 intake tier cap enforcement tests (red-first)
-- Tests check_store_media_cap at the media upload intake gate.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(id) values ('74000000-0000-4000-8000-000000000001');

insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description)
select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'db-ci-media-store-'||lpad(i::text,3,'0'), 'DB CI Media Store '||i, 'Topeka', 'KS',
  '1 Test Way', '00000000-0000-4000-8000-000000000001'::uuid,
  'Database CI fixture', 'Database CI fixture store'
from generate_series(1,6) i
on conflict (id) do nothing;

-- Test 1: Function exists and is accessible to media_automation
select has_function('partner_private','check_store_media_cap',array['uuid','text','uuid'],'intake cap check function exists');
select ok(has_function_privilege('media_automation','partner_private.check_store_media_cap(uuid,text,uuid)','EXECUTE'),'media_automation has EXECUTE on intake cap check');
select ok(not has_function_privilege('authenticated','partner_private.check_store_media_cap(uuid,text,uuid)','EXECUTE'),'browser roles cannot call intake cap check');

-- Test 2: Cover uploads always allowed (single cover slot)
select is((partner_private.check_store_media_cap(gen_random_uuid(),'cover',gen_random_uuid()))->>'allowed','true','cover upload always allowed');
select is((partner_private.check_store_media_cap(gen_random_uuid(),'cover',gen_random_uuid()))->>'remaining','1','cover always has 1 remaining');

-- Test 3: Gallery upload to store with no tier row (free default cap 5) -> allowed
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000001','gallery',gen_random_uuid()))->>'allowed','true','gallery upload to no-tier-row store -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000001','gallery',gen_random_uuid()))->>'remaining','5','free tier -> 5 remaining');

-- Test 3b: Gallery upload to store with explicit free tier -> cap 5
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000001','free','default')
  on conflict (store_id) do update set tier='free',source='default';
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000001','gallery',gen_random_uuid()))->>'allowed','true','explicit free tier -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000001','gallery',gen_random_uuid()))->>'remaining','5','free tier -> 5 remaining');

-- Test 4: Gallery tier (subscription) -> cap 15, allowed when under
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000002','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000002','gallery',gen_random_uuid()))->>'allowed','true','gallery tier under cap -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000002','gallery',gen_random_uuid()))->>'remaining','15','gallery tier -> 15 remaining');

-- Test 5: Full_gallery tier -> full_gallery cap (remaining -1)
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000003','full_gallery','subscription')
  on conflict (store_id) do update set tier='full_gallery',source='subscription';
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000003','gallery',gen_random_uuid()))->>'allowed','true','full_gallery tier -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000003','gallery',gen_random_uuid()))->>'remaining','-1','full_gallery tier -> remaining -1 (full_gallery)');

-- Test 6: At cap rejection with upgrade copy (free tier at 5)
-- Create store with free tier and 5 approved gallery images
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000004','free','default')
  on conflict (store_id) do update set tier='free',source='default';
-- Insert 5 approved gallery media
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000004', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '74000000-0000-4000-8000-000000000001', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,5);
-- Now at cap (5), next gallery upload should be rejected
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'allowed','false','free tier at 5 gallery -> rejected');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'error','media_cap_exceeded','error code is media_cap_exceeded');
select ok((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'message' is not null,'has message field');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'upgradeTier','gallery','upgrade tier is gallery');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'upgradeCap','15','upgrade cap is 15');

-- Test 7: Gallery tier at 15 rejected with full_gallery upgrade copy
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000005','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
-- Insert 15 approved gallery images
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000005', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '74000000-0000-4000-8000-000000000001', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,15);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'allowed','false','gallery tier at 15 gallery -> rejected');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'upgradeTier','full_gallery','upgrade tier is full_gallery');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'upgradeCap',null,'upgrade cap is null (full_gallery)');

-- Test 8: Cover upload always allowed regardless of cap
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000006','free','default')
  on conflict (store_id) do update set tier='free',source='default';
-- Even with 5 approved gallery images, cover is always allowed
insert into media_private.media_uploads (upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key, source_mime, source_bytes, source_width, source_height, scan_state, metadata_stripped, reencoded, state, approved_by, approved_at, approval_reason, original_object_key, private_derivative_object_key, derivative_digest, derivative_width, derivative_height, derivative_bytes)
  select gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000006', 'gallery', 'Test image', statement_timestamp(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'clean', true, true, 'approved_pending_publish', '74000000-0000-4000-8000-000000000001', statement_timestamp(), 'image_quality_verified',
    'quarantine/'||gen_random_uuid()::text||'/original', 'quarantine/'||gen_random_uuid()::text||'/derivative.webp',
    decode(repeat('00',32),'hex'), 640, 480, 100000
  from generate_series(1,5);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000006','cover',gen_random_uuid()))->>'allowed','true','cover always allowed even at cap');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000006','cover',gen_random_uuid()))->>'remaining','1','cover has 1 remaining');

-- Test 8b: Invalid kind rejected
select throws_ok('select partner_private.check_store_media_cap(gen_random_uuid(),''invalid'',gen_random_uuid())','22023','media_intake_invalid_input','invalid kind rejected');
-- Test 8c: Null inputs rejected
select throws_ok('select partner_private.check_store_media_cap(null::uuid,''gallery'',gen_random_uuid())','22023','media_intake_invalid_input','null store_id rejected');
select throws_ok('select partner_private.check_store_media_cap(gen_random_uuid(),''gallery'',null::uuid)','22023','media_intake_invalid_input','null idempotency rejected');

select * from finish();
rollback;
