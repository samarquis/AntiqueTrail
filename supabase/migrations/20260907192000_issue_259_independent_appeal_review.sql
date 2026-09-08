-- Issue 259: one-case independent appeal review.
-- This path deliberately does not reuse the ordinary reviewer-credential
-- command. It keeps the case capability, challenge, assertion, and decision
-- lifecycle bound to one assigned appeal.

create table review_private.appeal_reviewer_capabilities(
  capability_id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null unique references review_private.moderation_cases(case_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  token_hash bytea not null unique check(octet_length(token_hash)=32),
  issuance_idempotency_key uuid not null unique,
  state text not null default 'active' check(state in ('active','consumed','revoked','expired')),
  first_accessed_at timestamptz,
  expires_at timestamptz,
  packet_hash bytea check(packet_hash is null or octet_length(packet_hash)=32),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check((state='active' and consumed_at is null and revoked_at is null) or (state='consumed' and consumed_at is not null) or (state in ('revoked','expired') and revoked_at is not null)),
  check((first_accessed_at is null and expires_at is null) or (first_accessed_at is not null and expires_at>first_accessed_at and expires_at<=first_accessed_at+interval '24 hours'))
);
create unique index one_active_appeal_reviewer_capability on review_private.appeal_reviewer_capabilities(case_id) where state='active';

create table review_private.appeal_reviewer_challenges(
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  capability_id uuid not null references review_private.appeal_reviewer_capabilities(capability_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  case_id uuid not null references review_private.moderation_cases(case_id) on delete restrict,
  idempotency_key uuid not null unique,
  request_digest bytea not null check(octet_length(request_digest)=32),
  challenge_nonce bytea not null unique check(octet_length(challenge_nonce)=32),
  challenge_digest bytea not null unique check(octet_length(challenge_digest)=32),
  rp_id text not null,
  expected_origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);

create table review_private.appeal_reviewer_assertion_receipts(
  assertion_receipt_id uuid primary key default extensions.gen_random_uuid(),
  challenge_id uuid not null unique references review_private.appeal_reviewer_challenges(challenge_id) on delete restrict,
  capability_id uuid not null references review_private.appeal_reviewer_capabilities(capability_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  case_id uuid not null references review_private.moderation_cases(case_id) on delete restrict,
  credential_id_digest bytea not null check(octet_length(credential_id_digest)=32),
  assertion_digest bytea not null unique check(octet_length(assertion_digest)=32),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  provider_key_id text not null check(provider_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  sign_count bigint not null check(sign_count>=0),
  verified_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check(expires_at>verified_at and expires_at<=verified_at+interval '5 minutes')
);

create table review_private.appeal_reviewer_decisions(
  decision_id uuid primary key default extensions.gen_random_uuid(),
  capability_id uuid not null unique references review_private.appeal_reviewer_capabilities(capability_id) on delete restrict,
  case_id uuid not null unique references review_private.moderation_cases(case_id) on delete restrict,
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  idempotency_key uuid not null unique,
  packet_hash bytea not null check(octet_length(packet_hash)=32),
  outcome text not null check(outcome in ('restore','uphold')),
  reason text not null check(char_length(reason) between 1 and 2000),
  audit_event_id uuid not null,
  decided_at timestamptz not null default statement_timestamp(),
  result jsonb not null check(jsonb_typeof(result)='object')
);

do $$ declare t text; begin
  foreach t in array array['appeal_reviewer_capabilities','appeal_reviewer_challenges','appeal_reviewer_assertion_receipts','appeal_reviewer_decisions'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy issue259_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;

grant select on app_public.catalog_areas to review_automation;
create policy issue259_catalog_areas on app_public.catalog_areas for select to review_automation using(true);

-- Package 9 revokes CREATE after its ownership pass; ownership transfer also
-- requires it for the service role, so grant it only for this migration.
grant review_automation to postgres;
grant create on schema review_private,app_public to review_automation;

create function review_private.issue_appeal_reviewer_capability(
  p_case_id uuid,p_reviewer_identity_id uuid,p_token_hash bytea,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior review_private.appeal_reviewer_capabilities%rowtype; cid uuid;
begin
  select * into prior from review_private.appeal_reviewer_capabilities where issuance_idempotency_key=p_idempotency_key;
  if found then
    if prior.case_id<>p_case_id or prior.reviewer_identity_id<>p_reviewer_identity_id or prior.token_hash<>p_token_hash then
      raise exception using errcode='22023',message='appeal_reviewer_capability_idempotency_reused';
    end if;
    return prior.capability_id;
  end if;
  if octet_length(p_token_hash)<>32
    or not exists(select 1 from review_private.review_appeals a join review_private.moderation_cases c using(case_id)
      where a.case_id=p_case_id and a.assigned_reviewer_identity_id=p_reviewer_identity_id and a.state='assigned' and c.state='appealed')
    or not exists(select 1 from review_private.reviewer_identities where reviewer_identity_id=p_reviewer_identity_id and state='active' and active_credential_count>=2 and relationship_ended_at is null) then
    raise exception using errcode='42501',message='appeal_reviewer_capability_unavailable';
  end if;
  insert into review_private.appeal_reviewer_capabilities(case_id,reviewer_identity_id,token_hash,issuance_idempotency_key)
    values(p_case_id,p_reviewer_identity_id,p_token_hash,p_idempotency_key) returning capability_id into cid;
  return cid;
end $$;
alter function review_private.issue_appeal_reviewer_capability(uuid,uuid,bytea,uuid) owner to review_automation;
revoke all on function review_private.issue_appeal_reviewer_capability(uuid,uuid,bytea,uuid) from public,anon,authenticated;
grant execute on function review_private.issue_appeal_reviewer_capability(uuid,uuid,bytea,uuid) to review_credential_capability_service;

create function review_private.revoke_appeal_reviewer_capability(p_capability_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update review_private.appeal_reviewer_capabilities set state='revoked',revoked_at=statement_timestamp()
    where capability_id=p_capability_id and state='active';
  update review_private.appeal_reviewer_challenges set consumed_at=statement_timestamp()
    where capability_id=p_capability_id and consumed_at is null;
  update review_private.appeal_reviewer_assertion_receipts set consumed_at=statement_timestamp()
    where capability_id=p_capability_id and consumed_at is null;
end $$;
alter function review_private.revoke_appeal_reviewer_capability(uuid) owner to review_automation;
revoke all on function review_private.revoke_appeal_reviewer_capability(uuid) from public,anon,authenticated;
grant execute on function review_private.revoke_appeal_reviewer_capability(uuid) to review_credential_capability_service;

create function app_public.reviews_request_independent_appeal_assertion(p_capability_token text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.appeal_reviewer_capabilities%rowtype; a review_private.review_appeals%rowtype; c review_private.moderation_cases%rowtype; i review_private.reviewer_identities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; h review_private.appeal_reviewer_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32); request_hash bytea;
begin
  if char_length(p_capability_token) not between 32 and 512 or p_capability_token !~ '^[A-Za-z0-9_-]+$' then raise exception using errcode='42501',message='appeal_reviewer_unavailable'; end if;
  select * into cap from review_private.appeal_reviewer_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='appeal_reviewer_unavailable'; end if;
  request_hash:=extensions.digest(convert_to(cap.capability_id::text,'utf8'),'sha256');
  select * into h from review_private.appeal_reviewer_challenges where idempotency_key=p_idempotency_key;
  if found then
    if h.capability_id<>cap.capability_id or h.request_digest<>request_hash then raise exception using errcode='22023',message='appeal_reviewer_challenge_reused'; end if;
    return jsonb_build_object('challengeId',h.challenge_id,'challenge',encode(h.challenge_nonce,'hex'),'rpId',h.rp_id,'origin',h.expected_origin,'expiresAt',h.expires_at);
  end if;
  select * into a from review_private.review_appeals where case_id=cap.case_id;
  select * into c from review_private.moderation_cases where case_id=cap.case_id;
  select * into i from review_private.reviewer_identities where reviewer_identity_id=cap.reviewer_identity_id;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if cap.state<>'active' or (cap.expires_at is not null and cap.expires_at<=statement_timestamp()) or a.appeal_id is null or c.case_id is null
    or a.state<>'assigned' or a.assigned_reviewer_identity_id<>i.reviewer_identity_id or i.reviewer_identity_id is null
    or i.state<>'active' or i.active_credential_count<2 or i.relationship_ended_at is not null
    or c.original_moderator_id is null or i.user_id=c.original_moderator_id or cfg.singleton is null then
    raise exception using errcode='42501',message='appeal_reviewer_unavailable';
  end if;
  if exists(select 1 from review_private.appeal_reviewer_challenges where capability_id=cap.capability_id and consumed_at is null and expires_at>statement_timestamp()) then
    raise exception using errcode='42501',message='appeal_reviewer_unavailable';
  end if;
  insert into review_private.appeal_reviewer_challenges(capability_id,reviewer_identity_id,case_id,idempotency_key,request_digest,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at)
    values(cap.capability_id,i.reviewer_identity_id,c.case_id,p_idempotency_key,request_hash,nonce,extensions.digest(nonce,'sha256'),cfg.rp_id,cfg.expected_origin,least(coalesce(cap.expires_at,statement_timestamp()+interval '5 minutes'),statement_timestamp()+interval '5 minutes')) returning * into h;
  return jsonb_build_object('challengeId',h.challenge_id,'challenge',encode(h.challenge_nonce,'hex'),'rpId',h.rp_id,'origin',h.expected_origin,'expiresAt',h.expires_at);
end $$;
alter function app_public.reviews_request_independent_appeal_assertion(text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_independent_appeal_assertion(text,uuid) from public,authenticated;
grant execute on function app_public.reviews_request_independent_appeal_assertion(text,uuid) to anon;

create function review_private.complete_independent_appeal_assertion(
  p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare h review_private.appeal_reviewer_challenges%rowtype; cap review_private.appeal_reviewer_capabilities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; cred review_private.reviewer_credentials%rowtype; prior review_private.appeal_reviewer_assertion_receipts%rowtype; aid uuid;
begin
  select * into prior from review_private.appeal_reviewer_assertion_receipts where challenge_id=p_challenge_id;
  if found then
    if prior.assertion_digest<>p_assertion_digest or prior.provider_verification_id<>p_provider_verification_id then raise exception using errcode='22023',message='appeal_reviewer_assertion_replay_mismatch'; end if;
    return jsonb_build_object('assertionReceiptId',prior.assertion_receipt_id,'expiresAt',prior.expires_at);
  end if;
  select * into h from review_private.appeal_reviewer_challenges where challenge_id=p_challenge_id and consumed_at is null and expires_at>statement_timestamp() for update;
  select * into cap from review_private.appeal_reviewer_capabilities where capability_id=h.capability_id for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  select * into cred from review_private.reviewer_credentials where reviewer_identity_id=h.reviewer_identity_id and credential_id_digest=p_credential_id_digest and state='active' for update;
  if h.challenge_id is null or cap.state<>'active' or (cap.expires_at is not null and cap.expires_at<=statement_timestamp()) or cfg.singleton is null
    or p_provider_key_id<>cfg.provider_key_id or cred.credential_record_id is null or p_sign_count<cred.sign_count
    or not exists(select 1 from review_private.reviewer_identities where reviewer_identity_id=h.reviewer_identity_id and state='active' and active_credential_count>=2 and relationship_ended_at is null) then
    raise exception using errcode='42501',message='appeal_reviewer_unavailable';
  end if;
  update review_private.reviewer_credentials set sign_count=p_sign_count where credential_record_id=cred.credential_record_id;
  update review_private.appeal_reviewer_challenges set consumed_at=statement_timestamp() where challenge_id=h.challenge_id;
  insert into review_private.appeal_reviewer_assertion_receipts(challenge_id,capability_id,reviewer_identity_id,case_id,credential_id_digest,assertion_digest,provider_verification_id,provider_key_id,sign_count,expires_at)
    values(h.challenge_id,cap.capability_id,h.reviewer_identity_id,h.case_id,p_credential_id_digest,p_assertion_digest,p_provider_verification_id,p_provider_key_id,p_sign_count,least(coalesce(cap.expires_at,statement_timestamp()+interval '5 minutes'),statement_timestamp()+interval '5 minutes')) returning assertion_receipt_id into aid;
  return jsonb_build_object('assertionReceiptId',aid,'expiresAt',statement_timestamp()+interval '5 minutes');
end $$;
alter function review_private.complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) owner to review_automation;
revoke all on function review_private.complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function review_private.complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function app_public.reviews_complete_independent_appeal_assertion(
  p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint
) returns jsonb language sql security definer set search_path='' as $$
  select review_private.complete_independent_appeal_assertion(p_challenge_id,p_credential_id_digest,p_assertion_digest,p_provider_verification_id,p_provider_key_id,p_sign_count)
$$;
alter function app_public.reviews_complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) owner to postgres;
revoke all on function app_public.reviews_complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function app_public.reviews_complete_independent_appeal_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function review_private.independent_appeal_packet(
  p_cap review_private.appeal_reviewer_capabilities,p_a review_private.review_appeals,p_c review_private.moderation_cases,p_r review_private.public_reviews
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'caseId',p_c.case_id,'appealId',p_a.appeal_id,'reviewId',p_r.review_id,
    'store',jsonb_build_object('name',s.name,'town',s.town,'stateCode',s.state_code,'areaLabel',ar.label),
    'reviewText',coalesce(p_r.review_text,''),'rule',concat('Review policy: ',coalesce(p_a.original_action,p_c.reason_code,'unspecified')),
    'priorDecision',p_a.original_action,'appealText',coalesce(p_a.appeal_reason,''),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('kind',e.evidence_kind,'value',e.evidence_value) order by e.evidence_id)
      from review_private.moderation_case_evidence e where e.case_id=p_c.case_id and e.evidence_kind in ('report_reason','prior_decision','appeal_text')),'[]'::jsonb),
    'state','ready'
  )
  from app_public.stores s join app_public.catalog_areas ar on ar.id=s.area_id
  where s.id=p_r.store_id
$$;
alter function review_private.independent_appeal_packet(review_private.appeal_reviewer_capabilities,review_private.review_appeals,review_private.moderation_cases,review_private.public_reviews) owner to review_automation;

create function app_public.reviews_get_independent_appeal_packet(p_capability_token text,p_assertion_receipt_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cap review_private.appeal_reviewer_capabilities%rowtype; a review_private.review_appeals%rowtype; c review_private.moderation_cases%rowtype; r review_private.public_reviews%rowtype; proof review_private.appeal_reviewer_assertion_receipts%rowtype; packet jsonb; digest bytea;
begin
  select * into cap from review_private.appeal_reviewer_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='appeal_reviewer_unavailable'; end if;
  if cap.state='consumed' then
    return (select jsonb_build_object('state','consumed','outcome',d.outcome,'caseId',d.case_id,'appealId',a.appeal_id,'reviewId',a.review_id) from review_private.appeal_reviewer_decisions d join review_private.review_appeals a using(case_id) where d.capability_id=cap.capability_id);
  end if;
  if cap.state<>'active' or (cap.expires_at is not null and cap.expires_at<=statement_timestamp()) then
    if cap.state='active' then update review_private.appeal_reviewer_capabilities set state='expired',revoked_at=statement_timestamp() where capability_id=cap.capability_id; end if;
    return jsonb_build_object('state',case when cap.state='active' then 'expired' else cap.state end);
  end if;
  select * into a from review_private.review_appeals where case_id=cap.case_id for update;
  select * into c from review_private.moderation_cases where case_id=cap.case_id for update;
  select * into r from review_private.public_reviews where review_id=a.review_id for update;
  select * into proof from review_private.appeal_reviewer_assertion_receipts where assertion_receipt_id=p_assertion_receipt_id and capability_id=cap.capability_id and case_id=cap.case_id and consumed_at is null and expires_at>statement_timestamp() for update;
  if a.appeal_id is null or c.case_id is null or r.review_id is null or a.state<>'assigned' or c.state<>'appealed' or r.state not in ('held','removed') or proof.assertion_receipt_id is null
    or not exists(select 1 from review_private.reviewer_identities i where i.reviewer_identity_id=cap.reviewer_identity_id and i.state='active' and i.active_credential_count>=2 and i.relationship_ended_at is null and c.original_moderator_id is not null and i.user_id<>c.original_moderator_id) then
    raise exception using errcode='42501',message='appeal_reviewer_unavailable';
  end if;
  packet:=review_private.independent_appeal_packet(cap,a,c,r);
  digest:=extensions.digest(convert_to(packet::text,'utf8'),'sha256');
  if cap.packet_hash is not null and cap.packet_hash<>digest then raise exception using errcode='42501',message='appeal_reviewer_unavailable'; end if;
  update review_private.appeal_reviewer_capabilities set first_accessed_at=coalesce(first_accessed_at,statement_timestamp()),expires_at=coalesce(expires_at,statement_timestamp()+interval '24 hours'),packet_hash=coalesce(packet_hash,digest) where capability_id=cap.capability_id;
  return packet || jsonb_build_object('packetHash',encode(digest,'hex'));
end $$;
alter function app_public.reviews_get_independent_appeal_packet(text,uuid) owner to review_automation;
revoke all on function app_public.reviews_get_independent_appeal_packet(text,uuid) from public,authenticated;
grant execute on function app_public.reviews_get_independent_appeal_packet(text,uuid) to anon;

create function app_public.reviews_submit_independent_appeal(
  p_capability_token text,p_assertion_receipt_id uuid,p_packet_hash bytea,p_outcome text,p_reason text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.appeal_reviewer_capabilities%rowtype; prior review_private.appeal_reviewer_decisions%rowtype; a review_private.review_appeals%rowtype; c review_private.moderation_cases%rowtype; r review_private.public_reviews%rowtype; proof review_private.appeal_reviewer_assertion_receipts%rowtype; reviewer review_private.reviewer_identities%rowtype; event_id uuid; result jsonb;
begin
  if p_outcome not in ('restore','uphold') or nullif(btrim(p_reason),'') is null or char_length(p_reason)>2000 or octet_length(p_packet_hash)<>32 then
    raise exception using errcode='22023',message='appeal_reviewer_submission_invalid';
  end if;
  select * into cap from review_private.appeal_reviewer_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='appeal_reviewer_unavailable'; end if;
  select * into prior from review_private.appeal_reviewer_decisions where idempotency_key=p_idempotency_key;
  if found then
    if prior.capability_id<>cap.capability_id then raise exception using errcode='22023',message='appeal_reviewer_idempotency_reused'; end if;
    return prior.result;
  end if;
  select * into a from review_private.review_appeals where case_id=cap.case_id for update;
  select * into c from review_private.moderation_cases where case_id=cap.case_id for update;
  select * into r from review_private.public_reviews where review_id=a.review_id for update;
  select * into reviewer from review_private.reviewer_identities where reviewer_identity_id=cap.reviewer_identity_id for update;
  select * into proof from review_private.appeal_reviewer_assertion_receipts where assertion_receipt_id=p_assertion_receipt_id and capability_id=cap.capability_id and case_id=cap.case_id and consumed_at is null and expires_at>statement_timestamp() for update;
  if cap.state<>'active' or cap.first_accessed_at is null or cap.expires_at<=statement_timestamp() or cap.packet_hash is null or cap.packet_hash<>p_packet_hash
    or a.appeal_id is null or c.case_id is null or r.review_id is null or a.state<>'assigned' or c.state<>'appealed'
    or r.state not in ('held','removed') or reviewer.reviewer_identity_id is null or reviewer.state<>'active' or reviewer.active_credential_count<2 or reviewer.relationship_ended_at is not null or c.original_moderator_id is null or reviewer.user_id=c.original_moderator_id
    or proof.assertion_receipt_id is null then
    raise exception using errcode='42501',message='appeal_reviewer_unavailable';
  end if;
  update review_private.review_appeals set state=case when p_outcome='restore' then 'restored' else 'upheld' end,decision_reason=btrim(p_reason),decided_at=statement_timestamp() where appeal_id=a.appeal_id returning * into a;
  if p_outcome='restore' then
    update review_private.public_reviews set state='published',updated_at=statement_timestamp(),version=version+1 where review_id=r.review_id returning * into r;
  else
    perform review_private.apply_review_restriction(r.review_id,c.case_id,reviewer.user_id);
  end if;
  update review_private.moderation_cases set state='resolved',closed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id;
  perform review_private.rebuild_rating_aggregate(r.store_id);
  perform review_private.sync_public_projection(r.review_id);
  event_id:=review_private.append_audit('independent_appeal_decided',reviewer.user_id,r.review_id,c.case_id,'allowed',jsonb_build_object('outcome',p_outcome,'packetHash',encode(p_packet_hash,'hex'),'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  result:=jsonb_build_object('caseId',c.case_id,'appealId',a.appeal_id,'reviewId',r.review_id,'state',case when p_outcome='restore' then 'restored' else 'upheld' end,'outcome',p_outcome,'packetHash',encode(p_packet_hash,'hex'));
  insert into review_private.appeal_reviewer_decisions(capability_id,case_id,reviewer_identity_id,idempotency_key,packet_hash,outcome,reason,audit_event_id,result)
    values(cap.capability_id,c.case_id,reviewer.reviewer_identity_id,p_idempotency_key,p_packet_hash,p_outcome,btrim(p_reason),event_id,result);
  update review_private.appeal_reviewer_capabilities set state='consumed',consumed_at=statement_timestamp() where capability_id=cap.capability_id;
  update review_private.appeal_reviewer_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=proof.assertion_receipt_id;
  return result;
end $$;
alter function app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid) from public,authenticated;
grant execute on function app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid) to anon;

revoke create on schema review_private,app_public from review_automation;
revoke review_automation from postgres;
