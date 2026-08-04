-- Durable candidate Storage cleanup queue and canonical community route guard.

do $$
begin
  if not exists(select 1 from pg_roles where rolname='candidate_cleanup_service') then
    create role candidate_cleanup_service nologin noinherit nosuperuser nobypassrls;
  end if;
end
$$;

grant identity_service to postgres;
grant create on schema candidate_private to identity_service;
grant usage on schema candidate_private to candidate_cleanup_service;
grant community_automation to postgres;
grant create on schema community_private to community_automation;
alter function community_private.assert_action_receipt(uuid,text,uuid,text,bytea,bytea,text[]) owner to postgres;

create table candidate_private.candidate_share_storage_objects (
  share_id uuid not null references candidate_private.candidate_shares(share_id) on delete cascade,
  object_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key(share_id,object_key),
  constraint candidate_storage_object_key_safe check (
    object_key ~ '^candidate/[0-9a-f-]{36}/[^\\]+$'
    and object_key not like '%..%'
    and object_key not like '/%'
  )
);

create table candidate_private.candidate_cleanup_jobs (
  share_id uuid primary key references candidate_private.candidate_shares(share_id) on delete restrict,
  terminal_reason text not null check (terminal_reason in ('revoked','dismissed','expired')),
  terminal_at timestamptz not null,
  cleanup_due_at timestamptz not null,
  storage_keys text[] not null,
  state text not null default 'pending' check (state in ('pending','claimed','completed')),
  claim_token uuid,
  claimed_until timestamptz,
  attempt_count integer not null default 0 check (attempt_count>=0),
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint candidate_cleanup_deadline check (
    cleanup_due_at>=terminal_at and cleanup_due_at<=terminal_at+interval '24 hours'
  ),
  constraint candidate_cleanup_state_shape check (
    (state='pending' and claim_token is null and claimed_until is null and completed_at is null)
    or (state='claimed' and claim_token is not null and claimed_until is not null and completed_at is null)
    or (state='completed' and claim_token is not null and claimed_until is not null and completed_at is not null)
  )
);
create index candidate_cleanup_due_idx
  on candidate_private.candidate_cleanup_jobs(cleanup_due_at,share_id) where state<>'completed';

create table candidate_private.candidate_storage_deletion_receipts (
  receipt_id uuid primary key,
  share_id uuid not null unique references candidate_private.candidate_cleanup_jobs(share_id) on delete restrict,
  claim_token uuid not null,
  storage_keys_digest bytea not null check (octet_length(storage_keys_digest)=32),
  provider_receipt text not null unique,
  deleted_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint candidate_provider_receipt_safe check (
    provider_receipt=btrim(provider_receipt)
    and char_length(provider_receipt) between 1 and 500
    and provider_receipt !~ '[[:cntrl:]]'
  )
);

alter table candidate_private.candidate_share_storage_objects enable row level security;
alter table candidate_private.candidate_share_storage_objects force row level security;
alter table candidate_private.candidate_cleanup_jobs enable row level security;
alter table candidate_private.candidate_cleanup_jobs force row level security;
alter table candidate_private.candidate_storage_deletion_receipts enable row level security;
alter table candidate_private.candidate_storage_deletion_receipts force row level security;
create policy candidate_identity_storage_objects on candidate_private.candidate_share_storage_objects
  for all to identity_service using (true) with check (true);
create policy candidate_identity_cleanup_jobs on candidate_private.candidate_cleanup_jobs
  for all to identity_service using (true) with check (true);
create policy candidate_identity_cleanup_receipts on candidate_private.candidate_storage_deletion_receipts
  for all to identity_service using (true) with check (true);
grant select,insert,delete on candidate_private.candidate_share_storage_objects to identity_service;
grant select,insert,update on candidate_private.candidate_cleanup_jobs to identity_service;
grant select,insert on candidate_private.candidate_storage_deletion_receipts to identity_service;

create or replace function candidate_private.guard_candidate_storage_object()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.object_key not like 'candidate/'||new.share_id::text||'/%'
    or new.object_key like '%..%' or new.object_key like '%\\%' then
    raise exception using errcode='23514', message='candidate_storage_object_binding_invalid';
  end if;
  return new;
end
$$;
create trigger candidate_storage_object_binding_guard
before insert or update on candidate_private.candidate_share_storage_objects
for each row execute function candidate_private.guard_candidate_storage_object();

