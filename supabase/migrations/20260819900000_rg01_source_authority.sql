-- RG-01 source-boundary correction: callers identify a domain row, but the
-- database derives every count, flag, version, timestamp, and digest from the
-- authoritative server record. Freeze synchronizes and revalidates the full
-- source set; later domain changes alter the live authority head and invalidate
-- an otherwise current receipt.

grant rg01_automation,identity_service to postgres;
grant create on schema rg01_private,app_public to rg01_automation;
grant usage on schema app_public,app_private,trip_private,readiness_private,admin_private,partner_private to rg01_automation;
grant select on app_public.catalog_areas,app_public.stores,app_public.store_fact_verifications,
  app_private.role_grants,app_private.privileged_audit_events,
  trip_private.trips,trip_private.trip_stops,
  readiness_private.readiness_fact_events,admin_private.admin_review_cases,
  partner_private.listing_claims to rg01_automation;
grant execute on function app_public.catalog_freshness(uuid,timestamptz) to rg01_automation;

create policy rg01_authority_catalog_areas on app_public.catalog_areas for select to rg01_automation using(true);
create policy rg01_authority_stores on app_public.stores for select to rg01_automation using(true);
create policy rg01_authority_store_verifications on app_public.store_fact_verifications for select to rg01_automation using(true);
create policy rg01_authority_role_grants on app_private.role_grants for select to rg01_automation using(true);
create policy rg01_authority_audit_events on app_private.privileged_audit_events for select to rg01_automation using(true);
create policy rg01_authority_trips on trip_private.trips for select to rg01_automation using(true);
create policy rg01_authority_trip_stops on trip_private.trip_stops for select to rg01_automation using(true);
create policy rg01_authority_readiness_facts on readiness_private.readiness_fact_events for select to rg01_automation using(true);
create policy rg01_authority_admin_cases on admin_private.admin_review_cases for select to rg01_automation using(true);
create policy rg01_authority_listing_claims on partner_private.listing_claims for select to rg01_automation using(true);
grant select on rg01_private.rg01_capability to identity_service;
create policy rg01_identity_capability_read on rg01_private.rg01_capability for select to identity_service using(true);
grant execute on function rg01_private.release_is_active(uuid) to identity_service;
create policy rg01_identity_public_flyer_store on app_public.stores for select to identity_service
  using(not synthetic and audience='public' and publication_state='active'
    and exists(select 1 from app_public.catalog_areas a where a.id=area_id and a.slug='topeka-ks'));

