-- Package 7 contract prerequisites shared by the operational Administrator RPCs.
-- These relations keep private merge conflicts private and make privileged
-- throttling and pilot approval transactional database concerns.

grant identity_service to postgres;
grant create on schema admin_private,partner_private to identity_service;

create table admin_private.admin_privileged_rate_windows(
  event_id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null,
  occurred_at timestamptz not null default statement_timestamp()
);
create index admin_rate_actor_window on admin_private.admin_privileged_rate_windows(actor_user_id,occurred_at);
create index admin_rate_target_window on admin_private.admin_privileged_rate_windows(target_id,occurred_at);

create table admin_private.admin_duplicate_merge_plan_items(
  plan_item_id uuid primary key default extensions.gen_random_uuid(),
  proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  ordinal integer not null check(ordinal>0),
  reference_kind text not null,
  reference_id uuid not null,
  reference_digest bytea not null check(octet_length(reference_digest)=32),
  collision_kind text not null,
  planned_resolution text not null check(planned_resolution in ('reparent','collapse','hide','quarantine','preserve')),
  unique(proposal_id,ordinal),unique(proposal_id,reference_kind,reference_id)
);
create table admin_private.admin_scope_previews(
  preview_id uuid primary key default extensions.gen_random_uuid(),actor_user_id uuid not null references auth.users(id) on delete cascade,
  subject_user_id uuid not null references auth.users(id) on delete restrict,store_id uuid not null references app_public.stores(id) on delete restrict,
  grant_id uuid not null references partner_private.store_partner_grants(grant_id) on delete restrict,grant_version bigint not null check(grant_version>0),
  preview_hash bytea not null check(octet_length(preview_hash)=32),expires_at timestamptz not null default statement_timestamp()+interval '10 minutes',
  consumed_at timestamptz,created_at timestamptz not null default statement_timestamp(),check(expires_at>created_at and expires_at<=created_at+interval '10 minutes')
);
create table admin_private.admin_merge_execution_items(
  execution_item_id uuid primary key default extensions.gen_random_uuid(),plan_item_id uuid not null unique references admin_private.admin_duplicate_merge_plan_items(plan_item_id) on delete restrict,
  post_execute_digest bytea not null check(octet_length(post_execute_digest)=32),recorded_at timestamptz not null default statement_timestamp()
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

create table portal_private.store_update_merge_conflicts(
  conflict_id uuid primary key default extensions.gen_random_uuid(),proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  update_id uuid not null references portal_private.store_updates(update_id) on delete restrict,original_store_id uuid not null references app_public.stores(id) on delete restrict,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,state text not null default 'active' check(state in ('active','rolled_back')),unique(proposal_id,update_id)
);
create table portal_private.support_ticket_merge_conflicts(
  conflict_id uuid primary key default extensions.gen_random_uuid(),proposal_id uuid not null references admin_private.admin_duplicate_merge_proposals(proposal_id) on delete restrict,
  ticket_id uuid not null references portal_private.support_tickets(ticket_id) on delete restrict,original_store_id uuid not null references app_public.stores(id) on delete restrict,
  canonical_store_id uuid not null references app_public.stores(id) on delete restrict,state text not null default 'active' check(state in ('active','rolled_back')),unique(proposal_id,ticket_id)
);

do $$ declare relation regclass; begin
  foreach relation in array array[
    'admin_private.admin_privileged_rate_windows'::regclass,
    'admin_private.admin_duplicate_merge_plan_items'::regclass,
    'admin_private.admin_scope_previews'::regclass,
    'admin_private.admin_merge_execution_items'::regclass,
    'partner_private.pilot_approval_snapshots'::regclass,
    'shopper_private.private_memory_merge_conflicts'::regclass,
    'trip_private.trip_duplicate_stop_warnings'::regclass,
    'review_private.review_merge_conflicts'::regclass,
    'portal_private.store_update_merge_conflicts'::regclass,
    'portal_private.support_ticket_merge_conflicts'::regclass
  ] loop
    execute format('alter table %s enable row level security',relation);
    execute format('alter table %s force row level security',relation);
  end loop;
end $$;

revoke all on admin_private.admin_privileged_rate_windows,admin_private.admin_duplicate_merge_plan_items,admin_private.admin_scope_previews,admin_private.admin_merge_execution_items,partner_private.pilot_approval_snapshots,
  shopper_private.private_memory_merge_conflicts,trip_private.trip_duplicate_stop_warnings,
  review_private.review_merge_conflicts,portal_private.store_update_merge_conflicts,portal_private.support_ticket_merge_conflicts from public,anon,authenticated;
grant select,insert,delete on admin_private.admin_privileged_rate_windows to identity_service;
grant select,insert on admin_private.admin_duplicate_merge_plan_items to identity_service;
grant select,insert,update on admin_private.admin_scope_previews to identity_service;
grant select,insert on admin_private.admin_merge_execution_items to identity_service;
grant select,insert on partner_private.pilot_approval_snapshots to identity_service;
grant select,insert,update,delete on shopper_private.private_memory_merge_conflicts,
  trip_private.trip_duplicate_stop_warnings,review_private.review_merge_conflicts to identity_service;
grant select,insert,update on portal_private.store_update_merge_conflicts,portal_private.support_ticket_merge_conflicts to identity_service;
grant select on shopper_private.private_memory_merge_conflicts,
  trip_private.trip_duplicate_stop_warnings,review_private.review_merge_conflicts to authenticated;
grant insert(synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name)
  on app_public.stores to identity_service;
grant select,update on review_private.public_reviews,review_private.rating_aggregates to identity_service;

create policy identity_service_admin_rate on admin_private.admin_privileged_rate_windows
  for all to identity_service using(true) with check(true);
create policy identity_service_admin_merge_plan on admin_private.admin_duplicate_merge_plan_items for all to identity_service using(true) with check(true);
create policy identity_service_admin_scope_preview on admin_private.admin_scope_previews for all to identity_service using(true) with check(true);
create policy identity_service_admin_merge_execution on admin_private.admin_merge_execution_items for all to identity_service using(true) with check(true);
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
create policy identity_service_portal_update_merge_conflict on portal_private.store_update_merge_conflicts for all to identity_service using(true) with check(true);
create policy identity_service_portal_ticket_merge_conflict on portal_private.support_ticket_merge_conflicts for all to identity_service using(true) with check(true);
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
declare cutoff timestamptz:=statement_timestamp()-interval '1 hour'; actor_count integer; target_count integer; retry_at timestamptz; retry_seconds integer;
begin
  if p_actor is null or p_target is null then raise exception using errcode='22023',message='admin_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-rate-actor:'||p_actor,0));
  perform pg_advisory_xact_lock(hashtextextended('admin-rate-target:'||p_target,0));
  delete from admin_private.admin_privileged_rate_windows where occurred_at<statement_timestamp()-interval '90 days';
  select count(*) into actor_count from admin_private.admin_privileged_rate_windows where actor_user_id=p_actor and occurred_at>cutoff;
  select count(*) into target_count from admin_private.admin_privileged_rate_windows where target_id=p_target and occurred_at>cutoff;
  if actor_count>=30 or target_count>=10 then
    select min(occurred_at)+interval '1 hour' into retry_at from admin_private.admin_privileged_rate_windows
      where occurred_at>cutoff and ((actor_count>=30 and actor_user_id=p_actor) or (target_count>=10 and target_id=p_target));
    retry_seconds:=greatest(1,least(3600,ceil(extract(epoch from retry_at-statement_timestamp()))::integer));
    raise exception using errcode='P0001',message='admin_unavailable',detail=jsonb_build_object('retryAfterSeconds',retry_seconds)::text;
  end if;
  insert into admin_private.admin_privileged_rate_windows(actor_user_id,target_id) values(p_actor,p_target);
