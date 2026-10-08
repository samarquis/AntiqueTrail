-- #580 acceptance: exact Owner slot target, version CAS, independent Admin
-- decision, and one exact public-row replacement. No provider/network calls.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/issue_580_media_replacement.inc

select has_column('app_public','store_media','version','public media slots carry a CAS version');
select has_function('app_public','media_reserve_replacement',
  array['uuid','bigint','text','uuid','boolean','text','bigint','integer','integer','bytea'],
  'Owner replacement reserves exact target id and expected version');
select ok(has_function_privilege('authenticated',
  'app_public.media_reserve_replacement(uuid,bigint,text,uuid,boolean,text,bigint,integer,integer,bytea)','EXECUTE'),
  'authenticated Owner reaches replacement reservation RPC');
select ok(not has_function_privilege('anon',
  'app_public.media_reserve_replacement(uuid,bigint,text,uuid,boolean,text,bigint,integer,integer,bytea)','EXECUTE'),
  'anonymous callers cannot reserve a replacement');

-- One current cover and five gallery images fill the Free slots. Add stays
-- denied while exact-slot replacement remains eligible.
select is(partner_private.check_store_media_cap(
  '00000000-0000-4000-8000-000000000009','gallery',gen_random_uuid())->>'allowed',
  'false','adding a sixth Free gallery image is denied');
select is(partner_private.check_store_media_cap(
  '00000000-0000-4000-8000-000000000009','gallery',gen_random_uuid())->>'error',
  'media_cap_exceeded','gallery add uses current tier cap response');
select is(partner_private.check_store_media_cap(
  '00000000-0000-4000-8000-000000000009','cover',gen_random_uuid())->>'allowed',
  'false','adding a second cover without a target is denied');

create temporary table issue580_first(result jsonb);
grant select,insert,update on issue580_first to authenticated,media_worker;
set local role authenticated;
insert into issue580_first values(app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Replacement gallery image one',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('11',32),'hex')));
select is((select result->>'state' from issue580_first),'reserved',
  'full-cap replacement reserves without adding a gallery slot');
select is((select result->>'targetMediaId' from issue580_first),
  '58000000-0000-4000-8000-000000000012','receipt identifies selected slot');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Replacement gallery image one',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('11',32),'hex'))->>'uploadId'),
  (select result->>'uploadId' from issue580_first),
  'same target/version/input replay returns one reservation');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Changed replay alt text',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('11',32),'hex'))->>'error'),
  'media_unavailable','changed input cannot reuse an idempotency key');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Replacement gallery image one',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('22',32),'hex'))->>'error'),
  'media_unavailable','different file digest cannot reuse an idempotency key');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000013',1,'Replacement gallery image one',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('11',32),'hex'))->>'error'),
  'media_unavailable','different target cannot reuse an idempotency key');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',2,'Replacement gallery image one',
  '58000000-0000-4000-8000-000000000021',true,'image/png',1000,640,480,decode(repeat('11',32),'hex'))->>'error'),
  'media_unavailable','different expected version cannot reuse an idempotency key');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',2,'Stale replacement',
  '58000000-0000-4000-8000-000000000022',true,'image/png',1000,640,480,decode(repeat('33',32),'hex'))->>'error'),
  'media_unavailable','stale target version gets generic denial');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000019',1,'Foreign replacement',
  '58000000-0000-4000-8000-000000000023',true,'image/png',1000,640,480,decode(repeat('33',32),'hex'))->>'error'),
  'media_unavailable','Owner cannot target another store or fall back to Representative scope');
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'No rights',
  '58000000-0000-4000-8000-000000000024',false,'image/png',1000,640,480,decode(repeat('33',32),'hex'))->>'error'),
  'media_unavailable','replacement requires fresh rights confirmation');
select is((select count(*)::integer from media_private.media_uploads
  where idempotency_key in ('58000000-0000-4000-8000-000000000022',
    '58000000-0000-4000-8000-000000000023','58000000-0000-4000-8000-000000000024')),
  0,'stale, foreign, and rights-denied inputs create no upload');
select is((select count(*)::integer from media_private.media_uploads
  where idempotency_key='58000000-0000-4000-8000-000000000021'),1,
  'idempotency mismatches never create a second upload');
select is((select count(*)::integer from media_private.media_provider_operations),
  0,'rejected target/version checks occur before provider processing');
select is((select asset_path from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),
  '/assets/issue580-current-gallery-1.webp','reservation keeps approved public media live');
select is((select version from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),1::bigint,
  'reservation does not advance public slot version');
reset role;

