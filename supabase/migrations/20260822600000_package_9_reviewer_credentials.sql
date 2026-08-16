-- Package 9 correction: reviewer qualification uses durable, verifier-backed
-- non-discoverable credentials. Browser callers never supply counts or proof.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='review_credential_verifier') then
    create role review_credential_verifier nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='review_credential_configurator') then
    create role review_credential_configurator nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant review_automation,review_credential_verifier,review_credential_configurator to postgres;
grant usage on schema review_private to review_credential_verifier,review_credential_configurator;
grant create on schema review_private,app_public to review_automation;

create table review_private.reviewer_verifier_config(
  singleton boolean primary key default true check(singleton),
  state text not null default 'blocked' check(state in ('blocked','accepted','revoked')),
  rp_id text,
  expected_origin text,
  provider_key_id text,
  evidence_digest bytea check(evidence_digest is null or octet_length(evidence_digest)=32),
  accepted_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1 check(version>0),
  check(state<>'accepted' or (rp_id is not null and expected_origin is not null and provider_key_id is not null and evidence_digest is not null and accepted_at is not null and revoked_at is null))
);
insert into review_private.reviewer_verifier_config default values;

create table review_private.reviewer_credentials(
  credential_record_id uuid primary key default extensions.gen_random_uuid(),
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  credential_id_digest bytea not null unique check(octet_length(credential_id_digest)=32),
  public_key_digest bytea not null check(octet_length(public_key_digest)=32),
  provider_credential_id text not null unique check(provider_credential_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  discoverable boolean not null check(not discoverable),
  sign_count bigint not null check(sign_count>=0),
  state text not null default 'active' check(state in ('active','revoked')),
  verified_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  revocation_reason text,
  check((state='active' and revoked_at is null and revocation_reason is null) or (state='revoked' and revoked_at is not null and revocation_reason is not null))
);
create index reviewer_credentials_identity_state on review_private.reviewer_credentials(reviewer_identity_id,state);

create table review_private.reviewer_credential_challenges(
  challenge_id uuid primary key default extensions.gen_random_uuid(),
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  case_id uuid references review_private.moderation_cases(case_id) on delete restrict,
  ceremony text not null check(ceremony in ('registration','assertion')),
  idempotency_key uuid not null unique,
  request_digest bytea not null check(octet_length(request_digest)=32),
  challenge_nonce bytea not null unique check(octet_length(challenge_nonce)=32),
  challenge_digest bytea not null unique check(octet_length(challenge_digest)=32),
  rp_id text not null,
  expected_origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at>created_at and expires_at<=created_at+interval '5 minutes'),
  check((ceremony='registration' and case_id is null) or (ceremony='assertion' and case_id is not null))
);
create unique index one_live_reviewer_challenge on review_private.reviewer_credential_challenges(reviewer_identity_id,ceremony) where consumed_at is null;

alter table review_private.reviewer_credentials add column registration_challenge_id uuid unique references review_private.reviewer_credential_challenges(challenge_id) on delete restrict;

create table review_private.reviewer_credential_command_receipts(
  idempotency_key uuid primary key,
  operation text not null check(operation='revoke'),
  credential_record_id uuid not null references review_private.reviewer_credentials(credential_record_id) on delete restrict,
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default statement_timestamp()
);

alter table review_private.reviewer_assertion_receipts
  add column challenge_id uuid references review_private.reviewer_credential_challenges(challenge_id) on delete restrict,
  add column credential_record_id uuid references review_private.reviewer_credentials(credential_record_id) on delete restrict;

-- Legacy counts and assertion digests were not verifier-derived. They cannot
-- carry authority across this migration.
update review_private.reviewer_assertion_receipts set consumed_at=coalesce(consumed_at,statement_timestamp());
update review_private.reviewer_identities set state='pending',active_credential_count=0,assertion_verified_at=null where state='active';