create trigger candidate_storage_receipts_append_only
before update or delete on candidate_private.candidate_storage_deletion_receipts
for each row execute function candidate_private.reject_append_only_mutation();

create or replace function candidate_private.remove_terminal_share_payload()
returns trigger language plpgsql set search_path='' as $$
begin
  -- Accepted shares are copied into recipient-owned Trip Ideas before this
  -- transition. Closed payloads remain until a Storage receipt is recorded.
  if old.state='pending' and new.state='accepted' then
    delete from candidate_private.candidate_share_payloads where share_id=new.share_id;
  end if;
  return new;
end
$$;

create or replace function candidate_private.enqueue_terminal_cleanup()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  keys text[];
begin
  if old.state='pending' and new.state='closed'
    and new.close_reason in ('revoked','dismissed','expired') then
    select coalesce(array_agg(object_key order by object_key),array[]::text[])
      into keys from candidate_private.candidate_share_storage_objects where share_id=new.share_id;
    insert into candidate_private.candidate_cleanup_jobs(
      share_id,terminal_reason,terminal_at,cleanup_due_at,storage_keys
    ) values (new.share_id,new.close_reason,new.closed_at,new.closed_at,keys)
    on conflict(share_id) do nothing;
  end if;
  return new;
end
$$;
create trigger candidate_share_cleanup_enqueue
after update of state on candidate_private.candidate_shares
for each row execute function candidate_private.enqueue_terminal_cleanup();

create or replace function candidate_private.claim_candidate_cleanup(
  p_now timestamptz,
  p_limit integer
)
returns table(share_id uuid,claim_token uuid,storage_keys text[])
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_now is null or p_limit is null or p_limit<1 or p_limit>500 then
    raise exception using errcode='22023', message='candidate_cleanup_claim_invalid';
  end if;
  return query
  with due as (
    select job.share_id
    from candidate_private.candidate_cleanup_jobs job
    where job.cleanup_due_at<=p_now
      and (job.state='pending' or (job.state='claimed' and job.claimed_until<=p_now))
    order by job.cleanup_due_at,job.share_id
    limit p_limit for update skip locked
  ), claimed as (
    update candidate_private.candidate_cleanup_jobs job
      set state='claimed',claim_token=extensions.gen_random_uuid(),
        claimed_until=p_now+interval '5 minutes',attempt_count=attempt_count+1,updated_at=statement_timestamp()
      from due where job.share_id=due.share_id
      returning job.share_id,job.claim_token,job.storage_keys
  ) select claimed.share_id,claimed.claim_token,claimed.storage_keys from claimed;
end
$$;

create or replace function candidate_private.complete_candidate_cleanup(
  p_share_id uuid,
  p_claim_token uuid,
  p_receipt_id uuid,
  p_provider_receipt text,
  p_storage_keys_digest bytea,
  p_completed_at timestamptz
)
returns void language plpgsql volatile security definer set search_path='' as $$
declare
  job candidate_private.candidate_cleanup_jobs%rowtype;
  expected_digest bytea;
begin
  if p_share_id is null or p_claim_token is null or p_receipt_id is null
    or p_provider_receipt is null or p_storage_keys_digest is null or p_completed_at is null
    or octet_length(p_storage_keys_digest)<>32 then
    raise exception using errcode='22023', message='candidate_cleanup_completion_invalid';
  end if;
  select * into strict job from candidate_private.candidate_cleanup_jobs
    where share_id=p_share_id for update;
  if job.state<>'claimed' or job.claim_token<>p_claim_token
    or job.claimed_until<p_completed_at or p_completed_at<job.terminal_at then
    raise exception using errcode='55000', message='candidate_cleanup_claim_not_current';
  end if;
  expected_digest:=extensions.digest(
    pg_catalog.convert_to(pg_catalog.array_to_string(job.storage_keys,E'\n'),'UTF8'),'sha256'
  );
  if expected_digest<>p_storage_keys_digest then
    raise exception using errcode='22023', message='candidate_cleanup_storage_binding_invalid';
  end if;
  insert into candidate_private.candidate_storage_deletion_receipts(
    receipt_id,share_id,claim_token,storage_keys_digest,provider_receipt,deleted_at
  ) values (p_receipt_id,p_share_id,p_claim_token,p_storage_keys_digest,p_provider_receipt,p_completed_at);
  delete from candidate_private.candidate_share_payloads where share_id=p_share_id;
  update candidate_private.candidate_cleanup_jobs
    set state='completed',completed_at=p_completed_at,updated_at=statement_timestamp()
    where share_id=p_share_id;