create or replace function rg01_private.derive_source_fact(p_fact_kind text,p_source_id uuid)
returns table(
  derived_source_version bigint,derived_source_digest bytea,derived_subject_id uuid,
  derived_store_id uuid,derived_occurred_at timestamptz,derived_calendar_date date,
  derived_count_a integer,derived_count_b integer,derived_flag boolean,derived_code text
)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_fact_kind='trip_completion' then
    return query
    with stop_facts as (
      select t.trip_id,
        count(distinct ts.store_id) filter(where s.id is not null)::integer active_store_count,
        count(distinct ts.store_id) filter(where s.id is not null and ts.state='completed' and ts.completed_at is not null)::integer completed_store_count,
        max(ts.completed_at) filter(where s.id is not null and ts.state='completed') completed_at,
        coalesce(jsonb_agg(jsonb_build_object('stopId',ts.stop_id,'storeId',ts.store_id,'state',ts.state,
          'completedAt',ts.completed_at,'version',ts.version) order by ts.position,ts.stop_id)
          filter(where s.id is not null),'[]'::jsonb) stop_manifest
      from trip_private.trips t
      left join trip_private.trip_stops ts on ts.trip_id=t.trip_id and ts.kind='store'
      left join app_public.stores s on s.id=ts.store_id and not s.synthetic and s.audience='public'
        and s.publication_state='active'
        and exists(select 1 from app_public.catalog_areas sa where sa.id=s.area_id and sa.slug='topeka-ks')
      where t.trip_id=p_source_id
      group by t.trip_id
    )
    select t.version,
      extensions.digest(convert_to(jsonb_build_object('kind','trip_completion','tripId',t.trip_id,
        'ownerId',t.owner_id,'area','topeka-ks','localDate',t.local_date,'state',t.state,
        'version',t.version,'activeStoreCount',sf.active_store_count,
        'completedStoreCount',sf.completed_store_count,'completedAt',sf.completed_at,
        'stops',sf.stop_manifest)::text,'utf8'),'sha256'),
      sc.subject_id,null::uuid,sf.completed_at,t.local_date,sf.active_store_count,
      sf.completed_store_count,null::boolean,null::text
    from trip_private.trips t
    join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    join rg01_private.rg01_subject_consents sc on sc.user_id=t.owner_id
    join stop_facts sf on sf.trip_id=t.trip_id
    where t.trip_id=p_source_id and t.state='completed' and sf.completed_at is not null;
  elsif p_fact_kind='listing' then
    return query
    with listing as (
      select s.*,a.slug area_slug,f.freshness_state,f.oldest_verified_at,
        v.latest_verified_at,v.verification_manifest
      from app_public.stores s
      join app_public.catalog_areas a on a.id=s.area_id
      cross join lateral app_public.catalog_freshness(s.id,statement_timestamp()) f
      cross join lateral (
        select max(sv.verified_at) latest_verified_at,
          coalesce(jsonb_agg(jsonb_build_object('group',sv.verification_group,'verifiedAt',sv.verified_at,
            'verifierKind',sv.verifier_kind,'provenanceDigest',encode(extensions.digest(convert_to(sv.provenance_label,'utf8'),'sha256'),'hex'))
            order by sv.verification_group),'[]'::jsonb) verification_manifest
        from app_public.store_fact_verifications sv where sv.store_id=s.id
      ) v
      where s.id=p_source_id and not s.synthetic and s.audience='public'
        and s.publication_state='active' and a.slug='topeka-ks'
    )
    select greatest(1,floor(extract(epoch from greatest(l.updated_at,coalesce(l.latest_verified_at,l.updated_at)))*1000000)::bigint),
      extensions.digest(convert_to(jsonb_build_object('kind','listing','storeId',l.id,'area',l.area_slug,
        'audience',l.audience,'publicationState',l.publication_state,'updatedAt',l.updated_at,
        'freshnessState',l.freshness_state,'oldestVerifiedAt',l.oldest_verified_at,
        'verifications',l.verification_manifest)::text,'utf8'),'sha256'),
      null::uuid,l.id,greatest(l.updated_at,coalesce(l.latest_verified_at,l.updated_at)),null::date,
      null::integer,null::integer,(l.freshness_state='current'),'active_discoverable'::text
    from listing l;
  elsif p_fact_kind='defect' then
    return query
    select greatest(1,floor(extract(epoch from f.recorded_at)*1000000)::bigint),
      extensions.digest(convert_to(jsonb_build_object('kind','defect','factId',f.fact_id,
        'readinessRunId',f.run_id,'severity',f.payload->>'severity',
        'resolved',(f.payload->>'resolved')::boolean,'occurredAt',f.occurred_at,
        'factDigest',encode(f.fact_digest,'hex'))::text,'utf8'),'sha256'),
      null::uuid,null::uuid,f.occurred_at,null::date,null::integer,null::integer,
      not (f.payload->>'resolved')::boolean,f.payload->>'severity'
    from readiness_private.readiness_fact_events f
    where f.fact_id=p_source_id and f.fact_kind='defect'
      and f.payload->>'severity' in ('blocking','privacy','security','data_loss');
  elsif p_fact_kind='support_case' then
    return query
    select c.version,
      extensions.digest(convert_to(jsonb_build_object('kind','support_case','caseId',c.case_id,
        'storeId',c.store_id,'state',c.state,'version',c.version,'createdAt',c.created_at)::text,'utf8'),'sha256'),
      null::uuid,null::uuid,c.created_at,null::date,null::integer,null::integer,null::boolean,null::text
    from admin_private.admin_review_cases c
    where c.case_id=p_source_id and c.case_type='support';
  elsif p_fact_kind='claim_attempt' then
    return query
    select c.version,
      extensions.digest(convert_to(jsonb_build_object('kind','claim_attempt','claimId',c.claim_id,
        'storeId',c.store_id,'state',c.state,'version',c.version,'submittedAt',c.submitted_at,
        'approvedAt',c.approved_at,'revokedAt',c.revoked_at,'disposition',
        case when c.state='approved' then 'approved'
          when exists(select 1 from app_private.privileged_audit_events ae where ae.resource_kind='listing_claim'
            and ae.resource_id=c.claim_id and ae.action='partner_claim_reject' and ae.reason_code='abusive_attempt'
            and ae.outcome='completed') then 'abusive' else 'rejected' end)::text,'utf8'),'sha256'),
      null::uuid,c.store_id,coalesce(c.submitted_at,c.updated_at,c.created_at),null::date,
      null::integer,null::integer,null::boolean,
      case when c.state='approved' then 'approved'
        when exists(select 1 from app_private.privileged_audit_events ae where ae.resource_kind='listing_claim'
          and ae.resource_id=c.claim_id and ae.action='partner_claim_reject' and ae.reason_code='abusive_attempt'
          and ae.outcome='completed') then 'abusive' else 'rejected' end
    from partner_private.listing_claims c
    where c.claim_id=p_source_id and c.state in ('approved','rejected') and c.submitted_at is not null;
  else
    raise exception using errcode='22023',message='rg01_source_kind_invalid';
  end if;
