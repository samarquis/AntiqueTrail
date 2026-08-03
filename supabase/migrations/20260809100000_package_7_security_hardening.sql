-- Package 7 security hardening: keep client-side share and partner review
-- transitions scoped to the actor that is allowed to perform them.

-- Candidate shares are created/retargeted by the identity service.  A client
-- may only mutate the state of a share it already owns; the parties and
-- candidate pointer are never client-editable.
create or replace function candidate_private.enforce_share_state()
returns trigger language plpgsql set search_path = pg_catalog,candidate_private,auth as $$
begin
  if new.expires_at > new.created_at + interval '30 days' then
    raise exception 'candidate_share_expiry_too_long';
  end if;

  if new.recipient_id is not null and new.recipient_id is not distinct from new.sender_id then
    raise exception 'candidate_share_self_recipient';
  end if;

  if tg_op='UPDATE' then
    -- The trusted identity service may bind an invitation recipient.  Once a
    -- row is visible to an authenticated client, none of these pointers can
    -- be retargeted by that client.
    if current_user not in ('identity_service','postgres') and (
      new.candidate_id is distinct from old.candidate_id
      or new.sender_id is distinct from old.sender_id
      or new.recipient_id is distinct from old.recipient_id
    ) then
      raise exception 'candidate_share_parties_immutable';
    end if;
    if old.state in ('accepted','closed') and (new.state<>old.state or new.close_reason is distinct from old.close_reason) then
      raise exception 'candidate_share_terminal';
    end if;
    if old.state='pending' and new.state='accepted' and (new.recipient_id is null or new.recipient_id is not distinct from new.sender_id) then
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

drop policy if exists candidate_share_sender_update on candidate_private.candidate_shares;
create policy candidate_share_sender_update on candidate_private.candidate_shares for update to authenticated
  using (sender_id=auth.uid() and state='pending' and app_private.current_session_is_active())
  with check (sender_id=auth.uid() and state='closed' and close_reason='revoked' and app_private.current_session_is_active());

drop policy if exists candidate_share_recipient_update on candidate_private.candidate_shares;
create policy candidate_share_recipient_update on candidate_private.candidate_shares for update to authenticated
  using (recipient_id=auth.uid() and state='pending' and app_private.current_session_is_active())
  with check (
    recipient_id=auth.uid()
    and state in ('accepted','closed')
    and (state='accepted' or close_reason in ('dismissed','blocked','reported'))
    and app_private.current_session_is_active()
  );

-- Partner draft content belongs to the bound partner; review state and
-- reviewer evidence belong to an assigned administrator.  The service may
-- still perform lifecycle operations through its existing policy.
alter table partner_private.pilot_store_drafts
  add column if not exists assigned_admin_id uuid references auth.users(id) on delete set null;
create index if not exists pilot_store_drafts_assigned_admin_idx
  on partner_private.pilot_store_drafts(assigned_admin_id,updated_at desc)
  where assigned_admin_id is not null;

