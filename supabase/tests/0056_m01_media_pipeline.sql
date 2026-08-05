begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select has_schema('media_private','M-01 has an isolated media schema');
select has_table('media_private','media_provider_config','provider capability is durable');
select has_table('media_private','media_uploads','quarantined uploads are durable');
select has_table('media_private','media_provider_operations','provider outcomes are content-free');
select has_table('media_private','media_purge_jobs','deletion work is durable');
select has_table('media_private','media_audit_events','narrow audit events are durable');
select is((select state from media_private.media_provider_config where id=1),'blocked','media is blocked by default');
select ok((select count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='media_private' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),
  'every M-01 table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants
  where table_schema='media_private' and grantee in ('anon','authenticated','service_role')),
  'browser and generic service roles have no direct media-table access');
select ok(not exists(select 1 from information_schema.columns where table_schema='media_private'
  and table_name in ('media_provider_operations','media_audit_events')
  and column_name in ('object_key','payload','request_body','response_body','token','secret')),
  'operational evidence has no content, object path, token, or provider payload columns');
select is((select public from storage.buckets where id='official-media-private'),false,'origin and review derivatives use private staging');
select is((select public from storage.buckets where id='official-media-public'),true,'the public bucket contains approved derivatives only');

select has_function('app_public','media_get_capability',array[]::text[],'server-owned media capability projection exists');
select has_function('app_public','media_reserve_upload',array['uuid','text','text','uuid','boolean','text','bigint','integer','integer'],'bounded upload reservation exists');
select has_function('app_public','media_get_upload',array['uuid'],'exact upload status exists');
select has_function('app_public','media_approve_upload',array['uuid','integer','bigint','text'],'MFA-gated approval exists');
select has_function('app_public','media_withdraw_upload',array['uuid','text'],'rights withdrawal exists');
select has_function('app_public','media_record_staged_upload',array['uuid'],'worker records private staging');
select has_function('app_public','media_record_processing_result',array['uuid','text','text','text','bytea','bigint','integer','integer','boolean','boolean'],'worker records scan and processing evidence');
select has_function('app_public','media_claim_publish_job',array['uuid'],'worker claims approved publication');
select has_function('app_public','media_list_publish_jobs',array['integer'],'worker can discover bounded publish work');
select has_function('app_public','media_complete_publish_job',array['uuid','uuid','text'],'worker completes exact derivative publication');
select has_function('app_public','media_claim_purge_job',array['uuid'],'worker claims exact object deletion');
select has_function('app_public','media_list_purge_jobs',array['integer'],'lifecycle service can discover bounded due deletion work');
select has_function('app_public','media_complete_purge_job',array['uuid','uuid'],'worker records deletion only after storage success');
select has_function('app_public','media_accept_provider_config',array['uuid','text','text','text','integer','bigint','integer','integer','text','bytea'],'deployment-only gate acceptance hook exists');
select has_function('app_public','media_pause_capability',array['text'],'worker can fail closed on provider or quota failure');

select ok(has_function_privilege('anon','app_public.media_get_capability()','EXECUTE'),'anonymous callers may read only capability state');
select ok(not has_function_privilege('anon','app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)','EXECUTE'),'anonymous upload reservation is denied');
select ok(has_function_privilege('authenticated','app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)','EXECUTE'),'authenticated callers cross the reservation RPC');
select ok(not has_function_privilege('authenticated','app_public.media_record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean)','EXECUTE'),'browsers cannot claim scanning or re-encoding succeeded');
select ok(has_function_privilege('media_worker','app_public.media_record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean)','EXECUTE'),'only the narrow worker role records provider results');
select ok(has_function_privilege('media_lifecycle_service','app_public.media_claim_purge_job(uuid)','EXECUTE'),'only lifecycle service claims retention work');
select ok(has_function_privilege('media_deployment_service','app_public.media_accept_provider_config(uuid,text,text,text,integer,bigint,integer,integer,text,bytea)','EXECUTE'),'provider acceptance is deployment-only');

select ok(position("capabilities->>'official_media_upload'='true'" in replace(lower(pg_get_functiondef('media_private.capability_enabled()'::regprocedure)),' ',''))>0
  and position("gate_kind='provider_m'" in replace(lower(pg_get_functiondef('media_private.capability_enabled()'::regprocedure)),' ',''))>0
  and position("state='accepted'" in replace(lower(pg_get_functiondef('media_private.capability_enabled()'::regprocedure)),' ',''))>0,
  'capability requires server stage flag and externally verified M-01 receipt');