end $$;

create or replace function rg01_private.authoritative_source_ids()
returns table(fact_kind text,source_id uuid)
language sql stable security definer set search_path='' as $$
  select 'trip_completion'::text,t.trip_id from trip_private.trips t
    join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    join rg01_private.rg01_subject_consents sc on sc.user_id=t.owner_id
    where t.state='completed' and exists(select 1 from trip_private.trip_stops ts where ts.trip_id=t.trip_id and ts.kind='store' and ts.state='completed' and ts.completed_at is not null)
  union all
  select 'listing',s.id from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id
    where not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks'
  union all
  select 'defect',f.fact_id from readiness_private.readiness_fact_events f
    where f.fact_kind='defect' and f.payload->>'severity' in ('blocking','privacy','security','data_loss')
  union all
  select 'support_case',c.case_id from admin_private.admin_review_cases c where c.case_type='support'
  union all
  select 'claim_attempt',c.claim_id from partner_private.listing_claims c
    where c.state in ('approved','rejected') and c.submitted_at is not null
$$;

create or replace function rg01_private.record_source_fact(p_fact_kind text,p_source_id uuid,p_source_version bigint,p_source_digest bytea,p_subject_id uuid,p_store_id uuid,p_occurred_at timestamptz,p_calendar_date date,p_count_a integer,p_count_b integer,p_flag boolean,p_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d record; fid uuid;
begin
  if not (select collection_enabled and rg01_private.release_is_active(release_id) from rg01_private.rg01_capability where singleton_id=1) then
    raise exception using errcode='55000',message='rg01_collection_disabled';
  end if;
  select * into d from rg01_private.derive_source_fact(p_fact_kind,p_source_id);
  if not found then raise exception using errcode='22023',message='rg01_authoritative_source_unavailable'; end if;
  if p_source_version is distinct from d.derived_source_version
    or p_source_digest is distinct from d.derived_source_digest
    or p_subject_id is distinct from d.derived_subject_id
    or p_store_id is distinct from d.derived_store_id
    or p_occurred_at is distinct from d.derived_occurred_at
    or p_calendar_date is distinct from d.derived_calendar_date
    or p_count_a is distinct from d.derived_count_a
    or p_count_b is distinct from d.derived_count_b
    or p_flag is distinct from d.derived_flag
    or p_code is distinct from d.derived_code then
    raise exception using errcode='22023',message='rg01_source_assertion_mismatch';
  end if;
  insert into rg01_private.rg01_source_facts(fact_kind,authoritative_source_id,source_version,source_digest,subject_id,store_id,occurred_at,calendar_date,count_a,count_b,flag,code)
    values(p_fact_kind,p_source_id,d.derived_source_version,d.derived_source_digest,d.derived_subject_id,d.derived_store_id,d.derived_occurred_at,d.derived_calendar_date,d.derived_count_a,d.derived_count_b,d.derived_flag,d.derived_code)
    on conflict(fact_kind,authoritative_source_id,source_version) do nothing returning fact_id into fid;
  if fid is null then
    select f.fact_id into fid from rg01_private.rg01_source_facts f
      where f.fact_kind=p_fact_kind and f.authoritative_source_id=p_source_id
        and f.source_version=d.derived_source_version and f.source_digest=d.derived_source_digest;
    if fid is null then raise exception using errcode='22023',message='rg01_authoritative_source_version_collision'; end if;
  end if;
  return fid;
end $$;

create or replace function rg01_private.source_fact_matches_authority(p_fact_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select f.source_version is not distinct from d.derived_source_version
      and f.source_digest is not distinct from d.derived_source_digest
      and f.subject_id is not distinct from d.derived_subject_id
      and f.store_id is not distinct from d.derived_store_id
      and f.occurred_at is not distinct from d.derived_occurred_at
      and f.calendar_date is not distinct from d.derived_calendar_date
      and f.count_a is not distinct from d.derived_count_a
      and f.count_b is not distinct from d.derived_count_b
      and f.flag is not distinct from d.derived_flag and f.code is not distinct from d.derived_code
    from rg01_private.rg01_source_facts f
    cross join lateral rg01_private.derive_source_fact(f.fact_kind,f.authoritative_source_id) d
    where f.fact_id=p_fact_id),false)
