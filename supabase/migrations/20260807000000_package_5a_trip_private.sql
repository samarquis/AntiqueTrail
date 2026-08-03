-- Package 5A: manual trips, one partner, Navigator/device, and offline metadata.
-- Provider routing/maps are intentionally absent; all exact location fields stay private.

create schema if not exists trip_private;
revoke all on schema trip_private from public, anon, authenticated;
grant usage on schema trip_private to identity_service;

create table trip_private.trips (
  trip_id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  area_id uuid not null references app_public.catalog_areas(id) on delete restrict,
  name text not null,
  local_date date not null,
  departure_local_time time,
  start_kind text check (start_kind is null or start_kind in ('manual','current_location')),
  private_start_label text,
  private_start_latitude numeric(8,5),
  private_start_longitude numeric(8,5),
  private_return_label text,
  private_return_latitude numeric(8,5),
  private_return_longitude numeric(8,5),
  max_drive_miles numeric(6,2),
  max_total_minutes smallint,
  state text not null default 'draft' check (state in ('draft','ready','active','completed','cancelled')),
  navigator_user_id uuid references auth.users(id) on delete set null,
  navigator_device_hash bytea,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trip_name_safe check (name=btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'),
  constraint trip_start_pair check ((private_start_latitude is null and private_start_longitude is null) or (private_start_latitude between -90 and 90 and private_start_longitude between -180 and 180)),
  constraint trip_return_pair check ((private_return_latitude is null and private_return_longitude is null) or (private_return_latitude between -90 and 90 and private_return_longitude between -180 and 180)),
  constraint trip_start_shape check ((start_kind is null and private_start_label is null and private_start_latitude is null and private_start_longitude is null) or (start_kind='manual' and private_start_label is not null) or (start_kind='current_location' and private_start_latitude is not null and private_start_longitude is not null)),
  constraint trip_label_safe check ((private_start_label is null or (char_length(btrim(private_start_label)) between 1 and 240 and private_start_label !~ '[[:cntrl:]]')) and (private_return_label is null or (char_length(btrim(private_return_label)) between 1 and 240 and private_return_label !~ '[[:cntrl:]]'))),
  constraint trip_limits_safe check ((max_drive_miles is null or max_drive_miles between 1 and 500) and (max_total_minutes is null or max_total_minutes between 30 and 1440)),
  constraint trip_navigator_pair check ((navigator_user_id is null and navigator_device_hash is null) or (navigator_user_id is not null and navigator_device_hash is not null and octet_length(navigator_device_hash)=32))
);
create index trips_owner_state_idx on trip_private.trips(owner_id,state);

create table trip_private.trip_stops (
  stop_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  kind text not null check (kind in ('store','rest')),
  store_id uuid references app_public.stores(id) on delete restrict,
  rest_label text,
  rest_address text,
  rest_latitude numeric(8,5),
  rest_longitude numeric(8,5),
  position smallint not null,
  priority text not null default 'flexible' check (priority in ('must','prefer','flexible')),
  planned_dwell_minutes smallint not null default 60,
  state text not null default 'planned' check (state in ('planned','arrived','completed','skipped','observed_closed')),
  arrived_at timestamptz,
  completed_at timestamptz,
  closed_observed_at timestamptz,
  version bigint not null default 1 check (version>0),
  constraint stop_kind_shape check ((kind='store' and store_id is not null and rest_label is null and rest_address is null and rest_latitude is null and rest_longitude is null) or (kind='rest' and store_id is null and rest_label is not null and rest_address is not null)),
  constraint stop_rest_label_safe check (rest_label is null or (char_length(btrim(rest_label)) between 1 and 160 and rest_label !~ '[[:cntrl:]]')),
  constraint stop_rest_address_safe check (rest_address is null or (char_length(btrim(rest_address)) between 1 and 320 and rest_address !~ '[[:cntrl:]]')),
  constraint stop_rest_coordinates_pair check ((rest_latitude is null and rest_longitude is null) or (rest_latitude between -90 and 90 and rest_longitude between -180 and 180)),
  constraint stop_position_bound check (position between 0 and 7),
  constraint stop_dwell_bound check (planned_dwell_minutes between 5 and 720),
  constraint stop_state_timestamps check ((state='arrived' and arrived_at is not null) or (state<>'arrived') or state in ('completed','observed_closed'))
);
create unique index trip_stop_position_unique on trip_private.trip_stops(trip_id,position);
create index trip_stops_trip_state_idx on trip_private.trip_stops(trip_id,state);

create table trip_private.trip_invitations (
  invitation_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  token_hash bytea not null,
  recipient_email_hmac bytea not null,
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','accepted','revoked','expired')),
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check (version>0),
  constraint invitation_token_hash_size check (octet_length(token_hash)=32),
  constraint invitation_email_hmac_size check (octet_length(recipient_email_hmac)=32),
  constraint invitation_expiry_bound check (expires_at <= created_at + interval '7 days'),
  constraint invitation_acceptance_shape check ((state='accepted' and accepted_user_id is not null and accepted_at is not null) or (state<>'accepted' and accepted_user_id is null and accepted_at is null))
);
create unique index one_pending_trip_invitation on trip_private.trip_invitations(trip_id,recipient_email_hmac) where state='pending';

create table trip_private.trip_participants (
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('creator','partner')),
  state text not null default 'active' check (state in ('active','left','revoked')),
  joined_at timestamptz not null default statement_timestamp(),
  left_at timestamptz,
  version bigint not null default 1 check (version>0),
  primary key (trip_id,user_id),
  constraint participant_state_shape check ((state='active' and left_at is null) or (state<>'active' and left_at is not null))
);
create unique index one_active_creator_per_trip on trip_private.trip_participants(trip_id) where participant_role='creator' and state='active';
create unique index one_active_partner_per_trip on trip_private.trip_participants(trip_id) where participant_role='partner' and state='active';

