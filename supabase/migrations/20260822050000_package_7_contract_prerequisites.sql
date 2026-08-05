-- Package 7 contract prerequisites shared by the operational Administrator RPCs.
-- These relations keep private merge conflicts private and make privileged
-- throttling and pilot approval transactional database concerns.

create table admin_private.admin_privileged_rate_windows(
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check(request_count between 1 and 30),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(actor_user_id,target_id,window_started_at)
);

create table partner_private.pilot_approval_snapshots(
  approval_id uuid primary key default extensions.gen_random_uuid(),
  draft_id uuid not null unique references partner_private.pilot_store_drafts(draft_id) on delete restrict,
  store_id uuid not null unique references app_public.stores(id) on delete restrict,
  subject_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by uuid not null references auth.users(id) on delete restrict,
  preview_hash bytea not null check(octet_length(preview_hash)=32),
  frozen_snapshot jsonb not null check(jsonb_typeof(frozen_snapshot)='object'),
  approved_at timestamptz not null default statement_timestamp()
);

create table shopper_private.private_memory_merge_conflicts(
  conflict_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  duplicate_store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint,
  note text,
  last_visit_month date,
  source_version bigint not null,
  source_created_at timestamptz not null,
  source_updated_at timestamptz not null,
  state text not null default 'active' check(state in ('active','resolved','rolled_back')),
  created_at timestamptz not null default statement_timestamp(),
  unique(proposal_id,user_id)
);

create table trip_private.trip_duplicate_stop_warnings(
  warning_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references trip_private.trips(trip_id) on delete cascade,
  stop_id uuid not null references trip_private.trip_stops(stop_id) on delete cascade,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  state text not null default 'active' check(state in ('active','resolved','rolled_back')),
  created_at timestamptz not null default statement_timestamp(),
  unique(proposal_id,stop_id)
);

alter table review_private.public_reviews drop constraint if exists public_reviews_state_check;
alter table review_private.public_reviews add constraint public_reviews_state_check
  check(state in ('published','held','removed','merge_conflict_hidden','delete_pending','deleted'));
drop index if exists review_private.one_live_review_per_author_store;
create unique index one_live_review_per_author_store on review_private.public_reviews(author_id,store_id)
  where author_id is not null and state not in ('deleted','merge_conflict_hidden');

create table review_private.review_merge_conflicts(
  conflict_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  review_id uuid not null references review_private.public_reviews(review_id) on delete restrict,
  author_id uuid references auth.users(id) on delete set null,
  original_store_id uuid not null references app_public.stores(id) on delete restrict,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,
  original_state text not null,
  aggregate_rating smallint,
  state text not null default 'active' check(state in ('active','resolved','rolled_back')),
  created_at timestamptz not null default statement_timestamp(),
  unique(proposal_id,review_id)
);

do $$ declare relation regclass; begin
  foreach relation in array array[
    'admin_private.admin_privileged_rate_windows'::regclass,
    'partner_private.pilot_approval_snapshots'::regclass,
    'shopper_private.private_memory_merge_conflicts'::regclass,
    'trip_private.trip_duplicate_stop_warnings'::regclass,
    'review_private.review_merge_conflicts'::regclass
  ] loop
    execute format('alter table %s enable row level security',relation);
    execute format('alter table %s force row level security',relation);
  end loop;
end $$;

revoke all on admin_private.admin_privileged_rate_windows,partner_private.pilot_approval_snapshots,
  shopper_private.private_memory_merge_conflicts,trip_private.trip_duplicate_stop_warnings,
  review_private.review_merge_conflicts from public,anon,authenticated;
grant select,insert,update,delete on admin_private.admin_privileged_rate_windows to identity_service;
grant select,insert on partner_private.pilot_approval_snapshots to identity_service;
grant select,insert,update,delete on shopper_private.private_memory_merge_conflicts,
  trip_private.trip_duplicate_stop_warnings,review_private.review_merge_conflicts to identity_service;
grant select on shopper_private.private_memory_merge_conflicts,
  trip_private.trip_duplicate_stop_warnings,review_private.review_merge_conflicts to authenticated;
