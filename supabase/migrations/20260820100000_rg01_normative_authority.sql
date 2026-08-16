-- RG-01 normative authority correction.  The expansion gate reuses the
-- Package 10A responsibility model, binds every signing capability to one
-- frozen digest, and limits collection to the exact signed Topeka release.

grant rg01_automation,identity_service,release_automation to postgres;
grant create on schema readiness_private,rg01_private,app_public to rg01_automation;
grant create on schema app_public to identity_service;
grant usage on schema release_private to rg01_automation;
grant create on schema release_private to release_automation;
grant select on release_private.regional_releases,release_private.release_capabilities,
  release_private.release_evidence_receipts,release_private.release_frozen_stores,
  release_private.release_gate_receipts,release_private.release_actor_approvals to rg01_automation;
create policy rg01_release_rows on release_private.regional_releases for select to rg01_automation using(true);
create policy rg01_release_capabilities on release_private.release_capabilities for select to rg01_automation using(true);
create policy rg01_release_evidence_receipts on release_private.release_evidence_receipts for select to rg01_automation using(true);
create policy rg01_release_frozen_stores on release_private.release_frozen_stores for select to rg01_automation using(true);
create policy rg01_release_gate_receipts on release_private.release_gate_receipts for select to rg01_automation using(true);
create policy rg01_release_actor_approvals on release_private.release_actor_approvals for select to rg01_automation using(true);

create table readiness_private.evidence_responsibility_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  responsibility text not null check(responsibility in ('ProductOwner','PrimaryInternalTester','Engineering','Security','Operations')),
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  source_receipt_id uuid not null references release_private.release_gate_receipts(gate_receipt_id) on delete restrict,
  state text not null default 'active' check(state in ('active','revoked')),
  version bigint not null default 1 check(version>0),
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  check((state='active' and user_id is not null and revoked_at is null) or (state='revoked' and revoked_at is not null))
);
create unique index evidence_one_active_responsibility
  on readiness_private.evidence_responsibility_grants(user_id,responsibility) where state='active';

