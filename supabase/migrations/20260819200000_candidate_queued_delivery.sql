-- Durable Candidate Share admission and asynchronous recipient resolution/delivery.
-- The worker boundary is executable but this migration intentionally claims no deployed scheduler.

create table candidate_private.candidate_share_delivery_jobs (
  job_id uuid primary key default extensions.gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references candidate_private.candidate_links(candidate_id) on delete cascade,
  recipient_email_hmac bytea not null check (octet_length(recipient_email_hmac)=32),
  encrypted_recipient bytea check (encrypted_recipient is null or octet_length(encrypted_recipient)>12),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  state text not null default 'queued' check (state in ('queued','processing','retry','delivered','no_delivery','dead')),
  attempts smallint not null default 0 check (attempts between 0 and 5),
  available_at timestamptz not null default statement_timestamp(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  purge_after timestamptz not null default (statement_timestamp()+interval '7 days'),
  unique(sender_user_id,idempotency_key),
  constraint candidate_delivery_job_state_shape check (
    (state in ('queued','retry') and lease_owner is null and lease_expires_at is null and completed_at is null and encrypted_recipient is not null)
    or (state='processing' and lease_owner is not null and lease_expires_at is not null and completed_at is null and encrypted_recipient is not null)
    or (state in ('delivered','no_delivery','dead') and lease_owner is null and lease_expires_at is null and completed_at is not null and encrypted_recipient is null)
  ),
  constraint candidate_delivery_job_lease_bound check (
    lease_expires_at is null or lease_expires_at<=updated_at+interval '30 seconds'
  ),
  constraint candidate_delivery_job_retention check (purge_after<=created_at+interval '7 days')
);
create index candidate_delivery_claim_idx on candidate_private.candidate_share_delivery_jobs
  (state,available_at,created_at) where state in ('queued','retry','processing');
alter table candidate_private.candidate_share_delivery_jobs enable row level security;
alter table candidate_private.candidate_share_delivery_jobs force row level security;
revoke all on candidate_private.candidate_share_delivery_jobs from public,anon,authenticated,identity_service,service_role;

create table candidate_private.candidate_share_delivery_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null,
  attempt smallint not null check (attempt between 0 and 5),
  outcome text not null check (outcome in ('queued','claimed','retry','delivered','no_delivery','dead')),
  occurred_at timestamptz not null default statement_timestamp()
);
create index candidate_delivery_receipt_job_idx on candidate_private.candidate_share_delivery_receipts(job_id,occurred_at);
alter table candidate_private.candidate_share_delivery_receipts enable row level security;
alter table candidate_private.candidate_share_delivery_receipts force row level security;
revoke all on candidate_private.candidate_share_delivery_receipts from public,anon,authenticated,identity_service,service_role;
create trigger candidate_delivery_receipts_append_only before update or delete
  on candidate_private.candidate_share_delivery_receipts for each row
  execute function candidate_private.reject_append_only_mutation();