grant insert(synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name)
  on app_public.stores to identity_service;
grant select,update on review_private.public_reviews,review_private.rating_aggregates to identity_service;

create policy identity_service_admin_rate on admin_private.admin_privileged_rate_windows
  for all to identity_service using(true) with check(true);
create policy identity_service_pilot_approval on partner_private.pilot_approval_snapshots
  for all to identity_service using(true) with check(true);
create policy identity_service_pilot_store_insert on app_public.stores
  for insert to identity_service with check(not synthetic and audience='private_beta' and publication_state='draft');
create policy identity_service_memory_merge_conflict on shopper_private.private_memory_merge_conflicts
  for all to identity_service using(true) with check(true);
create policy identity_service_trip_merge_warning on trip_private.trip_duplicate_stop_warnings
  for all to identity_service using(true) with check(true);
create policy identity_service_review_merge_conflict on review_private.review_merge_conflicts
  for all to identity_service using(true) with check(true);
create policy identity_service_admin_review_merge on review_private.public_reviews
  for select to identity_service using(true);
create policy identity_service_admin_review_merge_update on review_private.public_reviews
  for update to identity_service using(true) with check(true);
create policy identity_service_admin_rating_merge on review_private.rating_aggregates
  for select to identity_service using(true);
create policy identity_service_admin_rating_merge_update on review_private.rating_aggregates
  for update to identity_service using(true) with check(true);
create policy memory_merge_conflict_owner_read on shopper_private.private_memory_merge_conflicts
  for select to authenticated using(user_id=auth.uid() and app_private.current_session_is_active());
create policy trip_merge_warning_owner_read on trip_private.trip_duplicate_stop_warnings
  for select to authenticated using(owner_id=auth.uid() and app_private.current_session_is_active());
create policy review_merge_conflict_owner_read on review_private.review_merge_conflicts
  for select to authenticated using(author_id=auth.uid() and app_private.current_session_is_active());

create or replace function app_private.provider_user_is_confirmed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null);
$$;
alter function app_private.provider_user_is_confirmed(uuid) owner to postgres;
revoke all on function app_private.provider_user_is_confirmed(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.provider_user_is_confirmed(uuid) to identity_service;

create or replace function admin_private.enforce_operational_admin_rate(p_actor uuid,p_target uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare bucket timestamptz:=date_trunc('hour',statement_timestamp()); actor_count integer; target_count integer;
begin
  if p_actor is null or p_target is null then raise exception using errcode='22023',message='admin_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-rate-actor:'||p_actor,0));
  perform pg_advisory_xact_lock(hashtextextended('admin-rate-target:'||p_target,0));
  delete from admin_private.admin_privileged_rate_windows where window_started_at<bucket-interval '90 days';
  select coalesce(sum(request_count),0) into actor_count from admin_private.admin_privileged_rate_windows where actor_user_id=p_actor and window_started_at=bucket;
  select coalesce(sum(request_count),0) into target_count from admin_private.admin_privileged_rate_windows where target_id=p_target and window_started_at=bucket;
  if actor_count>=30 or target_count>=10 then raise exception using errcode='P0001',message='admin_unavailable'; end if;
  insert into admin_private.admin_privileged_rate_windows(actor_user_id,target_id,window_started_at)
    values(p_actor,p_target,bucket)
    on conflict(actor_user_id,target_id,window_started_at) do update
      set request_count=admin_private.admin_privileged_rate_windows.request_count+1,updated_at=statement_timestamp();
end $$;
alter function admin_private.enforce_operational_admin_rate(uuid,uuid) owner to identity_service;
revoke all on function admin_private.enforce_operational_admin_rate(uuid,uuid) from public,anon,authenticated;

