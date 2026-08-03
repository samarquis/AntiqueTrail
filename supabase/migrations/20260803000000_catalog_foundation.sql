-- Package 1: local, Synthetic Store catalog foundation.
-- This migration is the source of truth for the first public read boundary.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_public;
revoke all on schema app_public from public;
revoke create on schema public from public;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'catalog_reader') then
    create role catalog_reader nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;
-- The migration role must be a member long enough to transfer function ownership.
grant catalog_reader to postgres;
grant usage on schema app_public to postgres;
grant catalog_reader to supabase_admin;
grant usage on schema app_public to supabase_admin;
grant usage on schema app_public to catalog_reader;
revoke all on schema app_public from anon, authenticated;
grant usage on schema app_public to anon, authenticated;

create type app_public.publication_state as enum ('draft', 'active', 'hidden', 'retired');
create type app_public.verification_group as enum (
  'identity_location', 'contact', 'hours', 'categories_attributes', 'media_social'
);
create type app_public.media_kind as enum ('cover', 'gallery');

create table app_public.catalog_areas (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  label text not null,
  state_code text not null,
  sort_order smallint not null default 0,
  constraint catalog_areas_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 1 and 64),
  constraint catalog_areas_label_format check (char_length(btrim(label)) between 1 and 80 and label = btrim(label)),
  constraint catalog_areas_state_code_format check (state_code ~ '^[A-Z]{2}$'),
  constraint catalog_areas_sort_order_nonnegative check (sort_order >= 0),
  constraint catalog_areas_label_not_empty check (label <> '')
);

create table app_public.store_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_order smallint not null default 0,
  constraint store_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 1 and 64),
  constraint store_categories_label_format check (char_length(btrim(label)) between 1 and 80 and label = btrim(label)),
  constraint store_categories_sort_order_nonnegative check (sort_order >= 0),
  constraint store_categories_label_not_empty check (label <> '')
);

create unique index catalog_areas_label_normalized on app_public.catalog_areas (lower(label));
create unique index store_categories_label_normalized on app_public.store_categories (lower(label));

create table app_public.stores (
  id uuid primary key default extensions.gen_random_uuid(),
  synthetic boolean not null default true,
  audience text not null default 'synthetic',
  publication_state app_public.publication_state not null default 'draft',
  slug text not null unique,
  name text not null,
  town text not null,
  state_code text not null,
  address text not null,
  area_id uuid not null references app_public.catalog_areas(id),
  latitude numeric(8,5),
  longitude numeric(8,5),
  summary text not null,
  description text not null,
  phone text,
  website text,
  timezone_name text not null default 'America/Chicago',
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint stores_audience_synthetic check (audience = 'synthetic' and synthetic),
  constraint stores_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 1 and 96),
  constraint stores_name_format check (char_length(btrim(name)) between 1 and 120 and name = btrim(name)),
  constraint stores_town_format check (char_length(btrim(town)) between 1 and 80 and town = btrim(town)),
  constraint stores_state_code_format check (state_code ~ '^[A-Z]{2}$'),
  constraint stores_address_format check (char_length(btrim(address)) between 1 and 240 and address = btrim(address)),
  constraint stores_summary_format check (char_length(btrim(summary)) between 1 and 280 and summary = btrim(summary)),
  constraint stores_description_format check (char_length(btrim(description)) between 1 and 4000 and description = btrim(description)),
  constraint stores_coordinates_pair check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  constraint stores_timezone_format check (timezone_name ~ '^[A-Za-z][A-Za-z0-9_+-]*/[A-Za-z0-9_+-]+(?:/[A-Za-z0-9_+-]+)*$'),
  constraint stores_phone_format check (phone is null or phone ~ '^[+0-9(). ext-]{7,32}$'),
  constraint stores_website_format check (website is null or website ~* '^https?://[^[:space:]]+$')
);

create table app_public.store_category_assignments (
  store_id uuid not null references app_public.stores(id) on delete cascade,
  category_id uuid not null references app_public.store_categories(id) on delete restrict,
  primary key (store_id, category_id)
);

create table app_public.store_fact_verifications (
  store_id uuid not null references app_public.stores(id) on delete cascade,
  verification_group app_public.verification_group not null,
  verified_at timestamptz not null,
  provenance_label text not null,
  verifier_kind text not null default 'synthetic_fixture',
  primary key (store_id, verification_group),
  constraint fact_provenance_format check (char_length(btrim(provenance_label)) between 1 and 240 and provenance_label = btrim(provenance_label)),
  constraint fact_verifier_kind_synthetic check (verifier_kind = 'synthetic_fixture')
);

