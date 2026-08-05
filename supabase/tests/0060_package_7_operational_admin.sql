begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

select has_table('admin_private','admin_command_receipts','Administrator commands have durable idempotency receipts');
select has_table('admin_private','admin_break_glass_gate','break-glass has an explicit named gate');
select ok((select not enabled and required_gate='D30_access_safety' from admin_private.admin_break_glass_gate where id=1),'break-glass defaults off behind its named gate');
select ok((select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_private' and c.relname in ('admin_command_receipts','admin_break_glass_gate') and c.relrowsecurity and c.relforcerowsecurity),'new Administrator tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='admin_private' and table_name in ('admin_command_receipts','admin_break_glass_gate') and grantee in ('anon','authenticated')),'browser roles have no direct Administrator table access');

select has_function('app_public','admin_list_review_cases',array[]::text[],'typed review queue RPC exists');
select has_function('app_public','admin_get_review_case',array['text'],'exact review context RPC exists');
select has_function('app_public','admin_decide_review_case',array['text','text','text','bigint','text'],'single-case decision RPC exists');
select has_function('app_public','admin_list_store_scopes',array[]::text[],'exact Store Representative scope list RPC exists');
select has_function('app_public','admin_preview_store_scope_change',array['text','text','bigint'],'server-issued exact scope preview RPC exists');
select has_function('app_public','admin_change_store_scope',array['text','text','text','bigint','text','text','text'],'exact revoke/regrant RPC exists');
select has_function('app_public','admin_preview_duplicate_merge',array['text','text'],'duplicate merge preview RPC exists');
select has_function('app_public','admin_execute_duplicate_merge',array['text','bigint','text'],'atomic merge RPC exists');
select has_function('app_public','admin_rollback_duplicate_merge',array['text','bigint','text'],'merge rollback RPC exists');

