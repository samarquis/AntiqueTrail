-- Package 2B: provider-neutral admission, recovery, privacy, and lifecycle state.
-- Raw receipt/password/email tokens and provider credentials never enter these tables.

grant usage on schema extensions to identity_service;

alter table app_private.profiles drop constraint if exists profiles_deletion_shape;
alter table app_private.profiles add constraint profiles_deletion_shape check (
  (status in ('deletion_pending','deletion_scheduled') and deletion_due_at is not null)
  or (status not in ('deletion_pending','deletion_scheduled') and deletion_due_at is null)
);
alter table app_private.active_sessions drop constraint if exists sessions_revocation_shape;
alter table app_private.active_sessions add constraint sessions_revocation_shape check (
  (state in ('active','cancellation_only') and revoked_at is null)
  or (state in ('revoked','expired') and revoked_at is not null)
);
alter table app_private.role_grants drop constraint if exists role_grants_revocation_shape;
alter table app_private.role_grants add constraint role_grants_revocation_shape check (
  (state in ('active','pending') and revoked_at is null and revoked_by is null)
  or (state in ('revoked','expired') and revoked_at is not null)
);

create table app_private.account_registration_config (
  id smallint primary key default 1 check (id=1),
  mode text not null default 'closed' check (mode in ('closed','receipt_only','public')),
  stage_receipt_id uuid,
  version bigint not null default 1 check (version>0),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete restrict
);
insert into app_private.account_registration_config(id) values (1) on conflict (id) do nothing;

create table app_private.registration_quarantine_latch (
  id smallint primary key default 1 check (id=1),
  state text not null default 'open' check (state in ('open','draining','blocked')),
  draining_at timestamptz,
  blocked_at timestamptz,
  reopen_receipt_id uuid,
  external_journal_sequence bigint not null default 0 check (external_journal_sequence>=0),
  external_journal_root bytea,
  version bigint not null default 1 check (version>0),
  updated_at timestamptz not null default statement_timestamp(),
  constraint quarantine_state_timestamps check ((state='open' and blocked_at is null) or (state='draining' and draining_at is not null) or (state='blocked' and blocked_at is not null)),
  constraint quarantine_root_size check (external_journal_root is null or octet_length(external_journal_root)=32)
);
insert into app_private.registration_quarantine_latch(id) values (1) on conflict (id) do nothing;

create table app_private.account_admission_receipts (
  admission_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null,
  purpose text not null check (purpose in ('shopper','initial_admin')),
  email_hmac bytea not null,
  hmac_key_version smallint not null default 1 check (hmac_key_version>0),
  age_18_attested_at timestamptz not null,
  idempotency_key text not null unique,
  provider_user_id uuid references auth.users(id) on delete set null,
  provider_call_started_at timestamptz,
  delivery_idempotency_key text unique,
  delivery_state text check (delivery_state is null or delivery_state in ('not_started','pending','delivered','unknown','not_delivered')),
  claim_expires_at timestamptz not null,
  verification_link_expires_at timestamptz,
  cleanup_due_at timestamptz,
  state text not null default 'issued' check (state in ('issued','claimed','provider_pending','provider_created','delivery_pending','verification_pending','active','expired','revoked','orphan_quarantined','cleanup_pending','completed_terminal_cleanup')),
  claimed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check (version>0),
  constraint admission_token_hash_size check (octet_length(token_hash)=32),
  constraint admission_email_hmac_size check (octet_length(email_hmac)=32),
  constraint admission_claim_shape check ((state in ('issued','expired','revoked') and claimed_at is null) or (state not in ('issued','expired','revoked') and claimed_at is not null)),
  constraint admission_cleanup_shape check ((state in ('cleanup_pending','orphan_quarantined','completed_terminal_cleanup') and cleanup_due_at is not null) or state not in ('cleanup_pending','orphan_quarantined','completed_terminal_cleanup'))
);
create unique index active_admission_per_email_purpose on app_private.account_admission_receipts(purpose,email_hmac) where state in ('issued','claimed','provider_pending','provider_created','delivery_pending','verification_pending');
create index admission_provider_user_idx on app_private.account_admission_receipts(provider_user_id);

