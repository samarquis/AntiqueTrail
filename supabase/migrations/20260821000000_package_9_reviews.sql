-- Package 9: durable text reviews, narrow moderation, appeals, and lifecycle.
-- Public capability remains owned by Package 10B. Synthetic rehearsal is the
-- only pre-release mutation path, and every browser mutation crosses an RPC.

do $$
begin
  if not exists(select 1 from pg_roles where rolname='review_automation') then
    create role review_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='review_lifecycle_service') then
    create role review_lifecycle_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='review_assertion_service') then
    create role review_assertion_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant review_automation to postgres;
create schema if not exists review_private;
revoke all on schema review_private from public,anon,authenticated;
grant usage on schema review_private to review_automation,review_lifecycle_service,review_assertion_service;
grant create on schema review_private to review_automation;
grant create on schema app_public to review_automation;

create table review_private.public_reviews (
  review_id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_tombstone uuid,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint not null check(rating between 1 and 5),
  review_text text check(review_text is null or char_length(review_text)<=2000),
  display_name text check(display_name is null or (display_name=btrim(display_name) and char_length(display_name) between 1 and 80 and display_name !~ '[[:cntrl:]]')),
  visit_month smallint not null check(visit_month between 1 and 12),
  visit_year smallint not null check(visit_year between 2000 and 2100),
  eligibility_kind text not null check(eligibility_kind in ('completed_visit','manual_attestation')),
  conflict_kind text not null check(conflict_kind in ('none','employment','ownership','family','vendor','compensated','other_material')),
  state text not null default 'published' check(state in ('published','held','removed','delete_pending','deleted')),
  pre_delete_state text check(pre_delete_state is null or pre_delete_state in ('published','held','removed')),
  deletion_kind text check(deletion_kind is null or deletion_kind in ('author','account')),
  edited boolean not null default false,
  version bigint not null default 1 check(version>0),
  published_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  delete_requested_at timestamptz,
  undo_expires_at timestamptz,
  purge_due_at timestamptz,
  deleted_at timestamptz,
  check((state='delete_pending' and delete_requested_at is not null and deletion_kind is not null and (
    (deletion_kind='author' and undo_expires_at=delete_requested_at+interval '60 seconds' and purge_due_at<=delete_requested_at+interval '24 hours')
    or (deletion_kind='account' and undo_expires_at=delete_requested_at and purge_due_at<=delete_requested_at+interval '8 days')
  )) or state<>'delete_pending'),
  check((state='deleted' and deleted_at is not null and review_text is null and display_name is null) or state<>'deleted'),
  check(author_id is not null or author_tombstone is not null)
);
create unique index one_live_review_per_author_store on review_private.public_reviews(author_id,store_id)
  where author_id is not null and state<>'deleted';
create index public_reviews_store_state_idx on review_private.public_reviews(store_id,state,published_at);

create table review_private.review_versions (
  version_id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null references review_private.public_reviews(review_id) on delete restrict,
  author_id uuid references auth.users(id) on delete set null,
  version bigint not null check(version>0),
  rating smallint not null check(rating between 1 and 5),
  review_text text,
  display_name text,
  visit_month smallint not null,
  visit_year smallint not null,
  conflict_kind text not null,
  created_at timestamptz not null default statement_timestamp(),
  unique(review_id,version)
);

create table review_private.rating_aggregates (
  store_id uuid primary key references app_public.stores(id) on delete restrict,
  eligible_count bigint not null default 0 check(eligible_count>=0),
  rating_sum bigint not null default 0 check(rating_sum>=0),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default statement_timestamp(),
  check((eligible_count=0 and rating_sum=0) or (rating_sum between eligible_count and eligible_count*5))
);

create table review_private.review_reports (
  report_id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null references review_private.public_reviews(review_id) on delete restrict,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_tombstone uuid,
  reason_code text not null check(reason_code in ('spam','threats_harassment_hate','personal_sensitive_information','impersonation','undisclosed_conflict','compensated_manipulation','irrelevant','legal_safety')),
  created_at timestamptz not null default statement_timestamp(),
  unique(review_id,reporter_id),
  check(reporter_id is not null or reporter_tombstone is not null)
);

create table review_private.moderation_cases (
  case_id uuid primary key default extensions.gen_random_uuid(),
  review_id uuid not null references review_private.public_reviews(review_id) on delete restrict,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  state text not null default 'open' check(state in ('open','held','removed','restored','dismissed','appealed','resolved')),
  reason_code text,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  original_moderator_id uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check(version>0),
  opened_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  decided_at timestamptz,
  closed_at timestamptz
);
create unique index one_open_moderation_case_per_review on review_private.moderation_cases(review_id)
  where state in ('open','held','removed','appealed');

create table review_private.moderation_case_evidence (
  evidence_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references review_private.moderation_cases(case_id) on delete restrict,
  evidence_kind text not null check(evidence_kind in ('review_text','report_reason','prior_decision','appeal_text')),
  evidence_value text not null check(char_length(evidence_value) between 1 and 4000),
  source_digest bytea not null check(octet_length(source_digest)=32),
  created_at timestamptz not null default statement_timestamp()
);

create table review_private.reviewer_identities (
  reviewer_identity_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  responsibility text not null default 'IndependentReviewer' check(responsibility='IndependentReviewer'),
  state text not null default 'pending' check(state in ('pending','active','disabled','ended')),
  qualification_receipt_digest bytea not null check(octet_length(qualification_receipt_digest)=32),
  active_credential_count smallint not null default 0 check(active_credential_count between 0 and 8),
  assertion_verified_at timestamptz,
  relationship_ended_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(state<>'active' or (user_id is not null and active_credential_count>=2 and relationship_ended_at is null))
);

create table review_private.reviewer_assertion_receipts (
  assertion_receipt_id uuid primary key default extensions.gen_random_uuid(),
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  case_id uuid references review_private.moderation_cases(case_id) on delete restrict,
  challenge_digest bytea not null unique check(octet_length(challenge_digest)=32),
  assertion_digest bytea not null unique check(octet_length(assertion_digest)=32),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  verified_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '5 minutes',
  consumed_at timestamptz,
  check(expires_at>verified_at and expires_at<=verified_at+interval '5 minutes')
);

create table review_private.review_appeals (
  appeal_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references review_private.moderation_cases(case_id) on delete restrict,
  review_id uuid not null references review_private.public_reviews(review_id) on delete restrict,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  submitted_by_kind text not null check(submitted_by_kind in ('author','store_representative')),
  original_action text not null check(original_action in ('hold','remove')),
  original_moderator_id uuid references auth.users(id) on delete set null,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  assigned_reviewer_identity_id uuid references review_private.reviewer_identities(reviewer_identity_id) on delete set null,
  state text not null default 'submitted' check(state in ('submitted','assigned','restored','upheld','expired')),
  appeal_reason text,
  decision_reason text,
  submitted_at timestamptz not null default statement_timestamp(),
  deadline_at timestamptz not null default statement_timestamp()+interval '30 days',
  decided_at timestamptz,
  check((assigned_admin_id is null)<>(assigned_reviewer_identity_id is null) or state='submitted'),
  check((state in ('restored','upheld') and decided_at is not null and decision_reason is not null) or state not in ('restored','upheld'))
);

