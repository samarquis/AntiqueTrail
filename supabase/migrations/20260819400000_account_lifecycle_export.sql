-- Account-owned lifecycle/export completion for Packages 3 and 4.
-- Archives are built from fixed safe projections. Browser roles never receive
-- Storage keys, signed URLs, worker claims, HMACs, ciphertext, or internal evidence.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='account_lifecycle_service') then
    create role account_lifecycle_service nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;
grant account_lifecycle_service to authenticator;
grant usage on schema app_public to account_lifecycle_service;
grant identity_service to postgres;
grant create on schema app_public to identity_service;

-- The worker can access exactly one private bucket. It has no service-role key
-- and no broad Storage bypass; browser roles receive neither table grants nor
-- policies for these objects.
insert into storage.buckets(id,name,public)
values('account-exports','account-exports',false)
on conflict(id) do update set public=false;
grant usage on schema storage to account_lifecycle_service;
grant select on storage.buckets to account_lifecycle_service;
grant select,insert,update,delete on storage.objects to account_lifecycle_service;
create policy account_lifecycle_export_objects_select on storage.objects
  for select to account_lifecycle_service using(bucket_id='account-exports');
create policy account_lifecycle_export_objects_insert on storage.objects
  for insert to account_lifecycle_service with check(bucket_id='account-exports');
create policy account_lifecycle_export_objects_update on storage.objects
  for update to account_lifecycle_service using(bucket_id='account-exports') with check(bucket_id='account-exports');
create policy account_lifecycle_export_objects_delete on storage.objects
  for delete to account_lifecycle_service using(bucket_id='account-exports');

alter table app_private.account_export_jobs
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  add column retry_at timestamptz,
  add column archive_deleted_at timestamptz;

alter table app_private.account_export_jobs
  add constraint export_claim_shape check(
    (state='building' and claim_token is not null and claimed_at is not null and lease_expires_at>claimed_at)
    or (state<>'building' and claim_token is null and claimed_at is null and lease_expires_at is null)
  ),
  add constraint export_archive_shape check(
    state<>'ready' or (
      archive_object_key is not null and archive_checksum is not null and archive_bytes is not null
      and expires_at<=completed_at+interval '7 days'
    )
  );

create table app_private.account_export_download_handoffs(
  handoff_id uuid primary key default extensions.gen_random_uuid(),
  export_job_id uuid not null references app_private.account_export_jobs(export_job_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '15 minutes',
  consumed_at timestamptz,
  constraint account_export_handoff_window check(expires_at>issued_at and expires_at<=issued_at+interval '15 minutes'),
  constraint account_export_handoff_consumed check(consumed_at is null or consumed_at>=issued_at)
);
create unique index account_export_one_live_handoff
  on app_private.account_export_download_handoffs(export_job_id,user_id) where consumed_at is null;
alter table app_private.account_export_download_handoffs enable row level security;
alter table app_private.account_export_download_handoffs force row level security;
revoke all on app_private.account_export_download_handoffs from public,anon,authenticated;
grant select,insert,update,delete on app_private.account_export_download_handoffs to identity_service;
create policy identity_account_export_handoffs on app_private.account_export_download_handoffs
  for all to identity_service using(true) with check(true);

alter table shopper_private.private_memory_deletions
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0 check(attempt_count between 0 and 20),
  add column retry_at timestamptz,
  add column purged_at timestamptz;
alter table shopper_private.private_memory_deletions
  add constraint private_memory_purge_claim_shape check(
    (claim_token is null and claimed_at is null and lease_expires_at is null)
    or (state='pending' and claim_token is not null and claimed_at is not null and lease_expires_at>claimed_at)
  ),
  add constraint private_memory_purged_content_free check(
    state<>'purged' or (rating is null and note is null and last_visit_month is null and purged_at is not null)
  );

create table shopper_private.private_memory_deletion_receipts(
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  deleted_at timestamptz not null,
  completed_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '31 days',
  constraint private_memory_receipt_content_free check(expires_at>completed_at and expires_at<=completed_at+interval '31 days')
);
alter table shopper_private.private_memory_deletion_receipts enable row level security;
alter table shopper_private.private_memory_deletion_receipts force row level security;
revoke all on shopper_private.private_memory_deletion_receipts from public,anon,authenticated;
grant select,insert,delete on shopper_private.private_memory_deletion_receipts to identity_service;
create policy identity_private_memory_receipts on shopper_private.private_memory_deletion_receipts
  for all to identity_service using(true) with check(true);

create or replace function app_public.account_lifecycle_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); profile_row app_private.profiles%rowtype; deletion_row app_private.account_deletion_requests%rowtype;
begin
  if actor is null or not (app_private.current_session_is_active() or app_private.current_session_is_cancellation_only()) then
    raise exception using errcode='42501',message='account_lifecycle_denied';
  end if;
  select * into profile_row from app_private.profiles where user_id=actor;
  select * into deletion_row from app_private.account_deletion_requests where user_id=actor order by requested_at desc limit 1;
  return jsonb_build_object(
    'state',case when profile_row.status in ('deletion_pending','deletion_scheduled') then 'deletion_scheduled' else profile_row.status::text end,
    'deletionDueAt',case when profile_row.deletion_due_at is null then null else profile_row.deletion_due_at end
  );
