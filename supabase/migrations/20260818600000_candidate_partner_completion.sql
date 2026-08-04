-- Complete Package 4 server commands and an explicitly synthetic Package 6 path.
-- Real provider verification remains outside these functions and fails closed.

grant identity_service to postgres;
grant create on schema candidate_private to identity_service;
grant create on schema app_public to identity_service;

create table candidate_private.candidate_lifecycle_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  subject_kind text not null check (subject_kind='trip_idea'),
  action text not null check (action='deleted'),
  subject_digest bytea not null check (octet_length(subject_digest)=32),
  occurred_at timestamptz not null default statement_timestamp()
);
alter table candidate_private.candidate_lifecycle_receipts enable row level security;
alter table candidate_private.candidate_lifecycle_receipts force row level security;
revoke all on candidate_private.candidate_lifecycle_receipts from public,anon,authenticated;
grant select,insert on candidate_private.candidate_lifecycle_receipts to identity_service;
create policy identity_service_candidate_lifecycle on candidate_private.candidate_lifecycle_receipts
  for all to identity_service using (true) with check (true);
create trigger candidate_lifecycle_append_only before update or delete
  on candidate_private.candidate_lifecycle_receipts for each row
  execute function candidate_private.reject_append_only_mutation();

revoke execute on function app_public.candidate_delete_trip_idea(uuid) from authenticated;
create or replace function app_public.candidate_delete_trip_idea(p_idea_id uuid,p_confirmed boolean)
returns void language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  if p_confirmed is not true then raise exception using errcode='22023',message='candidate_confirmation_required'; end if;
  delete from candidate_private.trip_ideas where idea_id=p_idea_id and owner_user_id=actor;
  if not found then raise exception using errcode='55000',message='candidate_idea_unavailable'; end if;
  insert into candidate_private.candidate_lifecycle_receipts(actor_user_id,subject_kind,action,subject_digest)
    values(actor,'trip_idea','deleted',extensions.digest(convert_to(p_idea_id::text,'UTF8'),'sha256'));
end
$$;

alter table candidate_private.candidate_cleanup_jobs drop constraint candidate_cleanup_jobs_terminal_reason_check;
alter table candidate_private.candidate_cleanup_jobs add constraint candidate_cleanup_jobs_terminal_reason_check
  check (terminal_reason in ('revoked','dismissed','expired','blocked','reported'));
create or replace function candidate_private.enqueue_terminal_cleanup()
returns trigger language plpgsql security definer set search_path='' as $$
declare keys text[];
begin
  if old.state='pending' and new.state='closed'
    and new.close_reason in ('revoked','dismissed','expired','blocked','reported') then
    select coalesce(array_agg(object_key order by object_key),array[]::text[]) into keys
      from candidate_private.candidate_share_storage_objects where share_id=new.share_id;
    insert into candidate_private.candidate_cleanup_jobs(share_id,terminal_reason,terminal_at,cleanup_due_at,storage_keys)
      values(new.share_id,new.close_reason,new.closed_at,new.closed_at,keys) on conflict(share_id) do nothing;
  end if;
  return new;
end
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
  if not exists(select 1 from candidate_private.candidate_links where candidate_id=p_candidate_id and owner_user_id=actor) then
    raise exception using errcode='55000',message='candidate_not_available';
  end if;
  insert into candidate_private.candidate_shares(candidate_id,sender_id,recipient_id,recipient_email_hmac)
    values(p_candidate_id,actor,p_recipient_id,p_recipient_email_hmac) returning * into share_row;
  insert into candidate_private.candidate_share_payloads(share_id,encrypted_payload)
    values(share_row.share_id,p_encrypted_payload);
  insert into candidate_private.candidate_share_actions(share_id,actor_user_id,action,idempotency_key,from_state,to_state)
    values(share_row.share_id,actor,'send',p_idempotency_key,'pending','pending');
  return jsonb_build_object('accepted',false,'state','pending','message','Pending');
end
$$;