create table review_private.review_restrictions (
  restriction_id uuid primary key default extensions.gen_random_uuid(),
  subject_user_id uuid references auth.users(id) on delete set null,
  subject_tombstone uuid,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  feature text not null default 'public_reviews' check(feature='public_reviews'),
  level text not null check(level in ('notice_only','thirty_days','ninety_days','one_eighty_days')),
  state text not null default 'active' check(state in ('active','expired','revoked')),
  reason_code text not null,
  source_case_id uuid references review_private.moderation_cases(case_id) on delete restrict,
  starts_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  ended_at timestamptz,
  version bigint not null default 1,
  check(subject_user_id is not null or subject_tombstone is not null),
  check((level='notice_only' and expires_at is null) or (level<>'notice_only' and expires_at>starts_at)),
  check((state='active' and ended_at is null) or (state<>'active' and ended_at is not null))
);
create unique index one_active_review_restriction on review_private.review_restrictions(subject_user_id,store_id)
  where subject_user_id is not null and state='active';

create table review_private.restriction_appeals (
  appeal_id uuid primary key default extensions.gen_random_uuid(),
  restriction_id uuid not null unique references review_private.review_restrictions(restriction_id) on delete restrict,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  original_moderator_id uuid references auth.users(id) on delete set null,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  assigned_reviewer_identity_id uuid references review_private.reviewer_identities(reviewer_identity_id) on delete set null,
  state text not null default 'submitted' check(state in ('submitted','assigned','restored','upheld','expired')),
  appeal_reason text,
  decision_reason text,
  submitted_at timestamptz not null default statement_timestamp(),
  deadline_at timestamptz not null default statement_timestamp()+interval '30 days',
  decided_at timestamptz,
  check((assigned_admin_id is null)<>(assigned_reviewer_identity_id is null) or state='submitted')
);

create table review_private.review_audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  previous_hash bytea check(previous_hash is null or octet_length(previous_hash)=32),
  event_hash bytea not null unique check(octet_length(event_hash)=32),
  event_kind text not null check(event_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  actor_user_id uuid references auth.users(id) on delete set null,
  review_id uuid references review_private.public_reviews(review_id) on delete set null,
  case_id uuid references review_private.moderation_cases(case_id) on delete set null,
  outcome text not null check(outcome in ('allowed','denied','expired','purged')),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default statement_timestamp()
);

create or replace function review_private.reject_append_only_mutation() returns trigger
language plpgsql set search_path='' as $$ begin raise exception using errcode='42501',message='review_append_only'; end $$;
create or replace function review_private.guard_version_purge() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.review_id<>new.review_id or old.version<>new.version or old.rating<>new.rating
    or old.visit_month<>new.visit_month or old.visit_year<>new.visit_year or old.conflict_kind<>new.conflict_kind or old.created_at<>new.created_at
    or new.review_text is not null or new.display_name is not null or new.author_id is not null then raise exception using errcode='42501',message='review_version_immutable'; end if;
  return new;
end $$;
create trigger review_versions_append_only before update or delete on review_private.review_versions
  for each row execute function review_private.guard_version_purge();
create or replace function review_private.guard_report_deidentification() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.report_id<>new.report_id or old.review_id<>new.review_id or old.reason_code<>new.reason_code or old.created_at<>new.created_at
    or old.reporter_id is null or new.reporter_id is not null or new.reporter_tombstone is null then raise exception using errcode='42501',message='review_report_immutable'; end if;
  return new;
end $$;
create trigger review_reports_append_only before update or delete on review_private.review_reports
  for each row execute function review_private.guard_report_deidentification();
create trigger moderation_evidence_append_only before update or delete on review_private.moderation_case_evidence
  for each row execute function review_private.reject_append_only_mutation();
create or replace function review_private.guard_assertion_consumption() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.assertion_receipt_id<>new.assertion_receipt_id or old.reviewer_identity_id<>new.reviewer_identity_id
    or old.case_id is distinct from new.case_id or old.challenge_digest<>new.challenge_digest or old.assertion_digest<>new.assertion_digest
    or old.provider_verification_id<>new.provider_verification_id or old.verified_at<>new.verified_at or old.expires_at<>new.expires_at
    or old.consumed_at is not null or new.consumed_at is null then raise exception using errcode='42501',message='reviewer_assertion_immutable'; end if;
  return new;
end $$;
create trigger reviewer_assertions_append_only before update or delete on review_private.reviewer_assertion_receipts
  for each row execute function review_private.guard_assertion_consumption();
create trigger review_audit_append_only before update or delete on review_private.review_audit_events
  for each row execute function review_private.reject_append_only_mutation();

create or replace function review_private.append_audit(
  p_kind text,p_actor uuid,p_review uuid,p_case uuid,p_outcome text,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior bytea; eid uuid:=extensions.gen_random_uuid(); now_at timestamptz:=statement_timestamp(); hashed bytea;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('review-audit-chain',0));
  select event_hash into prior from review_private.review_audit_events order by sequence_number desc limit 1;
  hashed:=extensions.digest(convert_to(concat_ws('|',coalesce(encode(prior,'hex'),''),eid,p_kind,coalesce(p_actor::text,''),coalesce(p_review::text,''),coalesce(p_case::text,''),p_outcome,p_metadata::text,now_at),'utf8'),'sha256');
  insert into review_private.review_audit_events(event_id,previous_hash,event_hash,event_kind,actor_user_id,review_id,case_id,outcome,metadata,occurred_at)
  values(eid,prior,hashed,p_kind,p_actor,p_review,p_case,p_outcome,p_metadata,now_at);
  return eid;
end $$;

create or replace function review_private.review_stage_allowed(p_store_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from app_public.stores s cross join app_private.environment_stage e
    where s.id=p_store_id and (
      (s.synthetic and e.id=1 and e.stage='synthetic_alpha')
      or (not s.synthetic and release_private.public_capability_enabled('reviews')
        and release_private.public_store_visible(s.id))
    )
  )
$$;

create or replace function review_private.require_active_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='review_authentication_required';
  end if;
  return actor;
end $$;

create or replace function review_private.require_review_admin() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null
    or not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes') then
    raise exception using errcode='42501',message='review_moderation_denied';
  end if;
  return actor;
end $$;

