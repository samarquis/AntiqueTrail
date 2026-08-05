-- Package 11 / RG-01: authoritative Topeka expansion evidence boundary.
-- All source ingestion and calculation functions are service-only. Application
-- clients can record only their own consent and can never supply a metric,
-- exclusion, store set, formula result, or decision.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='rg01_automation') then
    create role rg01_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='rg01_source_service') then
    create role rg01_source_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='rg01_calculation_service') then
    create role rg01_calculation_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='rg01_signature_service') then
    create role rg01_signature_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='rg01_lifecycle_service') then
    create role rg01_lifecycle_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='rg01_evidence_service') then
    create role rg01_evidence_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;

grant rg01_automation,identity_service,community_automation to postgres;
create schema rg01_private;
revoke all on schema rg01_private from public,anon,authenticated;
grant usage on schema rg01_private to rg01_automation,rg01_source_service,
  rg01_calculation_service,rg01_signature_service,rg01_lifecycle_service,identity_service,
  rg01_evidence_service,community_automation,community_evidence_service,release_executor;
grant create on schema rg01_private to rg01_automation;
grant create on schema app_public to identity_service;
grant create on schema community_private to community_automation;

create table rg01_private.rg01_capability (
  singleton_id smallint primary key default 1 check(singleton_id=1),
  collection_enabled boolean not null default false,
  release_id uuid references release_private.regional_releases(release_id) on delete restrict,
  changed_at timestamptz not null default statement_timestamp(),
  version bigint not null default 1 check(version>0),
  check((not collection_enabled) or release_id is not null)
);
insert into rg01_private.rg01_capability(singleton_id) values(1);

create table rg01_private.rg01_subject_consents (
  subject_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  receipt_label uuid not null default extensions.gen_random_uuid() unique,
  dedup_hmac bytea check(dedup_hmac is null or octet_length(dedup_hmac)=32),
  key_version text check(key_version is null or key_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  consented_at timestamptz,
  withdrawn_at timestamptz,
  age_18_verified boolean not null default false,
  nonprivileged_shopper boolean not null default false,
  exclusion_code text check(exclusion_code is null or exclusion_code in
    ('scott','internal_tester','ai_agent','synthetic_operator','representative_own_store','duplicate_human','consent_withdrawn','under_18','privileged_account','unverifiable')),
  linkage_purge_due_at timestamptz,
  linkage_purged_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check((withdrawn_at is null) or (consented_at is not null and withdrawn_at>=consented_at)),
  check((linkage_purged_at is null) or (user_id is null and dedup_hmac is null and key_version is null))
);

create table rg01_private.rg01_dedup_keys (
  key_version text primary key check(key_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  key_fingerprint bytea not null unique check(octet_length(key_fingerprint)=32),
  state text not null default 'active' check(state in ('active','destroyed')),
  created_at timestamptz not null default statement_timestamp(),
  destroyed_at timestamptz,
  check((state='active' and destroyed_at is null) or (state='destroyed' and destroyed_at is not null))
);
create unique index rg01_one_active_dedup_key on rg01_private.rg01_dedup_keys((true)) where state='active';

create table rg01_private.rg01_flyer_consents (
  store_id uuid primary key,
  representative_user_id uuid references auth.users(id) on delete set null,
  consented_at timestamptz not null,
  withdrawn_at timestamptz,
  source_receipt_digest bytea not null check(octet_length(source_receipt_digest)=32),
  check(withdrawn_at is null or withdrawn_at>=consented_at)
);

create table rg01_private.rg01_source_facts (
  fact_id uuid primary key default extensions.gen_random_uuid(),
  fact_kind text not null check(fact_kind in ('trip_completion','listing','defect','support_case','claim_attempt')),
  authoritative_source_id uuid not null,
  source_version bigint not null check(source_version>0),
  source_digest bytea not null check(octet_length(source_digest)=32),
  subject_id uuid references rg01_private.rg01_subject_consents(subject_id) on delete restrict,
  store_id uuid,
  occurred_at timestamptz not null,
  area_key text not null default 'topeka-ks' check(area_key='topeka-ks'),
  calendar_date date,
  count_a integer,
  count_b integer,
  flag boolean,
  code text,
  recorded_at timestamptz not null default statement_timestamp(),
  unique(fact_kind,authoritative_source_id,source_version),
  check(count_a is null or count_a>=0), check(count_b is null or count_b>=0),
  constraint rg01_fact_shape check(
    (fact_kind='trip_completion' and subject_id is not null and store_id is null and calendar_date is not null and count_a is not null and count_b is not null and flag is null and code is null)
    or (fact_kind='listing' and subject_id is null and store_id is not null and calendar_date is null and count_a is null and count_b is null and flag is not null and code='active_discoverable')
    or (fact_kind='defect' and subject_id is null and store_id is null and calendar_date is null and count_a is null and count_b is null and flag is not null and code in ('blocking','privacy','security','data_loss'))
    or (fact_kind='support_case' and subject_id is null and store_id is null and calendar_date is null and count_a is null and count_b is null and flag is null and code is null)
    or (fact_kind='claim_attempt' and subject_id is null and store_id is not null and calendar_date is null and count_a is null and count_b is null and flag is null and code in ('approved','rejected','abusive'))
  )
);

create table rg01_private.rg01_product_owner_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  source_receipt_id uuid not null,
  state text not null default 'active' check(state in ('active','revoked')),
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  version bigint not null default 1,
  check((state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null))
);
create unique index rg01_one_active_product_owner on rg01_private.rg01_product_owner_grants(user_id) where state='active';

create table rg01_private.rg01_runs (
  run_id uuid primary key default extensions.gen_random_uuid(),
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  window_start timestamptz not null,
  window_end timestamptz not null,
  source_cutoff timestamptz,
  state text not null default 'collecting' check(state in ('collecting','frozen','signed','rejected')),
  manifest_digest bytea unique check(manifest_digest is null or octet_length(manifest_digest)=32),
  source_head_digest bytea check(source_head_digest is null or octet_length(source_head_digest)=32),
  blockers text[],
  supersedes_receipt_id uuid,
  receipt_id uuid unique,
  created_at timestamptz not null default statement_timestamp(),
  frozen_at timestamptz,
  disposed_at timestamptz,
  check(window_end>window_start and window_end-window_start<=interval '180 days'),
  check((state='collecting' and manifest_digest is null and blockers is null and receipt_id is null)
    or (state='frozen' and manifest_digest is not null and blockers is not null and receipt_id is null)
    or (state in ('signed','rejected') and manifest_digest is not null and blockers is not null and receipt_id is not null and disposed_at is not null))
);
create unique index rg01_one_live_calculation on rg01_private.rg01_runs((true)) where state in ('collecting','frozen');

create table rg01_private.rg01_run_subjects (
  run_id uuid not null references rg01_private.rg01_runs(run_id) on delete restrict,
  receipt_label uuid not null default extensions.gen_random_uuid(),
  subject_id uuid references rg01_private.rg01_subject_consents(subject_id) on delete set null,
  dedup_hmac bytea check(dedup_hmac is null or octet_length(dedup_hmac)=32),
  key_version text,
  eligible boolean not null,
  exclusion_code text,
  first_trip_counted boolean not null default false,
  second_trip_counted boolean not null default false,
  linkage_purged_at timestamptz,
  primary key(run_id,receipt_label),
  unique(run_id,subject_id),
  check((eligible and exclusion_code is null) or (not eligible and exclusion_code is not null)),
  check(not second_trip_counted or first_trip_counted),
  check((linkage_purged_at is null) or (subject_id is null and dedup_hmac is null and key_version is null))
);

create table rg01_private.rg01_metrics (
  run_id uuid not null references rg01_private.rg01_runs(run_id) on delete restrict,
  metric_code text not null check(metric_code in ('first_trip_shoppers','second_trip_shoppers','active_listings','current_listings','flyer_locations','open_critical_defects','new_support_cases','qualifying_trips','claim_approved','claim_rejected','claim_abusive')),
  metric_value bigint not null check(metric_value>=0),
  formula_version text not null default 'rg01-v1',
  primary key(run_id,metric_code)
);
create table rg01_private.rg01_exclusions (
  run_id uuid not null references rg01_private.rg01_runs(run_id) on delete restrict,
  receipt_label uuid not null,
  exclusion_code text not null,
  source_digest bytea not null check(octet_length(source_digest)=32),
  primary key(run_id,receipt_label,exclusion_code)
);
create table rg01_private.rg01_manifests (
  run_id uuid primary key references rg01_private.rg01_runs(run_id) on delete restrict,
  source_cutoff timestamptz not null,
  source_fact_count bigint not null check(source_fact_count>=0),
  source_digest bytea not null check(octet_length(source_digest)=32),
  formula_digest bytea not null check(octet_length(formula_digest)=32),
  created_at timestamptz not null default statement_timestamp()
);

create table rg01_private.rg01_signing_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references rg01_private.rg01_runs(run_id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  frozen_digest bytea not null check(octet_length(frozen_digest)=32),
  decision text not null check(decision in ('pass','reject')),
  failed_codes text[] not null default '{}',
  nonce bytea not null default extensions.gen_random_bytes(32) check(octet_length(nonce)=32),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at>created_at and expires_at<=created_at+interval '30 minutes')
);
create unique index rg01_one_live_challenge on rg01_private.rg01_signing_challenges(run_id,signer_user_id) where consumed_at is null;

