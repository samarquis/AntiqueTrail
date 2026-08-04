-- Close the remaining Package 10A/4 operational gaps: facts are typed and
-- cohort-bound, and Candidate Share expiry/cleanup has a durable retry path.

grant readiness_automation to postgres;
grant create on schema readiness_private to readiness_automation;
alter function readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamptz) owner to postgres;
alter function readiness_private.calculate_authoritative_blockers(uuid) owner to postgres;

create or replace function readiness_private.authoritative_fact_shape_valid(
  p_kind text,p_source_key text,p_payload jsonb
)
returns boolean language sql immutable set search_path='' as $$
  select case p_kind
    when 'cohort_subject' then
      p_payload ?& array['subjectId','ageBand','adaptation','eligible']
      and p_payload->>'subjectId'=p_source_key
      and p_payload->>'ageBand' in ('55-69','70+')
      and jsonb_typeof(p_payload->'adaptation')='boolean'
      and jsonb_typeof(p_payload->'eligible')='boolean'
      and not (p_payload ?| array['selectedFirstEight','selectionOrdinal','preciseLocation'])
    when 'journey_attempt' then
      p_payload ?& array['subjectId','attemptSequence','attemptedCoreJourney',
        'completedWithoutBlockingDefect','returnIntent','completedSecondTrip']
      and jsonb_typeof(p_payload->'attemptSequence')='number'
      and (p_payload->'attemptSequence') between '1'::jsonb and '100'::jsonb
      and (p_payload->>'attemptSequence') ~ '^[1-9][0-9]{0,2}$'
      and jsonb_typeof(p_payload->'attemptedCoreJourney')='boolean'
      and jsonb_typeof(p_payload->'completedWithoutBlockingDefect')='boolean'
      and jsonb_typeof(p_payload->'returnIntent')='boolean'
      and jsonb_typeof(p_payload->'completedSecondTrip')='boolean'
    when 'cat01_review' then
      p_payload ?& array['reviewerId','listingId','reconciliationComplete']
      and jsonb_typeof(p_payload->'reconciliationComplete')='boolean'
    when 'cat01_budget_receipt' then p_payload->>'responsibility'='ProductOwner'
    when 'listing_verification' then
      p_payload ?& array['listingId','activeVerified','eligibleBaseline','fresh']
      and jsonb_typeof(p_payload->'activeVerified')='boolean'
      and jsonb_typeof(p_payload->'eligibleBaseline')='boolean'
      and jsonb_typeof(p_payload->'fresh')='boolean'
    when 'itinerary' then
      p_payload ?& array['itineraryId','namedDay','storeSetDigest','scheduleValid']
      and p_payload->>'namedDay' in ('Tuesday','Friday','Saturday')
      and jsonb_typeof(p_payload->'scheduleValid')='boolean'
    when 'artifact' then nullif(p_payload->>'artifactKind','') is not null
      and (p_payload->>'artifactDigest') ~ '^sha256:[0-9a-f]{64}$'
    when 'defect' then p_payload->>'severity' in ('blocking','privacy','security','data_loss','nonblocking')
      and jsonb_typeof(p_payload->'resolved')='boolean'
    when 'prerequisite' then p_payload->>'responsibility'='ProductOwner'
      and jsonb_typeof(p_payload->'passed')='boolean'
    else false end;
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
  if p_source_key is null or btrim(p_source_key)='' or char_length(p_source_key)>160
    or p_source_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or jsonb_typeof(p_payload)<>'object' or p_occurred_at is null
    or p_occurred_at>statement_timestamp()
    or readiness_private.payload_has_editable_totals(p_payload)
    or not readiness_private.authoritative_fact_shape_valid(p_fact_kind,p_source_key,p_payload) then
    raise exception using errcode='22023', message='readiness_fact_invalid_or_aggregate_shaped';
  end if;
  if p_fact_kind='journey_attempt' and not exists(
    select 1 from readiness_private.readiness_fact_events f
    where f.run_id=p_run_id and f.fact_kind='cohort_subject'
      and f.payload->>'subjectId'=p_payload->>'subjectId'
  ) then
    raise exception using errcode='22023', message='readiness_attempt_subject_not_enrolled';
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
declare total integer; declare passing integer; declare eligible integer;
declare older integer; declare adapted integer;
begin
  select count(*)::integer into total from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind='cat01_review';
  if total<>6 or (select count(distinct payload->>'reviewerId') from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='cat01_review')<>2
    or (select count(distinct payload->>'listingId') from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='cat01_review')<>3
    or exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='cat01_review' and not (payload->>'reconciliationComplete')::boolean)
  then result:=array_append(result,'cat01_reviews_incomplete'); end if;
  if (select count(*) from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='cat01_budget_receipt')<>1
  then result:=array_append(result,'cat01_budget_receipt_missing'); end if;

  with ranked as (
    select payload->>'subjectId' subject_id,payload->>'ageBand' age_band,
      (payload->>'adaptation')::boolean adaptation,
      row_number() over(order by occurred_at,source_key,fact_id) ordinal
    from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind='cohort_subject' and (payload->>'eligible')::boolean
  ) select count(*)::integer,count(*) filter(where age_band='70+')::integer,
      count(*) filter(where adaptation)::integer into total,older,adapted from ranked where ordinal<=8;
  if total<>8 then result:=array_append(result,'readiness_first_eight_invalid'); end if;
  if older<3 then result:=array_append(result,'readiness_older_adult_composition_invalid'); end if;
  if adapted<2 then result:=array_append(result,'readiness_accessibility_composition_invalid'); end if;

  with selected as (
    select payload->>'subjectId' subject_id from readiness_private.readiness_fact_events
    where run_id=p_run_id and fact_kind='cohort_subject' and (payload->>'eligible')::boolean
    order by occurred_at,source_key,fact_id limit 8
  ), latest_attempt as (
    select distinct on (f.payload->>'subjectId') f.payload
    from readiness_private.readiness_fact_events f join selected s on s.subject_id=f.payload->>'subjectId'
    where f.run_id=p_run_id and f.fact_kind='journey_attempt' and (f.payload->>'attemptedCoreJourney')::boolean
    order by f.payload->>'subjectId',(f.payload->>'attemptSequence')::integer desc,f.occurred_at desc
  ) select count(*)::integer,
      count(*) filter(where (payload->>'completedWithoutBlockingDefect')::boolean)::integer,
      count(*) filter(where (payload->>'returnIntent')::boolean or (payload->>'completedSecondTrip')::boolean)::integer
    into total,passing,eligible from latest_attempt;
  if total<8 then result:=array_append(result,'readiness_attempts_below_eight'); end if;
  if passing<7 then result:=array_append(result,'readiness_completions_below_seven'); end if;
  if eligible<5 then result:=array_append(result,'readiness_return_intent_below_five'); end if;

  select count(*) filter(where (payload->>'activeVerified')::boolean)::integer,
    count(*) filter(where (payload->>'eligibleBaseline')::boolean)::integer into passing,eligible
    from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='listing_verification';
  if passing<12 then result:=array_append(result,'catalog_twelve_listing_floor_missing'); end if;
  if eligible=0 or passing*100.0/eligible<70 then result:=array_append(result,'catalog_seventy_percent_coverage_missing'); end if;
  if exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='listing_verification'
    and (payload->>'activeVerified')::boolean and not (payload->>'fresh')::boolean)
  then result:=array_append(result,'catalog_freshness_not_complete'); end if;
  if (select count(*) from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='itinerary' and (payload->>'scheduleValid')::boolean)<>9
  then result:=array_append(result,'itinerary_nine_required'); end if;
  if (select count(distinct payload->>'artifactKind') from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='artifact')<>8
  then result:=array_append(result,'readiness_artifacts_incomplete'); end if;
  if exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='defect'
    and payload->>'severity' in ('blocking','privacy','security','data_loss') and not (payload->>'resolved')::boolean)
  then result:=array_append(result,'readiness_critical_defect_open'); end if;
  if not exists(select 1 from readiness_private.readiness_fact_events where run_id=p_run_id and fact_kind='prerequisite' and (payload->>'passed')::boolean)
  then result:=array_append(result,'readiness_prerequisites_incomplete'); end if;
  return result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return array['readiness_authoritative_fact_invalid'];