create or replace function review_private.rebuild_rating_aggregate(p_store_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c bigint; total bigint; row review_private.rating_aggregates%rowtype;
begin
  select count(*),coalesce(sum(rating),0) into c,total from review_private.public_reviews
    where store_id=p_store_id and state='published' and conflict_kind='none';
  insert into review_private.rating_aggregates(store_id,eligible_count,rating_sum)
  values(p_store_id,c,total)
  on conflict(store_id) do update set eligible_count=excluded.eligible_count,rating_sum=excluded.rating_sum,
    version=review_private.rating_aggregates.version+1,updated_at=statement_timestamp()
  returning * into row;
  return jsonb_build_object('average',case when row.eligible_count=0 then 0 else round(row.rating_sum::numeric/row.eligible_count,1) end,'count',row.eligible_count);
end $$;

create or replace function review_private.sync_public_projection(p_review_id uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; release_id uuid; source_hash bytea;
begin
  select * into r from review_private.public_reviews where review_id=p_review_id;
  if not found then return; end if;
  select x.release_id into release_id from release_private.regional_releases x
    join release_private.release_capabilities c using(release_id)
    where x.region_key='topeka-ks' and x.state='active' and c.public_reviews limit 1;
  if release_id is null then return; end if;
  source_hash:=extensions.digest(convert_to(concat_ws('|',r.review_id,r.version,r.rating,coalesce(r.review_text,''),r.state),'utf8'),'sha256');
  if r.state='published' and r.review_text is not null and btrim(r.review_text)<>'' then
    insert into release_private.public_review_projection(review_id,release_id,store_id,rating,review_text,approved_at,source_digest,withdrawn_at)
    values(r.review_id,release_id,r.store_id,r.rating,r.review_text,statement_timestamp(),source_hash,null)
    on conflict(review_id) do update set rating=excluded.rating,review_text=excluded.review_text,
      approved_at=excluded.approved_at,source_digest=excluded.source_digest,withdrawn_at=null;
  else
    update release_private.public_review_projection set withdrawn_at=coalesce(withdrawn_at,statement_timestamp()) where review_id=p_review_id;
  end if;
end $$;

create or replace function review_private.public_review_json(r review_private.public_reviews) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('id',r.review_id,'storeId',r.store_id,'rating',r.rating,'text',r.review_text,
    'displayName',r.display_name,'visitMonth',r.visit_month,'visitYear',r.visit_year,
    'conflict',r.conflict_kind,'state','published','edited',r.edited,'publishedAt',r.published_at)
$$;

create or replace function app_public.reviews_get_capability() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'stage',case when release_private.public_capability_enabled('reviews') then 'regional_public_mvp'
      when (select stage from app_private.environment_stage where id=1)='private_beta' then 'private_beta'
      when (select stage from app_private.environment_stage where id=1)='regional_public' then 'readiness'
      else 'internal_alpha' end,
    'enabled',release_private.public_capability_enabled('reviews'),'source','server')
$$;

create or replace function app_public.reviews_get_eligibility(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); profile app_private.profiles%rowtype; completed boolean; active_review boolean; own_store boolean; deleting boolean; limited boolean;
begin
  if p_store_id is null or not review_private.review_stage_allowed(p_store_id) then
    raise exception using errcode='55000',message='review_stage_disabled';
  end if;
  select * into profile from app_private.profiles where user_id=actor;
  select exists(select 1 from trip_private.trips t join trip_private.trip_stops s using(trip_id)
    where t.owner_id=actor and s.store_id=p_store_id and s.state='completed') into completed;
  select exists(select 1 from review_private.public_reviews r where r.author_id=actor and r.store_id=p_store_id and r.state<>'deleted') into active_review;
  select exists(select 1 from app_private.role_grants g where g.subject_user_id=actor and g.role='representative' and g.store_id=p_store_id and g.state='active')
    or exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') into own_store;
  select profile.status='deletion_pending' or exists(select 1 from app_private.account_deletion_requests d where d.user_id=actor and d.state='scheduled') into deleting;
  select count(*)>=5 or exists(select 1 from review_private.review_restrictions x
      where x.subject_user_id=actor and x.store_id=p_store_id and x.state='active' and x.level<>'notice_only'
        and (x.expires_at is null or x.expires_at>statement_timestamp()))
    into limited from review_private.review_audit_events a where a.actor_user_id=actor and a.event_kind='review_created' and a.occurred_at>statement_timestamp()-interval '1 day';
  return jsonb_build_object('verifiedEmail',profile.verified_email_snapshot is not null,'ageAttested',profile.age_18_attested_at is not null,
    'completedVisit',completed,'manualVisitAttested',false,'activeReviewExists',active_review,
    'ownStoreConflict',own_store,'accountDeletionScheduled',deleting,'rateLimited',limited);
end $$;

create or replace function app_public.reviews_get_store(p_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); aggregate jsonb; cards jsonb; own_card jsonb;
begin
  if not review_private.review_stage_allowed(p_store_id)
    or (actor is null and not release_private.public_capability_enabled('reviews')) then
    return jsonb_build_object('aggregate',jsonb_build_object('average',0,'count',0),'reviews','[]'::jsonb,'ownReview',null);
  end if;
  select jsonb_build_object('average',case when eligible_count=0 then 0 else round(rating_sum::numeric/eligible_count,1) end,'count',eligible_count)
    into aggregate from review_private.rating_aggregates where store_id=p_store_id;
  select coalesce(jsonb_agg(review_private.public_review_json(r) order by r.published_at desc),'[]'::jsonb) into cards
    from review_private.public_reviews r where r.store_id=p_store_id and r.state='published';
  if actor is not null then
    select jsonb_build_object('id',r.review_id,'storeId',r.store_id,'rating',r.rating,'text',r.review_text,
      'displayName',r.display_name,'visitMonth',r.visit_month,'visitYear',r.visit_year,'conflict',r.conflict_kind,
      'state',case r.state when 'published' then 'published' when 'held' then 'pending_review' else 'removed' end,
      'edited',r.edited,'publishedAt',r.published_at) into own_card
      from review_private.public_reviews r where r.store_id=p_store_id and r.author_id=actor and r.state<>'deleted';
  end if;
  return jsonb_build_object('aggregate',coalesce(aggregate,jsonb_build_object('average',0,'count',0)),'reviews',cards,'ownReview',own_card);
end $$;

create or replace function app_public.reviews_create(
  p_store_id uuid,p_rating integer,p_text text,p_display_name text,p_visit_month integer,p_visit_year integer,p_conflict_kind text,p_manual_visit_attested boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); eligibility jsonb; r review_private.public_reviews%rowtype;
begin
  if p_store_id is null or p_rating not between 1 and 5 or p_text is null or char_length(p_text)>2000
    or nullif(btrim(p_display_name),'') is null or char_length(p_display_name)>80
    or p_visit_month not between 1 and 12 or p_visit_year not between 2000 and 2100
    or p_conflict_kind not in ('none','employment','ownership','family','vendor','compensated','other_material') then
    raise exception using errcode='22023',message='review_input_invalid';
  end if;
  eligibility:=app_public.reviews_get_eligibility(p_store_id);
  if not (eligibility->>'verifiedEmail')::boolean or not (eligibility->>'ageAttested')::boolean
    or (eligibility->>'activeReviewExists')::boolean or (eligibility->>'ownStoreConflict')::boolean
    or (eligibility->>'accountDeletionScheduled')::boolean or (eligibility->>'rateLimited')::boolean
    or (not (eligibility->>'completedVisit')::boolean and coalesce(p_manual_visit_attested,false) is not true) then
    raise exception using errcode='42501',message='review_not_eligible';
  end if;
  insert into review_private.public_reviews(author_id,store_id,rating,review_text,display_name,visit_month,visit_year,eligibility_kind,conflict_kind)
  values(actor,p_store_id,p_rating,p_text,btrim(p_display_name),p_visit_month,p_visit_year,
    case when (eligibility->>'completedVisit')::boolean then 'completed_visit' else 'manual_attestation' end,p_conflict_kind)
  returning * into r;
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_created',actor,r.review_id,null,'allowed',jsonb_build_object('storeId',r.store_id,'version',r.version,'conflict',r.conflict_kind));
  return review_private.public_review_json(r);
exception when unique_violation then raise exception using errcode='23505',message='review_already_exists';
end $$;

create or replace function app_public.reviews_edit(
  p_review_id uuid,p_store_id uuid,p_rating integer,p_text text,p_display_name text,p_visit_month integer,p_visit_year integer,p_conflict_kind text,p_manual_visit_attested boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.public_reviews%rowtype;
begin
  select * into r from review_private.public_reviews where review_id=p_review_id and author_id=actor for update;
  if not found then raise exception using errcode='42501',message='review_action_denied'; end if;
  if r.store_id<>p_store_id or r.state not in ('published','held','removed') or p_rating not between 1 and 5 or p_text is null or char_length(p_text)>2000
    or nullif(btrim(p_display_name),'') is null or char_length(p_display_name)>80 or p_visit_month not between 1 and 12 or p_visit_year not between 2000 and 2100
    or p_conflict_kind not in ('none','employment','ownership','family','vendor','compensated','other_material')
    or not review_private.review_stage_allowed(r.store_id) then raise exception using errcode='22023',message='review_input_invalid'; end if;
  insert into review_private.review_versions(review_id,author_id,version,rating,review_text,display_name,visit_month,visit_year,conflict_kind)
    values(r.review_id,r.author_id,r.version,r.rating,r.review_text,r.display_name,r.visit_month,r.visit_year,r.conflict_kind);
  update review_private.public_reviews set rating=p_rating,review_text=p_text,display_name=btrim(p_display_name),visit_month=p_visit_month,
    visit_year=p_visit_year,conflict_kind=p_conflict_kind,edited=true,version=version+1,updated_at=statement_timestamp()
    where review_id=r.review_id returning * into r;
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_edited',actor,r.review_id,null,'allowed',jsonb_build_object('storeId',r.store_id,'version',r.version));
  return review_private.public_review_json(r);
end $$;

create or replace function app_public.reviews_request_delete(p_review_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.public_reviews%rowtype; requested timestamptz:=statement_timestamp();
begin
  select * into r from review_private.public_reviews where review_id=p_review_id and author_id=actor for update;
  if not found or r.state not in ('published','held','removed') then raise exception using errcode='42501',message='review_action_denied'; end if;
  update review_private.public_reviews set pre_delete_state=state,state='delete_pending',deletion_kind='author',delete_requested_at=requested,
    undo_expires_at=requested+interval '60 seconds',purge_due_at=requested+interval '24 hours',updated_at=requested,version=version+1
    where review_id=p_review_id returning * into r;
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_delete_requested',actor,r.review_id,null,'allowed',jsonb_build_object('storeId',r.store_id,'undoExpiresAt',r.undo_expires_at));
  return jsonb_build_object('reviewId',r.review_id,'state','pending_undo','undoExpiresAt',r.undo_expires_at,'purgeDueAt',r.purge_due_at);
end $$;

create or replace function app_public.reviews_undo_delete(p_review_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.public_reviews%rowtype;
begin
  select * into r from review_private.public_reviews where review_id=p_review_id and author_id=actor for update;
  if not found or r.state<>'delete_pending' or r.undo_expires_at<statement_timestamp() or r.pre_delete_state<>'published'
    or not review_private.review_stage_allowed(r.store_id) then raise exception using errcode='55000',message='review_undo_unavailable'; end if;
  update review_private.public_reviews set state='published',pre_delete_state=null,deletion_kind=null,delete_requested_at=null,undo_expires_at=null,purge_due_at=null,
    updated_at=statement_timestamp(),version=version+1 where review_id=p_review_id returning * into r;
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_delete_undone',actor,r.review_id,null,'allowed',jsonb_build_object('storeId',r.store_id));
  return review_private.public_review_json(r);
end $$;

create or replace function app_public.reviews_report(p_review_id uuid,p_reason_code text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.public_reviews%rowtype; report_id uuid; case_id uuid;
begin
  if p_reason_code not in ('spam','threats_harassment_hate','personal_sensitive_information','impersonation','undisclosed_conflict','compensated_manipulation','irrelevant','legal_safety') then
    raise exception using errcode='22023',message='review_report_invalid';
  end if;
  select * into r from review_private.public_reviews where review_id=p_review_id and state in ('published','held','removed');
  if not found or not review_private.review_stage_allowed(r.store_id) then raise exception using errcode='42501',message='review_action_denied'; end if;
  begin
    insert into review_private.review_reports(review_id,reporter_id,reason_code) values(p_review_id,actor,p_reason_code) returning review_private.review_reports.report_id into report_id;
  exception when unique_violation then return jsonb_build_object('accepted',true); end;
  select c.case_id into case_id from review_private.moderation_cases c where c.review_id=p_review_id and c.state in ('open','held','removed','appealed') order by c.opened_at desc limit 1;
  if case_id is null then
    insert into review_private.moderation_cases(review_id,store_id,reason_code) values(p_review_id,r.store_id,p_reason_code) returning review_private.moderation_cases.case_id into case_id;
    insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
      values(case_id,'report_reason',p_reason_code,extensions.digest(convert_to(report_id::text||'|'||p_reason_code,'utf8'),'sha256'));
    if nullif(r.review_text,'') is not null then
      insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
        values(case_id,'review_text',r.review_text,extensions.digest(convert_to(r.review_id::text||'|'||r.version,'utf8'),'sha256'));
    end if;
  end if;
  perform review_private.append_audit('review_reported',actor,p_review_id,case_id,'allowed',jsonb_build_object('reasonCode',p_reason_code));
  return jsonb_build_object('accepted',true);
end $$;

create or replace function app_public.reviews_list_moderation_cases() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_review_admin(); claimed uuid; result jsonb;
begin
  select case_id into claimed from review_private.moderation_cases
    where assigned_admin_id is null and state='open' order by opened_at for update skip locked limit 1;
  if claimed is not null then
    update review_private.moderation_cases set assigned_admin_id=actor,updated_at=statement_timestamp(),version=version+1 where case_id=claimed;
    perform review_private.append_audit('moderation_case_claimed',actor,null,claimed,'allowed','{}'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.case_id,'reviewId',c.review_id,'storeId',c.store_id,'state',c.state,
      'reasonCode',c.reason_code,'evidence',coalesce((select jsonb_agg(jsonb_build_object('kind',e.evidence_kind,'value',e.evidence_value) order by e.created_at)
        from review_private.moderation_case_evidence e where e.case_id=c.case_id),'[]'::jsonb),
      'openedAt',c.opened_at,'updatedAt',c.updated_at) order by c.opened_at),'[]'::jsonb)
    into result from review_private.moderation_cases c where c.assigned_admin_id=actor and c.state in ('open','held','removed','appealed');
  return result;
end $$;

create or replace function app_public.reviews_moderate(p_case_id uuid,p_action text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_review_admin(); c review_private.moderation_cases%rowtype; r review_private.public_reviews%rowtype; next_case text; next_review text;
begin
  if p_action not in ('hold','remove','restore','dismiss_report') or nullif(btrim(p_reason),'') is null or char_length(p_reason)>1000 then
    raise exception using errcode='22023',message='review_moderation_input_invalid';
  end if;
  select * into c from review_private.moderation_cases where case_id=p_case_id for update;
  if not found or c.assigned_admin_id<>actor or c.state not in ('open','held','removed') then raise exception using errcode='42501',message='review_moderation_denied'; end if;
  select * into r from review_private.public_reviews where review_id=c.review_id for update;
  if p_action='hold' then next_case:='held'; next_review:='held';
  elsif p_action='remove' then next_case:='removed'; next_review:='removed';
  elsif p_action='restore' then next_case:='restored'; next_review:='published';
  else next_case:='dismissed'; next_review:=case when r.state='held' then 'published' else r.state end; end if;
  update review_private.public_reviews set state=next_review,updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id returning * into r;
  update review_private.moderation_cases set state=next_case,original_moderator_id=coalesce(original_moderator_id,actor),
    decided_at=statement_timestamp(),closed_at=case when next_case in ('restored','dismissed') then statement_timestamp() end,
    updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id returning * into c;
  insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
    values(c.case_id,'prior_decision',p_action,extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'));
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_moderated',actor,r.review_id,c.case_id,'allowed',jsonb_build_object('action',p_action,'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  return jsonb_build_object('id',c.case_id,'reviewId',c.review_id,'storeId',c.store_id,'state',c.state,'reasonCode',c.reason_code,
    'evidence','[]'::jsonb,'openedAt',c.opened_at,'updatedAt',c.updated_at);
end $$;

create or replace function app_public.reviews_submit_appeal(p_review_id uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.public_reviews%rowtype; c review_private.moderation_cases%rowtype; a review_private.review_appeals%rowtype; submitter text; other_admin uuid; independent_id uuid;
begin
  if nullif(btrim(p_reason),'') is null or char_length(p_reason)>2000 then raise exception using errcode='22023',message='review_appeal_input_invalid'; end if;
  select * into r from review_private.public_reviews where review_id=p_review_id for update;
  select * into c from review_private.moderation_cases where review_id=p_review_id and state in ('held','removed') order by decided_at desc limit 1 for update;
  if not found or c.decided_at+interval '30 days'<statement_timestamp() then raise exception using errcode='55000',message='review_appeal_unavailable'; end if;
  if r.author_id=actor then submitter:='author';
  elsif app_private.current_user_has_role('representative'::app_private.app_role,r.store_id)
    or exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=r.store_id and g.state='active') then submitter:='store_representative';
  else raise exception using errcode='42501',message='review_appeal_denied'; end if;
  select g.subject_user_id into other_admin from app_private.role_grants g where g.role='administrator' and g.state='active' and g.subject_user_id<>c.original_moderator_id order by g.granted_at limit 1;
  if other_admin is null then
    select reviewer_identity_id into independent_id from review_private.reviewer_identities
      where state='active' and active_credential_count>=2 order by created_at limit 1;
    if independent_id is null then raise exception using errcode='55000',message='review_independent_reviewer_unavailable'; end if;
  end if;
  insert into review_private.review_appeals(case_id,review_id,submitted_by_user_id,submitted_by_kind,original_action,original_moderator_id,assigned_admin_id,assigned_reviewer_identity_id,state,appeal_reason)
    values(c.case_id,r.review_id,actor,submitter,case when r.state='held' then 'hold' else 'remove' end,c.original_moderator_id,other_admin,independent_id,'assigned',btrim(p_reason)) returning * into a;
  update review_private.moderation_cases set state='appealed',updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id;
  insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
    values(c.case_id,'appeal_text',btrim(p_reason),extensions.digest(convert_to(a.appeal_id::text||'|'||btrim(p_reason),'utf8'),'sha256'));
  perform review_private.append_audit('review_appeal_submitted',actor,r.review_id,c.case_id,'allowed',jsonb_build_object('submittedBy',submitter,'appealId',a.appeal_id));
  return jsonb_build_object('id',a.appeal_id,'reviewId',a.review_id,'submittedBy',a.submitted_by_kind,'state',a.state,
    'originalDecision',a.original_action,'reason',a.appeal_reason,'deadlineAt',a.deadline_at,
    'decidedByDifferentReviewer',false);
exception when unique_violation then raise exception using errcode='23505',message='review_appeal_already_submitted';
end $$;

create or replace function review_private.record_reviewer_assertion(
  p_reviewer_identity_id uuid,p_case_id uuid,p_challenge_digest bytea,p_assertion_digest bytea,p_provider_verification_id text
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare rid uuid;
begin
  if octet_length(p_challenge_digest)<>32 or octet_length(p_assertion_digest)<>32 or nullif(p_provider_verification_id,'') is null
    or not exists(select 1 from review_private.reviewer_identities where reviewer_identity_id=p_reviewer_identity_id and state='active' and active_credential_count>=2) then
    raise exception using errcode='42501',message='reviewer_assertion_invalid';
  end if;
  insert into review_private.reviewer_assertion_receipts(reviewer_identity_id,case_id,challenge_digest,assertion_digest,provider_verification_id)
    values(p_reviewer_identity_id,p_case_id,p_challenge_digest,p_assertion_digest,p_provider_verification_id) returning assertion_receipt_id into rid;
  update review_private.reviewer_identities set assertion_verified_at=statement_timestamp() where reviewer_identity_id=p_reviewer_identity_id;
  return rid;
end $$;

create or replace function review_private.register_reviewer_identity(
  p_user_id uuid,p_qualification_receipt_digest bytea,p_active_credential_count integer
) returns uuid language plpgsql volatile security definer set search_path='' as $$
declare reviewer_id uuid;
begin
  if p_user_id is null or octet_length(p_qualification_receipt_digest)<>32 or p_active_credential_count<2 or p_active_credential_count>8 then
    raise exception using errcode='22023',message='reviewer_identity_input_invalid';
  end if;
  insert into review_private.reviewer_identities(user_id,state,qualification_receipt_digest,active_credential_count)
    values(p_user_id,'active',p_qualification_receipt_digest,p_active_credential_count)
    on conflict(user_id) do update set state='active',qualification_receipt_digest=excluded.qualification_receipt_digest,
      active_credential_count=excluded.active_credential_count,relationship_ended_at=null,assertion_verified_at=null
    returning reviewer_identity_id into reviewer_id;
  perform review_private.append_audit('reviewer_identity_activated',null,null,null,'allowed',jsonb_build_object('reviewerIdentityId',reviewer_id,'credentialCount',p_active_credential_count));
  return reviewer_id;
end $$;

create or replace function review_private.apply_review_restriction(p_review_id uuid,p_case_id uuid,p_actor uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; count180 integer; count365 integer; level text; days integer; restriction uuid;
begin
  select * into r from review_private.public_reviews where review_id=p_review_id;
  if r.author_id is null then return null; end if;
  select count(*) filter(where a.decided_at>=statement_timestamp()-interval '180 days'),count(*)
    into count180,count365 from review_private.review_appeals a join review_private.public_reviews x using(review_id)
    where x.author_id=r.author_id and a.state='upheld' and a.decided_at>=statement_timestamp()-interval '365 days';
  if count365>=4 then level:='one_eighty_days'; days:=180;
  elsif count365>=3 then level:='ninety_days'; days:=90;
  elsif count180>=2 then level:='thirty_days'; days:=30;
  else level:='notice_only'; days:=null; end if;
  update review_private.review_restrictions set state='revoked',ended_at=statement_timestamp(),version=version+1
    where subject_user_id=r.author_id and store_id=r.store_id and state='active';
  insert into review_private.review_restrictions(subject_user_id,store_id,level,reason_code,source_case_id,expires_at)
    values(r.author_id,r.store_id,level,'upheld_review_policy',p_case_id,case when days is null then null else statement_timestamp()+make_interval(days=>days) end)
    returning restriction_id into restriction;
  perform review_private.append_audit('review_restriction_applied',p_actor,p_review_id,p_case_id,'allowed',jsonb_build_object('level',level,'restrictionId',restriction));
  return restriction;
end $$;

create or replace function app_public.reviews_decide_appeal(p_appeal_id uuid,p_outcome text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); a review_private.review_appeals%rowtype; c review_private.moderation_cases%rowtype; r review_private.public_reviews%rowtype; reviewer review_private.reviewer_identities%rowtype;
begin
  if p_outcome not in ('restore','uphold') or nullif(btrim(p_reason),'') is null or char_length(p_reason)>2000 then raise exception using errcode='22023',message='review_appeal_decision_invalid'; end if;
  select * into a from review_private.review_appeals where appeal_id=p_appeal_id for update;
  select * into c from review_private.moderation_cases where case_id=a.case_id for update;
  select * into r from review_private.public_reviews where review_id=a.review_id for update;
  if not found or a.state<>'assigned' or a.deadline_at<statement_timestamp() or a.original_moderator_id=actor then raise exception using errcode='42501',message='review_appeal_decision_denied'; end if;
  if a.assigned_admin_id=actor then
    if not app_private.current_user_has_role('administrator'::app_private.app_role,null) or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '10 minutes') then raise exception using errcode='42501',message='review_appeal_decision_denied'; end if;
  else
    select * into reviewer from review_private.reviewer_identities where reviewer_identity_id=a.assigned_reviewer_identity_id and user_id=actor;
    if not found or reviewer.state<>'active' or reviewer.active_credential_count<2 or reviewer.assertion_verified_at<statement_timestamp()-interval '5 minutes'
      or not exists(select 1 from review_private.reviewer_assertion_receipts x where x.reviewer_identity_id=reviewer.reviewer_identity_id and x.case_id=c.case_id and x.expires_at>statement_timestamp() and x.consumed_at is null) then
      raise exception using errcode='42501',message='review_appeal_decision_denied';
    end if;
    update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=(select assertion_receipt_id from review_private.reviewer_assertion_receipts where reviewer_identity_id=reviewer.reviewer_identity_id and case_id=c.case_id and expires_at>statement_timestamp() and consumed_at is null order by verified_at desc limit 1);
  end if;
  update review_private.review_appeals set state=case when p_outcome='restore' then 'restored' else 'upheld' end,
    decision_reason=btrim(p_reason),decided_at=statement_timestamp() where appeal_id=a.appeal_id returning * into a;
  if p_outcome='restore' then
    update review_private.public_reviews set state='published',updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id returning * into r;
    update review_private.moderation_cases set state='resolved',closed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id;
  else
    perform review_private.apply_review_restriction(r.review_id,c.case_id,actor);
    update review_private.moderation_cases set state='resolved',closed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id;
  end if;
  perform review_private.rebuild_rating_aggregate(r.store_id); perform review_private.sync_public_projection(r.review_id);
  perform review_private.append_audit('review_appeal_decided',actor,r.review_id,c.case_id,'allowed',jsonb_build_object('outcome',p_outcome,'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  return jsonb_build_object('id',a.appeal_id,'reviewId',a.review_id,'submittedBy',a.submitted_by_kind,'state',a.state,
    'originalDecision',a.original_action,'reason',a.appeal_reason,'deadlineAt',a.deadline_at,
    'decidedByDifferentReviewer',true,'decisionReason',a.decision_reason);
end $$;

create or replace function app_public.reviews_submit_restriction_appeal(p_restriction_id uuid,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); restriction review_private.review_restrictions%rowtype; source_case review_private.moderation_cases%rowtype; a review_private.restriction_appeals%rowtype; other_admin uuid; independent_id uuid;
begin
  if nullif(btrim(p_reason),'') is null or char_length(p_reason)>2000 then raise exception using errcode='22023',message='restriction_appeal_input_invalid'; end if;
  select * into restriction from review_private.review_restrictions where restriction_id=p_restriction_id and subject_user_id=actor and state='active' for update;
  if not found then raise exception using errcode='42501',message='restriction_appeal_denied'; end if;
  select * into source_case from review_private.moderation_cases where case_id=restriction.source_case_id;
  select g.subject_user_id into other_admin from app_private.role_grants g where g.role='administrator' and g.state='active' and g.subject_user_id<>source_case.original_moderator_id order by g.granted_at limit 1;
  if other_admin is null then
    select reviewer_identity_id into independent_id from review_private.reviewer_identities where state='active' and active_credential_count>=2 order by created_at limit 1;
    if independent_id is null then raise exception using errcode='55000',message='review_independent_reviewer_unavailable'; end if;
  end if;
  insert into review_private.restriction_appeals(restriction_id,submitted_by_user_id,original_moderator_id,assigned_admin_id,assigned_reviewer_identity_id,state,appeal_reason)
    values(restriction.restriction_id,actor,source_case.original_moderator_id,other_admin,independent_id,'assigned',btrim(p_reason)) returning * into a;
  perform review_private.append_audit('restriction_appeal_submitted',actor,null,source_case.case_id,'allowed',jsonb_build_object('restrictionId',restriction.restriction_id,'appealId',a.appeal_id));
  return jsonb_build_object('id',a.appeal_id,'feature','public_reviews','state',a.state,'submittedAt',a.submitted_at,'deadlineAt',a.deadline_at,'decidedByDifferentReviewer',false);
exception when unique_violation then raise exception using errcode='23505',message='restriction_appeal_already_submitted';
end $$;

create or replace function app_public.reviews_decide_restriction_appeal(p_appeal_id uuid,p_outcome text,p_reason text) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); a review_private.restriction_appeals%rowtype; restriction review_private.review_restrictions%rowtype; source_case review_private.moderation_cases%rowtype; reviewer review_private.reviewer_identities%rowtype;
begin
  if p_outcome not in ('restore','uphold') or nullif(btrim(p_reason),'') is null or char_length(p_reason)>2000 then raise exception using errcode='22023',message='restriction_appeal_decision_invalid'; end if;
  select * into a from review_private.restriction_appeals where appeal_id=p_appeal_id for update;
  select * into restriction from review_private.review_restrictions where restriction_id=a.restriction_id for update;
  select * into source_case from review_private.moderation_cases where case_id=restriction.source_case_id;
  if not found or a.state<>'assigned' or a.deadline_at<statement_timestamp() or a.original_moderator_id=actor then raise exception using errcode='42501',message='restriction_appeal_decision_denied'; end if;
  if a.assigned_admin_id=actor then
    if not app_private.current_user_has_role('administrator'::app_private.app_role,null) or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '10 minutes') then raise exception using errcode='42501',message='restriction_appeal_decision_denied'; end if;
  else
    select * into reviewer from review_private.reviewer_identities where reviewer_identity_id=a.assigned_reviewer_identity_id and user_id=actor;
    if not found or reviewer.state<>'active' or reviewer.active_credential_count<2 or reviewer.assertion_verified_at<statement_timestamp()-interval '5 minutes'
      or not exists(select 1 from review_private.reviewer_assertion_receipts x where x.reviewer_identity_id=reviewer.reviewer_identity_id and x.case_id=source_case.case_id and x.expires_at>statement_timestamp() and x.consumed_at is null) then raise exception using errcode='42501',message='restriction_appeal_decision_denied'; end if;
    update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=(select assertion_receipt_id from review_private.reviewer_assertion_receipts where reviewer_identity_id=reviewer.reviewer_identity_id and case_id=source_case.case_id and expires_at>statement_timestamp() and consumed_at is null order by verified_at desc limit 1);
  end if;
  update review_private.restriction_appeals set state=case when p_outcome='restore' then 'restored' else 'upheld' end,
    decision_reason=btrim(p_reason),decided_at=statement_timestamp() where appeal_id=a.appeal_id returning * into a;
  if p_outcome='restore' then update review_private.review_restrictions set state='revoked',ended_at=statement_timestamp(),version=version+1 where restriction_id=restriction.restriction_id; end if;
  perform review_private.append_audit('restriction_appeal_decided',actor,null,source_case.case_id,'allowed',jsonb_build_object('outcome',p_outcome,'restrictionId',restriction.restriction_id,'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  return jsonb_build_object('id',a.appeal_id,'feature','public_reviews','state',a.state,'submittedAt',a.submitted_at,'deadlineAt',a.deadline_at,'decidedByDifferentReviewer',true,'decisionReason',a.decision_reason);
end $$;

create or replace function app_public.reviews_expire_restriction(p_restriction_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=review_private.require_active_actor(); r review_private.review_restrictions%rowtype;
begin
  select * into r from review_private.review_restrictions where restriction_id=p_restriction_id and subject_user_id=actor for update;
  if not found then raise exception using errcode='42501',message='restriction_action_denied'; end if;
  if r.state='active' and r.expires_at is not null and r.expires_at<=statement_timestamp() then
    update review_private.review_restrictions set state='expired',ended_at=statement_timestamp(),version=version+1 where restriction_id=r.restriction_id returning * into r;
    perform review_private.append_audit('review_restriction_expired',actor,null,r.source_case_id,'expired',jsonb_build_object('restrictionId',r.restriction_id));
  end if;
  return jsonb_build_object('feature','public_reviews','storeId',r.store_id,'level',r.level,'startsAt',r.starts_at,'expiresAt',r.expires_at,
    'notice',case r.level when 'notice_only' then 'A review policy notice was recorded.' else 'Public review posting is temporarily restricted for this store.' end,
    'active',r.state='active');
end $$;

create or replace function review_private.finalize_review_deletions(p_now timestamptz,p_limit integer default 25) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; processed integer:=0;
begin
  if p_now is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='review_lifecycle_input_invalid'; end if;
  for r in select * from review_private.public_reviews where state='delete_pending' and undo_expires_at<=p_now and purge_due_at<=p_now order by purge_due_at for update skip locked limit p_limit loop
    update review_private.review_versions set review_text=null,display_name=null,author_id=null where review_id=r.review_id;
    update review_private.public_reviews set state='deleted',review_text=null,display_name=null,author_id=null,author_tombstone=coalesce(author_tombstone,extensions.gen_random_uuid()),
      pre_delete_state=null,deletion_kind=null,deleted_at=p_now,updated_at=p_now,version=version+1 where review_id=r.review_id;
    update review_private.review_reports set reporter_id=null,reporter_tombstone=coalesce(reporter_tombstone,extensions.gen_random_uuid()) where reporter_id=r.author_id;
    perform review_private.rebuild_rating_aggregate(r.store_id); perform review_private.sync_public_projection(r.review_id);
    perform review_private.append_audit('review_text_purged',null,r.review_id,null,'purged',jsonb_build_object('storeId',r.store_id));
    processed:=processed+1;
  end loop;
  return processed;
end $$;

create or replace function review_private.hide_account_reviews(p_user_id uuid,p_purge_due_at timestamptz) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; processed integer:=0;
begin
  for r in select * from review_private.public_reviews where author_id=p_user_id and state in ('published','held','removed') for update loop
    update review_private.public_reviews set pre_delete_state=state,state='delete_pending',deletion_kind='account',delete_requested_at=statement_timestamp(),undo_expires_at=statement_timestamp(),purge_due_at=p_purge_due_at,updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id;
    perform review_private.rebuild_rating_aggregate(r.store_id); perform review_private.sync_public_projection(r.review_id); processed:=processed+1;
  end loop;
  return processed;
end $$;

create or replace function review_private.restore_account_reviews(p_user_id uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; processed integer:=0;
begin
  for r in select * from review_private.public_reviews where author_id=p_user_id and state='delete_pending' and pre_delete_state='published' for update loop
    update review_private.public_reviews set state='published',pre_delete_state=null,deletion_kind=null,delete_requested_at=null,undo_expires_at=null,purge_due_at=null,updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id;
    perform review_private.rebuild_rating_aggregate(r.store_id); perform review_private.sync_public_projection(r.review_id); processed:=processed+1;
  end loop;
  return processed;
end $$;

create or replace function review_private.deidentify_account_reviews(p_user_id uuid,p_subject_tombstone uuid) returns integer
language plpgsql volatile security definer set search_path='' as $$
declare r review_private.public_reviews%rowtype; processed integer:=0; tombstone uuid:=coalesce(p_subject_tombstone,extensions.gen_random_uuid());
begin
  if p_user_id is null then raise exception using errcode='22023',message='review_deidentification_subject_required'; end if;
  for r in select * from review_private.public_reviews where author_id=p_user_id for update loop
    update review_private.review_versions set review_text=null,display_name=null,author_id=null where review_id=r.review_id;
    update review_private.public_reviews set state='deleted',review_text=null,display_name=null,author_id=null,author_tombstone=extensions.gen_random_uuid(),
      pre_delete_state=null,deletion_kind=null,delete_requested_at=coalesce(delete_requested_at,statement_timestamp()),undo_expires_at=coalesce(undo_expires_at,statement_timestamp()),
      purge_due_at=coalesce(purge_due_at,statement_timestamp()),deleted_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id;
    perform review_private.rebuild_rating_aggregate(r.store_id); perform review_private.sync_public_projection(r.review_id); processed:=processed+1;
  end loop;
  update review_private.review_reports set reporter_id=null,reporter_tombstone=coalesce(reporter_tombstone,tombstone) where reporter_id=p_user_id;
  update review_private.review_appeals set submitted_by_user_id=null,appeal_reason=null where submitted_by_user_id=p_user_id;
  update review_private.restriction_appeals set submitted_by_user_id=null,appeal_reason=null where submitted_by_user_id=p_user_id;
  update review_private.review_restrictions set subject_user_id=null,subject_tombstone=coalesce(subject_tombstone,tombstone) where subject_user_id=p_user_id;
  perform review_private.append_audit('review_account_deidentified',null,null,null,'purged',jsonb_build_object('reviewCount',processed));
  return processed;
end $$;

create or replace function review_private.account_deletion_review_hook() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' and new.state='scheduled' then perform review_private.hide_account_reviews(new.user_id,new.due_at);
  elsif tg_op='UPDATE' and old.state='scheduled' and new.state='cancelled' and new.user_id is not null then perform review_private.restore_account_reviews(new.user_id);
  elsif tg_op='UPDATE' and new.state='completed' and old.user_id is not null then perform review_private.deidentify_account_reviews(old.user_id,new.subject_tombstone);
  end if;
  return new;
end $$;
create trigger account_deletion_reviews after insert or update on app_private.account_deletion_requests
  for each row execute function review_private.account_deletion_review_hook();

do $$ declare t text; begin
  foreach t in array array['public_reviews','review_versions','rating_aggregates','review_reports','moderation_cases','moderation_case_evidence','reviewer_identities','reviewer_assertion_receipts','review_appeals','review_restrictions','restriction_appeals','review_audit_events'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy review_automation_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;

grant select on app_public.stores to review_automation;
grant select on app_private.environment_stage,app_private.profiles,app_private.account_deletion_requests,app_private.role_grants to review_automation;
grant select on trip_private.trips,trip_private.trip_stops to review_automation;
grant select on partner_private.store_partner_grants to review_automation;
grant select on release_private.regional_releases,release_private.release_capabilities to review_automation;
grant select,insert,update on release_private.public_review_projection to review_automation;
grant execute on function release_private.public_capability_enabled(text),release_private.public_store_visible(uuid) to review_automation;

create policy review_authority_stores on app_public.stores for select to review_automation using(true);
create policy review_authority_stage on app_private.environment_stage for select to review_automation using(true);
create policy review_authority_profiles on app_private.profiles for select to review_automation using(true);
create policy review_authority_deletions on app_private.account_deletion_requests for select to review_automation using(true);
create policy review_authority_roles on app_private.role_grants for select to review_automation using(true);
create policy review_authority_trips on trip_private.trips for select to review_automation using(true);
create policy review_authority_trip_stops on trip_private.trip_stops for select to review_automation using(true);
create policy review_authority_partner_grants on partner_private.store_partner_grants for select to review_automation using(true);
create policy review_authority_releases on release_private.regional_releases for select to review_automation using(true);
create policy review_authority_release_capabilities on release_private.release_capabilities for select to review_automation using(true);
create policy review_automation_projection on release_private.public_review_projection for all to review_automation using(true) with check(true);

alter function review_private.reject_append_only_mutation() owner to review_automation;
alter function review_private.guard_version_purge() owner to review_automation;
alter function review_private.guard_report_deidentification() owner to review_automation;
alter function review_private.guard_assertion_consumption() owner to review_automation;
alter function review_private.append_audit(text,uuid,uuid,uuid,text,jsonb) owner to review_automation;
alter function review_private.review_stage_allowed(uuid) owner to review_automation;
alter function review_private.require_active_actor() owner to review_automation;
alter function review_private.require_review_admin() owner to review_automation;
alter function review_private.rebuild_rating_aggregate(uuid) owner to review_automation;
alter function review_private.sync_public_projection(uuid) owner to review_automation;
alter function review_private.public_review_json(review_private.public_reviews) owner to review_automation;
alter function review_private.record_reviewer_assertion(uuid,uuid,bytea,bytea,text) owner to review_automation;
alter function review_private.register_reviewer_identity(uuid,bytea,integer) owner to review_automation;
alter function review_private.apply_review_restriction(uuid,uuid,uuid) owner to review_automation;
alter function review_private.finalize_review_deletions(timestamptz,integer) owner to review_automation;
alter function review_private.hide_account_reviews(uuid,timestamptz) owner to review_automation;
alter function review_private.restore_account_reviews(uuid) owner to review_automation;
alter function review_private.deidentify_account_reviews(uuid,uuid) owner to review_automation;
alter function review_private.account_deletion_review_hook() owner to review_automation;

alter function app_public.reviews_get_capability() owner to review_automation;
alter function app_public.reviews_get_eligibility(uuid) owner to review_automation;
alter function app_public.reviews_get_store(uuid) owner to review_automation;
alter function app_public.reviews_create(uuid,integer,text,text,integer,integer,text,boolean) owner to review_automation;
alter function app_public.reviews_edit(uuid,uuid,integer,text,text,integer,integer,text,boolean) owner to review_automation;
alter function app_public.reviews_request_delete(uuid) owner to review_automation;
alter function app_public.reviews_undo_delete(uuid) owner to review_automation;
alter function app_public.reviews_report(uuid,text) owner to review_automation;
alter function app_public.reviews_list_moderation_cases() owner to review_automation;
alter function app_public.reviews_moderate(uuid,text,text) owner to review_automation;
alter function app_public.reviews_submit_appeal(uuid,text) owner to review_automation;
alter function app_public.reviews_decide_appeal(uuid,text,text) owner to review_automation;
alter function app_public.reviews_submit_restriction_appeal(uuid,text) owner to review_automation;
alter function app_public.reviews_decide_restriction_appeal(uuid,text,text) owner to review_automation;
alter function app_public.reviews_expire_restriction(uuid) owner to review_automation;

revoke all on all functions in schema review_private from public,anon,authenticated;
grant execute on function review_private.record_reviewer_assertion(uuid,uuid,bytea,bytea,text) to review_assertion_service;
grant execute on function review_private.register_reviewer_identity(uuid,bytea,integer) to review_assertion_service;
grant execute on function review_private.finalize_review_deletions(timestamptz,integer),review_private.deidentify_account_reviews(uuid,uuid) to review_lifecycle_service;

revoke all on function app_public.reviews_get_capability(),app_public.reviews_get_eligibility(uuid),app_public.reviews_get_store(uuid),
  app_public.reviews_create(uuid,integer,text,text,integer,integer,text,boolean),app_public.reviews_edit(uuid,uuid,integer,text,text,integer,integer,text,boolean),
  app_public.reviews_request_delete(uuid),app_public.reviews_undo_delete(uuid),app_public.reviews_report(uuid,text),app_public.reviews_list_moderation_cases(),
  app_public.reviews_moderate(uuid,text,text),app_public.reviews_submit_appeal(uuid,text),app_public.reviews_decide_appeal(uuid,text,text),
  app_public.reviews_submit_restriction_appeal(uuid,text),app_public.reviews_decide_restriction_appeal(uuid,text,text),app_public.reviews_expire_restriction(uuid)
  from public,anon,authenticated;
grant execute on function app_public.reviews_get_capability(),app_public.reviews_get_store(uuid) to anon,authenticated;
grant execute on function app_public.reviews_get_eligibility(uuid),app_public.reviews_create(uuid,integer,text,text,integer,integer,text,boolean),
  app_public.reviews_edit(uuid,uuid,integer,text,text,integer,integer,text,boolean),app_public.reviews_request_delete(uuid),app_public.reviews_undo_delete(uuid),
  app_public.reviews_report(uuid,text),app_public.reviews_list_moderation_cases(),app_public.reviews_moderate(uuid,text,text),app_public.reviews_submit_appeal(uuid,text),
  app_public.reviews_decide_appeal(uuid,text,text),app_public.reviews_submit_restriction_appeal(uuid,text),
  app_public.reviews_decide_restriction_appeal(uuid,text,text),app_public.reviews_expire_restriction(uuid) to authenticated;

revoke create on schema app_public from review_automation;
revoke create on schema review_private from review_automation;
revoke review_automation from postgres;