create table rg01_private.rg01_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references rg01_private.rg01_runs(run_id) on delete restrict,
  challenge_id uuid not null unique references rg01_private.rg01_signing_challenges(challenge_id) on delete restrict,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  responsibility text not null check(responsibility='ProductOwner'),
  decision text not null check(decision in ('pass','reject')),
  manifest_digest bytea not null check(octet_length(manifest_digest)=32),
  source_head_digest bytea not null check(octet_length(source_head_digest)=32),
  signed_payload_digest bytea not null check(octet_length(signed_payload_digest)=32),
  signature_digest bytea not null check(octet_length(signature_digest)=32),
  provider_key_id text not null check(provider_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  provider_verification_id text not null check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  failed_codes text[] not null default '{}',
  claim_approved bigint not null, claim_rejected bigint not null, claim_abusive bigint not null,
  signed_at timestamptz not null default statement_timestamp(),
  retain_until date not null default (current_date+1095),
  check(retain_until>=signed_at::date+1095),
  check((decision='pass' and cardinality(failed_codes)=0) or decision='reject')
);
alter table rg01_private.rg01_runs add constraint rg01_run_receipt_fk foreign key(receipt_id) references rg01_private.rg01_receipts(receipt_id) on delete restrict;
alter table rg01_private.rg01_runs add constraint rg01_run_supersedes_fk foreign key(supersedes_receipt_id) references rg01_private.rg01_receipts(receipt_id) on delete restrict;
create table rg01_private.rg01_receipt_supersessions (
  prior_receipt_id uuid primary key references rg01_private.rg01_receipts(receipt_id) on delete restrict,
  successor_receipt_id uuid not null unique references rg01_private.rg01_receipts(receipt_id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  check(prior_receipt_id<>successor_receipt_id)
);
create table rg01_private.rg01_purge_receipts (
  purge_receipt_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references rg01_private.rg01_runs(run_id) on delete restrict,
  purged_subject_count bigint not null check(purged_subject_count>=0),
  outcome_digest bytea not null check(octet_length(outcome_digest)=32),
  linkage_purged_at timestamptz not null,
  key_destroyed_at timestamptz not null,
  retain_until date not null default(current_date+1095),
  check(retain_until>=linkage_purged_at::date+1095)
);

create or replace function rg01_private.deny_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='42501',message='rg01_append_only'; end $$;
create trigger rg01_source_facts_immutable before update or delete on rg01_private.rg01_source_facts for each row execute function rg01_private.deny_mutation();
create trigger rg01_metrics_immutable before update or delete on rg01_private.rg01_metrics for each row execute function rg01_private.deny_mutation();
create trigger rg01_exclusions_immutable before update or delete on rg01_private.rg01_exclusions for each row execute function rg01_private.deny_mutation();
create trigger rg01_manifests_immutable before update or delete on rg01_private.rg01_manifests for each row execute function rg01_private.deny_mutation();
create trigger rg01_receipts_immutable before update or delete on rg01_private.rg01_receipts for each row execute function rg01_private.deny_mutation();
create trigger rg01_supersessions_immutable before update or delete on rg01_private.rg01_receipt_supersessions for each row execute function rg01_private.deny_mutation();
create trigger rg01_purge_receipts_immutable before update or delete on rg01_private.rg01_purge_receipts for each row execute function rg01_private.deny_mutation();

create or replace function rg01_private.guard_run_mutation() returns trigger language plpgsql set search_path='' as $$ begin
  if new.run_id<>old.run_id or new.release_id<>old.release_id or new.window_start<>old.window_start or new.window_end<>old.window_end
    or new.supersedes_receipt_id is distinct from old.supersedes_receipt_id or new.created_at<>old.created_at
    or (old.state='collecting' and (new.state<>'frozen' or new.source_cutoff is null or new.manifest_digest is null or new.source_head_digest is null or new.blockers is null or new.frozen_at is null or new.receipt_id is not null or new.disposed_at is not null))
    or (old.state='frozen' and (new.state not in ('signed','rejected') or new.source_cutoff<>old.source_cutoff or new.manifest_digest<>old.manifest_digest or new.source_head_digest<>old.source_head_digest or new.blockers<>old.blockers or new.frozen_at<>old.frozen_at or new.receipt_id is null or new.disposed_at is null))
    or old.state in ('signed','rejected') then raise exception using errcode='42501',message='rg01_run_transition_invalid'; end if; return new;
end $$;
create trigger rg01_run_guard before update on rg01_private.rg01_runs for each row execute function rg01_private.guard_run_mutation();
create trigger rg01_run_no_delete before delete on rg01_private.rg01_runs for each row execute function rg01_private.deny_mutation();

create or replace function rg01_private.guard_run_subject_mutation() returns trigger language plpgsql set search_path='' as $$ begin
  if new.run_id<>old.run_id or new.receipt_label<>old.receipt_label or new.eligible<>old.eligible or new.exclusion_code is distinct from old.exclusion_code
    or (old.linkage_purged_at is not null)
    or (new.linkage_purged_at is null and (new.subject_id is distinct from old.subject_id or new.dedup_hmac is distinct from old.dedup_hmac or new.key_version is distinct from old.key_version))
    or (old.first_trip_counted and not new.first_trip_counted) or (old.second_trip_counted and not new.second_trip_counted)
    or (new.linkage_purged_at is not null and (new.subject_id is not null or new.dedup_hmac is not null or new.key_version is not null))
    then raise exception using errcode='42501',message='rg01_run_subject_transition_invalid'; end if; return new;
end $$;
create trigger rg01_run_subject_guard before update on rg01_private.rg01_run_subjects for each row execute function rg01_private.guard_run_subject_mutation();
create trigger rg01_run_subject_no_delete before delete on rg01_private.rg01_run_subjects for each row execute function rg01_private.deny_mutation();

create or replace function rg01_private.guard_dedup_key_mutation() returns trigger language plpgsql set search_path='' as $$ begin
  if old.state<>'active' or new.state<>'destroyed' or new.key_version<>old.key_version or new.key_fingerprint<>old.key_fingerprint or new.created_at<>old.created_at or new.destroyed_at is null then
    raise exception using errcode='42501',message='rg01_dedup_key_transition_invalid'; end if; return new;
end $$;
create trigger rg01_dedup_key_guard before update on rg01_private.rg01_dedup_keys for each row execute function rg01_private.guard_dedup_key_mutation();
create trigger rg01_dedup_key_no_delete before delete on rg01_private.rg01_dedup_keys for each row execute function rg01_private.deny_mutation();

create or replace function rg01_private.release_is_active(p_release_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from release_private.regional_releases r join release_private.release_capabilities c using(release_id)
    where r.release_id=p_release_id and r.region_key='topeka-ks' and r.state='active'
      and r.signed_release_receipt is not null and c.public_catalog and c.public_claims
      and c.public_reviews and c.public_registration and c.product_promotion)
$$;

create or replace function rg01_private.source_head_digest() returns bytea
language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(jsonb_build_object(
    'facts',coalesce((select jsonb_agg(x order by kind,source_id,source_version) from (
      select fact_kind kind,authoritative_source_id source_id,source_version,encode(source_digest,'hex') digest from rg01_private.rg01_source_facts) x),'[]'),
    'subjects',coalesce((select jsonb_agg(x order by receipt_label) from (
      select receipt_label,consented_at,withdrawn_at,age_18_verified,nonprivileged_shopper,exclusion_code from rg01_private.rg01_subject_consents) x),'[]'),
    'flyers',coalesce((select jsonb_agg(x order by store_id) from (
      select store_id,consented_at,withdrawn_at,encode(source_receipt_digest,'hex') source_digest from rg01_private.rg01_flyer_consents) x),'[]')
  )::text,'utf8'),'sha256')
