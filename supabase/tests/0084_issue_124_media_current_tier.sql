-- Real reservation and both moderation overloads must honor current tiers.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

\ir fixtures/media_current_tier.inc

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
