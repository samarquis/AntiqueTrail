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

-- Day-8 workers claim and advance deletion requests through their durable states.
grant identity_service,candidate_automation,rg01_automation to postgres;
grant update on app_private.account_deletion_requests to identity_service;
grant delete on app_private.profiles,app_private.feature_restrictions,
  app_private.provider_revocation_outbox,app_private.notification_deliveries,
  app_private.account_export_jobs,app_private.active_sessions to identity_service;
grant update on app_private.environment_stage,app_private.account_registration_config,
  app_private.admin_bootstrap_state,app_private.account_admission_receipts to identity_service;
grant update on shopper_private.store_correction_reports to identity_service;
grant delete on trip_private.trips,trip_private.trip_visit_memories,
  trip_private.trip_offline_grants,trip_private.trip_device_bindings,
  trip_private.trip_participants,trip_private.trip_device_proof_nonces,
  trip_private.check_my_day_command_evidence,trip_private.check_my_day_requests,
  trip_private.trip_conflict_resolution_receipts to identity_service;

-- These two later packages revoked the lifecycle owner's original access.
-- Restore only operations used by terminal account deletion.
grant select,delete on candidate_private.candidate_share_delivery_jobs to identity_service;
create policy identity_lifecycle_candidate_delivery_delete
  on candidate_private.candidate_share_delivery_jobs for delete to identity_service using(true);
grant select,update on rg01_private.rg01_product_owner_grants to identity_service;
create policy identity_lifecycle_rg01_owner_revoke
  on rg01_private.rg01_product_owner_grants for update to identity_service
  using(true) with check(state='revoked');

-- Deleting the provider row clears account_admission_receipts.provider_user_id via
-- its foreign key. Retain the ticket's admission binding when terminalizing.
create or replace function app_public.reconcile_account_registration_cleanup(
  p_cleanup_ticket_id uuid,
  p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; delay_seconds integer; provider_matches integer;
begin
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id for update;
  if ticket.state<>'reconciliation_required' then
    raise exception using errcode='22023',message='registration_cleanup_reconciliation_unavailable';
  end if;
  select count(*) into provider_matches from auth.users where id=ticket.provider_user_id;
  if provider_matches=0 then
    update app_private.registration_cleanup_tickets
      set state='completed_absent',last_outcome='absent',updated_at=statement_timestamp()
      where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id;
    update app_private.account_admission_receipts
      set state='completed_terminal_cleanup',provider_user_id=null,
          updated_at=statement_timestamp(),version=version+1
      where state in ('cleanup_pending','orphan_quarantined')
        and (provider_user_id=p_provider_user_id or admission_id=ticket.asserted_admission_id);
    update app_private.registration_quarantine_subjects
      set resolved_absent_at=statement_timestamp() where provider_user_id=p_provider_user_id;
    return jsonb_build_object('state','completed_terminal_cleanup');
  end if;
  if ticket.attempt_count>=ticket.max_attempts then
    update app_private.registration_cleanup_tickets
      set state='escalated',operator_case_id=extensions.gen_random_uuid(),
          last_outcome='provider_present',updated_at=statement_timestamp()
      where cleanup_ticket_id=p_cleanup_ticket_id;
    return jsonb_build_object('state','escalated');
  end if;
  delay_seconds:=least(3600,60*(2^(ticket.attempt_count-1))::integer);
  update app_private.registration_cleanup_tickets
    set state='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>delay_seconds),
        call_started_at=null,call_deadline=null,finality_due_at=null,
        last_outcome='provider_present',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id;
  return jsonb_build_object('state','retry');
end; $$;
revoke identity_service,candidate_automation,rg01_automation from postgres;