$$;

create or replace function rg01_private.set_collection_capability(p_enabled boolean,p_release_id uuid,p_expected_version bigint) returns bigint
language plpgsql security definer set search_path='' as $$ declare v bigint; begin
  if p_expected_version is null then raise exception using errcode='22023',message='rg01_capability_input_invalid'; end if;
  if p_enabled and (p_release_id is null or not rg01_private.release_is_active(p_release_id)) then
    raise exception using errcode='55000',message='rg01_release_not_active';
  end if;
  update rg01_private.rg01_capability set collection_enabled=p_enabled,release_id=case when p_enabled then p_release_id else null end,
    changed_at=statement_timestamp(),version=version+1 where singleton_id=1 and version=p_expected_version returning version into v;
  if v is null then raise exception using errcode='40001',message='rg01_capability_version_conflict'; end if; return v;
end $$;

create or replace function app_public.rg01_set_own_consent(p_consent boolean) returns void
language plpgsql security definer set search_path='' as $$ declare uid uuid:=auth.uid(); begin
  if uid is null or not app_private.current_user_has_role('shopper'::app_private.app_role,null) then raise exception using errcode='42501',message='rg01_shopper_required'; end if;
  if p_consent then
    insert into rg01_private.rg01_subject_consents as existing(user_id,consented_at,age_18_verified,nonprivileged_shopper)
      select uid,statement_timestamp(),p.age_18_attested_at is not null,
        not exists(select 1 from app_private.role_grants g where g.subject_user_id=uid and g.state='active' and g.role<>'shopper')
      from app_private.profiles p where p.user_id=uid
      on conflict(user_id) do update set consented_at=statement_timestamp(),withdrawn_at=null,
        exclusion_code=case when existing.exclusion_code='consent_withdrawn' then null else existing.exclusion_code end;
  else
    update rg01_private.rg01_subject_consents set withdrawn_at=statement_timestamp(),exclusion_code=coalesce(exclusion_code,'consent_withdrawn') where user_id=uid;
  end if;