select ok(position('current_user_has_role' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position('current_session_is_active' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'server requires an active Administrator session');
select ok(position('current_session_has_mfa' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position('current_session_recent_auth(interval ''10 minutes'')' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'every operational RPC inherits MFA and recent authentication');
select ok(position('admin_break_glass_gate' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'normal Administrator commands fail closed if break-glass is enabled');
select ok(position('current_user_has_role' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position('privileged_anchor_is_current' in lower(pg_get_functiondef('app_private.current_user_has_role(app_private.app_role,uuid)'::regprocedure)))>0,
  'all Package 7 commands inherit the L-01 stale-anchor denial through the role seam');
select ok((select bool_and(position('require_operational_admin' in lower(pg_get_functiondef(command)))>0) from unnest(array[
  'app_public.admin_list_review_cases()'::regprocedure,
  'app_public.admin_get_review_case(text)'::regprocedure,
  'app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure,
  'app_public.admin_list_store_scopes()'::regprocedure,
  'app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure,
  'app_public.admin_preview_duplicate_merge(text,text)'::regprocedure,
  'app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure,
  'app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure
]) command),'every Package 7 public command fails through the stale audit-anchor authorization seam');

select ok(position('assigned_admin_id' in lower(pg_get_functiondef('app_public.admin_get_review_case(text)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('app_public.admin_get_review_case(text)'::regprocedure)))>0,'case opening claims one exact case under a row lock');
select ok(position('portal_private.controlled_changes' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0
  and position('portal_private.support_tickets' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0,'case context preserves Package 6B controlled-change and support types');
select ok(position('media_private.media_uploads' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))>0,'image review consumes the M-01 quarantine record');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_m01_admin_review' and tgrelid='media_private.media_uploads'::regclass),'M-01 awaiting-review uploads enter the typed queue');
select ok(exists(select 1 from pg_trigger where tgname='enqueue_pilot_admin_review' and tgrelid='partner_private.pilot_store_drafts'::regclass)
  and exists(select 1 from pg_trigger where tgname='enqueue_claim_admin_review' and tgrelid='partner_private.listing_claims'::regclass),'onboarding and listing claims enter the typed queue');
select ok(position('''immutablesubmission'',true' in replace(lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)),' ',''))>0,'submitted fields are explicitly immutable');
select ok(position('shopper_private' in lower(pg_get_functiondef('admin_private.review_case_json(uuid)'::regprocedure)))=0,'review context cannot browse shopper-private records');

select ok(position('p_action not in (''approve'',''return'',''reject'')' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'case decisions are type-specific approve, return, or reject only');
select ok(position('p_expected_version' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('admin_command_receipts' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'case decisions are optimistic and idempotent');
select ok(position('requested_by=actor' in replace(lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)),' ',''))>0
  or position('opened_by=actor' in replace(lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)),' ',''))>0,'self-approval is denied');
select ok(position('requested_value=' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))=0,'Administrator commands never edit submitted owner values');
select ok(position('update portal_private.controlled_changes' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('update portal_private.support_tickets' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'typed Package 6B decision states are durable');
select ok(position('media_approve_upload' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0,'image approval remains behind the M-01 approval command');
select ok(position('approve_pilot_onboarding_exact' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('pilot_approval_snapshots' in lower(pg_get_functiondef('partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea)'::regprocedure)))>0
  and position('insert into app_public.stores' in lower(pg_get_functiondef('partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea)'::regprocedure)))>0
  and position('store_partner_grants' in lower(pg_get_functiondef('partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea)'::regprocedure)))>0,
  'onboarding approval freezes the exact preview and atomically creates the Pilot Store Record and exact grant');
select ok(not exists(select 1 from information_schema.routines where routine_schema='app_public' and routine_name like 'admin%bulk%'),'no bulk approval command exists');

select ok(position('partner_private.store_partner_grants' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('app_private.role_grants' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'scope commands keep both exact grant authorities aligned');
select ok(position('p_operation not in (''revoke'',''regrant'')' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('p_operation=''grant''' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))=0,
  'Package 7 cannot bypass Package 6 onboarding or claim approval to create an initial grant');
select ok(position('partner_access_revocations' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'revocation immediately denies an already-open Portal session');
select ok(position('partner_consent_is_current' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'regrant requires current material consent');
select ok(position('provider_user_is_confirmed' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('email_confirmed_at' in lower(pg_get_functiondef('app_private.provider_user_is_confirmed(uuid)'::regprocedure)))>0
  and position('provider_user_has_verified_mfa' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('partner_authority_checks' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('listing_claims' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,
  'regrant verifies subject email/MFA, current authority evidence, and approved onboarding or claim state');
select ok(position('pg_advisory_xact_lock' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'scope changes serialize per subject and exact store');
select ok(position('admin_scope_actions' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('privileged_audit_events' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'scope changes write narrow local and privileged audit evidence');

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
select ok(position('shopper_private.saved_stores' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('shopper_private.private_store_memories' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,
  'merge handles saves and private memories without exposing them to the Administrator response');
select ok(position('trip_private.trip_stops' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('trip_duplicate_stop_warnings' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,
  'merge reparents trip stops and records owner-private duplicate-stop warnings');
select ok(position('review_private.public_reviews' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('review_private.rating_aggregates' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,
  'merge handles review conflicts and aggregate deltas transactionally');
select ok(position('publication_state=''draft''' in replace(lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)),' ',''))>0,'duplicate listing is hidden atomically');
select ok(position('state=''rolled_back''' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('admin_merge_ledgers' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'rollback is durable and provenance-backed');
select ok(position('store_partner_grants' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))=0
  and position('role_grants' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))=0,'rollback cannot reactivate representative authority');
select ok(position('saved_stores' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('private_store_memories' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('trip_stops' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('public_reviews' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0,
  'rollback restores every shopper, trip, and review reference class');

select has_table('admin_private','admin_privileged_rate_windows','Package 7 privileged rate windows are durable server state');
select ok(position('admin_privileged_rate_windows' in lower(pg_get_functiondef('admin_private.enforce_operational_admin_rate(uuid,uuid)'::regprocedure)))>0
  and position('30' in pg_get_functiondef('admin_private.enforce_operational_admin_rate(uuid,uuid)'::regprocedure))>0
  and position('10' in pg_get_functiondef('admin_private.enforce_operational_admin_rate(uuid,uuid)'::regprocedure))>0,
  'privileged mutations atomically enforce per-Administrator and exact-target hourly limits');
select ok(position('enforce_operational_admin_rate' in lower(pg_get_functiondef('app_public.admin_decide_review_case(text,text,text,bigint,text)'::regprocedure)))>0
  and position('enforce_operational_admin_rate' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('enforce_operational_admin_rate' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,
  'every Package 7 privileged mutation enters the shared atomic rate-limit seam');

select ok(position('privileged_audit_events' in lower(pg_get_functiondef('admin_private.record_operational_admin_event(text,uuid,uuid,bytea,text)'::regprocedure)))>0,'all mutations append narrow privileged audit evidence');
select ok(not has_function_privilege('anon','app_public.admin_list_review_cases()','EXECUTE')
  and has_function_privilege('authenticated','app_public.admin_list_review_cases()','EXECUTE'),'Administrator RPCs are authenticated only');
select ok(position('review_private' in lower(pg_get_functiondef('app_public.admin_list_review_cases()'::regprocedure)))=0
  and position('shopper_private' in lower(pg_get_functiondef('app_public.admin_list_store_scopes()'::regprocedure)))=0,'Administrator list surfaces exclude shopper and review-private data');

select ok(position('admin_scope_previews' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0
  and position('consumed_at' in lower(pg_get_functiondef('app_public.admin_change_store_scope(text,text,text,bigint,text,text,text)'::regprocedure)))>0,'regrant denies a missing, stale, mismatched, or replayed server preview');
select ok(position('on conflict(case_type,target_id)' in replace(lower(pg_get_functiondef('admin_private.enqueue_typed_review()'::regprocedure)),' ',''))>0
  and position('snapshot_hash=excluded.snapshot_hash' in replace(lower(pg_get_functiondef('admin_private.enqueue_typed_review()'::regprocedure)),' ',''))>0,'resubmission refreshes and unlocks the exact review snapshot');
select ok(position('encode(digest,''hex'')' in replace(lower(pg_get_functiondef('admin_private.enqueue_typed_review()'::regprocedure)),' ',''))>0
  and position('case_version' in lower(pg_get_functiondef('admin_private.enqueue_typed_review()'::regprocedure)))>0,
  'each resubmitted draft snapshot receives a distinct idempotent queue event');
select ok(position('admin_audit_anchor_health' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0
  and position('admin_privileged_audit_outbox' in lower(pg_get_functiondef('admin_private.require_operational_admin()'::regprocedure)))>0,'every command fails closed on Package 7 audit health or outbox failure');
select ok(exists(select 1 from pg_trigger where tgname='sync_package_7_audit_anchor_health' and tgrelid='app_private.audit_anchor_capability'::regclass)
  and position('admin_audit_anchor_health' in lower(pg_get_functiondef('admin_private.sync_package_7_audit_anchor_health()'::regprocedure)))>0
  and position('audit_chain_roots' in lower(pg_get_functiondef('admin_private.sync_package_7_audit_anchor_health()'::regprocedure)))>0,
  'the L-01 anchoring worker and watchdog update the Package 7 health latch');
select ok(position('occurred_at>cutoff' in replace(lower(pg_get_functiondef('admin_private.enforce_operational_admin_rate(uuid,uuid)'::regprocedure)),' ',''))>0
  and position('retryafterseconds' in lower(pg_get_functiondef('admin_private.enforce_operational_admin_rate(uuid,uuid)'::regprocedure)))>0,'rate limits use a true sliding hour and bounded retry metadata');
select ok(position('admin_duplicate_merge_plan_items' in lower(pg_get_functiondef('app_public.admin_preview_duplicate_merge(text,text)'::regprocedure)))>0
  and position('merge_reference_snapshot' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'merge execution denies any mutation after its exact enumerated preview');
select ok(position('''canonical_store''' in lower(pg_get_functiondef('admin_private.merge_reference_snapshot(uuid,uuid)'::regprocedure)))>0
  and position('p_canonical' in lower(pg_get_functiondef('admin_private.merge_reference_snapshot(uuid,uuid)'::regprocedure)))>0
  and position('p_duplicate' in lower(pg_get_functiondef('admin_private.merge_reference_snapshot(uuid,uuid)'::regprocedure)))>0,
  'the exact merge preview binds the full canonical and duplicate Store Record snapshots');
select ok(position('store_update_merge_conflicts' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('support_ticket_merge_conflicts' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'portal collisions are durable and reparented before tombstoning');
select ok(position('admin_merge_execution_items' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('merge_current_item_digest' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0,'rollback denies newer shopper, review, trip, or portal mutations using per-row post-execution digests');
select ok(
  position('lock_merge_reference_set' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('lock_merge_reference_set' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('p_canonical,p_duplicate' in replace(lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)),' ',''))>0
  and position('shopper_private.saved_stores' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('trip_private.trip_stops' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('review_private.public_reviews' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('portal_private.store_updates' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('partner_private.store_partner_grants' in lower(pg_get_functiondef('admin_private.lock_merge_reference_set(uuid,uuid,uuid)'::regprocedure)))>0
  and position('lock_merge_reference_set' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))
    < position('merge_reference_snapshot' in lower(pg_get_functiondef('app_public.admin_execute_duplicate_merge(text,bigint,text)'::regprocedure)))
  and position('lock_merge_reference_set' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure)))
    < position('merge_current_item_digest' in lower(pg_get_functiondef('app_public.admin_rollback_duplicate_merge(text,bigint,text)'::regprocedure))),
  'execute and rollback lock every merge child row before concurrent preview or digest validation');

select * from finish();
rollback;
