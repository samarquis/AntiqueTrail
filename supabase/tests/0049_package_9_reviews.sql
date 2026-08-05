begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select has_schema('review_private','Package 9 has an isolated review schema');
select has_table('review_private','public_reviews','durable text reviews exist');
select has_table('review_private','review_versions','restricted review versions exist');
select has_table('review_private','rating_aggregates','server-owned aggregates exist');
select has_table('review_private','review_reports','privacy-minimized reports exist');
select has_table('review_private','moderation_cases','case-scoped moderation exists');
select has_table('review_private','moderation_case_evidence','case evidence is separately restricted');
select has_table('review_private','review_appeals','one-appeal lifecycle exists');
select has_table('review_private','reviewer_identities','qualified reviewer identities exist');
select has_table('review_private','reviewer_assertion_receipts','fresh reviewer assertions are case bound');
select has_table('review_private','review_restrictions','review-only restrictions exist');
select has_table('review_private','restriction_appeals','restriction appeals exist');
select has_table('review_private','review_audit_events','narrow hash-chained audit exists');

select ok((select count(*)=16 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='review_private' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),
  'all Package 9 tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants
  where table_schema='review_private' and grantee in ('anon','authenticated')),
  'browser roles cannot bypass RPCs with direct table access');
select ok(exists(select 1 from pg_indexes where schemaname='review_private'
  and indexname='one_live_review_per_author_store' and indexdef like 'CREATE UNIQUE%'),
  'one nondeleted review per author and store is enforced');
select ok(exists(select 1 from pg_trigger where tgname='review_versions_append_only' and not tgisinternal),
  'review versions are append-only');
select ok(exists(select 1 from pg_trigger where tgname='review_audit_append_only' and not tgisinternal),
  'review audit is append-only');

select has_function('app_public','reviews_get_capability',array[]::text[],'server capability projection exists');
select has_function('app_public','reviews_get_eligibility',array['uuid'],'bounded eligibility projection exists');
select has_function('app_public','reviews_get_store',array['uuid'],'approved public/own review projection exists');
select has_function('app_public','reviews_create',array['uuid','integer','text','text','integer','integer','text','boolean'],'create command exists');
select has_function('app_public','reviews_edit',array['uuid','uuid','integer','text','text','integer','integer','text','boolean'],'author edit command exists');
select has_function('app_public','reviews_request_delete',array['uuid'],'atomic delete/Undo command exists');
select has_function('app_public','reviews_undo_delete',array['uuid'],'author Undo command exists');
select has_function('app_public','reviews_report',array['uuid','text'],'reason-neutral report command exists');
select has_function('app_public','reviews_submit_appeal',array['uuid','text'],'single appeal command exists');
select has_function('app_public','reviews_list_moderation_cases',array[]::text[],'scoped moderation queue exists');
select has_function('app_public','reviews_moderate',array['uuid','text','text'],'moderation command exists');
select has_function('app_public','reviews_decide_appeal',array['uuid','text','text'],'different-reviewer command exists');
select has_function('app_public','reviews_submit_restriction_appeal',array['uuid','text'],'restriction appeal command exists');
select has_function('app_public','reviews_decide_restriction_appeal',array['uuid','text','text'],'restriction decision command exists');
select has_function('app_public','reviews_expire_restriction',array['uuid'],'restriction expiry command exists');
select has_function('review_private','finalize_review_deletions',array['timestamp with time zone','integer'],'lifecycle worker finalizes deletion');
select has_function('review_private','deidentify_account_reviews',array['uuid','uuid'],'day-8 de-identification hook exists');

select ok(not has_function_privilege('anon','app_public.reviews_create(uuid,integer,text,text,integer,integer,text,boolean)','EXECUTE')
  and has_function_privilege('authenticated','app_public.reviews_create(uuid,integer,text,text,integer,integer,text,boolean)','EXECUTE'),
  'only authenticated sessions can create reviews');
select ok(not has_function_privilege('authenticated','review_private.finalize_review_deletions(timestamp with time zone,integer)','EXECUTE'),
  'browser sessions cannot run lifecycle purge');
select ok(not has_function_privilege('authenticated','review_private.deidentify_account_reviews(uuid,uuid)','EXECUTE'),
  'browser sessions cannot invoke account erasure hook');
select ok(position("public_capability_enabled('reviews')" in lower(pg_get_functiondef('review_private.review_stage_allowed(uuid)'::regprocedure)))>0
  and position("stage='synthetic_alpha'" in replace(lower(pg_get_functiondef('review_private.review_stage_allowed(uuid)'::regprocedure)),' ',''))>0,
  'real reviews require Package 10B while Synthetic rehearsal is explicitly bounded');
select ok(position("interval '60 seconds'" in lower(pg_get_functiondef('app_public.reviews_request_delete(uuid)'::regprocedure)))>0,
  'delete Undo is exactly sixty seconds');
select ok(position('rebuild_rating_aggregate' in lower(pg_get_functiondef('app_public.reviews_request_delete(uuid)'::regprocedure)))>0
  and position('rebuild_rating_aggregate' in lower(pg_get_functiondef('app_public.reviews_undo_delete(uuid)'::regprocedure)))>0,
  'delete and Undo change aggregate effect transactionally');
select ok(position('assigned_admin_id<>actor' in replace(lower(pg_get_functiondef('app_public.reviews_moderate(uuid,text,text)'::regprocedure)),' ',''))>0
  and position('current_session_has_mfa' in lower(pg_get_functiondef('app_public.reviews_moderate(uuid,text,text)'::regprocedure)))>0
  and position('current_session_recent_auth' in lower(pg_get_functiondef('app_public.reviews_moderate(uuid,text,text)'::regprocedure)))>0,
  'moderation is exact-case scoped with MFA and recent authentication');
select ok(position('original_moderator_id=actor' in replace(lower(pg_get_functiondef('app_public.reviews_decide_appeal(uuid,text,text)'::regprocedure)),' ',''))>0,
  'the original moderator is denied appeal decisions');
select ok(position('active_credential_count<2' in replace(lower(pg_get_functiondef('app_public.reviews_decide_appeal(uuid,text,text)'::regprocedure)),' ',''))>0
  and position('assertion_verified_at' in lower(pg_get_functiondef('app_public.reviews_decide_appeal(uuid,text,text)'::regprocedure)))>0,
  'appeal decisions require the verifier-derived active credential cache and a fresh assertion');
select ok(position('gen_random_uuid()' in lower(pg_get_functiondef('review_private.deidentify_account_reviews(uuid,uuid)'::regprocedure)))>0
  and position('review_text=null' in replace(lower(pg_get_functiondef('review_private.deidentify_account_reviews(uuid,uuid)'::regprocedure)),' ',''))>0,
  'day-8 processing uses a random tombstone and purges display/text linkage');

set local role anon;
select throws_ok($$select app_public.reviews_get_eligibility('00000000-0000-4000-8000-000000000001')$$,'42501','review_authentication_required','anonymous eligibility reads deny');
select throws_ok($$select app_public.reviews_create('00000000-0000-4000-8000-000000000001',5,'text','name',8,2026,'none',true)$$,'42501','permission denied for function reviews_create','anonymous mutation execution is denied');
select throws_ok($$select * from review_private.public_reviews$$,'42501','anonymous direct review-table access is denied');
reset role;
set local role authenticated;
select throws_ok($$select * from review_private.moderation_case_evidence$$,'42501','authenticated users cannot browse case evidence');
select throws_ok($$select * from review_private.review_versions$$,'42501','authenticated users cannot browse historical review text');
reset role;

select * from finish();
rollback;