end $$;

create or replace function app_public.request_account_export()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); job app_private.account_export_jobs%rowtype;
begin
  if actor is null or not app_private.current_session_recent_auth(interval '10 minutes') then
    raise exception using errcode='42501',message='recent_auth_required';
  end if;
  perform 1 from app_private.profiles where user_id=actor for update;
  update app_private.account_export_jobs set state='expired',claim_token=null,claimed_at=null,lease_expires_at=null
    where user_id=actor and state='ready' and expires_at<=statement_timestamp();
  select * into job from app_private.account_export_jobs
    where user_id=actor and state in ('queued','building','ready') order by requested_at desc limit 1 for update;
  if not found then
    insert into app_private.account_export_jobs(user_id) values(actor) returning * into job;
  end if;
  return jsonb_build_object('id',job.export_job_id,'state',job.state,'createdAt',job.requested_at,
    'expiresAt',case when job.expires_at is null then null else job.expires_at end);
end $$;

create or replace function app_public.get_account_export_status(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype;
begin
  if not app_private.current_session_is_active() then raise exception using errcode='42501',message='account_lifecycle_denied'; end if;
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and user_id=app_public.request_user_id();
  if not found then raise exception using errcode='P0002',message='account_export_unavailable'; end if;
  return jsonb_build_object('id',job.export_job_id,'state',job.state,'createdAt',job.requested_at,
    'expiresAt',case when job.expires_at is null then null else job.expires_at end);
end $$;

create or replace function app_public.issue_account_export_download(p_job_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); job app_private.account_export_jobs%rowtype; handoff app_private.account_export_download_handoffs%rowtype;
begin
  if actor is null or not app_private.current_session_recent_auth(interval '10 minutes') then
    raise exception using errcode='42501',message='recent_auth_required';
  end if;
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and user_id=actor for update;
  if not found or job.state<>'ready' or job.expires_at<=statement_timestamp() or job.archive_deleted_at is not null then
    raise exception using errcode='P0002',message='account_export_unavailable';
  end if;
  update app_private.account_export_download_handoffs set consumed_at=statement_timestamp()
    where export_job_id=p_job_id and user_id=actor and consumed_at is null;
  insert into app_private.account_export_download_handoffs(export_job_id,user_id)
    values(p_job_id,actor) returning * into handoff;
  return jsonb_build_object('handoffId',handoff.handoff_id,'expiresAt',handoff.expires_at);
end $$;

create or replace function app_public.request_account_deletion()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); deletion app_private.account_deletion_requests%rowtype;
begin
  if actor is null or not app_private.current_session_recent_auth(interval '10 minutes') then
    raise exception using errcode='42501',message='recent_auth_required';
  end if;
  perform 1 from app_private.profiles where user_id=actor and status='active' for update;
  if not found then raise exception using errcode='55000',message='account_lifecycle_unavailable'; end if;
  select * into deletion from app_private.account_deletion_requests where user_id=actor and state='scheduled' for update;
  if not found then
    insert into app_private.account_deletion_requests(user_id,due_at)
      values(actor,statement_timestamp()+interval '7 days') returning * into deletion;
  end if;
  update app_private.role_grants set state='revoked',revoked_by=actor,revoked_at=statement_timestamp(),
    revocation_reason='account_deletion_requested',version=version+1
    where subject_user_id=actor and state='active';
  update app_private.active_sessions set state='cancellation_only',version=version+1
    where user_id=actor and state='active';
  update app_private.profiles set status='deletion_scheduled',deletion_due_at=deletion.due_at,
    version=version+1,updated_at=statement_timestamp() where user_id=actor;
  return jsonb_build_object('state','deletion_scheduled','deletionDueAt',deletion.due_at);