create or replace function partner_private.approve_pilot_onboarding_exact(
  p_draft_id uuid,p_actor uuid,p_preview_hash bytea
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare d partner_private.pilot_store_drafts%rowtype; pending partner_private.pending_partner_identities%rowtype;
  receipt uuid; partnership uuid; store uuid; frozen jsonb; recomputed bytea; area uuid; category_slugs text[];
begin
  select * into d from partner_private.pilot_store_drafts where draft_id=p_draft_id for update;
  if not found or d.state not in ('submitted','resubmitted') then raise exception using errcode='40001',message='admin_unavailable'; end if;
  recomputed:=extensions.digest(convert_to(concat_ws('|','partner_onboarding',d.draft_id,null,to_jsonb(d)::text),'utf8'),'sha256');
  if p_preview_hash is null or p_preview_hash<>recomputed then raise exception using errcode='40001',message='admin_unavailable'; end if;
  select * into pending from partner_private.pending_partner_identities where pending_identity_id=d.pending_identity_id and state='bound' for update;
  if not found or pending.auth_user_id is null or pending.verified_email_at is null or pending.mfa_verified_at is null
    or not app_private.provider_user_is_confirmed(pending.auth_user_id)
    or not app_private.provider_user_has_verified_mfa(pending.auth_user_id)
    or (select count(distinct channel_class) from partner_private.partner_authority_checks where draft_id=d.draft_id and status='verified')<2
    or not exists(select 1 from partner_private.partner_authority_checks where draft_id=d.draft_id and status='verified' and channel_class='published_business_contact')
  then raise exception using errcode='42501',message='admin_unavailable'; end if;
  select consent_receipt_id into receipt from partner_private.pilot_consent_receipts
    where pending_identity_id=pending.pending_identity_id and auth_user_id=pending.auth_user_id
    order by finalized_at desc limit 1;
  begin area:=(d.provenance->>'areaId')::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if receipt is null or area is null or coalesce(d.provenance->>'slug','')!~'^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or coalesce(d.provenance->>'town','')='' or coalesce(d.provenance->>'stateCode','')!~'^[A-Z]{2}$'
    or coalesce(d.provenance->>'summary','')='' then raise exception using errcode='42501',message='admin_unavailable'; end if;
  frozen:=jsonb_build_object('draft',to_jsonb(d),'subjectUserId',pending.auth_user_id,'consentReceiptId',receipt,'previewHash',encode(p_preview_hash,'hex'));
  insert into app_public.stores(synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name)
    values(false,'private_beta','draft',d.provenance->>'slug',d.name,d.provenance->>'town',d.provenance->>'stateCode',d.address,area,
      d.provenance->>'summary',coalesce(d.description,d.name),d.phone,d.website,coalesce(d.provenance->>'timezoneName','America/Chicago')) returning id into store;
  select array_agg(value order by value) into category_slugs from jsonb_array_elements_text(d.category_tags);
  if category_slugs is not null and exists(select 1 from unnest(category_slugs) slug where not exists(select 1 from app_public.store_categories c where c.slug=slug))
    then raise exception using errcode='22023',message='admin_unavailable'; end if;
  insert into app_public.store_category_assignments(store_id,category_id) select store,category_id from app_public.store_categories where slug=any(category_slugs);
  insert into partner_private.store_partnerships(pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at,consent_policy_version)
    values(pending.pending_identity_id,pending.auth_user_id,store,receipt,'active',statement_timestamp(),(select policy_version from partner_private.pilot_consent_receipts where consent_receipt_id=receipt))
    returning partnership_id into partnership;
  insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id,consent_policy_version)
    values(partnership,pending.auth_user_id,store,(select policy_version from partner_private.pilot_consent_receipts where consent_receipt_id=receipt));
  insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by) values(pending.auth_user_id,'representative',store,'active',p_actor);
  insert into partner_private.pilot_approval_snapshots(draft_id,store_id,subject_user_id,approved_by,preview_hash,frozen_snapshot)
    values(d.draft_id,store,pending.auth_user_id,p_actor,p_preview_hash,frozen);
  update partner_private.pilot_store_drafts set state='approved',reviewed_by=p_actor,reviewed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where draft_id=d.draft_id;
  return store;
end $$;
alter function partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea) owner to identity_service;
revoke all on function partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea) from public,anon,authenticated;
grant execute on function partner_private.approve_pilot_onboarding_exact(uuid,uuid,bytea) to identity_service;
