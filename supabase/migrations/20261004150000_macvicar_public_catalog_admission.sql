-- #522 / ADR0011: one protected real catalog projection. No live admission/data.
create temporary table macvicar_prior_memberships on commit drop as
 select rolname from pg_roles where rolname in ('macvicar_catalog_reader','public_test_catalog_composer','synthetic_catalog_automation','identity_service')
 and exists(select 1 from pg_auth_members where roleid=pg_roles.oid and member='postgres'::regrole);
do $$begin
 if not exists(select 1 from pg_roles where rolname='macvicar_catalog_reader') then
  create role macvicar_catalog_reader nologin noinherit nosuperuser nobypassrls;
 end if;
 if not exists(select 1 from pg_roles where rolname='public_test_catalog_composer') then
  create role public_test_catalog_composer nologin noinherit nosuperuser nobypassrls;
 end if;
end $$;
grant macvicar_catalog_reader,public_test_catalog_composer,synthetic_catalog_automation,identity_service to postgres;
grant usage,create on schema public_test_private to macvicar_catalog_reader,synthetic_catalog_automation;

create table public_test_private.macvicar_admissions (
 admission_id uuid primary key default extensions.gen_random_uuid(),
 store_id uuid not null references app_public.stores(id),
 binding_id uuid not null references public_test_private.bindings(binding_id),
 runtime_version bigint not null,
 source_sha text not null check(source_sha~'^[0-9a-f]{40}$'),
 artifact_digest text not null check(artifact_digest~'^[0-9a-f]{64}$'),
 configuration_digest text not null check(configuration_digest~'^[0-9a-f]{64}$'),
 schema_digest text not null check(schema_digest~'^[0-9a-f]{64}$'),
 manifest_sha256 text not null check(manifest_sha256~'^[0-9a-f]{64}$'),
 manifest_json_digest bytea not null check(octet_length(manifest_json_digest)=32),
 public_profile_digest bytea not null check(octet_length(public_profile_digest)=32),
 manifest jsonb not null,
 approvals jsonb not null,
 decision_ref text not null check(length(decision_ref) between 1 and 500),
 review_ref text not null check(review_ref~'^https://github.com/samarquis/AntiqueTrail/pull/[0-9]+$'),
 operator_ref text not null check(length(operator_ref) between 1 and 100),
 stop_owner text not null check(length(stop_owner) between 1 and 100),
 starts_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>starts_at),
 state text not null default 'prepared' check(state in ('prepared','active','revoked')),
 version bigint not null default 1,
 prepared_at timestamptz not null default statement_timestamp(),
 activated_at timestamptz,
 revoked_at timestamptz
);
create unique index macvicar_one_active on public_test_private.macvicar_admissions((true)) where state='active';
alter table public_test_private.macvicar_admissions enable row level security;
alter table public_test_private.macvicar_admissions force row level security;
revoke all on public_test_private.macvicar_admissions from public,anon,authenticated,service_role;
create policy macvicar_operator on public_test_private.macvicar_admissions to postgres using(true) with check(true);

