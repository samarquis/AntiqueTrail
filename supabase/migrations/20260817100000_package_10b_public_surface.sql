-- Package 10B correction: a release changes the real public surfaces in the
-- same latch-first transaction that accepts the signed release receipt.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='public_catalog_gateway') then
    create role public_catalog_gateway nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant release_automation,catalog_reader to postgres;

alter table app_public.stores drop constraint if exists stores_audience_synthetic;
alter table app_public.stores add constraint stores_audience_stage check (
  (synthetic and audience='synthetic')
  or (not synthetic and audience in ('regional_readiness','public'))
);
alter table app_public.store_fact_verifications drop constraint if exists fact_verifier_kind_synthetic;
alter table app_public.store_fact_verifications add constraint fact_verifier_kind_stage check (
  verifier_kind in ('synthetic_fixture','store_partner','two_person_public_source')
);

alter table release_private.regional_releases
  add column frozen_store_set_digest bytea check (octet_length(frozen_store_set_digest)=32),
  add column migration_set_digest text check (migration_set_digest is null or migration_set_digest ~ '^sha256:[0-9a-f]{64}$'),
  add column config_digest text check (config_digest is null or config_digest ~ '^sha256:[0-9a-f]{64}$'),
  add column expected_registration_version bigint check (expected_registration_version is null or expected_registration_version>0),
  add column candidate_bound_at timestamptz;

create table release_private.release_frozen_stores (
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  ordinal integer not null check (ordinal>0),
  two_person_provenance boolean not null,
  required_fields_fresh boolean not null,
  excludes_pilot_private_fields boolean not null,
  rights_and_consent_current boolean not null,
  no_duplicate_closure_or_hold boolean not null,
  exact_area_verified boolean not null,
  source_evidence_digest bytea not null check (octet_length(source_evidence_digest)=32),
  primary key(release_id,store_id),
  unique(release_id,ordinal)
);

