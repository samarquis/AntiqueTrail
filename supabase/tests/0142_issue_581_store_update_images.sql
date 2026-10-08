-- #581: private image receipts bind to one Store Update until approved publish.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/issue_581_owner_updates.inc

insert into media_private.media_uploads(
  upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
  source_mime,source_bytes,source_width,source_height,original_object_key,
  private_derivative_object_key,derivative_digest,derivative_bytes,derivative_width,
  derivative_height,scan_state,metadata_stripped,reencoded,state
) values
 ('58100000-0000-4000-8000-000000000030','58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000011','store_update','Fresh arrivals',statement_timestamp(),
  '58100000-0000-4000-8000-000000000040','image/webp',1000,100,100,
  'quarantine/58100000-0000-4000-8000-000000000030/original',
  'quarantine/58100000-0000-4000-8000-000000000030/derivative.webp',decode(repeat('30',32),'hex'),
  900,100,100,'clean',true,true,'awaiting_review'),
 ('58100000-0000-4000-8000-000000000031','58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000011','store_update','Spring sale',statement_timestamp(),
  '58100000-0000-4000-8000-000000000041','image/webp',1000,100,100,
  'quarantine/58100000-0000-4000-8000-000000000031/original',
  'quarantine/58100000-0000-4000-8000-000000000031/derivative.webp',decode(repeat('31',32),'hex'),
  900,100,100,'clean',true,true,'awaiting_review'),
 ('58100000-0000-4000-8000-000000000032','58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000012','store_update','Wrong store',statement_timestamp(),
  '58100000-0000-4000-8000-000000000042','image/webp',1000,100,100,
  'quarantine/58100000-0000-4000-8000-000000000032/original',
  'quarantine/58100000-0000-4000-8000-000000000032/derivative.webp',decode(repeat('32',32),'hex'),
  900,100,100,'clean',true,true,'awaiting_review'),
 ('58100000-0000-4000-8000-000000000033','58100000-0000-4000-8000-000000000001',
  '58100000-0000-4000-8000-000000000011','store_update','Rejected image',statement_timestamp(),
  '58100000-0000-4000-8000-000000000043','image/webp',1000,100,100,
  'quarantine/58100000-0000-4000-8000-000000000033/original',
  'quarantine/58100000-0000-4000-8000-000000000033/derivative.webp',decode(repeat('33',32),'hex'),
  900,100,100,'clean',true,true,'awaiting_review');

-- Synthetic Alpha intentionally blocks provider intake. Override that dependency
-- only inside this rollback-only test so the reservation kind branch is exercised;
-- M-01 provider gating remains covered by 0056_m01_media_pipeline.sql.
select is(media_private.capability_enabled(),false,
  'synthetic Owner fixture keeps provider media capability disabled');
create or replace function media_private.capability_enabled() returns boolean
language sql stable security definer set search_path='' as $$ select true $$;

select ok(not has_table_privilege('authenticated','portal_private.store_update_image_bindings','SELECT')
  and not has_table_privilege('catalog_reader','portal_private.store_update_image_bindings','SELECT')
  and not has_table_privilege('service_role','portal_private.store_update_image_bindings','SELECT'),
  'image bindings remain private from browser, catalog and generic service roles');
select ok(not has_schema_privilege('identity_service','portal_private','CREATE')
  and not has_schema_privilege('identity_service','app_public','CREATE')
  and not has_schema_privilege('media_automation','media_private','CREATE')
  and not has_schema_privilege('media_automation','app_public','CREATE'),
  'ownership-only schema CREATE grants are not retained');