end $$;
alter function admin_private.enforce_operational_admin_rate(uuid,uuid) owner to identity_service;
revoke all on function admin_private.enforce_operational_admin_rate(uuid,uuid) from public,anon,authenticated;

alter table admin_private.admin_audit_anchor_health
  add column deployment_environment text not null default 'local'
  constraint admin_anchor_health_environment check(
    deployment_environment in ('local','shared_alpha','private_beta','regional_public')
  );
alter table admin_private.admin_audit_anchor_health drop constraint admin_anchor_health_shape;
alter table admin_private.admin_audit_anchor_health add constraint admin_anchor_health_shape check(
  state<>'healthy' or (
    deployment_environment='local'
    or (deployment_environment<>'local' and root_hash is not null and last_anchored_at is not null)
  )
);

create or replace function admin_private.sync_package_7_audit_anchor_health()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare anchored_is_current boolean;
begin
  anchored_is_current:=case
    when new.deployment_environment='local' then
      new.state='disabled'
      and exists(select 1 from app_private.environment_stage e
        where e.id=1 and e.stage='synthetic_alpha')
    else
      new.state='open'
      and new.watchdog_state='current'
      and new.last_ack_root is not null
      and new.last_ack_at is not null
      and new.last_ack_at>=statement_timestamp()-interval '24 hours'
      and new.last_ack_sequence=(select coalesce(max(sequence_no),0) from app_private.privileged_audit_events)
      and exists(select 1 from app_private.audit_chain_roots r
        where r.through_sequence_no=new.last_ack_sequence and r.root_hash=new.last_ack_root)
  end;

  insert into admin_private.admin_audit_anchor_health(
    id,deployment_environment,state,through_sequence_no,root_hash,last_anchored_at,checked_at,version
  ) values (
    1,new.deployment_environment,case when anchored_is_current then 'healthy' else 'blocked' end,
    new.last_ack_sequence,new.last_ack_root,new.last_ack_at,
    coalesce(new.watchdog_checked_at,statement_timestamp()),1
  ) on conflict(id) do update set
    deployment_environment=excluded.deployment_environment,
    state=excluded.state,
    through_sequence_no=excluded.through_sequence_no,
    root_hash=excluded.root_hash,
    last_anchored_at=excluded.last_anchored_at,
    checked_at=excluded.checked_at,
    version=admin_private.admin_audit_anchor_health.version+1;
  return new;