-- Native publication operator, not a browser claim, account or Owner command.
create function public_test_private.prepare_macvicar_store()
returns uuid language plpgsql security definer set search_path='' as $$
declare target app_public.stores%rowtype; area uuid; category uuid; item text;
begin
 perform pg_advisory_xact_lock(hashtextextended('ADR0011:Macvicar',0));
 if exists(select 1 from app_public.stores where slug<>'the-market-at-macvicar' and
  (lower(btrim(name))='the market at macvicar'
   or (lower(btrim(address)) in ('2307 sw 10th ave','2307 sw 10th avenue') and lower(btrim(town))='topeka' and state_code='KS')
   or regexp_replace(coalesce(phone,''),'[^0-9]','','g') in ('7854094277','17854094277'))) then
  raise exception 'macvicar_store_identity_conflict' using errcode='42501';
 end if;
 select * into target from app_public.stores where slug='the-market-at-macvicar' for update;
 if found then
  if target.synthetic or target.audience<>'public' or target.name<>'The Market at Macvicar'
   or target.town<>'Topeka' or target.state_code<>'KS' or target.address<>'2307 SW 10th Ave'
   or exists(select 1 from app_private.role_grants where store_id=target.id and state='active')
   or exists(select 1 from partner_private.store_partner_grants where store_id=target.id and state='active')
   or exists(select 1 from partner_private.listing_claims where store_id=target.id)
  then raise exception 'macvicar_store_identity_conflict' using errcode='42501';end if;
  return target.id;
 end if;
 select id into area from app_public.catalog_areas where lower(label)='topeka' and state_code='KS';
 if area is null then
  insert into app_public.catalog_areas(slug,label,state_code) values('topeka','Topeka','KS') returning id into area;
 end if;
 insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,
  summary,description,phone,timezone_name)
 values(extensions.gen_random_uuid(),false,'public','draft','the-market-at-macvicar','The Market at Macvicar',
  'Topeka','KS','2307 SW 10th Ave',area,'A Vintage Boutique with more than 50 little shops in Topeka.',
  'Explore a vintage boutique with more than 50 little shops offering antiques, collectibles, rustic decor, furniture, gifts, handcrafted goods, jewelry, handbags, and home accents. Find The Market at Macvicar at 2307 SW 10th Ave, Topeka, KS 66604, on the corner of 10th and Macvicar.',
  '(785) 409-4277','America/Chicago') returning * into target;
 foreach item in array array['Antiques','Vintage','Rustic','Collectibles','Gifts','Home Accents','Handcrafted','Accessories','Handbags','Jewelry','Furniture'] loop
  select id into category from app_public.store_categories where lower(label)=lower(item);
  if category is null then
   insert into app_public.store_categories(slug,label) values(replace(lower(item),' ','-'),item) returning id into category;
  end if;
  insert into app_public.store_category_assignments(store_id,category_id) values(target.id,category);
 end loop;
 insert into app_public.store_weekly_hours(store_id,iso_weekday,interval_index,is_closed,opens_at,closes_at)
 select target.id,day,1,day in (1,7),case when day in (1,7) then null else '10:00'::time end,
  case when day in (1,7) then null when day=6 then '16:00'::time else '17:00'::time end from generate_series(1,7) day;
 return target.id;
end $$;

