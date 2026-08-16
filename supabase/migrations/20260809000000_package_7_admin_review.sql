-- Package 7: scoped Administrator review, Access & Safety, and duplicate merge metadata.
-- No shopper-private browsing, public promotion, bulk review, or grant creation is exposed here.

create schema if not exists admin_private;
revoke all on schema admin_private from public, anon, authenticated;
grant usage on schema admin_private to identity_service;

create table admin_private.admin_review_cases (
  case_id uuid primary key default extensions.gen_random_uuid(),
  case_type text not null check (case_type in ('partner_onboarding','store_change','image_review','support','listing_claim','duplicate_merge','access_safety')),
  target_kind text not null check (target_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_id uuid not null,
  store_id uuid references app_public.stores(id) on delete restrict,
  snapshot_hash bytea not null,
  state text not null default 'open' check (state in ('open','claimed','changes_requested','approved','rejected','revoked','closed')),
  assigned_admin_id uuid references auth.users(id) on delete set null,
  lock_owner_id uuid references auth.users(id) on delete set null,
  lock_acquired_at timestamptz,
  lock_expires_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_case_snapshot_hash_size check (octet_length(snapshot_hash)=32),
  constraint admin_case_lock_bound check (lock_expires_at is null or (lock_acquired_at is not null and lock_expires_at<=lock_acquired_at+interval '15 minutes')),
  constraint admin_case_lock_shape check ((lock_owner_id is null and lock_acquired_at is null and lock_expires_at is null) or (lock_owner_id is not null and lock_acquired_at is not null and lock_expires_at is not null))
);
create index admin_review_queue_idx on admin_private.admin_review_cases(case_type,state,created_at);
create index admin_review_assignment_idx on admin_private.admin_review_cases(assigned_admin_id,state);

create table admin_private.admin_case_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references admin_private.admin_review_cases(case_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_kind text not null check (event_kind in ('created','claimed','unclaimed','changes_requested','approved','rejected','revoked','closed','lock_expired')),
  from_state text,
  to_state text,
  reason_code text,
  snapshot_hash bytea,
  idempotency_key text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  unique(case_id,idempotency_key),
  constraint admin_case_event_reason_safe check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint admin_case_event_snapshot_hash_size check (snapshot_hash is null or octet_length(snapshot_hash)=32),
  constraint admin_case_event_key_safe check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create table admin_private.admin_field_change_requests (
  change_request_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references admin_private.admin_review_cases(case_id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  target_kind text not null check (target_kind in ('store_text','store_hours','store_social','store_support','store_image')),
  target_id uuid not null,
  field_name text not null check (field_name ~ '^[a-z][a-z0-9_]{1,63}$'),
  proposed_value_hash bytea not null,
  expected_version bigint not null check (expected_version>0),
  state text not null default 'pending' check (state in ('pending','changes_requested','approved','rejected','withdrawn')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reason_code text,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_change_value_hash_size check (octet_length(proposed_value_hash)=32),
  constraint admin_change_review_shape check ((state in ('approved','rejected','changes_requested') and reviewed_by is not null and reviewed_at is not null) or (state in ('pending','withdrawn') and reviewed_at is null)),
  constraint admin_change_reason_safe check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$')
);
create unique index one_pending_field_change_target on admin_private.admin_field_change_requests(case_id,target_id,field_name) where state in ('pending','changes_requested');

create table admin_private.admin_duplicate_merge_proposals (
  proposal_id uuid primary key default extensions.gen_random_uuid(),
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  duplicate_store_id uuid not null references app_public.stores(id) on delete restrict,
  preview_hash bytea not null,
  collision_summary jsonb not null default '{}'::jsonb,
  state text not null default 'previewed' check (state in ('previewed','approved','executed','rolled_back','rejected')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  expected_canonical_version bigint not null check (expected_canonical_version>0),
  expected_duplicate_version bigint not null check (expected_duplicate_version>0),
  executed_at timestamptz,
  rolled_back_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_merge_distinct_stores check (canonical_store_id<>duplicate_store_id),
  constraint admin_merge_preview_hash_size check (octet_length(preview_hash)=32),
  constraint admin_merge_summary_object check (jsonb_typeof(collision_summary)='object'),
  constraint admin_merge_review_shape check ((state in ('approved','rejected') and reviewed_by is not null) or state not in ('approved','rejected')),
  constraint admin_merge_execution_shape check ((state='executed' and executed_at is not null) or (state<>'executed' and executed_at is null)),
  constraint admin_merge_rollback_shape check ((state='rolled_back' and rolled_back_at is not null) or (state<>'rolled_back' and rolled_back_at is null))
);

create table admin_private.admin_merge_ledgers (
  ledger_entry_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  reference_kind text not null check (reference_kind in ('store','saved_store','private_memory','trip_stop','review','claim','grant')),
  reference_id uuid not null,
  original_store_id uuid not null references app_public.stores(id) on delete restrict,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  collision_kind text not null check (collision_kind in ('none','duplicate_save','memory_conflict','trip_stop','review_conflict','claim_quarantine','grant_quarantine')),
  resolution_state text not null default 'pending' check (resolution_state in ('pending','reparented','preserved','hidden','quarantined','rolled_back')),
  aggregate_delta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  constraint admin_merge_ledger_store_distinct check (original_store_id<>canonical_store_id),
  constraint admin_merge_ledger_delta_object check (jsonb_typeof(aggregate_delta)='object')
);

create table admin_private.store_tombstones (
  tombstone_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null unique references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  merged_store_id uuid not null references app_public.stores(id) on delete restrict,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  state text not null default 'active' check (state in ('active','rolled_back')),
  created_at timestamptz not null default statement_timestamp(),
  rolled_back_at timestamptz,
  constraint store_tombstone_distinct check (merged_store_id<>canonical_store_id),
  constraint store_tombstone_rollback_shape check ((state='rolled_back' and rolled_back_at is not null) or (state='active' and rolled_back_at is null))
);

create table admin_private.admin_scope_actions (
  action_id uuid primary key default extensions.gen_random_uuid(),
  grant_id uuid not null references app_private.role_grants(grant_id) on delete restrict,
  subject_user_id uuid not null references auth.users(id) on delete restrict,
  role app_private.app_role not null,
  store_id uuid references app_public.stores(id) on delete restrict,
  action text not null check (action in ('revoke','regrant')),
  prior_grant_id uuid references app_private.role_grants(grant_id) on delete restrict,
  expected_grant_version bigint not null check (expected_grant_version>0),
  scope_preview_hash bytea not null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  recent_auth_at timestamptz not null,
  mfa_verified_at timestamptz not null,
  decided_by uuid not null references auth.users(id) on delete restrict,
  outcome text not null check (outcome in ('requested','completed','denied','failed')),
  idempotency_key text not null unique,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint admin_scope_role_shape check ((role='representative' and store_id is not null) or (role in ('shopper','administrator') and store_id is null)),
  constraint admin_scope_preview_hash_size check (octet_length(scope_preview_hash)=32),
  constraint admin_scope_regrant_prerequisite check ((action='regrant' and prior_grant_id is not null) or action='revoke'),
  constraint admin_scope_key_safe check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create table admin_private.admin_privileged_audit_outbox (
  outbox_id uuid primary key default extensions.gen_random_uuid(),
  action_id uuid not null references admin_private.admin_scope_actions(action_id) on delete restrict,
  event_hash bytea not null,
  state text not null default 'pending' check (state in ('pending','sent','failed','blocked')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  next_attempt_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint admin_outbox_event_hash_size check (octet_length(event_hash)=32),
  constraint admin_outbox_error_code_safe check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{1,63}$')
);

create table admin_private.admin_audit_anchor_health (
  id smallint primary key default 1 check (id=1),
  state text not null default 'healthy' check (state in ('healthy','degraded','blocked')),
  through_sequence_no bigint not null default 0 check (through_sequence_no>=0),
  root_hash bytea,
  last_anchored_at timestamptz,
  checked_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check (version>0),
  constraint admin_anchor_root_hash_size check (root_hash is null or octet_length(root_hash)=32),
  constraint admin_anchor_health_shape check ((state='healthy' and root_hash is not null and last_anchored_at is not null) or state<>'healthy')
);
insert into admin_private.admin_audit_anchor_health(id,state,through_sequence_no,root_hash,last_anchored_at)
values (1,'blocked',0,null,null) on conflict (id) do nothing;

create or replace function admin_private.reject_append_only_mutation()
returns trigger language plpgsql set search_path = pg_catalog,admin_private as $$
begin raise exception 'admin_append_only'; end;
$$;
create trigger admin_case_events_append_only before update or delete on admin_private.admin_case_events for each row execute function admin_private.reject_append_only_mutation();
create trigger admin_merge_ledger_append_only before update or delete on admin_private.admin_merge_ledgers for each row execute function admin_private.reject_append_only_mutation();
create trigger admin_scope_actions_append_only before update or delete on admin_private.admin_scope_actions for each row execute function admin_private.reject_append_only_mutation();

do $$ declare t text; begin
  foreach t in array array['admin_review_cases','admin_case_events','admin_field_change_requests','admin_duplicate_merge_proposals','admin_merge_ledgers','store_tombstones','admin_scope_actions','admin_privileged_audit_outbox','admin_audit_anchor_health'] loop
    execute format('alter table admin_private.%I enable row level security',t);
    execute format('alter table admin_private.%I force row level security',t);
    execute format('revoke all on admin_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on admin_private.%I to identity_service',t);
  end loop;
end $$;
revoke update, delete, truncate on admin_private.admin_case_events from identity_service;
revoke update, delete, truncate on admin_private.admin_merge_ledgers from identity_service;
revoke update, delete, truncate on admin_private.admin_scope_actions from identity_service;

create policy identity_service_admin_cases on admin_private.admin_review_cases for all to identity_service using (true) with check (true);
create policy identity_service_admin_case_events on admin_private.admin_case_events for all to identity_service using (true) with check (true);
create policy identity_service_admin_changes on admin_private.admin_field_change_requests for all to identity_service using (true) with check (true);
create policy identity_service_admin_merges on admin_private.admin_duplicate_merge_proposals for all to identity_service using (true) with check (true);
create policy identity_service_admin_ledgers on admin_private.admin_merge_ledgers for all to identity_service using (true) with check (true);
create policy identity_service_admin_tombstones on admin_private.store_tombstones for all to identity_service using (true) with check (true);
create policy identity_service_admin_scope_actions on admin_private.admin_scope_actions for all to identity_service using (true) with check (true);
create policy identity_service_admin_outbox on admin_private.admin_privileged_audit_outbox for all to identity_service using (true) with check (true);
create policy identity_service_admin_anchor_health on admin_private.admin_audit_anchor_health for all to identity_service using (true) with check (true);

-- Administrators receive no direct table grants. These policies are documentation for future exact-case RPCs.
create policy assigned_admin_case_read on admin_private.admin_review_cases for select to authenticated
  using (assigned_admin_id=app_public.request_user_id() and app_private.current_session_is_active() and app_private.current_session_has_mfa() and app_private.current_session_recent_auth(interval '15 minutes'));
create policy assigned_admin_case_event_read on admin_private.admin_case_events for select to authenticated
  using (exists(select 1 from admin_private.admin_review_cases c where c.case_id=admin_case_events.case_id and c.assigned_admin_id=app_public.request_user_id()) and app_private.current_session_is_active() and app_private.current_session_has_mfa() and app_private.current_session_recent_auth(interval '15 minutes'));
create policy assigned_admin_change_read on admin_private.admin_field_change_requests for select to authenticated
  using (exists(select 1 from admin_private.admin_review_cases c where c.case_id=admin_field_change_requests.case_id and c.assigned_admin_id=app_public.request_user_id()) and app_private.current_session_is_active() and app_private.current_session_has_mfa());
create policy assigned_admin_merge_read on admin_private.admin_duplicate_merge_proposals for select to authenticated
  using ((requested_by=app_public.request_user_id() or reviewed_by=app_public.request_user_id()) and app_private.current_session_is_active() and app_private.current_session_has_mfa() and app_private.current_session_recent_auth(interval '15 minutes'));