create or replace function app_public.candidate_enqueue_share_delivery(
  p_sender_user_id uuid,p_candidate_id uuid,p_recipient_email_hmac bytea,
  p_encrypted_recipient bytea,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare delivery candidate_private.candidate_share_delivery_jobs%rowtype;
begin
  if p_sender_user_id is null or octet_length(p_recipient_email_hmac)<>32
    or octet_length(p_encrypted_recipient)<=12
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not exists(select 1 from candidate_private.candidate_links
      where candidate_id=p_candidate_id and owner_user_id=p_sender_user_id) then
    raise exception using errcode='22023',message='candidate_delivery_input_invalid';
  end if;
  insert into candidate_private.candidate_share_delivery_jobs(
    sender_user_id,candidate_id,recipient_email_hmac,encrypted_recipient,idempotency_key
  ) values (
    p_sender_user_id,p_candidate_id,p_recipient_email_hmac,p_encrypted_recipient,p_idempotency_key
  ) on conflict(sender_user_id,idempotency_key) do nothing returning * into delivery;
  if found then
    insert into candidate_private.candidate_share_delivery_receipts(job_id,attempt,outcome)
      values(delivery.job_id,0,'queued');
  else
    select * into delivery from candidate_private.candidate_share_delivery_jobs
      where sender_user_id=p_sender_user_id and idempotency_key=p_idempotency_key;
  end if;
  return jsonb_build_object('queued',true);
end
$$;

create or replace function app_public.candidate_claim_share_delivery(p_worker_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare now_at timestamptz:=statement_timestamp(); delivery candidate_private.candidate_share_delivery_jobs%rowtype;
  candidate candidate_private.candidate_links%rowtype;
begin
  if p_worker_id is null then raise exception using errcode='22023',message='candidate_worker_invalid'; end if;
  insert into candidate_private.candidate_share_delivery_receipts(job_id,attempt,outcome)
    select job_id,attempts,'dead' from candidate_private.candidate_share_delivery_jobs
    where purge_after<=now_at and state not in ('delivered','no_delivery','dead');
  delete from candidate_private.candidate_share_delivery_jobs where purge_after<=now_at;
  select * into delivery from candidate_private.candidate_share_delivery_jobs
    where attempts<5 and (
      (state in ('queued','retry') and available_at<=now_at)
      or (state='processing' and lease_expires_at<=now_at)
    ) order by available_at,created_at for update skip locked limit 1;
  if not found then return null; end if;
  update candidate_private.candidate_share_delivery_jobs set state='processing',attempts=attempts+1,
    lease_owner=p_worker_id,lease_expires_at=now_at+interval '30 seconds',updated_at=now_at
    where job_id=delivery.job_id returning * into delivery;
  insert into candidate_private.candidate_share_delivery_receipts(job_id,attempt,outcome)
    values(delivery.job_id,delivery.attempts,'claimed');
  select * into candidate from candidate_private.candidate_links where candidate_id=delivery.candidate_id;
  return jsonb_build_object('jobId',delivery.job_id,'encryptedRecipient',encode(delivery.encrypted_recipient,'base64'),
    'recipientDigest',encode(delivery.recipient_email_hmac,'hex'),'title',candidate.title,
    'urlNote',concat_ws(E'\n',candidate.normalized_url,candidate.note));
end
$$;

create or replace function app_public.candidate_complete_share_delivery(
  p_job_id uuid,p_worker_id uuid,p_recipient_id uuid,p_encrypted_payload bytea
) returns void language plpgsql volatile security definer set search_path='' as $$
declare now_at timestamptz:=statement_timestamp(); delivery candidate_private.candidate_share_delivery_jobs%rowtype;
  share candidate_private.candidate_shares%rowtype; result text:='no_delivery';
begin
  select * into delivery from candidate_private.candidate_share_delivery_jobs
    where job_id=p_job_id and state='processing' and lease_owner=p_worker_id
      and lease_expires_at>now_at for update;
  if not found then raise exception using errcode='55000',message='candidate_delivery_unavailable'; end if;
  if p_recipient_id is not null and octet_length(p_encrypted_payload)>0
    and exists(select 1 from candidate_private.candidate_links
      where candidate_id=delivery.candidate_id and owner_user_id=delivery.sender_user_id)
    and not exists(select 1 from candidate_private.candidate_blocks
      where blocker_id=p_recipient_id and blocked_user_id=delivery.sender_user_id) then
    insert into candidate_private.candidate_shares(candidate_id,sender_id,recipient_id,recipient_email_hmac)
      values(delivery.candidate_id,delivery.sender_user_id,p_recipient_id,delivery.recipient_email_hmac)
      on conflict(sender_id,candidate_id,recipient_email_hmac) where state='pending' do nothing
      returning * into share;
    if not found then
      select * into share from candidate_private.candidate_shares where sender_id=delivery.sender_user_id
        and candidate_id=delivery.candidate_id and recipient_email_hmac=delivery.recipient_email_hmac
        and state='pending';
    end if;
    insert into candidate_private.candidate_share_payloads(share_id,encrypted_payload)
      values(share.share_id,p_encrypted_payload) on conflict(share_id) do nothing;
    insert into candidate_private.candidate_share_actions(
      share_id,actor_user_id,action,idempotency_key,from_state,to_state
    ) values (share.share_id,delivery.sender_user_id,'send',delivery.idempotency_key,'pending','pending')
      on conflict(actor_user_id,idempotency_key) do nothing;
    result:='delivered';
  end if;
  update candidate_private.candidate_share_delivery_jobs set state=result,encrypted_recipient=null,
    lease_owner=null,lease_expires_at=null,completed_at=now_at,updated_at=now_at where job_id=p_job_id;
  insert into candidate_private.candidate_share_delivery_receipts(job_id,attempt,outcome)
    values(p_job_id,delivery.attempts,result);
end
$$;

create or replace function app_public.candidate_fail_share_delivery(p_job_id uuid,p_worker_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare now_at timestamptz:=statement_timestamp(); delivery candidate_private.candidate_share_delivery_jobs%rowtype;
  next_state text;
begin
  select * into delivery from candidate_private.candidate_share_delivery_jobs
    where job_id=p_job_id and state='processing' and lease_owner=p_worker_id for update;
  if not found then return; end if;
  next_state:=case when delivery.attempts>=5 then 'dead' else 'retry' end;
  update candidate_private.candidate_share_delivery_jobs set state=next_state,lease_owner=null,
    lease_expires_at=null,available_at=now_at+make_interval(secs=>least(3600,(30*power(2,delivery.attempts))::integer)),
    encrypted_recipient=case when next_state='dead' then null else encrypted_recipient end,
    completed_at=case when next_state='dead' then now_at else null end,updated_at=now_at where job_id=p_job_id;
  insert into candidate_private.candidate_share_delivery_receipts(job_id,attempt,outcome)
    values(p_job_id,delivery.attempts,next_state);
end
$$;

alter function app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text) owner to postgres;
alter function app_public.candidate_claim_share_delivery(uuid) owner to postgres;
alter function app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea) owner to postgres;
alter function app_public.candidate_fail_share_delivery(uuid,uuid) owner to postgres;
revoke all on function app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text),
  app_public.candidate_claim_share_delivery(uuid),app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea),
  app_public.candidate_fail_share_delivery(uuid,uuid) from public,anon,authenticated,identity_service;
grant execute on function app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text),
  app_public.candidate_claim_share_delivery(uuid),app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea),
  app_public.candidate_fail_share_delivery(uuid,uuid) to service_role;

revoke execute on function app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text)
  from public,anon,authenticated,service_role;
