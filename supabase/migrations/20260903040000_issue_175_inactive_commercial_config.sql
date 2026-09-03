-- Issue #175: immutable inactive commercial configuration and private research.
-- This migration creates no public price surface and performs no provider call.

do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'commercial_research_signature_service') then
    create role commercial_research_signature_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

grant billing_automation to postgres;
grant create on schema partner_private, app_public to billing_automation;
grant usage on schema app_private, community_private, extensions to billing_automation;
grant select on community_private.community_evidence_receipts to billing_automation;
create policy billing_commercial_research_review_receipts
  on community_private.community_evidence_receipts for select to billing_automation using (true);
set role billing_automation;

create table partner_private.photo_tier_commercial_configs (
  version bigint primary key check (version > 0),
  state text not null default 'draft'
    check (state in ('draft','approved_inactive','active','superseded')),
  gallery_price_cents bigint check (gallery_price_cents > 0),
  full_gallery_price_cents bigint check (full_gallery_price_cents > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  tax_mode text,
  first_charge_rule text,
  renewal_rule text,
  cancel_anytime_rule text,
  refund_window_rule text,
  upgrade_proration_rule text,
  downgrade_rule text,
  failed_payment_grace_rule text,
  hidden_photo_deletion_rule text,
  refund_policy_version text,
  support_policy_version text,
  terms_version text,
  privacy_version text,
  full_gallery_limits_version text,
  full_gallery_limits jsonb,
  canonical_bytes text,
  digest bytea check (digest is null or octet_length(digest) = 32),
  research_authorization_id uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  row_version bigint not null default 1 check (row_version > 0),
  constraint photo_tier_commercial_config_approval_shape check (
    (state = 'draft' and canonical_bytes is null and digest is null
      and research_authorization_id is null and approved_by is null and approved_at is null)
    or (state = 'superseded')
    or (state in ('approved_inactive','active') and canonical_bytes is not null and digest is not null
      and research_authorization_id is not null and approved_by is not null and approved_at is not null)
  )
);

create table partner_private.commercial_research_signature_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  config_version bigint not null unique
    references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  config_digest bytea not null check (octet_length(config_digest) = 32),
  protocol_digest bytea not null check (octet_length(protocol_digest) = 32),
  community_gate_receipt_ids uuid[] not null check (cardinality(community_gate_receipt_ids) = 3),
  signer_user_id uuid not null,
  signed_payload_digest bytea not null unique check (octet_length(signed_payload_digest) = 32),
  research_expires_at timestamptz not null,
  state text not null default 'issued' check (state in ('issued','consumed','expired','revoked')),
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint commercial_research_challenge_window check (
    expires_at > issued_at and expires_at <= issued_at + interval '30 minutes'
  ),
  constraint commercial_research_window check (
    research_expires_at > expires_at and research_expires_at <= issued_at + interval '180 days'
  ),
  constraint commercial_research_challenge_state check (
    (state = 'consumed' and consumed_at is not null)
    or (state <> 'consumed' and consumed_at is null)
  )
);

create table partner_private.commercial_research_signature_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null unique
    references partner_private.commercial_research_signature_challenges(challenge_id) on delete restrict,
  config_version bigint not null,
  config_digest bytea not null check (octet_length(config_digest) = 32),
  protocol_digest bytea not null check (octet_length(protocol_digest) = 32),
  signer_user_id uuid not null,
  signer_responsibility text not null check (signer_responsibility = 'ProductOwner'),
  signed_payload_digest bytea not null check (octet_length(signed_payload_digest) = 32),
  provider_verification_id text not null check (
    provider_verification_id = btrim(provider_verification_id)
    and provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  signed_at timestamptz not null,
  verified_at timestamptz not null default statement_timestamp(),
  constraint commercial_research_signature_time check (verified_at >= signed_at)
);

