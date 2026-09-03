create schema if not exists research_private;
revoke all on schema research_private from public, anon, authenticated;

create table research_private.owner_research_cohort_grants (
  grant_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cohort_key text not null check (cohort_key ~ '^[a-z0-9-]{3,40}$'),
  run_id uuid not null unique default gen_random_uuid(),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  state text not null default 'active' check (state in ('active','revoked','expired')),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint owner_research_grant_expiry check (expires_at > consented_at)
);

create unique index owner_research_active_user_cohort_idx
on research_private.owner_research_cohort_grants(user_id, cohort_key)
where state='active';

create table research_private.owner_research_intakes (
  run_id uuid primary key references research_private.owner_research_cohort_grants(run_id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  audience text not null default 'synthetic' check (audience='synthetic'),
  kind text not null check (kind in ('existing_claim','add_store')),
  state text not null default 'draft' check (state in ('draft','submitted')),
  draft jsonb not null,
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz
);

create table research_private.owner_research_minimized_outcomes (
  outcome_id uuid primary key default gen_random_uuid(),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  cohort_key text not null check (cohort_key ~ '^[a-z0-9-]{3,40}$'),
  consented_at timestamptz not null,
  outcome text not null check (outcome in ('draft','submitted')),
  recorded_at timestamptz not null default statement_timestamp()
);

alter table research_private.owner_research_cohort_grants enable row level security;
alter table research_private.owner_research_intakes enable row level security;
alter table research_private.owner_research_minimized_outcomes enable row level security;
revoke all on all tables in schema research_private from public, anon, authenticated;

create or replace function research_private.owner_intake_apply(
  p_actor uuid,
  p_run_id uuid,
  p_audience text,
  p_operation text,
  p_payload jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
  intake research_private.owner_research_intakes%rowtype;
  requested_kind text;
  requested_draft jsonb;
begin
  if p_actor is null or p_audience <> 'synthetic' or p_operation not in ('start','save','resume','submit','status') then
    raise exception using errcode='42501', message='owner_research_unavailable';
  end if;

  select * into intake
  from research_private.owner_research_intakes
  where run_id=p_run_id and applicant_id=p_actor and audience='synthetic'
  for update;

  if p_operation='start' then
    requested_kind:=p_payload->>'kind';
    if requested_kind not in ('existing_claim','add_store') then
      raise exception using errcode='22023', message='owner_research_unavailable';
    end if;
    if intake.run_id is null then
      requested_draft:=jsonb_build_object(
        'fixture',case when requested_kind='existing_claim' then 'existing-store-a' else 'new-store-a' end,
        'relationship','owner',
        'ownerFactsConfirmed',false,
        'reviewedFactsUnderstood',false
      );
      insert into research_private.owner_research_intakes(run_id,applicant_id,kind,draft)
      values(p_run_id,p_actor,requested_kind,requested_draft)
      returning * into intake;
    elsif intake.kind<>requested_kind then
      raise exception using errcode='42501', message='owner_research_unavailable';
    end if;
  elsif p_operation='save' then
    if intake.run_id is null or intake.state<>'draft' then
      raise exception using errcode='42501', message='owner_research_unavailable';
    end if;
    requested_draft:=p_payload->'draft';
    if jsonb_typeof(requested_draft)<>'object'
      or (select array_agg(key order by key) from jsonb_object_keys(requested_draft) key)
        <> array['fixture','ownerFactsConfirmed','relationship','reviewedFactsUnderstood']
      or requested_draft->>'relationship' not in ('owner','manager')
      or jsonb_typeof(requested_draft->'ownerFactsConfirmed')<>'boolean'
      or jsonb_typeof(requested_draft->'reviewedFactsUnderstood')<>'boolean'
      or (intake.kind='existing_claim' and requested_draft->>'fixture'<>'existing-store-a')
      or (intake.kind='add_store' and requested_draft->>'fixture'<>'new-store-a') then
      raise exception using errcode='22023', message='owner_research_unavailable';
    end if;
    update research_private.owner_research_intakes
    set draft=requested_draft,updated_at=statement_timestamp()
    where run_id=p_run_id returning * into intake;
  elsif p_operation='submit' then
    if intake.run_id is null
      or (intake.draft->>'ownerFactsConfirmed')::boolean is not true
      or (intake.draft->>'reviewedFactsUnderstood')::boolean is not true then
      raise exception using errcode='42501', message='owner_research_unavailable';
    end if;
    if intake.state='draft' then
      update research_private.owner_research_intakes
      set state='submitted',submitted_at=statement_timestamp(),updated_at=statement_timestamp()
      where run_id=p_run_id returning * into intake;
    end if;
  end if;

  if intake.run_id is null then
    return jsonb_build_object('runId',p_run_id,'audience','synthetic','kind',null,'state','ready','draft',null,'updatedAt',null);
  end if;
  return jsonb_build_object(
    'runId',intake.run_id,
    'audience',intake.audience,
    'kind',intake.kind,
    'state',intake.state,
    'draft',intake.draft,
    'updatedAt',intake.updated_at
  );
end $$;

create or replace function app_public.owner_research_command(
  p_operation text,
  p_artifact_digest text,
  p_cohort_key text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
  actor uuid:=app_public.request_user_id();
  cohort research_private.owner_research_cohort_grants%rowtype;
begin
  select * into cohort
  from research_private.owner_research_cohort_grants
  where user_id=actor
    and cohort_key=p_cohort_key
    and artifact_digest=p_artifact_digest
    and state='active'
    and expires_at>statement_timestamp()
  for update;
  if cohort.grant_id is null then
    raise exception using errcode='42501', message='owner_research_unavailable';
  end if;
  return research_private.owner_intake_apply(actor,cohort.run_id,'synthetic',p_operation,coalesce(p_payload,'{}'::jsonb));
exception when others then
  raise exception using errcode='42501', message='owner_research_unavailable';
end $$;

-- The normal Package 10B wrapper is deliberately unavailable until its release migration.
-- Keeping both wrappers at this boundary makes divergence from the shared transaction testable.
create or replace function app_public.owner_intake_command(
  p_operation text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
begin
  perform research_private.owner_intake_apply(app_public.request_user_id(),gen_random_uuid(),'public',p_operation,coalesce(p_payload,'{}'::jsonb));
  raise exception using errcode='42501', message='owner_intake_stage_disabled';
exception when others then
  raise exception using errcode='42501', message='owner_intake_stage_disabled';
end $$;

create or replace function app_public.owner_research_teardown(
  p_artifact_digest text,
  p_receipt_at timestamptz,
  p_now timestamptz default statement_timestamp()
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
  retained integer;
  purged integer;
begin
  if p_receipt_at is null or p_now<p_receipt_at then
    raise exception using errcode='22023', message='owner_research_teardown_window_invalid';
  end if;
  insert into research_private.owner_research_minimized_outcomes(artifact_digest,cohort_key,consented_at,outcome)
  select g.artifact_digest,g.cohort_key,g.consented_at,coalesce(i.state,'draft')
  from research_private.owner_research_cohort_grants g
  left join research_private.owner_research_intakes i using(run_id)
  where g.artifact_digest=p_artifact_digest;
  get diagnostics retained=row_count;
  update research_private.owner_research_cohort_grants
  set state='revoked'
  where artifact_digest=p_artifact_digest and state='active';
  delete from research_private.owner_research_cohort_grants
  where artifact_digest=p_artifact_digest;
  get diagnostics purged=row_count;
  return jsonb_build_object('artifactDigest',p_artifact_digest,'revoked',true,'purgedRuns',purged,'retainedOutcomes',retained);
end $$;

revoke all on function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb) from public;
revoke all on function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb) from anon;
revoke all on function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb) from authenticated;
revoke all on function app_public.owner_research_command(text,text,text,jsonb) from public;
grant execute on function app_public.owner_research_command(text,text,text,jsonb) to anon;
grant execute on function app_public.owner_research_command(text,text,text,jsonb) to authenticated;
revoke all on function app_public.owner_intake_command(text,jsonb) from public;
revoke all on function app_public.owner_intake_command(text,jsonb) from anon;
grant execute on function app_public.owner_intake_command(text,jsonb) to authenticated;
revoke all on function app_public.owner_research_teardown(text,timestamptz,timestamptz) from public;
revoke all on function app_public.owner_research_teardown(text,timestamptz,timestamptz) from anon;
revoke all on function app_public.owner_research_teardown(text,timestamptz,timestamptz) from authenticated;
grant execute on function app_public.owner_research_teardown(text,timestamptz,timestamptz) to service_role;
grant usage on schema research_private to service_role;
grant select,insert,update,delete on research_private.owner_research_cohort_grants to service_role;

grant usage,create on schema research_private to identity_service;
alter table research_private.owner_research_cohort_grants owner to identity_service;
alter table research_private.owner_research_intakes owner to identity_service;
alter table research_private.owner_research_minimized_outcomes owner to identity_service;
alter function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb) owner to identity_service;
grant create on schema app_public to identity_service;
alter function app_public.owner_research_command(text,text,text,jsonb) owner to identity_service;
alter function app_public.owner_intake_command(text,jsonb) owner to identity_service;
alter function app_public.owner_research_teardown(text,timestamptz,timestamptz) owner to identity_service;
revoke create on schema app_public from identity_service;
alter schema research_private owner to identity_service;