create table readiness_private.gate_signing_capabilities (
  capability_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null unique check(octet_length(token_hash)=32),
  challenge_id uuid not null unique references rg01_private.rg01_signing_challenges(challenge_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  responsibility text not null check(responsibility='ProductOwner'),
  gate_kind text not null check(gate_kind='rg01'),
  frozen_digest bytea not null check(octet_length(frozen_digest)=32),
  grant_id uuid not null references readiness_private.evidence_responsibility_grants(grant_id) on delete restrict,
  grant_version bigint not null check(grant_version>0),
  state text not null default 'issued' check(state in ('issued','consumed','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz,
  constraint gate_signing_capability_window check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  check((state='consumed' and consumed_at is not null) or (state<>'consumed' and consumed_at is null))
);
create unique index one_live_rg01_capability
  on readiness_private.gate_signing_capabilities(user_id,gate_kind,frozen_digest) where state='issued';

create or replace function readiness_private.revoke_deleted_evidence_responsibility()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.state:='revoked'; new.revoked_at:=coalesce(new.revoked_at,statement_timestamp()); new.version:=old.version+1;
  end if;
  return new;
end $$;
create trigger evidence_responsibility_account_delete before update of user_id
  on readiness_private.evidence_responsibility_grants for each row
  execute function readiness_private.revoke_deleted_evidence_responsibility();

create or replace function readiness_private.grant_evidence_responsibility(
  p_user_id uuid,p_responsibility text,p_release_id uuid,p_source_receipt_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if p_user_id is null or p_responsibility not in ('ProductOwner','PrimaryInternalTester','Engineering','Security','Operations')
    or not rg01_private.release_is_active(p_release_id)
    or not exists(select 1 from release_private.release_gate_receipts g
      join release_private.regional_releases r on r.release_id=g.release_id
        and g.artifact_digest=r.artifact_digest and g.migration_set_digest=r.migration_set_digest
        and g.config_digest=r.config_digest and g.frozen_store_set_digest=r.frozen_store_set_digest
      where g.gate_receipt_id=p_source_receipt_id and g.release_id=p_release_id and g.gate_kind='hc_02' and g.external_verified
        and exists(select 1 from release_private.release_actor_approvals a where a.release_id=p_release_id
          and a.responsibility='ProductOwner' and a.external_verified and a.artifact_digest=r.artifact_digest
          and a.migration_set_digest=r.migration_set_digest and a.config_digest=r.config_digest and a.frozen_store_set_digest=r.frozen_store_set_digest)
        and exists(select 1 from release_private.release_actor_approvals a where a.release_id=p_release_id
          and a.responsibility='Security' and a.external_verified and a.artifact_digest=r.artifact_digest
          and a.migration_set_digest=r.migration_set_digest and a.config_digest=r.config_digest and a.frozen_store_set_digest=r.frozen_store_set_digest)) then
    raise exception using errcode='42501',message='evidence_responsibility_source_receipt_required';
  end if;
  insert into readiness_private.evidence_responsibility_grants(user_id,responsibility,release_id,source_receipt_id)
    values(p_user_id,p_responsibility,p_release_id,p_source_receipt_id) returning grant_id into rid;
  return rid;
end $$;

alter table rg01_private.rg01_capability
  add column release_receipt_id uuid references release_private.release_evidence_receipts(receipt_id) on delete restrict,
  add column release_receipt_digest bytea check(release_receipt_digest is null or octet_length(release_receipt_digest)=32),
  add constraint rg01_enabled_receipt_shape check(
    (not collection_enabled and release_id is null and release_receipt_id is null and release_receipt_digest is null)
    or (collection_enabled and release_id is not null and release_receipt_id is not null and release_receipt_digest is not null)
  );

create table rg01_private.rg01_capability_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  enabled boolean not null,
  release_id uuid references release_private.regional_releases(release_id) on delete restrict,
  release_receipt_id uuid references release_private.release_evidence_receipts(receipt_id) on delete restrict,
  release_receipt_digest bytea check(release_receipt_digest is null or octet_length(release_receipt_digest)=32),
  expected_version bigint not null,
  resulting_version bigint not null,
  changed_at timestamptz not null default statement_timestamp(),
  check(resulting_version=expected_version+1),
  check((enabled and release_id is not null and release_receipt_id is not null and release_receipt_digest is not null)
    or (not enabled and release_id is null and release_receipt_id is null and release_receipt_digest is null))
);
create trigger rg01_capability_events_immutable before update or delete on rg01_private.rg01_capability_events
  for each row execute function rg01_private.deny_mutation();

-- The legacy RG-local grant table is retained only because historical account
-- deletion migrations reference it.  It has no readers or writers capable of
-- authorizing a decision after this migration.
revoke all on rg01_private.rg01_product_owner_grants from rg01_evidence_service,identity_service;
drop policy if exists rg01_evidence_owner_grants on rg01_private.rg01_product_owner_grants;
drop policy if exists rg01_identity_owner_grant_read on rg01_private.rg01_product_owner_grants;

create or replace function rg01_private.bound_release_id()
returns uuid language sql stable security definer set search_path='' as $$
  select c.release_id from rg01_private.rg01_capability c
  where c.singleton_id=1 and c.collection_enabled
    and rg01_private.release_is_active(c.release_id)
$$;

create or replace function rg01_private.readiness_run_for_release(p_release_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select rr.run_id
  from release_private.release_gate_receipts g
  join readiness_private.readiness_receipts rr
    on rr.signed_payload_digest=g.receipt_digest and rr.decision='pass'
  where g.release_id=p_release_id and g.gate_kind='package_10a' and g.external_verified
  order by rr.verified_at desc limit 1
$$;

create or replace function rg01_private.promotion_consent_receipt_digest(p_release_id uuid,p_store_id uuid)
returns bytea language sql stable security definer set search_path='' as $$
  select g.receipt_digest
  from release_private.regional_releases r
  join release_private.release_capabilities c on c.release_id=r.release_id and c.product_promotion
  join release_private.release_gate_receipts g on g.release_id=r.release_id
    and g.gate_kind='promotion_rights_consent' and g.external_verified
    and g.artifact_digest=r.artifact_digest
    and g.migration_set_digest=r.migration_set_digest
    and g.config_digest=r.config_digest
    and g.frozen_store_set_digest=r.frozen_store_set_digest
  join release_private.release_frozen_stores fs on fs.release_id=r.release_id
    and fs.store_id=p_store_id and fs.rights_and_consent_current
  where r.release_id=p_release_id and r.region_key='topeka-ks' and r.state='active'
$$;

create or replace function release_private.lock_rg01_release(p_release_id uuid)
returns release_private.regional_releases language sql security definer set search_path='' as $$
  select r from release_private.regional_releases r where r.release_id=p_release_id for update
$$;
alter function release_private.lock_rg01_release(uuid) owner to release_automation;
revoke all on function release_private.lock_rg01_release(uuid) from public,anon,authenticated,service_role;
grant execute on function release_private.lock_rg01_release(uuid) to rg01_automation;

create or replace function rg01_private.set_collection_capability(p_enabled boolean,p_release_id uuid,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v bigint; receipt release_private.release_evidence_receipts%rowtype; rel release_private.regional_releases%rowtype;
begin
  if p_expected_version is null then raise exception using errcode='22023',message='rg01_capability_input_invalid'; end if;
  if p_enabled then
    select * into rel from release_private.lock_rg01_release(p_release_id);
    if not found or not rg01_private.release_is_active(p_release_id)
      or rel.signed_release_receipt is null or rel.signed_release_receipt !~ '^[0-9a-fA-F-]{36}$' then
      raise exception using errcode='55000',message='rg01_release_not_active';
    end if;
    select * into receipt from release_private.release_evidence_receipts e
      where e.receipt_id=rel.signed_release_receipt::uuid and e.release_id=rel.release_id
        and e.step='signed_release_receipt' and e.external_verified
        and e.artifact_digest=rel.artifact_digest and e.catalog_digest=rel.catalog_digest
        and e.prerequisite_receipt_digest=rel.prerequisite_receipt_digest;
    if not found then raise exception using errcode='55000',message='rg01_signed_release_receipt_invalid'; end if;
  elsif p_release_id is not null then
    raise exception using errcode='22023',message='rg01_disable_release_must_be_null';
  end if;
  update rg01_private.rg01_capability set collection_enabled=p_enabled,
    release_id=case when p_enabled then rel.release_id else null end,
    release_receipt_id=case when p_enabled then receipt.receipt_id else null end,
    release_receipt_digest=case when p_enabled then receipt.payload_digest else null end,
    changed_at=statement_timestamp(),version=version+1
    where singleton_id=1 and version=p_expected_version returning version into v;
  if v is null then raise exception using errcode='40001',message='rg01_capability_version_conflict'; end if;
  insert into rg01_private.rg01_capability_events(enabled,release_id,release_receipt_id,release_receipt_digest,expected_version,resulting_version)
    values(p_enabled,case when p_enabled then rel.release_id else null end,
      case when p_enabled then receipt.receipt_id else null end,
      case when p_enabled then receipt.payload_digest else null end,p_expected_version,v);
  return v;
end $$;

create or replace function rg01_private.authoritative_source_ids()
returns table(fact_kind text,source_id uuid)
language sql stable security definer set search_path='' as $$
  with bound as (select rg01_private.bound_release_id() release_id),
  frozen as (select fs.store_id from release_private.release_frozen_stores fs join bound b on b.release_id=fs.release_id),
  eligible_stores as (
    select s.id from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id
    join frozen f on f.store_id=s.id
    where not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks'
  ), evidence as (select rg01_private.readiness_run_for_release(release_id) run_id from bound)
  select 'trip_completion'::text,t.trip_id from trip_private.trips t
    join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    join rg01_private.rg01_subject_consents sc on sc.user_id=t.owner_id
    where t.state='completed' and exists(select 1 from trip_private.trip_stops ts join eligible_stores s on s.id=ts.store_id
      where ts.trip_id=t.trip_id and ts.kind='store' and ts.state='completed' and ts.completed_at is not null)
  union all
  select 'listing',s.id from eligible_stores s
  union all
  select 'defect',f.fact_id from readiness_private.readiness_fact_events f join evidence e on e.run_id=f.run_id
    where f.fact_kind='defect' and f.payload->>'severity' in ('blocking','privacy','security','data_loss')
  union all
  select 'support_case',c.case_id from admin_private.admin_review_cases c join eligible_stores s on s.id=c.store_id
    where c.case_type='support' and c.store_id is not null
  union all
  select 'claim_attempt',c.claim_id from partner_private.listing_claims c join eligible_stores s on s.id=c.store_id
    where c.state in ('approved','rejected') and c.submitted_at is not null
$$;

create or replace function rg01_private.derive_source_fact(p_fact_kind text,p_source_id uuid)
returns table(derived_source_version bigint,derived_source_digest bytea,derived_subject_id uuid,
  derived_store_id uuid,derived_occurred_at timestamptz,derived_calendar_date date,
  derived_count_a integer,derived_count_b integer,derived_flag boolean,derived_code text)
language plpgsql stable security definer set search_path='' as $$
declare bound uuid:=rg01_private.bound_release_id();
begin
  if bound is null then return; end if;
  if p_fact_kind='trip_completion' then
    return query with eligible_stores as (
      select s.id from release_private.release_frozen_stores fs join app_public.stores s on s.id=fs.store_id
      join app_public.catalog_areas a on a.id=s.area_id
      where fs.release_id=bound and not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks'),
    stop_facts as (select t.trip_id,count(distinct ts.store_id) filter(where s.id is not null)::integer active_store_count,
      count(distinct ts.store_id) filter(where s.id is not null and ts.state='completed' and ts.completed_at is not null)::integer completed_store_count,
      max(ts.completed_at) filter(where s.id is not null and ts.state='completed') completed_at,
      coalesce(jsonb_agg(jsonb_build_object('stopId',ts.stop_id,'storeId',ts.store_id,'state',ts.state,'completedAt',ts.completed_at,'version',ts.version)
        order by ts.position,ts.stop_id) filter(where s.id is not null),'[]'::jsonb) stop_manifest
      from trip_private.trips t left join trip_private.trip_stops ts on ts.trip_id=t.trip_id and ts.kind='store'
      left join eligible_stores s on s.id=ts.store_id where t.trip_id=p_source_id group by t.trip_id)
    select t.version,extensions.digest(convert_to(jsonb_build_object('kind','trip_completion','tripId',t.trip_id,'releaseId',bound,
      'ownerId',t.owner_id,'area','topeka-ks','localDate',t.local_date,'state',t.state,'version',t.version,
      'activeStoreCount',sf.active_store_count,'completedStoreCount',sf.completed_store_count,'completedAt',sf.completed_at,'stops',sf.stop_manifest)::text,'utf8'),'sha256'),
      sc.subject_id,null::uuid,sf.completed_at,t.local_date,sf.active_store_count,sf.completed_store_count,null::boolean,null::text
    from trip_private.trips t join app_public.catalog_areas a on a.id=t.area_id and a.slug='topeka-ks'
    join rg01_private.rg01_subject_consents sc on sc.user_id=t.owner_id join stop_facts sf on sf.trip_id=t.trip_id
    where t.trip_id=p_source_id and t.state='completed' and sf.completed_at is not null and sf.completed_store_count>0;
  elsif p_fact_kind='listing' then
    return query with listing as (select s.*,a.slug area_slug,f.freshness_state,f.oldest_verified_at,v.latest_verified_at,v.verification_manifest
      from release_private.release_frozen_stores fs join app_public.stores s on s.id=fs.store_id join app_public.catalog_areas a on a.id=s.area_id
      cross join lateral app_public.catalog_freshness(s.id,statement_timestamp()) f cross join lateral (
        select max(sv.verified_at) latest_verified_at,coalesce(jsonb_agg(jsonb_build_object('group',sv.verification_group,'verifiedAt',sv.verified_at,
          'verifierKind',sv.verifier_kind,'provenanceDigest',encode(extensions.digest(convert_to(sv.provenance_label,'utf8'),'sha256'),'hex')) order by sv.verification_group),'[]'::jsonb) verification_manifest
        from app_public.store_fact_verifications sv where sv.store_id=s.id) v
      where fs.release_id=bound and s.id=p_source_id and not s.synthetic and s.audience='public' and s.publication_state='active' and a.slug='topeka-ks')
    select greatest(1,floor(extract(epoch from greatest(l.updated_at,coalesce(l.latest_verified_at,l.updated_at)))*1000000)::bigint),
      extensions.digest(convert_to(jsonb_build_object('kind','listing','releaseId',bound,'storeId',l.id,'area',l.area_slug,'audience',l.audience,
        'publicationState',l.publication_state,'updatedAt',l.updated_at,'freshnessState',l.freshness_state,'oldestVerifiedAt',l.oldest_verified_at,'verifications',l.verification_manifest)::text,'utf8'),'sha256'),
      null::uuid,l.id,greatest(l.updated_at,coalesce(l.latest_verified_at,l.updated_at)),null::date,null::integer,null::integer,(l.freshness_state='current'),'active_discoverable'::text from listing l;
  elsif p_fact_kind='defect' then
    return query select greatest(1,floor(extract(epoch from f.recorded_at)*1000000)::bigint),
      extensions.digest(convert_to(jsonb_build_object('kind','defect','releaseId',bound,'factId',f.fact_id,'readinessRunId',f.run_id,
        'severity',f.payload->>'severity','resolved',(f.payload->>'resolved')::boolean,'occurredAt',f.occurred_at,'factDigest',encode(f.fact_digest,'hex'))::text,'utf8'),'sha256'),
      null::uuid,null::uuid,f.occurred_at,null::date,null::integer,null::integer,not (f.payload->>'resolved')::boolean,f.payload->>'severity'
    from readiness_private.readiness_fact_events f where f.fact_id=p_source_id and f.fact_kind='defect'
      and f.run_id=rg01_private.readiness_run_for_release(bound) and f.payload->>'severity' in ('blocking','privacy','security','data_loss');
  elsif p_fact_kind='support_case' then
    return query select c.version,extensions.digest(convert_to(jsonb_build_object('kind','support_case','releaseId',bound,'caseId',c.case_id,
      'storeId',c.store_id,'state',c.state,'version',c.version,'createdAt',c.created_at)::text,'utf8'),'sha256'),
      null::uuid,null::uuid,c.created_at,null::date,null::integer,null::integer,null::boolean,null::text
    from admin_private.admin_review_cases c join release_private.release_frozen_stores fs on fs.release_id=bound and fs.store_id=c.store_id
    join app_public.stores s on s.id=c.store_id and not s.synthetic and s.audience='public' and s.publication_state='active'
    join app_public.catalog_areas a on a.id=s.area_id and a.slug='topeka-ks'
    where c.case_id=p_source_id and c.case_type='support' and c.store_id is not null;
  elsif p_fact_kind='claim_attempt' then
    return query select c.version,extensions.digest(convert_to(jsonb_build_object('kind','claim_attempt','releaseId',bound,'claimId',c.claim_id,
      'storeId',c.store_id,'state',c.state,'version',c.version,'submittedAt',c.submitted_at,'approvedAt',c.approved_at,'revokedAt',c.revoked_at,
      'disposition',case when c.state='approved' then 'approved' when exists(select 1 from app_private.privileged_audit_events ae where ae.resource_kind='listing_claim'
        and ae.resource_id=c.claim_id and ae.action='partner_claim_reject' and ae.reason_code='abusive_attempt' and ae.outcome='completed') then 'abusive' else 'rejected' end)::text,'utf8'),'sha256'),
      null::uuid,c.store_id,coalesce(c.submitted_at,c.updated_at,c.created_at),null::date,null::integer,null::integer,null::boolean,
      case when c.state='approved' then 'approved' when exists(select 1 from app_private.privileged_audit_events ae where ae.resource_kind='listing_claim'
        and ae.resource_id=c.claim_id and ae.action='partner_claim_reject' and ae.reason_code='abusive_attempt' and ae.outcome='completed') then 'abusive' else 'rejected' end
    from partner_private.listing_claims c join release_private.release_frozen_stores fs on fs.release_id=bound and fs.store_id=c.store_id
    join app_public.stores s on s.id=c.store_id and not s.synthetic and s.audience='public' and s.publication_state='active'
    join app_public.catalog_areas a on a.id=s.area_id and a.slug='topeka-ks'
    where c.claim_id=p_source_id and c.state in ('approved','rejected') and c.submitted_at is not null;
  else raise exception using errcode='22023',message='rg01_source_kind_invalid'; end if;
end $$;

create or replace function rg01_private.flyer_consent_matches_authority(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from rg01_private.rg01_flyer_consents f
    join app_private.role_grants g on g.subject_user_id=f.representative_user_id and g.role='representative'
      and g.store_id=f.store_id and g.state='active'
    where f.store_id=p_store_id and f.withdrawn_at is null
      and f.source_receipt_digest=rg01_private.promotion_consent_receipt_digest(rg01_private.bound_release_id(),f.store_id))
$$;

create or replace function rg01_private.source_head_digest()
returns bytea language sql stable security definer set search_path='' as $$
  with expected as (select * from rg01_private.authoritative_source_ids()),
  latest as (select distinct on(f.fact_kind,f.authoritative_source_id) f.*
    from rg01_private.rg01_source_facts f join expected e
      on e.fact_kind=f.fact_kind and e.source_id=f.authoritative_source_id
    where rg01_private.source_fact_matches_authority(f.fact_id)
    order by f.fact_kind,f.authoritative_source_id,f.source_version desc),
  frozen as (select fs.store_id from release_private.release_frozen_stores fs
    where fs.release_id=rg01_private.bound_release_id())
  select extensions.digest(convert_to(jsonb_build_object(
    'releaseId',rg01_private.bound_release_id(),
    'facts',coalesce((select jsonb_agg(jsonb_build_object('kind',fact_kind,'sourceId',authoritative_source_id,
      'sourceVersion',source_version,'digest',encode(source_digest,'hex')) order by fact_kind,authoritative_source_id) from latest),'[]'::jsonb),
    'subjects',coalesce((select jsonb_agg(jsonb_build_object('receiptLabel',s.receipt_label,'consentedAt',s.consented_at,
      'withdrawnAt',s.withdrawn_at,'age18Verified',s.age_18_verified,'nonprivilegedShopper',s.nonprivileged_shopper,
      'exclusionCode',s.exclusion_code) order by s.receipt_label)
      from rg01_private.rg01_subject_consents s where exists(select 1 from latest l where l.fact_kind='trip_completion' and l.subject_id=s.subject_id)),'[]'::jsonb),
    'flyers',coalesce((select jsonb_agg(jsonb_build_object('storeId',f.store_id,'consentedAt',f.consented_at,
      'withdrawnAt',f.withdrawn_at,'sourceDigest',encode(f.source_receipt_digest,'hex'),
      'authorityCurrent',rg01_private.flyer_consent_matches_authority(f.store_id)) order by f.store_id)
      from rg01_private.rg01_flyer_consents f join frozen x on x.store_id=f.store_id),'[]'::jsonb)
  )::text,'utf8'),'sha256')
$$;

create or replace function rg01_private.scope_manifest_source_fact_count()
returns trigger language plpgsql set search_path='' as $$
begin
  select count(*) into new.source_fact_count from (
    select distinct on(f.fact_kind,f.authoritative_source_id) f.fact_id
    from rg01_private.rg01_source_facts f join rg01_private.authoritative_source_ids() e
      on e.fact_kind=f.fact_kind and e.source_id=f.authoritative_source_id
    where f.recorded_at<=new.source_cutoff and rg01_private.source_fact_matches_authority(f.fact_id)
    order by f.fact_kind,f.authoritative_source_id,f.source_version desc
  ) scoped;
  return new;
end $$;
create trigger rg01_manifest_scope before insert on rg01_private.rg01_manifests
  for each row execute function rg01_private.scope_manifest_source_fact_count();

create or replace function app_public.rg01_set_flyer_consent(p_store_id uuid,p_consent boolean,p_source_receipt_digest bytea)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_public.request_user_id(); release_id uuid:=rg01_private.bound_release_id(); expected_digest bytea;
begin
  if release_id is null then raise exception using errcode='55000',message='rg01_collection_disabled'; end if;
  if uid is null or p_store_id is null or not app_private.current_user_has_role('representative'::app_private.app_role,p_store_id)
    then raise exception using errcode='42501',message='rg01_representative_store_required'; end if;
  if p_consent then
    expected_digest:=rg01_private.promotion_consent_receipt_digest(release_id,p_store_id);
    if expected_digest is null or p_source_receipt_digest is distinct from expected_digest then
      raise exception using errcode='42501',message='rg01_promotion_consent_receipt_required';
    end if;
    insert into rg01_private.rg01_flyer_consents(store_id,representative_user_id,consented_at,source_receipt_digest)
      values(p_store_id,uid,statement_timestamp(),expected_digest)
      on conflict(store_id) do update set representative_user_id=uid,consented_at=statement_timestamp(),withdrawn_at=null,source_receipt_digest=expected_digest;
  else
    update rg01_private.rg01_flyer_consents set withdrawn_at=statement_timestamp()
      where store_id=p_store_id and representative_user_id=uid;
  end if;
end $$;

create or replace function app_public.rg01_request_decision_challenge(p_run_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r rg01_private.rg01_runs%rowtype; c rg01_private.rg01_signing_challenges%rowtype;
  g readiness_private.evidence_responsibility_grants%rowtype; uid uuid:=app_public.request_user_id();
  exp timestamptz:=statement_timestamp()+interval '30 minutes'; n bytea:=extensions.gen_random_bytes(32);
begin
  if uid is null or p_decision not in ('pass','reject') or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='rg01_product_owner_required';
  end if;
  select * into g from readiness_private.evidence_responsibility_grants
    where user_id=uid and responsibility='ProductOwner' and state='active';
  if not found then raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state<>'frozen' or r.release_id<>g.release_id
    or r.source_head_digest<>rg01_private.source_head_digest()
    or (p_decision='pass' and cardinality(r.blockers)>0) then
    raise exception using errcode='55000',message='rg01_decision_blocked';
  end if;
  update readiness_private.gate_signing_capabilities set state='expired'
    where user_id=uid and gate_kind='rg01' and state='issued' and expires_at<=statement_timestamp();
  update rg01_private.rg01_signing_challenges set consumed_at=statement_timestamp()
    where run_id=p_run_id and signer_user_id=uid and consumed_at is null and expires_at<=statement_timestamp();
  insert into rg01_private.rg01_signing_challenges(run_id,signer_user_id,frozen_digest,decision,failed_codes,nonce,payload_digest,expires_at)
    values(p_run_id,uid,r.manifest_digest,p_decision,r.blockers,n,
      extensions.digest(convert_to(concat_ws('|',p_run_id,encode(r.manifest_digest,'hex'),uid,p_decision,array_to_string(r.blockers,','),encode(n,'hex'),exp),'utf8'),'sha256'),exp)
    returning * into c;
  insert into readiness_private.gate_signing_capabilities(token_hash,challenge_id,user_id,responsibility,gate_kind,frozen_digest,grant_id,grant_version,expires_at)
    values(extensions.digest(convert_to(c.challenge_id::text||'|'||encode(n,'hex'),'utf8'),'sha256'),c.challenge_id,uid,'ProductOwner','rg01',r.manifest_digest,g.grant_id,g.version,exp);
  return jsonb_build_object('challengeId',c.challenge_id,'payloadDigest',encode(c.payload_digest,'hex'),'expiresAt',c.expires_at);
end $$;

create or replace function rg01_private.consume_decision_challenge(p_challenge_id uuid,p_payload_digest bytea,p_signature_digest bytea,p_provider_key_id text,p_provider_verification_id text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c rg01_private.rg01_signing_challenges%rowtype; r rg01_private.rg01_runs%rowtype;
  cap readiness_private.gate_signing_capabilities%rowtype; rid uuid; ca bigint;cr bigint;cab bigint;
begin
  select receipt_id into rid from rg01_private.rg01_receipts where challenge_id=p_challenge_id
    and signed_payload_digest=p_payload_digest and signature_digest=p_signature_digest
    and provider_key_id=p_provider_key_id and provider_verification_id=p_provider_verification_id;
  if rid is not null then return rid; end if;
  select * into c from rg01_private.rg01_signing_challenges where challenge_id=p_challenge_id for update;
  select * into cap from readiness_private.gate_signing_capabilities where challenge_id=p_challenge_id for update;
  if c.challenge_id is null or cap.capability_id is null or c.consumed_at is not null or c.expires_at<=statement_timestamp()
    or cap.state<>'issued' or cap.expires_at<=statement_timestamp() or cap.user_id<>c.signer_user_id
    or cap.frozen_digest<>c.frozen_digest or c.payload_digest is distinct from p_payload_digest
    or octet_length(p_signature_digest)<>32 then
    raise exception using errcode='22023',message='rg01_challenge_invalid_or_consumed';
  end if;
  if p_provider_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
    raise exception using errcode='22023',message='rg01_signature_verification_invalid'; end if;
  if not exists(select 1 from readiness_private.evidence_responsibility_grants g
    where g.grant_id=cap.grant_id and g.user_id=c.signer_user_id and g.responsibility='ProductOwner'
      and g.state='active' and g.version=cap.grant_version) then
    raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  select * into r from rg01_private.rg01_runs where run_id=c.run_id for update;
  if r.state<>'frozen' or r.manifest_digest<>c.frozen_digest or r.source_head_digest<>rg01_private.source_head_digest()
    or (c.decision='pass' and cardinality(r.blockers)>0) then raise exception using errcode='55000',message='rg01_decision_blocked'; end if;
  select metric_value into ca from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_approved';
  select metric_value into cr from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_rejected';
  select metric_value into cab from rg01_private.rg01_metrics where run_id=r.run_id and metric_code='claim_abusive';
  update rg01_private.rg01_signing_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  update readiness_private.gate_signing_capabilities set state='consumed',consumed_at=statement_timestamp() where capability_id=cap.capability_id and state='issued';
  insert into rg01_private.rg01_receipts(run_id,challenge_id,release_id,signer_user_id,responsibility,decision,manifest_digest,source_head_digest,signed_payload_digest,signature_digest,provider_key_id,provider_verification_id,failed_codes,claim_approved,claim_rejected,claim_abusive)
    values(r.run_id,c.challenge_id,r.release_id,c.signer_user_id,'ProductOwner',c.decision,r.manifest_digest,r.source_head_digest,p_payload_digest,p_signature_digest,p_provider_key_id,p_provider_verification_id,c.failed_codes,ca,cr,cab) returning receipt_id into rid;
  if r.supersedes_receipt_id is not null then insert into rg01_private.rg01_receipt_supersessions values(r.supersedes_receipt_id,rid,statement_timestamp()); end if;
  update rg01_private.rg01_runs set state=case when c.decision='pass' then 'signed' else 'rejected' end,receipt_id=rid,disposed_at=statement_timestamp() where run_id=r.run_id;
  update rg01_private.rg01_subject_consents set linkage_purge_due_at=least(coalesce(linkage_purge_due_at,'infinity'),statement_timestamp()+interval '30 days') where user_id is not null or dedup_hmac is not null;
  return rid;
end $$;

do $$ declare t text; begin foreach t in array array['evidence_responsibility_grants','gate_signing_capabilities'] loop
  execute format('alter table readiness_private.%I enable row level security',t);
  execute format('alter table readiness_private.%I force row level security',t);
  execute format('revoke all on readiness_private.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on readiness_private.%I to rg01_automation',t);
  execute format('create policy %I on readiness_private.%I for all to rg01_automation using(true) with check(true)','rg01_automation_'||t,t);
end loop; end $$;
alter table rg01_private.rg01_capability_events enable row level security;
alter table rg01_private.rg01_capability_events force row level security;
revoke all on rg01_private.rg01_capability_events from public,anon,authenticated;
grant select,insert on rg01_private.rg01_capability_events to rg01_automation;
create policy rg01_automation_capability_events on rg01_private.rg01_capability_events for all to rg01_automation using(true) with check(true);

grant select on readiness_private.evidence_responsibility_grants to identity_service;
grant select,insert,update on readiness_private.gate_signing_capabilities to identity_service;
create policy identity_evidence_responsibility_read on readiness_private.evidence_responsibility_grants for select to identity_service using(user_id=app_public.request_user_id());
create policy identity_gate_capability on readiness_private.gate_signing_capabilities for all to identity_service using(user_id=app_public.request_user_id()) with check(user_id=app_public.request_user_id());
grant select on readiness_private.readiness_receipts to rg01_automation;
create policy rg01_readiness_receipts on readiness_private.readiness_receipts for select to rg01_automation using(true);
grant usage on schema readiness_private to release_executor;

alter function readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid) owner to rg01_automation;
alter function readiness_private.revoke_deleted_evidence_responsibility() owner to rg01_automation;
alter function rg01_private.bound_release_id() owner to rg01_automation;
alter function rg01_private.readiness_run_for_release(uuid) owner to rg01_automation;
alter function rg01_private.promotion_consent_receipt_digest(uuid,uuid) owner to rg01_automation;
alter function rg01_private.set_collection_capability(boolean,uuid,bigint) owner to rg01_automation;
alter function rg01_private.authoritative_source_ids() owner to rg01_automation;
revoke all on function rg01_private.derive_source_fact(text,uuid)
  from public,anon,authenticated,service_role,rg01_source_service;
revoke all on function app_public.rg01_request_decision_challenge(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function rg01_private.bound_release_id(),rg01_private.promotion_consent_receipt_digest(uuid,uuid)
  to identity_service;
alter function rg01_private.derive_source_fact(text,uuid) owner to rg01_automation;
alter function rg01_private.flyer_consent_matches_authority(uuid) owner to rg01_automation;
alter function rg01_private.source_head_digest() owner to rg01_automation;
alter function rg01_private.scope_manifest_source_fact_count() owner to rg01_automation;
alter function app_public.rg01_set_flyer_consent(uuid,boolean,bytea) owner to identity_service;
alter function app_public.rg01_request_decision_challenge(uuid,text) owner to identity_service;
alter function rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text) owner to rg01_automation;

revoke all on function rg01_private.bound_release_id(),rg01_private.readiness_run_for_release(uuid),
  rg01_private.promotion_consent_receipt_digest(uuid,uuid),rg01_private.authoritative_source_ids(),
  rg01_private.derive_source_fact(text,uuid),rg01_private.flyer_consent_matches_authority(uuid),
  rg01_private.source_head_digest() from public,anon,authenticated;
revoke all on function rg01_private.set_collection_capability(boolean,uuid,bigint) from public,anon,authenticated,rg01_source_service,rg01_calculation_service,rg01_signature_service,rg01_lifecycle_service,rg01_evidence_service;
grant execute on function rg01_private.set_collection_capability(boolean,uuid,bigint) to release_executor;
revoke all on function readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid) from public,anon,authenticated,
  rg01_source_service,rg01_calculation_service,rg01_signature_service,rg01_lifecycle_service,rg01_evidence_service;
grant execute on function readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid) to release_executor;
revoke all on function readiness_private.revoke_deleted_evidence_responsibility() from public,anon,authenticated;
revoke all on function rg01_private.scope_manifest_source_fact_count() from public,anon,authenticated;
revoke all on function app_public.rg01_set_flyer_consent(uuid,boolean,bytea),app_public.rg01_request_decision_challenge(uuid,text) from public,anon;
grant execute on function app_public.rg01_set_flyer_consent(uuid,boolean,bytea) to authenticated;
revoke all on function rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text) from public,anon,authenticated;
grant execute on function rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text) to rg01_signature_service;

revoke create on schema readiness_private,rg01_private from rg01_automation;
revoke create on schema app_public from rg01_automation;
revoke create on schema app_public from identity_service;
revoke create on schema release_private from release_automation;
revoke rg01_automation,identity_service,release_automation from postgres;
