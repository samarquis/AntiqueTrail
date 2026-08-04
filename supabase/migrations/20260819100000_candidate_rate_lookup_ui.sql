-- Candidate mechanical limits, exact provider identity lookup, and blocked-sender management.

grant identity_service to postgres;
grant create on schema candidate_private to identity_service;
grant create on schema app_public to identity_service;

create table candidate_private.candidate_rate_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  operation text not null check (operation in ('extract','share_send')),
  key_kind text not null check (key_kind in ('account','ip','account_host','recipient')),
  key_digest bytea not null check (octet_length(key_digest)=32),
  device_session_digest bytea not null check (octet_length(device_session_digest)=32),
  occurred_at timestamptz not null default statement_timestamp(),
  purge_after timestamptz not null default (statement_timestamp()+interval '90 days'),
  constraint candidate_rate_retention check (purge_after<=occurred_at+interval '90 days')
);
create index candidate_rate_window_idx on candidate_private.candidate_rate_events
  (operation,key_kind,key_digest,occurred_at desc);
create index candidate_rate_purge_idx on candidate_private.candidate_rate_events(purge_after);
alter table candidate_private.candidate_rate_events enable row level security;
alter table candidate_private.candidate_rate_events force row level security;
revoke all on candidate_private.candidate_rate_events from public,anon,authenticated;
grant select,insert,delete on candidate_private.candidate_rate_events to identity_service;
create policy identity_service_candidate_rate_events on candidate_private.candidate_rate_events
  for all to identity_service using (true) with check (true);

create table candidate_private.candidate_concurrency_leases (
  lease_id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation='extract'),
  device_session_digest bytea not null check (octet_length(device_session_digest)=32),
  acquired_at timestamptz not null default statement_timestamp(),
  lease_expires_at timestamptz not null,
  released_at timestamptz,
  purge_after timestamptz not null default (statement_timestamp()+interval '90 days'),
  constraint candidate_lease_bound check (lease_expires_at<=acquired_at+interval '30 seconds'),
  constraint candidate_lease_release_shape check (released_at is null or released_at>=acquired_at),
  constraint candidate_lease_retention check (purge_after<=acquired_at+interval '90 days')
);
create index candidate_active_lease_idx on candidate_private.candidate_concurrency_leases
  (actor_user_id,operation,lease_expires_at) where released_at is null;
alter table candidate_private.candidate_concurrency_leases enable row level security;
alter table candidate_private.candidate_concurrency_leases force row level security;
revoke all on candidate_private.candidate_concurrency_leases from public,anon,authenticated;
grant select,insert,update,delete on candidate_private.candidate_concurrency_leases to identity_service;
create policy identity_service_candidate_leases on candidate_private.candidate_concurrency_leases
  for all to identity_service using (true) with check (true);

create or replace function app_public.candidate_reserve_operation(
  p_operation text,p_subject_hmac bytea,p_ip_hmac bytea
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); now_at timestamptz:=statement_timestamp();
  session_value text:=auth.jwt()->>'session_id';
  session_digest bytea; account_digest bytea; account_subject_digest bytea;
  kinds text[]; digests bytea[]; limits integer[]; windows interval[];
  index_value integer; event_count bigint; oldest_event timestamptz;
  retry_seconds integer:=0; lease uuid; lock_value text;
begin
  if actor is null or not app_private.current_session_is_active() or nullif(session_value,'') is null
    or p_operation not in ('extract','share_send') or octet_length(p_subject_hmac)<>32
    or octet_length(p_ip_hmac)<>32 then
    raise exception using errcode='42501',message='candidate_rate_context_unavailable';
  end if;
  session_digest:=extensions.digest(convert_to('candidate-device:'||session_value,'UTF8'),'sha256');
  account_digest:=extensions.digest(convert_to('candidate-account:'||actor::text,'UTF8'),'sha256');
  account_subject_digest:=extensions.digest(account_digest||p_subject_hmac,'sha256');
  if p_operation='extract' then
    kinds:=array['account','ip','account_host'];
    digests:=array[account_digest,p_ip_hmac,account_subject_digest];
    limits:=array[10,30,5]; windows:=array[interval '1 hour',interval '1 hour',interval '1 hour'];
  else
    kinds:=array['account','recipient','ip'];
    digests:=array[account_digest,p_subject_hmac,p_ip_hmac];
    limits:=array[10,5,30]; windows:=array[interval '1 day',interval '1 day',interval '1 day'];
  end if;
  for lock_value in select distinct kinds[i]||':'||encode(digests[i],'hex')
    from generate_subscripts(kinds,1) i order by 1 loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_value,0));
  end loop;
  delete from candidate_private.candidate_rate_events where purge_after<=now_at;
  delete from candidate_private.candidate_concurrency_leases where purge_after<=now_at;
  for index_value in 1..array_length(kinds,1) loop
    select count(*),min(occurred_at) into event_count,oldest_event
      from candidate_private.candidate_rate_events
      where operation=p_operation and key_kind=kinds[index_value]
        and key_digest=digests[index_value] and occurred_at>now_at-windows[index_value];
    if event_count>=limits[index_value] then
      retry_seconds:=least(extract(epoch from windows[index_value])::integer,
        greatest(1,ceil(extract(epoch from (oldest_event+windows[index_value]-now_at)))::integer));
      return jsonb_build_object('allowed',false,'leaseId',null,'retryAfter',retry_seconds);
    end if;
  end loop;
  if p_operation='extract' then
    if (select count(*) from candidate_private.candidate_concurrency_leases
      where actor_user_id=actor and operation='extract' and released_at is null
        and lease_expires_at>now_at)>=2 then
      return jsonb_build_object('allowed',false,'leaseId',null,'retryAfter',5);
    end if;
    insert into candidate_private.candidate_concurrency_leases(
      actor_user_id,operation,device_session_digest,lease_expires_at
    ) values (actor,'extract',session_digest,now_at+interval '30 seconds') returning lease_id into lease;
  end if;
  for index_value in 1..array_length(kinds,1) loop
    insert into candidate_private.candidate_rate_events(
      operation,key_kind,key_digest,device_session_digest
    ) values (p_operation,kinds[index_value],digests[index_value],session_digest);
  end loop;
  return jsonb_build_object('allowed',true,'leaseId',lease,'retryAfter',0);
