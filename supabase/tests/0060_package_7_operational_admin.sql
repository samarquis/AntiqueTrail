begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

select has_table('admin_private','admin_command_receipts','Administrator commands have durable idempotency receipts');
select has_table('admin_private','admin_break_glass_gate','break-glass has an explicit named gate');
select ok((select not enabled and required_gate='D30_access_safety' from admin_private.admin_break_glass_gate where id=1),'break-glass defaults off behind its named gate');
select ok((select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_private' and c.relname in ('admin_command_receipts','admin_break_glass_gate') and c.relrowsecurity and c.relforcerowsecurity),'new Administrator tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='admin_private' and table_name in ('admin_command_receipts','admin_break_glass_gate') and grantee in ('anon','authenticated')),'browser roles have no direct Administrator table access');

select has_function('app_public','admin_list_review_cases',array[]::text[],'typed review queue RPC exists');
select has_function('app_public','admin_get_review_case',array['text'],'exact review context RPC exists');
select has_function('app_public','admin_decide_review_case',array['text','text','text','bigint','text'],'single-case decision RPC exists');
select has_function('app_public','admin_list_store_scopes',array[]::text[],'exact Store Representative scope list RPC exists');
select has_function('app_public','admin_change_store_scope',array['text','text','text','bigint','text','text'],'exact revoke/regrant RPC exists');
select has_function('app_public','admin_preview_duplicate_merge',array['text','text'],'duplicate merge preview RPC exists');
select has_function('app_public','admin_execute_duplicate_merge',array['text','bigint','text'],'atomic merge RPC exists');
select has_function('app_public','admin_rollback_duplicate_merge',array['text','bigint','text'],'merge rollback RPC exists');

select ok(position('current_user_has_role' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position('current_session_is_active' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'server requires an active Administrator session');
select ok(position('current_session_has_mfa' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position("current_session_recent_auth(interval '10 minutes')" in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'every operational RPC inherits MFA and recent authentication');
select ok(position('admin_break_glass_gate' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'normal Administrator commands fail closed if break-glass is enabled');

select ok(position('assigned_admin_id' in lower(pg_get_functiondef('app_public.admin_get_review_case(text)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('app_public.admin_get_review_case(text)'::regprocedure)))>0,'case opening claims one exact case under a row lock');
select ok(position('portal_private.controlled_changes' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0
  and position('portal_private.support_tickets' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0,'case context preserves Package 6B controlled-change and support types');
select ok(position('media_private.media_uploads' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0,'image review consumes the M-01 quarantine record');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_m01_admin_review' and tgrelid='media_private.media_uploads'::regclass),'M-01 awaiting-review uploads enter the typed queue');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_pilot_admin_review' and tgrelid='partner_private.pilot_store_drafts'::regclass)
  and exists(select 1 from pg_trigger where tgname='enqueue_claim_admin_review' and tgrelid='partner_private.listing_claims'::regclass),'onboarding and listing claims enter the typed queue');
select ok(position("'immutablesubmission',true" in replace(lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)),' ',''))>0,'submitted fields are explicitly immutable');
select ok(position('shopper_private' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))=0,'review context cannot browse shopper-private records');

select ok(position("p_action not in ('approve','return','reject')" in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'case decisions are type-specific approve, return, or reject only');
select ok(position('p_expected_version' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('admin_command_receipts' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'case decisions are optimistic and idempotent');
select ok(position('requested_by=actor' in replace(lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)),' ',''))>0
  or position('opened_by=actor' in replace(lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)),' ',''))>0,'self-approval is denied');
select ok(position('requested_value=' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))=0,'Administrator commands never edit submitted owner values');
select ok(position('update portal_private.controlled_changes' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('update portal_private.support_tickets' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'typed Package 6B decision states are durable');
select ok(position('media_approve_upload' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'image approval remains behind the M-01 approval command');
select ok(not exists(select 1 from information_schema.routines where routine_schema='app_public' and routine_name like 'admin%bulk%'),'no bulk approval command exists');

select ok(position('partner_private.store_partner_grants' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0
  and position('app_private.role_grants' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'scope commands keep both exact grant authorities aligned');
select ok(position("p_operation not in ('grant','revoke','regrant')" in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'scope commands support one exact grant, revoke, or regrant');
select ok(position('partner_access_revocations' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'revocation immediately denies an already-open Portal session');
select ok(position('partner_consent_is_current' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'regrant requires current material consent');
select ok(position('pg_advisory_xact_lock' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'scope changes serialize per subject and exact store');
select ok(position('admin_scope_actions' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0
  and position('privileged_audit_events' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text)'::regprocedure)))>0,'scope changes write narrow local and privileged audit evidence');

select ok(position('authorityreparented' in replace(lower(pg_get_functiondef('admin_private.merge_plan_json(uuid)'::regprocedure)),' ',''))>0
  and position('false' in lower(pg_get_functiondef('admin_private.merge_plan_json(uuid)'::regprocedure)))>0,'merge plans never reparent representative authority');
select ok(position('pg_advisory_xact_lock' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'merge execution is atomic and locked');
select ok(position('admin_merge_ledgers' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('store_tombstones' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'merge preserves ledger provenance and tombstones the duplicate');
select ok(position('claim_quarantine' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('grant_quarantine' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'authority conflicts are quarantined instead of reparented');
select ok(position('portal_private.store_updates' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('portal_private.support_tickets' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'safe Package 6B records are reparented');
select ok(position('shopper_private' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))=0,'merge does not inspect or mutate shopper-private records');
select ok(position("publication_state='draft'" in replace(lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)),' ',''))>0,'duplicate listing is hidden atomically');
select ok(position('state=''rolled_back''' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('admin_merge_ledgers' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'rollback is durable and provenance-backed');
select ok(position('store_partner_grants' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))=0
  and position('role_grants' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))=0,'rollback cannot reactivate representative authority');

select ok(position('privileged_audit_events' in lower(pg_get_functiondef('admin_private.record_operational_admin_event(text,uuid,uuid,bytea,text)'::regprocedure)))>0,'all mutations append narrow privileged audit evidence');
select ok(not has_function_privilege('anon','app_public.admin_list_review_cases()','EXECUTE')
  and has_function_privilege('authenticated','app_public.admin_list_review_cases()','EXECUTE'),'Administrator RPCs are authenticated only');
select ok(position('review_private' in lower(pg_get_functiondef('app_public.admin_list_review_cases()'::regprocedure)))=0
  and position('shopper_private' in lower(pg_get_functiondef('app_public.admin_list_store_scopes()'::regprocedure)))=0,'Administrator list surfaces exclude shopper and review-private data');

select * from finish();
rollback;
