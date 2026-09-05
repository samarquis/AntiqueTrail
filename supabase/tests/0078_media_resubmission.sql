-- Issue #123: Store Portal rejected-media resubmission contract.
-- The reserve RPC derives store/kind server-side from the locked rejected
-- original, checks active grant, current-server cap, and idempotency, then
-- creates one distinct new row without mutating the original.

begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

\ir fixtures/media_resubmission.inc

-- ---- Grant visibility checks
select has_function('app_public','media_reserve_resubmission',array['uuid','text','uuid','boolean','text','bigint','integer','integer','text'],'media_reserve_resubmission exists');
select ok(has_function_privilege('authenticated','app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)','EXECUTE'),'authenticated callers can execute media_reserve_resubmission');
select ok(not has_function_privilege('anon','app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)','EXECUTE'),'anon cannot execute media_reserve_resubmission');
select ok(position('portal_private.require_portal_scope' in pg_get_functiondef('app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)'::regprocedure))>0,'resubmission RPC requires the shared Portal scope');

-- ---- 1. Valid resubmission: one distinct new reserved row, original unchanged.
select ok(
  (with receipt as (select app_public.media_reserve_resubmission(
     '80000000-0000-4000-8000-000000000001','Corrected storefront',gen_random_uuid(),true,'image/png',1000,640,480,repeat('a',64)) result)
   select result ? 'uploadId' and not result ? 'originalObjectKey' and not result ? 'derivativeObjectKey'
     and not result ? 'storeId' and not result ? 'kind' from receipt),
  'resubmission returns only an opaque upload receipt');
select is(
  (select store_id from media_private.media_uploads where resubmission_of='80000000-0000-4000-8000-000000000001' and state='reserved'),
  '00000000-0000-4000-8000-000000000001',
  'new row is scoped to the original store');
select is(
  (select state from media_private.media_uploads where upload_id='80000000-0000-4000-8000-000000000001'),
  'rejected',
  'original remains rejected after resubmission');
select is(
  (select rejection_reason from media_private.media_uploads where upload_id='80000000-0000-4000-8000-000000000001'),
  'Image quality insufficient for storefront',
  'original rejection reason is unchanged');
select is(
  (select count(*)::integer from media_private.media_uploads where resubmission_of='80000000-0000-4000-8000-000000000001'),
  1,
  'exactly one resubmission row is created');
select ok(
  (select count(*) from media_private.media_uploads u where u.resubmission_of='80000000-0000-4000-8000-000000000001' and u.upload_id<>'80000000-0000-4000-8000-000000000001')=1,
  'resubmission row is distinct from the original');

