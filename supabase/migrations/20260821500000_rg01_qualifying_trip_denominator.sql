-- Package 11: every qualifying trip contributes to the support-load denominator.
-- First/second-shopper thresholds remain per deduplicated shopper; trips three and
-- later must not disappear from the independently reported qualifying-trip total.

create or replace function rg01_private.freeze_run_derived_core(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r rg01_private.rg01_runs%rowtype; cutoff timestamptz:=statement_timestamp(); md bytea; hd bytea; b text[]:=array[]::text[];
declare first_count bigint; second_count bigint; active_count bigint; current_count bigint; flyer_count bigint; defect_count bigint; support_count bigint; trip_count bigint; ca bigint; cr bigint; cab bigint;
begin
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state<>'collecting' then raise exception using errcode='55000',message='rg01_run_not_collecting'; end if;
  if not rg01_private.release_is_active(r.release_id) then raise exception using errcode='55000',message='rg01_release_not_active'; end if;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc)
  insert into rg01_private.rg01_run_subjects(run_id,subject_id,dedup_hmac,key_version,eligible,exclusion_code)
    select p_run_id,s.subject_id,s.dedup_hmac,s.key_version,
      s.consented_at is not null and s.consented_at<=cutoff and (s.withdrawn_at is null or s.withdrawn_at>cutoff) and s.age_18_verified and s.nonprivileged_shopper and s.exclusion_code is null and s.dedup_hmac is not null,
      case when s.exclusion_code is not null then s.exclusion_code when s.consented_at is null or s.withdrawn_at<=cutoff then 'consent_withdrawn' when not s.age_18_verified then 'under_18' when not s.nonprivileged_shopper then 'privileged_account' when s.dedup_hmac is null then 'unverifiable' else null end
    from rg01_private.rg01_subject_consents s where exists(select 1 from current_facts f where f.fact_kind='trip_completion' and f.subject_id=s.subject_id and f.occurred_at>=r.window_start and f.occurred_at<r.window_end);
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc),
  q as (select f.*,row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) rn,
      lag(f.calendar_date) over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) prior_date
    from current_facts f join rg01_private.rg01_run_subjects s on s.run_id=p_run_id and s.subject_id=f.subject_id
    where f.fact_kind='trip_completion' and f.occurred_at>=r.window_start and f.occurred_at<r.window_end
      and f.calendar_date=(f.occurred_at at time zone 'America/Chicago')::date and f.count_a>=2 and f.count_b>=2
      and s.eligible and s.dedup_hmac is not null)
  select count(*) filter(where rn=1),count(*) filter(where rn=2 and calendar_date>prior_date),count(*) into first_count,second_count,trip_count from q;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc),
  q as (select f.subject_id,f.calendar_date,row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) rn,lag(f.calendar_date) over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id) prior_date
    from current_facts f join rg01_private.rg01_run_subjects s on s.run_id=p_run_id and s.subject_id=f.subject_id where f.fact_kind='trip_completion' and f.occurred_at>=r.window_start and f.occurred_at<r.window_end and f.calendar_date=(f.occurred_at at time zone 'America/Chicago')::date and f.count_a>=2 and f.count_b>=2 and s.eligible)
  update rg01_private.rg01_run_subjects rs set first_trip_counted=x.first_ok,second_trip_counted=x.second_ok from (select subject_id,bool_or(rn=1) first_ok,bool_or(rn=2 and calendar_date>prior_date) second_ok from q where rn<=2 group by subject_id) x where rs.run_id=p_run_id and rs.subject_id=x.subject_id;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc)
  select count(*),count(*) filter(where flag) into active_count,current_count from current_facts where fact_kind='listing' and occurred_at<r.window_end;
  with current_listings as (select distinct on(authoritative_source_id) store_id from rg01_private.rg01_source_facts where fact_kind='listing' and recorded_at<=cutoff and occurred_at<r.window_end and code='active_discoverable' and rg01_private.source_fact_matches_authority(fact_id) order by authoritative_source_id,source_version desc)
  select count(*) into flyer_count from rg01_private.rg01_flyer_consents f where f.consented_at<=cutoff and (f.withdrawn_at is null or f.withdrawn_at>cutoff) and rg01_private.flyer_consent_matches_authority(f.store_id) and exists(select 1 from current_listings l where l.store_id=f.store_id);
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc)
  select count(*) into defect_count from current_facts where fact_kind='defect' and occurred_at<r.window_end and flag;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc)
  select count(*) into support_count from current_facts where fact_kind='support_case' and occurred_at>=r.window_start and occurred_at<r.window_end;
  with current_facts as (select distinct on(fact_kind,authoritative_source_id) * from rg01_private.rg01_source_facts where recorded_at<=cutoff and rg01_private.source_fact_matches_authority(fact_id) order by fact_kind,authoritative_source_id,source_version desc)
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

revoke all on function rg01_private.freeze_run_derived_core(uuid) from public,anon,authenticated,
  rg01_source_service,rg01_calculation_service,rg01_signature_service,rg01_lifecycle_service,
  rg01_evidence_service;
