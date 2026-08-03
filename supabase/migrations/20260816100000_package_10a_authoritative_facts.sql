-- Package 10A correction: authoritative append-only facts replace editable totals.
-- The calculation service records individual facts, PostgreSQL derives blockers,
-- and the existing one-use challenge binds the canonical frozen fact digest.

grant readiness_automation to postgres;
grant create on schema readiness_private to readiness_automation;

create table readiness_private.readiness_fact_collections (
  run_id uuid primary key,
  state text not null default 'collecting' check (state in ('collecting','frozen')),
  created_at timestamptz not null default statement_timestamp(),
  frozen_at timestamptz,
  constraint readiness_fact_collection_state_shape check (
    (state='collecting' and frozen_at is null) or (state='frozen' and frozen_at is not null)
  )
);

create table readiness_private.readiness_fact_events (
  fact_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references readiness_private.readiness_fact_collections(run_id) on delete restrict,
  fact_kind text not null check (fact_kind in (
    'cat01_review','cat01_budget_receipt','cohort_subject','journey_attempt',
    'listing_verification','itinerary','artifact','defect','prerequisite'
  )),
  source_key text not null check (
    source_key=btrim(source_key) and char_length(source_key) between 1 and 160
      and source_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384),
  occurred_at timestamptz not null,
  fact_digest bytea not null check (octet_length(fact_digest)=32),
  recorded_at timestamptz not null default statement_timestamp(),
  unique(run_id,fact_kind,source_key),
  constraint readiness_fact_time_order check (recorded_at>=occurred_at)
);
create index readiness_fact_events_freeze_order
  on readiness_private.readiness_fact_events(run_id,fact_kind,source_key,fact_id);

create trigger readiness_fact_events_append_only before update or delete
  on readiness_private.readiness_fact_events for each row
  execute function readiness_private.reject_append_only_mutation();

create or replace function readiness_private.guard_fact_collection_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.run_id<>old.run_id or new.created_at<>old.created_at
    or old.state<>'collecting' or new.state<>'frozen' or new.frozen_at is null then
    raise exception using errcode='23514', message='readiness_fact_collection_transition_invalid';
  end if;
  return new;
end
$$;
create trigger readiness_fact_collection_guard before update
  on readiness_private.readiness_fact_collections for each row
  execute function readiness_private.guard_fact_collection_mutation();
create trigger readiness_fact_collections_no_delete before delete
  on readiness_private.readiness_fact_collections for each row
  execute function readiness_private.reject_append_only_mutation();

create or replace function readiness_private.payload_has_editable_totals(p_payload jsonb)
returns boolean language sql immutable set search_path='' as $$
  select p_payload::text ~ '"(completedJourneys|returnIntents|verifiedListings|coveragePercent|freshnessPercent|itineraryCount|artifactCount|unresolvedCriticalDefects|blockers|signatureVerified)"[[:space:]]*:';
$$;

create or replace function readiness_private.begin_fact_collection(p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare collection readiness_private.readiness_fact_collections%rowtype;
begin
  if p_run_id is null then raise exception using errcode='22023', message='readiness_run_id_required'; end if;
  insert into readiness_private.readiness_fact_collections(run_id) values(p_run_id)
    on conflict(run_id) do nothing;
  select * into collection from readiness_private.readiness_fact_collections where run_id=p_run_id;
  return jsonb_build_object('runId',collection.run_id,'state',collection.state,
    'createdAt',collection.created_at,'frozenAt',collection.frozen_at);
end
$$;

create or replace function readiness_private.append_authoritative_fact(
  p_run_id uuid,p_fact_kind text,p_source_key text,p_payload jsonb,p_occurred_at timestamptz
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare collection readiness_private.readiness_fact_collections%rowtype;
declare existing readiness_private.readiness_fact_events%rowtype;
declare digest bytea;
begin
  select * into collection from readiness_private.readiness_fact_collections
    where run_id=p_run_id for update;
  if not found or collection.state<>'collecting' then
    raise exception using errcode='55000', message='readiness_fact_collection_not_collecting';
  end if;
  if p_fact_kind not in ('cat01_review','cat01_budget_receipt','cohort_subject','journey_attempt',
      'listing_verification','itinerary','artifact','defect','prerequisite')
    or p_source_key is null or btrim(p_source_key)='' or p_source_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or char_length(p_source_key)>160 or jsonb_typeof(p_payload)<>'object'
    or p_occurred_at is null or p_occurred_at>statement_timestamp()
    or readiness_private.payload_has_editable_totals(p_payload) then
    raise exception using errcode='22023', message='readiness_fact_invalid_or_aggregate_shaped';
  end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_run_id::text,p_fact_kind,p_source_key,
    p_payload::text,p_occurred_at::text),'UTF8'),'sha256');
  select * into existing from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind=p_fact_kind and source_key=p_source_key;
  if found then
    if existing.fact_digest<>digest then
      raise exception using errcode='22023', message='readiness_fact_idempotency_mismatch';
    end if;
    return jsonb_build_object('factId',existing.fact_id,'factDigest',encode(existing.fact_digest,'hex'));
  end if;
  insert into readiness_private.readiness_fact_events(
    run_id,fact_kind,source_key,payload,occurred_at,fact_digest
  ) values(p_run_id,p_fact_kind,p_source_key,p_payload,p_occurred_at,digest)
  returning * into existing;
  return jsonb_build_object('factId',existing.fact_id,'factDigest',encode(existing.fact_digest,'hex'));