end $$;
alter function admin_private.sync_package_7_audit_anchor_health() owner to identity_service;
revoke all on function admin_private.sync_package_7_audit_anchor_health() from public,anon,authenticated;

create trigger sync_package_7_audit_anchor_health
after insert or update on app_private.audit_anchor_capability
for each row execute function admin_private.sync_package_7_audit_anchor_health();

-- Synchronize the row created before this trigger existed. Future acknowledgements
-- and watchdog updates flow through the trigger above.
update app_private.audit_anchor_capability
set watchdog_checked_at=watchdog_checked_at
where id=1;

create or replace function admin_private.lock_merge_reference_set(
  p_canonical uuid,p_duplicate uuid,p_proposal uuid default null
) returns void language plpgsql volatile security definer set search_path='' as $$
begin
  -- The parent row locks also make new child inserts wait on their FK key-share
  -- locks, while the ordered child locks protect all rows already in the snapshot.
  perform 1 from app_public.stores
    where id in (p_canonical,p_duplicate) order by id for update;
  perform 1 from shopper_private.saved_stores
    where store_id in (p_canonical,p_duplicate) order by store_id,user_id for update;
  perform 1 from shopper_private.private_store_memories
    where store_id in (p_canonical,p_duplicate) order by store_id,user_id for update;
  perform 1 from trip_private.trips t where exists(
    select 1 from trip_private.trip_stops s
    where s.trip_id=t.trip_id and s.store_id in (p_canonical,p_duplicate)
  ) order by t.trip_id for update;
  perform 1 from trip_private.trip_stops
    where store_id in (p_canonical,p_duplicate) order by store_id,stop_id for update;
  perform 1 from review_private.public_reviews
    where store_id in (p_canonical,p_duplicate) order by store_id,review_id for update;
  perform 1 from review_private.rating_aggregates
    where store_id in (p_canonical,p_duplicate) order by store_id for update;
  perform 1 from portal_private.store_updates
    where store_id in (p_canonical,p_duplicate) order by store_id,update_id for update;
  perform 1 from portal_private.support_tickets
    where store_id in (p_canonical,p_duplicate) order by store_id,ticket_id for update;
  perform 1 from partner_private.store_partner_grants
    where store_id in (p_canonical,p_duplicate) order by store_id,grant_id for update;
  perform 1 from partner_private.listing_claims
    where store_id in (p_canonical,p_duplicate) order by store_id,claim_id for update;
  perform 1 from app_private.role_grants r where exists(
    select 1 from partner_private.store_partner_grants g
    where g.auth_user_id=r.subject_user_id and r.role='representative'
      and r.store_id=g.store_id and g.store_id in (p_canonical,p_duplicate)
  ) order by r.store_id,r.subject_user_id,r.grant_id for update;

  if p_proposal is not null then
    perform 1 from shopper_private.private_memory_merge_conflicts
      where proposal_id=p_proposal order by conflict_id for update;
    perform 1 from trip_private.trip_duplicate_stop_warnings
      where proposal_id=p_proposal order by warning_id for update;
    perform 1 from review_private.review_merge_conflicts
      where proposal_id=p_proposal order by conflict_id for update;
    perform 1 from portal_private.store_update_merge_conflicts
      where proposal_id=p_proposal order by conflict_id for update;
    perform 1 from portal_private.support_ticket_merge_conflicts
      where proposal_id=p_proposal order by conflict_id for update;
    perform 1 from admin_private.store_tombstones
      where proposal_id=p_proposal order by tombstone_id for update;
  end if;