end $$;

create or replace function app_public.rg01_set_flyer_consent(p_store_id uuid,p_consent boolean,p_source_receipt_digest bytea) returns void
language plpgsql security definer set search_path='' as $$ declare uid uuid:=auth.uid(); begin
  if uid is null or p_store_id is null or octet_length(p_source_receipt_digest)<>32
    or not app_private.current_user_has_role('representative'::app_private.app_role,p_store_id) then raise exception using errcode='42501',message='rg01_representative_store_required'; end if;
  if p_consent then insert into rg01_private.rg01_flyer_consents(store_id,representative_user_id,consented_at,source_receipt_digest)
    values(p_store_id,uid,statement_timestamp(),p_source_receipt_digest)
    on conflict(store_id) do update set representative_user_id=uid,consented_at=statement_timestamp(),withdrawn_at=null,source_receipt_digest=p_source_receipt_digest;
  else update rg01_private.rg01_flyer_consents set withdrawn_at=statement_timestamp() where store_id=p_store_id and representative_user_id=uid;
  end if;
end $$;

create or replace function rg01_private.record_subject(p_user_id uuid,p_dedup_hmac bytea,p_key_version text,p_exclusion_code text default null) returns uuid
language plpgsql security definer set search_path='' as $$ declare sid uuid; declare p app_private.profiles%rowtype; begin
  if p_user_id is null or octet_length(p_dedup_hmac)<>32 or p_key_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or not exists(select 1 from rg01_private.rg01_dedup_keys where key_version=p_key_version and state='active') then raise exception using errcode='22023',message='rg01_subject_input_invalid'; end if;
  select * into p from app_private.profiles where user_id=p_user_id;
  insert into rg01_private.rg01_subject_consents(user_id,dedup_hmac,key_version,consented_at,age_18_verified,nonprivileged_shopper,exclusion_code)
    values(p_user_id,p_dedup_hmac,p_key_version,coalesce((select consented_at from rg01_private.rg01_subject_consents where user_id=p_user_id),statement_timestamp()),
      p.age_18_attested_at is not null,not exists(select 1 from app_private.role_grants g where g.subject_user_id=p_user_id and g.state='active' and g.role<>'shopper'),
      case when p_exclusion_code is null and exists(select 1 from rg01_private.rg01_subject_consents s where s.dedup_hmac=p_dedup_hmac and s.user_id<>p_user_id) then 'duplicate_human' else p_exclusion_code end)
    on conflict(user_id) do update set dedup_hmac=p_dedup_hmac,key_version=p_key_version,age_18_verified=excluded.age_18_verified,nonprivileged_shopper=excluded.nonprivileged_shopper,exclusion_code=excluded.exclusion_code
    returning subject_id into sid; return sid;
end $$;

create or replace function rg01_private.register_dedup_key(p_key_version text,p_key_fingerprint bytea) returns void
language plpgsql security definer set search_path='' as $$ begin
  if p_key_version !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or octet_length(p_key_fingerprint)<>32 then raise exception using errcode='22023',message='rg01_dedup_key_invalid'; end if;
  insert into rg01_private.rg01_dedup_keys(key_version,key_fingerprint) values(p_key_version,p_key_fingerprint);
end $$;

create or replace function rg01_private.record_source_fact(p_fact_kind text,p_source_id uuid,p_source_version bigint,p_source_digest bytea,p_subject_id uuid,p_store_id uuid,p_occurred_at timestamptz,p_calendar_date date,p_count_a integer,p_count_b integer,p_flag boolean,p_code text) returns uuid
language plpgsql security definer set search_path='' as $$ declare fid uuid; begin
  if not (select collection_enabled and rg01_private.release_is_active(release_id) from rg01_private.rg01_capability where singleton_id=1) then raise exception using errcode='55000',message='rg01_collection_disabled'; end if;
  insert into rg01_private.rg01_source_facts(fact_kind,authoritative_source_id,source_version,source_digest,subject_id,store_id,occurred_at,calendar_date,count_a,count_b,flag,code)
    values(p_fact_kind,p_source_id,p_source_version,p_source_digest,p_subject_id,p_store_id,p_occurred_at,p_calendar_date,p_count_a,p_count_b,p_flag,p_code) returning fact_id into fid; return fid;