$$;

create or replace function rg01_private.sync_authoritative_source_facts()
returns integer language plpgsql security definer set search_path='' as $$
declare src record; d record; synced integer:=0;
begin
  for src in select * from rg01_private.authoritative_source_ids() order by fact_kind,source_id loop
    select * into d from rg01_private.derive_source_fact(src.fact_kind,src.source_id);
    if not found then raise exception using errcode='55000',message='rg01_authoritative_source_unstable'; end if;
    perform rg01_private.record_source_fact(src.fact_kind,src.source_id,d.derived_source_version,
      d.derived_source_digest,d.derived_subject_id,d.derived_store_id,d.derived_occurred_at,
      d.derived_calendar_date,d.derived_count_a,d.derived_count_b,d.derived_flag,d.derived_code);
    synced:=synced+1;
  end loop;
  return synced;
end $$;

create or replace function rg01_private.authoritative_source_coverage_complete()
returns boolean language sql stable security definer set search_path='' as $$
  with expected as (select * from rg01_private.authoritative_source_ids()),
  latest as (select distinct on(f.fact_kind,f.authoritative_source_id) f.*
    from rg01_private.rg01_source_facts f
    order by f.fact_kind,f.authoritative_source_id,f.source_version desc)
  select not exists(
    select 1 from expected e left join latest l
      on l.fact_kind=e.fact_kind and l.authoritative_source_id=e.source_id
    where l.fact_id is null or not rg01_private.source_fact_matches_authority(l.fact_id)
  )
$$;

create or replace function rg01_private.authoritative_source_head_digest()
returns bytea language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(coalesce(jsonb_agg(jsonb_build_object('kind',s.fact_kind,
      'sourceId',s.source_id,'sourceVersion',d.derived_source_version,
      'sourceDigest',encode(d.derived_source_digest,'hex')) order by s.fact_kind,s.source_id),'[]'::jsonb)::text,'utf8'),'sha256')
  from rg01_private.authoritative_source_ids() s
  cross join lateral rg01_private.derive_source_fact(s.fact_kind,s.source_id) d
$$;

create or replace function rg01_private.flyer_consent_matches_authority(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from rg01_private.rg01_flyer_consents f
    join app_public.stores s on s.id=f.store_id and not s.synthetic and s.audience='public' and s.publication_state='active'
    join app_public.catalog_areas a on a.id=s.area_id and a.slug='topeka-ks'
    join app_private.role_grants g on g.subject_user_id=f.representative_user_id and g.role='representative'
      and g.store_id=f.store_id and g.state='active'
    where f.store_id=p_store_id
  )
$$;

create or replace function rg01_private.source_head_digest()
returns bytea language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(jsonb_build_object(
    'facts',coalesce((select jsonb_agg(x order by kind,source_id,source_version) from (
      select fact_kind kind,authoritative_source_id source_id,source_version,encode(source_digest,'hex') digest from rg01_private.rg01_source_facts) x),'[]'),
    'authoritativeSourceHead',encode(rg01_private.authoritative_source_head_digest(),'hex'),
    'subjects',coalesce((select jsonb_agg(x order by receipt_label) from (
      select receipt_label,consented_at,withdrawn_at,age_18_verified,nonprivileged_shopper,exclusion_code from rg01_private.rg01_subject_consents) x),'[]'),
    'flyers',coalesce((select jsonb_agg(x order by store_id) from (
      select store_id,consented_at,withdrawn_at,encode(source_receipt_digest,'hex') source_digest,
        rg01_private.flyer_consent_matches_authority(store_id) authority_current
      from rg01_private.rg01_flyer_consents) x),'[]')
  )::text,'utf8'),'sha256')
$$;

alter function rg01_private.freeze_run(uuid) rename to freeze_run_derived_core;
revoke all on function rg01_private.freeze_run_derived_core(uuid) from public,anon,authenticated,rg01_calculation_service;

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
  select count(*) filter(where rn=1),count(*) filter(where rn=2 and calendar_date>prior_date),count(*) into first_count,second_count,trip_count from q where rn<=2;
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