end $$;

create or replace function app_public.cancel_account_deletion()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); session_id uuid:=app_private.claim_session_id(); deletion app_private.account_deletion_requests%rowtype;
begin
  if actor is null or not app_private.current_session_is_cancellation_only() then
    raise exception using errcode='42501',message='account_lifecycle_denied';
  end if;
  select * into deletion from app_private.account_deletion_requests
    where user_id=actor and state='scheduled' for update;
  if not found or deletion.due_at<=statement_timestamp() then raise exception using errcode='55000',message='account_deletion_complete'; end if;
  update app_private.account_deletion_requests set state='cancelled',cancelled_at=statement_timestamp(),version=version+1
    where deletion_request_id=deletion.deletion_request_id;
  update app_private.profiles set status='active',deletion_due_at=null,version=version+1,updated_at=statement_timestamp()
    where user_id=actor;
  -- Cancellation restores ordinary shopper access only. Any representative or
  -- administrator grants revoked by the deletion request remain revoked.
  insert into app_private.role_grants(subject_user_id,role,granted_by)
    select actor,'shopper',actor
    where not exists(select 1 from app_private.role_grants where subject_user_id=actor and role='shopper' and state='active');
  update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),revocation_reason='deletion_cancelled_other_session',version=version+1
    where user_id=actor and state='cancellation_only' and active_sessions.session_id<>session_id;
  update app_private.active_sessions set state='active',version=version+1
    where user_id=actor and active_sessions.session_id=session_id and state='cancellation_only';
  return jsonb_build_object('state','active');
end $$;

create or replace function app_public.claim_account_exports(p_now timestamptz,p_limit integer default 10)
returns table(job_id uuid,claim_token uuid,object_key text) language sql volatile security definer set search_path='' as $$
  with candidates as (
    select j.export_job_id from app_private.account_export_jobs j
    where j.attempt_count<5 and (
      (j.state='queued' and (j.retry_at is null or j.retry_at<=p_now))
      or (j.state='building' and j.lease_expires_at<=p_now)
    ) order by j.requested_at for update skip locked limit greatest(0,least(p_limit,25))
  ), claimed as (
    update app_private.account_export_jobs j set state='building',claim_token=extensions.gen_random_uuid(),
      claimed_at=p_now,lease_expires_at=p_now+interval '5 minutes',attempt_count=j.attempt_count+1,retry_at=null
    from candidates c where j.export_job_id=c.export_job_id
    returning j.export_job_id,j.claim_token,j.user_id
  )
  select export_job_id,claimed.claim_token,
    'account-exports/'||claimed.user_id::text||'/'||export_job_id::text||'.json' from claimed;
$$;