end $$;

create or replace function rg01_private.begin_run(p_run_id uuid,p_window_start timestamptz,p_window_end timestamptz,p_supersedes_receipt_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$ declare cap rg01_private.rg01_capability%rowtype; begin
  select * into cap from rg01_private.rg01_capability where singleton_id=1 for update;
  if not cap.collection_enabled or not rg01_private.release_is_active(cap.release_id) then raise exception using errcode='55000',message='rg01_collection_disabled'; end if;
  if p_window_end<=p_window_start or p_window_end-p_window_start>interval '180 days' or p_window_end>statement_timestamp() then raise exception using errcode='22023',message='rg01_window_invalid'; end if;
  if exists(select 1 from rg01_private.rg01_receipts r where not exists(select 1 from rg01_private.rg01_receipt_supersessions s where s.prior_receipt_id=r.receipt_id)) and
    (p_supersedes_receipt_id is null or not exists(select 1 from rg01_private.rg01_receipts r where r.receipt_id=p_supersedes_receipt_id and not exists(select 1 from rg01_private.rg01_receipt_supersessions s where s.prior_receipt_id=r.receipt_id))) then
    raise exception using errcode='55000',message='rg01_current_receipt_must_be_superseded'; end if;
  if p_supersedes_receipt_id is not null and not exists(select 1 from rg01_private.rg01_purge_receipts p join rg01_private.rg01_receipts x on x.run_id=p.run_id where x.receipt_id=p_supersedes_receipt_id) then
    raise exception using errcode='55000',message='rg01_prior_linkage_purge_required'; end if;
  insert into rg01_private.rg01_runs(run_id,release_id,window_start,window_end,supersedes_receipt_id) values(p_run_id,cap.release_id,p_window_start,p_window_end,p_supersedes_receipt_id); return p_run_id;
end $$;

create or replace function rg01_private.calculate_blockers(p_first bigint,p_second bigint,p_active bigint,p_current bigint,p_flyers bigint,p_defects bigint,p_support bigint,p_trips bigint) returns text[]
language plpgsql immutable set search_path='' as $$ declare b text[]:=array[]::text[]; begin
  if p_first<25 then b:=array_append(b,'first_trip_denominator_below_25'); end if;
  if p_second<10 then b:=array_append(b,'second_trip_shoppers_below_10'); end if;
  if p_active=0 or p_current<>p_active then b:=array_append(b,'listing_freshness_not_100_percent'); end if;
  if p_flyers<3 then b:=array_append(b,'flyer_locations_below_3'); end if;
  if p_defects<>0 then b:=array_append(b,'open_critical_defects'); end if;
  if 10*p_support>10*p_active+p_trips then b:=array_append(b,'support_load_exceeded'); end if;
  return b;
end $$;

create or replace function rg01_private.freeze_run(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r rg01_private.rg01_runs%rowtype; cutoff timestamptz:=statement_timestamp(); md bytea; hd bytea; b text[]:=array[]::text[];
declare first_count bigint; second_count bigint; active_count bigint; current_count bigint; flyer_count bigint; defect_count bigint; support_count bigint; trip_count bigint; ca bigint; cr bigint; cab bigint;
begin
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state<>'collecting' then raise exception using errcode='55000',message='rg01_run_not_collecting'; end if;
  if not rg01_private.release_is_active(r.release_id) then raise exception using errcode='55000',message='rg01_release_not_active'; end if;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc)
  insert into rg01_private.rg01_run_subjects(run_id,subject_id,dedup_hmac,key_version,eligible,exclusion_code)
    select p_run_id,s.subject_id,s.dedup_hmac,s.key_version,
      s.consented_at is not null and s.consented_at<=cutoff and (s.withdrawn_at is null or s.withdrawn_at>cutoff) and s.age_18_verified and s.nonprivileged_shopper and s.exclusion_code is null and s.dedup_hmac is not null,
      case when s.exclusion_code is not null then s.exclusion_code when s.consented_at is null or s.withdrawn_at<=cutoff then 'consent_withdrawn' when not s.age_18_verified then 'under_18' when not s.nonprivileged_shopper then 'privileged_account' when s.dedup_hmac is null then 'unverifiable' else null end
    from rg01_private.rg01_subject_consents s where exists(select 1 from current_facts f where f.fact_kind='trip_completion' and f.subject_id=s.subject_id and f.occurred_at>=r.window_start and f.occurred_at<r.window_end);
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc),
  q as (select f.*,row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) rn,
      lag(f.calendar_date) over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) prior_date
    from current_facts f join rg01_private.rg01_run_subjects s on s.run_id=p_run_id and s.subject_id=f.subject_id
    where f.fact_kind='trip_completion' and f.occurred_at>=r.window_start and f.occurred_at<r.window_end
      and f.calendar_date=(f.occurred_at at time zone 'America/Chicago')::date and f.count_a>=2 and f.count_b>=2
      and s.eligible and s.dedup_hmac is not null)
  select count(*) filter(where rn=1),count(*) filter(where rn=2 and calendar_date>prior_date),count(*) into first_count,second_count,trip_count from q where rn<=2;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc),
  q as (select f.subject_id,f.calendar_date,row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) rn,lag(f.calendar_date) over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) prior_date
    from current_facts f join rg01_private.rg01_run_subjects s on s.run_id=p_run_id and s.subject_id=f.subject_id where f.fact_kind='trip_completion' and f.occurred_at>=r.window_start and f.occurred_at<r.window_end and f.calendar_date=(f.occurred_at at time zone 'America/Chicago')::date and f.count_a>=2 and f.count_b>=2 and s.eligible)
  update rg01_private.rg01_run_subjects rs set first_trip_counted=x.first_ok,second_trip_counted=x.second_ok from (select subject_id,bool_or(rn=1) first_ok,bool_or(rn=2 and calendar_date>prior_date) second_ok from q where rn<=2 group by subject_id) x where rs.run_id=p_run_id and rs.subject_id=x.subject_id;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc)
  select count(*),count(*) filter(where flag) into active_count,current_count from current_facts where fact_kind='listing' and occurred_at<r.window_end;
  with current_listings as (select distinct on(authoritative_source_id) store_id from rg01_private.rg01_source_facts where fact_kind='listing' and recorded_at<=cutoff and occurred_at<r.window_end and code='active_discoverable' order by authoritative_source_id,source_version desc)
  select count(*) into flyer_count from rg01_private.rg01_flyer_consents f where f.consented_at<=cutoff and (f.withdrawn_at is null or f.withdrawn_at>cutoff) and exists(select 1 from current_listings l where l.store_id=f.store_id);
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc)
  select count(*) into defect_count from current_facts where fact_kind='defect' and occurred_at<r.window_end and flag;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc)
  select count(*) into support_count from current_facts where fact_kind='support_case' and occurred_at>=r.window_start and occurred_at<r.window_end;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff order by fact_kind,authoritative_source_id,source_version desc)
  select count(*) filter(where code='approved'),count(*) filter(where code='rejected'),count(*) filter(where code='abusive') into ca,cr,cab from current_facts where fact_kind='claim_attempt' and occurred_at>=r.window_start and occurred_at<r.window_end;
  b:=rg01_private.calculate_blockers(first_count,second_count,active_count,current_count,flyer_count,defect_count,support_count,trip_count);
  hd:=rg01_private.source_head_digest();
  md:=extensions.digest(convert_to(concat_ws('|',r.release_id,r.window_start,r.window_end,encode(hd,'hex'),first_count,second_count,active_count,current_count,flyer_count,defect_count,support_count,trip_count,ca,cr,cab,array_to_string(b,','),'rg01-v1'),'utf8'),'sha256');
  insert into rg01_private.rg01_metrics(run_id,metric_code,metric_value) values
    (p_run_id,'first_trip_shoppers',first_count),(p_run_id,'second_trip_shoppers',second_count),(p_run_id,'active_listings',active_count),(p_run_id,'current_listings',current_count),(p_run_id,'flyer_locations',flyer_count),(p_run_id,'open_critical_defects',defect_count),(p_run_id,'new_support_cases',support_count),(p_run_id,'qualifying_trips',trip_count),(p_run_id,'claim_approved',ca),(p_run_id,'claim_rejected',cr),(p_run_id,'claim_abusive',cab);
  insert into rg01_private.rg01_exclusions(run_id,receipt_label,exclusion_code,source_digest)
    select p_run_id,s.receipt_label,s.exclusion_code,extensions.digest(convert_to(s.receipt_label::text||'|'||s.exclusion_code,'utf8'),'sha256') from rg01_private.rg01_run_subjects s where s.run_id=p_run_id and not s.eligible;
  insert into rg01_private.rg01_manifests(run_id,source_cutoff,source_fact_count,source_digest,formula_digest)
    values(p_run_id,cutoff,(select count(*) from rg01_private.rg01_source_facts where recorded_at<=cutoff),hd,extensions.digest(convert_to('rg01-v1','utf8'),'sha256'));
  update rg01_private.rg01_runs set state='frozen',source_cutoff=cutoff,manifest_digest=md,source_head_digest=hd,blockers=b,frozen_at=cutoff where run_id=p_run_id;
  return jsonb_build_object('runId',p_run_id,'manifestDigest',encode(md,'hex'),'blockers',b,'claimReport',jsonb_build_object('approved',ca,'rejected',cr,'abusive',cab));