create table partner_private.commercial_research_authorizations (
  authorization_id uuid primary key default extensions.gen_random_uuid(),
  config_version bigint not null unique
    references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  protocol_digest bytea not null check (octet_length(protocol_digest) = 32),
  signature_challenge_id uuid not null unique
    references partner_private.commercial_research_signature_challenges(challenge_id) on delete restrict,
  signature_receipt_id uuid not null unique
    references partner_private.commercial_research_signature_receipts(receipt_id) on delete restrict,
  signed_by uuid not null,
  signer_responsibility text not null default 'ProductOwner'
    check (signer_responsibility = 'ProductOwner'),
  signature_kind text not null default 'authenticated_product_owner_mfa'
    check (signature_kind = 'authenticated_product_owner_mfa'),
  signed_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'active' check (state in ('active','revoked','superseded')),
  created_at timestamptz not null default statement_timestamp(),
  constraint commercial_research_authorization_time check (expires_at > signed_at)
);

alter table partner_private.photo_tier_commercial_configs
  add constraint photo_tier_commercial_config_authorization_fk
  foreign key (research_authorization_id)
  references partner_private.commercial_research_authorizations(authorization_id) on delete restrict;

create table partner_private.commercial_research_participants (
  authorization_id uuid not null
    references partner_private.commercial_research_authorizations(authorization_id) on delete restrict,
  user_id uuid not null,
  eligible boolean not null,
  consent_digest bytea not null check (octet_length(consent_digest) = 32),
  artifact_digest bytea not null check (octet_length(artifact_digest) = 32),
  question_version text not null check (question_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  state text not null default 'active' check (state in ('active','withdrawn','completed')),
  expires_at timestamptz not null,
  linkage_purge_due_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (authorization_id,user_id),
  constraint commercial_research_participant_purge check (linkage_purge_due_at <= created_at + interval '30 days')
);

create table partner_private.commercial_research_attempts (
  attempt_id uuid primary key default extensions.gen_random_uuid(),
  authorization_id uuid not null,
  participant_user_id uuid not null,
  config_version bigint not null,
  config_digest bytea not null check (octet_length(config_digest) = 32),
  artifact_digest bytea not null check (octet_length(artifact_digest) = 32),
  question_version text not null,
  choice text not null check (choice in ('free','gallery','full_gallery','refused','abandoned')),
  reason_code text not null check (reason_code in ('photo_capacity','price','terms','stay_free','prefer_not_to_say')),
  consent_digest bytea not null check (octet_length(consent_digest) = 32),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  recorded_at timestamptz not null default statement_timestamp(),
  retain_until timestamptz not null default (statement_timestamp() + interval '3 years'),
  foreign key (authorization_id,participant_user_id)
    references partner_private.commercial_research_participants(authorization_id,user_id) on delete restrict,
  foreign key (config_version)
    references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  unique (participant_user_id,idempotency_key),
  unique (authorization_id,participant_user_id)
);

create or replace function partner_private.commercial_config_canonical_bytes(
  p_config partner_private.photo_tier_commercial_configs
) returns text language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'currency',p_config.currency,
    'cancelAnytimeRule',p_config.cancel_anytime_rule,
    'downgradeRule',p_config.downgrade_rule,
    'failedPaymentGraceRule',p_config.failed_payment_grace_rule,
    'firstChargeRule',p_config.first_charge_rule,
    'fullGalleryLimits',p_config.full_gallery_limits,
    'fullGalleryLimitsVersion',p_config.full_gallery_limits_version,
    'fullGalleryPriceCents',p_config.full_gallery_price_cents,
    'galleryPriceCents',p_config.gallery_price_cents,
    'privacyVersion',p_config.privacy_version,
    'refundWindowRule',p_config.refund_window_rule,
    'refundPolicyVersion',p_config.refund_policy_version,
    'renewalRule',p_config.renewal_rule,
    'supportPolicyVersion',p_config.support_policy_version,
    'taxMode',p_config.tax_mode,
    'termsVersion',p_config.terms_version,
    'upgradeProrationRule',p_config.upgrade_proration_rule,
    'hiddenPhotoDeletionRule',p_config.hidden_photo_deletion_rule,
    'version',p_config.version
  )::text
$$;

