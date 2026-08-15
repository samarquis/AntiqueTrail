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
alter function app_private.hash_privileged_audit_event() owner to identity_service;

-- Trigger records expose different identity fields. Branch before referencing a
-- field so PostgreSQL never binds a column absent from the current trigger row.
create or replace function partner_private.guard_current_partner_consent()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_user uuid;
begin
  if tg_table_name='listing_claims' then
    target_user := new.claimant_id;
  else
    target_user := new.auth_user_id;
  end if;
  if tg_table_name='listing_claims' and tg_op='UPDATE' and not old.material_reconsent_required
    and new.material_reconsent_required and new.state=old.state then return new; end if;
  if ((tg_table_name='listing_claims' and new.state in ('submitted','verification_pending','changes_requested','conflict','approved'))
      or (tg_table_name<>'listing_claims' and new.state='active'))
    and (not partner_private.partner_consent_is_current(target_user)
      or (tg_table_name='listing_claims' and new.material_reconsent_required))
    then raise exception using errcode='42501',message='partner_material_reconsent_required'; end if;
  return new;
end $$;
alter function partner_private.guard_current_partner_consent() owner to identity_service;
revoke all on function partner_private.guard_current_partner_consent() from public,anon,authenticated;

-- The lifecycle worker deletes expired receipts after copying their tombstones.
grant delete on app_private.deletion_receipts to identity_service;

-- Remove inherited PUBLIC execute as well as explicit browser grants from legacy
-- write surfaces. All writes must pass through the current command gateways.
revoke all on function app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text)
  from public,anon,authenticated,service_role;
revoke all on function app_public.mark_arrived(text,text),
  app_public.complete_trip_stop(text,text),
  app_public.skip_trip_stop(text,text)
  from public,anon,authenticated;

-- Final hardening for internal RG-01 derivation and the superseded challenge RPC.
revoke all on function rg01_private.derive_source_fact(text,uuid)
  from public,anon,authenticated,service_role,rg01_source_service;
revoke all on function app_public.rg01_request_decision_challenge(uuid,text)
  from public,anon,authenticated,service_role;