create table app_private.registration_provider_operations (
  operation_id uuid primary key default extensions.gen_random_uuid(),
  admission_id uuid not null references app_private.account_admission_receipts(admission_id) on delete restrict,
  kind text not null check (kind in ('generate_link','set_metadata','send_verification','exact_lookup','session_revoke','exact_user_delete','delivery_reconcile','escalate','clear_admission_metadata')),
  state text not null default 'reserved' check (state in ('reserved','calling','reconciliation_required','cancelled_before_call','settled_no_effect','settled_captured')),
  expected_latch_version bigint not null check (expected_latch_version>0),
  expected_admission_version bigint not null check (expected_admission_version>0),
  expected_config_version bigint not null check (expected_config_version>0),
  provider_user_id uuid references auth.users(id) on delete set null,
  external_idempotency_key text unique,
  journal_sequence bigint,
  journal_acknowledged_at timestamptz,
  call_started_at timestamptz,
  call_deadline timestamptz,
  finality_due_at timestamptz,
  settled_at timestamptz,
  version bigint not null default 1 check (version>0),
  constraint provider_operation_journal_shape check ((journal_sequence is null and journal_acknowledged_at is null) or (journal_sequence is not null and journal_acknowledged_at is not null)),
  constraint provider_operation_call_shape check (call_deadline is null or call_started_at is not null)
);
create index provider_operations_admission_idx on app_private.registration_provider_operations(admission_id,state);

create table app_private.registration_quarantine_subjects (
  -- Provider identities may be deleted while their quarantine record is retained;
  -- this opaque UUID is therefore deliberately not an FK to auth.users.
  provider_user_id uuid primary key,
  deletion_ticket_id uuid not null default extensions.gen_random_uuid(),
  quarantined_at timestamptz not null default statement_timestamp(),
  resolved_absent_at timestamptz
);

create table app_private.feature_restrictions (
  restriction_id uuid primary key default extensions.gen_random_uuid(),
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{1,63}$'),
  store_id uuid references app_public.stores(id) on delete restrict,
  state text not null default 'active' check (state in ('active','expired','revoked')),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  starts_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  version bigint not null default 1 check (version>0),
  unique(subject_user_id,feature,store_id,state)
);

create table app_private.admin_bootstrap_state (
  id smallint primary key default 1 check (id=1),
  nonce_hash bytea,
  expires_at timestamptz,
  completed_at timestamptz,
  receipt_id uuid,
  subject_user_id uuid references auth.users(id) on delete set null,
  subject_binding_expires_at timestamptz,
  subject_binding_state text check (subject_binding_state is null or subject_binding_state in ('active','cleanup_only','cleared')),
  constraint bootstrap_nonce_hash_size check (nonce_hash is null or octet_length(nonce_hash)=32),
  constraint bootstrap_state_shape check ((subject_binding_state is null and nonce_hash is null) or subject_binding_state is not null)
);
insert into app_private.admin_bootstrap_state(id) values (1) on conflict (id) do nothing;

