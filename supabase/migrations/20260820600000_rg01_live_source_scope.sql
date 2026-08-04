-- RG-01 live source correction: include current post-release critical defects
-- and every support case explicitly scoped to the active Topeka release.

grant rg01_automation to postgres;
grant create on schema rg01_private to rg01_automation;

create table rg01_private.rg01_release_defect_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  defect_id uuid not null,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  version bigint not null check(version>0),
  severity text not null check(severity in ('blocking','privacy','security','data_loss')),
  state text not null check(state in ('open','resolved')),
  occurred_at timestamptz not null,
  source_digest bytea not null check(octet_length(source_digest)=32),
  recorded_at timestamptz not null default statement_timestamp(),
  unique(release_id,defect_id,version),
  check(recorded_at>=occurred_at)
);
create index rg01_release_defect_current
  on rg01_private.rg01_release_defect_events(release_id,defect_id,version desc);
create trigger rg01_release_defect_append_only before update or delete
  on rg01_private.rg01_release_defect_events for each row
  execute function rg01_private.deny_mutation();

create or replace function rg01_private.record_release_defect_event(
  p_release_id uuid,p_defect_id uuid,p_expected_prior_version bigint,p_severity text,
  p_state text,p_occurred_at timestamptz,p_source_digest bytea
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_version bigint; eid uuid;
begin
  if p_release_id is null or p_defect_id is null
    or p_severity not in ('blocking','privacy','security','data_loss')
    or p_state not in ('open','resolved') or p_occurred_at is null
    or p_occurred_at>statement_timestamp() or octet_length(p_source_digest)<>32
    or p_release_id<>rg01_private.bound_release_id() then
    raise exception using errcode='22023',message='rg01_release_defect_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_release_id::text||'|'||p_defect_id::text,0));
  select coalesce(max(version),0) into current_version
    from rg01_private.rg01_release_defect_events
    where release_id=p_release_id and defect_id=p_defect_id;
  if current_version<>p_expected_prior_version then
    raise exception using errcode='40001',message='rg01_release_defect_version_conflict';
  end if;
  insert into rg01_private.rg01_release_defect_events(
    defect_id,release_id,version,severity,state,occurred_at,source_digest
  ) values(
    p_defect_id,p_release_id,current_version+1,p_severity,p_state,p_occurred_at,p_source_digest
  ) returning event_id into eid;
  return eid;
end $$;

create or replace function rg01_private.support_case_in_scope(p_case_id uuid,p_release_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  with eligible_stores as (
    select s.id from release_private.release_frozen_stores fs
    join app_public.stores s on s.id=fs.store_id
    join app_public.catalog_areas a on a.id=s.area_id and a.slug='topeka-ks'
    where fs.release_id=p_release_id and not s.synthetic and s.audience='public'
      and s.publication_state='active'
  ), scoped_trips as (
    select distinct t.trip_id,t.owner_id from trip_private.trips t
    join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    where exists(select 1 from trip_private.trip_stops ts join eligible_stores s on s.id=ts.store_id
      where ts.trip_id=t.trip_id and ts.kind='store')
  )
  select exists(select 1 from admin_private.admin_review_cases c
    where c.case_id=p_case_id and c.case_type='support' and (
      c.store_id in (select id from eligible_stores)
      or (c.store_id is null and c.target_kind='trip' and c.target_id in (select trip_id from scoped_trips))
      or (c.store_id is null and c.target_kind='account' and c.target_id in (select owner_id from scoped_trips))
      or (c.store_id is null and c.target_kind in ('general','regional_release') and c.target_id=p_release_id)
    ))
$$;

create or replace function rg01_private.authoritative_source_ids()
returns table(fact_kind text,source_id uuid)
language sql stable security definer set search_path='' as $$
  with bound as (select rg01_private.bound_release_id() release_id),
  frozen as (select fs.store_id from release_private.release_frozen_stores fs join bound b on b.release_id=fs.release_id),
  eligible_stores as (
    select s.id from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id
    join frozen f on f.store_id=s.id
    where not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks'
  ), evidence as (select rg01_private.readiness_run_for_release(release_id) run_id from bound),
  current_release_defects as (
    select distinct on(d.defect_id) d.* from rg01_private.rg01_release_defect_events d
    join bound b on b.release_id=d.release_id order by d.defect_id,d.version desc
  )
  select 'trip_completion'::text,t.trip_id from trip_private.trips t
    join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    join rg01_private.rg01_subject_consents sc on sc.user_id=t.owner_id
    where t.state='completed' and exists(select 1 from trip_private.trip_stops ts join eligible_stores s on s.id=ts.store_id
      where ts.trip_id=t.trip_id and ts.kind='store' and ts.state='completed' and ts.completed_at is not null)
  union all select 'listing',s.id from eligible_stores s
  union all select 'defect',f.fact_id from readiness_private.readiness_fact_events f join evidence e on e.run_id=f.run_id
    where f.fact_kind='defect' and f.payload->>'severity' in ('blocking','privacy','security','data_loss')
  union all select 'defect',d.defect_id from current_release_defects d where d.state='open'
  union all select 'support_case',c.case_id from admin_private.admin_review_cases c cross join bound b
    where rg01_private.support_case_in_scope(c.case_id,b.release_id)
  union all select 'claim_attempt',c.claim_id from partner_private.listing_claims c join eligible_stores s on s.id=c.store_id
    where c.state in ('approved','rejected') and c.submitted_at is not null
$$;

alter function rg01_private.derive_source_fact(text,uuid)
  rename to derive_source_fact_before_live_scope;

create or replace function rg01_private.derive_source_fact(p_fact_kind text,p_source_id uuid)
returns table(derived_source_version bigint,derived_source_digest bytea,derived_subject_id uuid,
  derived_store_id uuid,derived_occurred_at timestamptz,derived_calendar_date date,
  derived_count_a integer,derived_count_b integer,derived_flag boolean,derived_code text)
language plpgsql stable security definer set search_path='' as $$
declare bound uuid:=rg01_private.bound_release_id();
begin
  if bound is null then return; end if;
  if p_fact_kind='defect' and exists(select 1 from rg01_private.rg01_release_defect_events
      where release_id=bound and defect_id=p_source_id) then
    return query select d.version,
      extensions.digest(convert_to(jsonb_build_object('kind','defect','releaseId',bound,
        'defectId',d.defect_id,'version',d.version,'severity',d.severity,'state',d.state,
        'occurredAt',d.occurred_at,'sourceDigest',encode(d.source_digest,'hex'))::text,'utf8'),'sha256'),
      null::uuid,null::uuid,d.occurred_at,null::date,null::integer,null::integer,
      (d.state='open'),d.severity
    from rg01_private.rg01_release_defect_events d
    where d.release_id=bound and d.defect_id=p_source_id order by d.version desc limit 1;
  elsif p_fact_kind='support_case' and rg01_private.support_case_in_scope(p_source_id,bound) then
    return query select c.version,
      extensions.digest(convert_to(jsonb_build_object('kind','support_case','releaseId',bound,
        'caseId',c.case_id,'scope',c.target_kind,'storeId',c.store_id,'state',c.state,
        'version',c.version,'createdAt',c.created_at)::text,'utf8'),'sha256'),
      null::uuid,null::uuid,c.created_at,null::date,null::integer,null::integer,null::boolean,null::text
    from admin_private.admin_review_cases c where c.case_id=p_source_id;
  else
    return query select * from rg01_private.derive_source_fact_before_live_scope(p_fact_kind,p_source_id);
  end if;
end $$;

-- Rebind the authority comparator after the prior derivation function was renamed.
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

alter table rg01_private.rg01_release_defect_events enable row level security;
alter table rg01_private.rg01_release_defect_events force row level security;
revoke all on rg01_private.rg01_release_defect_events from public,anon,authenticated;
grant select,insert on rg01_private.rg01_release_defect_events to rg01_automation;
create policy rg01_automation_release_defects on rg01_private.rg01_release_defect_events
  for all to rg01_automation using(true) with check(true);

alter function rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea) owner to rg01_automation;
alter function rg01_private.support_case_in_scope(uuid,uuid) owner to rg01_automation;
alter function rg01_private.authoritative_source_ids() owner to rg01_automation;
alter function rg01_private.derive_source_fact(text,uuid) owner to rg01_automation;
alter function rg01_private.derive_source_fact_before_live_scope(text,uuid) owner to rg01_automation;
alter function rg01_private.source_fact_matches_authority(uuid) owner to rg01_automation;
revoke all on function rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea),
  rg01_private.support_case_in_scope(uuid,uuid),rg01_private.derive_source_fact_before_live_scope(text,uuid)
  from public,anon,authenticated;
grant execute on function rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea)
  to rg01_source_service;
revoke create on schema rg01_private from rg01_automation;
revoke rg01_automation from postgres;
