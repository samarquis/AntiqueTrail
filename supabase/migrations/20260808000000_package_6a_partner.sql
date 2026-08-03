-- Package 6A: provider-neutral Store Partner admission, consent, claims, and exact scope.
-- No email/provider calls, credentials, raw invitation tokens, or claim evidence are stored here.

create schema if not exists partner_private;
revoke all on schema partner_private from public, anon, authenticated;
grant usage on schema partner_private to identity_service;

create table partner_private.partner_invitations (
  invitation_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null unique,
  recipient_email_hmac bytea not null,
  hmac_key_version smallint not null default 1 check (hmac_key_version>0),
  admission_receipt_id uuid references app_private.account_admission_receipts(admission_id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  state text not null default 'active' check (state in ('active','registration_pending','consumed','expired','revoked')),
  expires_at timestamptz not null default (statement_timestamp()+interval '30 minutes'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint partner_invitation_token_hash_size check (octet_length(token_hash)=32),
  constraint partner_invitation_email_hmac_size check (octet_length(recipient_email_hmac)=32),
  constraint partner_invitation_expiry_bound check (expires_at<=created_at+interval '30 minutes'),
  constraint partner_invitation_state_shape check (
    (state in ('active','expired','revoked') and consumed_at is null)
    or (state in ('registration_pending','consumed') and consumed_at is not null)
  ),
  constraint partner_invitation_revocation_shape check ((state='revoked')=(revoked_at is not null))
);
create unique index partner_invitation_live_token_idx on partner_private.partner_invitations(token_hash) where state='active';

create table partner_private.pending_partner_identities (
  pending_identity_id uuid primary key default extensions.gen_random_uuid(),
  invitation_id uuid not null unique references partner_private.partner_invitations(invitation_id) on delete restrict,
  email_hmac bytea not null,
  hmac_key_version smallint not null default 1 check (hmac_key_version>0),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  state text not null default 'provisional' check (state in ('provisional','auth_pending','bound','expired')),
  expires_at timestamptz not null default (statement_timestamp()+interval '30 days'),
  verified_email_at timestamptz,
  mfa_verified_at timestamptz,
  bound_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint pending_identity_email_hmac_size check (octet_length(email_hmac)=32),
  constraint pending_identity_expiry_bound check (expires_at<=created_at+interval '30 days'),
  constraint pending_identity_state_shape check (
    (state in ('provisional','auth_pending','expired') and bound_at is null)
    or (state='bound' and auth_user_id is not null and verified_email_at is not null and mfa_verified_at is not null and bound_at is not null)
  )
);

create table partner_private.provisional_partner_consents (
  provisional_consent_id uuid primary key default extensions.gen_random_uuid(),
  invitation_id uuid not null unique references partner_private.partner_invitations(invitation_id) on delete restrict,
  pending_identity_id uuid not null unique references partner_private.pending_partner_identities(pending_identity_id) on delete restrict,
  policy_version text not null,
  typed_name text not null,
  business_title text not null,
  store_name text not null,
  owner_email_hmac bytea not null,
  authority_ack boolean not null,
  voluntary_ack boolean not null,
  permitted_data_ack boolean not null,
  no_payment_endorsement_ack boolean not null,
  withdrawal_ack boolean not null,
  submitted_at timestamptz not null default statement_timestamp(),
  idempotency_key text not null unique,
  constraint provisional_consent_email_hmac_size check (octet_length(owner_email_hmac)=32),
  constraint provisional_consent_acknowledgements check (authority_ack and voluntary_ack and permitted_data_ack and no_payment_endorsement_ack and withdrawal_ack),
  constraint provisional_consent_text_safe check (
    typed_name=btrim(typed_name) and char_length(typed_name) between 1 and 160 and typed_name !~ '[[:cntrl:]]'
    and business_title=btrim(business_title) and char_length(business_title) between 1 and 160 and business_title !~ '[[:cntrl:]]'
    and store_name=btrim(store_name) and char_length(store_name) between 1 and 160 and store_name !~ '[[:cntrl:]]'
  ),
  constraint provisional_consent_idempotency_safe check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create table partner_private.pilot_consent_receipts (
  consent_receipt_id uuid primary key default extensions.gen_random_uuid(),
  provisional_consent_id uuid not null unique references partner_private.provisional_partner_consents(provisional_consent_id) on delete restrict,
  pending_identity_id uuid not null references partner_private.pending_partner_identities(pending_identity_id) on delete restrict,
  invitation_id uuid not null references partner_private.partner_invitations(invitation_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  verified_email_hmac bytea not null,
  policy_version text not null,
  finalized_at timestamptz not null default statement_timestamp(),
  receipt_checksum bytea not null,
  constraint consent_receipt_email_hmac_size check (octet_length(verified_email_hmac)=32),
  constraint consent_receipt_checksum_size check (octet_length(receipt_checksum)=32)
);

create table partner_private.pilot_store_drafts (
  draft_id uuid primary key default extensions.gen_random_uuid(),
  pending_identity_id uuid not null references partner_private.pending_partner_identities(pending_identity_id) on delete restrict,
  name text not null,
  address text not null,
  phone text,
  website text,
  description text,
  category_tags jsonb not null default '[]'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  state text not null default 'draft' check (state in ('draft','submitted','changes_requested','resubmitted','approved','rejected','withdrawn')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint pilot_draft_name_safe check (name=btrim(name) and char_length(name) between 1 and 160 and name !~ '[[:cntrl:]]'),
  constraint pilot_draft_address_safe check (address=btrim(address) and char_length(address) between 1 and 320 and address !~ '[[:cntrl:]]'),
  constraint pilot_draft_phone_safe check (phone is null or (char_length(phone) between 1 and 40 and phone !~ '[[:cntrl:]]')),
  constraint pilot_draft_website_safe check (website is null or (char_length(website)<=2048 and website ~* '^https?://[^[:space:]]+$')),
  constraint pilot_draft_description_safe check (description is null or (char_length(description)<=4000 and description !~ '[[:cntrl:]]')),
  constraint pilot_draft_categories_array check (jsonb_typeof(category_tags)='array'),
  constraint pilot_draft_provenance_object check (jsonb_typeof(provenance)='object')
);

create table partner_private.partner_authority_checks (
  authority_check_id uuid primary key default extensions.gen_random_uuid(),
  draft_id uuid not null references partner_private.pilot_store_drafts(draft_id) on delete cascade,
  channel_class text not null check (channel_class in ('published_business_contact','in_person','callback','mailed_code','filing_lookup')),
  check_type text not null check (check_type in ('business_domain','published_phone','in_person_inspection','callback_response','mailed_code','filing_lookup')),
  status text not null default 'submitted' check (status in ('submitted','verified','rejected','expired','revoked')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  evidence_ref_hmac bytea,
  created_at timestamptz not null default statement_timestamp(),
  unique (draft_id,channel_class),
  constraint authority_evidence_ref_size check (evidence_ref_hmac is null or octet_length(evidence_ref_hmac)=32),
  constraint authority_verified_shape check ((status='verified' and verified_by is not null and verified_at is not null) or (status<>'verified' and verified_at is null))
);

create table partner_private.store_partnerships (
  partnership_id uuid primary key default extensions.gen_random_uuid(),
  pending_identity_id uuid not null references partner_private.pending_partner_identities(pending_identity_id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete set null,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  consent_receipt_id uuid not null references partner_private.pilot_consent_receipts(consent_receipt_id) on delete restrict,
  state text not null default 'pending' check (state in ('pending','active','withdrawn','revoked')),
  started_at timestamptz,
  ended_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint partnership_state_shape check (
    (state='pending' and started_at is null and ended_at is null)
    or (state='active' and started_at is not null and ended_at is null)
    or (state in ('withdrawn','revoked') and ended_at is not null)
  )
);
create unique index store_partnership_active_store_idx on partner_private.store_partnerships(store_id) where state='active';
create unique index store_partnership_active_user_store_idx on partner_private.store_partnerships(auth_user_id,store_id) where state='active';

create table partner_private.listing_claims (
  claim_id uuid primary key default extensions.gen_random_uuid(),
  claimant_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  state text not null default 'draft' check (state in ('draft','submitted','verification_pending','changes_requested','conflict','approved','rejected','withdrawn','revoked')),
  risk_tier text not null default 'standard' check (risk_tier in ('standard','elevated','high')),
  version bigint not null default 1 check (version>0),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
create unique index listing_claim_active_claimant_store_idx on partner_private.listing_claims(claimant_id,store_id) where state in ('draft','submitted','verification_pending','changes_requested','conflict','approved');
create unique index listing_claim_approved_store_idx on partner_private.listing_claims(store_id) where state='approved';

create table partner_private.claim_authority_signals (
  signal_id uuid primary key default extensions.gen_random_uuid(),
  claim_id uuid not null references partner_private.listing_claims(claim_id) on delete cascade,
  channel_class text not null check (channel_class in ('published_business_contact','callback','mailed_code','filing_lookup','in_person')),
  signal_type text not null check (signal_type in ('domain_response','published_phone_response','callback','mailed_code','filing_lookup','in_person_inspection')),
  status text not null default 'submitted' check (status in ('submitted','verified','rejected','expired','revoked')),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  evidence_ref_hmac bytea,
  created_at timestamptz not null default statement_timestamp(),
  unique (claim_id,channel_class),
  constraint claim_signal_evidence_ref_size check (evidence_ref_hmac is null or octet_length(evidence_ref_hmac)=32),
  constraint claim_signal_verified_shape check ((status='verified' and verified_by is not null and verified_at is not null) or (status<>'verified' and verified_at is null))
);

create table partner_private.claim_conflicts (
  conflict_id uuid primary key default extensions.gen_random_uuid(),
  claim_id uuid not null references partner_private.listing_claims(claim_id) on delete cascade,
  conflict_kind text not null check (conflict_kind in ('existing_claim','duplicate_claimant','scope_overlap','authority_mismatch')),
  state text not null default 'open' check (state in ('open','resolved','rejected','withdrawn')),
  assigned_admin_id uuid references auth.users(id) on delete set null,
  resolution_code text,
  opened_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  constraint claim_conflict_resolution_shape check ((state='open' and resolved_at is null) or (state<>'open' and resolved_at is not null))
);

create table partner_private.store_partner_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  partnership_id uuid not null references partner_private.store_partnerships(partnership_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  role text not null default 'representative' check (role='representative'),
  scope_kind text not null default 'store' check (scope_kind='store'),
  state text not null default 'active' check (state in ('active','revoked','expired')),
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check (version>0),
  constraint partner_grant_state_shape check ((state='active' and revoked_at is null and revoked_by is null) or (state<>'active' and revoked_at is not null))
);
create unique index partner_grant_active_store_idx on partner_private.store_partner_grants(store_id) where state='active';
create unique index partner_grant_active_user_store_idx on partner_private.store_partner_grants(auth_user_id,store_id) where state='active';

create table partner_private.partner_access_revocations (
  revocation_id uuid primary key default extensions.gen_random_uuid(),
  grant_id uuid not null references partner_private.store_partner_grants(grant_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  reason_code text not null check (reason_code in ('withdrawn','administrator_revoked','authority_expired','account_deleted','scope_transfer')),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz not null default statement_timestamp(),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create table partner_private.claim_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  claim_id uuid not null references partner_private.listing_claims(claim_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_kind text not null check (event_kind in ('created','submitted','signal_submitted','changes_requested','conflict_opened','approved','rejected','withdrawn','revoked','transferred')),
  from_state text,
  to_state text,
  idempotency_key text not null,
  occurred_at timestamptz not null default statement_timestamp(),
  unique (claim_id,idempotency_key),
  constraint claim_event_key_safe check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create or replace function partner_private.reject_append_only_mutation()
returns trigger language plpgsql set search_path = pg_catalog,partner_private as $$
begin raise exception 'partner_append_only'; end;
$$;
create trigger provisional_consent_append_only before update or delete on partner_private.provisional_partner_consents for each row execute function partner_private.reject_append_only_mutation();
create trigger consent_receipt_append_only before update or delete on partner_private.pilot_consent_receipts for each row execute function partner_private.reject_append_only_mutation();
create trigger partner_access_revocation_append_only before update or delete on partner_private.partner_access_revocations for each row execute function partner_private.reject_append_only_mutation();
create trigger claim_events_append_only before update or delete on partner_private.claim_events for each row execute function partner_private.reject_append_only_mutation();

do $$ declare t text; begin
  foreach t in array array['partner_invitations','pending_partner_identities','provisional_partner_consents','pilot_consent_receipts','pilot_store_drafts','partner_authority_checks','store_partnerships','listing_claims','claim_authority_signals','claim_conflicts','store_partner_grants','partner_access_revocations','claim_events'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on partner_private.%I to identity_service',t);
  end loop;
end $$;
revoke update, delete, truncate on partner_private.provisional_partner_consents from identity_service;
revoke update, delete, truncate on partner_private.pilot_consent_receipts from identity_service;
revoke update, delete, truncate on partner_private.partner_access_revocations from identity_service;
revoke update, delete, truncate on partner_private.claim_events from identity_service;

create policy identity_service_partner_invitations on partner_private.partner_invitations for all to identity_service using (true) with check (true);
create policy identity_service_pending_identities on partner_private.pending_partner_identities for all to identity_service using (true) with check (true);
create policy identity_service_provisional_consents on partner_private.provisional_partner_consents for all to identity_service using (true) with check (true);
create policy identity_service_consent_receipts on partner_private.pilot_consent_receipts for all to identity_service using (true) with check (true);
create policy identity_service_pilot_drafts on partner_private.pilot_store_drafts for all to identity_service using (true) with check (true);
create policy identity_service_authority_checks on partner_private.partner_authority_checks for all to identity_service using (true) with check (true);
create policy identity_service_partnerships on partner_private.store_partnerships for all to identity_service using (true) with check (true);
create policy identity_service_listing_claims on partner_private.listing_claims for all to identity_service using (true) with check (true);
create policy identity_service_claim_signals on partner_private.claim_authority_signals for all to identity_service using (true) with check (true);
create policy identity_service_claim_conflicts on partner_private.claim_conflicts for all to identity_service using (true) with check (true);
create policy identity_service_partner_grants on partner_private.store_partner_grants for all to identity_service using (true) with check (true);
create policy identity_service_revocations on partner_private.partner_access_revocations for all to identity_service using (true) with check (true);
create policy identity_service_claim_events on partner_private.claim_events for all to identity_service using (true) with check (true);

-- Application roles receive no table grants. These policies document the exact future RPC scopes.
create policy pending_identity_bound_read on partner_private.pending_partner_identities for select to authenticated
  using (auth_user_id=auth.uid() and app_private.current_session_is_active());
create policy provisional_consent_bound_read on partner_private.provisional_partner_consents for select to authenticated
  using (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=provisional_partner_consents.pending_identity_id and p.auth_user_id=auth.uid()) and app_private.current_session_is_active());
create policy consent_receipt_bound_read on partner_private.pilot_consent_receipts for select to authenticated
  using (auth_user_id=auth.uid() and app_private.current_session_is_active());
create policy pilot_draft_bound_owner on partner_private.pilot_store_drafts for all to authenticated
  using (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and app_private.current_session_is_active())
  with check (exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=pilot_store_drafts.pending_identity_id and p.auth_user_id=auth.uid()) and app_private.current_session_is_active());
create policy listing_claim_claimant_read on partner_private.listing_claims for select to authenticated
  using (claimant_id=auth.uid() and app_private.current_session_is_active());
create policy listing_claim_claimant_write on partner_private.listing_claims for insert to authenticated
  with check (claimant_id=auth.uid() and app_private.current_session_is_active());
create policy claim_signal_claimant_read on partner_private.claim_authority_signals for select to authenticated
  using (exists(select 1 from partner_private.listing_claims c where c.claim_id=claim_authority_signals.claim_id and c.claimant_id=auth.uid()) and app_private.current_session_is_active());
create policy claim_conflict_claimant_read on partner_private.claim_conflicts for select to authenticated
  using (exists(select 1 from partner_private.listing_claims c where c.claim_id=claim_conflicts.claim_id and c.claimant_id=auth.uid()) and app_private.current_session_is_active());
create policy partner_grant_exact_owner_read on partner_private.store_partner_grants for select to authenticated
  using (auth_user_id=auth.uid() and app_private.current_session_is_active());
create policy partnership_exact_owner_read on partner_private.store_partnerships for select to authenticated
  using (auth_user_id=auth.uid() and app_private.current_session_is_active());