create or replace function rg01_private.freeze_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform rg01_private.sync_authoritative_source_facts();
  if not rg01_private.authoritative_source_coverage_complete() then
    raise exception using errcode='55000',message='rg01_authoritative_source_incomplete_or_changed';
  end if;
  if exists(select 1 from rg01_private.rg01_flyer_consents f
      where f.withdrawn_at is null and not rg01_private.flyer_consent_matches_authority(f.store_id)) then
    raise exception using errcode='55000',message='rg01_flyer_authority_changed';
  end if;
  -- The delegated immutable calculator retains deterministic
  -- row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id),
  -- calendar_date>prior_date, claim_attempt, and claim_approved calculations.
  return rg01_private.freeze_run_derived_core(p_run_id);
end $$;

create or replace function app_public.rg01_set_own_consent(p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_public.request_user_id();
begin
  if not (select collection_enabled and rg01_private.release_is_active(release_id) from rg01_private.rg01_capability where singleton_id=1) then
    raise exception using errcode='55000',message='rg01_collection_disabled';
  end if;
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

create or replace function app_public.rg01_set_flyer_consent(p_store_id uuid,p_consent boolean,p_source_receipt_digest bytea)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_public.request_user_id();
begin
  if not (select collection_enabled and rg01_private.release_is_active(release_id) from rg01_private.rg01_capability where singleton_id=1) then
    raise exception using errcode='55000',message='rg01_collection_disabled';
  end if;
  if uid is null or p_store_id is null or octet_length(p_source_receipt_digest)<>32
    or not app_private.current_user_has_role('representative'::app_private.app_role,p_store_id)
    or not exists(select 1 from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id
      where s.id=p_store_id and not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks')
    then raise exception using errcode='42501',message='rg01_representative_store_required'; end if;
  if p_consent then
    insert into rg01_private.rg01_flyer_consents(store_id,representative_user_id,consented_at,source_receipt_digest)
      values(p_store_id,uid,statement_timestamp(),p_source_receipt_digest)
      on conflict(store_id) do update set representative_user_id=uid,consented_at=statement_timestamp(),withdrawn_at=null,source_receipt_digest=p_source_receipt_digest;
  else
    update rg01_private.rg01_flyer_consents set withdrawn_at=statement_timestamp()
      where store_id=p_store_id and representative_user_id=uid;
  end if;
end $$;

alter function rg01_private.derive_source_fact(text,uuid) owner to rg01_automation;
alter function rg01_private.authoritative_source_ids() owner to rg01_automation;
alter function rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text) owner to rg01_automation;
alter function rg01_private.source_fact_matches_authority(uuid) owner to rg01_automation;
alter function rg01_private.sync_authoritative_source_facts() owner to rg01_automation;
alter function rg01_private.authoritative_source_coverage_complete() owner to rg01_automation;
alter function rg01_private.authoritative_source_head_digest() owner to rg01_automation;
alter function rg01_private.flyer_consent_matches_authority(uuid) owner to rg01_automation;
alter function rg01_private.source_head_digest() owner to rg01_automation;
alter function rg01_private.freeze_run(uuid) owner to rg01_automation;
alter function app_public.rg01_set_own_consent(boolean) owner to identity_service;
alter function app_public.rg01_set_flyer_consent(uuid,boolean,bytea) owner to identity_service;

revoke all on function rg01_private.derive_source_fact(text,uuid),rg01_private.authoritative_source_ids(),
  rg01_private.source_fact_matches_authority(uuid),rg01_private.sync_authoritative_source_facts(),
  rg01_private.authoritative_source_coverage_complete(),rg01_private.authoritative_source_head_digest(),
  rg01_private.flyer_consent_matches_authority(uuid),rg01_private.source_head_digest(),
  rg01_private.freeze_run_derived_core(uuid) from public,anon,authenticated,rg01_source_service,
  rg01_calculation_service,rg01_signature_service,rg01_lifecycle_service,rg01_evidence_service;
revoke all on function rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text),
  rg01_private.freeze_run(uuid) from public,anon,authenticated;
grant execute on function rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text) to rg01_source_service;
grant execute on function rg01_private.freeze_run(uuid) to rg01_calculation_service;
revoke all on function app_public.rg01_set_own_consent(boolean),app_public.rg01_set_flyer_consent(uuid,boolean,bytea) from public,anon;
grant execute on function app_public.rg01_set_own_consent(boolean),app_public.rg01_set_flyer_consent(uuid,boolean,bytea) to authenticated;

revoke create on schema rg01_private,app_public from rg01_automation;
revoke rg01_automation,identity_service from postgres;
