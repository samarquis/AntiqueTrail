-- Issue #124: exercise the real public boundary under browser roles.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/media_resubmission.inc

-- Catalog assertions inspect deployed privileges, never function source text.
select is(p.proowner::regrole::text, expected.owner, expected.name || ' has its restricted owner')
from (values
  ('app_public.portal_list_media_uploads()', 'identity_service'),
  ('app_public.portal_get_media_capacity()', 'media_automation'),
  ('app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)', 'media_automation')
) expected(name,owner) join pg_proc p on p.oid=expected.name::regprocedure;
select ok(p.prosecdef and p.proconfig=array['search_path=""']::text[], p.oid::regprocedure || ' fixes definer search path')
from pg_proc p where p.oid in ('app_public.portal_list_media_uploads()'::regprocedure,
  'app_public.portal_get_media_capacity()'::regprocedure,
  'app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)'::regprocedure);
select ok(c.relrowsecurity and c.relforcerowsecurity, c.oid::regclass || ' forces RLS')
from pg_class c where c.oid in ('media_private.media_uploads'::regclass,
  'partner_private.store_photo_tier_state'::regclass);

set local role authenticated;
select throws_ok('select * from media_private.media_uploads','42501',null,'browser cannot bulk-read private upload rows');
select throws_ok('update media_private.media_uploads set rejection_reason=null','42501',null,'browser cannot bulk-rewrite rejection history');
select throws_ok('update partner_private.store_photo_tier_state set tier=''full_gallery''','42501',null,'browser cannot choose its own tier');
select throws_ok('select portal_private.require_portal_scope()','42501',null,'browser cannot invoke private scope helper');
select is(jsonb_array_length(app_public.portal_list_media_uploads()->'uploads'),3,'history includes only exact-store rows');
select ok(not exists(select 1 from jsonb_array_elements(app_public.portal_list_media_uploads()->'uploads') u
  where (select array_agg(k order by k) from jsonb_object_keys(u) k)
    is distinct from array['altText','kind','rejectionReason','state','submittedAt','uploadId']),
  'every history row has exactly the six approved fields');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000003','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)),
  '{"error":"media_unavailable"}'::jsonb,'foreign rejected ID gives only generic denial');
select is(app_public.media_reserve_resubmission('ffffffff-ffff-4fff-8fff-ffffffffffff','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)),
  '{"error":"media_unavailable"}'::jsonb,'guessed ID gives identical generic denial');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000002','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)),
  '{"error":"media_unavailable"}'::jsonb,'non-rejected sibling cannot be resubmitted');
select is((select count(*) from generate_series(1,25) n where
  app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000003','Bulk '||n,gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))='{"error":"media_unavailable"}'::jsonb),25::bigint,'bulk foreign-ID attempts all deny');
select ok((app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Corrected','12400000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('a',64))->>'uploadId') is not null,
  'exact active representative can reserve a new row');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Corrected','12400000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('a',64))->>'replayed',
  'true','authenticated same-key replay reuses the reservation');
reset role;
select is((select count(*) from media_private.media_uploads where store_id='00000000-0000-4000-8000-000000000009'),1::bigint,'bulk denial changes no foreign rows');
select is((select count(*) from media_private.media_uploads where idempotency_key='12400000-0000-4000-8000-000000000001'),1::bigint,'replay persists exactly one row');
select ok((select state='rejected' and rejection_reason='Image quality insufficient for storefront' from media_private.media_uploads where upload_id='80000000-0000-4000-8000-000000000001'), 'original rejection remains unchanged');

-- A caller transaction rollback must remove the reservation and its queued work.
savepoint reservation_rollback;
set local role authenticated;
select app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Rollback','12400000-0000-4000-8000-000000000002',true,'image/png',1000,640,480,repeat('b',64));
reset role;
rollback to reservation_rollback;
select is((select count(*) from media_private.media_uploads where idempotency_key='12400000-0000-4000-8000-000000000002'),0::bigint,'rollback removes reservation');
select ok(not exists(select 1 from media_private.media_purge_jobs j left join media_private.media_uploads u using(upload_id) where u.upload_id is null),'rollback leaves no orphan purge job');

-- Denials exercise the shared scope resolver with the same otherwise-valid JWT.
update app_private.active_sessions set access_token_expires_at=statement_timestamp()-interval '1 second'
where session_id='76000000-0000-4000-8000-000000000008';
set local role authenticated;
select throws_ok('select app_public.portal_list_media_uploads()','42501','portal_unavailable','expired session cannot read history');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)),
  '{"error":"media_unavailable"}'::jsonb,'expired session cannot resubmit');
reset role;
-- Restore fixture state explicitly so the pgTAP counter remains monotonic.
update app_private.active_sessions set access_token_expires_at=statement_timestamp()+interval '30 minutes'
where session_id='76000000-0000-4000-8000-000000000008';
insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,idempotency_key)
values ('76000000-0000-4000-8000-000000000007','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','administrator_revoked','issue-124-revocation');
set local role authenticated;
select throws_ok('select app_public.portal_list_media_uploads()','42501','portal_unavailable','revoked grant cannot read history');
select is(app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)),
  '{"error":"media_unavailable"}'::jsonb,'revoked grant cannot resubmit');
reset role;
set local role anon;
select throws_ok('select app_public.portal_list_media_uploads()','42501',null,'anonymous history call denied at grant boundary');
select throws_ok($$select app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Corrected',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64))$$,
  '42501',null,'anonymous resubmission denied at grant boundary');
reset role;
select * from finish();
rollback;
