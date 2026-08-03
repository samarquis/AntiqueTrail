-- Package 4: private Candidate Links, recipient-specific shares, and Trip Ideas.
-- Candidate data is not an API schema.  Sharing never creates public catalog rows.

create schema if not exists candidate_private;
revoke all on schema candidate_private from public, anon, authenticated;
grant usage on schema candidate_private to identity_service;
grant identity_service to postgres;
grant create on schema candidate_private to identity_service;

create table candidate_private.candidate_links (
  candidate_id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  normalized_url text,
  destination_host text,
  title text not null,
  note text,
  provenance jsonb not null default '{}'::jsonb,
  extraction_state text not null default 'manual_draft'
    check (extraction_state in ('manual_draft','extracting','needs_review','saved')),
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint candidate_url_safe check (
    normalized_url is null
    or (char_length(normalized_url) <= 2048 and normalized_url ~* '^https?://[^[:space:]]+$')
  ),
  constraint candidate_host_safe check (
    destination_host is null
    or (char_length(destination_host) between 1 and 255 and destination_host !~ '[/:[:space:]]')
  ),
  constraint candidate_title_safe check (
    title=btrim(title) and char_length(title) between 1 and 160 and title !~ '[[:cntrl:]]'
  ),
  constraint candidate_note_safe check (
    note is null or (char_length(note) <= 2000 and note !~ '[[:cntrl:]]')
  ),
  constraint candidate_provenance_object check (jsonb_typeof(provenance)='object'),
  constraint candidate_version_positive check (version>0)
);
create index candidate_links_owner_idx on candidate_private.candidate_links(owner_user_id,updated_at desc);

