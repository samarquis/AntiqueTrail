-- Real reservation and both moderation overloads must honor current tiers.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
insert into app_private.role_grants(subject_user_id,role)
values ('76000000-0000-4000-8000-000000000001','administrator');
update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;
create temp table approved_fixture as select gen_random_uuid() id, n from generate_series(1,15) n;
insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order)
select id,'00000000-0000-4000-8000-000000000001','/assets/issue-124-'||n||'.svg','gallery','Approved fixture',n from approved_fixture;
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,public_derivative_object_key,catalog_media_id,derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state,approved_by,approved_at,approval_reason,published_at,created_at)
select id,gen_random_uuid(),'00000000-0000-4000-8000-000000000001','gallery','Approved fixture',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,
  'quarantine/'||id||'/original','quarantine/'||id||'/derivative.webp',
  'official/00000000-0000-4000-8000-000000000001/v1/'||md5(id::text)||'.webp',id,
  decode(repeat('00',32),'hex'),1000,640,480,'clean',true,true,case when n<=5 then 'published' else 'rejected' end,
  '76000000-0000-4000-8000-000000000001',statement_timestamp(),'quality_ok',statement_timestamp(),statement_timestamp()-interval '2 days'
from approved_fixture;

set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"free","approvedCount":5,"cap":5}'::jsonb,'Free reports its exact current boundary');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','At cap',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))->>'error','media_cap_exceeded','Free denies resubmission at five');
reset role;
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
set local role authenticated;
select throws_ok($$select app_public.media_approve_upload('80000000-0000-4000-8000-000000000002',0,1,'quality_ok')$$,'23505','media_unavailable','four-argument approval denies Free sixth image');
reset role;
-- Service session membership is supplied by the CI test runner.
select throws_ok($$select app_public.media_approve_upload('80000000-0000-4000-8000-000000000002','quality_ok')$$,'23505','media_unavailable','two-argument approval denies Free sixth image');
select is((select state from media_private.media_uploads where upload_id='80000000-0000-4000-8000-000000000002'),'awaiting_review','both denied approvals leave original state unchanged');

update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;
insert into partner_private.store_photo_tier_state(store_id,tier,source)
values ('00000000-0000-4000-8000-000000000001','gallery','subscription')
on conflict(store_id) do update set tier='gallery',source='subscription';
set local role authenticated;
select ok((app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Gallery room',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))->>'uploadId') is not null,'current Gallery tier permits resubmission above Free capacity');
reset role;
update media_private.media_uploads set state='published' where upload_id in(select id from approved_fixture);
set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"gallery","approvedCount":15,"cap":15}'::jsonb,'Gallery reports exact fifteen-image boundary');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Gallery cap',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))->>'error','media_cap_exceeded','Gallery denies sixteenth reservation');
reset role;
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
set local role authenticated;
select throws_ok($$select app_public.media_approve_upload('80000000-0000-4000-8000-000000000002',0,1,'quality_ok')$$,'23505','media_unavailable','four-argument approval denies Gallery sixteenth image');
reset role;
-- Service session membership is supplied by the CI test runner.
select throws_ok($$select app_public.media_approve_upload('80000000-0000-4000-8000-000000000002','quality_ok')$$,'23505','media_unavailable','two-argument approval denies Gallery sixteenth image');
update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;
update partner_private.store_photo_tier_state set tier='full_gallery' where store_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"full_gallery","approvedCount":15,"cap":null}'::jsonb,'Full Gallery has no plan-count cap');
select ok((app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Full Gallery',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))->>'uploadId') is not null,'Full Gallery reserves beyond fifteen');
reset role;
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
set local role authenticated;
select is(app_public.media_approve_upload('80000000-0000-4000-8000-000000000002',0,1,'quality_ok')->>'state','approved_pending_publish','Full Gallery four-argument approval exceeds fifteen');
reset role;
update media_private.media_uploads set state='awaiting_review' where upload_id in(select id from approved_fixture where n=15);
select is(app_public.media_approve_upload((select id from approved_fixture where n=15),'quality_ok')->>'state','approved_pending_publish','Full Gallery service approval exceeds fifteen');
update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;
update partner_private.store_photo_tier_state set tier='free',source='default' where store_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','After downgrade',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))->>'currentTier','free','resubmission rederives tier after downgrade');
reset role;
select * from finish();
rollback;