end $$;

create or replace function app_public.rg01_request_decision_challenge(p_run_id uuid,p_decision text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare r rg01_private.rg01_runs%rowtype; c rg01_private.rg01_signing_challenges%rowtype; uid uuid:=auth.uid(); exp timestamptz:=statement_timestamp()+interval '30 minutes'; n bytea:=extensions.gen_random_bytes(32); begin
  if uid is null or p_decision not in ('pass','reject') or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or not exists(select 1 from rg01_private.rg01_product_owner_grants where user_id=uid and state='active') then raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state<>'frozen' or r.source_head_digest<>rg01_private.source_head_digest() or (p_decision='pass' and cardinality(r.blockers)>0) then raise exception using errcode='55000',message='rg01_decision_blocked'; end if;
  insert into rg01_private.rg01_signing_challenges(run_id,signer_user_id,frozen_digest,decision,failed_codes,nonce,payload_digest,expires_at)
    values(p_run_id,uid,r.manifest_digest,p_decision,r.blockers,n,extensions.digest(convert_to(concat_ws('|',p_run_id,encode(r.manifest_digest,'hex'),uid,p_decision,array_to_string(r.blockers,','),encode(n,'hex'),exp),'utf8'),'sha256'),exp) returning * into c;
  return jsonb_build_object('challengeId',c.challenge_id,'payloadDigest',encode(c.payload_digest,'hex'),'expiresAt',c.expires_at);
end $$;

create or replace function rg01_private.consume_decision_challenge(p_challenge_id uuid,p_payload_digest bytea,p_signature_digest bytea,p_provider_key_id text,p_provider_verification_id text) returns uuid
language plpgsql security definer set search_path='' as $$ declare c rg01_private.rg01_signing_challenges%rowtype; r rg01_private.rg01_runs%rowtype; rid uuid; ca bigint;cr bigint;cab bigint; begin
  select * into c from rg01_private.rg01_signing_challenges where challenge_id=p_challenge_id for update;
  if not found or c.consumed_at is not null or c.expires_at<=statement_timestamp() or c.payload_digest is distinct from p_payload_digest or octet_length(p_signature_digest)<>32 then raise exception using errcode='22023',message='rg01_challenge_invalid_or_consumed'; end if;
  if p_provider_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then raise exception using errcode='22023',message='rg01_signature_verification_invalid'; end if;
  if not exists(select 1 from rg01_private.rg01_product_owner_grants where user_id=c.signer_user_id and state='active') then raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  select * into r from rg01_private.rg01_runs where run_id=c.run_id for update;
  if r.state<>'frozen' or r.manifest_digest<>c.frozen_digest or r.source_head_digest<>rg01_private.source_head_digest() or (c.decision='pass' and cardinality(r.blockers)>0) then raise exception using errcode='55000',message='rg01_decision_blocked'; end if;
  select metric_value into ca from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_approved'; select metric_value into cr from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_rejected'; select metric_value into cab from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_abusive';
  update rg01_private.rg01_signing_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  insert into rg01_private.rg01_receipts(run_id,challenge_id,release_id,signer_user_id,responsibility,decision,manifest_digest,source_head_digest,signed_payload_digest,signature_digest,provider_key_id,provider_verification_id,failed_codes,claim_approved,claim_rejected,claim_abusive)
    values(r.run_id,c.challenge_id,r.release_id,c.signer_user_id,'ProductOwner',c.decision,r.manifest_digest,r.source_head_digest,p_payload_digest,p_signature_digest,p_provider_key_id,p_provider_verification_id,c.failed_codes,ca,cr,cab) returning receipt_id into rid;
  if r.supersedes_receipt_id is not null then insert into rg01_private.rg01_receipt_supersessions values(r.supersedes_receipt_id,rid,statement_timestamp()); end if;
  update rg01_private.rg01_runs set state=case when c.decision='pass' then 'signed' else 'rejected' end,receipt_id=rid,disposed_at=statement_timestamp() where run_id=r.run_id;
  update rg01_private.rg01_subject_consents set linkage_purge_due_at=least(coalesce(linkage_purge_due_at,'infinity'),statement_timestamp()+interval '30 days') where user_id is not null or dedup_hmac is not null;
  return rid;
end $$;

create or replace function rg01_private.purge_run_linkage(p_run_id uuid,p_destroyed_key_version text,p_outcome_digest bytea) returns uuid
language plpgsql security definer set search_path='' as $$ declare r rg01_private.rg01_runs%rowtype; cnt bigint; prid uuid; nowts timestamptz:=statement_timestamp(); sids uuid[]; begin
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state not in ('signed','rejected') or octet_length(p_outcome_digest)<>32 or nullif(p_destroyed_key_version,'') is null then raise exception using errcode='55000',message='rg01_linkage_purge_invalid'; end if;
  update rg01_private.rg01_dedup_keys set state='destroyed',destroyed_at=nowts where key_version=p_destroyed_key_version and state='active';
  if not found then raise exception using errcode='55000',message='rg01_dedup_key_not_active'; end if;
  select array_agg(subject_id) into sids from rg01_private.rg01_run_subjects where run_id=p_run_id and linkage_purged_at is null and subject_id is not null;
  with u as (update rg01_private.rg01_run_subjects set subject_id=null,dedup_hmac=null,key_version=null,linkage_purged_at=nowts where run_id=p_run_id and linkage_purged_at is null returning 1) select count(*) into cnt from u;
  update rg01_private.rg01_subject_consents s set user_id=null,dedup_hmac=null,key_version=null,linkage_purged_at=nowts
    where s.subject_id=any(coalesce(sids,array[]::uuid[])) and not exists(select 1 from rg01_private.rg01_run_subjects rs where rs.subject_id=s.subject_id and rs.linkage_purged_at is null);
  insert into rg01_private.rg01_purge_receipts(run_id,purged_subject_count,outcome_digest,linkage_purged_at,key_destroyed_at) values(p_run_id,cnt,p_outcome_digest,nowts,nowts) returning purge_receipt_id into prid; return prid;
end $$;

create or replace function rg01_private.receipt_is_current_pass(p_receipt_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from rg01_private.rg01_receipts r
    where r.receipt_id=p_receipt_id and r.decision='pass' and r.responsibility='ProductOwner'
      and r.source_head_digest=rg01_private.source_head_digest() and rg01_private.release_is_active(r.release_id)
      and not exists(select 1 from rg01_private.rg01_receipt_supersessions s where s.prior_receipt_id=r.receipt_id))
$$;

-- Replace Package 12's legacy, self-attested RG-01 predicate with an exact link
-- to a current authoritative Package 11 PASS receipt.
alter table community_private.community_evidence_receipts add column rg01_authoritative_receipt_id uuid references rg01_private.rg01_receipts(receipt_id) on delete restrict;
create or replace function community_private.guard_authoritative_rg01() returns trigger language plpgsql set search_path='' as $$ begin
  -- The database owner remains an explicit migration/test escape hatch. Neither
  -- evidence ingestion nor the Package 12 command service has this authority.
  if current_user='postgres' then return new; end if;
  if new.receipt_kind='rg01_pass' and (new.rg01_authoritative_receipt_id is null or not rg01_private.receipt_is_current_pass(new.rg01_authoritative_receipt_id)) then raise exception using errcode='42501',message='community_rg01_authoritative_receipt_required'; end if; return new;
end $$;
create trigger community_authoritative_rg01_insert before insert or update on community_private.community_evidence_receipts for each row execute function community_private.guard_authoritative_rg01();

create or replace function community_private.require_current_rg01(p_community_receipt_id uuid) returns void
language plpgsql stable security definer set search_path='' as $$ declare aid uuid; begin
  select rg01_authoritative_receipt_id into aid from community_private.community_evidence_receipts where receipt_id=p_community_receipt_id and receipt_kind='rg01_pass' and responsibility='ProductOwner' and decision='pass' and external_verified;
  if aid is null or not rg01_private.receipt_is_current_pass(aid) then raise exception using errcode='42501',message='community_rg01_evidence_invalid'; end if;
end $$;

create or replace function community_private.enforce_run_current_rg01() returns trigger language plpgsql set search_path='' as $$ begin
  if current_user='postgres' then return new; end if;
  if new.target_ordinal=1 then perform community_private.require_current_rg01(new.rg01_receipt_id); end if; return new;
end $$;
create trigger community_run_current_rg01 before insert or update on community_private.community_activation_runs for each row execute function community_private.enforce_run_current_rg01();

do $$ declare t text; begin foreach t in array array['rg01_capability','rg01_subject_consents','rg01_dedup_keys','rg01_flyer_consents','rg01_source_facts','rg01_product_owner_grants','rg01_runs','rg01_run_subjects','rg01_metrics','rg01_exclusions','rg01_manifests','rg01_signing_challenges','rg01_receipts','rg01_receipt_supersessions','rg01_purge_receipts'] loop
  execute format('alter table rg01_private.%I enable row level security',t); execute format('alter table rg01_private.%I force row level security',t); execute format('revoke all on rg01_private.%I from public,anon,authenticated',t); execute format('grant select,insert,update,delete on rg01_private.%I to rg01_automation',t); execute format('create policy %I on rg01_private.%I for all to rg01_automation using(true) with check(true)','rg01_automation_'||t,t);
end loop; end $$;
grant select,insert,update on rg01_private.rg01_subject_consents,rg01_private.rg01_flyer_consents to identity_service;
grant select on rg01_private.rg01_runs,rg01_private.rg01_product_owner_grants to identity_service;
grant select,insert,update on rg01_private.rg01_signing_challenges to identity_service;
create policy rg01_identity_subject on rg01_private.rg01_subject_consents for all to identity_service using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy rg01_identity_flyer on rg01_private.rg01_flyer_consents for all to identity_service using(representative_user_id=auth.uid()) with check(representative_user_id=auth.uid());
create policy rg01_identity_runs_read on rg01_private.rg01_runs for select to identity_service using(true);
create policy rg01_identity_owner_grant_read on rg01_private.rg01_product_owner_grants for select to identity_service using(user_id=auth.uid());
create policy rg01_identity_challenges on rg01_private.rg01_signing_challenges for all to identity_service using(signer_user_id=auth.uid()) with check(signer_user_id=auth.uid());
grant select,insert,update on rg01_private.rg01_product_owner_grants to rg01_evidence_service;
create policy rg01_evidence_owner_grants on rg01_private.rg01_product_owner_grants for all to rg01_evidence_service using(true) with check(true);

alter function rg01_private.deny_mutation() owner to rg01_automation; alter function rg01_private.guard_run_mutation() owner to rg01_automation; alter function rg01_private.guard_run_subject_mutation() owner to rg01_automation; alter function rg01_private.guard_dedup_key_mutation() owner to rg01_automation; alter function rg01_private.release_is_active(uuid) owner to rg01_automation; alter function rg01_private.source_head_digest() owner to rg01_automation;
alter function rg01_private.set_collection_capability(boolean,uuid,bigint) owner to rg01_automation; alter function rg01_private.register_dedup_key(text,bytea) owner to rg01_automation; alter function rg01_private.record_subject(uuid,bytea,text,text) owner to rg01_automation; alter function rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text) owner to rg01_automation;
alter function rg01_private.begin_run(uuid,timestamptz,timestamptz,uuid) owner to rg01_automation; alter function rg01_private.calculate_blockers(bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint) owner to rg01_automation; alter function rg01_private.freeze_run(uuid) owner to rg01_automation; alter function rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text) owner to rg01_automation; alter function rg01_private.purge_run_linkage(uuid,text,bytea) owner to rg01_automation; alter function rg01_private.receipt_is_current_pass(uuid) owner to rg01_automation;
alter function app_public.rg01_set_own_consent(boolean) owner to identity_service; alter function app_public.rg01_set_flyer_consent(uuid,boolean,bytea) owner to identity_service; alter function app_public.rg01_request_decision_challenge(uuid,text) owner to identity_service;
alter function community_private.guard_authoritative_rg01() owner to community_automation; alter function community_private.require_current_rg01(uuid) owner to community_automation; alter function community_private.enforce_run_current_rg01() owner to community_automation;

