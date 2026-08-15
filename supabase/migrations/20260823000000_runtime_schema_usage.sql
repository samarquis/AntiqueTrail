-- Runtime roles get only explicit API-schema lookup. Table privileges remain narrow.
grant usage on schema app_public to service_role;
grant usage on schema app_private,partner_private,release_private to media_automation;

-- Serialize audit-chain writers without requiring UPDATE on the append-only table.
create or replace function app_private.hash_privileged_audit_event()
returns trigger language plpgsql set search_path = pg_catalog, app_private as $$
declare last_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtextextended('app_private.privileged_audit_events', 0));
  select event_hash into last_hash
  from app_private.privileged_audit_events
  order by sequence_no desc limit 1;
  new.previous_hash := last_hash;
  new.event_hash := extensions.digest(
    concat_ws('|', new.sequence_no::text, new.event_id::text, coalesce(new.actor_user_id::text,''), coalesce(new.subject_user_id::text,''), coalesce(new.session_id::text,''), coalesce(new.actor_role::text,''), new.action, new.outcome, new.resource_kind, coalesce(new.resource_id::text,''), coalesce(new.reason_code,''), coalesce(encode(new.payload_hash,'hex'),''), coalesce(encode(new.previous_hash,'hex'),''), new.occurred_at::text, new.retention_until::text),
    'sha256'
  );
  return new;
end; $$;

-- The lifecycle worker deletes expired receipts after copying their tombstones.
grant delete on app_private.deletion_receipts to identity_service;
