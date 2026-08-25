-- Package 13 Administrator media moderation queue tests (red-first)
-- Tests media_list_awaiting_review, media_approve_upload, media_reject_upload

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Test 1: Functions exist and have correct privileges
select has_function('app_public','media_list_awaiting_review',array['integer','integer'],'moderation queue list exists');
select has_function('app_public','media_approve_upload',array['uuid','text'],'approve upload exists');
select has_function('app_public','media_reject_upload',array['uuid','text'],'reject upload exists');

select ok(has_function_privilege('media_moderation','app_public.media_list_awaiting_review(integer,integer)','EXECUTE'),'media_moderation can list queue');
select ok(has_function_privilege('media_moderation','app_public.media_approve_upload(uuid,text)','EXECUTE'),'media_moderation can approve');
select ok(has_function_privilege('media_moderation','app_public.media_reject_upload(uuid,text)','EXECUTE'),'media_moderation can reject');
select ok(not has_function_privilege('authenticated','app_public.media_list_awaiting_review(integer,integer)','EXECUTE'),'browser cannot list queue');
select ok(not has_function_privilege('authenticated','app_public.media_approve_upload(uuid,text)','EXECUTE'),'browser cannot approve');
select ok(not has_function_privilege('authenticated','app_public.media_reject_upload(uuid,text)','EXECUTE'),'browser cannot reject');

-- Test 2: media_moderation role exists
select ok(exists(select 1 from pg_roles where rolname='media_moderation'),'media_moderation role exists');

-- Test 3: media_list_awaiting_review returns empty array when no uploads
select is((app_public.media_list_awaiting_review(50,0))::text,'[]','empty queue returns empty array');

-- Test 4: media_list_awaiting_review returns awaiting_review uploads with store context
-- Create test store and upload
insert into app_public.stores (id, name, address) values
  ('00000000-0000-4000-8000-000000000001','Test Store','123 Test St')
on conflict (id) do nothing;

insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'awaiting_review', 'q/1/original', 'q/1/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

-- List queue should return the upload with store context
select ok(jsonb_typeof(app_public.media_list_awaiting_review(50,0))='array','list returns array');
select is(jsonb_array_length(app_public.media_list_awaiting_review(50,0)),1,'queue has 1 item');
select is((app_public.media_list_awaiting_review(50,0)->0->>'store_name'),'Test Store','store name in queue item');
select is((app_public.media_list_awaiting_review(50,0)->0->>'kind'),'gallery','kind in queue item');
select is((app_public.media_list_awaiting_review(50,0)->0->>'state'),'awaiting_review','state in queue item');

-- Test pagination
select is(jsonb_array_length(app_public.media_list_awaiting_review(1,0)),1,'limit 1 returns 1');
select is(jsonb_array_length(app_public.media_list_awaiting_review(10,1)),0,'offset 1 after 1 item is empty');

-- Test approve: requires reason, advances state
-- Create a new upload for approval
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'awaiting_review', 'q/2/original', 'q/2/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

-- Get the upload_id for approval
\set approve_upload_id (select upload_id from media_private.media_uploads where state='awaiting_review' order by created_at desc limit 1)

-- Approve without reason should fail
select throws_ok('select app_public.media_approve_upload((select upload_id from media_private.media_uploads where state=''awaiting_review'' order by created_at desc limit 1),'''')','22023','moderation_reason_required','approve without reason fails');

-- Approve with reason succeeds
-- Note: we can't easily use the variable in pgtap, so we'll do a subquery
select ok((app_public.media_approve_upload(
  (select upload_id from media_private.media_uploads where state='awaiting_review' order by created_at desc limit 1),
  'Image quality verified, appropriate for storefront'
))->>'state','approved_pending_publish','approve with reason advances to approved_pending_publish');

-- Test reject: requires reason
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'awaiting_review', 'q/r1/original', 'q/r1/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

-- Reject without reason fails
select throws_ok('select app_public.media_reject_upload((select upload_id from media_private.media_uploads where state=''awaiting_review'' order by created_at desc limit 1),'''')','22023','moderation_reason_required','reject without reason fails');

-- Reject with reason succeeds
select ok((app_public.media_reject_upload(
  (select upload_id from media_private.media_uploads where state='awaiting_review' order by created_at desc limit 1),
  'Image quality insufficient for storefront'
))->>'state','rejected','reject with reason advances to rejected');

-- Test: approve/reject non-awaiting_review fails
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'approved', 'q/a/original', 'q/a/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

select throws_ok('select app_public.media_approve_upload((select upload_id from media_private.media_uploads where state=''approved'' order by created_at desc limit 1),''reason'')','55000','upload_not_awaiting_review','approve non-awaiting fails');

-- Test concurrent modification handling
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'awaiting_review', 'q/c1/original', 'q/c1/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

-- Manually bump version to simulate concurrent modification
update media_private.media_uploads set version = version + 100 where upload_id = (select upload_id from media_private.media_uploads where state='awaiting_review' order by created_at desc limit 1);

select throws_ok('select app_public.media_approve_upload((select upload_id from media_private.media_uploads where state=''awaiting_review'' order by created_at desc limit 1),''reason'')','55000','upload_concurrent_modification','concurrent modification detected');

-- Test non-existent upload
select throws_ok('select app_public.media_approve_upload(gen_random_uuid(),''reason'')','22023','upload_not_found','non-existent upload fails');

-- Test pagination
select is(jsonb_array_length(app_public.media_list_awaiting_review(1,0)),1,'limit 1 works');
select is(jsonb_array_length(app_public.media_list_awaiting_review(10,100)),0,'offset beyond count returns empty');

-- Test authorization: browser roles denied
select throws_ok('select app_public.media_list_awaiting_review(50,0)','42501','moderation_access_denied','browser cannot list');

select * from finish();
rollback;