create table candidate_private.candidate_shares (
  share_id uuid primary key default extensions.gen_random_uuid(),
  candidate_id uuid not null references candidate_private.candidate_links(candidate_id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete set null,
  recipient_email_hmac bytea not null,
  key_version smallint not null default 1 check (key_version>0),
  state text not null default 'pending' check (state in ('pending','accepted','closed')),
  close_reason text check (close_reason is null or close_reason in ('dismissed','blocked','reported','revoked','expired')),
  expires_at timestamptz not null default (statement_timestamp()+interval '30 days'),
  accepted_at timestamptz,
  closed_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  sender_status text generated always as (
    case when state='pending' then 'pending' when state='accepted' then 'accepted' else 'closed' end
  ) stored,
  constraint candidate_recipient_hmac_present check (octet_length(recipient_email_hmac) between 16 and 64),
  constraint candidate_share_expiry_bound check (expires_at <= created_at + interval '30 days'),
  constraint candidate_share_state_shape check (
    (state='pending' and accepted_at is null and closed_at is null and close_reason is null)
    or (state='accepted' and accepted_at is not null and closed_at is null and close_reason is null)
    or (state='closed' and accepted_at is null and closed_at is not null and close_reason is not null)
  ),
  constraint candidate_share_version_positive check (version>0)
);
create index candidate_shares_sender_idx on candidate_private.candidate_shares(sender_id,created_at desc);
create index candidate_shares_recipient_idx on candidate_private.candidate_shares(recipient_id,created_at desc);
create unique index candidate_shares_pending_dedupe_idx
  on candidate_private.candidate_shares(sender_id,candidate_id,recipient_email_hmac)
  where state='pending';

-- The payload is an encrypted/private snapshot.  It is never readable by the sender.
create table candidate_private.candidate_share_payloads (
  share_id uuid primary key references candidate_private.candidate_shares(share_id) on delete cascade,
  encrypted_payload bytea not null,
  payload_key_version smallint not null default 1 check (payload_key_version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint candidate_payload_not_empty check (octet_length(encrypted_payload)>0)
);

create table candidate_private.candidate_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (blocker_id,blocked_user_id),
  constraint candidate_block_distinct check (blocker_id<>blocked_user_id)
);

-- This table deliberately contains only opaque subjects and a host HMAC; no URL/path/query/fragment.
create table candidate_private.candidate_abuse_cases (
  case_id uuid primary key default extensions.gen_random_uuid(),
  reporter_subject_hmac bytea not null,
  reported_subject_hmac bytea not null,
  destination_host_hmac bytea,
  reason text not null check (reason in ('spam','harassment','unsafe_content','other')),
  reported_text text,
  created_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  constraint abuse_reporter_hmac_safe check (octet_length(reporter_subject_hmac) between 16 and 64),
  constraint abuse_reported_hmac_safe check (octet_length(reported_subject_hmac) between 16 and 64),
  constraint abuse_host_hmac_safe check (destination_host_hmac is null or octet_length(destination_host_hmac) between 16 and 64),
  constraint abuse_text_safe check (reported_text is null or (char_length(reported_text) between 1 and 1000 and reported_text !~ '[[:cntrl:]]'))
);

create table candidate_private.candidate_share_actions (
  action_id uuid primary key default extensions.gen_random_uuid(),
  share_id uuid not null references candidate_private.candidate_shares(share_id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('send','accept','dismiss','block','report','revoke','expire')),
  idempotency_key text not null,
  from_state text not null check (from_state in ('pending','accepted','closed')),
  to_state text not null check (to_state in ('pending','accepted','closed')),
  created_at timestamptz not null default statement_timestamp(),
  unique (actor_user_id,idempotency_key),
  unique (share_id,idempotency_key),
  constraint candidate_action_key_safe check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create table candidate_private.trip_ideas (
  idea_id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_share_id uuid references candidate_private.candidate_shares(share_id) on delete set null,
  title text not null,
  url_note text,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trip_idea_source_share_key unique (source_share_id),
  constraint trip_idea_title_safe check (title=btrim(title) and char_length(title) between 1 and 160 and title !~ '[[:cntrl:]]'),
  constraint trip_idea_url_note_safe check (url_note is null or (char_length(url_note) <= 4096 and url_note !~ '[[:cntrl:]]')),
  constraint trip_idea_version_positive check (version>0)
);
create index trip_ideas_owner_idx on candidate_private.trip_ideas(owner_user_id,updated_at desc);

create or replace function candidate_private.enforce_share_state()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private,auth as $$
begin
  if new.expires_at > new.created_at + interval '30 days' then
    raise exception 'candidate_share_expiry_too_long';
  end if;
  if tg_op='UPDATE' then
    if old.state in ('accepted','closed') and (new.state<>old.state or new.close_reason is distinct from old.close_reason) then
      raise exception 'candidate_share_terminal';
    end if;
    if old.state='pending' and new.state='accepted' and new.recipient_id is null then
      raise exception 'candidate_share_recipient_required';
    end if;
  end if;
  if new.state='pending' and (new.accepted_at is not null or new.closed_at is not null or new.close_reason is not null) then
    raise exception 'candidate_share_pending_shape';
  elsif new.state='accepted' and (new.accepted_at is null or new.closed_at is not null or new.close_reason is not null) then
    raise exception 'candidate_share_accept_shape';
  elsif new.state='closed' and (new.accepted_at is not null or new.closed_at is null or new.close_reason is null) then
    raise exception 'candidate_share_close_shape';
  end if;
  return new;
end;
$$;
create trigger candidate_shares_state_guard
before insert or update on candidate_private.candidate_shares
for each row execute function candidate_private.enforce_share_state();

create or replace function candidate_private.guard_share_payload()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private as $$
begin
  if not exists (
    select 1 from candidate_private.candidate_shares s
    where s.share_id=new.share_id and s.state='pending' and s.expires_at>statement_timestamp()
  ) then
    raise exception 'candidate_payload_requires_pending_share';
  end if;
  return new;
end;
$$;
create trigger candidate_share_payload_pending_guard
before insert or update on candidate_private.candidate_share_payloads
for each row execute function candidate_private.guard_share_payload();

-- Acceptance is ordered by the service as: decrypt/copy payload, insert Trip Idea, then accept share.
-- This trigger removes the shared payload on every terminal transition.
create or replace function candidate_private.remove_terminal_share_payload()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private as $$
begin
  if old.state='pending' and new.state<>'pending' then
    delete from candidate_private.candidate_share_payloads where share_id=new.share_id;
  end if;
  return new;
end;
$$;
create trigger candidate_share_payload_terminal_cleanup
after update of state on candidate_private.candidate_shares
for each row execute function candidate_private.remove_terminal_share_payload();

create or replace function candidate_private.guard_trip_idea_source()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private as $$
declare v_recipient uuid; v_state text;
begin
  if new.source_share_id is not null then
    select recipient_id,state into v_recipient,v_state
      from candidate_private.candidate_shares where share_id=new.source_share_id;
    if v_state is distinct from 'accepted' or v_recipient is distinct from new.owner_user_id then
      raise exception 'trip_idea_source_share_not_accepted';
    end if;
  end if;
  return new;
end;
$$;
create trigger trip_ideas_source_guard
before insert or update on candidate_private.trip_ideas
for each row execute function candidate_private.guard_trip_idea_source();

create or replace function candidate_private.reject_append_only_mutation()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private as $$
begin
  raise exception 'candidate_append_only';
end;
$$;
create trigger candidate_share_actions_append_only
before update or delete on candidate_private.candidate_share_actions
for each row execute function candidate_private.reject_append_only_mutation();

create or replace function candidate_private.current_share_recipient_can_read(p_share_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog,candidate_private,app_private,auth as $$
  select auth.uid() is not null
    and app_private.current_session_is_active()
    and exists (
      select 1 from candidate_private.candidate_shares s
      where s.share_id=p_share_id
        and s.recipient_id=auth.uid()
        and s.state='pending'
        and s.expires_at>statement_timestamp()
    )
$$;
alter function candidate_private.current_share_recipient_can_read(uuid) owner to identity_service;
revoke identity_service from postgres;
revoke create on schema candidate_private from identity_service;
grant execute on function candidate_private.current_share_recipient_can_read(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['candidate_links','candidate_shares','candidate_share_payloads','candidate_blocks','candidate_abuse_cases','candidate_share_actions','trip_ideas'] loop
    execute format('alter table candidate_private.%I enable row level security',t);
    execute format('alter table candidate_private.%I force row level security',t);
    execute format('revoke all on candidate_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on candidate_private.%I to identity_service',t);
  end loop;
end $$;
revoke update, delete, truncate on candidate_private.candidate_share_actions from identity_service;

create policy identity_service_candidate_links on candidate_private.candidate_links for all to identity_service using (true) with check (true);
create policy identity_service_candidate_shares on candidate_private.candidate_shares for all to identity_service using (true) with check (true);
create policy identity_service_candidate_payloads on candidate_private.candidate_share_payloads for all to identity_service using (true) with check (true);
create policy identity_service_candidate_blocks on candidate_private.candidate_blocks for all to identity_service using (true) with check (true);
create policy identity_service_candidate_abuse on candidate_private.candidate_abuse_cases for all to identity_service using (true) with check (true);
create policy identity_service_candidate_actions on candidate_private.candidate_share_actions for all to identity_service using (true) with check (true);
create policy identity_service_trip_ideas on candidate_private.trip_ideas for all to identity_service using (true) with check (true);

create policy candidate_link_owner on candidate_private.candidate_links for all to authenticated
  using (owner_user_id=auth.uid() and app_private.current_session_is_active())
  with check (owner_user_id=auth.uid() and app_private.current_session_is_active());
create policy candidate_share_party_read on candidate_private.candidate_shares for select to authenticated
  using ((sender_id=auth.uid() or recipient_id=auth.uid()) and app_private.current_session_is_active());
create policy candidate_share_sender_update on candidate_private.candidate_shares for update to authenticated
  using (sender_id=auth.uid() and state='pending' and app_private.current_session_is_active())
  with check (sender_id=auth.uid() and app_private.current_session_is_active());
create policy candidate_share_recipient_update on candidate_private.candidate_shares for update to authenticated
  using (recipient_id=auth.uid() and state='pending' and app_private.current_session_is_active())
  with check (recipient_id=auth.uid() and app_private.current_session_is_active());
create policy candidate_share_payload_recipient_read on candidate_private.candidate_share_payloads for select to authenticated
  using (candidate_private.current_share_recipient_can_read(share_id));
create policy candidate_block_owner on candidate_private.candidate_blocks for all to authenticated
  using (blocker_id=auth.uid() and app_private.current_session_is_active())
  with check (blocker_id=auth.uid() and app_private.current_session_is_active());
create policy trip_idea_owner on candidate_private.trip_ideas for all to authenticated
  using (owner_user_id=auth.uid() and app_private.current_session_is_active())
  with check (owner_user_id=auth.uid() and app_private.current_session_is_active());