-- ---- 2. Same-key same-input replay returns the prior receipt; no new row.
select is(
  (app_public.media_reserve_resubmission(
     '80000000-0000-4000-8000-000000000001','Corrected storefront','90000000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('b',64))->>'uploadId'),
  (app_public.media_reserve_resubmission(
     '80000000-0000-4000-8000-000000000001','Corrected storefront','90000000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('b',64))->>'uploadId'),
  'same-key replay returns the identical receipt');
select is(
  (select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000001'),
  1,
  'same-key replay creates exactly one row');

-- ---- 3. Same-key different-input fails; no extra row (idempotency is exact).
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001','Different corrected text','90000000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('b',64))->>'error'),
  'media_unavailable','same key against changed input fails closed without a leak');
select is(
  (select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000001'),
  1,
  'same-key changed-input adds no row');
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001','Corrected storefront','90000000-0000-4000-8000-000000000001',true,'image/png',1000,640,480,repeat('c',64))->>'error'),
  'media_unavailable','same key against different file content fails closed without a leak');

-- ---- 4. Non-rejected original denies with no row.
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000002','Corrected','90000000-0000-4000-8000-000000000002',true,'image/png',1000,640,480,repeat('d',64))->>'error'),
  'media_unavailable','non-rejected original is denied without a leak');
select is(
  (select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000002'),
  0,
  'non-rejected original adds no row');

-- ---- 5. Foreign-store rejected original is denied (no leak, no row).
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000003','Corrected','90000000-0000-4000-8000-000000000003',true,'image/png',1000,640,480,repeat('e',64))->>'error'),
  'media_unavailable','foreign-store rejected original is denied without a leak');
select is(
  (select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000003'),
  0,
  'foreign-store original adds no row');

-- ---- 6. Explicit false and NULL rights both deny, persist one denial audit,
-- ---- and never create an upload row.
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001','Corrected','90000000-0000-4000-8000-000000000004',false,'image/png',1000,640,480,repeat('f',64))->>'error'),
  'media_unavailable','false rights confirmation is denied without a leaked reason');
select is((select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000004'),0,'false rights adds no row');
select ok(exists(select 1 from media_private.media_audit_events where event_kind='media_resubmission' and upload_id='80000000-0000-4000-8000-000000000001' and outcome='denied'),'false rights denial audit persists');
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001','Corrected','90000000-0000-4000-8000-00000000000a',null,'image/png',1000,640,480,repeat('a',64))->>'error'),
  'media_unavailable','NULL rights confirmation is denied');
select is((select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-00000000000a'),0,'NULL rights adds no row');

-- ---- 7. A rejected original outside the resolved grant scope denies with no row.
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000003','Corrected','90000000-0000-4000-8000-000000000005',true,'image/png',1000,640,480,repeat('1',64))->>'error'),
  'media_unavailable','store without an active grant is denied without a leak');

-- ---- 8. Cover originals are never count-capped (Free cover slot rule).
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,scan_state,metadata_stripped,reencoded,state,rejection_reason,rejected_at)
values ('80000000-0000-4000-8000-000000000004',gen_random_uuid(),'00000000-0000-4000-8000-000000000001','cover','Rejected cover',statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/80000000-0000-4000-8000-000000000004/original','quarantine/80000000-0000-4000-8000-000000000004/derivative.webp','clean',true,true,'rejected','Cover rejected',statement_timestamp());
select ok(
  (app_public.media_reserve_resubmission(
     '80000000-0000-4000-8000-000000000004','Corrected cover','90000000-0000-4000-8000-000000000007',true,'image/png',1000,640,480,repeat('2',64))->>'uploadId') is not null,
  'cover resubmission is allowed and not count-capped');

-- ---- 9. Cap: Free store with 5 approved gallery images denies gallery resubmission
-- ----    with the structured media_cap_exceeded payload and creates no row.
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state,approved_by,approved_at,approval_reason)
select gen_random_uuid(),gen_random_uuid(),'00000000-0000-4000-8000-000000000001','gallery','Approved '||g,statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,'quarantine/'||gen_random_uuid()::text||'/original','quarantine/'||gen_random_uuid()::text||'/derivative.webp',decode(repeat('00',32),'hex'),100000,640,480,'clean',true,true,'approved_pending_publish','76000000-0000-4000-8000-000000000001',statement_timestamp(),'quality_ok'
from generate_series(1,5) g;
select is(
  (app_public.media_reserve_resubmission(
     '80000000-0000-4000-8000-000000000001','Over cap','90000000-0000-4000-8000-000000000006',true,'image/png',1000,640,480,repeat('3',64))->>'error'),
  'media_cap_exceeded',
  'over-cap resubmission returns the structured denial payload');
select is(
  (select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-000000000006'),
  0,
  'over-cap resubmission creates no row');

-- ---- 10. Missing original denies without leaking existence.
select is(
  (app_public.media_reserve_resubmission(
    'ffffffff-ffff-4fff-8fff-ffffffffffff','Corrected','90000000-0000-4000-8000-000000000008',true,'image/png',1000,640,480,repeat('4',64))->>'error'),
  'media_unavailable','missing original is denied without leaking existence');

-- ---- 11. Purged and malformed requests fail closed, leave no reservation,
-- ---- and retain only a durable generic denial audit.
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000005','Corrected','90000000-0000-4000-8000-00000000000b',true,'image/png',1000,640,480,repeat('b',64))->>'error'),
  'media_unavailable','purged original denies without leaking existence');
select is((select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-00000000000b'),0,'purged original adds no row');
select ok(exists(select 1 from media_private.media_audit_events where event_kind='media_resubmission' and outcome='denied' and upload_id is null),'purged original denial audit persists');
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001',' trailing ','90000000-0000-4000-8000-00000000000c',true,'image/png',1000,640,480,repeat('c',64))->>'error'),
  'media_unavailable','malformed resubmission denies without a special response');
select is((select count(*)::integer from media_private.media_uploads where idempotency_key='90000000-0000-4000-8000-00000000000c'),0,'malformed input adds no row');
select ok(exists(select 1 from media_private.media_audit_events where event_kind='media_resubmission' and outcome='denied' and upload_id='80000000-0000-4000-8000-000000000001'),'malformed input denial audit persists');
select ok(not exists(select 1 from media_private.media_provider_operations o join media_private.media_uploads u on u.upload_id=o.upload_id where u.idempotency_key in ('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-00000000000a','90000000-0000-4000-8000-00000000000b','90000000-0000-4000-8000-00000000000c')),'denials create no provider operation');

-- ---- 12. A revocation record denies even if the grant row still says active.
-- The read-only projection uses the same current server resolver and exact scope.
set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"free","approvedCount":5,"cap":5}'::jsonb,'Free capacity returns only current own-store status');
reset role;
insert into partner_private.store_photo_tier_state(store_id,tier,source)
values ('00000000-0000-4000-8000-000000000001','gallery','subscription')
on conflict(store_id) do update set tier='gallery',source='subscription';
set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"gallery","approvedCount":5,"cap":15}'::jsonb,'Gallery capacity uses current resolver');
reset role;
update partner_private.store_photo_tier_state set tier='full_gallery' where store_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(app_public.portal_get_media_capacity(),'{"currentTier":"full_gallery","approvedCount":5,"cap":null}'::jsonb,'Full Gallery exposes no plan-count cap');
reset role;
select ok(not has_function_privilege('anon','app_public.portal_get_media_capacity()','EXECUTE'),'anonymous cannot call capacity read');
savepoint capacity_actor;
select set_config('request.jwt.claims','{}',true);
set local role authenticated;
select throws_ok($$select app_public.portal_get_media_capacity()$$,'42501','portal_unavailable','capacity read denies missing identity');
reset role;
rollback to capacity_actor;
select is((select proconfig from pg_proc where oid='app_public.portal_get_media_capacity()'::regprocedure),array['search_path=""']::text[],'capacity read fixes search path');
insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,idempotency_key)
values ('76000000-0000-4000-8000-000000000007','76000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','administrator_revoked','resubmit-revocation');
set local role authenticated;
select throws_ok($$select app_public.portal_get_media_capacity()$$,'42501','portal_unavailable','capacity read denies revoked-but-active grant');
reset role;
select is(
  (app_public.media_reserve_resubmission(
    '80000000-0000-4000-8000-000000000001','Corrected','90000000-0000-4000-8000-000000000009',true,'image/png',1000,640,480,repeat('5',64))->>'error'),
  'media_unavailable','revoked grant denies resubmission without a leak');

-- ---- 13. The live four-argument moderation path delegates gallery capacity to
-- ---- the current resolver; 0077 separately exercises Free/Gallery/Full
-- ---- Gallery resolver boundaries against real rows.
select ok(
  position('partner_private.check_store_media_cap' in pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure))>0
  and position('active_count>=5' in replace(pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure),' ',''))=0,
  'four-argument moderation approval has no hard-coded five-gallery cap');
select ok(
  position('pg_advisory_xact_lock(hashtextextended(actor::text||'':''||p_idempotency_key::text,0))' in pg_get_functiondef('app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)'::regprocedure))>0
  and position('pg_advisory_xact_lock(hashtextextended(actor::text||'':''||p_idempotency_key::text,0))' in pg_get_functiondef('app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)'::regprocedure))
    < position('where actor_user_id=actor and idempotency_key=p_idempotency_key' in pg_get_functiondef('app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)'::regprocedure)),
  'idempotency-key lock precedes the existing receipt lookup');

select * from finish();
rollback;