end
$$;

create or replace function readiness_private.calculate_authoritative_blockers(p_run_id uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare result text[]:=array[]::text[];
declare total integer;
declare passing integer;
declare eligible integer;
begin
  select count(*)::integer into total from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind='cat01_review';
  if total<>6 or (select count(distinct payload->>'reviewerId') from readiness_private.readiness_fact_events
      where run_id=p_run_id and fact_kind='cat01_review')<>2
    or (select count(distinct payload->>'listingId') from readiness_private.readiness_fact_events
      where run_id=p_run_id and fact_kind='cat01_review')<>3
    or exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='cat01_review' and coalesce((payload->>'reconciliationComplete')::boolean,false) is not true) then
    result:=array_append(result,'cat01_reviews_incomplete');
  end if;
  if (select count(*) from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='cat01_budget_receipt' and payload->>'responsibility'='ProductOwner')<>1 then
    result:=array_append(result,'cat01_budget_receipt_missing');
  end if;
  select count(*)::integer into total from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind='cohort_subject'
      and coalesce((payload->>'selectedFirstEight')::boolean,false)
      and coalesce((payload->>'eligible')::boolean,false);
  if total<>8 then result:=array_append(result,'readiness_first_eight_invalid'); end if;
  select count(distinct payload->>'subjectId')::integer,
    count(distinct payload->>'subjectId') filter(where coalesce((payload->>'completedWithoutBlockingDefect')::boolean,false)),
    count(distinct payload->>'subjectId') filter(where coalesce((payload->>'returnIntent')::boolean,false)
      or coalesce((payload->>'completedSecondTrip')::boolean,false))
    into total,passing,eligible from readiness_private.readiness_fact_events
      where run_id=p_run_id and fact_kind='journey_attempt'
        and coalesce((payload->>'attemptedCoreJourney')::boolean,false);
  if total<8 then result:=array_append(result,'readiness_attempts_below_eight'); end if;
  if passing<7 then result:=array_append(result,'readiness_completions_below_seven'); end if;
  if eligible<5 then result:=array_append(result,'readiness_return_intent_below_five'); end if;
  select count(*) filter(where coalesce((payload->>'activeVerified')::boolean,false))::integer,
    count(*) filter(where coalesce((payload->>'eligibleBaseline')::boolean,false))::integer
    into passing,eligible from readiness_private.readiness_fact_events
      where run_id=p_run_id and fact_kind='listing_verification';
  if passing<12 then result:=array_append(result,'catalog_twelve_listing_floor_missing'); end if;
  if eligible=0 or passing*100.0/eligible<70 then result:=array_append(result,'catalog_seventy_percent_coverage_missing'); end if;
  if exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='listing_verification' and coalesce((payload->>'activeVerified')::boolean,false)
      and not coalesce((payload->>'fresh')::boolean,false)) then
    result:=array_append(result,'catalog_freshness_not_complete');
  end if;
  if (select count(*) from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='itinerary' and coalesce((payload->>'scheduleValid')::boolean,false))<>9 then
    result:=array_append(result,'itinerary_nine_required');
  end if;
  if (select count(distinct payload->>'artifactKind') from readiness_private.readiness_fact_events
      where run_id=p_run_id and fact_kind='artifact' and nullif(payload->>'artifactDigest','') is not null)<>8 then
    result:=array_append(result,'readiness_artifacts_incomplete');
  end if;
  if exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='defect' and payload->>'severity' in ('blocking','privacy','security','data_loss')
      and not coalesce((payload->>'resolved')::boolean,false)) then
    result:=array_append(result,'readiness_critical_defect_open');
  end if;
  if not exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id
      and fact_kind='prerequisite' and payload->>'responsibility'='ProductOwner'
      and coalesce((payload->>'passed')::boolean,false)) then
    result:=array_append(result,'readiness_prerequisites_incomplete');
  end if;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return array['readiness_authoritative_fact_invalid'];
