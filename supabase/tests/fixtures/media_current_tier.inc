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