select ok(position('daily_count>=20' in replace(lower(pg_get_functiondef('app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)'::regprocedure)),' ',''))>0
  and position('concurrent_count>=5' in replace(lower(pg_get_functiondef('app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)'::regprocedure)),' ',''))>0
  and position('not p_rights_confirmed' in lower(pg_get_functiondef('app_public.media_reserve_upload(uuid,text,text,uuid,boolean,text,bigint,integer,integer)'::regprocedure)))>0,
  'reservation enforces rights, 20/day, and five concurrent uploads per store');
select ok(position("p_scan_outcome<>'clean'" in replace(lower(pg_get_functiondef('media_private.record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean)'::regprocedure)),' ',''))>0
  and position('not p_metadata_stripped' in lower(pg_get_functiondef('media_private.record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean)'::regprocedure)))>0
  and position('not p_reencoded' in lower(pg_get_functiondef('media_private.record_processing_result(uuid,text,text,text,bytea,bigint,integer,integer,boolean,boolean)'::regprocedure)))>0,
  'publication cannot advance without clean scan and safe-transform evidence');
select ok(position('current_session_has_mfa' in lower(pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure)))>0
  and position('current_session_recent_auth' in lower(pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure)))>0
  and position('current_user_has_role' in lower(pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure)))>0,
  'approval requires Administrator role, MFA, and recent authentication');
select ok(position("'publish'" in lower(pg_get_functiondef('app_public.media_approve_upload(uuid,integer,bigint,text)'::regprocedure)))>0,
  'approval queues publication rather than exposing staging directly');
select ok(position('app_public.store_media' in lower(pg_get_functiondef('media_private.complete_publish_job(uuid,uuid,text)'::regprocedure)))>0,
  'catalog media is inserted only by successful publication completion');
select ok(position("interval '24 hours'" in lower(pg_get_functiondef('app_public.media_withdraw_upload(uuid,text)'::regprocedure)))>0
  and position('app_public.store_media' in lower(pg_get_functiondef('app_public.media_withdraw_upload(uuid,text)'::regprocedure)))>0,
  'withdrawal removes the catalog reference immediately and bounds deletion to 24 hours');
select ok(position("interval '24 hours'" in lower(pg_get_functiondef('media_private.complete_publish_job(uuid,uuid,text)'::regprocedure)))>0,
  'successful publication schedules private origin and review derivative deletion within 24 hours');
select ok(position("reason_code='private_after_publish'" in replace(lower(pg_get_functiondef('media_private.complete_purge_job(uuid,uuid)'::regprocedure)),' ',''))>0
  and position("else'purged'" in replace(lower(pg_get_functiondef('media_private.complete_purge_job(uuid,uuid)'::regprocedure)),' ',''))>0,
  'retention purge terminates rejected/quarantined uploads while preserving published state after private cleanup');
select ok(exists(select 1 from pg_trigger where tgname='media_audit_append_only' and not tgisinternal),
  'media audit is append-only');
select ok((select position('^official/' in pg_get_constraintdef(oid))>0 from pg_constraint
  where conname='media_public_object_key_safe'),'public derivatives use immutable allowlisted object keys');

set local role anon;
select is((app_public.media_get_capability()->>'enabled')::boolean,false,'the deployed provider capability remains off without accepted evidence');
select throws_ok($$select app_public.media_reserve_upload('00000000-0000-4000-8000-000000000001','cover','Alt text','00000000-0000-4000-8000-000000000002',true,'image/png',100,10,10)$$,
  '42501','permission denied for function media_reserve_upload','anonymous direct upload reservation is denied');
select throws_ok($$select * from media_private.media_uploads$$,'42501','anonymous direct quarantine access is denied');
reset role;
set local role authenticated;
select throws_ok($$select * from media_private.media_provider_operations$$,'42501','authenticated users cannot browse provider evidence');
select is((select count(*) from storage.objects where bucket_id='official-media-private'),0::bigint,'authenticated users cannot browse private media objects');
reset role;

select * from finish();
rollback;