end
$$;

create or replace function readiness_private.canonical_fact_digest(p_run_id uuid)
returns bytea language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(concat_ws(E'\n','readiness-facts-v2',p_run_id::text,
    coalesce(string_agg(concat_ws('|',fact_kind,source_key,encode(fact_digest,'hex')),
      E'\n' order by fact_kind,source_key,fact_id),'')),'UTF8'),'sha256')
  from readiness_private.readiness_fact_events where run_id=p_run_id;
$$;

create or replace function readiness_private.freeze_authoritative_facts(p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare collection readiness_private.readiness_fact_collections%rowtype;
declare run_row readiness_private.readiness_runs%rowtype;
declare digest bytea;
declare derived_blockers text[];
declare fact_count integer;
begin
  select * into collection from readiness_private.readiness_fact_collections
    where run_id=p_run_id for update;
  if not found then raise exception using errcode='P0002', message='readiness_fact_collection_not_found'; end if;
  if collection.state='frozen' then
    select * into run_row from readiness_private.readiness_runs where run_id=p_run_id;
    return jsonb_build_object('runId',run_row.run_id,'state',run_row.state,
      'frozenDigest',encode(run_row.source_digest,'hex'),'blockers',to_jsonb(run_row.blockers));
  end if;
  select count(*)::integer into fact_count from readiness_private.readiness_fact_events where run_id=p_run_id;
  if fact_count=0 then raise exception using errcode='55000', message='readiness_facts_required'; end if;
  digest:=readiness_private.canonical_fact_digest(p_run_id);
  derived_blockers:=readiness_private.calculate_authoritative_blockers(p_run_id);
  insert into readiness_private.readiness_runs(
    run_id,source_digest,evidence_snapshot,blockers
  ) values(
    p_run_id,digest,jsonb_build_object('schemaVersion',2,'canonicalFactCount',fact_count,
      'canonicalFactDigest',encode(digest,'hex')),derived_blockers
  ) returning * into run_row;
  update readiness_private.readiness_fact_collections set state='frozen',frozen_at=statement_timestamp()
    where run_id=p_run_id;
  return jsonb_build_object('runId',run_row.run_id,'state',run_row.state,
    'frozenDigest',encode(run_row.source_digest,'hex'),'blockers',to_jsonb(run_row.blockers),
    'calculatedAt',run_row.calculated_at);
end
$$;

alter table readiness_private.readiness_fact_collections enable row level security;
alter table readiness_private.readiness_fact_collections force row level security;
alter table readiness_private.readiness_fact_events enable row level security;
alter table readiness_private.readiness_fact_events force row level security;
revoke all on readiness_private.readiness_fact_collections,readiness_private.readiness_fact_events
  from public,anon,authenticated;
grant select,insert,update,delete on readiness_private.readiness_fact_collections,
  readiness_private.readiness_fact_events to readiness_automation;
create policy readiness_automation_fact_collections on readiness_private.readiness_fact_collections
  for all to readiness_automation using(true) with check(true);
create policy readiness_automation_fact_events on readiness_private.readiness_fact_events
  for all to readiness_automation using(true) with check(true);

alter function readiness_private.guard_fact_collection_mutation() owner to readiness_automation;
alter function readiness_private.payload_has_editable_totals(jsonb) owner to readiness_automation;
alter function readiness_private.begin_fact_collection(uuid) owner to readiness_automation;
alter function readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamptz) owner to readiness_automation;
alter function readiness_private.calculate_authoritative_blockers(uuid) owner to readiness_automation;
alter function readiness_private.canonical_fact_digest(uuid) owner to readiness_automation;
alter function readiness_private.freeze_authoritative_facts(uuid) owner to readiness_automation;

revoke all on function readiness_private.freeze_evidence(uuid,bytea,jsonb)
  from public,anon,authenticated,readiness_calculation_service;
revoke all on function readiness_private.begin_fact_collection(uuid) from public,anon,authenticated;
revoke all on function readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function readiness_private.freeze_authoritative_facts(uuid) from public,anon,authenticated;
revoke all on function readiness_private.calculate_authoritative_blockers(uuid) from public,anon,authenticated;
revoke all on function readiness_private.canonical_fact_digest(uuid) from public,anon,authenticated;
grant execute on function readiness_private.begin_fact_collection(uuid) to readiness_calculation_service;
grant execute on function readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamptz)
  to readiness_calculation_service;
grant execute on function readiness_private.freeze_authoritative_facts(uuid) to readiness_calculation_service;

revoke create on schema readiness_private from readiness_automation;
revoke readiness_automation from postgres;
