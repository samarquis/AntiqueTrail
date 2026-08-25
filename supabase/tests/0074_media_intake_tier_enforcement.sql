-- Package 13 intake tier cap enforcement tests (red-first)
-- Tests check_store_media_cap at the media upload intake gate.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Test 4: Featured tier (subscription) -> cap 15, allowed when under
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000002','featured','subscription')
  on conflict (store_id) do update set tier='featured',source='subscription';
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000002','gallery',gen_random_uuid()))->>'allowed','true','featured tier under cap -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000002','gallery',gen_random_uuid()))->>'remaining','15','featured tier -> 15 remaining');

-- Test 5: Unlimited tier -> unlimited cap (remaining -1)
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000003','unlimited','subscription')
  on conflict (store_id) do update set tier='unlimited',source='subscription';
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000003','gallery',gen_random_uuid()))->>'allowed','true','unlimited tier -> allowed');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000003','gallery',gen_random_uuid()))->>'remaining','-1','unlimited tier -> remaining -1 (unlimited)');

-- Test 6: At cap rejection with upgrade copy (free tier at 5)
-- Create store with free tier and 5 approved gallery images
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000004','free','default')
  on conflict (store_id) do update set tier='free',source='default';
-- Insert 5 approved gallery media
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
  select gen_random_uuid(), '00000000-0000-4000-8000-000000000004', 'gallery', 'approved',
    'q/'||gen_random_uuid()::text||'/original', 'q/'||gen_random_uuid()::text||'/derivative.webp',
    '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256'
  from generate_series(1,5);
-- Now at cap (5), next gallery upload should be rejected
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'allowed','false','free tier at 5 gallery -> rejected');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'error','media_cap_exceeded','error code is media_cap_exceeded');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'message',null,'has message field');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'upgradeTier','featured','upgrade tier is featured');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000004','gallery',gen_random_uuid()))->>'upgradeCap','15','upgrade cap is 15');

-- Test 7: Featured tier at 15 rejected with unlimited upgrade copy
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000005','featured','subscription')
  on conflict (store_id) do update set tier='featured',source='subscription';
-- Insert 15 approved gallery images
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
  select gen_random_uuid(), '00000000-0000-4000-8000-000000000005', 'gallery', 'approved',
    'q/'||gen_random_uuid()::text||'/original', 'q/'||gen_random_uuid()::text||'/derivative.webp',
    '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256'
  from generate_series(1,15);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'allowed','false','featured tier at 15 gallery -> rejected');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'upgradeTier','unlimited','upgrade tier is unlimited');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000005','gallery',gen_random_uuid()))->>'upgradeCap',null,'upgrade cap is null (unlimited)');

-- Test 8: Cover upload always allowed regardless of cap
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000006','free','default')
  on conflict (store_id) do update set tier='free',source='default';
-- Even with 5 approved gallery images, cover is always allowed
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
  select gen_random_uuid(), '00000000-0000-4000-8000-000000000006', 'gallery', 'approved',
    'q/'||gen_random_uuid()::text||'/original', 'q/'||gen_random_uuid()::text||'/derivative.webp',
    '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256'
  from generate_series(1,5);
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000006','cover',gen_random_uuid()))->>'allowed','true','cover always allowed even at cap');
select is((partner_private.check_store_media_cap('00000000-0000-4000-8000-000000000006','cover',gen_random_uuid()))->>'remaining','1','cover has 1 remaining');

-- Test 8b: Invalid kind rejected
select is((partner_private.check_store_media_cap(gen_random_uuid(),'invalid',gen_random_uuid()))->>'allowed','false','invalid kind rejected');
-- Test 8c: Null inputs rejected
select is((partner_private.check_store_media_cap(null,'gallery',gen_random_uuid()))->>'allowed','false','null store_id rejected');
select is((partner_private.check_store_media_cap(gen_random_uuid(),'gallery',null))<@>'allowed','false','null idempotency rejected');

select * from finish();
rollback;