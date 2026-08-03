-- Package 10B durable release boundary. Only the non-login deployment executor
-- may advance the exact frozen artifact/catalog through the ordered checklist.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='release_executor') then
    create role release_executor nologin noinherit;
  end if;
end $$;

create schema if not exists release_private;
revoke all on schema release_private from public,anon,authenticated;
grant usage on schema release_private to release_executor;

create table release_private.regional_releases (
  release_id uuid primary key default extensions.gen_random_uuid(),
  region_key text not null check (region_key='topeka-ks'),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  catalog_digest text not null check (catalog_digest ~ '^sha256:[0-9a-f]{64}$'),
  prerequisite_receipt_digest text not null check (prerequisite_receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  state text not null default 'frozen' check (state in ('frozen','deploying','active','rolled_back')),
  step_ordinal smallint not null default 0 check (step_ordinal between 0 and 9),
  signed_release_receipt text,
  rollback_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(region_key,artifact_digest,catalog_digest)
);
create unique index one_live_regional_release
  on release_private.regional_releases(region_key)
  where state in ('frozen','deploying','active');

create table release_private.release_commands (
  command_id uuid primary key,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  step text not null check (step in ('freeze','recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','capability_enablement','smoke','monitoring','signed_release_receipt','rollback')),
  artifact_digest text not null,
  catalog_digest text not null,
  result_state text not null,
  created_at timestamptz not null default statement_timestamp()
);

create table release_private.release_capabilities (
  release_id uuid primary key references release_private.regional_releases(release_id) on delete restrict,
  public_catalog boolean not null default false,
  public_claims boolean not null default false,
  public_reviews boolean not null default false,
  public_registration boolean not null default false,
  product_promotion boolean not null default false,
  updated_at timestamptz not null default statement_timestamp(),
  constraint release_capabilities_atomic check (
    (public_catalog and public_claims and public_reviews and public_registration and product_promotion)
    or (not public_catalog and not public_claims and not public_reviews and not public_registration and not product_promotion)
  )
);

alter table release_private.regional_releases enable row level security;
alter table release_private.regional_releases force row level security;
alter table release_private.release_commands enable row level security;
alter table release_private.release_commands force row level security;
alter table release_private.release_capabilities enable row level security;
alter table release_private.release_capabilities force row level security;
revoke all on all tables in schema release_private from public,anon,authenticated,release_executor;

create or replace function release_private.reject_release_evidence_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'release_evidence_append_only'; end; $$;
create trigger release_commands_append_only before update or delete on release_private.release_commands
for each row execute function release_private.reject_release_evidence_mutation();

create or replace function release_private.freeze_regional_release(
  p_command_id uuid,p_artifact_digest text,p_catalog_digest text,p_prerequisite_receipt_digest text
) returns uuid
language plpgsql security definer
set search_path=''
as $$
declare v_release_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  if exists(
    select 1 from release_private.release_commands c
    join release_private.regional_releases r using(release_id)
    where c.command_id=p_command_id and (
      c.step<>'freeze' or c.artifact_digest<>p_artifact_digest
      or c.catalog_digest<>p_catalog_digest
      or r.prerequisite_receipt_digest<>p_prerequisite_receipt_digest
    )
  ) then raise exception 'release_idempotency_mismatch'; end if;
  select release_id into v_release_id from release_private.release_commands where command_id=p_command_id;
  if found then return v_release_id; end if;
  insert into release_private.regional_releases(region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest)
    values('topeka-ks',p_artifact_digest,p_catalog_digest,p_prerequisite_receipt_digest)
    returning release_id into v_release_id;
  insert into release_private.release_capabilities(release_id) values(v_release_id);
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state)
    values(p_command_id,v_release_id,'freeze',p_artifact_digest,p_catalog_digest,'frozen');
  return v_release_id;
end; $$;

create or replace function release_private.advance_regional_release(
  p_command_id uuid,p_release_id uuid,p_step text,p_signed_receipt text default null
) returns text
language plpgsql security definer
set search_path=''
as $$
declare
  v_release release_private.regional_releases%rowtype;
  v_command release_private.release_commands%rowtype;
  v_expected text[] := array['recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','capability_enablement','smoke','monitoring','signed_release_receipt'];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then
    if v_command.release_id<>p_release_id or v_command.step<>p_step then
      raise exception 'release_idempotency_mismatch';
    end if;
    return v_command.result_state;
  end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state not in ('frozen','deploying') then raise exception 'release_not_deployable'; end if;
  if p_step is distinct from v_expected[v_release.step_ordinal+1] then raise exception 'release_step_out_of_order'; end if;
  if p_step='signed_release_receipt' and nullif(btrim(p_signed_receipt),'') is null then raise exception 'release_receipt_required'; end if;

  if p_step='capability_enablement' then
    update release_private.release_capabilities set
      public_catalog=true,public_claims=true,public_reviews=true,public_registration=true,product_promotion=true,
      updated_at=statement_timestamp() where release_id=p_release_id;
  end if;
  update release_private.regional_releases set
    step_ordinal=step_ordinal+1,
    state=case when p_step='signed_release_receipt' then 'active' else 'deploying' end,
    signed_release_receipt=case when p_step='signed_release_receipt' then p_signed_receipt else signed_release_receipt end,
    updated_at=statement_timestamp()
    where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state)
    values(p_command_id,p_release_id,p_step,v_release.artifact_digest,v_release.catalog_digest,v_release.state);
  return v_release.state;
end; $$;

create or replace function release_private.rollback_regional_release(
  p_command_id uuid,p_release_id uuid,p_reason text
) returns text
language plpgsql security definer
set search_path=''
as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then
    if v_command.release_id<>p_release_id or v_command.step<>'rollback' then
      raise exception 'release_idempotency_mismatch';
    end if;
    return v_command.result_state;
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found then raise exception 'release_not_found'; end if;
  update release_private.release_capabilities set
    public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false,
    updated_at=statement_timestamp() where release_id=p_release_id;
  update release_private.regional_releases set state='rolled_back',rollback_reason=btrim(p_reason),updated_at=statement_timestamp()
    where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state)
    values(p_command_id,p_release_id,'rollback',v_release.artifact_digest,v_release.catalog_digest,'rolled_back');
  return 'rolled_back';
end; $$;

alter function release_private.freeze_regional_release(uuid,text,text,text) owner to postgres;
alter function release_private.advance_regional_release(uuid,uuid,text,text) owner to postgres;
alter function release_private.rollback_regional_release(uuid,uuid,text) owner to postgres;
revoke all on all functions in schema release_private from public,anon,authenticated;
grant execute on function release_private.freeze_regional_release(uuid,text,text,text) to release_executor;
grant execute on function release_private.advance_regional_release(uuid,uuid,text,text) to release_executor;
grant execute on function release_private.rollback_regional_release(uuid,uuid,text) to release_executor;