exception
  when no_data_found then
    raise exception using errcode='55000', message='candidate_cleanup_claim_not_current';
end
$$;

-- Canonical community evidence binds the approved area to the only supported
-- discovery surface; historical /areas/{slug} routes are not accepted.
create or replace function community_private.guard_canonical_community_route()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.receipt_kind in ('catalog_freeze','activation','rollback','reactivation')
    and new.predicates->>'canonical_route' is distinct from '/stores?area='||new.area_slug then
    raise exception using errcode='23514', message='community_canonical_route_invalid';
  end if;
  return new;
end
$$;
create trigger community_evidence_canonical_route_guard
before insert on community_private.community_evidence_receipts
for each row execute function community_private.guard_canonical_community_route();

create or replace function community_private.assert_action_receipt(
  p_receipt_id uuid,
  p_kind text,
  p_run_id uuid,
  p_area_slug text,
  p_artifact_digest bytea,
  p_store_digest bytea,
  p_required_predicates text[]
)
returns void language plpgsql stable security definer set search_path='' as $$
declare
  receipt community_private.community_evidence_receipts%rowtype;
  predicate_name text;
begin
  select * into receipt from community_private.community_evidence_receipts
    where receipt_id=p_receipt_id;
  if not found or not receipt.external_verified then
    raise exception using errcode='42501', message='community_receipt_not_verified';
  end if;
  if receipt.receipt_kind<>p_kind
    or receipt.responsibility<>'ProductOwner'
    or receipt.decision<>'pass'
    or receipt.bound_run_id is distinct from p_run_id
    or receipt.area_slug<>p_area_slug
    or receipt.artifact_binding_digest is distinct from p_artifact_digest
    or receipt.store_set_digest is distinct from p_store_digest
    or receipt.predicates->>'canonical_route' is distinct from '/stores?area='||p_area_slug then
    raise exception using errcode='22023', message='community_receipt_binding_invalid';
  end if;
  foreach predicate_name in array p_required_predicates loop
    if receipt.predicates->predicate_name is distinct from 'true'::jsonb then
      raise exception using errcode='42501', message='community_receipt_predicates_incomplete';
    end if;
  end loop;
  if exists(select 1 from community_private.community_command_receipts where action_receipt_id=p_receipt_id) then
    raise exception using errcode='22023', message='community_receipt_reused';
  end if;
end
$$;

alter function candidate_private.remove_terminal_share_payload() owner to identity_service;
alter function candidate_private.guard_candidate_storage_object() owner to identity_service;
alter function candidate_private.enqueue_terminal_cleanup() owner to identity_service;
alter function candidate_private.claim_candidate_cleanup(timestamptz,integer) owner to identity_service;
alter function candidate_private.complete_candidate_cleanup(uuid,uuid,uuid,text,bytea,timestamptz) owner to identity_service;
alter function community_private.guard_canonical_community_route() owner to community_automation;
alter function community_private.assert_action_receipt(uuid,text,uuid,text,bytea,bytea,text[]) owner to community_automation;
revoke all on function community_private.guard_canonical_community_route() from public,anon,authenticated;
revoke all on function candidate_private.claim_candidate_cleanup(timestamptz,integer) from public,anon,authenticated;
revoke all on function candidate_private.complete_candidate_cleanup(uuid,uuid,uuid,text,bytea,timestamptz) from public,anon,authenticated;
grant execute on function candidate_private.claim_candidate_cleanup(timestamptz,integer) to candidate_cleanup_service;
grant execute on function candidate_private.complete_candidate_cleanup(uuid,uuid,uuid,text,bytea,timestamptz) to candidate_cleanup_service;
revoke all on candidate_private.candidate_cleanup_jobs,candidate_private.candidate_storage_deletion_receipts
  from candidate_cleanup_service,public,anon,authenticated;
revoke create on schema candidate_private from identity_service;
revoke identity_service from postgres;
revoke create on schema community_private from community_automation;
revoke community_automation from postgres;
