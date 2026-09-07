-- Issue 260: one-case independent break-glass packet review.
-- The capability is issued by the trusted reviewer service; browser roles can
-- only exchange it, present verifier output, and submit one decision receipt.

grant review_automation to postgres;

create table review_private.break_glass_cases (
  case_id uuid primary key default extensions.gen_random_uuid(),
  incident_id text not null unique check(incident_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  severity text not null check(severity in ('low','medium','high','critical')),
  requesting_actor text not null check(char_length(requesting_actor) between 1 and 160),
  approvals jsonb not null default '[]'::jsonb check(jsonb_typeof(approvals)='array'),
  reason text not null check(char_length(reason) between 1 and 2000),
  authorized_scope text not null check(char_length(authorized_scope) between 1 and 500),
  query_names text[] not null default '{}',
  record_counts bigint[] not null default '{}',
  access_started_at timestamptz not null,
  access_expires_at timestamptz not null,
  access_closed_at timestamptz,
  notice_status text not null check(notice_status in ('not_required','pending','sent','failed')),
  access_results jsonb not null default '[]'::jsonb check(jsonb_typeof(access_results)='array'),
  audit_chain_hash bytea not null check(octet_length(audit_chain_hash)=32),
  packet_hash bytea check(packet_hash is null or octet_length(packet_hash)=32),
  frozen_at timestamptz,
  review_due_at timestamptz,
  state text not null default 'open' check(state in ('open','closed','expired','review_pending','reviewed','disabled')),
  check(access_expires_at=access_started_at+interval '30 minutes'),
  check(access_closed_at is null or access_closed_at>=access_started_at),
  check(review_due_at is null or review_due_at<=access_expires_at+interval '24 hours'),
  check((state in ('review_pending','reviewed','disabled') and packet_hash is not null and frozen_at is not null and review_due_at is not null) or state in ('open','closed','expired'))
);

create table review_private.break_glass_review_capabilities (
  capability_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references review_private.break_glass_cases(case_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  token_hash bytea unique not null check(octet_length(token_hash)=32),
  issuance_idempotency_key uuid not null unique,
  expires_at timestamptz not null,
  state text not null default 'active' check(state in ('active','consumed','revoked','expired')),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at<=created_at+interval '24 hours'),
  check((state='active' and consumed_at is null and revoked_at is null) or (state='consumed' and consumed_at is not null) or (state in ('revoked','expired') and revoked_at is not null))
);

create table review_private.break_glass_review_challenges (
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  capability_id uuid not null references review_private.break_glass_review_capabilities(capability_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  idempotency_key uuid not null unique,
  challenge_nonce bytea not null unique check(octet_length(challenge_nonce)=32),
  challenge_digest bytea not null unique check(octet_length(challenge_digest)=32),
  rp_id text not null,
  expected_origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at<=created_at+interval '5 minutes')
);

create table review_private.break_glass_assertion_receipts (
  assertion_receipt_id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null unique references review_private.break_glass_review_challenges(challenge_id) on delete restrict,
  capability_id uuid not null references review_private.break_glass_review_capabilities(capability_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  credential_record_id uuid not null references review_private.reviewer_credentials(credential_record_id) on delete restrict,
  assertion_digest bytea not null unique check(octet_length(assertion_digest)=32),
  provider_verification_id text not null unique,
  verified_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '5 minutes',
  consumed_at timestamptz
);

create table review_private.break_glass_review_receipts (
  receipt_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references review_private.break_glass_cases(case_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  packet_hash bytea not null check(octet_length(packet_hash)=32),
  decision text not null check(decision in ('Compliant','Exception')),
  reason text not null check(char_length(reason) between 1 and 2000),
  follow_up_reference text not null check(char_length(follow_up_reference) between 1 and 200),
  reviewed_at timestamptz not null default statement_timestamp(),
  audit_event_id uuid not null,
  idempotency_key uuid not null unique
);

do $$ declare t text; begin
  foreach t in array array['break_glass_cases','break_glass_review_capabilities','break_glass_review_challenges','break_glass_assertion_receipts','break_glass_review_receipts'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy issue260_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;

create function review_private.issue_break_glass_review_capability(
  p_case_id uuid,p_reviewer_identity_id uuid,p_token_hash bytea,p_expires_at timestamptz,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior review_private.break_glass_review_capabilities%rowtype; cid uuid;
begin
  select * into prior from review_private.break_glass_review_capabilities where issuance_idempotency_key=p_idempotency_key;
  if found then return prior.capability_id; end if;
  if octet_length(p_token_hash)<>32
    or not exists(select 1 from review_private.break_glass_cases where case_id=p_case_id and state='review_pending' and packet_hash is not null and p_expires_at=review_due_at)
    or not exists(select 1 from review_private.reviewer_identities i join review_private.reviewer_verifier_config c on c.singleton and c.state='accepted' where i.reviewer_identity_id=p_reviewer_identity_id and i.state='active' and i.active_credential_count>=2 and i.relationship_ended_at is null) then
    raise exception using errcode='42501',message='break_glass_review_unavailable';
  end if;
  insert into review_private.break_glass_review_capabilities(case_id,reviewer_identity_id,token_hash,issuance_idempotency_key,expires_at)
    values(p_case_id,p_reviewer_identity_id,p_token_hash,p_idempotency_key,p_expires_at) returning capability_id into cid;
  return cid;
end $$;
alter function review_private.issue_break_glass_review_capability(uuid,uuid,bytea,timestamptz,uuid) owner to review_automation;
revoke all on function review_private.issue_break_glass_review_capability(uuid,uuid,bytea,timestamptz,uuid) from public,anon,authenticated;
grant execute on function review_private.issue_break_glass_review_capability(uuid,uuid,bytea,timestamptz,uuid) to review_credential_capability_service;

create function review_private.freeze_break_glass_packet(p_case_id uuid,p_closed_at timestamptz default statement_timestamp()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c review_private.break_glass_cases%rowtype; digest bytea; due timestamptz;
begin
  select * into c from review_private.break_glass_cases where case_id=p_case_id for update;
  if c.case_id is null then raise exception 'break_glass_case_missing'; end if;
  due:=least(coalesce(c.review_due_at,c.access_expires_at+interval '24 hours'),p_closed_at+interval '24 hours');
  digest:=extensions.digest(convert_to(concat_ws('|',c.case_id,c.incident_id,c.severity,c.requesting_actor,c.authorized_scope,c.access_started_at,c.access_expires_at,c.access_closed_at,c.notice_status,c.access_results,c.audit_chain_hash),'utf8'),'sha256');
  update review_private.break_glass_cases set access_closed_at=coalesce(access_closed_at,p_closed_at),packet_hash=digest,frozen_at=statement_timestamp(),review_due_at=due,state='review_pending' where case_id=c.case_id;
  return jsonb_build_object('caseId',c.case_id,'packetHash',encode(digest,'hex'),'reviewDueAt',due);
end $$;
alter function review_private.freeze_break_glass_packet(uuid,timestamptz) owner to review_automation;
revoke all on function review_private.freeze_break_glass_packet(uuid,timestamptz) from public,anon,authenticated;
grant execute on function review_private.freeze_break_glass_packet(uuid,timestamptz) to review_automation;

create function app_public.reviews_get_break_glass_packet(p_capability_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c review_private.break_glass_cases%rowtype; cap review_private.break_glass_review_capabilities%rowtype;
begin
  select * into cap from review_private.break_glass_review_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256');
  select * into c from review_private.break_glass_cases where case_id=cap.case_id;
  if cap.capability_id is null or cap.state<>'active' or cap.expires_at<=statement_timestamp() or c.state<>'review_pending' or c.review_due_at<=statement_timestamp() then raise exception using errcode='42501',message='break_glass_review_unavailable'; end if;
  return jsonb_build_object('incidentId',c.incident_id,'severity',c.severity,'requestingActor',c.requesting_actor,'approvals',c.approvals,'reason',c.reason,'authorizedScope',c.authorized_scope,'queries',c.query_names,'recordCounts',c.record_counts,'startedAt',c.access_started_at,'expiresAt',c.access_expires_at,'accessResults',c.access_results,'noticeStatus',c.notice_status,'auditChainHash',encode(c.audit_chain_hash,'hex'),'packetHash',encode(c.packet_hash,'hex'),'reviewDueAt',c.review_due_at);
end $$;
alter function app_public.reviews_get_break_glass_packet(text) owner to review_automation;
revoke all on function app_public.reviews_get_break_glass_packet(text) from public,authenticated;
grant execute on function app_public.reviews_get_break_glass_packet(text) to anon;

create function app_public.reviews_request_break_glass_assertion(p_capability_token text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cap review_private.break_glass_review_capabilities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; c review_private.break_glass_review_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32);
begin
  select * into cap from review_private.break_glass_review_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if cap.capability_id is null or cap.state<>'active' or cap.expires_at<=statement_timestamp() or cfg.singleton is null or not exists(select 1 from review_private.break_glass_cases where case_id=cap.case_id and state='review_pending' and review_due_at>statement_timestamp()) then raise exception using errcode='42501',message='break_glass_review_unavailable'; end if;
  select * into c from review_private.break_glass_review_challenges where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at); end if;
  insert into review_private.break_glass_review_challenges(capability_id,reviewer_identity_id,idempotency_key,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at)
    values(cap.capability_id,cap.reviewer_identity_id,p_idempotency_key,nonce,extensions.digest(nonce,'sha256'),cfg.rp_id,cfg.expected_origin,least(cap.expires_at,statement_timestamp()+interval '5 minutes')) returning * into c;
  return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at);
end $$;
alter function app_public.reviews_request_break_glass_assertion(text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_break_glass_assertion(text,uuid) from public,authenticated;
grant execute on function app_public.reviews_request_break_glass_assertion(text,uuid) to anon;

create function review_private.complete_break_glass_assertion(p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c review_private.break_glass_review_challenges%rowtype; cfg review_private.reviewer_verifier_config%rowtype; cred review_private.reviewer_credentials%rowtype; aid uuid;
begin
  select * into c from review_private.break_glass_review_challenges where challenge_id=p_challenge_id and consumed_at is null and expires_at>statement_timestamp() for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  select * into cred from review_private.reviewer_credentials where reviewer_identity_id=c.reviewer_identity_id and credential_id_digest=p_credential_id_digest and state='active' for update;
  if c.challenge_id is null or cfg.singleton is null or p_provider_key_id<>cfg.provider_key_id or cred.credential_record_id is null or p_sign_count<cred.sign_count then raise exception using errcode='42501',message='break_glass_review_unavailable'; end if;
  update review_private.reviewer_credentials set sign_count=p_sign_count where credential_record_id=cred.credential_record_id;
  update review_private.break_glass_review_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  insert into review_private.break_glass_assertion_receipts(challenge_id,capability_id,reviewer_identity_id,credential_record_id,assertion_digest,provider_verification_id,expires_at)
    values(c.challenge_id,c.capability_id,c.reviewer_identity_id,cred.credential_record_id,p_assertion_digest,p_provider_verification_id,least(c.expires_at,statement_timestamp()+interval '5 minutes')) returning assertion_receipt_id into aid;
  return jsonb_build_object('assertionReceiptId',aid,'expiresAt',statement_timestamp()+interval '5 minutes');
end $$;
alter function review_private.complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) owner to review_automation;
revoke all on function review_private.complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function review_private.complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function app_public.reviews_complete_break_glass_assertion(p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint) returns jsonb
language sql security definer set search_path='' as $$
  select review_private.complete_break_glass_assertion(p_challenge_id,p_credential_id_digest,p_assertion_digest,p_provider_verification_id,p_provider_key_id,p_sign_count)
$$;
alter function app_public.reviews_complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) owner to postgres;
revoke all on function app_public.reviews_complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function app_public.reviews_complete_break_glass_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function app_public.reviews_submit_break_glass_review(p_capability_token text,p_assertion_receipt_id uuid,p_packet_hash bytea,p_decision text,p_reason text,p_follow_up_reference text,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cap review_private.break_glass_review_capabilities%rowtype; c review_private.break_glass_cases%rowtype; a review_private.break_glass_assertion_receipts%rowtype; prior review_private.break_glass_review_receipts%rowtype; rid uuid; event_id uuid;
begin
  select * into cap from review_private.break_glass_review_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  select * into c from review_private.break_glass_cases where case_id=cap.case_id for update;
  select * into prior from review_private.break_glass_review_receipts where idempotency_key=p_idempotency_key;
  if found and prior.case_id=cap.case_id then return jsonb_build_object('receiptId',prior.receipt_id,'decision',prior.decision,'reviewedAt',prior.reviewed_at); end if;
  select * into a from review_private.break_glass_assertion_receipts where assertion_receipt_id=p_assertion_receipt_id and capability_id=cap.capability_id and consumed_at is null and expires_at>statement_timestamp();
  if cap.capability_id is null or cap.state<>'active' or c.state<>'review_pending' or c.review_due_at<=statement_timestamp() or c.packet_hash<>p_packet_hash or p_decision not in ('Compliant','Exception') or char_length(btrim(p_reason))<1 or char_length(btrim(p_follow_up_reference))<1 or a.assertion_receipt_id is null then raise exception using errcode='42501',message='break_glass_review_unavailable'; end if;
  event_id:=review_private.append_audit('break_glass_review_submitted',a.reviewer_identity_id,null,c.case_id,lower(p_decision),jsonb_build_object('packetHash',encode(p_packet_hash,'hex'),'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  insert into review_private.break_glass_review_receipts(case_id,reviewer_identity_id,packet_hash,decision,reason,follow_up_reference,audit_event_id,idempotency_key) values(c.case_id,a.reviewer_identity_id,p_packet_hash,p_decision,btrim(p_reason),btrim(p_follow_up_reference),event_id,p_idempotency_key) returning receipt_id into rid;
  update review_private.break_glass_review_capabilities set state='consumed',consumed_at=statement_timestamp() where capability_id=cap.capability_id;
  update review_private.break_glass_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=a.assertion_receipt_id;
  update review_private.break_glass_cases set state=case when p_decision='Exception' then 'disabled' else 'reviewed' end where case_id=c.case_id;
  return jsonb_build_object('receiptId',rid,'decision',p_decision,'reviewedAt',statement_timestamp());
end $$;
alter function app_public.reviews_submit_break_glass_review(text,uuid,bytea,text,text,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_submit_break_glass_review(text,uuid,bytea,text,text,text,uuid) from public,authenticated;
grant execute on function app_public.reviews_submit_break_glass_review(text,uuid,bytea,text,text,text,uuid) to anon;

create function review_private.watch_break_glass_review_deadlines(p_now timestamptz default statement_timestamp(),p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path='' as $$
declare frozen_count integer:=0; missing_count integer:=0; c review_private.break_glass_cases%rowtype;
begin
  for c in select * from review_private.break_glass_cases where state='review_pending' and review_due_at<=p_now order by review_due_at limit greatest(0,least(p_limit,500)) for update loop
    update review_private.break_glass_cases set state='disabled' where case_id=c.case_id;
    perform review_private.append_audit('break_glass_review_missing',null,null,c.case_id,'disabled',jsonb_build_object('reviewDueAt',c.review_due_at,'packetHash',encode(c.packet_hash,'hex')));
    missing_count:=missing_count+1;
  end loop;
  for c in select * from review_private.break_glass_cases where state in ('closed','expired') and packet_hash is null and coalesce(access_closed_at,access_expires_at)+interval '5 minutes'<=p_now order by access_expires_at limit greatest(0,least(p_limit,500)) for update loop
    update review_private.break_glass_cases set state='disabled' where case_id=c.case_id;
    perform review_private.append_audit('break_glass_packet_freeze_failed',null,null,c.case_id,'disabled',jsonb_build_object('closedAt',c.access_closed_at,'watchdogAt',p_now));
    frozen_count:=frozen_count+1;
  end loop;
  return jsonb_build_object('missingReviews',missing_count,'unfrozenPackets',frozen_count);
end $$;
alter function review_private.watch_break_glass_review_deadlines(timestamptz,integer) owner to review_automation;
revoke all on function review_private.watch_break_glass_review_deadlines(timestamptz,integer) from public,anon,authenticated;
grant execute on function review_private.watch_break_glass_review_deadlines(timestamptz,integer) to review_automation;

revoke review_automation from postgres;