create temporary table issue581_image_created(value jsonb);
create temporary table issue581_image_create_replay(value jsonb);
create temporary table issue581_text_created(value jsonb);
create temporary table issue581_second_text_created(value jsonb);
create temporary table issue581_image_edited(value jsonb);
create temporary table issue581_image_edit_replay(value jsonb);
create temporary table issue581_image_stale(value jsonb);
create temporary table issue581_image_reuse(value jsonb);
create temporary table issue581_rejected_image(value jsonb);
create temporary table issue581_image_approved(value jsonb);
create temporary table issue581_image_claim(value jsonb);
create temporary table issue581_image_published(value jsonb);
create temporary table issue581_image_projection(value jsonb);
create temporary table issue581_image_projection_after(value jsonb);
create temporary table issue581_store_media_before(row_count bigint);
create temporary table issue581_image_reserved(value jsonb);
create temporary table issue581_different_actor_receipt(value boolean);
grant select,insert on issue581_image_created,issue581_image_create_replay,
  issue581_text_created,issue581_image_edited,issue581_image_edit_replay,
  issue581_second_text_created,
  issue581_image_stale,issue581_image_reuse,issue581_rejected_image,
  issue581_image_approved,issue581_image_reserved to authenticated;
grant insert on issue581_different_actor_receipt to identity_service;
grant select,insert on issue581_image_claim,issue581_image_published to media_worker;
grant select,insert on issue581_image_projection,issue581_image_projection_after to catalog_reader;
insert into issue581_store_media_before
select count(*) from app_public.store_media where store_id='58100000-0000-4000-8000-000000000011';

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
insert into issue581_image_reserved
select app_public.media_reserve_upload(
  '58100000-0000-4000-8000-000000000011','store_update','Reservation probe',
  '58100000-0000-4000-8000-000000000044',true,'image/webp',1000,100,100
);
select is((select value->>'state' from issue581_image_reserved),'reserved',
  'owner can reserve a Store Update image through the media RPC');
select is((select value->>'replayed' from issue581_image_reserved),'false',
  'first Store Update image reservation is not a replay');
reset role;
set local role identity_service;
insert into issue581_different_actor_receipt
select media_private.store_update_image_receipt_reviewable(
  '58100000-0000-4000-8000-000000000030','58100000-0000-4000-8000-000000000002',
  '58100000-0000-4000-8000-000000000011'
);
reset role;
select is((select value from issue581_different_actor_receipt),false,
  'valid same-store receipt is rejected for a different actor');
set local role authenticated;
insert into issue581_image_created
select app_public.portal_create_update(
  '{"type":"new_finds","headline":"Fresh arrivals","details":"Image awaits review.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000030"}'::jsonb);
select is((select value->>'state' from issue581_image_created),'pending_review',
  'image-bearing create stays private while its receipt awaits review');
select is((select value->>'publishedAt' from issue581_image_created),null,
  'pending image update has no public publication time');
insert into issue581_image_create_replay
select app_public.portal_create_update(
  '{"type":"new_finds","headline":"Fresh arrivals","details":"Image awaits review.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000030"}'::jsonb);
select is((select value from issue581_image_create_replay),(select value from issue581_image_created),
  'same image receipt and create payload replay the original update');
select throws_ok($$select app_public.portal_create_update(
  '{"type":"new_finds","headline":"Changed text","details":"Receipt is already bound.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000030"}'::jsonb)$$,
  '40001','portal_unavailable','same receipt with changed create payload conflicts');
select throws_ok($$select app_public.portal_create_update(
  '{"type":"new_finds","headline":"Wrong store","details":"Receipt belongs to Store B.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000032"}'::jsonb)$$,
  '55000','portal_unavailable','Store A cannot bind a Store B image receipt');

insert into issue581_text_created
select app_public.portal_create_update(
  '{"type":"announcement","headline":"Text first","details":"Will attach an image.","imageRequested":false}'::jsonb);
insert into issue581_image_edited
select app_public.portal_edit_update(
  (select value->>'id' from issue581_text_created),
  '{"type":"announcement","headline":"Text first","details":"Image awaits review.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000031"}'::jsonb,
  1,'issue581-image-edit-v1');
select is((select value->>'state' from issue581_image_edited),'saved','edit with a fresh receipt is acknowledged');
select is((select value->'update'->>'state' from issue581_image_edited),'pending_review',
  'image-bearing edit becomes private while its receipt awaits review');