end
$$;

alter function readiness_private.authoritative_fact_shape_valid(text,text,jsonb) owner to readiness_automation;
alter function readiness_private.append_authoritative_fact(uuid,text,text,jsonb,timestamptz) owner to readiness_automation;
alter function readiness_private.calculate_authoritative_blockers(uuid) owner to readiness_automation;
revoke all on function readiness_private.authoritative_fact_shape_valid(text,text,jsonb) from public,anon,authenticated;
revoke create on schema readiness_private from readiness_automation;
revoke readiness_automation from postgres;

grant identity_service to postgres;
grant create on schema candidate_private to identity_service;
alter table candidate_private.candidate_cleanup_jobs drop constraint candidate_cleanup_jobs_state_check;
alter table candidate_private.candidate_cleanup_jobs
  drop constraint candidate_cleanup_state_shape,
  add column last_error_code text,
  add column exhausted_at timestamptz,
  add constraint candidate_cleanup_jobs_state_check check(state in ('pending','claimed','completed','exhausted')),
  add constraint candidate_cleanup_exhausted_shape check(
    (state<>'exhausted' and exhausted_at is null)
    or (state='exhausted' and exhausted_at is not null and completed_at is null)
  ),
  add constraint candidate_cleanup_state_shape check (
    (state='pending' and claim_token is null and claimed_until is null and completed_at is null)
    or (state='claimed' and claim_token is not null and claimed_until is not null and completed_at is null)
    or (state='completed' and claim_token is not null and claimed_until is not null and completed_at is not null)
    or (state='exhausted' and claim_token is null and claimed_until is null and completed_at is null)
  );