create or replace function partner_private.commercial_config_is_complete(
  p_config partner_private.photo_tier_commercial_configs
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_config.gallery_price_cents > 0
    and p_config.gallery_price_cents <= 100000000
    and p_config.full_gallery_price_cents > 0
    and p_config.full_gallery_price_cents <= 100000000
    and p_config.full_gallery_price_cents >= p_config.gallery_price_cents
    and p_config.currency = 'USD'
    and p_config.tax_mode = btrim(p_config.tax_mode) and char_length(p_config.tax_mode) between 1 and 500 and p_config.tax_mode !~ '[[:cntrl:]]'
    and p_config.first_charge_rule = btrim(p_config.first_charge_rule) and char_length(p_config.first_charge_rule) between 1 and 500 and p_config.first_charge_rule !~ '[[:cntrl:]]'
    and p_config.renewal_rule = btrim(p_config.renewal_rule) and char_length(p_config.renewal_rule) between 1 and 500 and p_config.renewal_rule !~ '[[:cntrl:]]'
    and p_config.cancel_anytime_rule = btrim(p_config.cancel_anytime_rule) and char_length(p_config.cancel_anytime_rule) between 1 and 500 and p_config.cancel_anytime_rule !~ '[[:cntrl:]]'
    and p_config.refund_window_rule = btrim(p_config.refund_window_rule) and char_length(p_config.refund_window_rule) between 1 and 500 and p_config.refund_window_rule !~ '[[:cntrl:]]'
    and p_config.upgrade_proration_rule = btrim(p_config.upgrade_proration_rule) and char_length(p_config.upgrade_proration_rule) between 1 and 500 and p_config.upgrade_proration_rule !~ '[[:cntrl:]]'
    and p_config.downgrade_rule = btrim(p_config.downgrade_rule) and char_length(p_config.downgrade_rule) between 1 and 500 and p_config.downgrade_rule !~ '[[:cntrl:]]'
    and p_config.failed_payment_grace_rule = btrim(p_config.failed_payment_grace_rule) and char_length(p_config.failed_payment_grace_rule) between 1 and 500 and p_config.failed_payment_grace_rule !~ '[[:cntrl:]]'
    and p_config.hidden_photo_deletion_rule = btrim(p_config.hidden_photo_deletion_rule) and char_length(p_config.hidden_photo_deletion_rule) between 1 and 500 and p_config.hidden_photo_deletion_rule !~ '[[:cntrl:]]'
    and p_config.refund_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and p_config.support_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and p_config.terms_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and p_config.privacy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and p_config.full_gallery_limits_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    and jsonb_typeof(p_config.full_gallery_limits) = 'object'
    and p_config.full_gallery_limits ?& array[
      'acceptedFileTypes','maxFileBytes','maxWidthPixels','maxHeightPixels','uploadRateRule',
      'quotaOutageRule','moderationAbuseRule','reasonRecoveryAppealRule','paidServiceRemedy'
    ]
    and (select count(*) = 9 from jsonb_object_keys(p_config.full_gallery_limits))
    and jsonb_typeof(p_config.full_gallery_limits->'acceptedFileTypes') = 'array'
    and jsonb_array_length(p_config.full_gallery_limits->'acceptedFileTypes') between 1 and 16
    and not exists(select 1 from jsonb_array_elements(p_config.full_gallery_limits->'acceptedFileTypes') item
      where jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 127
        or (item #>> '{}') !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$')
    and case when jsonb_typeof(p_config.full_gallery_limits->'maxFileBytes') = 'number'
      and (p_config.full_gallery_limits->>'maxFileBytes') ~ '^[0-9]+$'
      then (p_config.full_gallery_limits->>'maxFileBytes')::bigint between 1 and 100000000 else false end
    and case when jsonb_typeof(p_config.full_gallery_limits->'maxWidthPixels') = 'number'
      and (p_config.full_gallery_limits->>'maxWidthPixels') ~ '^[0-9]+$'
      then (p_config.full_gallery_limits->>'maxWidthPixels')::integer between 1 and 20000 else false end
    and case when jsonb_typeof(p_config.full_gallery_limits->'maxHeightPixels') = 'number'
      and (p_config.full_gallery_limits->>'maxHeightPixels') ~ '^[0-9]+$'
      then (p_config.full_gallery_limits->>'maxHeightPixels')::integer between 1 and 20000 else false end
    and (select bool_and(value = btrim(value) and char_length(value) between 1 and 500 and value !~ '[[:cntrl:]]')
      from jsonb_each_text(p_config.full_gallery_limits)
      where key in ('uploadRateRule','quotaOutageRule','moderationAbuseRule','reasonRecoveryAppealRule','paidServiceRemedy'))
  ,false)
$$;

create or replace function partner_private.guard_commercial_config_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'commercial_config_immutable';
  end if;
  if old.state <> 'draft' and (
    new.version is distinct from old.version
    or new.gallery_price_cents is distinct from old.gallery_price_cents
    or new.full_gallery_price_cents is distinct from old.full_gallery_price_cents
    or new.currency is distinct from old.currency
    or new.tax_mode is distinct from old.tax_mode
    or new.first_charge_rule is distinct from old.first_charge_rule
    or new.renewal_rule is distinct from old.renewal_rule
    or new.cancel_anytime_rule is distinct from old.cancel_anytime_rule
    or new.refund_window_rule is distinct from old.refund_window_rule
    or new.upgrade_proration_rule is distinct from old.upgrade_proration_rule
    or new.downgrade_rule is distinct from old.downgrade_rule
    or new.failed_payment_grace_rule is distinct from old.failed_payment_grace_rule
    or new.hidden_photo_deletion_rule is distinct from old.hidden_photo_deletion_rule
    or new.refund_policy_version is distinct from old.refund_policy_version
    or new.support_policy_version is distinct from old.support_policy_version
    or new.terms_version is distinct from old.terms_version
    or new.privacy_version is distinct from old.privacy_version
    or new.full_gallery_limits_version is distinct from old.full_gallery_limits_version
    or new.full_gallery_limits is distinct from old.full_gallery_limits
    or new.canonical_bytes is distinct from old.canonical_bytes
    or new.digest is distinct from old.digest
    or new.research_authorization_id is distinct from old.research_authorization_id
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
  ) then
    raise exception using errcode = '42501', message = 'commercial_config_immutable';
  end if;
  if not (
    (old.state = 'draft' and new.state in ('draft','approved_inactive','superseded'))
    or (old.state = 'approved_inactive' and new.state in ('approved_inactive','active','superseded'))
    or (old.state = 'active' and new.state in ('active','superseded'))
    or (old.state = 'superseded' and new.state = 'superseded')
  ) then
    raise exception using errcode = '55000', message = 'commercial_config_transition_invalid';
  end if;
  new.updated_at := statement_timestamp();
  new.row_version := old.row_version + 1;
  return new;
end $$;

create trigger photo_tier_commercial_config_guard
before update or delete on partner_private.photo_tier_commercial_configs
for each row execute function partner_private.guard_commercial_config_mutation();

create trigger commercial_research_attempt_append_only
before update or delete on partner_private.commercial_research_attempts
for each row execute function partner_private.reject_append_only_mutation();

create trigger commercial_research_signature_receipt_append_only
before update or delete on partner_private.commercial_research_signature_receipts
for each row execute function partner_private.reject_append_only_mutation();

create or replace function partner_private.commercial_research_reviews_pass(
  p_receipt_ids uuid[]
) returns boolean language sql stable security definer set search_path = '' as $$
  select cardinality(p_receipt_ids) = 3
    and count(*) = 3
    and count(distinct receipt_id) = 3
    and count(distinct area_slug) = 3
    and bool_and(
      receipt_kind = 'community_gate' and responsibility = 'PrimaryInternalTester'
      and decision = 'pass' and external_verified and mfa_verified and recent_authentication
      and signed_at <= statement_timestamp()
    )
  from community_private.community_evidence_receipts
  where receipt_id = any(p_receipt_ids)
$$;

create or replace function partner_private.issue_commercial_research_signature_challenge(
  p_version bigint,
  p_protocol_digest bytea,
  p_signer_user_id uuid,
  p_community_gate_receipt_ids uuid[],
  p_research_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  config partner_private.photo_tier_commercial_configs%rowtype;
  challenge partner_private.commercial_research_signature_challenges%rowtype;
  ordered_receipts uuid[];
  canonical text;
  config_digest bytea;
  payload_digest bytea;
begin
  select * into config from partner_private.photo_tier_commercial_configs
    where version = p_version for update;
  ordered_receipts := array(select receipt_id from unnest(p_community_gate_receipt_ids) receipt_id order by receipt_id);
  if config.version is null or config.state <> 'draft'
    or not partner_private.commercial_config_is_complete(config)
    or octet_length(p_protocol_digest) <> 32 or p_signer_user_id is null
    or p_research_expires_at <= statement_timestamp() + interval '30 minutes'
    or p_research_expires_at > statement_timestamp() + interval '180 days'
    or not partner_private.commercial_research_reviews_pass(ordered_receipts) then
    raise exception using errcode = '42501', message = 'commercial_research_challenge_denied';
  end if;
  update partner_private.commercial_research_signature_challenges
    set state = 'expired' where config_version = p_version and state = 'issued'
      and expires_at <= statement_timestamp();
  if exists(select 1 from partner_private.commercial_research_signature_challenges
      where config_version = p_version and state = 'issued') then
    raise exception using errcode = '55000', message = 'commercial_research_challenge_pending';
  end if;
  canonical := partner_private.commercial_config_canonical_bytes(config);
  config_digest := extensions.digest(convert_to(canonical,'UTF8'),'sha256');
  payload_digest := extensions.digest(convert_to(jsonb_build_object(
    'configDigest',encode(config_digest,'hex'),
    'configVersion',p_version,
    'protocolDigest',encode(p_protocol_digest,'hex'),
    'researchExpiresAt',to_char(p_research_expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'reviewReceiptIds',to_jsonb(ordered_receipts),
    'signerUserId',p_signer_user_id
  )::text,'UTF8'),'sha256');
  insert into partner_private.commercial_research_signature_challenges(
    config_version,config_digest,protocol_digest,community_gate_receipt_ids,
    signer_user_id,signed_payload_digest,research_expires_at,expires_at
  ) values (
    p_version,config_digest,p_protocol_digest,ordered_receipts,
    p_signer_user_id,payload_digest,p_research_expires_at,statement_timestamp()+interval '30 minutes'
  ) returning * into challenge;
  return jsonb_build_object('challengeId',challenge.challenge_id,
    'configDigest',encode(challenge.config_digest,'hex'),
    'payloadDigest',encode(challenge.signed_payload_digest,'hex'),
    'expiresAt',challenge.expires_at);
end $$;

create or replace function partner_private.approve_photo_tier_commercial_config(
  p_version bigint,
  p_signature_receipt_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  config partner_private.photo_tier_commercial_configs%rowtype;
  challenge partner_private.commercial_research_signature_challenges%rowtype;
  signature_receipt partner_private.commercial_research_signature_receipts%rowtype;
  authorization_id uuid;
  canonical text;
  frozen_digest bytea;
begin
  select * into config from partner_private.photo_tier_commercial_configs
    where version = p_version for update;
  select * into signature_receipt from partner_private.commercial_research_signature_receipts
    where receipt_id = p_signature_receipt_id;
  select * into challenge from partner_private.commercial_research_signature_challenges
    where challenge_id = signature_receipt.challenge_id for update;
  canonical := partner_private.commercial_config_canonical_bytes(config);
  frozen_digest := extensions.digest(convert_to(canonical,'UTF8'),'sha256');
  if config.version is null or signature_receipt.receipt_id is null or challenge.challenge_id is null
    or challenge.config_version <> p_version or challenge.state <> 'issued'
    or challenge.issued_at > statement_timestamp() or challenge.expires_at <= statement_timestamp()
    or signature_receipt.signed_at < challenge.issued_at
    or signature_receipt.signed_at > challenge.expires_at
    or signature_receipt.signed_at > statement_timestamp()
    or signature_receipt.verified_at < signature_receipt.signed_at
    or signature_receipt.verified_at > statement_timestamp()
    or signature_receipt.config_version <> p_version
    or signature_receipt.config_digest <> challenge.config_digest
    or signature_receipt.protocol_digest <> challenge.protocol_digest
    or signature_receipt.signer_user_id <> challenge.signer_user_id
    or signature_receipt.signer_responsibility <> 'ProductOwner'
    or signature_receipt.signed_payload_digest <> challenge.signed_payload_digest
    or frozen_digest <> challenge.config_digest
    or not partner_private.commercial_research_reviews_pass(challenge.community_gate_receipt_ids) then
    raise exception using errcode = '55000', message = 'commercial_research_authorization_invalid';
  end if;
  if config.state <> 'draft' or not partner_private.commercial_config_is_complete(config) then
    raise exception using errcode = '22023', message = 'commercial_config_incomplete';
  end if;
  insert into partner_private.commercial_research_authorizations(
    config_version,protocol_digest,signature_challenge_id,signature_receipt_id,
    signed_by,signed_at,expires_at
  ) values (
    p_version,challenge.protocol_digest,challenge.challenge_id,signature_receipt.receipt_id,
    signature_receipt.signer_user_id,signature_receipt.signed_at,challenge.research_expires_at
  ) returning commercial_research_authorizations.authorization_id into authorization_id;
  update partner_private.photo_tier_commercial_configs set
    state = 'approved_inactive', canonical_bytes = canonical, digest = frozen_digest,
    research_authorization_id = authorization_id,
    approved_by = signature_receipt.signer_user_id, approved_at = signature_receipt.signed_at
    where version = p_version;
  update partner_private.commercial_research_signature_challenges
    set state = 'consumed', consumed_at = statement_timestamp() where challenge_id = challenge.challenge_id;
  return jsonb_build_object('version',p_version,'state','approved_inactive',
    'digest',encode(frozen_digest,'hex'),'authorizationId',authorization_id);
end $$;

create or replace function partner_private.commercial_config_is_activation_candidate(
  p_version bigint,
  p_digest bytea
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from partner_private.photo_tier_commercial_configs c
    where c.version = p_version and c.digest = p_digest and c.state = 'approved_inactive'
      and c.research_authorization_id is not null
  )
$$;

create or replace function app_public.billing_get_commercial_research_config(
  p_authorization_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := app_public.request_user_id();
  config partner_private.photo_tier_commercial_configs%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode = '42501', message = 'commercial_research_unavailable';
  end if;
  select c.* into config
  from partner_private.photo_tier_commercial_configs c
  join partner_private.commercial_research_authorizations a
    on a.authorization_id = c.research_authorization_id and a.config_version = c.version
  join partner_private.commercial_research_participants p
    on p.authorization_id = a.authorization_id and p.user_id = actor
  where a.authorization_id = p_authorization_id
    and a.state = 'active' and a.expires_at > statement_timestamp()
    and p.state = 'active' and p.eligible and p.expires_at > statement_timestamp()
    and c.state = 'approved_inactive';
  if not found then
    raise exception using errcode = '42501', message = 'commercial_research_unavailable';
  end if;
  return jsonb_build_object(
    'version',config.version,'state',config.state,'digest',encode(config.digest,'hex'),
    'galleryPriceCents',config.gallery_price_cents,
    'fullGalleryPriceCents',config.full_gallery_price_cents,
    'currency',config.currency,'taxMode',config.tax_mode,
    'firstChargeRule',config.first_charge_rule,'renewalRule',config.renewal_rule,
    'cancelAnytimeRule',config.cancel_anytime_rule,
    'refundWindowRule',config.refund_window_rule,
    'upgradeProrationRule',config.upgrade_proration_rule,
    'downgradeRule',config.downgrade_rule,
    'failedPaymentGraceRule',config.failed_payment_grace_rule,
    'hiddenPhotoDeletionRule',config.hidden_photo_deletion_rule,
    'refundPolicyVersion',config.refund_policy_version,
    'supportPolicyVersion',config.support_policy_version,
    'termsVersion',config.terms_version,'privacyVersion',config.privacy_version,
    'fullGalleryLimitsVersion',config.full_gallery_limits_version,
    'fullGalleryLimits',config.full_gallery_limits
  );
end $$;

create or replace function app_public.billing_record_commercial_research_attempt(
  p_authorization_id uuid,
  p_config_version bigint,
  p_config_digest text,
  p_artifact_digest text,
  p_question_version text,
  p_choice text,
  p_reason_code text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := app_public.request_user_id();
  v_authorization partner_private.commercial_research_authorizations%rowtype;
  participant partner_private.commercial_research_participants%rowtype;
  config partner_private.photo_tier_commercial_configs%rowtype;
  prior partner_private.commercial_research_attempts%rowtype;
  created partner_private.commercial_research_attempts%rowtype;
begin
  if actor is null or not app_private.current_session_is_active()
    or p_config_digest !~ '^[0-9a-f]{64}$' or p_artifact_digest !~ '^[0-9a-f]{64}$'
    or p_question_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
    or p_choice not in ('free','gallery','full_gallery','refused','abandoned')
    or p_reason_code not in ('photo_capacity','price','terms','stay_free','prefer_not_to_say')
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode = '42501', message = 'commercial_research_unavailable';
  end if;
  select * into v_authorization from partner_private.commercial_research_authorizations
    where authorization_id = p_authorization_id for update;
  if v_authorization.authorization_id is null or v_authorization.state <> 'active'
    or v_authorization.expires_at <= statement_timestamp()
    or v_authorization.config_version <> p_config_version then
    raise exception using errcode = '42501', message = 'commercial_research_unavailable';
  end if;
  select * into prior from partner_private.commercial_research_attempts
    where participant_user_id = actor and idempotency_key = p_idempotency_key;
  if found then
    if prior.authorization_id <> p_authorization_id or prior.config_version <> p_config_version
      or prior.config_digest <> decode(p_config_digest,'hex')
      or prior.artifact_digest <> decode(p_artifact_digest,'hex')
      or prior.question_version <> p_question_version or prior.choice <> p_choice
      or prior.reason_code <> p_reason_code then
      raise exception using errcode = '22023', message = 'commercial_research_idempotency_mismatch';
    end if;
    return jsonb_build_object('attemptId',prior.attempt_id,'configVersion',prior.config_version,
      'configDigest',encode(prior.config_digest,'hex'));
  end if;
  select * into participant from partner_private.commercial_research_participants
    where authorization_id = p_authorization_id and user_id = actor for update;
  select * into config from partner_private.photo_tier_commercial_configs
    where version = p_config_version for share;
  if participant.authorization_id is null or config.version is null
    or participant.state <> 'active' or not participant.eligible
    or participant.expires_at <= statement_timestamp()
    or participant.artifact_digest <> decode(p_artifact_digest,'hex')
    or participant.question_version <> p_question_version
    or config.state <> 'approved_inactive'
    or config.research_authorization_id <> p_authorization_id
    or config.digest <> decode(p_config_digest,'hex') then
    raise exception using errcode = '42501', message = 'commercial_research_unavailable';
  end if;
  insert into partner_private.commercial_research_attempts(
    authorization_id,participant_user_id,config_version,config_digest,artifact_digest,
    question_version,choice,reason_code,consent_digest,idempotency_key
  ) values (
    p_authorization_id,actor,p_config_version,decode(p_config_digest,'hex'),decode(p_artifact_digest,'hex'),
    p_question_version,p_choice,p_reason_code,participant.consent_digest,p_idempotency_key
  ) returning * into created;
  update partner_private.commercial_research_participants set state = 'completed'
    where authorization_id = p_authorization_id and user_id = actor;
  return jsonb_build_object('attemptId',created.attempt_id,'configVersion',created.config_version,
    'configDigest',encode(created.config_digest,'hex'));
end $$;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'photo_tier_commercial_configs','commercial_research_authorizations',
    'commercial_research_participants','commercial_research_attempts',
    'commercial_research_signature_challenges'
  ] loop
    execute format('alter table partner_private.%I enable row level security',table_name);
    execute format('alter table partner_private.%I force row level security',table_name);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',table_name);
    execute format('grant select,insert,update,delete on partner_private.%I to billing_automation',table_name);
    execute format('create policy billing_automation_%I on partner_private.%I for all to billing_automation using (true) with check (true)',table_name,table_name);
  end loop;
end $$;

alter table partner_private.commercial_research_signature_receipts enable row level security;
alter table partner_private.commercial_research_signature_receipts force row level security;
revoke all on partner_private.commercial_research_signature_receipts from public,anon,authenticated,service_role;
grant select on partner_private.commercial_research_signature_receipts to billing_automation;
create policy billing_signature_receipt_read on partner_private.commercial_research_signature_receipts
  for select to billing_automation using (true);

alter function partner_private.commercial_config_canonical_bytes(partner_private.photo_tier_commercial_configs) owner to billing_automation;
alter function partner_private.commercial_config_is_complete(partner_private.photo_tier_commercial_configs) owner to billing_automation;
alter function partner_private.guard_commercial_config_mutation() owner to billing_automation;
alter function partner_private.commercial_research_reviews_pass(uuid[]) owner to billing_automation;
alter function partner_private.issue_commercial_research_signature_challenge(bigint,bytea,uuid,uuid[],timestamptz) owner to billing_automation;
alter function partner_private.approve_photo_tier_commercial_config(bigint,uuid) owner to billing_automation;
alter function partner_private.commercial_config_is_activation_candidate(bigint,bytea) owner to billing_automation;
alter function app_public.billing_get_commercial_research_config(uuid) owner to billing_automation;
alter function app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text) owner to billing_automation;

reset role;

grant commercial_research_signature_service to postgres;
grant create on schema partner_private to commercial_research_signature_service;
alter table partner_private.commercial_research_signature_receipts owner to commercial_research_signature_service;
grant select on partner_private.commercial_research_signature_receipts to billing_automation;
grant usage on schema partner_private,extensions to commercial_research_signature_service;
grant select on partner_private.commercial_research_signature_challenges to commercial_research_signature_service;
grant select,insert on partner_private.commercial_research_signature_receipts to commercial_research_signature_service;
create policy signature_service_challenge_read on partner_private.commercial_research_signature_challenges
  for select to commercial_research_signature_service using (true);
create policy signature_service_receipt_insert on partner_private.commercial_research_signature_receipts
  for insert to commercial_research_signature_service with check (true);
create policy signature_service_receipt_read on partner_private.commercial_research_signature_receipts
  for select to commercial_research_signature_service using (true);

revoke all on function
  partner_private.commercial_config_canonical_bytes(partner_private.photo_tier_commercial_configs),
  partner_private.commercial_config_is_complete(partner_private.photo_tier_commercial_configs),
  partner_private.guard_commercial_config_mutation(),
  partner_private.commercial_research_reviews_pass(uuid[]),
  partner_private.issue_commercial_research_signature_challenge(bigint,bytea,uuid,uuid[],timestamptz),
  partner_private.approve_photo_tier_commercial_config(bigint,uuid),
  partner_private.commercial_config_is_activation_candidate(bigint,bytea)
  from public,anon,authenticated,service_role;
revoke all on function
  app_public.billing_get_commercial_research_config(uuid),
  app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function app_private.current_session_is_active(),app_public.request_user_id() to billing_automation;
grant execute on function
  app_public.billing_get_commercial_research_config(uuid),
  app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text)
  to authenticated;

revoke create on schema partner_private, app_public from billing_automation;
revoke billing_automation from postgres;
revoke commercial_research_signature_service from postgres;
revoke create on schema partner_private from commercial_research_signature_service;
