create schema if not exists research_private;
revoke all on schema research_private from public,anon,authenticated;

create table research_private.owner_research_artifacts(
  artifact_digest text primary key check(artifact_digest ~ '^sha256:[0-9a-f]{64}$'),
  deployment_id text not null unique check(deployment_id ~ '^[A-Za-z0-9._-]{3,128}$'),
  manifest_file_count integer not null check(manifest_file_count between 1 and 100),
  research_receipt_at timestamptz not null,
  verified_at timestamptz not null default statement_timestamp(),
  state text not null default 'active' check(state in ('active','torn_down'))
);

create table research_private.owner_research_cohort_grants(
  grant_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cohort_key text not null check(cohort_key ~ '^[a-z0-9-]{3,40}$'),
  run_id uuid not null unique default gen_random_uuid(),
  artifact_digest text not null references research_private.owner_research_artifacts(artifact_digest) on delete restrict,
  state text not null default 'active' check(state in ('active','revoked','expired')),
  consented_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint owner_research_grant_expiry check(expires_at>consented_at)
);
create unique index owner_research_active_user_cohort_idx
  on research_private.owner_research_cohort_grants(user_id,cohort_key) where state='active';

-- This state machine is audience-neutral. Admission and real-world effects belong to wrappers.
create table research_private.owner_intakes(
  run_id uuid primary key,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  audience text not null check(audience in ('synthetic','public')),
  kind text not null check(kind in ('existing_claim','add_store')),
  state text not null default 'draft' check(state in ('draft','submitted')),
  draft jsonb not null check(jsonb_typeof(draft)='object'),
  updated_at timestamptz not null default statement_timestamp(),
  submitted_at timestamptz,
  unique(run_id,applicant_id,audience)
);
create index owner_intakes_applicant_audience_idx
  on research_private.owner_intakes(applicant_id,audience,updated_at desc);

create table research_private.owner_research_minimized_outcomes(
  outcome_id uuid primary key default gen_random_uuid(),
  artifact_digest text not null references research_private.owner_research_artifacts(artifact_digest) on delete restrict,
  cohort_key text not null check(cohort_key ~ '^[a-z0-9-]{3,40}$'),
  consented_at timestamptz not null,
  outcome text not null check(outcome in ('draft','submitted')),
  recorded_at timestamptz not null default statement_timestamp()
);