create or replace function app_public.build_account_export(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; result jsonb;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  select jsonb_build_object(
    'schemaVersion',1,
    'generatedAt',job.requested_at,
    'profile',(select jsonb_build_object('displayName',p.public_display_name,'verifiedEmail',p.verified_email_snapshot,
      'status',p.status,'age18AttestedAt',p.age_18_attested_at,'lastAuthenticatedAt',p.last_authenticated_at)
      from app_private.profiles p where p.user_id=job.user_id),
    'shopper',jsonb_build_object(
      'savedStores',(select coalesce(jsonb_agg(jsonb_build_object('storeId',s.store_id,'slug',st.slug,'name',st.name,'savedAt',s.created_at) order by s.created_at),'[]')
        from shopper_private.saved_stores s join app_public.stores st on st.id=s.store_id where s.user_id=job.user_id),
      'memories',(select coalesce(jsonb_agg(jsonb_build_object('storeId',m.store_id,'rating',m.rating,'note',m.note,'lastVisitMonth',m.last_visit_month,'version',m.version) order by m.updated_at),'[]')
        from shopper_private.private_store_memories m where m.user_id=job.user_id),
      'catalogLastSeen',(select coalesce(jsonb_agg(jsonb_build_object('areaId',l.area_id,'slug',a.slug,'label',a.label,'seenAt',l.seen_at) order by l.seen_at),'[]')
        from shopper_private.catalog_last_seen l join app_public.catalog_areas a on a.id=l.area_id where l.user_id=job.user_id),
      'newDismissals',(select coalesce(jsonb_agg(jsonb_build_object('storeId',d.store_id,'slug',st.slug,'dismissedAt',d.dismissed_at) order by d.dismissed_at),'[]')
        from shopper_private.catalog_new_dismissals d join app_public.stores st on st.id=d.store_id where d.user_id=job.user_id),
      'corrections',(select coalesce(jsonb_agg(jsonb_build_object('id',r.report_id,'storeId',r.store_id,'type',r.correction_type,
        'description',r.description,'publicSourceUrl',r.public_source_url,'state',r.state,'createdAt',r.created_at,'updatedAt',r.updated_at) order by r.created_at),'[]')
        from shopper_private.store_correction_reports r where r.reporter_user_id=job.user_id)
    ),
    'candidate',jsonb_build_object(
      'links',(select coalesce(jsonb_agg(jsonb_build_object('id',c.candidate_id,'url',c.normalized_url,'title',c.title,'note',c.note,
        'extractionState',c.extraction_state,'version',c.version,'createdAt',c.created_at,'updatedAt',c.updated_at) order by c.created_at),'[]')
        from candidate_private.candidate_links c where c.owner_user_id=job.user_id),
      'shares',(select coalesce(jsonb_agg(jsonb_build_object('id',s.share_id,'direction',case when s.sender_id=job.user_id then 'sent' else 'received' end,
        'state',case when s.sender_id=job.user_id then s.sender_status else s.state end,'title',c.title,'expiresAt',s.expires_at,'createdAt',s.created_at) order by s.created_at),'[]')
        from candidate_private.candidate_shares s join candidate_private.candidate_links c on c.candidate_id=s.candidate_id
        where job.user_id in (s.sender_id,s.recipient_id)),
      'tripIdeas',(select coalesce(jsonb_agg(jsonb_build_object('id',i.idea_id,'sourceShareId',i.source_share_id,'title',i.title,
        'urlNote',i.url_note,'version',i.version,'createdAt',i.created_at,'updatedAt',i.updated_at) order by i.created_at),'[]')
        from candidate_private.trip_ideas i where i.owner_user_id=job.user_id),
      'blockedSenders',(select coalesce(jsonb_agg(jsonb_build_object('label','Blocked sender','blockedAt',b.created_at) order by b.created_at),'[]')
        from candidate_private.candidate_blocks b where b.blocker_id=job.user_id)
    )
  ) into result;
  return result::text;
end $$;

create or replace function app_public.complete_account_export(p_job_id uuid,p_claim_token uuid,p_object_key text,p_checksum bytea,p_bytes bigint,p_completed_at timestamptz)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id for update;
  if job.state='ready' and job.archive_object_key=p_object_key and job.archive_checksum=p_checksum and job.archive_bytes=p_bytes then
    return jsonb_build_object('id',job.export_job_id,'state',job.state);
  end if;
  if job.state<>'building' or job.claim_token<>p_claim_token or job.lease_expires_at<=p_completed_at
    or p_object_key!~('^account-exports/'||job.user_id::text||'/'||job.export_job_id::text||'\.json$')
    or octet_length(p_checksum)<>32 or p_bytes<2 then raise exception using errcode='42501',message='account_export_completion_invalid'; end if;
  update app_private.account_export_jobs set state='ready',completed_at=p_completed_at,expires_at=p_completed_at+interval '7 days',
    archive_object_key=p_object_key,archive_checksum=p_checksum,archive_bytes=p_bytes,claim_token=null,claimed_at=null,lease_expires_at=null,
    failure_code=null,version=version+1 where export_job_id=p_job_id returning * into job;
  return jsonb_build_object('id',job.export_job_id,'state',job.state);
end $$;

create or replace function app_public.fail_account_export(p_job_id uuid,p_claim_token uuid,p_now timestamptz,p_error_code text)
returns void language plpgsql volatile security definer set search_path='' as $$
declare attempts integer;
begin
  select attempt_count into attempts from app_private.account_export_jobs where export_job_id=p_job_id and state='building' and claim_token=p_claim_token for update;
  if not found then return; end if;
  update app_private.account_export_jobs set state=case when attempts>=5 then 'failed' else 'queued' end,
    retry_at=case when attempts>=5 then null else p_now+make_interval(mins=>least(60,power(2,attempts)::integer)) end,
    failure_code=case when p_error_code~'^[a-z][a-z0-9_]{1,63}$' then p_error_code else 'worker_failure' end,
    claim_token=null,claimed_at=null,lease_expires_at=null,version=version+1 where export_job_id=p_job_id;
end $$;

create or replace function app_public.expire_account_exports(p_now timestamptz,p_limit integer default 25)
returns table(job_id uuid,object_key text) language sql volatile security definer set search_path='' as $$
  with due as (
    select export_job_id from app_private.account_export_jobs where archive_deleted_at is null and archive_object_key is not null
      and ((state='ready' and expires_at<=p_now) or state='expired') order by expires_at for update skip locked limit greatest(0,least(p_limit,100))
  ), expired as (
    update app_private.account_export_jobs j set state='expired',claim_token=null,claimed_at=null,lease_expires_at=null,version=version+1
      from due where j.export_job_id=due.export_job_id returning j.export_job_id,j.archive_object_key
  ) select export_job_id,archive_object_key from expired;
$$;

create or replace function app_public.complete_account_export_expiry(p_job_id uuid,p_object_key text,p_completed_at timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  update app_private.account_export_jobs set archive_deleted_at=p_completed_at,version=version+1
    where export_job_id=p_job_id and state='expired' and archive_object_key=p_object_key and archive_deleted_at is null;
  if not found and not exists(select 1 from app_private.account_export_jobs where export_job_id=p_job_id and archive_deleted_at is not null) then
    raise exception using errcode='42501',message='account_export_expiry_invalid';
  end if;
end $$;

create or replace function app_public.consume_account_export_handoff(p_handoff_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare handoff app_private.account_export_download_handoffs%rowtype; job app_private.account_export_jobs%rowtype;
begin
  select * into handoff from app_private.account_export_download_handoffs where handoff_id=p_handoff_id for update;
  if not found or handoff.consumed_at is not null or handoff.expires_at<=statement_timestamp() then
    raise exception using errcode='42501',message='account_export_handoff_invalid';
  end if;
  select * into job from app_private.account_export_jobs where export_job_id=handoff.export_job_id and state='ready'
    and expires_at>statement_timestamp() and archive_deleted_at is null;
  if not found then raise exception using errcode='42501',message='account_export_handoff_invalid'; end if;
  update app_private.account_export_download_handoffs set consumed_at=statement_timestamp() where handoff_id=p_handoff_id;
  return jsonb_build_object('objectKey',job.archive_object_key,'checksum',encode(job.archive_checksum,'hex'),'bytes',job.archive_bytes);
end $$;

create or replace function app_public.claim_due_private_memory_purges(p_now timestamptz,p_limit integer default 25)
returns table(undo_token uuid,claim_token uuid) language sql volatile security definer set search_path='' as $$
  with due as (
    select d.undo_token from shopper_private.private_memory_deletions d where d.state='pending' and d.purge_due_at<=p_now
      and (d.retry_at is null or d.retry_at<=p_now) and (d.claim_token is null or d.lease_expires_at<=p_now)
      order by d.purge_due_at for update skip locked limit greatest(0,least(p_limit,100))
  ), claimed as (
    update shopper_private.private_memory_deletions d set claim_token=extensions.gen_random_uuid(),claimed_at=p_now,
      lease_expires_at=p_now+interval '5 minutes',attempt_count=d.attempt_count+1,retry_at=null from due where d.undo_token=due.undo_token
    returning d.undo_token,d.claim_token
  ) select * from claimed;
$$;

create or replace function app_public.complete_private_memory_purge(p_undo_token uuid,p_claim_token uuid,p_completed_at timestamptz)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare receipt uuid;
begin
  insert into shopper_private.private_memory_deletion_receipts(deleted_at,completed_at)
    select d.created_at,p_completed_at from shopper_private.private_memory_deletions d where d.undo_token=p_undo_token
      and d.state='pending' and d.claim_token=p_claim_token and d.lease_expires_at>=p_completed_at returning receipt_id into receipt;
  if receipt is null then
    if exists(select 1 from shopper_private.private_memory_deletions where undo_token=p_undo_token and state='purged') then
      return null;
    end if;
    raise exception using errcode='42501',message='private_memory_purge_claim_invalid';
  end if;
  update shopper_private.private_memory_deletions set rating=null,note=null,last_visit_month=null,state='purged',purged_at=p_completed_at,
    claim_token=null,claimed_at=null,lease_expires_at=null,retry_at=null where undo_token=p_undo_token;
  return receipt;
end $$;

create or replace function app_public.fail_private_memory_purge(p_undo_token uuid,p_claim_token uuid,p_now timestamptz)
returns void language sql volatile security definer set search_path='' as $$
  update shopper_private.private_memory_deletions set claim_token=null,claimed_at=null,lease_expires_at=null,
    retry_at=p_now+make_interval(mins=>least(60,power(2,attempt_count)::integer))
    where undo_token=p_undo_token and state='pending' and claim_token=p_claim_token;
$$;

create or replace function app_public.purge_due_catalog_dismissals(p_now timestamptz,p_limit integer default 100)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare removed integer;
begin
  with due as (select d.ctid from shopper_private.catalog_new_dismissals d where d.dismissed_at<=p_now-interval '30 days'
    order by d.dismissed_at for update skip locked limit greatest(0,least(p_limit,500)))
  delete from shopper_private.catalog_new_dismissals d using due where d.ctid=due.ctid;
  get diagnostics removed=row_count;
  delete from shopper_private.private_memory_deletion_receipts where expires_at<=p_now;
  return removed;
end $$;

alter function app_public.account_lifecycle_status() owner to identity_service;
alter function app_public.request_account_export() owner to identity_service;
alter function app_public.get_account_export_status(uuid) owner to identity_service;
alter function app_public.issue_account_export_download(uuid) owner to identity_service;
alter function app_public.request_account_deletion() owner to identity_service;
alter function app_public.cancel_account_deletion() owner to identity_service;
alter function app_public.claim_account_exports(timestamptz,integer) owner to identity_service;
alter function app_public.build_account_export(uuid,uuid) owner to identity_service;
alter function app_public.complete_account_export(uuid,uuid,text,bytea,bigint,timestamptz) owner to identity_service;
alter function app_public.fail_account_export(uuid,uuid,timestamptz,text) owner to identity_service;
alter function app_public.expire_account_exports(timestamptz,integer) owner to identity_service;
alter function app_public.complete_account_export_expiry(uuid,text,timestamptz) owner to identity_service;
alter function app_public.consume_account_export_handoff(uuid) owner to identity_service;
alter function app_public.claim_due_private_memory_purges(timestamptz,integer) owner to identity_service;
alter function app_public.complete_private_memory_purge(uuid,uuid,timestamptz) owner to identity_service;
alter function app_public.fail_private_memory_purge(uuid,uuid,timestamptz) owner to identity_service;
alter function app_public.purge_due_catalog_dismissals(timestamptz,integer) owner to identity_service;

revoke all on function app_public.account_lifecycle_status(),app_public.request_account_export(),
  app_public.get_account_export_status(uuid),app_public.issue_account_export_download(uuid),
  app_public.request_account_deletion(),app_public.cancel_account_deletion(),
  app_public.claim_account_exports(timestamptz,integer),app_public.build_account_export(uuid,uuid),
  app_public.complete_account_export(uuid,uuid,text,bytea,bigint,timestamptz),
  app_public.fail_account_export(uuid,uuid,timestamptz,text),app_public.expire_account_exports(timestamptz,integer),
  app_public.complete_account_export_expiry(uuid,text,timestamptz),app_public.consume_account_export_handoff(uuid),
  app_public.claim_due_private_memory_purges(timestamptz,integer),app_public.complete_private_memory_purge(uuid,uuid,timestamptz),
  app_public.fail_private_memory_purge(uuid,uuid,timestamptz),app_public.purge_due_catalog_dismissals(timestamptz,integer)
  from public,anon,authenticated,account_lifecycle_service;
grant execute on function app_public.account_lifecycle_status(),app_public.request_account_export(),
  app_public.get_account_export_status(uuid),app_public.issue_account_export_download(uuid),
  app_public.request_account_deletion(),app_public.cancel_account_deletion() to authenticated;
grant execute on function app_public.claim_account_exports(timestamptz,integer),app_public.build_account_export(uuid,uuid),
  app_public.complete_account_export(uuid,uuid,text,bytea,bigint,timestamptz),
  app_public.fail_account_export(uuid,uuid,timestamptz,text),app_public.expire_account_exports(timestamptz,integer),
  app_public.complete_account_export_expiry(uuid,text,timestamptz),app_public.consume_account_export_handoff(uuid),
  app_public.claim_due_private_memory_purges(timestamptz,integer),app_public.complete_private_memory_purge(uuid,uuid,timestamptz),
  app_public.fail_private_memory_purge(uuid,uuid,timestamptz),app_public.purge_due_catalog_dismissals(timestamptz,integer)
  to account_lifecycle_service;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