revoke all on all functions in schema rg01_private from public,anon,authenticated;
revoke all on function app_public.rg01_set_own_consent(boolean),app_public.rg01_set_flyer_consent(uuid,boolean,bytea),app_public.rg01_request_decision_challenge(uuid,text) from public,anon;
grant execute on function app_public.rg01_set_own_consent(boolean),app_public.rg01_set_flyer_consent(uuid,boolean,bytea),app_public.rg01_request_decision_challenge(uuid,text) to authenticated;
grant execute on function rg01_private.set_collection_capability(boolean,uuid,bigint) to release_executor;
grant execute on function rg01_private.register_dedup_key(text,bytea),rg01_private.record_subject(uuid,bytea,text,text),rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text) to rg01_source_service;
grant execute on function rg01_private.begin_run(uuid,timestamptz,timestamptz,uuid),rg01_private.freeze_run(uuid) to rg01_calculation_service;
grant execute on function rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text) to rg01_signature_service;
grant execute on function rg01_private.purge_run_linkage(uuid,text,bytea) to rg01_lifecycle_service;
grant execute on function rg01_private.receipt_is_current_pass(uuid) to community_automation,community_evidence_service;

revoke create on schema rg01_private from rg01_automation; revoke create on schema app_public from identity_service; revoke create on schema community_private from community_automation;
revoke rg01_automation,identity_service,community_automation from postgres;