create table research_private.owner_research_teardown_receipts(
  artifact_digest text primary key references research_private.owner_research_artifacts(artifact_digest) on delete restrict,
  deployment_id text not null,
  research_receipt_at timestamptz not null,
  purged_runs integer not null check(purged_runs>=0),
  retained_outcomes integer not null check(retained_outcomes>=0),
  receipt_digest text not null check(receipt_digest ~ '^sha256:[0-9a-f]{64}$'),
  completed_at timestamptz not null default statement_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['owner_research_artifacts','owner_research_cohort_grants','owner_intakes','owner_research_minimized_outcomes','owner_research_teardown_receipts'] loop
    execute format('alter table research_private.%I enable row level security',t);
    execute format('alter table research_private.%I force row level security',t);
    execute format('revoke all on research_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
create policy identity_owner_research_artifacts on research_private.owner_research_artifacts for all to identity_service using(true) with check(true);
create policy identity_owner_research_grants on research_private.owner_research_cohort_grants for all to identity_service using(true) with check(true);
create policy identity_owner_intakes on research_private.owner_intakes for all to identity_service using(true) with check(true);
create policy identity_owner_research_outcomes on research_private.owner_research_minimized_outcomes for all to identity_service using(true) with check(true);
create policy identity_owner_research_teardown on research_private.owner_research_teardown_receipts for all to identity_service using(true) with check(true);

create or replace function research_private.owner_intake_apply(
  p_actor uuid,p_run_id uuid,p_audience text,p_operation text,p_payload jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare intake research_private.owner_intakes%rowtype; requested_kind text; requested_draft jsonb;
begin
  if p_actor is null or p_run_id is null or p_audience not in ('synthetic','public')
    or p_operation not in ('start','save','resume','submit','status') or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='22023',message='owner_intake_invalid';
  end if;
  select * into intake from research_private.owner_intakes
    where run_id=p_run_id and applicant_id=p_actor and audience=p_audience for update;
  if p_operation='start' then
    requested_kind:=p_payload->>'kind'; requested_draft:=p_payload->'initialDraft';
    if requested_kind not in ('existing_claim','add_store') or jsonb_typeof(requested_draft)<>'object' then
      raise exception using errcode='22023',message='owner_intake_invalid';
    end if;
    if intake.run_id is null then
      insert into research_private.owner_intakes(run_id,applicant_id,audience,kind,draft)
        values(p_run_id,p_actor,p_audience,requested_kind,requested_draft) returning * into intake;
    elsif intake.kind<>requested_kind then raise exception using errcode='55000',message='owner_intake_state_invalid'; end if;
  elsif p_operation='save' then
    requested_draft:=p_payload->'draft';
    if intake.run_id is null or intake.state<>'draft' or jsonb_typeof(requested_draft)<>'object' then
      raise exception using errcode='55000',message='owner_intake_state_invalid';
    end if;
    update research_private.owner_intakes set draft=requested_draft,updated_at=statement_timestamp()
      where run_id=p_run_id returning * into intake;
  elsif p_operation='submit' then
    if intake.run_id is null then raise exception using errcode='55000',message='owner_intake_state_invalid'; end if;
    if intake.state='draft' then
      update research_private.owner_intakes set state='submitted',submitted_at=statement_timestamp(),updated_at=statement_timestamp()
        where run_id=p_run_id returning * into intake;
    end if;
  end if;
  if intake.run_id is null then
    return jsonb_build_object('runId',p_run_id,'audience',p_audience,'kind',null,'state','ready','draft',null,'updatedAt',null);
  end if;
  return jsonb_build_object('runId',intake.run_id,'audience',intake.audience,'kind',intake.kind,
    'state',intake.state,'draft',intake.draft,'updatedAt',intake.updated_at);
end $$;

create or replace function research_private.synthetic_owner_payload(
  p_operation text,p_payload jsonb,p_intake research_private.owner_intakes default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare d jsonb; k text:=coalesce(p_intake.kind,p_payload->>'kind'); keys text[];
begin
  select array_agg(key order by key) into keys from jsonb_object_keys(p_payload) key;
  if p_operation='start' then
    if keys<>array['kind'] or k not in ('existing_claim','add_store') then raise exception 'invalid'; end if;
    return jsonb_build_object('kind',k,'initialDraft',jsonb_build_object(
      'fixture',case when k='existing_claim' then 'existing-store-a' else 'new-store-a' end,
      'relationship','owner','ownerFactsConfirmed',false,'reviewedFactsUnderstood',false));
  elsif p_operation='save' then
    if keys<>array['draft'] then raise exception 'invalid'; end if; d:=p_payload->'draft';
    if jsonb_typeof(d)<>'object'
      or (select array_agg(key order by key) from jsonb_object_keys(d) key)<>array['fixture','ownerFactsConfirmed','relationship','reviewedFactsUnderstood']
      or d->>'relationship' not in ('owner','manager')
      or jsonb_typeof(d->'ownerFactsConfirmed')<>'boolean' or jsonb_typeof(d->'reviewedFactsUnderstood')<>'boolean'
      or (k='existing_claim' and d->>'fixture'<>'existing-store-a') or (k='add_store' and d->>'fixture'<>'new-store-a') then raise exception 'invalid'; end if;
    return p_payload;
  elsif p_operation='submit' then
    if coalesce(keys,array[]::text[])<>array[]::text[] or p_intake.run_id is null
      or (p_intake.draft->>'ownerFactsConfirmed')::boolean is not true
      or (p_intake.draft->>'reviewedFactsUnderstood')::boolean is not true then raise exception 'invalid'; end if;
  elsif coalesce(keys,array[]::text[])<>array[]::text[] then raise exception 'invalid'; end if;
  return p_payload;
end $$;

create or replace function research_private.public_owner_payload(
  p_operation text,p_payload jsonb,p_intake research_private.owner_intakes default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare d jsonb; k text:=coalesce(p_intake.kind,p_payload->>'kind'); keys text[]; expected text[];
begin
  select array_agg(key order by key) into keys from jsonb_object_keys(p_payload) key;
  if p_operation='start' then
    if keys<>array['kind'] or k not in ('existing_claim','add_store') then raise exception 'invalid'; end if;
    d:=jsonb_build_object('relationship','owner','ownerFactsConfirmed',false,'reviewedFactsUnderstood',false);
    if k='existing_claim' then d:=d||jsonb_build_object('storeId','');
    else d:=d||jsonb_build_object('storeName','','address','','website','','description',''); end if;
    return jsonb_build_object('kind',k,'initialDraft',d);
  elsif p_operation='save' then
    if keys<>array['draft'] or p_intake.run_id is null then raise exception 'invalid'; end if; d:=p_payload->'draft';
    expected:=case when k='existing_claim' then array['ownerFactsConfirmed','relationship','reviewedFactsUnderstood','storeId']
      else array['address','description','ownerFactsConfirmed','relationship','reviewedFactsUnderstood','storeName','website'] end;
    if jsonb_typeof(d)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(d) key)<>expected
      or d->>'relationship' not in ('owner','manager')
      or jsonb_typeof(d->'ownerFactsConfirmed')<>'boolean' or jsonb_typeof(d->'reviewedFactsUnderstood')<>'boolean'
      or (k='existing_claim' and (d->>'storeId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (k='add_store' and (nullif(btrim(d->>'storeName'),'') is null or char_length(d->>'storeName')>160
        or nullif(btrim(d->>'address'),'') is null or char_length(d->>'address')>320
        or char_length(d->>'description')>4000
        or (nullif(d->>'website','') is not null and (d->>'website') !~* '^https?://[^[:space:]]+$'))) then raise exception 'invalid'; end if;
    return p_payload;
  elsif p_operation='submit' then
    if coalesce(keys,array[]::text[])<>array[]::text[] or p_intake.run_id is null
      or (p_intake.draft->>'ownerFactsConfirmed')::boolean is not true
      or (p_intake.draft->>'reviewedFactsUnderstood')::boolean is not true
      or (k='existing_claim' and nullif(p_intake.draft->>'storeId','') is null)
      or (k='add_store' and (nullif(btrim(p_intake.draft->>'storeName'),'') is null
        or nullif(btrim(p_intake.draft->>'address'),'') is null)) then raise exception 'invalid'; end if;
  elsif coalesce(keys,array[]::text[])<>array[]::text[] then raise exception 'invalid'; end if;
  return p_payload;
end $$;

create or replace function app_public.owner_research_command(
  p_operation text,p_artifact_digest text,p_cohort_key text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare actor uuid:=app_public.request_user_id(); cohort research_private.owner_research_cohort_grants%rowtype;
  intake research_private.owner_intakes%rowtype; normalized jsonb;
begin
  if actor is null or not app_private.current_session_is_active() then raise exception 'denied'; end if;
  select g.* into cohort from research_private.owner_research_cohort_grants g
    join research_private.owner_research_artifacts a using(artifact_digest)
    where g.user_id=actor and g.cohort_key=p_cohort_key and g.artifact_digest=p_artifact_digest
      and g.state='active' and g.expires_at>statement_timestamp() and g.expires_at<=a.research_receipt_at+interval '30 days'
      and a.state='active' and a.verified_at is not null for update of g;
  if cohort.grant_id is null then raise exception 'denied'; end if;
  select * into intake from research_private.owner_intakes where run_id=cohort.run_id and applicant_id=actor and audience='synthetic';
  normalized:=research_private.synthetic_owner_payload(p_operation,coalesce(p_payload,'{}'::jsonb),intake);
  return research_private.owner_intake_apply(actor,cohort.run_id,'synthetic',p_operation,normalized);
exception when others then raise exception using errcode='42501',message='owner_research_unavailable';
end $$;

create or replace function app_public.owner_intake_command(
  p_operation text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare actor uuid:=app_public.request_user_id(); intake research_private.owner_intakes%rowtype;
  run uuid; normalized jsonb; result jsonb;
begin
  if actor is null or not app_private.current_session_is_active()
    or not release_private.public_capability_enabled('claims') then raise exception 'denied'; end if;
  select * into intake from research_private.owner_intakes where applicant_id=actor and audience='public'
    order by updated_at desc limit 1 for update;
  run:=coalesce(intake.run_id,extensions.gen_random_uuid());
  normalized:=research_private.public_owner_payload(p_operation,coalesce(p_payload,'{}'::jsonb),intake);
  result:=research_private.owner_intake_apply(actor,run,'public',p_operation,normalized);
  if p_operation='submit' and intake.state is distinct from 'submitted' then
    select * into intake from research_private.owner_intakes where run_id=run;
    if intake.kind='existing_claim' then
      perform app_public.submit_listing_claim(intake.draft->>'storeId');
    else
      perform app_public.partner_safe_command('save_draft',jsonb_build_object('draft',intake.draft));
      perform app_public.partner_safe_command('submit_draft','{}'::jsonb);
    end if;
  end if;
  return result;
exception when others then raise exception using errcode='42501',message='owner_intake_unavailable';
end $$;

create or replace function app_public.owner_research_teardown(
  p_artifact_digest text,p_receipt_at timestamptz,p_now timestamptz default statement_timestamp()
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare artifact research_private.owner_research_artifacts%rowtype; prior research_private.owner_research_teardown_receipts%rowtype;
  retained integer; purged integer; receipt text;
begin
  select * into prior from research_private.owner_research_teardown_receipts where artifact_digest=p_artifact_digest;
  if prior.artifact_digest is not null then
    return jsonb_build_object('artifactDigest',prior.artifact_digest,'deploymentId',prior.deployment_id,
      'receiptAt',prior.research_receipt_at,'revoked',true,'purgedRuns',prior.purged_runs,
      'retainedOutcomes',prior.retained_outcomes,'receiptDigest',prior.receipt_digest);
  end if;
  select * into artifact from research_private.owner_research_artifacts where artifact_digest=p_artifact_digest for update;
  if artifact.artifact_digest is null or artifact.state<>'active' or p_receipt_at is distinct from artifact.research_receipt_at
    or p_now<p_receipt_at then raise exception using errcode='22023',message='owner_research_teardown_receipt_invalid'; end if;
  insert into research_private.owner_research_minimized_outcomes(artifact_digest,cohort_key,consented_at,outcome)
    select g.artifact_digest,g.cohort_key,g.consented_at,coalesce(i.state,'draft')
    from research_private.owner_research_cohort_grants g left join research_private.owner_intakes i using(run_id)
    where g.artifact_digest=p_artifact_digest;
  get diagnostics retained=row_count;
  update research_private.owner_research_cohort_grants set state='revoked'
    where artifact_digest=p_artifact_digest and state='active';
  delete from research_private.owner_intakes where run_id in(
    select run_id from research_private.owner_research_cohort_grants where artifact_digest=p_artifact_digest);
  delete from research_private.owner_research_cohort_grants where artifact_digest=p_artifact_digest;
  get diagnostics purged=row_count;
  update research_private.owner_research_artifacts set state='torn_down' where artifact_digest=p_artifact_digest;
  receipt:='sha256:'||encode(extensions.digest(convert_to(concat_ws('|',p_artifact_digest,artifact.deployment_id,
    p_receipt_at::text,purged::text,retained::text),'utf8'),'sha256'),'hex');
  insert into research_private.owner_research_teardown_receipts(
    artifact_digest,deployment_id,research_receipt_at,purged_runs,retained_outcomes,receipt_digest,completed_at)
    values(p_artifact_digest,artifact.deployment_id,p_receipt_at,purged,retained,receipt,p_now);
  return jsonb_build_object('artifactDigest',p_artifact_digest,'deploymentId',artifact.deployment_id,
    'receiptAt',p_receipt_at,'revoked',true,'purgedRuns',purged,'retainedOutcomes',retained,'receiptDigest',receipt);
end $$;

revoke all on function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb),
  research_private.synthetic_owner_payload(text,jsonb,research_private.owner_intakes),
  research_private.public_owner_payload(text,jsonb,research_private.owner_intakes) from public,anon,authenticated;
revoke all on function app_public.owner_research_command(text,text,text,jsonb) from public;
grant execute on function app_public.owner_research_command(text,text,text,jsonb) to anon,authenticated;
revoke all on function app_public.owner_intake_command(text,jsonb) from public,anon;
grant execute on function app_public.owner_intake_command(text,jsonb) to authenticated;
revoke all on function app_public.owner_research_teardown(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function app_public.owner_research_teardown(text,timestamptz,timestamptz) to service_role;
grant usage on schema research_private to service_role;
grant select,insert,update,delete on all tables in schema research_private to service_role;

grant usage,create on schema research_private to identity_service;
grant execute on function release_private.public_capability_enabled(text) to identity_service;
alter table research_private.owner_research_artifacts owner to identity_service;
alter table research_private.owner_research_cohort_grants owner to identity_service;
alter table research_private.owner_intakes owner to identity_service;
alter table research_private.owner_research_minimized_outcomes owner to identity_service;
alter table research_private.owner_research_teardown_receipts owner to identity_service;
alter function research_private.owner_intake_apply(uuid,uuid,text,text,jsonb) owner to identity_service;
alter function research_private.synthetic_owner_payload(text,jsonb,research_private.owner_intakes) owner to identity_service;
alter function research_private.public_owner_payload(text,jsonb,research_private.owner_intakes) owner to identity_service;
grant create on schema app_public to identity_service;
alter function app_public.owner_research_command(text,text,text,jsonb) owner to identity_service;
alter function app_public.owner_intake_command(text,jsonb) owner to identity_service;
alter function app_public.owner_research_teardown(text,timestamptz,timestamptz) owner to identity_service;
revoke create on schema app_public from identity_service;
alter schema research_private owner to identity_service;