create table app_public.store_weekly_hours (
  store_id uuid not null references app_public.stores(id) on delete cascade,
  iso_weekday smallint not null,
  interval_index smallint not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  primary key (store_id, iso_weekday, interval_index),
  constraint weekly_day_range check (iso_weekday between 1 and 7),
  constraint weekly_index_range check (interval_index between 1 and 2),
  constraint weekly_closed_shape check ((is_closed and opens_at is null and closes_at is null) or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table app_public.store_hour_exceptions (
  store_id uuid not null references app_public.stores(id) on delete cascade,
  local_date date not null,
  interval_index smallint not null,
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  label text not null,
  primary key (store_id, local_date, interval_index),
  constraint exception_index_range check (interval_index between 1 and 2),
  constraint exception_label_format check (char_length(btrim(label)) between 1 and 160 and label = btrim(label)),
  constraint exception_closed_shape check ((is_closed and opens_at is null and closes_at is null) or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table app_public.store_media (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete cascade,
  asset_path text not null,
  kind app_public.media_kind not null,
  alt_text text not null,
  display_order smallint not null default 0,
  constraint media_local_asset check (asset_path ~ '^/assets/[a-zA-Z0-9_./-]+\.(svg|png|jpg|jpeg|webp)$'),
  constraint media_alt_format check (char_length(btrim(alt_text)) between 1 and 240 and alt_text = btrim(alt_text)),
  constraint media_order_range check (display_order between 0 and 20)
);
create unique index store_media_one_cover on app_public.store_media(store_id) where kind = 'cover';
create unique index store_media_order on app_public.store_media(store_id, display_order);

create index stores_area_publication_idx on app_public.stores(area_id, publication_state);
create index assignments_category_store_idx on app_public.store_category_assignments(category_id, store_id);
create index assignments_store_category_idx on app_public.store_category_assignments(store_id, category_id);
create index categories_slug_idx on app_public.store_categories(slug);
create index areas_slug_idx on app_public.catalog_areas(slug);

create or replace function app_public.require_published_store_category()
returns trigger language plpgsql set search_path = pg_catalog, app_public as $$
declare target_id uuid; publication app_public.publication_state;
begin
  if tg_table_name = 'stores' then
    target_id := case when tg_op='DELETE' then old.id else new.id end;
  else
    target_id := case when tg_op='DELETE' then old.store_id else new.store_id end;
  end if;
  select publication_state into publication from app_public.stores where id=target_id;
  if publication='active' and not exists (select 1 from app_public.store_category_assignments where store_id=target_id) then
    raise exception 'published_store_requires_category';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end; $$;
create constraint trigger published_store_requires_category after insert or update on app_public.stores
deferrable initially deferred for each row execute function app_public.require_published_store_category();
create trigger assignment_requires_published_category after delete or update on app_public.store_category_assignments
for each row execute function app_public.require_published_store_category();

create or replace function app_public.validate_weekly_hours()
returns trigger language plpgsql set search_path = pg_catalog, app_public as $$
declare conflict_exists boolean; row_count integer;
begin
  select count(*) into row_count from app_public.store_weekly_hours where store_id=new.store_id and iso_weekday=new.iso_weekday;
  if row_count >= 2 and not exists (select 1 from app_public.store_weekly_hours where store_id=new.store_id and iso_weekday=new.iso_weekday and interval_index=new.interval_index) then raise exception 'weekly_hours_too_many_intervals'; end if;
  if new.is_closed and exists (select 1 from app_public.store_weekly_hours where store_id=new.store_id and iso_weekday=new.iso_weekday) then raise exception 'weekly_closed_day_cannot_have_intervals'; end if;
  if not new.is_closed and exists (select 1 from app_public.store_weekly_hours where store_id=new.store_id and iso_weekday=new.iso_weekday and is_closed) then raise exception 'weekly_open_day_cannot_have_closed_row'; end if;
  if not new.is_closed then
    select exists (select 1 from app_public.store_weekly_hours h where h.store_id=new.store_id and h.iso_weekday=new.iso_weekday and h.interval_index<>new.interval_index and ((new.opens_at,new.closes_at) overlaps (h.opens_at,h.closes_at) or new.opens_at=h.closes_at or new.closes_at=h.opens_at)) into conflict_exists;
    if conflict_exists then raise exception 'weekly_hours_overlap_or_touch'; end if;
  end if;
  return new;
end; $$;
create trigger validate_weekly_hours before insert or update on app_public.store_weekly_hours for each row execute function app_public.validate_weekly_hours();

create or replace function app_public.validate_hour_exception()
returns trigger language plpgsql set search_path = pg_catalog, app_public as $$
declare conflict_exists boolean; row_count integer;
begin
  select count(*) into row_count from app_public.store_hour_exceptions where store_id=new.store_id and local_date=new.local_date;
  if row_count >= 2 and not exists (select 1 from app_public.store_hour_exceptions where store_id=new.store_id and local_date=new.local_date and interval_index=new.interval_index) then raise exception 'exception_too_many_intervals'; end if;
  if new.is_closed and exists (select 1 from app_public.store_hour_exceptions where store_id=new.store_id and local_date=new.local_date) then raise exception 'exception_closed_day_cannot_have_intervals'; end if;
  if not new.is_closed and exists (select 1 from app_public.store_hour_exceptions where store_id=new.store_id and local_date=new.local_date and is_closed) then raise exception 'exception_open_day_cannot_have_closed_row'; end if;
  if not new.is_closed then
    select exists (select 1 from app_public.store_hour_exceptions h where h.store_id=new.store_id and h.local_date=new.local_date and h.interval_index<>new.interval_index and ((new.opens_at,new.closes_at) overlaps (h.opens_at,h.closes_at) or new.opens_at=h.closes_at or new.closes_at=h.opens_at)) into conflict_exists;
    if conflict_exists then raise exception 'exception_overlap_or_touch'; end if;
  end if;
  return new;
end; $$;
create trigger validate_hour_exception before insert or update on app_public.store_hour_exceptions for each row execute function app_public.validate_hour_exception();

create or replace function app_public.catalog_freshness(p_store_id uuid, p_as_of timestamptz)
returns table (freshness_state text, oldest_verified_at timestamptz)
language sql stable set search_path = pg_catalog, app_public as $$
  with required_groups as (
    select verification_group, verified_at from app_public.store_fact_verifications
    where store_id=p_store_id and verification_group in ('identity_location','contact','hours','categories_attributes')
  ), oldest as (select min(verified_at) verified_at, count(*) group_count from required_groups)
  select case when group_count<4 then 'unavailable' when p_as_of-verified_at<=interval '180 days' then 'current' when p_as_of-verified_at<=interval '365 days' then 'overdue' else 'stale' end, verified_at from oldest;
$$;

create type app_public.catalog_list_row as (
  id uuid, slug text, name text, town text, state_code text, area_slug text, area_label text,
  summary text, phone text, website text, timezone_name text, cover_asset_path text,
  cover_alt_text text, media jsonb, categories jsonb, today_hours jsonb, hours_state text,
  is_open_now boolean, freshness_state text, oldest_verified_at timestamptz, as_of_utc timestamptz
);
create type app_public.catalog_details_row as (
  id uuid, slug text, name text, town text, state_code text, address text, area_slug text,
  area_label text, summary text, description text, phone text, website text,
  timezone_name text, categories jsonb, weekly_hours jsonb, exceptions jsonb,
  media jsonb, provenance jsonb, freshness_state text, oldest_verified_at timestamptz,
  as_of_utc timestamptz
);

create or replace function app_public.normalize_catalog_query(p_q text)
returns text language plpgsql immutable set search_path = pg_catalog, app_public as $$
declare normalized text;
begin
  if p_q is null then return null; end if;
  if p_q ~ '[[:cntrl:]]' then raise exception 'invalid_catalog_filter'; end if;
  normalized := regexp_replace(btrim(p_q), '\s+', ' ', 'g');
  if char_length(normalized)>100 then raise exception 'catalog_query_too_long'; end if;
  return nullif(normalized,'');
end; $$;

create or replace function app_public.catalog_today(p_store_id uuid, p_as_of timestamptz, p_timezone text)
returns table (hours jsonb, hours_state text, is_open_now boolean)
language plpgsql stable set search_path = pg_catalog, app_public as $$
declare
  local_day date := (p_as_of at time zone p_timezone)::date;
  weekday integer := extract(isodow from local_day);
  local_time time := (p_as_of at time zone p_timezone)::time;
  closed boolean; intervals jsonb; begins time; ends time;
begin
  if exists (select 1 from app_public.store_hour_exceptions where store_id=p_store_id and local_date=local_day) then
    select bool_or(is_closed), coalesce(jsonb_agg(jsonb_build_object('opens_at',to_char(opens_at,'HH24:MI'),'closes_at',to_char(closes_at,'HH24:MI')) order by interval_index) filter (where not is_closed),'[]'::jsonb), min(opens_at) filter (where not is_closed), max(closes_at) filter (where not is_closed)
      into closed, intervals, begins, ends from app_public.store_hour_exceptions where store_id=p_store_id and local_date=local_day;
  else
    select bool_or(is_closed), coalesce(jsonb_agg(jsonb_build_object('opens_at',to_char(opens_at,'HH24:MI'),'closes_at',to_char(closes_at,'HH24:MI')) order by interval_index) filter (where not is_closed),'[]'::jsonb), min(opens_at) filter (where not is_closed), max(closes_at) filter (where not is_closed)
      into closed, intervals, begins, ends from app_public.store_weekly_hours where store_id=p_store_id and iso_weekday=weekday;
  end if;
  if closed is null then
    return query select jsonb_build_object('weekday',weekday,'is_closed',true,'intervals','[]'::jsonb), 'unavailable', false;
  elsif closed then
    return query select jsonb_build_object('weekday',weekday,'is_closed',true,'intervals','[]'::jsonb), 'closed', false;
  elsif intervals='[]'::jsonb then
    return query select jsonb_build_object('weekday',weekday,'is_closed',false,'intervals',intervals), 'unavailable', false;
  else
    return query select jsonb_build_object('weekday',weekday,'is_closed',false,'intervals',intervals), 'available', (local_time>=begins and local_time<ends);
  end if;
end; $$;

create or replace function app_public.catalog_list(p_q text default null, p_category text default null, p_area text default null)
returns setof app_public.catalog_list_row language plpgsql stable security definer
set search_path = pg_catalog, app_public as $$
declare as_of timestamptz := statement_timestamp(); normalized_q text := app_public.normalize_catalog_query(p_q); matched integer;
begin
  if p_category is not null and p_category !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  if p_area is not null and p_area !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'invalid_catalog_filter'; end if;
  with visible as (
    select s.id from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,as_of) f
    where s.synthetic and s.audience='synthetic' and s.publication_state='active' and f.freshness_state in ('current','overdue')
      and (p_area is null or a.slug=p_area)
      and (p_category is null or exists (select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
      and (normalized_q is null or s.name ilike '%'||normalized_q||'%' or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%' or exists (select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.label ilike '%'||normalized_q||'%'))
  ) select count(*) into matched from visible;
  if matched>50 then raise exception 'catalog_too_large'; end if;
  return query
  select s.id,s.slug,s.name,s.town,s.state_code,a.slug,a.label,s.summary,s.phone,s.website,s.timezone_name,
    (select m.asset_path from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select m.alt_text from app_public.store_media m where m.store_id=s.id and m.kind='cover' order by m.display_order limit 1),
    (select coalesce(jsonb_agg(jsonb_build_object('src',m.asset_path,'alt',m.alt_text,'kind',m.kind) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    today.hours,today.hours_state,today.is_open_now,f.freshness_state,f.oldest_verified_at,as_of
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,as_of) f cross join lateral app_public.catalog_today(s.id,as_of,s.timezone_name) today
  where s.synthetic and s.audience='synthetic' and s.publication_state='active' and f.freshness_state in ('current','overdue')
    and (p_area is null or a.slug=p_area)
    and (p_category is null or exists (select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.slug=p_category))
    and (normalized_q is null or s.name ilike '%'||normalized_q||'%' or s.town ilike '%'||normalized_q||'%' or a.label ilike '%'||normalized_q||'%' or exists (select 1 from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id and c.label ilike '%'||normalized_q||'%'))
  order by s.name,s.id;
end; $$;

create or replace function app_public.catalog_details(p_slug text)
returns setof app_public.catalog_details_row language plpgsql stable security definer
set search_path = pg_catalog, app_public as $$
declare as_of timestamptz := statement_timestamp();
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then return; end if;
  return query
  select s.id,s.slug,s.name,s.town,s.state_code,s.address,a.slug,a.label,s.summary,s.description,s.phone,s.website,s.timezone_name,
    (select coalesce(jsonb_agg(jsonb_build_object('slug',c.slug,'label',c.label) order by c.sort_order,c.slug),'[]'::jsonb) from app_public.store_category_assignments ca join app_public.store_categories c on c.id=ca.category_id where ca.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('weekday',h.iso_weekday,'is_closed',h.is_closed,'interval_index',h.interval_index,'opens_at',case when h.opens_at is null then null else to_char(h.opens_at,'HH24:MI') end,'closes_at',case when h.closes_at is null then null else to_char(h.closes_at,'HH24:MI') end) order by h.iso_weekday,h.interval_index),'[]'::jsonb) from app_public.store_weekly_hours h where h.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('local_date',e.local_date,'label',e.label,'is_closed',e.is_closed,'interval_index',e.interval_index,'opens_at',case when e.opens_at is null then null else to_char(e.opens_at,'HH24:MI') end,'closes_at',case when e.closes_at is null then null else to_char(e.closes_at,'HH24:MI') end) order by e.local_date,e.interval_index),'[]'::jsonb) from app_public.store_hour_exceptions e where e.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('asset_path',m.asset_path,'kind',m.kind,'alt_text',m.alt_text,'display_order',m.display_order) order by m.display_order),'[]'::jsonb) from app_public.store_media m where m.store_id=s.id),
    (select coalesce(jsonb_agg(jsonb_build_object('group',v.verification_group,'verified_at',v.verified_at,'label',v.provenance_label) order by v.verification_group),'[]'::jsonb) from app_public.store_fact_verifications v where v.store_id=s.id),
    f.freshness_state,f.oldest_verified_at,as_of
  from app_public.stores s join app_public.catalog_areas a on a.id=s.area_id cross join lateral app_public.catalog_freshness(s.id,as_of) f
  where s.slug=p_slug and s.synthetic and s.audience='synthetic' and s.publication_state='active' and f.freshness_state in ('current','overdue');
end; $$;

alter function app_public.catalog_list(text,text,text) owner to catalog_reader;
alter function app_public.catalog_details(text) owner to catalog_reader;
alter function app_public.catalog_freshness(uuid,timestamptz) owner to catalog_reader;
alter function app_public.catalog_today(uuid,timestamptz,text) owner to catalog_reader;
alter function app_public.normalize_catalog_query(text) owner to catalog_reader;
revoke catalog_reader from postgres;
revoke usage on schema app_public from postgres;
revoke catalog_reader from supabase_admin;
revoke usage on schema app_public from supabase_admin;

do $$ declare t text; begin
  foreach t in array array['catalog_areas','store_categories','stores','store_category_assignments','store_fact_verifications','store_weekly_hours','store_hour_exceptions','store_media'] loop
    execute format('alter table app_public.%I enable row level security',t);
    execute format('alter table app_public.%I force row level security',t);
    execute format('revoke all on app_public.%I from public, anon, authenticated',t);
    execute format('grant select on app_public.%I to catalog_reader',t);
  end loop;
end $$;

create policy catalog_reader_areas on app_public.catalog_areas for select to catalog_reader using (true);
create policy catalog_reader_categories on app_public.store_categories for select to catalog_reader using (true);
create policy catalog_reader_stores on app_public.stores for select to catalog_reader using (synthetic and audience='synthetic' and publication_state='active');
create policy catalog_reader_assignments on app_public.store_category_assignments for select to catalog_reader using (exists (select 1 from app_public.stores s where s.id=store_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'));
create policy catalog_reader_verifications on app_public.store_fact_verifications for select to catalog_reader using (exists (select 1 from app_public.stores s where s.id=store_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'));
create policy catalog_reader_weekly on app_public.store_weekly_hours for select to catalog_reader using (exists (select 1 from app_public.stores s where s.id=store_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'));
create policy catalog_reader_exceptions on app_public.store_hour_exceptions for select to catalog_reader using (exists (select 1 from app_public.stores s where s.id=store_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'));
create policy catalog_reader_media on app_public.store_media for select to catalog_reader using (exists (select 1 from app_public.stores s where s.id=store_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'));

revoke all on all functions in schema app_public from public;
grant execute on function app_public.catalog_list(text,text,text) to anon, authenticated;
grant execute on function app_public.catalog_details(text) to anon, authenticated;