select is((select value->'update'->>'version' from issue581_image_edited),'2',
  'image-bearing edit increments version once');
insert into issue581_image_edit_replay
select app_public.portal_edit_update(
  (select value->>'id' from issue581_text_created),
  '{"type":"announcement","headline":"Text first","details":"Image awaits review.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000031"}'::jsonb,
  1,'issue581-image-edit-v1');
select is((select value from issue581_image_edit_replay),(select value from issue581_image_edited),
  'same image edit key and payload replay the acknowledged result');
insert into issue581_image_stale
select app_public.portal_edit_update(
  (select value->>'id' from issue581_text_created),
  '{"type":"announcement","headline":"Stale image edit","details":"Must conflict.","imageRequested":false}'::jsonb,
  1,'issue581-image-edit-stale');
select is((select value->>'state' from issue581_image_stale),'conflict',
  'stale image edit leaves the current row unchanged');

insert into issue581_second_text_created
select app_public.portal_create_update(
  '{"type":"announcement","headline":"Unbound reuse","details":"Must stay live.","imageRequested":false}'::jsonb);
insert into issue581_image_reuse
select app_public.portal_edit_update(
  (select value->>'id' from issue581_second_text_created),
  '{"type":"announcement","headline":"Unbound reuse","details":"Must stay live.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000031"}'::jsonb,
  1,'issue581-image-reuse');
select is((select value->>'state' from issue581_image_reuse),'conflict',
  'an image receipt cannot be bound to a second update');
reset role;
select is((select version::text from portal_private.store_updates
  where update_id=(select (value->>'id')::uuid from issue581_text_created)),'2',
  'stale image edit does not increment the bound update again');
select is((select version::text from portal_private.store_updates
  where update_id=(select (value->>'id')::uuid from issue581_second_text_created)),'1',
  'reusing a receipt leaves the second update unchanged');
select throws_ok($$update portal_private.store_updates
  set state='archived',published_at=null,archived_at=statement_timestamp()
  where update_id=(select (value->>'id')::uuid from issue581_second_text_created)$$,
  '23514',null,'an archived update must retain its publication timestamp');
select is((select state from portal_private.store_updates
  where update_id=(select (value->>'id')::uuid from issue581_second_text_created)),'live',
  'rejected archive transition leaves the published update live');
select is((select count(*)::integer from portal_private.store_update_image_bindings
  where upload_id='58100000-0000-4000-8000-000000000030'),1,
  'create replay and changed-payload conflict leave one exact receipt binding');
