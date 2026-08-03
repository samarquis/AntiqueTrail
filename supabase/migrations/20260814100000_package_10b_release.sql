-- Package 10B durable release boundary: roles and frozen evidence tables.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='release_executor') then create role release_executor nologin noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='release_automation') then create role release_automation nologin noinherit nosuperuser nobypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='release_evidence_service') then create role release_evidence_service nologin noinherit nosuperuser nobypassrls; end if;
end $$;
grant release_automation to postgres;
create schema if not exists release_private;
revoke all on schema release_private from public,anon,authenticated;
grant usage on schema release_private to release_executor,release_automation,release_evidence_service;

create table release_private.regional_releases (
  release_id uuid primary key default extensions.gen_random_uuid(),
  region_key text not null check (region_key='topeka-ks'),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  catalog_digest text not null check (catalog_digest ~ '^sha256:[0-9a-f]{64}$'),
  prerequisite_receipt_digest text not null check (prerequisite_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  state text not null default 'frozen' check (state in ('frozen','active','rolled_back')),
  step_ordinal smallint not null default 0 check (step_ordinal between 0 and 9),
  signed_release_receipt text,rollback_reason text,
  created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp(),
  unique(region_key,artifact_digest,catalog_digest)
);
create unique index one_live_regional_release on release_private.regional_releases(region_key) where state in ('frozen','active');
create table release_private.release_commands (
  command_id uuid primary key,release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  step text not null check (step in ('freeze','promote','rollback')),artifact_digest text not null,catalog_digest text not null,
  result_state text not null,created_at timestamptz not null default statement_timestamp()
);
create table release_private.release_evidence_receipts (
  receipt_id uuid primary key,release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  step text not null check (step in ('recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','smoke','monitoring','signed_release_receipt')),
  artifact_digest text not null,catalog_digest text not null,prerequisite_receipt_digest text not null,
  payload_digest bytea not null check (octet_length(payload_digest)=32),external_verified boolean not null check (external_verified),
  created_at timestamptz not null default statement_timestamp(),unique(release_id,step)
);