end $$;
alter function admin_private.lock_merge_reference_set(uuid,uuid,uuid) owner to identity_service;
revoke all on function admin_private.lock_merge_reference_set(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function admin_private.merge_reference_snapshot(p_canonical uuid,p_duplicate uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with refs(kind,id,payload,collision,resolution) as (
    select 'canonical_store',s.id,to_jsonb(s),'none','preserve' from app_public.stores s where s.id=p_canonical
    union all select 'store',s.id,to_jsonb(s),'none','preserve' from app_public.stores s where s.id=p_duplicate
    union all select 'saved_store',s.user_id,to_jsonb(s)||jsonb_build_object('canonical',coalesce((select to_jsonb(x) from shopper_private.saved_stores x where x.user_id=s.user_id and x.store_id=p_canonical),'null'::jsonb)),case when exists(select 1 from shopper_private.saved_stores x where x.user_id=s.user_id and x.store_id=p_canonical) then 'duplicate_save' else 'none' end,case when exists(select 1 from shopper_private.saved_stores x where x.user_id=s.user_id and x.store_id=p_canonical) then 'collapse' else 'reparent' end from shopper_private.saved_stores s where s.store_id=p_duplicate
    union all select 'private_memory',m.user_id,to_jsonb(m)||jsonb_build_object('canonical',coalesce((select to_jsonb(x) from shopper_private.private_store_memories x where x.user_id=m.user_id and x.store_id=p_canonical),'null'::jsonb)),case when exists(select 1 from shopper_private.private_store_memories x where x.user_id=m.user_id and x.store_id=p_canonical) then 'memory_conflict' else 'none' end,case when exists(select 1 from shopper_private.private_store_memories x where x.user_id=m.user_id and x.store_id=p_canonical) then 'hide' else 'reparent' end from shopper_private.private_store_memories m where m.store_id=p_duplicate
    union all select 'trip_stop',s.stop_id,to_jsonb(s),case when exists(select 1 from trip_private.trip_stops x where x.trip_id=s.trip_id and x.store_id=p_canonical) then 'trip_stop' else 'none' end,'reparent' from trip_private.trip_stops s where s.store_id=p_duplicate
    union all select 'review',r.review_id,to_jsonb(r),case when r.author_id is not null and exists(select 1 from review_private.public_reviews x where x.author_id=r.author_id and x.store_id=p_canonical and x.state<>'deleted') then 'review_conflict' else 'none' end,case when r.author_id is not null and exists(select 1 from review_private.public_reviews x where x.author_id=r.author_id and x.store_id=p_canonical and x.state<>'deleted') then 'hide' else 'reparent' end from review_private.public_reviews r where r.store_id=p_duplicate
    union all select 'store_update',u.update_id,to_jsonb(u),case when exists(select 1 from portal_private.store_updates x where x.store_id=p_canonical and x.content_digest=u.content_digest and x.state='live') then 'update_conflict' else 'none' end,'reparent' from portal_private.store_updates u where u.store_id=p_duplicate
    union all select 'support_ticket',t.ticket_id,to_jsonb(t),case when exists(select 1 from portal_private.support_tickets x where x.store_id=p_canonical and x.opened_by=t.opened_by and x.request_digest=t.request_digest and x.state<>'resolved') then 'support_conflict' else 'none' end,'reparent' from portal_private.support_tickets t where t.store_id=p_duplicate
    union all select 'grant',g.grant_id,to_jsonb(g),'grant_quarantine','quarantine' from partner_private.store_partner_grants g where g.store_id=p_duplicate and g.state in ('active','reconsent_required')
    union all select 'claim',c.claim_id,to_jsonb(c),'claim_quarantine','quarantine' from partner_private.listing_claims c where c.store_id=p_duplicate and c.state='approved'
  ) select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'referenceId',id,'referenceDigest',encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex'),'collisionKind',collision,'plannedResolution',resolution) order by kind,id),'[]'::jsonb) from refs;
$$;
alter function admin_private.merge_reference_snapshot(uuid,uuid) owner to identity_service;
revoke all on function admin_private.merge_reference_snapshot(uuid,uuid) from public,anon,authenticated;

create or replace function admin_private.merge_current_item_digest(p_item uuid)
returns bytea language plpgsql stable security definer set search_path='' as $$
declare i admin_private.admin_duplicate_merge_plan_items%rowtype; p admin_private.admin_duplicate_merge_proposals%rowtype; payload jsonb;
begin
  select * into i from admin_private.admin_duplicate_merge_plan_items where plan_item_id=p_item;
  select * into p from admin_private.admin_duplicate_merge_proposals where proposal_id=i.proposal_id;
  payload:=case i.reference_kind
    when 'canonical_store' then (select to_jsonb(x) from app_public.stores x where x.id=i.reference_id)
    when 'store' then (select to_jsonb(x) from app_public.stores x where x.id=i.reference_id)
    when 'saved_store' then (select to_jsonb(x) from shopper_private.saved_stores x where x.user_id=i.reference_id and x.store_id=p.canonical_store_id)
    when 'private_memory' then coalesce((select to_jsonb(x) from shopper_private.private_store_memories x where x.user_id=i.reference_id and x.store_id=p.canonical_store_id),(select to_jsonb(x) from shopper_private.private_memory_merge_conflicts x where x.proposal_id=p.proposal_id and x.user_id=i.reference_id))
    when 'trip_stop' then (select to_jsonb(x) from trip_private.trip_stops x where x.stop_id=i.reference_id)
    when 'review' then (select to_jsonb(x) from review_private.public_reviews x where x.review_id=i.reference_id)
    when 'store_update' then (select to_jsonb(x) from portal_private.store_updates x where x.update_id=i.reference_id)
    when 'support_ticket' then (select to_jsonb(x) from portal_private.support_tickets x where x.ticket_id=i.reference_id)
    when 'grant' then (select to_jsonb(x) from partner_private.store_partner_grants x where x.grant_id=i.reference_id)
    when 'claim' then (select to_jsonb(x) from partner_private.listing_claims x where x.claim_id=i.reference_id)
    else null end;
  return extensions.digest(convert_to(coalesce(payload,'null'::jsonb)::text,'utf8'),'sha256');
end $$;
alter function admin_private.merge_current_item_digest(uuid) owner to identity_service;
revoke all on function admin_private.merge_current_item_digest(uuid) from public,anon,authenticated;

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

revoke create on schema admin_private,partner_private from identity_service;
revoke identity_service from postgres;