create table trip_private.trip_device_bindings (
  binding_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash bytea not null,
  state text not null default 'active' check (state in ('active','revoked','expired')),
  bound_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  revocation_reason text,
  session_security_version bigint not null check (session_security_version>0),
  unique(trip_id,device_hash),
  constraint binding_device_hash_size check (octet_length(device_hash)=32),
  constraint binding_state_shape check ((state='active' and revoked_at is null) or (state<>'active' and revoked_at is not null))
);
create unique index one_active_navigator_binding on trip_private.trip_device_bindings(trip_id) where state='active';

create table trip_private.trip_mutation_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  idempotency_key text not null,
  base_version bigint not null check (base_version>0),
  device_hash bytea,
  local_sequence bigint,
  result_state text not null check (result_state in ('applied','replayed','conflict','denied')),
  resulting_version bigint check (resulting_version is null or resulting_version>0),
  result_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  unique(trip_id,idempotency_key),
  constraint mutation_device_hash_size check (device_hash is null or octet_length(device_hash)=32),
  constraint mutation_local_sequence_bound check (local_sequence is null or local_sequence>=0),
  constraint mutation_metadata_object check (jsonb_typeof(result_metadata)='object')
);

create table trip_private.trip_offline_grants (
  offline_grant_id uuid primary key default extensions.gen_random_uuid(),
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash bytea not null,
  session_security_version bigint not null check (session_security_version>0),
  grant_hash bytea not null,
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  state text not null default 'active' check (state in ('active','revoked','expired')),
  constraint offline_device_hash_size check (octet_length(device_hash)=32),
  constraint offline_grant_hash_size check (octet_length(grant_hash)=32),
  constraint offline_expiry_bound check (expires_at<=issued_at+interval '36 hours'),
  constraint offline_state_shape check ((state='active' and revoked_at is null) or (state<>'active' and revoked_at is not null))
);
create unique index one_active_offline_grant on trip_private.trip_offline_grants(trip_id,user_id,device_hash) where state='active';

create table trip_private.trip_mutation_conflicts (
  conflict_id uuid primary key default extensions.gen_random_uuid(),
  receipt_id uuid not null references trip_private.trip_mutation_receipts(receipt_id) on delete cascade,
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  entity_kind text not null check (entity_kind in ('trip','stop','visit_memory')),
  client_version bigint not null check (client_version>0),
  server_version bigint not null check (server_version>0),
  client_snapshot_hash bytea,
  server_snapshot_hash bytea,
  resolution_state text not null default 'pending' check (resolution_state in ('pending','reapplied','kept_latest','discarded')),
  created_at timestamptz not null default statement_timestamp(),
  constraint conflict_hash_sizes check ((client_snapshot_hash is null or octet_length(client_snapshot_hash)=32) and (server_snapshot_hash is null or octet_length(server_snapshot_hash)=32))
);

create table trip_private.trip_visit_memories (
  author_user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint,
  return_choice text check (return_choice is null or return_choice in ('no','maybe','yes')),
  note text,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (author_user_id,trip_id,store_id),
  constraint visit_memory_rating_range check (rating is null or rating between 1 and 5),
  constraint visit_memory_note_safe check (note is null or (note=btrim(note) and char_length(note) between 1 and 2000 and note !~ '[[:cntrl:]]'))
);

create or replace function trip_private.validate_trip_participant()
returns trigger language plpgsql set search_path = pg_catalog, trip_private as $$
declare owner_id uuid;
begin
  select t.owner_id into owner_id from trip_private.trips t where t.trip_id=new.trip_id;
  if new.participant_role='creator' and owner_id is distinct from new.user_id then raise exception 'trip_creator_must_match_owner'; end if;
  if new.participant_role='partner' and owner_id is not distinct from new.user_id then raise exception 'trip_owner_cannot_be_partner'; end if;
  return new;
end; $$;
create trigger trip_participant_scope before insert or update on trip_private.trip_participants
for each row execute function trip_private.validate_trip_participant();

create or replace function trip_private.validate_trip_device_binding()
returns trigger language plpgsql set search_path = pg_catalog, trip_private as $$
begin
  if not exists(select 1 from trip_private.trip_participants p where p.trip_id=new.trip_id and p.user_id=new.user_id and p.state='active') then
    raise exception 'navigator_must_be_active_trip_member';
  end if;
  return new;