create table app_private.provider_revocation_outbox (
  outbox_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references app_private.active_sessions(session_id) on delete set null,
  provider_user_id uuid references auth.users(id) on delete set null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  idempotency_key text not null unique,
  state text not null default 'pending' check (state in ('pending','calling','sent','failed')),
  attempts integer not null default 0 check (attempts>=0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  last_error_code text,
  sent_at timestamptz
);

create table app_private.account_export_jobs (
  export_job_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued','building','ready','failed','expired')),
  requested_at timestamptz not null default statement_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  signed_url_expires_at timestamptz,
  archive_object_key text,
  archive_checksum bytea,
  archive_bytes bigint check (archive_bytes is null or archive_bytes>=0),
  failure_code text,
  version bigint not null default 1 check (version>0),
  constraint export_ready_shape check ((state='ready' and completed_at is not null and expires_at is not null) or state<>'ready'),
  constraint export_hash_size check (archive_checksum is null or octet_length(archive_checksum)=32)
);
create unique index one_active_export_job on app_private.account_export_jobs(user_id) where state in ('queued','building','ready');

create table app_private.account_deletion_requests (
  deletion_request_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'scheduled' check (state in ('scheduled','cancelled','completed')),
  requested_at timestamptz not null default statement_timestamp(),
  due_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  reason_code text not null default 'user_requested' check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  version bigint not null default 1 check (version>0),
  constraint deletion_state_shape check ((state='scheduled' and cancelled_at is null and completed_at is null) or (state='cancelled' and cancelled_at is not null and completed_at is null) or (state='completed' and completed_at is not null)),
  constraint deletion_due_window check (due_at >= requested_at and due_at <= requested_at + interval '7 days')
);
create unique index one_active_deletion_request on app_private.account_deletion_requests(user_id) where state='scheduled';

create table app_private.deletion_receipts (
  deletion_receipt_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  deletion_request_id uuid references app_private.account_deletion_requests(deletion_request_id) on delete set null,
  outcome text not null check (outcome in ('completed','partial','failed')),
  completed_at timestamptz not null default statement_timestamp(),
  removed_scopes jsonb not null default '[]'::jsonb,
  receipt_checksum bytea,
  constraint deletion_scopes_array check (jsonb_typeof(removed_scopes)='array'),
  constraint deletion_receipt_hash_size check (receipt_checksum is null or octet_length(receipt_checksum)=32)
);

create table app_private.job_runs (
  job_run_id uuid primary key default extensions.gen_random_uuid(),
  job_type text not null check (job_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  resource_id uuid not null,
  due_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued','running','succeeded','failed')),
  attempts integer not null default 0 check (attempts>=0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  last_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  unique(job_type,resource_id,due_at)
);

create table app_private.notification_deliveries (
  delivery_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  dedupe_key text not null unique,
  state text not null default 'queued' check (state in ('queued','sent','failed')),
  created_at timestamptz not null default statement_timestamp(),
  sent_at timestamptz,
  last_error_code text
);

do $$ declare t text; begin
  foreach t in array array['account_registration_config','registration_quarantine_latch','account_admission_receipts','registration_provider_operations','registration_quarantine_subjects','feature_restrictions','admin_bootstrap_state','provider_revocation_outbox','account_export_jobs','account_deletion_requests','deletion_receipts','job_runs','notification_deliveries'] loop
    execute format('alter table app_private.%I enable row level security',t);
    execute format('alter table app_private.%I force row level security',t);
    execute format('revoke all on app_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert on app_private.%I to identity_service',t);
  end loop;
end $$;

create policy identity_service_registration_config on app_private.account_registration_config for all to identity_service using (true) with check (true);
create policy identity_service_quarantine_latch on app_private.registration_quarantine_latch for all to identity_service using (true) with check (true);
create policy identity_service_admissions on app_private.account_admission_receipts for all to identity_service using (true) with check (true);
create policy identity_service_provider_ops on app_private.registration_provider_operations for all to identity_service using (true) with check (true);
create policy identity_service_quarantine_subjects on app_private.registration_quarantine_subjects for all to identity_service using (true) with check (true);
create policy identity_service_restrictions on app_private.feature_restrictions for all to identity_service using (true) with check (true);
create policy identity_service_bootstrap on app_private.admin_bootstrap_state for all to identity_service using (true) with check (true);
create policy identity_service_revocation_outbox on app_private.provider_revocation_outbox for all to identity_service using (true) with check (true);
create policy identity_service_export_jobs on app_private.account_export_jobs for all to identity_service using (true) with check (true);
create policy identity_service_deletion_requests on app_private.account_deletion_requests for all to identity_service using (true) with check (true);
create policy identity_service_deletion_receipts on app_private.deletion_receipts for all to identity_service using (true) with check (true);
create policy identity_service_job_runs on app_private.job_runs for all to identity_service using (true) with check (true);
create policy identity_service_notifications on app_private.notification_deliveries for all to identity_service using (true) with check (true);

-- Authenticated own-status reads are available only through future fixed RPCs;
-- direct table grants remain revoked. These policies also prevent sibling-row reads.
create policy profile_self_read on app_private.profiles for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());
create policy session_self_read on app_private.active_sessions for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());
create policy restriction_self_read on app_private.feature_restrictions for select to authenticated using (subject_user_id=auth.uid() and app_private.current_session_is_active());
create policy export_self_read on app_private.account_export_jobs for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());
create policy deletion_self_read on app_private.account_deletion_requests for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());
create policy deletion_receipt_self_read on app_private.deletion_receipts for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());
create policy notification_self_read on app_private.notification_deliveries for select to authenticated using (user_id=auth.uid() and app_private.current_session_is_active());

create or replace function app_private.current_session_is_cancellation_only()
returns boolean language sql stable security definer
set search_path = pg_catalog, app_private, auth as $$
  select auth.uid() is not null and exists (
    select 1 from app_private.profiles p
    join app_private.active_sessions s on s.user_id=p.user_id and s.session_epoch=p.session_epoch
    where p.user_id=auth.uid() and p.status='deletion_scheduled' and s.state='cancellation_only'
      and s.session_id=app_private.claim_session_id()
      and (s.access_token_expires_at is null or s.access_token_expires_at > statement_timestamp())
  );
$$;
alter function app_private.current_session_is_cancellation_only() owner to identity_service;
grant execute on function app_private.current_session_is_cancellation_only() to authenticated;

drop policy if exists profile_self_read on app_private.profiles;
create policy profile_self_read on app_private.profiles for select to authenticated using (user_id=auth.uid() and (app_private.current_session_is_active() or app_private.current_session_is_cancellation_only()));
drop policy if exists session_self_read on app_private.active_sessions;
create policy session_self_read on app_private.active_sessions for select to authenticated using (user_id=auth.uid() and (app_private.current_session_is_active() or app_private.current_session_is_cancellation_only()));
drop policy if exists deletion_self_read on app_private.account_deletion_requests;
create policy deletion_self_read on app_private.account_deletion_requests for select to authenticated using (user_id=auth.uid() and (app_private.current_session_is_active() or app_private.current_session_is_cancellation_only()));