create function public_test_private.macvicar_profile_digest(p_store_id uuid)
returns bytea language sql stable security definer set search_path='' as $$
 select extensions.digest(convert_to(jsonb_build_object('slug',s.slug,'name',s.name,'town',s.town,'state',s.state_code,'address',s.address,
  'area',(select jsonb_build_array(a.id,a.slug,a.label,a.state_code) from app_public.catalog_areas a where a.id=s.area_id),
  'summary',s.summary,'description',s.description,'phone',s.phone,'website',s.website,'timezone',s.timezone_name,
  'categories',(select jsonb_agg(jsonb_build_array(c.slug,c.label) order by c.slug) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
  'hours',(select jsonb_agg(jsonb_build_array(h.iso_weekday,h.interval_index,h.is_closed,h.opens_at,h.closes_at) order by h.iso_weekday,h.interval_index) from app_public.store_weekly_hours h where h.store_id=s.id))::text,'UTF8'),'sha256')
 from app_public.stores s where s.id=p_store_id;
$$;
create function public_test_private.prepare_macvicar(p_spec jsonb,p_manifest text,p_approvals jsonb,p_expected_runtime_version bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public_test_private.runtime%rowtype; b public_test_private.bindings%rowtype;
 m jsonb; asset jsonb; approval jsonb; receipt uuid; target uuid;
begin
 select * into r from public_test_private.runtime where id=1 for update;
 select * into b from public_test_private.bindings where binding_id=r.active_binding_id for share;
 if r.version is distinct from p_expected_runtime_version or b.binding_id is null
  or public_test_private.active_binding('catalog',false) is distinct from b.binding_id
  or jsonb_typeof(p_spec) is distinct from 'object'
  or p_spec-array['storeId','bindingId','sourceSha','artifactDigest','configurationDigest','schemaDigest','manifestSha256','storeProfileDigest','decisionRef','reviewRef','operatorRef','stopOwner','startsAt','expiresAt']<>'{}'::jsonb
  or p_spec->>'bindingId' is distinct from b.binding_id::text
  or p_spec->>'sourceSha' is distinct from b.source_sha
  or p_spec->>'artifactDigest' is distinct from b.artifact_digest
  or p_spec->>'configurationDigest' is distinct from b.configuration_digest
  or p_spec->>'schemaDigest' is distinct from b.schema_digest
  or p_manifest is null or octet_length(p_manifest)>150000
  or p_spec->>'manifestSha256' is distinct from encode(extensions.digest(convert_to(p_manifest,'UTF8'),'sha256'),'hex')
 then raise exception 'macvicar_admission_invalid' using errcode='42501';end if;
 target:=(p_spec->>'storeId')::uuid;
 if target is null or target is distinct from public_test_private.prepare_macvicar_store() then
  raise exception 'macvicar_store_identity_conflict' using errcode='42501';end if;
 if p_spec->>'storeProfileDigest' is distinct from encode(public_test_private.macvicar_profile_digest(target),'hex') then
  raise exception 'macvicar_profile_mismatch' using errcode='42501';end if;
 m:=p_manifest::jsonb;
 if jsonb_typeof(m) is distinct from 'object' or m-array['schemaVersion','storeSlug','galleryWallSha256','sourceRightsManifestSha256','assets']<>'{}'::jsonb
  or m->'schemaVersion' is distinct from '1'::jsonb or m->>'storeSlug' is distinct from 'the-market-at-macvicar'
  or coalesce(m->>'galleryWallSha256','')!~'^[0-9a-f]{64}$' or coalesce(m->>'sourceRightsManifestSha256','')!~'^[0-9a-f]{64}$'
  or jsonb_typeof(m->'assets') is distinct from 'array' or jsonb_array_length(m->'assets')<>51
  or jsonb_typeof(p_approvals) is distinct from 'array' or jsonb_array_length(p_approvals)<>51
 then raise exception 'macvicar_manifest_invalid' using errcode='42501';end if;
 for asset in select value from jsonb_array_elements(m->'assets') loop
  if jsonb_typeof(asset) is distinct from 'object'
   or asset-array['kind','order','sha256','bytes','width','height','chunks','path','alt','caption','rightsLabel','sourcePhotoId']<>'{}'::jsonb
   or exists(select 1 from unnest(array['kind','sha256','path','alt','caption','rightsLabel','sourcePhotoId']) k where jsonb_typeof(asset->k) is distinct from 'string')
   or exists(select 1 from unnest(array['order','bytes','width','height']) k where jsonb_typeof(asset->k) is distinct from 'number')
   or coalesce(asset->>'sha256','')!~'^[0-9a-f]{64}$' or coalesce(asset->>'sourcePhotoId','')!~'^[0-9]{5,30}$'
   or asset->>'path' is distinct from '/curated/macvicar/v1/'||(asset->>'sha256')||'.webp'
   or coalesce(asset->>'kind','') not in ('cover','gallery')
   or coalesce(asset->>'order','')!~'^[0-9]+$' or (asset->>'order')::integer not between 0 and 50
   or (asset->>'kind'='cover') is distinct from ((asset->>'order')::integer=0)
   or coalesce(asset->>'bytes','')!~'^[0-9]+$' or (asset->>'bytes')::bigint not between 1 and 4194304
   or coalesce(asset->>'width','')!~'^[0-9]+$' or coalesce(asset->>'height','')!~'^[0-9]+$'
   or (asset->>'width')::integer not between 1 and 8192 or (asset->>'height')::integer not between 1 and 8192
   or (asset->>'width')::bigint*(asset->>'height')::bigint>40000000
   or jsonb_typeof(asset->'chunks') is distinct from 'array' or jsonb_array_length(asset->'chunks')=0
   or exists(select 1 from jsonb_array_elements_text(asset->'chunks') c where c not in ('VP8','VP8L','VP8X','ALPH'))
   or jsonb_typeof(asset->'alt') is distinct from 'string' or length(asset->>'alt') not between 1 and 500
   or jsonb_typeof(asset->'caption') is distinct from 'string' or length(asset->>'caption') not between 1 and 1000
   or asset->>'rightsLabel' is distinct from 'Store owner-authorized photo'
  then raise exception 'macvicar_asset_invalid' using errcode='42501';end if;
  select value into approval from jsonb_array_elements(p_approvals) where value->>'assetSha256'=asset->>'sha256';
  if approval is null or jsonb_typeof(approval) is distinct from 'object'
   or approval-array['assetSha256','metadataDigest','permissionRef','approverRef','approvedAt','securityRef']<>'{}'::jsonb
   or exists(select 1 from unnest(array['assetSha256','metadataDigest','permissionRef','approverRef','approvedAt','securityRef']) k where jsonb_typeof(approval->k) is distinct from 'string')
   or approval->>'metadataDigest' is distinct from encode(extensions.digest(convert_to(asset::text,'UTF8'),'sha256'),'hex')
   or length(coalesce(approval->>'permissionRef','')) not between 1 and 500
   or length(coalesce(approval->>'approverRef','')) not between 1 and 100
   or length(coalesce(approval->>'securityRef','')) not between 1 and 500
   or (approval->>'approvedAt')::timestamptz is null or (approval->>'approvedAt')::timestamptz>statement_timestamp()
  then raise exception 'macvicar_asset_approval_invalid' using errcode='42501';end if;
 end loop;
 if (select count(distinct x->>'sha256') from jsonb_array_elements(m->'assets') x)<>51
  or (select count(distinct x->>'sourcePhotoId') from jsonb_array_elements(m->'assets') x)<>51
  or (select count(distinct x->>'order') from jsonb_array_elements(m->'assets') x)<>51
  or (select count(distinct x->>'assetSha256') from jsonb_array_elements(p_approvals) x)<>51
  or (p_spec->>'startsAt')::timestamptz<b.starts_at or (p_spec->>'expiresAt')::timestamptz>b.expires_at
 then raise exception 'macvicar_manifest_invalid' using errcode='42501';end if;
 insert into public_test_private.macvicar_admissions(store_id,binding_id,runtime_version,source_sha,artifact_digest,configuration_digest,schema_digest,
  manifest_sha256,manifest_json_digest,public_profile_digest,manifest,approvals,decision_ref,review_ref,operator_ref,stop_owner,starts_at,expires_at)
 values(target,b.binding_id,r.version,b.source_sha,b.artifact_digest,b.configuration_digest,b.schema_digest,p_spec->>'manifestSha256',extensions.digest(convert_to(m::text,'UTF8'),'sha256'),public_test_private.macvicar_profile_digest(target),m,p_approvals,
  p_spec->>'decisionRef',p_spec->>'reviewRef',p_spec->>'operatorRef',p_spec->>'stopOwner',(p_spec->>'startsAt')::timestamptz,(p_spec->>'expiresAt')::timestamptz)
 returning admission_id into receipt;
 return receipt;
end $$;

create function public_test_private.macvicar_active(p_store_id uuid,p_admission_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public_test_private.macvicar_admissions a
 join public_test_private.runtime r on r.active_binding_id=a.binding_id and r.version=a.runtime_version
 join public_test_private.bindings b on b.binding_id=a.binding_id
 join app_public.stores s on s.id=a.store_id
 where a.store_id=p_store_id and (p_admission_id is null or a.admission_id=p_admission_id) and a.state='active' and a.activated_at is not null and a.revoked_at is null
  and a.public_profile_digest=public_test_private.macvicar_profile_digest(s.id)
  and a.manifest_json_digest=extensions.digest(convert_to(a.manifest::text,'UTF8'),'sha256')
  and a.binding_id=public_test_private.active_binding('catalog') and b.source_sha=a.source_sha
  and b.artifact_digest=a.artifact_digest and b.configuration_digest=a.configuration_digest and b.schema_digest=a.schema_digest
  and statement_timestamp()>=a.starts_at and statement_timestamp()<a.expires_at
  and a.expires_at<=b.expires_at and not s.synthetic and s.audience='public' and s.publication_state='active'
  and s.slug='the-market-at-macvicar' and s.name='The Market at Macvicar' and s.address='2307 SW 10th Ave'
  and s.town='Topeka' and s.state_code='KS');
$$;
create function public_test_private.activate_macvicar(p_id uuid,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public_test_private.macvicar_admissions%rowtype; r public_test_private.runtime%rowtype;
begin
 select * into r from public_test_private.runtime where id=1 for update;
 select * into a from public_test_private.macvicar_admissions where admission_id=p_id for update;
 if a.admission_id is null or a.version is distinct from p_expected_version or a.state<>'prepared'
  or r.active_binding_id is distinct from a.binding_id or r.version is distinct from a.runtime_version
  or a.binding_id is distinct from public_test_private.active_binding('catalog',false)
  or statement_timestamp()<a.starts_at or statement_timestamp()>=a.expires_at
 then raise exception 'macvicar_activation_denied' using errcode='42501';end if;
 update app_public.stores set publication_state='active' where id=a.store_id;
 update public_test_private.macvicar_admissions set state='active',activated_at=statement_timestamp(),version=version+1 where admission_id=p_id;
 return p_expected_version+1;
end $$;
create function public_test_private.revoke_macvicar(p_id uuid,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public_test_private.runtime where id=1 for update;
 update public_test_private.macvicar_admissions set state='revoked',revoked_at=statement_timestamp(),version=version+1
 where admission_id=p_id and version=p_expected_version and state in ('prepared','active');
 if not found then raise exception 'macvicar_revocation_denied' using errcode='42501';end if;
 return p_expected_version+1;
end $$;

-- Only reviewed public columns; no account/approval/secret JSON serialization.
grant usage on schema public_test_private,app_public to macvicar_catalog_reader;
grant select(store_id,manifest) on public_test_private.macvicar_admissions to macvicar_catalog_reader;
grant select(id,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name) on app_public.stores to macvicar_catalog_reader;
grant select on app_public.catalog_areas,app_public.store_categories,app_public.store_category_assignments,app_public.store_weekly_hours to macvicar_catalog_reader;
create policy macvicar_reader_admission on public_test_private.macvicar_admissions for select to macvicar_catalog_reader using(public_test_private.macvicar_active(store_id,admission_id));
create policy macvicar_reader_store on app_public.stores for select to macvicar_catalog_reader using(public_test_private.macvicar_active(id));
create policy macvicar_reader_areas on app_public.catalog_areas for select to macvicar_catalog_reader using(true);
create policy macvicar_reader_categories on app_public.store_categories for select to macvicar_catalog_reader using(true);
create policy macvicar_reader_assignments on app_public.store_category_assignments for select to macvicar_catalog_reader using(public_test_private.macvicar_active(store_id));
create policy macvicar_reader_hours on app_public.store_weekly_hours for select to macvicar_catalog_reader using(public_test_private.macvicar_active(store_id));

create function public_test_private.macvicar_projection(p_q text,p_category text,p_area text,p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_agg(jsonb_build_object(
  'id',s.id,'slug',s.slug,'name',s.name,'town',s.town,'state_code',s.state_code,'address',s.address,
  'area_slug',area.slug,'area_label',area.label,'summary',s.summary,'description',s.description,'phone',s.phone,
  'website',s.website,'timezone_name',s.timezone_name,'email','themarketatmacvicar2307@gmail.com',
  'categories',(select jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug)
   from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
  'weekly_hours',(select jsonb_agg(jsonb_build_object('weekday',h.iso_weekday,'is_closed',h.is_closed,'interval_index',h.interval_index,
   'opens_at',to_char(h.opens_at,'HH24:MI'),'closes_at',to_char(h.closes_at,'HH24:MI')) order by h.iso_weekday,h.interval_index) from app_public.store_weekly_hours h where h.store_id=s.id),
  'media',(select jsonb_agg(jsonb_build_object('src',x->>'path','alt',x->>'alt','kind',x->>'kind','caption',x->>'caption','rightsLabel',x->>'rightsLabel') order by (x->>'order')::integer) from jsonb_array_elements(a.manifest->'assets') x),
  'freshness_state',case when statement_timestamp()>'2026-10-03'::date+interval '180 days' then 'overdue' else 'current' end,
  'oldest_verified_at','2026-10-03','as_of_utc',statement_timestamp(),
  'provenance',jsonb_build_object('sourceLabel','Official Facebook profile; user-confirmed hours','updatedAt','2026-10-03',
   'note','Hours confirmed by the user on October 3, 2026. Gallery images show examples and may not reflect current inventory. The cover is an official Facebook photo dated October 21, 2017; it shows the front windows only.'),
  'accessibility',jsonb_build_object('status','unverified','details',jsonb_build_array('Entry and other accessibility details have not been verified.')),
  'socialLinks',jsonb_build_array(jsonb_build_object('platform','Facebook','href','https://www.facebook.com/TheMarketatMacvicar2307/')),
  'hoursExceptions','[]'::jsonb,'updates','[]'::jsonb))
 from app_public.stores s join app_public.catalog_areas area on area.id=s.area_id
 join public_test_private.macvicar_admissions a on a.store_id=s.id
 where public_test_private.macvicar_active(s.id) and statement_timestamp()<('2026-10-03'::date+interval '365 days')
  and (p_slug is null or s.slug=p_slug) and (p_area is null or area.slug=p_area)
  and (p_category is null or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
  and (p_q is null or s.name ilike '%'||p_q||'%' or s.town ilike '%'||p_q||'%' or area.label ilike '%'||p_q||'%'
   or exists(select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.label ilike '%'||p_q||'%'))),'[]'::jsonb);
$$;
alter function public_test_private.macvicar_projection(text,text,text,text) owner to macvicar_catalog_reader;

-- Preserve original synthetic definer/ACL/rate/error contracts, compose only at
-- the existing public gateway OID. Synthetic automation gains no real privileges.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_public.public_test_catalog_gateway_request(text,text,jsonb)'::regprocedure);
 definition:=replace(definition,'app_public.public_test_catalog_gateway_request','public_test_private.catalog_gateway_base');
 execute definition;
end $$;
alter function public_test_private.catalog_gateway_base(text,text,jsonb) owner to synthetic_catalog_automation;
grant create on schema app_public to public_test_catalog_composer;
grant usage on schema app_public,public_test_private to public_test_catalog_composer;
alter function app_public.public_test_catalog_gateway_request(text,text,jsonb) owner to public_test_catalog_composer;
set local role public_test_catalog_composer;
create or replace function app_public.public_test_catalog_gateway_request(p_key_hash text,p_operation text,p_args jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare fictional jsonb; real_store jsonb; query text;
begin
 fictional:=public_test_private.catalog_gateway_base(p_key_hash,p_operation,p_args);
 if p_operation='list' then
  query:=app_public.normalize_catalog_query(p_args->>'p_q');
  real_store:=public_test_private.macvicar_projection(query,p_args->>'p_category',p_args->>'p_area',null);
 else
  if p_args->>'p_slug' is null then return fictional;end if;
  real_store:=public_test_private.macvicar_projection(null,null,null,p_args->>'p_slug');
 end if;
 return real_store||fictional;
end $$;
reset role;
revoke create on schema app_public from public_test_catalog_composer;

-- Scoped real store never becomes a Shopper save/trip target, even for existing
-- beta accounts. Identity helper reads only a boolean, never real store content.
create function public_test_private.macvicar_store_scoped(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public_test_private.macvicar_admissions where store_id=p_store_id);
$$;
grant create on schema shopper_private to identity_service;
set local role identity_service;
create or replace function shopper_private.store_is_shopper_visible(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not public_test_private.macvicar_store_scoped(p_store_id)
  and public_test_private.store_visible_base(p_store_id) and public_test_private.store_allowed(p_store_id);
$$;
reset role;
revoke create on schema shopper_private from identity_service;

revoke all on function public_test_private.prepare_macvicar_store(),public_test_private.prepare_macvicar(jsonb,text,jsonb,bigint),
 public_test_private.activate_macvicar(uuid,bigint),public_test_private.revoke_macvicar(uuid,bigint),
 public_test_private.macvicar_active(uuid,uuid),public_test_private.macvicar_profile_digest(uuid),public_test_private.macvicar_projection(text,text,text,text),
 public_test_private.catalog_gateway_base(text,text,jsonb),public_test_private.macvicar_store_scoped(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public_test_private.macvicar_active(uuid,uuid) to macvicar_catalog_reader;
grant execute on function public_test_private.macvicar_projection(text,text,text,text),public_test_private.catalog_gateway_base(text,text,jsonb) to public_test_catalog_composer;
grant execute on function app_public.normalize_catalog_query(text) to public_test_catalog_composer;
grant execute on function public_test_private.macvicar_store_scoped(uuid) to identity_service;
revoke all on function app_public.public_test_catalog_gateway_request(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_public.public_test_catalog_gateway_request(text,text,jsonb) to public_catalog_gateway;
revoke create on schema public_test_private from macvicar_catalog_reader,synthetic_catalog_automation;
alter function public_test_private.prepare_macvicar_store() owner to postgres;
alter function public_test_private.prepare_macvicar(jsonb,text,jsonb,bigint) owner to postgres;
alter function public_test_private.activate_macvicar(uuid,bigint) owner to postgres;
alter function public_test_private.revoke_macvicar(uuid,bigint) owner to postgres;
alter function public_test_private.macvicar_active(uuid,uuid) owner to postgres;
alter function public_test_private.macvicar_profile_digest(uuid) owner to postgres;
alter function public_test_private.macvicar_store_scoped(uuid) owner to postgres;
do $$declare item text;begin
 foreach item in array array['macvicar_catalog_reader','public_test_catalog_composer','synthetic_catalog_automation','identity_service'] loop
  if not exists(select 1 from pg_temp.macvicar_prior_memberships where rolname=item) then
   execute format('revoke %I from postgres',item);
  end if;
 end loop;
end $$;