-- The trigger itself runs as the caller, while this narrowly scoped lookup
-- uses the service owner because authenticated roles intentionally have no
-- direct table grants on partner_private.
create or replace function partner_private.pilot_draft_belongs_to_user(p_pending_identity_id uuid, p_user_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog,partner_private as $$
  select exists (
    select 1 from partner_private.pending_partner_identities p
    where p.pending_identity_id=p_pending_identity_id and p.auth_user_id=p_user_id
  )
$$;
grant identity_service to postgres;
alter function partner_private.pilot_draft_belongs_to_user(uuid,uuid) owner to identity_service;
revoke identity_service from postgres;
revoke create on schema partner_private from identity_service;
grant execute on function partner_private.pilot_draft_belongs_to_user(uuid,uuid) to authenticated;

create or replace function partner_private.enforce_pilot_store_draft_write()
returns trigger language plpgsql set search_path = pg_catalog,partner_private,auth as $$
declare
  v_owner boolean;
begin
  -- Identity-service writes are the controlled server-side workflow.
  if current_user in ('identity_service','postgres') then
    return new;
  end if;

  if tg_op='INSERT' then
    if new.state <> 'draft' or new.reviewed_at is not null or new.reviewed_by is not null or new.assigned_admin_id is not null then
      raise exception 'pilot_draft_initial_state_forbidden';
    end if;
    return new;
  end if;

  if new.pending_identity_id is distinct from old.pending_identity_id then
    raise exception 'pilot_draft_identity_immutable';
  end if;

  v_owner := partner_private.pilot_draft_belongs_to_user(old.pending_identity_id, auth.uid());

  if v_owner then
    if new.state not in ('draft','submitted','resubmitted','withdrawn') then
      raise exception 'pilot_draft_owner_state_forbidden';
    end if;
    if new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
      or new.assigned_admin_id is distinct from old.assigned_admin_id then
      raise exception 'pilot_draft_review_fields_owner_forbidden';
    end if;
  else
    -- An administrator may decide the review state, but may not rewrite the
    -- partner-provided draft or forge another reviewer's identity.
    if new.name is distinct from old.name
      or new.address is distinct from old.address
      or new.phone is distinct from old.phone
      or new.website is distinct from old.website
      or new.description is distinct from old.description
      or new.category_tags is distinct from old.category_tags
      or new.provenance is distinct from old.provenance
      or new.submitted_at is distinct from old.submitted_at
      or new.version is distinct from old.version
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.assigned_admin_id is distinct from old.assigned_admin_id then
      raise exception 'pilot_draft_owner_fields_admin_forbidden';
    end if;
    if new.state not in ('changes_requested','approved','rejected') then
      raise exception 'pilot_draft_admin_state_forbidden';
    end if;
    if new.reviewed_by is distinct from auth.uid() or new.reviewed_at is null then
      raise exception 'pilot_draft_review_evidence_required';
    end if;
  end if;
  return new;
end;
$$;
create trigger pilot_store_drafts_write_guard
before insert or update on partner_private.pilot_store_drafts
for each row execute function partner_private.enforce_pilot_store_draft_write();

drop policy if exists pilot_draft_bound_owner on partner_private.pilot_store_drafts;
create policy pilot_draft_bound_owner_read on partner_private.pilot_store_drafts for select to authenticated
  using (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and app_private.current_session_is_active());
create policy pilot_draft_bound_owner_insert on partner_private.pilot_store_drafts for insert to authenticated
  with check (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and state='draft' and reviewed_at is null and reviewed_by is null and assigned_admin_id is null and app_private.current_session_is_active());
create policy pilot_draft_bound_owner_update on partner_private.pilot_store_drafts for update to authenticated
  using (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and state in ('draft','submitted','changes_requested','resubmitted','withdrawn') and app_private.current_session_is_active())
  with check (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and state in ('draft','submitted','resubmitted','withdrawn') and app_private.current_session_is_active());

create policy pilot_draft_assigned_admin_read on partner_private.pilot_store_drafts for select to authenticated
  using (assigned_admin_id=auth.uid()
    and app_private.current_user_has_role('administrator'::app_private.app_role)
    and app_private.current_session_is_active()
    and app_private.current_session_has_mfa()
    and app_private.current_session_recent_auth(interval '15 minutes'));
create policy pilot_draft_assigned_admin_update on partner_private.pilot_store_drafts for update to authenticated
  using (assigned_admin_id=auth.uid()
    and app_private.current_user_has_role('administrator'::app_private.app_role)
    and app_private.current_session_is_active()
    and app_private.current_session_has_mfa()
    and app_private.current_session_recent_auth(interval '15 minutes'))
  with check (assigned_admin_id=auth.uid()
    and app_private.current_user_has_role('administrator'::app_private.app_role)
    and app_private.current_session_is_active()
    and app_private.current_session_has_mfa()
    and app_private.current_session_recent_auth(interval '15 minutes')
    and state in ('changes_requested','approved','rejected')
    and reviewed_by=auth.uid()
    and reviewed_at is not null);