create table release_private.release_actor_approvals (
  approval_id uuid primary key,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  responsibility text not null check (responsibility in ('ProductOwner','Engineering','Security','Operations')),
  actor_key_id text not null check (actor_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  signed_payload_digest bytea not null check (octet_length(signed_payload_digest)=32),
  signature_digest bytea not null check (octet_length(signature_digest)=32),
  provider_verification_id text not null check (provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  artifact_digest text not null,
  migration_set_digest text not null,
  config_digest text not null,
  frozen_store_set_digest bytea not null check (octet_length(frozen_store_set_digest)=32),
  external_verified boolean not null check (external_verified),
  verified_at timestamptz not null,
  unique(release_id,responsibility),
  unique(provider_verification_id)
);

create table release_private.release_gate_receipts (
  gate_receipt_id uuid primary key,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  gate_kind text not null check (gate_kind in (
    'package_10a','provider_h','provider_e','provider_r','provider_m','provider_l','provider_s',
    'hc_02','sec_01','brand_domain_b01','availability_capacity','production_db_auth_storage_recovery',
    'promotion_rights_consent','monitoring','public_surface_smoke'
  )),
  receipt_digest bytea not null check (octet_length(receipt_digest)=32),
  artifact_digest text not null,
  migration_set_digest text not null,
  config_digest text not null,
  frozen_store_set_digest bytea not null check (octet_length(frozen_store_set_digest)=32),
  external_verified boolean not null check (external_verified),
  accepted_at timestamptz not null,
  unique(release_id,gate_kind)
);

create table release_private.public_review_projection (
  review_id uuid primary key,
  release_id uuid not null references release_private.regional_releases(release_id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 1 and 4000),
  approved_at timestamptz not null,
  source_digest bytea not null check (octet_length(source_digest)=32),
  withdrawn_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['release_frozen_stores','release_actor_approvals','release_gate_receipts','public_review_projection'] loop
    execute format('alter table release_private.%I enable row level security',t);
    execute format('alter table release_private.%I force row level security',t);
    execute format('revoke all on release_private.%I from public,anon,authenticated,release_executor',t);
  end loop;
end $$;

grant select,insert on release_private.release_frozen_stores,release_private.release_actor_approvals,release_private.release_gate_receipts to release_evidence_service;
grant select on release_private.release_frozen_stores,release_private.release_actor_approvals,release_private.release_gate_receipts to release_automation;
grant select,insert,update on release_private.public_review_projection to release_automation;
create policy release_evidence_frozen_store_insert on release_private.release_frozen_stores for insert to release_evidence_service with check(true);
create policy release_evidence_frozen_store_read on release_private.release_frozen_stores for select to release_evidence_service using(true);
create policy release_evidence_approval_insert on release_private.release_actor_approvals for insert to release_evidence_service with check(true);
create policy release_evidence_approval_read on release_private.release_actor_approvals for select to release_evidence_service using(true);
create policy release_evidence_gate_insert on release_private.release_gate_receipts for insert to release_evidence_service with check(true);
create policy release_evidence_gate_read on release_private.release_gate_receipts for select to release_evidence_service using(true);
create policy release_automation_frozen_store_read on release_private.release_frozen_stores for select to release_automation using(true);
create policy release_automation_approval_read on release_private.release_actor_approvals for select to release_automation using(true);
create policy release_automation_gate_read on release_private.release_gate_receipts for select to release_automation using(true);
create policy release_automation_review_projection on release_private.public_review_projection for all to release_automation using(true) with check(true);

create or replace function release_private.reject_frozen_release_evidence_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception using errcode='42501',message='release_evidence_append_only'; end $$;
create trigger release_frozen_stores_append_only before update or delete on release_private.release_frozen_stores for each row execute function release_private.reject_frozen_release_evidence_mutation();
create trigger release_actor_approvals_append_only before update or delete on release_private.release_actor_approvals for each row execute function release_private.reject_frozen_release_evidence_mutation();
create trigger release_gate_receipts_append_only before update or delete on release_private.release_gate_receipts for each row execute function release_private.reject_frozen_release_evidence_mutation();

create or replace function release_private.guard_frozen_store_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from release_private.regional_releases r where r.release_id=new.release_id and r.state='frozen' and r.candidate_bound_at is null) then
    raise exception using errcode='55000',message='release_candidate_already_bound';
  end if;
  return new;
end $$;
create trigger release_frozen_store_insert_guard before insert on release_private.release_frozen_stores for each row execute function release_private.guard_frozen_store_insert();

create or replace function release_private.bind_release_candidate(p_release_id uuid,p_migration_set_digest text,p_config_digest text)
returns bytea language plpgsql security definer set search_path='' as $$
declare v_digest bytea; v_latch text; v_config_version bigint;
begin
  select state into v_latch from app_private.registration_quarantine_latch where id=1 for update;
  if v_latch is distinct from 'open' then raise exception 'registration_quarantine_not_open'; end if;
  select version into v_config_version from app_private.account_registration_config where id=1 for update;
  if p_migration_set_digest !~ '^sha256:[0-9a-f]{64}$' or p_config_digest !~ '^sha256:[0-9a-f]{64}$' then raise exception 'release_digest_invalid'; end if;
  select extensions.digest(coalesce(string_agg(store_id::text,',' order by store_id::text),''),'sha256') into v_digest from release_private.release_frozen_stores where release_id=p_release_id;
  if not exists(select 1 from release_private.release_frozen_stores where release_id=p_release_id) then raise exception 'frozen_store_set_empty'; end if;
  update release_private.regional_releases set frozen_store_set_digest=v_digest,migration_set_digest=p_migration_set_digest,config_digest=p_config_digest,expected_registration_version=v_config_version,candidate_bound_at=statement_timestamp(),updated_at=statement_timestamp()
    where release_id=p_release_id and state='frozen' and candidate_bound_at is null;
  if not found then raise exception 'release_candidate_not_bindable'; end if;
  return v_digest;
end $$;

create or replace function release_private.public_capability_enabled(p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from release_private.regional_releases r
    join release_private.release_capabilities c using(release_id)
    where r.region_key='topeka-ks' and r.state='active'
      and case p_capability
        when 'catalog' then c.public_catalog
        when 'claims' then c.public_claims
        when 'reviews' then c.public_reviews
        when 'registration' then c.public_registration
        when 'promotion' then c.product_promotion
        else false
      end
  );
$$;

create or replace function release_private.public_store_visible(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select release_private.public_capability_enabled('catalog') and exists(
    select 1 from app_public.stores s
    where s.id=p_store_id and not s.synthetic and s.audience='public' and s.publication_state='active'
  );
$$;

revoke execute on function app_public.catalog_list(text,text,text) from public,anon,authenticated;
revoke execute on function app_public.catalog_details(text) from public,anon,authenticated;
grant usage on schema app_public to public_catalog_gateway;
grant execute on function app_public.catalog_list(text,text,text),app_public.catalog_details(text) to public_catalog_gateway;
grant execute on function release_private.public_capability_enabled(text) to public_catalog_gateway,authenticated,catalog_reader;
grant execute on function release_private.public_store_visible(uuid) to public_catalog_gateway;
grant usage on schema release_private to public_catalog_gateway;
grant usage on schema release_private to authenticated;
grant usage on schema release_private to catalog_reader;
grant usage on schema app_private,app_public to release_automation;
grant select,update on app_private.registration_quarantine_latch,app_private.account_registration_config to release_automation;
grant select,update on app_public.stores to release_automation;
grant select on app_public.catalog_areas,app_public.store_fact_verifications to release_automation;
create policy release_automation_registration_latch on app_private.registration_quarantine_latch for select to release_automation using(id=1);
create policy release_automation_registration_config on app_private.account_registration_config for all to release_automation using(id=1) with check(id=1);
create policy release_automation_public_stores on app_public.stores for all to release_automation using(true) with check(true);
create policy release_automation_catalog_areas on app_public.catalog_areas for select to release_automation using(true);
create policy release_automation_store_verifications on app_public.store_fact_verifications for select to release_automation using(true);

drop policy if exists catalog_reader_stores on app_public.stores;
create policy catalog_reader_stores on app_public.stores for select to catalog_reader using (
  (synthetic and audience='synthetic' and publication_state='active')
  or (not synthetic and audience='public' and publication_state='active' and release_private.public_capability_enabled('catalog'))
);
drop policy if exists catalog_reader_assignments on app_public.store_category_assignments;
create policy catalog_reader_assignments on app_public.store_category_assignments for select to catalog_reader using (exists(select 1 from app_public.stores s where s.id=store_id and s.publication_state='active' and ((s.synthetic and s.audience='synthetic') or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog')))));
drop policy if exists catalog_reader_verifications on app_public.store_fact_verifications;
create policy catalog_reader_verifications on app_public.store_fact_verifications for select to catalog_reader using (exists(select 1 from app_public.stores s where s.id=store_id and s.publication_state='active' and ((s.synthetic and s.audience='synthetic') or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog')))));
drop policy if exists catalog_reader_weekly on app_public.store_weekly_hours;
create policy catalog_reader_weekly on app_public.store_weekly_hours for select to catalog_reader using (exists(select 1 from app_public.stores s where s.id=store_id and s.publication_state='active' and ((s.synthetic and s.audience='synthetic') or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog')))));
drop policy if exists catalog_reader_exceptions on app_public.store_hour_exceptions;
create policy catalog_reader_exceptions on app_public.store_hour_exceptions for select to catalog_reader using (exists(select 1 from app_public.stores s where s.id=store_id and s.publication_state='active' and ((s.synthetic and s.audience='synthetic') or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog')))));
drop policy if exists catalog_reader_media on app_public.store_media;
create policy catalog_reader_media on app_public.store_media for select to catalog_reader using (exists(select 1 from app_public.stores s where s.id=store_id and s.publication_state='active' and ((s.synthetic and s.audience='synthetic') or (not s.synthetic and s.audience='public' and release_private.public_capability_enabled('catalog')))));

drop policy if exists listing_claim_release_insert on partner_private.listing_claims;
revoke insert on partner_private.listing_claims from authenticated;
grant identity_service to postgres;
grant create on schema app_public to identity_service;
create or replace function app_public.submit_listing_claim(p_store_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_store_id uuid; v_claim partner_private.listing_claims%rowtype;
begin
  begin v_store_id:=p_store_id::uuid; exception when others then raise exception 'claim_input_invalid'; end;
  if not app_private.current_session_is_active()
    or not release_private.public_capability_enabled('claims')
    or not release_private.public_store_visible(v_store_id) then
    raise exception 'claim_stage_disabled';
  end if;
  insert into partner_private.listing_claims(claimant_id,store_id,state,submitted_at)
    values(auth.uid(),v_store_id,'submitted',statement_timestamp()) returning * into v_claim;
  return jsonb_build_object('claimId',v_claim.claim_id,'storeId',v_claim.store_id,
    'state',v_claim.state,'version',v_claim.version,'submittedAt',v_claim.submitted_at);
exception when unique_violation then
  raise exception 'claim_already_exists';
end;
$$;
alter function app_public.submit_listing_claim(text) owner to identity_service;
revoke all on function app_public.submit_listing_claim(text) from public,anon;
grant execute on function app_public.submit_listing_claim(text) to authenticated;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;

create policy public_review_gateway_read on release_private.public_review_projection for select to public_catalog_gateway using (
  withdrawn_at is null and release_private.public_capability_enabled('reviews')
  and release_private.public_store_visible(store_id)
);
grant select on release_private.public_review_projection to public_catalog_gateway;

create or replace function app_public.regional_catalog_list(p_q text default null,p_category text default null,p_area text default null)
returns setof app_public.catalog_list_row language plpgsql stable security definer set search_path='' as $$
declare as_of timestamptz:=statement_timestamp(); normalized_q text:=app_public.normalize_catalog_query(p_q); matched integer;
begin
  if not release_private.public_capability_enabled('catalog') then return; end if;
  if p_category is not null and p_category !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  if p_area is not null and p_area !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  select count(*) into matched from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,as_of) f
    where not s.synthetic and s.audience='public' and s.publication_state='active' and f.freshness_state in ('current','overdue')
      and (p_area is null or a.slug=p_area)
      and (p_category is null or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
      and (normalized_q is null or s.name ilike '%'||normalized_q||'%' or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%');
  if matched>50 then raise exception 'catalog_too_large'; end if;
  return query select s.id,s.slug,s.name,s.town,s.state_code,a.slug,a.label,s.summary,s.phone,s.website,s.timezone_name,
    (select m.asset_path from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select m.alt_text from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('src',m.asset_path,'alt',m.alt_text,'kind',m.kind) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    today.hours,today.hours_state,today.is_open_now,f.freshness_state,f.oldest_verified_at,as_of
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_today(s.id,as_of,s.timezone_name) today cross join lateral app_public.catalog_freshness(s.id,as_of) f
  where not s.synthetic and s.audience='public' and s.publication_state='active' and f.freshness_state in ('current','overdue')
    and (p_area is null or a.slug=p_area)
    and (p_category is null or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
    and (normalized_q is null or s.name ilike '%'||normalized_q||'%' or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%')
  order by s.name,s.id;
end $$;

create or replace function app_public.regional_catalog_details(p_slug text)
returns setof app_public.catalog_details_row language sql stable security definer set search_path='' as $$
  select s.id,s.slug,s.name,s.town,s.state_code,s.address,a.slug,a.label,s.summary,s.description,s.phone,s.website,s.timezone_name,
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('weekday',h.iso_weekday,'is_closed',h.is_closed,'interval_index',h.interval_index,'opens_at',case when h.opens_at is null then null else to_char(h.opens_at,'HH24:MI') end,'closes_at',case when h.closes_at is null then null else to_char(h.closes_at,'HH24:MI') end) order by h.iso_weekday,h.interval_index),'[]'::jsonb) from app_public.store_weekly_hours h where h.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('local_date',e.local_date,'label',e.label,'is_closed',e.is_closed,'interval_index',e.interval_index,'opens_at',case when e.opens_at is null then null else to_char(e.opens_at,'HH24:MI') end,'closes_at',case when e.closes_at is null then null else to_char(e.closes_at,'HH24:MI') end) order by e.local_date,e.interval_index),'[]'::jsonb) from app_public.store_hour_exceptions e where e.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('asset_path',m.asset_path,'kind',m.kind,'alt_text',m.alt_text,'display_order',m.display_order) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('group',v.verification_group,'verified_at',v.verified_at,'label',v.provenance_label) order by v.verification_group),'[]'::jsonb) from app_public.store_fact_verifications v where v.store_id=s.id),
    f.freshness_state,f.oldest_verified_at,statement_timestamp()
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,statement_timestamp()) f
  where release_private.public_capability_enabled('catalog') and s.slug=p_slug and not s.synthetic and s.audience='public' and s.publication_state='active' and f.freshness_state in ('current','overdue');
$$;
grant create on schema app_public to catalog_reader;
alter function app_public.regional_catalog_list(text,text,text) owner to catalog_reader;
alter function app_public.regional_catalog_details(text) owner to catalog_reader;
revoke create on schema app_public from catalog_reader;
revoke all on function app_public.regional_catalog_list(text,text,text),app_public.regional_catalog_details(text) from public,anon,authenticated;
grant execute on function app_public.regional_catalog_list(text,text,text),app_public.regional_catalog_details(text) to public_catalog_gateway;
revoke execute on function app_public.catalog_list(text,text,text),app_public.catalog_details(text) from public_catalog_gateway;

create table release_private.public_catalog_rate_windows(
  key_hash bytea not null check(octet_length(key_hash)=32),
  operation text not null check(operation in ('list','details')),
  window_start timestamptz not null,
  request_count integer not null check(request_count>0),
  primary key(key_hash,operation,window_start)
);
alter table release_private.public_catalog_rate_windows enable row level security;
alter table release_private.public_catalog_rate_windows force row level security;
grant select,insert,update on release_private.public_catalog_rate_windows to release_automation;
create policy release_automation_catalog_rate on release_private.public_catalog_rate_windows
  for all to release_automation using(true) with check(true);

grant create on schema app_public to release_automation;
create or replace function app_public.public_catalog_gateway_request(
  p_key_hash text,p_operation text,p_args jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_hash bytea; v_window timestamptz; v_count integer; v_limit integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_operation not in ('list','details')
    or jsonb_typeof(p_args)<>'object' then raise exception 'gateway_request_invalid'; end if;
  v_hash:=decode(p_key_hash,'hex');
  v_window:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
  v_limit:=case p_operation when 'list' then 60 else 120 end;
  perform pg_advisory_xact_lock(hashtextextended(p_key_hash||p_operation||v_window::text,0));
  insert into release_private.public_catalog_rate_windows(key_hash,operation,window_start,request_count)
    values(v_hash,p_operation,v_window,1)
    on conflict(key_hash,operation,window_start) do update
      set request_count=release_private.public_catalog_rate_windows.request_count+1
    returning request_count into v_count;
  if v_count>v_limit then raise exception 'catalog_rate_limited'; end if;
  if p_operation='list' then
    return coalesce((select jsonb_agg(x) from app_public.regional_catalog_list(
      p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x),'[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(x) from app_public.regional_catalog_details(p_args->>'p_slug') x),'[]'::jsonb);
end;
$$;
alter function app_public.public_catalog_gateway_request(text,text,jsonb) owner to release_automation;
revoke create on schema app_public from release_automation;
revoke all on function app_public.public_catalog_gateway_request(text,text,jsonb) from public,anon,authenticated;
grant execute on function app_public.public_catalog_gateway_request(text,text,jsonb) to public_catalog_gateway;
grant execute on function app_public.regional_catalog_list(text,text,text),
  app_public.regional_catalog_details(text) to release_automation;
revoke execute on function app_public.regional_catalog_list(text,text,text),
  app_public.regional_catalog_details(text) from public_catalog_gateway;

create or replace function release_private.promote_regional_release(p_command_id uuid,p_release_id uuid,p_receipt_ids uuid[])
returns text language plpgsql security definer set search_path='' as $$
declare
  v_release release_private.regional_releases%rowtype;
  v_command release_private.release_commands%rowtype;
  v_latch_state text;
  v_config_version bigint;
  v_steps text[];
  v_expected constant text[]:=array['recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','smoke','monitoring','signed_release_receipt'];
  v_gate_expected constant text[]:=array['package_10a','provider_h','provider_e','provider_r','provider_m','provider_l','provider_s','hc_02','sec_01','brand_domain_b01','availability_capacity','production_db_auth_storage_recovery','promotion_rights_consent','monitoring','public_surface_smoke'];
  v_final_receipt uuid;
  v_store_digest bytea;
begin
  -- Package 2 latch is deliberately the first row lock in the transaction.
  select state into v_latch_state from app_private.registration_quarantine_latch where id=1 for update;
  if v_latch_state is distinct from 'open' then raise exception 'registration_quarantine_not_open'; end if;
  select version into v_config_version from app_private.account_registration_config where id=1 for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'promote' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state<>'frozen' then raise exception 'release_not_promotable'; end if;
  perform 1 from release_private.release_frozen_stores where release_id=p_release_id order by store_id for share;
  perform 1 from app_public.stores where id in (select store_id from release_private.release_frozen_stores where release_id=p_release_id) order by id for update;
  if v_release.expected_registration_version is null or v_config_version<>v_release.expected_registration_version then raise exception 'registration_config_version_mismatch'; end if;
  if v_release.frozen_store_set_digest is null or v_release.migration_set_digest is null or v_release.config_digest is null then raise exception 'release_binding_incomplete'; end if;
  select extensions.digest(coalesce(string_agg(store_id::text,',' order by store_id::text),''),'sha256') into v_store_digest from release_private.release_frozen_stores where release_id=p_release_id;
  if v_store_digest<>v_release.frozen_store_set_digest or not exists(select 1 from release_private.release_frozen_stores where release_id=p_release_id) then raise exception 'frozen_store_set_mismatch'; end if;
  if exists(
    select 1 from release_private.release_frozen_stores fs
    join app_public.stores s on s.id=fs.store_id
    join app_public.catalog_areas a on a.id=s.area_id
    where fs.release_id=p_release_id and (
      not fs.two_person_provenance or not fs.required_fields_fresh or not fs.excludes_pilot_private_fields
      or not fs.rights_and_consent_current or not fs.no_duplicate_closure_or_hold or not fs.exact_area_verified
      or s.synthetic or s.audience<>'regional_readiness' or s.publication_state<>'active' or a.slug<>'topeka-ks'
      or (select freshness_state from app_public.catalog_freshness(s.id,statement_timestamp()))<>'current'
    )
  ) then raise exception 'frozen_store_not_public_eligible'; end if;
  if (select array_agg(responsibility order by responsibility) from release_private.release_actor_approvals where release_id=p_release_id and external_verified and artifact_digest=v_release.artifact_digest and migration_set_digest=v_release.migration_set_digest and config_digest=v_release.config_digest and frozen_store_set_digest=v_release.frozen_store_set_digest)
     is distinct from array['Engineering','Operations','ProductOwner','Security']::text[] then raise exception 'release_actor_approvals_incomplete'; end if;
  if (select array_agg(gate_kind order by array_position(v_gate_expected,gate_kind)) from release_private.release_gate_receipts where release_id=p_release_id and external_verified and artifact_digest=v_release.artifact_digest and migration_set_digest=v_release.migration_set_digest and config_digest=v_release.config_digest and frozen_store_set_digest=v_release.frozen_store_set_digest)
     is distinct from v_gate_expected then raise exception 'release_gate_receipts_incomplete'; end if;
  if cardinality(p_receipt_ids)<>cardinality(v_expected) then raise exception 'release_evidence_incomplete'; end if;
  select array_agg(e.step order by array_position(v_expected,e.step)),max(e.receipt_id) filter(where e.step='signed_release_receipt') into v_steps,v_final_receipt from release_private.release_evidence_receipts e where e.receipt_id=any(p_receipt_ids) and e.release_id=p_release_id and e.external_verified and e.artifact_digest=v_release.artifact_digest and e.catalog_digest=v_release.catalog_digest and e.prerequisite_receipt_digest=v_release.prerequisite_receipt_digest;
  if v_steps is distinct from v_expected or v_final_receipt is null then raise exception 'release_evidence_incomplete'; end if;

  update app_public.stores set audience='public',updated_at=statement_timestamp() where id in (select store_id from release_private.release_frozen_stores where release_id=p_release_id);
  if not found then raise exception 'frozen_store_set_mismatch'; end if;
  update app_private.account_registration_config set mode='public',stage_receipt_id=v_final_receipt,version=version+1,updated_at=statement_timestamp() where id=1 and version=v_release.expected_registration_version;
  if not found then raise exception 'registration_config_version_mismatch'; end if;
  update release_private.release_capabilities set public_catalog=true,public_claims=true,public_reviews=true,public_registration=true,product_promotion=true,updated_at=statement_timestamp() where release_id=p_release_id;
  update release_private.regional_releases set state='active',step_ordinal=9,signed_release_receipt=v_final_receipt::text,updated_at=statement_timestamp() where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,p_release_id,'promote',v_release.artifact_digest,v_release.catalog_digest,'active');
  return 'active';
end;
$$;

create or replace function release_private.rollback_regional_release(p_command_id uuid,p_release_id uuid,p_reason text)
returns text language plpgsql security definer set search_path='' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
begin
  perform 1 from app_private.registration_quarantine_latch where id=1 for update;
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'rollback' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  if nullif(pg_catalog.btrim(p_reason),'') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state<>'active' then raise exception 'release_not_active'; end if;
  -- Disable all entry points before withdrawing the exact projection.
  update release_private.release_capabilities set public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false,updated_at=statement_timestamp() where release_id=p_release_id;
  update app_private.account_registration_config set mode='closed',stage_receipt_id=null,version=version+1,updated_at=statement_timestamp() where id=1;
  update app_public.stores set audience='regional_readiness',updated_at=statement_timestamp() where id in (select store_id from release_private.release_frozen_stores where release_id=p_release_id);
  update release_private.public_review_projection set withdrawn_at=coalesce(withdrawn_at,statement_timestamp()) where release_id=p_release_id;
  update release_private.regional_releases set state='rolled_back',rollback_reason=pg_catalog.btrim(p_reason),updated_at=statement_timestamp() where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,p_release_id,'rollback',v_release.artifact_digest,v_release.catalog_digest,'rolled_back');
  return 'rolled_back';
end;
$$;

grant create on schema release_private to release_automation;
alter function release_private.public_capability_enabled(text) owner to release_automation;
alter function release_private.public_store_visible(uuid) owner to release_automation;
alter function release_private.guard_frozen_store_insert() owner to release_automation;
alter function release_private.bind_release_candidate(uuid,text,text) owner to release_automation;
alter function release_private.promote_regional_release(uuid,uuid,uuid[]) owner to release_automation;
alter function release_private.rollback_regional_release(uuid,uuid,text) owner to release_automation;
revoke create on schema release_private from release_automation;
revoke all on function release_private.promote_regional_release(uuid,uuid,uuid[]),release_private.rollback_regional_release(uuid,uuid,text) from public,anon,authenticated;
revoke all on function release_private.bind_release_candidate(uuid,text,text) from public,anon,authenticated;
grant execute on function release_private.bind_release_candidate(uuid,text,text),release_private.promote_regional_release(uuid,uuid,uuid[]),release_private.rollback_regional_release(uuid,uuid,text) to release_executor;
revoke release_automation,catalog_reader from postgres;
