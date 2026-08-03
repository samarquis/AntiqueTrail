-- Package 3: shopper-private saves/memories and correction intake.
-- No anonymous grants, provider calls, public reviews, or cross-user reads.

create schema if not exists shopper_private;
revoke all on schema shopper_private from public, anon, authenticated;
grant usage on schema shopper_private to identity_service;

create table shopper_private.saved_stores (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, store_id)
);

create table shopper_private.private_store_memories (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint,
  note text,
  last_visit_month date,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, store_id),
  constraint memories_rating_range check (rating is null or rating between 1 and 5),
  constraint memories_note_safe check (note is null or (note=btrim(note) and char_length(note) between 1 and 2000 and note !~ '[[:cntrl:]]')),
  constraint memories_month_shape check (last_visit_month is null or last_visit_month=date_trunc('month',last_visit_month)::date),
  constraint memories_version_positive check (version>0)
);

create table shopper_private.catalog_last_seen (
  user_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references app_public.catalog_areas(id) on delete restrict,
  seen_at timestamptz not null default statement_timestamp(),
  primary key (user_id, area_id)
);

create table shopper_private.catalog_new_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  dismissed_at timestamptz not null default statement_timestamp(),
  primary key (user_id, store_id)
);

create table shopper_private.store_correction_reports (
  report_id uuid primary key default extensions.gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  correction_type text not null check (correction_type in ('identity','contact','hours','categories','other')),
  description text not null,
  public_source_url text,
  state text not null default 'submitted' check (state in ('submitted','triaged','resolved','closed')),
  assigned_admin_id uuid references auth.users(id) on delete set null,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint correction_description_safe check (description=btrim(description) and char_length(description) between 1 and 2000 and description !~ '[[:cntrl:]]'),
  constraint correction_source_url_safe check (public_source_url is null or (char_length(public_source_url)<=2048 and public_source_url ~* '^https?://[^[:space:]]+$')),
  constraint correction_version_positive check (version>0),
  constraint correction_assignment_shape check ((state='submitted' and assigned_admin_id is null) or state<>'submitted')
);
create index correction_reports_reporter_idx on shopper_private.store_correction_reports(reporter_user_id,created_at desc);
create index correction_reports_store_state_idx on shopper_private.store_correction_reports(store_id,state);

create table shopper_private.correction_case_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid not null references shopper_private.store_correction_reports(report_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_kind text not null check (event_kind in ('submitted','triaged','resolved','closed','reopened')),
  from_state text,
  to_state text,
  reason_code text,
  idempotency_key text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  metadata jsonb not null default '{}'::jsonb,
  unique(report_id,idempotency_key),
  constraint correction_event_reason_safe check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint correction_event_metadata_object check (jsonb_typeof(metadata)='object'),
  constraint correction_event_state_safe check ((from_state is null or from_state in ('submitted','triaged','resolved','closed')) and (to_state is null or to_state in ('submitted','triaged','resolved','closed')))
);

create or replace function shopper_private.reject_correction_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog, shopper_private as $$
begin raise exception 'correction_case_events_append_only'; end; $$;
create trigger correction_case_events_no_update before update or delete on shopper_private.correction_case_events
for each row execute function shopper_private.reject_correction_event_mutation();

do $$ declare t text; begin
  foreach t in array array['saved_stores','private_store_memories','catalog_last_seen','catalog_new_dismissals','store_correction_reports','correction_case_events'] loop
    execute format('alter table shopper_private.%I enable row level security',t);
    execute format('alter table shopper_private.%I force row level security',t);
    execute format('revoke all on shopper_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert on shopper_private.%I to identity_service',t);
  end loop;
end $$;

create policy identity_service_saved_stores on shopper_private.saved_stores for all to identity_service using (true) with check (true);
create policy identity_service_memories on shopper_private.private_store_memories for all to identity_service using (true) with check (true);
create policy identity_service_last_seen on shopper_private.catalog_last_seen for all to identity_service using (true) with check (true);
create policy identity_service_dismissals on shopper_private.catalog_new_dismissals for all to identity_service using (true) with check (true);
create policy identity_service_correction_reports on shopper_private.store_correction_reports for all to identity_service using (true) with check (true);
create policy identity_service_correction_events on shopper_private.correction_case_events for all to identity_service using (true) with check (true);
revoke update, delete, truncate on shopper_private.correction_case_events from identity_service;

create policy shopper_saved_stores_owner on shopper_private.saved_stores for all to authenticated
  using (user_id=auth.uid() and app_private.current_session_is_active())
  with check (user_id=auth.uid() and app_private.current_session_is_active());
create policy shopper_memories_owner on shopper_private.private_store_memories for all to authenticated
  using (user_id=auth.uid() and app_private.current_session_is_active())
  with check (user_id=auth.uid() and app_private.current_session_is_active());
create policy shopper_last_seen_owner on shopper_private.catalog_last_seen for all to authenticated
  using (user_id=auth.uid() and app_private.current_session_is_active())
  with check (user_id=auth.uid() and app_private.current_session_is_active());
create policy shopper_dismissals_owner on shopper_private.catalog_new_dismissals for all to authenticated
  using (user_id=auth.uid() and app_private.current_session_is_active())
  with check (user_id=auth.uid() and app_private.current_session_is_active());
create policy shopper_correction_report_owner_read on shopper_private.store_correction_reports for select to authenticated
  using (reporter_user_id=auth.uid() and app_private.current_session_is_active());
create policy shopper_correction_report_owner_insert on shopper_private.store_correction_reports for insert to authenticated
  with check (reporter_user_id=auth.uid() and app_private.current_session_is_active());
