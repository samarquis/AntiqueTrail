begin;
select plan(52);

select has_schema('admin_private','admin-private schema exists');
select has_table('admin_private','admin_review_cases','typed admin review cases table exists');
select has_table('admin_private','admin_case_events','admin case events table exists');
select has_table('admin_private','admin_field_change_requests','controlled field changes table exists');
select has_table('admin_private','admin_duplicate_merge_proposals','duplicate merge proposals table exists');
select has_table('admin_private','admin_merge_ledgers','merge ledgers table exists');
select has_table('admin_private','store_tombstones','store tombstones table exists');
select has_table('admin_private','admin_scope_actions','scope action receipts table exists');
select has_table('admin_private','admin_privileged_audit_outbox','privileged audit outbox exists');
select has_table('admin_private','admin_audit_anchor_health','audit anchor health exists');

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)),'all Package 7 tables FORCE RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='admin_private' and grantee in ('anon','authenticated')),'no anonymous/authenticated direct admin grants');
select ok(not exists(select 1 from pg_policies where schemaname='admin_private' and roles && array['anon'::name,'public'::name] and cmd in ('INSERT','UPDATE','DELETE')),'no public promotion/write policies');

select ok(exists(select 1 from pg_constraint where conname='admin_case_snapshot_hash_size'),'case snapshot is hash-only');
select ok(exists(select 1 from pg_constraint where conname='admin_case_lock_bound'),'case lock is bounded to 15 minutes');
select ok(exists(select 1 from pg_constraint where conname='admin_case_lock_shape'),'case lock owner/expiry shape is constrained');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='admin_review_queue_idx'),'typed queue index exists');
select ok(exists(select 1 from pg_trigger where tgname='admin_case_events_append_only'),'case events append-only');
select ok(exists(select 1 from pg_constraint where conname='admin_change_value_hash_size'),'field changes store value hash only');
select ok(exists(select 1 from pg_constraint where conname='admin_change_review_shape'),'field change approval requires reviewer/time');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='one_pending_field_change_target' and i.indisunique),'one pending change per exact target field');

select ok(exists(select 1 from pg_constraint where conname='admin_merge_distinct_stores'),'merge canonical/duplicate stores must differ');
select ok(exists(select 1 from pg_constraint where conname='admin_merge_preview_hash_size'),'merge preview is hash-bound');
select ok(exists(select 1 from pg_constraint where conname='admin_merge_execution_shape'),'merge execution state is timestamp-bound');
select ok(exists(select 1 from pg_constraint where conname='admin_merge_rollback_shape'),'merge rollback state is timestamp-bound');
select ok(exists(select 1 from pg_trigger where tgname='admin_merge_ledger_append_only'),'merge ledger append-only');
select ok(exists(select 1 from pg_constraint where conname='store_tombstone_rollback_shape'),'store tombstone rollback is explicit');

select ok(exists(select 1 from pg_constraint where conname='admin_scope_role_shape'),'scope action role/store scope is exact');
select ok(exists(select 1 from pg_constraint where conname='admin_scope_regrant_prerequisite'),'regrant requires prior grant');
select ok(exists(select 1 from pg_constraint where conname='admin_scope_preview_hash_size'),'scope action requires exact preview hash');
select ok(exists(select 1 from information_schema.columns where table_schema='admin_private' and table_name='admin_scope_actions' and column_name='recent_auth_at'),'scope action records recent-auth proof');
select ok(exists(select 1 from information_schema.columns where table_schema='admin_private' and table_name='admin_scope_actions' and column_name='mfa_verified_at'),'scope action records MFA proof');
select ok(exists(select 1 from pg_trigger where tgname='admin_scope_actions_append_only'),'scope action receipts append-only');

select ok(exists(select 1 from pg_constraint where conname='admin_outbox_event_hash_size'),'outbox stores event hash only');
select ok(exists(select 1 from pg_constraint where conname='admin_anchor_health_shape'),'anchor health fails closed until root health exists');
select ok((select state='healthy' and deployment_environment='local' from admin_private.admin_audit_anchor_health where id=1),'local synthetic anchor health synchronizes from the disabled local capability');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_private' and c.relname like '%promotion%'),'public promotion table is absent');

select ok(exists(select 1 from pg_policies where schemaname='admin_private' and policyname='assigned_admin_case_read' and replace(coalesce(qual,''),' ','') like '%assigned_admin_id=app_public.request_user_id()%' and coalesce(qual,'') like '%current_session_has_mfa%' and coalesce(qual,'') like '%current_session_recent_auth%'),'case reads require assignment/MFA/recent auth');
select ok(exists(select 1 from pg_policies where schemaname='admin_private' and policyname='assigned_admin_case_event_read' and coalesce(qual,'') like '%admin_review_cases%' and replace(coalesce(qual,''),' ','') like '%assigned_admin_id=app_public.request_user_id()%'),'case events are selected-case scoped');
select ok(exists(select 1 from pg_policies where schemaname='admin_private' and policyname='assigned_admin_change_read' and coalesce(qual,'') like '%admin_review_cases%' and replace(coalesce(qual,''),' ','') like '%assigned_admin_id=app_public.request_user_id()%'),'change evidence is selected-case scoped');
select ok(exists(select 1 from pg_policies where schemaname='admin_private' and policyname='assigned_admin_merge_read' and replace(coalesce(qual,''),' ','') like '%requested_by=app_public.request_user_id()%' and replace(coalesce(qual,''),' ','') like '%reviewed_by=app_public.request_user_id()%'),'merge preview is actor scoped');

select ok(not exists(select 1 from information_schema.columns where table_schema='admin_private' and column_name in ('shopper_note','shopper_rating','private_trip_payload','raw_evidence','document_bytes')),'admin schema excludes shopper/private/raw evidence columns');
select ok(exists(select 1 from pg_constraint where conname='admin_case_event_key_safe'),'case event idempotency key bounded');
select ok(exists(select 1 from pg_constraint where conname='admin_scope_key_safe'),'scope action idempotency key bounded');
select ok(exists(select 1 from pg_constraint where conname='admin_merge_summary_object'),'merge preview summary is structured metadata');

set local role anon;
select throws_ok($$select * from admin_private.admin_review_cases$$,'42501',null,'anonymous review read denied');
select throws_ok($$select * from admin_private.admin_scope_actions$$,'42501',null,'anonymous scope read denied');
select throws_ok($$insert into admin_private.admin_review_cases(case_type,target_kind,target_id,snapshot_hash) values ('access_safety','grant','00000000-0000-0000-0000-000000000001',repeat(E'\\001',32)::bytea)$$,'42501',null,'anonymous review write denied');
reset role;
set local role authenticated;
select throws_ok($$select * from admin_private.admin_case_events$$,'42501',null,'authenticated direct case-event read denied');
select throws_ok($$select * from admin_private.admin_privileged_audit_outbox$$,'42501',null,'authenticated direct outbox read denied');
select throws_ok($$insert into admin_private.admin_scope_actions(grant_id,subject_user_id,role,action,expected_grant_version,scope_preview_hash,reason_code,recent_auth_at,mfa_verified_at,decided_by,outcome,idempotency_key) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','administrator','revoke',1,repeat(E'\\001',32)::bytea,'test',statement_timestamp(),statement_timestamp(),'00000000-0000-0000-0000-000000000001','denied','x')$$,'42501',null,'authenticated scope action write denied');
select throws_ok($$select * from admin_private.admin_audit_anchor_health$$,'42501',null,'authenticated anchor health read denied');
reset role;

select * from finish();
rollback;