select is((select count(*)::integer from portal_private.store_update_image_bindings
  where upload_id='58100000-0000-4000-8000-000000000032'),0,
  'wrong-store image receipt is never bound');

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000001','58100000-0000-4000-8000-000000000004');
select set_config('request.headers','{"x-owner-store-id":"58100000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
insert into issue581_rejected_image
select app_public.portal_create_update(
  '{"type":"store_news","headline":"Rejected image","details":"Remains private.","imageRequested":false,"imageUploadId":"58100000-0000-4000-8000-000000000033"}'::jsonb);
reset role;
update media_private.media_uploads set state='rejected',rejected_by='58100000-0000-4000-8000-000000000002',
  rejected_at=statement_timestamp(),rejection_reason='synthetic_rejection'
where upload_id='58100000-0000-4000-8000-000000000033';

select pg_temp.issue581_actor('58100000-0000-4000-8000-000000000002','58100000-0000-4000-8000-000000000003');
set local role authenticated;
insert into issue581_image_approved
select app_public.media_approve_upload('58100000-0000-4000-8000-000000000030',0,1,'issue581_review');
insert into issue581_image_approved
select app_public.media_approve_upload('58100000-0000-4000-8000-000000000031',0,1,'issue581_review');
select ok((select count(*)=2 and bool_and(value->>'state'='approved_pending_publish')
  from issue581_image_approved),
  'moderator queues both bound images for publication');
reset role;

set local role catalog_reader;
insert into issue581_image_projection
select to_jsonb(store_row) from app_public.catalog_details('issue-581-store-a') store_row;
reset role;
select ok(not exists(
  select 1 from issue581_image_projection p
  cross join lateral jsonb_array_elements(p.value->'updates') item
  where item->>'id' in (
    (select value->>'id' from issue581_image_created),
    (select value->>'id' from issue581_image_edited),
    (select value->>'id' from issue581_rejected_image)
  )
),'pending, rejected and approved-but-unpublished images stay out of public projection');
select is((select state from media_private.media_uploads where upload_id='58100000-0000-4000-8000-000000000033'),
  'rejected','rejected media receipt remains private');

create temporary table issue581_unbound_publish_key(value text);
insert into issue581_unbound_publish_key
values('official/58100000-0000-4000-8000-000000000012/v1/'||repeat('c',64)||'.webp');
update media_private.media_uploads set state='approved_pending_publish',approved_by='58100000-0000-4000-8000-000000000002',
  approved_at=statement_timestamp(),approval_reason='issue581_review',
  public_derivative_object_key=(select value from issue581_unbound_publish_key),publish_claimed_at=statement_timestamp()
where upload_id='58100000-0000-4000-8000-000000000032';
set local role media_worker;
select throws_ok($$select app_public.media_complete_publish_job(
  '58100000-0000-4000-8000-000000000032','58100000-0000-4000-8000-000000000032',
  'official/58100000-0000-4000-8000-000000000012/v1/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.webp')$$,
  '55000','media_worker_unavailable','worker cannot publish an unbound image receipt');
insert into issue581_image_claim
select app_public.media_claim_publish_job('58100000-0000-4000-8000-000000000030');
insert into issue581_image_published
select app_public.media_complete_publish_job(
  '58100000-0000-4000-8000-000000000030','58100000-0000-4000-8000-000000000030',
  (select value->>'publicDerivativeKey' from issue581_image_claim));
select is((select value->>'state' from issue581_image_published),'published',
  'worker publishes the exact update bound to the approved receipt');
reset role;

select is((select count(*)::integer from app_private.privileged_audit_events
  where action='portal_text_update_image_published' and resource_kind='store_update'
    and resource_id=(select (value->>'id')::uuid from issue581_image_created)),1,
  'image publication writes one privileged audit event for the exact Store Update');
select ok(exists(select 1 from app_private.privileged_audit_events
  where action='portal_text_update_image_published' and resource_kind='store_update'
    and resource_id=(select (value->>'id')::uuid from issue581_image_created)
    and actor_user_id is null and actor_role is null and reason_code='approved_media_receipt'),
  'worker publication audit records system attribution without inventing a representative');

select is((select state from portal_private.store_updates
  where update_id=(select (value->>'id')::uuid from issue581_image_created)),'live',
  'approved image completion publishes its bound update');
select is((select state from portal_private.store_updates
  where update_id=(select (value->'update'->>'id')::uuid from issue581_image_edited)),'pending_review',
  'publishing one image does not publish a different bound update');
select is((select catalog_media_id from media_private.media_uploads
  where upload_id='58100000-0000-4000-8000-000000000030'),null,
  'Store Update image does not acquire a catalog media row');
select is((select count(*) from app_public.store_media
  where store_id='58100000-0000-4000-8000-000000000011'),
  (select row_count from issue581_store_media_before),
  'Store Update image completion creates no store_media row');

set local role catalog_reader;
insert into issue581_image_projection_after
select to_jsonb(store_row) from app_public.catalog_details('issue-581-store-a') store_row;
reset role;
select ok(exists(
  select 1 from issue581_image_projection_after p
  cross join lateral jsonb_array_elements(p.value->'updates') item
  where item->>'id'=(select value->>'id' from issue581_image_created)
),'only the exactly bound approved update enters the public projection');
select ok(not exists(
  select 1 from issue581_image_projection_after p
  cross join lateral jsonb_array_elements(p.value->'updates') item
  where item->>'id'=(select value->'update'->>'id' from issue581_image_edited)
),'other pending update remains absent after a sibling publish');

select finish();
rollback;