create or replace function candidate_private.expire_candidate_shares(p_now timestamptz,p_limit integer)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare affected integer;
begin
  if p_now is null or p_limit is null or p_limit<1 or p_limit>500 then
    raise exception using errcode='22023', message='candidate_expiry_input_invalid';
  end if;
  with due as (
    select share_id from candidate_private.candidate_shares
    where state='pending' and expires_at<=p_now order by expires_at,share_id
    limit p_limit for update skip locked
  ) update candidate_private.candidate_shares s set state='closed',close_reason='expired',closed_at=p_now
    from due where s.share_id=due.share_id;
  get diagnostics affected=row_count;
  return affected;
end
$$;

create or replace function candidate_private.fail_candidate_cleanup(
  p_share_id uuid,p_claim_token uuid,p_now timestamptz,p_error_code text
)
returns text language plpgsql volatile security definer set search_path='' as $$
declare job candidate_private.candidate_cleanup_jobs%rowtype; next_state text; delay_seconds integer;
begin
  if p_share_id is null or p_claim_token is null or p_now is null
    or p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception using errcode='22023', message='candidate_cleanup_failure_invalid';
  end if;
  select * into strict job from candidate_private.candidate_cleanup_jobs where share_id=p_share_id for update;
  if job.state<>'claimed' or job.claim_token<>p_claim_token then
    raise exception using errcode='55000', message='candidate_cleanup_claim_not_current';
  end if;
  delay_seconds:=least(21600,30*(2^greatest(0,job.attempt_count-1))::integer);
  next_state:=case when job.attempt_count>=8
    or p_now+make_interval(secs=>delay_seconds)>job.terminal_at+interval '24 hours'
    then 'exhausted' else 'pending' end;
  update candidate_private.candidate_cleanup_jobs set state=next_state,
    cleanup_due_at=case when next_state='pending' then p_now+make_interval(secs=>delay_seconds) else cleanup_due_at end,
    claim_token=null,claimed_until=null,last_error_code=p_error_code,
    exhausted_at=case when next_state='exhausted' then p_now else null end,updated_at=statement_timestamp()
    where share_id=p_share_id;
  return next_state;
exception when no_data_found then
  raise exception using errcode='55000', message='candidate_cleanup_claim_not_current';
end
$$;

alter function candidate_private.expire_candidate_shares(timestamptz,integer) owner to identity_service;
alter function candidate_private.fail_candidate_cleanup(uuid,uuid,timestamptz,text) owner to identity_service;
revoke all on function candidate_private.expire_candidate_shares(timestamptz,integer) from public,anon,authenticated;
revoke all on function candidate_private.fail_candidate_cleanup(uuid,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function candidate_private.expire_candidate_shares(timestamptz,integer) to candidate_cleanup_service;
grant execute on function candidate_private.fail_candidate_cleanup(uuid,uuid,timestamptz,text) to candidate_cleanup_service;
revoke create on schema candidate_private from identity_service;
revoke identity_service from postgres;
