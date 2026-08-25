-- Package 13 Store Portal media history with rejection reasons tests (red-first)

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Test 1: Function exists and accessible to authenticated store partners
select has_function('app_public','portal_list_media_uploads',array[]::text[],'portal_list_media_uploads exists');
select ok(has_function_privilege('authenticated','app_public.portal_list_media_uploads()','EXECUTE'),'authenticated partners can call portal_list_media_uploads');
select ok(not has_function_privilege('anon','app_public.portal_list_media_uploads()','EXECUTE'),'anon cannot call portal_list_media_uploads');

-- Test 2: Returns empty array for store with no uploads
select is((app_public.portal_list_media_uploads())::text,'[]','no uploads -> empty array');

-- Test 3: Returns uploads with rejection reasons for awaiting_review state
insert into app_public.stores (id, name) values ('00000000-0000-4000-8000-000000000001','Test Store') on conflict (id) do nothing;

-- Create uploads in different states
insert into media_private.media_uploads (upload_id, store_id, kind, state, original_object_key, derivative_object_key, derivative_digest, width, height, derivative_bytes, scan_operation_id, processor_operation_id, derivative_digest_alg)
values
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'awaiting_review', 'q/1/original', 'q/1/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'rejected', 'q/2/original', 'q/2/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256'),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'published', 'q/3/original', 'q/3/derivative.webp', '\x'||repeat('00',32), 640, 480, 100000, 'scan1', 'proc1', 'sha256');

-- Add rejection reason to rejected upload
update media_private.media_uploads
set rejection_reason = 'Image quality insufficient for storefront'
where store_id = '00000000-0000-4000-8000-000000000001' and state = 'rejected';

-- Test: list returns all uploads with rejection reasons
select is(jsonb_array_length(app_public.portal_list_media_uploads()),3,'returns 3 uploads');
select ok((app_public.portal_list_media_uploads()->0)->>'rejectionReason' is not null,'rejected upload has rejectionReason');
select is((app_public.portal_list_media_uploads()->0->>'state'),'rejected','rejected state present');
select is((app_public.portal_list_media_uploads()->1->>'state'),'published','published state present');
select is((app_public.portal_list_media_uploads()->2->>'state'),'awaiting_review','awaiting_review state present');

-- Test ordering: most recent first
select is((app_public.portal_list_media_uploads()->0->>'state'),'rejected','most recent first (rejected)');

-- Test: rejectionReason populated for rejected uploads
select ok((app_public.portal_list_media_uploads()->0->>'rejectionReason') is not null,'rejected upload has rejectionReason');
select is((app_public.portal_list_media_uploads()->0->>'rejectionReason'),'Image quality insufficient for storefront','rejection reason verbatim');

-- Test: rejectionReason is null for non-rejected
select is((app_public.portal_list_media_uploads()->1->>'rejectionReason'),null,'published has null rejectionReason');
select is((app_public.portal_list_media_uploads()->2->>'rejectionReason'),null,'awaiting_review has null rejectionReason');

-- Test: resubmit creates new awaiting_review upload (via standard intake path)
-- Resubmit is just a new media upload via standard intake; no direct SQL function needed.
-- The portal calls the standard media ingest flow with the original upload_id as reference.

-- Test: rejected uploads show rejection reason verbatim
select ok((app_public.portal_list_media_uploads()->0->>'rejectionReason') like '%Insufficient%','rejection reason verbatim');

-- Test: approved_pending_publish and published states included
select ok((select count(*) from jsonb_array_elements(app_public.portal_list_media_uploads()) e where e->>'state' in ('published','approved_pending_publish','awaiting_review','rejected'))=3,'all states included');

select * from finish();
rollback;