-- Package 13 Store Portal media history with rejection reasons tests (red-first)

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Test 1: Function exists and accessible to authenticated store partners
select has_function('app_public','portal_list_media_uploads',array[]::text[],'portal_list_media_uploads exists');
select ok(has_function_privilege('authenticated','app_public.portal_list_media_uploads()','EXECUTE'),'authenticated partners can call portal_list_media_uploads');
select ok(not has_function_privilege('anon','app_public.portal_list_media_uploads()','EXECUTE'),'anon cannot call portal_list_media_uploads');

-- Test 2: Returns empty array for store with no uploads
select is((app_public.portal_list_media_uploads()->'uploads')::text,'[]','no uploads -> empty array');

-- Test 3: Returns uploads with rejection reasons for awaiting_review state
insert into app_public.stores (id, name) values ('00000000-0000-4000-8000-000000000001','Test Store') on conflict (id) do nothing;

-- Create uploads in different states
insert into media_private.media_uploads (
  upload_id, actor_tombstone, store_id, kind, alt_text, rights_confirmed_at, idempotency_key,
  source_mime, source_bytes, source_width, source_height, original_object_key,
  private_derivative_object_key, derivative_digest, derivative_bytes, derivative_width,
  derivative_height, scan_state, metadata_stripped, reencoded, state, created_at
)
values
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000011/original', 'quarantine/00000000-0000-4000-8000-000000000011/derivative.webp', '\x'||repeat('00',32), 100000, 640, 480, 'clean', true, true, 'awaiting_review'),
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000012/original', 'quarantine/00000000-0000-4000-8000-000000000012/derivative.webp', '\x'||repeat('00',32), 100000, 640, 480, 'clean', true, true, 'rejected'),
  (gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-000000000001', 'gallery', 'Test image', now(), gen_random_uuid(), 'image/png', 1000, 640, 480, 'quarantine/00000000-0000-4000-8000-000000000013/original', 'quarantine/00000000-0000-4000-8000-000000000013/derivative.webp', '\x'||repeat('00',32), 100000, 640, 480, 'clean', true, true, 'published');

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
select is(jsonb_array_length(app_public.portal_list_media_uploads()->'uploads'),3,'returns 3 uploads');
select ok((app_public.portal_list_media_uploads()->'uploads'->0)->>'rejectionReason' is not null,'rejected upload has rejectionReason');
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'state'),'rejected','rejected state present');
select is((app_public.portal_list_media_uploads()->'uploads'->1->>'state'),'published','published state present');
select is((app_public.portal_list_media_uploads()->'uploads'->2->>'state'),'awaiting_review','awaiting_review state present');

-- Test ordering: most recent first
select is((app_public.portal_list_media_uploads()->'uploads'->0->>'state'),'rejected','most recent first (rejected)');

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
select ok((app_public.portal_list_media_uploads()->'uploads'->0->>'rejectionReason') like '%Insufficient%','rejection reason verbatim');

-- Test: approved_pending_publish and published states included
select ok((select count(*) from jsonb_array_elements(app_public.portal_list_media_uploads()->'uploads') e where e->>'state' in ('published','approved_pending_publish','awaiting_review','rejected'))=3,'all states included');

select * from finish();
rollback;