-- A separate Account with Administrator authority cannot reserve for an Owner.
select set_config('request.jwt.claims',jsonb_build_object('sub','58000000-0000-4000-8000-000000000001',
  'session_id','58000000-0000-4000-8000-000000000003','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
select is((app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Admin is not Owner',
  '58000000-0000-4000-8000-000000000025',true,'image/png',1000,640,480,decode(repeat('33',32),'hex'))->>'error'),
  'media_unavailable','different identity receives the same generic denial');
reset role;
select is((select count(*)::integer from media_private.media_uploads
  where idempotency_key='58000000-0000-4000-8000-000000000025'),0,
  'non-Owner identity creates no replacement row');

-- Complete only local media_worker evidence so the separate Admin review and
-- publication stages can be tested without invoking a provider.
create temporary table issue580_upload(upload_id uuid);
grant select,insert,update on issue580_upload to authenticated,media_worker;
insert into issue580_upload select (result->>'uploadId')::uuid from issue580_first;
set local role media_worker;
select app_public.media_record_staged_upload(upload_id) from issue580_upload;
select app_public.media_record_processing_result(upload_id,'clean','issue580-scan-a','issue580-reencode-a',
  decode(repeat('11',32),'hex'),100000,640,480,true,true) from issue580_upload;
reset role;

create temporary table issue580_case(case_id uuid,result jsonb);
grant select,insert,update on issue580_case to authenticated;
insert into issue580_case(case_id)
  select case_id from admin_private.admin_review_cases
  where case_type='image_review' and target_id=(select upload_id from issue580_upload);
select ok((select case_id is not null from issue580_case),
  'replacement enters the existing Admin image review queue');

-- Owner cannot make the moderation decision; rejection changes no public slot.
select set_config('request.jwt.claims',jsonb_build_object('sub','76000000-0000-4000-8000-000000000001',
  'session_id','76000000-0000-4000-8000-000000000008','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
set local role authenticated;
select throws_ok(format('select app_public.admin_decide_review_case(%L,''reject'',''owner cannot decide'',1,%L)',
  (select case_id from issue580_case)::text,'issue580-owner-denied'),
  '42501','admin_unavailable','Owner cannot approve or reject the replacement');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','58000000-0000-4000-8000-000000000001',
  'session_id','58000000-0000-4000-8000-000000000003','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
update issue580_case set result=app_public.admin_get_review_case(case_id::text);
select is((select result->>'caseType' from issue580_case),'image_review',
  'separate Administrator reads the exact image case');
select is((select result->'context'->>'kind' from issue580_case),'gallery',
  'Admin sees derived target kind in immutable review context');
update issue580_case set result=app_public.admin_decide_review_case(case_id::text,'reject',
  'issue580_rejected_quality',(result->>'version')::bigint,'issue580-admin-reject-a');
select is((select result->>'state' from issue580_case),'rejected',
  'Administrator rejection resolves only the pending replacement');
reset role;
select is((select asset_path from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),
  '/assets/issue580-current-gallery-1.webp','rejection leaves the previous approved image live');
select is((select version from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),1::bigint,
  'rejection leaves target slot version unchanged');

-- Retry the same slot with a new idempotency key. Approval alone still leaves
-- the original public row in place; the local worker swaps only after approval.
create temporary table issue580_retry(result jsonb);
grant select,insert,update on issue580_retry to authenticated,media_worker;
select set_config('request.jwt.claims',jsonb_build_object('sub','76000000-0000-4000-8000-000000000001',
  'session_id','76000000-0000-4000-8000-000000000008','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
insert into issue580_retry values(app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000012',1,'Approved replacement gallery image one',
  '58000000-0000-4000-8000-000000000026',true,'image/png',1000,640,480,decode(repeat('44',32),'hex')));
select is((select result->>'state' from issue580_retry),'reserved',
  'retry after rejection remains bound to the unchanged slot version');
reset role;
set local role media_worker;
select app_public.media_record_staged_upload((select (result->>'uploadId')::uuid from issue580_retry));
select app_public.media_record_processing_result((select (result->>'uploadId')::uuid from issue580_retry),
  'clean','issue580-scan-b','issue580-reencode-b',decode(repeat('22',32),'hex'),100000,640,480,true,true);
reset role;
truncate issue580_case;
insert into issue580_case(case_id)
  select case_id from admin_private.admin_review_cases
  where case_type='image_review' and target_id=(select (result->>'uploadId')::uuid from issue580_retry);
select set_config('request.jwt.claims',jsonb_build_object('sub','58000000-0000-4000-8000-000000000001',
  'session_id','58000000-0000-4000-8000-000000000003','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
update issue580_case set result=app_public.admin_get_review_case(case_id::text);
update issue580_case set result=app_public.admin_decide_review_case(case_id::text,'approve',
  'issue580_approved_quality',(result->>'version')::bigint,'issue580-admin-approve-b');
select is((select result->>'state' from issue580_case),'approved',
  'separate Administrator approves exact replacement');
reset role;
select is((select asset_path from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),
  '/assets/issue580-current-gallery-1.webp','approval alone keeps the old public image live');
select is((select version from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),1::bigint,
  'approval alone does not advance the public slot version');

create temporary table issue580_publish(upload_id uuid,public_key text);
grant select,insert,update on issue580_publish to media_worker;
insert into issue580_publish
  select u.upload_id,u.public_derivative_object_key from media_private.media_uploads u
  where u.upload_id=(select (result->>'uploadId')::uuid from issue580_retry);
set local role media_worker;
select app_public.media_claim_publish_job(upload_id) from issue580_publish;
select app_public.media_complete_publish_job(upload_id,upload_id,public_key) from issue580_publish;
select throws_ok(format('select app_public.media_complete_publish_job(%L,%L,%L)',
  (select upload_id from issue580_publish),(select upload_id from issue580_publish),
  (select public_key from issue580_publish)),
  '55000','media_worker_unavailable','duplicate completion cannot publish a second slot');
reset role;
select is((select count(*)::integer from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),1,
  'publication retains exactly one row at the original slot id');
select is((select version from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),2::bigint,
  'publication advances exact slot version once');
select is((select alt_text from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),
  'Approved replacement gallery image one','published row carries approved alt text');
select is((select display_order from app_public.store_media
  where id='58000000-0000-4000-8000-000000000012'),1::smallint,
  'replacement preserves gallery order');
select is((select count(*)::integer from media_private.media_uploads
  where store_id='00000000-0000-4000-8000-000000000009' and kind='gallery'
    and display_order=1 and state='published'),1,
  'replacement does not grow published gallery capacity');
select is((select catalog_media_id from media_private.media_uploads
  where upload_id=(select upload_id from issue580_publish)),
  '58000000-0000-4000-8000-000000000012'::uuid,
  'published receipt points to the exact original slot');

-- Cover replacement follows the same target-bound publication path.
create temporary table issue580_cover(result jsonb);
grant select,insert,update on issue580_cover to authenticated,media_worker;
select set_config('request.jwt.claims',jsonb_build_object('sub','76000000-0000-4000-8000-000000000001',
  'session_id','76000000-0000-4000-8000-000000000008','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
select set_config('request.headers','{"x-owner-store-id":"00000000-0000-4000-8000-000000000009"}',true);
set local role authenticated;
insert into issue580_cover values(app_public.media_reserve_replacement(
  '58000000-0000-4000-8000-000000000011',1,'Replacement cover image',
  '58000000-0000-4000-8000-000000000027',true,'image/png',1000,640,480,decode(repeat('55',32),'hex')));
select is((select result->>'targetMediaId' from issue580_cover),
  '58000000-0000-4000-8000-000000000011','cover reservation preserves exact cover target');
reset role;
set local role media_worker;
select app_public.media_record_staged_upload((select (result->>'uploadId')::uuid from issue580_cover));
select app_public.media_record_processing_result((select (result->>'uploadId')::uuid from issue580_cover),
  'clean','issue580-cover-scan','issue580-cover-reencode',decode(repeat('55',32),'hex'),100000,640,480,true,true);
reset role;
truncate issue580_case;
insert into issue580_case(case_id)
  select case_id from admin_private.admin_review_cases
  where case_type='image_review' and target_id=(select (result->>'uploadId')::uuid from issue580_cover);
select set_config('request.jwt.claims',jsonb_build_object('sub','58000000-0000-4000-8000-000000000001',
  'session_id','58000000-0000-4000-8000-000000000003','role','authenticated','aal','aal2','amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
set local role authenticated;
update issue580_case set result=app_public.admin_get_review_case(case_id::text);
update issue580_case set result=app_public.admin_decide_review_case(case_id::text,'approve',
  'issue580_cover_approved',(result->>'version')::bigint,'issue580-admin-cover-approve');
select is((select result->>'state' from issue580_case),'approved',
  'Administrator separately approves cover replacement');
reset role;
create temporary table issue580_cover_publish(upload_id uuid,public_key text);
grant select,insert,update on issue580_cover_publish to media_worker;
insert into issue580_cover_publish
  select u.upload_id,u.public_derivative_object_key from media_private.media_uploads u
  where u.upload_id=(select (result->>'uploadId')::uuid from issue580_cover);
set local role media_worker;
select app_public.media_claim_publish_job(upload_id) from issue580_cover_publish;
select app_public.media_complete_publish_job(upload_id,upload_id,public_key) from issue580_cover_publish;
reset role;
select is((select count(*)::integer from app_public.store_media
  where id='58000000-0000-4000-8000-000000000011'),1,
  'cover publication retains one row at the exact original slot id');
select is((select version from app_public.store_media
  where id='58000000-0000-4000-8000-000000000011'),2::bigint,
  'cover replacement advances slot version once');
select is((select kind::text from app_public.store_media
  where id='58000000-0000-4000-8000-000000000011'),'cover',
  'cover replacement preserves kind');
select is((select alt_text from app_public.store_media
  where id='58000000-0000-4000-8000-000000000011'),'Replacement cover image',
  'published cover carries approved alt text');
select is((select count(*)::integer from app_public.store_media
  where store_id='00000000-0000-4000-8000-000000000009' and kind='cover'),1,
  'cover replacement never grows cover capacity');
select * from finish();
rollback;