end
$$;

create or replace function app_public.candidate_release_operation(p_lease_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  update candidate_private.candidate_concurrency_leases set released_at=statement_timestamp()
    where lease_id=p_lease_id and actor_user_id=actor and operation='extract' and released_at is null;
end
$$;

create or replace function candidate_private.exact_verified_auth_user_by_email(
  p_normalized_email text
) returns uuid language sql stable security definer set search_path='' as $$
  select case when count(*)=1 then (array_agg(u.id order by u.id))[1] else null end
  from auth.users u
  where u.email=p_normalized_email and u.email_confirmed_at is not null
$$;
alter function candidate_private.exact_verified_auth_user_by_email(text) owner to postgres;
revoke all on function candidate_private.exact_verified_auth_user_by_email(text) from public,anon,authenticated,identity_service,service_role;

create or replace function app_public.candidate_edge_exact_recipient(
  p_normalized_email text,p_recipient_email_hmac bytea
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare recipient uuid;
begin
  if p_normalized_email is null or p_normalized_email<>lower(btrim(p_normalized_email))
    or char_length(p_normalized_email)>320 or p_normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    or octet_length(p_recipient_email_hmac)<>32 then
    raise exception using errcode='22023',message='candidate_recipient_input_invalid';
  end if;
  recipient:=candidate_private.exact_verified_auth_user_by_email(p_normalized_email);
  return jsonb_build_object('recipientId',recipient,
    'recipientDigest',encode(p_recipient_email_hmac,'hex'));
end
$$;
alter function app_public.candidate_edge_exact_recipient(text,bytea) owner to postgres;
revoke all on function app_public.candidate_edge_exact_recipient(text,bytea) from public,anon,authenticated,identity_service;
grant execute on function app_public.candidate_edge_exact_recipient(text,bytea) to service_role;

create or replace function app_public.candidate_list_blocked_senders()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('blockedUserId',blocked_user_id,
    'label','Blocked sender','blockedAt',(extract(epoch from created_at)*1000)::bigint)
    order by created_at desc),'[]'::jsonb)
  from candidate_private.candidate_blocks
  where blocker_id=auth.uid() and app_private.current_session_is_active()
$$;

create or replace function app_public.candidate_edge_send_share(
  p_candidate_id uuid,p_recipient_id uuid,p_recipient_email_hmac bytea,
  p_encrypted_payload bytea,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); share_row candidate_private.candidate_shares%rowtype;
begin
  if actor is null or not app_private.current_session_is_active()
    or octet_length(p_recipient_email_hmac)<>32 or octet_length(p_encrypted_payload)<1
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='candidate_share_input_invalid';
  end if;
  select s.* into share_row from candidate_private.candidate_share_actions a
    join candidate_private.candidate_shares s on s.share_id=a.share_id
    where a.actor_user_id=actor and a.idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('accepted',false,'state',share_row.state,'message','Pending'); end if;
  if not exists(select 1 from candidate_private.candidate_links
    where candidate_id=p_candidate_id and owner_user_id=actor) then
    raise exception using errcode='55000',message='candidate_not_available';
  end if;
  if p_recipient_id is null or exists(select 1 from candidate_private.candidate_blocks
    where blocker_id=p_recipient_id and blocked_user_id=actor) then
    return jsonb_build_object('accepted',false,'state','pending','message','Pending');
  end if;
  insert into candidate_private.candidate_shares(candidate_id,sender_id,recipient_id,recipient_email_hmac)
    values(p_candidate_id,actor,p_recipient_id,p_recipient_email_hmac) returning * into share_row;
  insert into candidate_private.candidate_share_payloads(share_id,encrypted_payload)
    values(share_row.share_id,p_encrypted_payload);
  insert into candidate_private.candidate_share_actions(
    share_id,actor_user_id,action,idempotency_key,from_state,to_state
  ) values (share_row.share_id,actor,'send',p_idempotency_key,'pending','pending');
  return jsonb_build_object('accepted',false,'state','pending','message','Pending');
end
$$;

alter function app_public.candidate_reserve_operation(text,bytea,bytea) owner to identity_service;
alter function app_public.candidate_release_operation(uuid) owner to identity_service;
alter function app_public.candidate_list_blocked_senders() owner to identity_service;
alter function app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text) owner to identity_service;
revoke all on function app_public.candidate_reserve_operation(text,bytea,bytea),
  app_public.candidate_release_operation(uuid),app_public.candidate_list_blocked_senders()
  from public,anon;
grant execute on function app_public.candidate_reserve_operation(text,bytea,bytea),
  app_public.candidate_release_operation(uuid),app_public.candidate_list_blocked_senders()
  to authenticated;

revoke create on schema candidate_private from identity_service;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