create or replace function app_public.candidate_edge_share_source(p_candidate_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('title',title,'urlNote',concat_ws(E'\n',normalized_url,note))
  from candidate_private.candidate_links where candidate_id=p_candidate_id and owner_user_id=auth.uid()
    and app_private.current_session_is_active()
$$;

create or replace function app_public.candidate_edge_payload(p_share_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select encode(p.encrypted_payload,'base64') from candidate_private.candidate_share_payloads p
    join candidate_private.candidate_shares s on s.share_id=p.share_id
  where p.share_id=p_share_id and s.recipient_id=auth.uid() and s.state='pending'
    and s.expires_at>statement_timestamp() and app_private.current_session_is_active()
$$;

create or replace function app_public.candidate_edge_accept_share(
  p_share_id uuid,p_title text,p_url_note text,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); share_row candidate_private.candidate_shares%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() or nullif(btrim(p_title),'') is null
    or char_length(p_title)>160 or char_length(coalesce(p_url_note,''))>4096
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='candidate_accept_input_invalid';
  end if;
  if exists(select 1 from candidate_private.candidate_share_actions where share_id=p_share_id
    and actor_user_id=actor and action='accept' and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('accepted',true,'state','accepted','message','Accepted');
  end if;
  select * into share_row from candidate_private.candidate_shares where share_id=p_share_id for update;
  if share_row.recipient_id is distinct from actor or share_row.state<>'pending' or share_row.expires_at<=statement_timestamp() then
    raise exception using errcode='55000',message='candidate_share_unavailable';
  end if;
  insert into candidate_private.trip_ideas(owner_user_id,source_share_id,title,url_note)
    values(actor,p_share_id,btrim(p_title),nullif(p_url_note,'')) on conflict(source_share_id) do nothing;
  update candidate_private.candidate_shares set state='accepted',accepted_at=statement_timestamp(),version=version+1,
    updated_at=statement_timestamp() where share_id=p_share_id;
  insert into candidate_private.candidate_share_actions(share_id,actor_user_id,action,idempotency_key,from_state,to_state)
    values(p_share_id,actor,'accept',p_idempotency_key,'pending','accepted') on conflict(actor_user_id,idempotency_key) do nothing;
  return jsonb_build_object('accepted',true,'state','accepted','message','Accepted');
end
$$;

create or replace function app_public.candidate_edge_close_share(
  p_share_id uuid,p_action text,p_reporter_hmac bytea,p_reported_hmac bytea,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); share_row candidate_private.candidate_shares%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() or p_action not in ('block','report')
    or octet_length(p_reporter_hmac)<>32 or octet_length(p_reported_hmac)<>32
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='candidate_close_input_invalid';
  end if;
  if exists(select 1 from candidate_private.candidate_share_actions where share_id=p_share_id
    and actor_user_id=actor and action=p_action and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('accepted',false,'state','closed','message','Closed');
  end if;
  select * into share_row from candidate_private.candidate_shares where share_id=p_share_id for update;
  if share_row.recipient_id is distinct from actor or share_row.state<>'pending' then
    raise exception using errcode='55000',message='candidate_share_unavailable';
  end if;
  if p_action='block' then
    insert into candidate_private.candidate_blocks(blocker_id,blocked_user_id)
      values(actor,share_row.sender_id) on conflict do nothing;
  else
    insert into candidate_private.candidate_abuse_cases(reporter_subject_hmac,reported_subject_hmac,reason)
      values(p_reporter_hmac,p_reported_hmac,'unsafe_content');
  end if;
  update candidate_private.candidate_shares set state='closed',close_reason=case when p_action='block' then 'blocked' else 'reported' end,
    closed_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp() where share_id=p_share_id;
  insert into candidate_private.candidate_share_actions(share_id,actor_user_id,action,idempotency_key,from_state,to_state)
    values(p_share_id,actor,p_action,p_idempotency_key,'pending','closed') on conflict(actor_user_id,idempotency_key) do nothing;
  return jsonb_build_object('accepted',false,'state','closed','message','Closed');
end
$$;

create or replace function app_public.partner_synthetic_command(p_operation text,p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); token text:=p_payload->>'token'; identity_input jsonb:=p_payload->'identity';
  invitation_id uuid; pending_id uuid; consent_id uuid; identity_row partner_private.pending_partner_identities%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() or p_payload->>'synthetic' is distinct from 'true' then
    raise exception using errcode='42501',message='partner_synthetic_denied';
  end if;
  if p_operation='exchange_invitation' then
    if token !~ '^synthetic-[A-Za-z0-9._:-]{8,128}$' then raise exception using errcode='22023',message='partner_synthetic_token_invalid'; end if;
    return jsonb_build_object('state','active','maskedRecipient','Synthetic test identity');
  elsif p_operation='accept_consent' then
    if token !~ '^synthetic-[A-Za-z0-9._:-]{8,128}$' or jsonb_typeof(identity_input)<>'object'
      or not coalesce((p_payload->'acknowledgements'->>'authority')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'voluntary')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'permittedData')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'noPayment')::boolean,false)
      or not coalesce((p_payload->'acknowledgements'->>'withdrawal')::boolean,false) then
      raise exception using errcode='22023',message='partner_synthetic_consent_invalid';
    end if;
    insert into partner_private.partner_invitations(token_hash,recipient_email_hmac,created_by,state,consumed_at)
      values(extensions.digest(convert_to(token,'UTF8'),'sha256'),extensions.digest(convert_to(lower(identity_input->>'email'),'UTF8'),'sha256'),
        actor,'consumed',statement_timestamp()) returning partner_invitations.invitation_id into invitation_id;
    insert into partner_private.pending_partner_identities(invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
      values(invitation_id,extensions.digest(convert_to(lower(identity_input->>'email'),'UTF8'),'sha256'),actor,'bound',
        statement_timestamp(),statement_timestamp(),statement_timestamp()) returning pending_identity_id into pending_id;
    insert into partner_private.provisional_partner_consents(invitation_id,pending_identity_id,policy_version,typed_name,business_title,
      store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
      values(invitation_id,pending_id,'synthetic-v1',btrim(identity_input->>'name'),btrim(identity_input->>'title'),btrim(identity_input->>'store'),
        extensions.digest(convert_to(lower(identity_input->>'email'),'UTF8'),'sha256'),true,true,true,true,true,'synthetic-'||invitation_id)
      returning provisional_consent_id into consent_id;
    insert into partner_private.pilot_consent_receipts(provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,
      verified_email_hmac,policy_version,receipt_checksum)
      values(consent_id,pending_id,invitation_id,actor,extensions.digest(convert_to(lower(identity_input->>'email'),'UTF8'),'sha256'),
        'synthetic-v1',extensions.digest(convert_to(consent_id::text,'UTF8'),'sha256'));
  elsif p_operation='bind_identity' then
    select * into identity_row from partner_private.pending_partner_identities where auth_user_id=actor and state='bound';
    if not found then raise exception using errcode='55000',message='partner_identity_unavailable'; end if;
  elsif p_operation in ('submit_authority_signal','request_authority_recheck') then
    -- Synthetic submissions never self-verify or grant scope.
    return app_public.partner_safe_command('get_claim_status','{}'::jsonb);
  else raise exception using errcode='22023',message='partner_synthetic_operation_denied'; end if;
  return jsonb_build_object('invitation','consumed','pendingIdentity','bound','onboarding','draft');
end
$$;

alter function app_public.candidate_delete_trip_idea(uuid,boolean) owner to identity_service;
alter function candidate_private.enqueue_terminal_cleanup() owner to identity_service;
alter function app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text) owner to identity_service;
alter function app_public.candidate_edge_share_source(uuid) owner to identity_service;
alter function app_public.candidate_edge_payload(uuid) owner to identity_service;
alter function app_public.candidate_edge_accept_share(uuid,text,text,text) owner to identity_service;
alter function app_public.candidate_edge_close_share(uuid,text,bytea,bytea,text) owner to identity_service;
alter function app_public.partner_synthetic_command(text,jsonb) owner to identity_service;
revoke all on function app_public.candidate_delete_trip_idea(uuid,boolean),
 app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text),app_public.candidate_edge_accept_share(uuid,text,text,text),
 app_public.candidate_edge_share_source(uuid),app_public.candidate_edge_payload(uuid),app_public.candidate_edge_close_share(uuid,text,bytea,bytea,text),app_public.partner_synthetic_command(text,jsonb) from public,anon;
grant execute on function app_public.candidate_delete_trip_idea(uuid,boolean),
 app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text),app_public.candidate_edge_accept_share(uuid,text,text,text),
 app_public.candidate_edge_share_source(uuid),app_public.candidate_edge_payload(uuid),app_public.candidate_edge_close_share(uuid,text,bytea,bytea,text),app_public.partner_synthetic_command(text,jsonb) to authenticated;
revoke create on schema candidate_private from identity_service;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