end; $$;
create trigger trip_device_member_scope before insert or update on trip_private.trip_device_bindings
for each row execute function trip_private.validate_trip_device_binding();

create or replace function trip_private.trip_owner_can_access(p_trip_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
  select app_private.current_session_is_active() and exists(select 1 from trip_private.trips t where t.trip_id=p_trip_id and t.owner_id=auth.uid());
$$;
alter function trip_private.trip_owner_can_access(uuid) owner to identity_service;

create or replace function trip_private.trip_member_can_access(p_trip_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, trip_private, app_private, auth as $$
  select app_private.current_session_is_active() and exists(
    select 1 from trip_private.trips t
    where t.trip_id=p_trip_id and (t.owner_id=auth.uid() or exists(select 1 from trip_private.trip_participants p where p.trip_id=t.trip_id and p.user_id=auth.uid() and p.state='active'))
  );
$$;
alter function trip_private.trip_member_can_access(uuid) owner to identity_service;
grant execute on function trip_private.trip_owner_can_access(uuid) to authenticated;
grant execute on function trip_private.trip_member_can_access(uuid) to authenticated;

create or replace function trip_private.enforce_trip_stop_limit()
returns trigger language plpgsql set search_path = pg_catalog, trip_private as $$
begin
  if (select count(*) from trip_private.trip_stops where trip_id=new.trip_id) > 8 then raise exception 'trip_stop_limit_exceeded'; end if;
  return new;
end; $$;
create constraint trigger trip_stop_limit after insert or update on trip_private.trip_stops
deferrable initially deferred for each row execute function trip_private.enforce_trip_stop_limit();

do $$ declare t text; begin
  foreach t in array array['trips','trip_stops','trip_invitations','trip_participants','trip_device_bindings','trip_mutation_receipts','trip_offline_grants','trip_mutation_conflicts','trip_visit_memories'] loop
    execute format('alter table trip_private.%I enable row level security',t);
    execute format('alter table trip_private.%I force row level security',t);
    execute format('revoke all on trip_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert on trip_private.%I to identity_service',t);
  end loop;
end $$;

create policy identity_service_trips on trip_private.trips for all to identity_service using (true) with check (true);
create policy identity_service_trip_stops on trip_private.trip_stops for all to identity_service using (true) with check (true);
create policy identity_service_trip_invitations on trip_private.trip_invitations for all to identity_service using (true) with check (true);
create policy identity_service_trip_participants on trip_private.trip_participants for all to identity_service using (true) with check (true);
create policy identity_service_trip_bindings on trip_private.trip_device_bindings for all to identity_service using (true) with check (true);
create policy identity_service_trip_receipts on trip_private.trip_mutation_receipts for all to identity_service using (true) with check (true);
create policy identity_service_trip_offline on trip_private.trip_offline_grants for all to identity_service using (true) with check (true);
create policy identity_service_trip_conflicts on trip_private.trip_mutation_conflicts for all to identity_service using (true) with check (true);
create policy identity_service_visit_memories on trip_private.trip_visit_memories for all to identity_service using (true) with check (true);

revoke update, delete, truncate on trip_private.trip_mutation_receipts from identity_service;
revoke update, delete, truncate on trip_private.trip_mutation_conflicts from identity_service;

create policy trip_owner_or_participant on trip_private.trips for select to authenticated
  using (trip_private.trip_member_can_access(trip_private.trips.trip_id));
create policy trip_owner_write on trip_private.trips for all to authenticated
  using (trip_private.trip_owner_can_access(trip_private.trips.trip_id))
  with check (trip_private.trip_owner_can_access(trip_private.trips.trip_id));
create policy stop_member_read on trip_private.trip_stops for select to authenticated
  using (trip_private.trip_member_can_access(trip_private.trip_stops.trip_id));
create policy invitation_owner_read on trip_private.trip_invitations for select to authenticated
  using (trip_private.trip_owner_can_access(trip_private.trip_invitations.trip_id));
create policy participant_member_read on trip_private.trip_participants for select to authenticated
  using (trip_private.trip_member_can_access(trip_private.trip_participants.trip_id));
create policy binding_member_read on trip_private.trip_device_bindings for select to authenticated
  using (app_private.current_session_is_active() and user_id=auth.uid());
create policy mutation_receipt_member_read on trip_private.trip_mutation_receipts for select to authenticated
  using (trip_private.trip_member_can_access(trip_private.trip_mutation_receipts.trip_id));
create policy offline_grant_member_read on trip_private.trip_offline_grants for select to authenticated
  using (app_private.current_session_is_active() and user_id=auth.uid());
create policy conflict_member_read on trip_private.trip_mutation_conflicts for select to authenticated
  using (trip_private.trip_member_can_access(trip_private.trip_mutation_conflicts.trip_id));
create policy visit_memory_author on trip_private.trip_visit_memories for all to authenticated
  using (app_private.current_session_is_active() and author_user_id=auth.uid())
  with check (app_private.current_session_is_active() and author_user_id=auth.uid());