do $$ declare t text; begin
  foreach t in array array['reviewer_verifier_config','reviewer_credentials','reviewer_credential_challenges','reviewer_credential_command_receipts'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy review_automation_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;
create trigger reviewer_credentials_no_delete before delete on review_private.reviewer_credentials for each row execute function review_private.reject_append_only_mutation();
create trigger reviewer_challenges_no_delete before delete on review_private.reviewer_credential_challenges for each row execute function review_private.reject_append_only_mutation();
create trigger reviewer_credential_commands_immutable before update or delete on review_private.reviewer_credential_command_receipts for each row execute function review_private.reject_append_only_mutation();
create unique index reviewer_assertion_challenge_once on review_private.reviewer_assertion_receipts(challenge_id) where challenge_id is not null;

create function review_private.reviewer_has_two_active_credentials(p_identity uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select count(*)>=2 from review_private.reviewer_credentials where reviewer_identity_id=p_identity and state='active' and not discoverable;
$$;
alter function review_private.reviewer_has_two_active_credentials(uuid) owner to review_automation;
revoke all on function review_private.reviewer_has_two_active_credentials(uuid) from public,anon,authenticated;

create function review_private.provision_reviewer_identity(p_user_id uuid,p_qualification_receipt_digest bytea)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if p_user_id is null or octet_length(p_qualification_receipt_digest)<>32 then raise exception using errcode='22023',message='reviewer_identity_input_invalid'; end if;
  insert into review_private.reviewer_identities(user_id,state,qualification_receipt_digest,active_credential_count,assertion_verified_at,relationship_ended_at)
    values(p_user_id,'pending',p_qualification_receipt_digest,0,null,null)
    on conflict(user_id) do update set state='pending',qualification_receipt_digest=excluded.qualification_receipt_digest,
      active_credential_count=(select count(*) from review_private.reviewer_credentials c where c.reviewer_identity_id=reviewer_identities.reviewer_identity_id and c.state='active'),
      assertion_verified_at=null,relationship_ended_at=null returning reviewer_identity_id into rid;
  return rid;
end $$;
alter function review_private.provision_reviewer_identity(uuid,bytea) owner to review_automation;
revoke all on function review_private.provision_reviewer_identity(uuid,bytea) from public,anon,authenticated;
grant execute on function review_private.provision_reviewer_identity(uuid,bytea) to review_credential_configurator;

create function review_private.configure_reviewer_verifier(p_rp_id text,p_origin text,p_provider_key_id text,p_evidence_digest bytea,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare v bigint;
begin
  if p_rp_id !~ '^[A-Za-z0-9.-]{1,253}$' or p_origin !~ '^https://[^/[:space:]]+$' or p_provider_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or octet_length(p_evidence_digest)<>32 then
    raise exception using errcode='22023',message='reviewer_verifier_evidence_invalid'; end if;
  update review_private.reviewer_verifier_config set state='accepted',rp_id=p_rp_id,expected_origin=p_origin,provider_key_id=p_provider_key_id,
    evidence_digest=p_evidence_digest,accepted_at=statement_timestamp(),revoked_at=null,version=version+1 where singleton and version=p_expected_version returning version into v;
  if v is null then raise exception using errcode='40001',message='reviewer_verifier_version_conflict'; end if; return v;
end $$;
alter function review_private.configure_reviewer_verifier(text,text,text,bytea,bigint) owner to review_automation;
revoke all on function review_private.configure_reviewer_verifier(text,text,text,bytea,bigint) from public,anon,authenticated;
grant execute on function review_private.configure_reviewer_verifier(text,text,text,bytea,bigint) to review_credential_configurator;

create function review_private.revoke_reviewer_verifier(p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_reason !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'reviewer_verifier_revocation_invalid'; end if;
  update review_private.reviewer_verifier_config set state='revoked',revoked_at=statement_timestamp(),version=version+1 where singleton;
  update review_private.reviewer_identities set state='disabled',assertion_verified_at=null where state='active';
  update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where consumed_at is null;
end $$;
alter function review_private.revoke_reviewer_verifier(text) owner to review_automation;
revoke all on function review_private.revoke_reviewer_verifier(text) from public,anon,authenticated;
grant execute on function review_private.revoke_reviewer_verifier(text) to review_credential_configurator;

create function app_public.reviews_request_reviewer_credential_challenge(
  p_reviewer_identity_id uuid,p_case_id uuid,p_ceremony text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare i review_private.reviewer_identities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; c review_private.reviewer_credential_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32); request_hash bytea;
begin
  if not app_private.current_session_is_active() or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '10 minutes') or p_ceremony not in ('registration','assertion') then
    raise exception using errcode='42501',message='reviewer_credential_challenge_denied'; end if;
  select * into i from review_private.reviewer_identities where reviewer_identity_id=p_reviewer_identity_id and user_id=app_public.request_user_id();
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if i.reviewer_identity_id is null or cfg.singleton is null or (p_ceremony='registration' and i.state not in ('pending','active')) or (p_ceremony='assertion' and (i.state<>'active' or p_case_id is null
    or not (exists(select 1 from review_private.review_appeals a where a.case_id=p_case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')
      or exists(select 1 from review_private.restriction_appeals a join review_private.review_restrictions r on r.restriction_id=a.restriction_id where r.source_case_id=p_case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')))) then
    raise exception using errcode='42501',message='reviewer_credential_challenge_denied'; end if;
  request_hash:=extensions.digest(convert_to(concat_ws('|',p_reviewer_identity_id,coalesce(p_case_id::text,''),p_ceremony,app_public.request_user_id()),'utf8'),'sha256');
  select * into c from review_private.reviewer_credential_challenges where idempotency_key=p_idempotency_key;
  if found then
    if c.reviewer_identity_id<>p_reviewer_identity_id or c.case_id is distinct from p_case_id or c.ceremony<>p_ceremony or c.request_digest<>request_hash then raise exception using errcode='22023',message='reviewer_challenge_idempotency_reused'; end if;
    return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state',case when c.consumed_at is null then 'pending' else 'consumed' end);
  end if;
  if exists(select 1 from review_private.reviewer_credential_challenges x where x.reviewer_identity_id=i.reviewer_identity_id and x.ceremony=p_ceremony and x.consumed_at is null and x.expires_at>statement_timestamp()) then raise exception using errcode='55000',message='reviewer_challenge_already_pending'; end if;
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp() where reviewer_identity_id=i.reviewer_identity_id and ceremony=p_ceremony and consumed_at is null;
  insert into review_private.reviewer_credential_challenges(reviewer_identity_id,case_id,ceremony,idempotency_key,request_digest,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at)
    values(i.reviewer_identity_id,p_case_id,p_ceremony,p_idempotency_key,request_hash,nonce,extensions.digest(nonce,'sha256'),cfg.rp_id,cfg.expected_origin,statement_timestamp()+interval '5 minutes') returning * into c;
  return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state','pending');
end $$;
alter function app_public.reviews_request_reviewer_credential_challenge(uuid,uuid,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_reviewer_credential_challenge(uuid,uuid,text,uuid) from public,anon;
grant execute on function app_public.reviews_request_reviewer_credential_challenge(uuid,uuid,text,uuid) to authenticated;

create function review_private.complete_reviewer_registration(
  p_challenge_id uuid,p_credential_id_digest bytea,p_public_key_digest bytea,p_provider_credential_id text,p_provider_verification_id text,p_provider_key_id text,p_discoverable boolean,p_sign_count bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c review_private.reviewer_credential_challenges%rowtype; cfg review_private.reviewer_verifier_config%rowtype; existing review_private.reviewer_credentials%rowtype; crid uuid; cnt integer;
begin
  select * into existing from review_private.reviewer_credentials where registration_challenge_id=p_challenge_id;
  if found then
    if existing.provider_verification_id<>p_provider_verification_id then raise exception using errcode='22023',message='reviewer_registration_replay_mismatch'; end if;
    return jsonb_build_object('credentialRecordId',existing.credential_record_id,'state',(select state from review_private.reviewer_identities where reviewer_identity_id=existing.reviewer_identity_id));
  end if;
  select * into c from review_private.reviewer_credential_challenges where challenge_id=p_challenge_id for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if c.challenge_id is null or c.ceremony<>'registration' or c.consumed_at is not null or c.expires_at<=statement_timestamp() or cfg.singleton is null
    or c.rp_id<>cfg.rp_id or c.expected_origin<>cfg.expected_origin or p_provider_key_id<>cfg.provider_key_id or p_discoverable
    or octet_length(p_credential_id_digest)<>32 or octet_length(p_public_key_digest)<>32 or p_sign_count<0
    or p_provider_credential_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then raise exception using errcode='42501',message='reviewer_registration_verification_invalid'; end if;
  insert into review_private.reviewer_credentials(reviewer_identity_id,credential_id_digest,public_key_digest,provider_credential_id,provider_verification_id,discoverable,sign_count,registration_challenge_id)
    values(c.reviewer_identity_id,p_credential_id_digest,p_public_key_digest,p_provider_credential_id,p_provider_verification_id,false,p_sign_count,c.challenge_id) returning credential_record_id into crid;
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=c.reviewer_identity_id and state='active' and not discoverable;
  update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then 'active' else 'pending' end where reviewer_identity_id=c.reviewer_identity_id;
  return jsonb_build_object('credentialRecordId',crid,'state',case when cnt>=2 then 'active' else 'pending' end);
end $$;
alter function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) owner to review_automation;
revoke all on function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) to review_credential_verifier;

create function review_private.complete_reviewer_assertion(
  p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c review_private.reviewer_credential_challenges%rowtype; cfg review_private.reviewer_verifier_config%rowtype; cred review_private.reviewer_credentials%rowtype; prior review_private.reviewer_assertion_receipts%rowtype; rid uuid;
begin
  select * into prior from review_private.reviewer_assertion_receipts where challenge_id=p_challenge_id;
  if found then
    if prior.provider_verification_id<>p_provider_verification_id then raise exception using errcode='22023',message='reviewer_assertion_replay_mismatch'; end if;
    return jsonb_build_object('assertionReceiptId',prior.assertion_receipt_id,'state',case when prior.consumed_at is null then 'verified' else 'consumed' end);
  end if;
  select * into c from review_private.reviewer_credential_challenges where challenge_id=p_challenge_id for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  select * into cred from review_private.reviewer_credentials where credential_id_digest=p_credential_id_digest and state='active' for update;
  if c.challenge_id is null or c.ceremony<>'assertion' or c.consumed_at is not null or c.expires_at<=statement_timestamp() or cfg.singleton is null
    or cred.credential_record_id is null or cred.reviewer_identity_id<>c.reviewer_identity_id or p_provider_key_id<>cfg.provider_key_id
    or octet_length(p_assertion_digest)<>32 or p_sign_count<=cred.sign_count or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or not review_private.reviewer_has_two_active_credentials(c.reviewer_identity_id) then raise exception using errcode='42501',message='reviewer_assertion_verification_invalid'; end if;
  insert into review_private.reviewer_assertion_receipts(reviewer_identity_id,case_id,challenge_digest,assertion_digest,provider_verification_id,challenge_id,credential_record_id)
    values(c.reviewer_identity_id,c.case_id,c.challenge_digest,p_assertion_digest,p_provider_verification_id,c.challenge_id,cred.credential_record_id) returning assertion_receipt_id into rid;
  update review_private.reviewer_credentials set sign_count=p_sign_count where credential_record_id=cred.credential_record_id;
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  update review_private.reviewer_identities set assertion_verified_at=statement_timestamp() where reviewer_identity_id=c.reviewer_identity_id;
  return jsonb_build_object('assertionReceiptId',rid,'state','verified');
end $$;
alter function review_private.complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) owner to review_automation;
revoke all on function review_private.complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function review_private.complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function app_public.reviews_complete_reviewer_registration(
  p_challenge_id uuid,p_credential_id_digest bytea,p_public_key_digest bytea,p_provider_credential_id text,p_provider_verification_id text,p_provider_key_id text,p_discoverable boolean,p_sign_count bigint
) returns jsonb language sql security definer set search_path='' as $$
  select review_private.complete_reviewer_registration(p_challenge_id,p_credential_id_digest,p_public_key_digest,p_provider_credential_id,p_provider_verification_id,p_provider_key_id,p_discoverable,p_sign_count);
$$;
alter function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) owner to postgres;
revoke all on function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) to review_credential_verifier;

create function app_public.reviews_complete_reviewer_assertion(
  p_challenge_id uuid,p_credential_id_digest bytea,p_assertion_digest bytea,p_provider_verification_id text,p_provider_key_id text,p_sign_count bigint
) returns jsonb language sql security definer set search_path='' as $$
  select review_private.complete_reviewer_assertion(p_challenge_id,p_credential_id_digest,p_assertion_digest,p_provider_verification_id,p_provider_key_id,p_sign_count);
$$;
alter function app_public.reviews_complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) owner to postgres;
revoke all on function app_public.reviews_complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) from public,anon,authenticated;
grant execute on function app_public.reviews_complete_reviewer_assertion(uuid,bytea,bytea,text,text,bigint) to review_credential_verifier;

create function app_public.reviews_revoke_reviewer_credential(p_credential_record_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cred review_private.reviewer_credentials%rowtype; cnt integer; prior review_private.reviewer_credential_command_receipts%rowtype; result jsonb;
begin
  if not app_private.current_session_is_active() or p_idempotency_key is null then raise exception using errcode='42501',message='reviewer_credential_revocation_denied'; end if;
  select c.* into cred from review_private.reviewer_credentials c join review_private.reviewer_identities i using(reviewer_identity_id)
    where c.credential_record_id=p_credential_record_id and i.user_id=app_public.request_user_id() for update of c;
  if cred.credential_record_id is null then raise exception using errcode='42501',message='reviewer_credential_revocation_denied'; end if;
  select * into prior from review_private.reviewer_credential_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.credential_record_id<>p_credential_record_id then raise exception using errcode='22023',message='reviewer_credential_idempotency_reused'; end if;
    return prior.result;
  end if;
  if cred.state='active' then
    update review_private.reviewer_credentials set state='revoked',revoked_at=statement_timestamp(),revocation_reason='reviewer_requested' where credential_record_id=cred.credential_record_id;
    update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where credential_record_id=cred.credential_record_id and consumed_at is null;
  end if;
  select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=cred.reviewer_identity_id and state='active';
  update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then state else 'disabled' end,assertion_verified_at=case when cnt>=2 then assertion_verified_at else null end where reviewer_identity_id=cred.reviewer_identity_id;
  result:=jsonb_build_object('credentialRecordId',cred.credential_record_id,'state','revoked','reviewerState',case when cnt>=2 then 'active' else 'disabled' end);
  insert into review_private.reviewer_credential_command_receipts(idempotency_key,operation,credential_record_id,result) values(p_idempotency_key,'revoke',cred.credential_record_id,result);
  return result;
end $$;
alter function app_public.reviews_revoke_reviewer_credential(uuid,uuid) owner to review_automation;
revoke all on function app_public.reviews_revoke_reviewer_credential(uuid,uuid) from public,anon;
grant execute on function app_public.reviews_revoke_reviewer_credential(uuid,uuid) to authenticated;

revoke all on function review_private.record_reviewer_assertion(uuid,uuid,bytea,bytea,text),review_private.register_reviewer_identity(uuid,bytea,integer) from review_assertion_service;
drop function review_private.record_reviewer_assertion(uuid,uuid,bytea,bytea,text);
drop function review_private.register_reviewer_identity(uuid,bytea,integer);

revoke create on schema review_private,app_public from review_automation;
revoke review_automation,review_credential_verifier,review_credential_configurator from postgres;
