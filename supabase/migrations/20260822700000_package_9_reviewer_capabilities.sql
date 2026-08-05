-- Package 9 P1: setup, management, recovery, and appeal assertion authority
-- comes only from short-lived one-use capabilities delivered by a trusted service.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='review_credential_capability_service') then
    create role review_credential_capability_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant review_automation,review_credential_capability_service to postgres;
grant usage on schema review_private to review_credential_capability_service;
grant create on schema review_private,app_public to review_automation;

create table review_private.reviewer_management_capabilities(
  capability_id uuid primary key default extensions.gen_random_uuid(),
  reviewer_identity_id uuid not null references review_private.reviewer_identities(reviewer_identity_id) on delete restrict,
  scope text not null check(scope in ('enrollment','management','recovery','appeal')),
  case_id uuid references review_private.moderation_cases(case_id) on delete restrict,
  token_hash bytea unique check(token_hash is null or octet_length(token_hash)=32),
  delivery_verification_id text not null unique check(delivery_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  issuance_idempotency_key uuid not null unique,
  state text not null default 'active' check(state in ('active','consumed','revoked','expired','purged')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  check((scope='appeal' and case_id is not null) or (scope<>'appeal' and case_id is null)),
  check((state='active' and token_hash is not null and consumed_at is null and revoked_at is null and purged_at is null)
    or (state='consumed' and token_hash is not null and consumed_at is not null)
    or (state in ('revoked','expired') and token_hash is not null and revoked_at is not null)
    or (state='purged' and token_hash is null and purged_at is not null))
);

create table review_private.reviewer_capability_purge_receipts(
  purge_receipt_id uuid primary key default extensions.gen_random_uuid(),
  capability_id uuid not null unique references review_private.reviewer_management_capabilities(capability_id) on delete restrict,
  prior_state text not null check(prior_state in ('consumed','revoked','expired')),
  outcome_digest bytea not null check(octet_length(outcome_digest)=32),
  purged_at timestamptz not null default statement_timestamp()
);

alter table review_private.reviewer_credential_challenges add column capability_id uuid references review_private.reviewer_management_capabilities(capability_id) on delete restrict;
alter table review_private.reviewer_credential_challenges alter column challenge_nonce drop not null;
alter table review_private.reviewer_assertion_receipts add column capability_id uuid references review_private.reviewer_management_capabilities(capability_id) on delete restrict;
alter table review_private.reviewer_credential_command_receipts drop constraint reviewer_credential_command_receipts_operation_check;
alter table review_private.reviewer_credential_command_receipts alter column credential_record_id drop not null;
alter table review_private.reviewer_credential_command_receipts add column capability_id uuid references review_private.reviewer_management_capabilities(capability_id) on delete restrict;
alter table review_private.reviewer_credential_command_receipts add column input_digest bytea check(input_digest is null or octet_length(input_digest)=32);
alter table review_private.reviewer_credential_command_receipts add constraint reviewer_credential_command_receipts_operation_check check(operation in ('list','revoke'));

do $$ declare t text; begin
  foreach t in array array['reviewer_management_capabilities','reviewer_capability_purge_receipts'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy review_automation_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;
create trigger reviewer_capability_purge_receipts_immutable before update or delete on review_private.reviewer_capability_purge_receipts for each row execute function review_private.reject_append_only_mutation();

create function review_private.issue_reviewer_management_capability(
  p_reviewer_identity_id uuid,p_scope text,p_case_id uuid,p_token_hash bytea,p_delivery_verification_id text,p_expires_at timestamptz,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior review_private.reviewer_management_capabilities%rowtype; cid uuid;
begin
  select * into prior from review_private.reviewer_management_capabilities where issuance_idempotency_key=p_idempotency_key;
  if found then
    if prior.reviewer_identity_id<>p_reviewer_identity_id or prior.scope<>p_scope or prior.case_id is distinct from p_case_id or prior.token_hash<>p_token_hash or prior.delivery_verification_id<>p_delivery_verification_id or prior.expires_at<>p_expires_at then raise exception using errcode='22023',message='reviewer_capability_idempotency_reused'; end if;
    return prior.capability_id;
  end if;
  if p_scope not in ('enrollment','management','recovery','appeal') or octet_length(p_token_hash)<>32
    or p_delivery_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_expires_at<=statement_timestamp() or p_expires_at>statement_timestamp()+interval '30 minutes'
    or ((p_scope='appeal')<>(p_case_id is not null)) or not exists(select 1 from review_private.reviewer_identities where reviewer_identity_id=p_reviewer_identity_id and relationship_ended_at is null) then
    raise exception using errcode='22023',message='reviewer_capability_issue_invalid'; end if;
  insert into review_private.reviewer_management_capabilities(reviewer_identity_id,scope,case_id,token_hash,delivery_verification_id,issuance_idempotency_key,expires_at)
    values(p_reviewer_identity_id,p_scope,p_case_id,p_token_hash,p_delivery_verification_id,p_idempotency_key,p_expires_at) returning capability_id into cid;
  return cid;
end $$;
alter function review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamptz,uuid) owner to review_automation;
revoke all on function review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamptz,uuid) to review_credential_capability_service;

create function app_public.reviews_request_reviewer_capability_challenge(p_capability_token text,p_ceremony text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; i review_private.reviewer_identities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; c review_private.reviewer_credential_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32); request_hash bytea;
begin
  if p_capability_token !~ '^[A-Za-z0-9_-]{32,512}$' or p_ceremony not in ('registration','assertion') then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into cap from review_private.reviewer_management_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if cap.capability_id is null or cap.state<>'active' or cap.expires_at<=statement_timestamp() or cfg.singleton is null
    or (p_ceremony='registration' and cap.scope not in ('enrollment','recovery')) or (p_ceremony='assertion' and cap.scope not in ('management','appeal')) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into i from review_private.reviewer_identities where reviewer_identity_id=cap.reviewer_identity_id and relationship_ended_at is null;
  if i.reviewer_identity_id is null or (p_ceremony='registration' and cap.scope='enrollment' and i.state not in ('pending','active'))
    or (p_ceremony='registration' and cap.scope='recovery' and i.state not in ('pending','active','disabled'))
    or (p_ceremony='assertion' and (i.state<>'active' or not review_private.reviewer_has_two_active_credentials(i.reviewer_identity_id))) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  if cap.scope='appeal' and not (exists(select 1 from review_private.review_appeals a where a.case_id=cap.case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')
    or exists(select 1 from review_private.restriction_appeals a join review_private.review_restrictions r on r.restriction_id=a.restriction_id where r.source_case_id=cap.case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  request_hash:=extensions.digest(convert_to(concat_ws('|',cap.capability_id,p_ceremony),'utf8'),'sha256');
  select * into c from review_private.reviewer_credential_challenges where idempotency_key=p_idempotency_key;
  if found then
    if c.capability_id<>cap.capability_id or c.ceremony<>p_ceremony or c.request_digest<>request_hash then raise exception using errcode='22023',message='reviewer_challenge_idempotency_reused'; end if;
    return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state',case when c.consumed_at is null then 'pending' else 'consumed' end);
  end if;
  if exists(select 1 from review_private.reviewer_credential_challenges x where x.capability_id=cap.capability_id) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  insert into review_private.reviewer_credential_challenges(reviewer_identity_id,case_id,ceremony,idempotency_key,request_digest,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at,capability_id)
    values(i.reviewer_identity_id,cap.case_id,p_ceremony,p_idempotency_key,request_hash,nonce,extensions.digest(nonce,'sha256'),cfg.rp_id,cfg.expected_origin,least(cap.expires_at,statement_timestamp()+interval '5 minutes'),cap.capability_id) returning * into c;
  return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state','pending');
end $$;
alter function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) from public,anon;
grant execute on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) to authenticated;
revoke all on function app_public.reviews_request_reviewer_credential_challenge(uuid,uuid,text,uuid) from authenticated;

create function review_private.bind_reviewer_capability() returns trigger language plpgsql security definer set search_path='' as $$
begin
  select capability_id into new.capability_id from review_private.reviewer_credential_challenges where challenge_id=new.challenge_id;
  if new.capability_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  return new;
end $$;
alter function review_private.bind_reviewer_capability() owner to review_automation;
create trigger reviewer_assertion_bind_capability before insert on review_private.reviewer_assertion_receipts for each row execute function review_private.bind_reviewer_capability();

create function review_private.consume_registration_capability() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update review_private.reviewer_management_capabilities set state='consumed',consumed_at=statement_timestamp()
    where capability_id=(select capability_id from review_private.reviewer_credential_challenges where challenge_id=new.registration_challenge_id) and state='active';
  if not found then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if; return new;
end $$;
alter function review_private.consume_registration_capability() owner to review_automation;
create trigger reviewer_registration_consume_capability after insert on review_private.reviewer_credentials for each row execute function review_private.consume_registration_capability();

create function review_private.consume_assertion_capability() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.consumed_at is null and new.consumed_at is not null and new.capability_id is not null then
    update review_private.reviewer_management_capabilities set state='consumed',consumed_at=new.consumed_at where capability_id=new.capability_id and state='active';
  end if; return new;
end $$;
alter function review_private.consume_assertion_capability() owner to review_automation;
create trigger reviewer_assertion_consume_capability after update on review_private.reviewer_assertion_receipts for each row execute function review_private.consume_assertion_capability();

create function app_public.reviews_manage_reviewer_credentials(p_operation text,p_capability_token text,p_credential_record_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; proof review_private.reviewer_assertion_receipts%rowtype; prior review_private.reviewer_credential_command_receipts%rowtype; digest bytea; result jsonb; cnt integer;
begin
  if p_operation not in ('list','revoke') or p_capability_token !~ '^[A-Za-z0-9_-]{32,512}$' or (p_operation='list' and p_credential_record_id is not null) or (p_operation='revoke' and p_credential_record_id is null) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into cap from review_private.reviewer_management_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_operation,cap.capability_id,coalesce(p_credential_record_id::text,'')),'utf8'),'sha256');
  select * into prior from review_private.reviewer_credential_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.input_digest<>digest then raise exception using errcode='22023',message='reviewer_credential_idempotency_reused'; end if; return prior.result; end if;
  if cap.capability_id is null or cap.scope<>'management' or cap.state<>'active' or cap.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into proof from review_private.reviewer_assertion_receipts where capability_id=cap.capability_id and consumed_at is null and expires_at>statement_timestamp() for update;
  if proof.assertion_receipt_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  if p_operation='list' then
    result:=jsonb_build_object('credentials',coalesce((select jsonb_agg(jsonb_build_object('credentialRecordId',c.credential_record_id,'state',c.state,'verifiedAt',c.verified_at) order by c.verified_at) from review_private.reviewer_credentials c where c.reviewer_identity_id=cap.reviewer_identity_id),'[]'::jsonb));
  else
    update review_private.reviewer_credentials set state='revoked',revoked_at=statement_timestamp(),revocation_reason='capability_authorized' where credential_record_id=p_credential_record_id and reviewer_identity_id=cap.reviewer_identity_id and state='active';
    if not found then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
    update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where credential_record_id=p_credential_record_id and consumed_at is null and assertion_receipt_id<>proof.assertion_receipt_id;
    select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=cap.reviewer_identity_id and state='active';
    update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then state else 'disabled' end where reviewer_identity_id=cap.reviewer_identity_id;
    result:=jsonb_build_object('credentialRecordId',p_credential_record_id,'state','revoked','reviewerState',case when cnt>=2 then 'active' else 'disabled' end);
  end if;
  update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=proof.assertion_receipt_id;
  insert into review_private.reviewer_credential_command_receipts(idempotency_key,operation,credential_record_id,capability_id,input_digest,result) values(p_idempotency_key,p_operation,p_credential_record_id,cap.capability_id,digest,result);
  return result;
end $$;
alter function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) owner to review_automation;
revoke all on function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) from public,anon;
grant execute on function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) to authenticated;
revoke all on function app_public.reviews_revoke_reviewer_credential(uuid,uuid) from authenticated;

create function review_private.purge_reviewer_management_capabilities(p_now timestamptz default statement_timestamp(),p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_count integer; purged_count integer; revoked_capabilities integer; revoked_credentials integer; challenges_purged integer;
begin
  update review_private.reviewer_management_capabilities c set state='revoked',revoked_at=p_now
    from review_private.reviewer_identities i where i.reviewer_identity_id=c.reviewer_identity_id and c.state='active' and (i.user_id is null or i.relationship_ended_at is not null);
  get diagnostics revoked_capabilities=row_count;
  with ended as (select reviewer_identity_id from review_private.reviewer_identities where user_id is null or relationship_ended_at is not null for update),
  revoked as (update review_private.reviewer_credentials c set state='revoked',revoked_at=p_now,revocation_reason='reviewer_lifecycle_ended' from ended e where c.reviewer_identity_id=e.reviewer_identity_id and c.state='active' returning c.credential_record_id,c.reviewer_identity_id)
  select count(*) into revoked_credentials from revoked;
  update review_private.reviewer_assertion_receipts a set consumed_at=p_now where a.consumed_at is null and exists(select 1 from review_private.reviewer_credentials c join review_private.reviewer_identities i using(reviewer_identity_id) where c.credential_record_id=a.credential_record_id and (i.user_id is null or i.relationship_ended_at is not null));
  update review_private.reviewer_identities set state='ended',active_credential_count=0,assertion_verified_at=null,relationship_ended_at=coalesce(relationship_ended_at,p_now) where user_id is null or relationship_ended_at is not null;
  update review_private.reviewer_credential_challenges set challenge_nonce=null where challenge_nonce is not null and coalesce(consumed_at,expires_at)<=p_now-interval '24 hours';
  get diagnostics challenges_purged=row_count;
  with due as (select capability_id from review_private.reviewer_management_capabilities where state='active' and expires_at<=p_now order by expires_at limit least(greatest(p_limit,1),1000) for update skip locked)
  update review_private.reviewer_management_capabilities c set state='expired',revoked_at=p_now from due where c.capability_id=due.capability_id;
  get diagnostics expired_count=row_count;
  with due as (select capability_id,state from review_private.reviewer_management_capabilities where state in ('consumed','revoked','expired') and coalesce(consumed_at,revoked_at,expires_at)<=p_now-interval '24 hours' order by created_at limit least(greatest(p_limit,1),1000) for update skip locked),
  receipts as (insert into review_private.reviewer_capability_purge_receipts(capability_id,prior_state,outcome_digest,purged_at) select capability_id,state,extensions.digest(convert_to(concat_ws('|',capability_id,state,p_now),'utf8'),'sha256'),p_now from due on conflict(capability_id) do nothing returning capability_id)
  update review_private.reviewer_management_capabilities c set state='purged',token_hash=null,purged_at=p_now from receipts r where c.capability_id=r.capability_id;
  get diagnostics purged_count=row_count;
  return jsonb_build_object('expired',expired_count,'purged',purged_count,'capabilitiesRevoked',revoked_capabilities,'credentialsRevoked',revoked_credentials,'challengesPurged',challenges_purged);
end $$;
alter function review_private.purge_reviewer_management_capabilities(timestamptz,integer) owner to review_automation;
revoke all on function review_private.purge_reviewer_management_capabilities(timestamptz,integer) from public,anon,authenticated;
grant execute on function review_private.purge_reviewer_management_capabilities(timestamptz,integer) to review_lifecycle_service;

create or replace function review_private.revoke_reviewer_verifier(p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_reason !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'reviewer_verifier_revocation_invalid'; end if;
  update review_private.reviewer_verifier_config set state='revoked',revoked_at=statement_timestamp(),version=version+1 where singleton;
  update review_private.reviewer_identities set state='disabled',assertion_verified_at=null where state='active';
  update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where consumed_at is null;
  update review_private.reviewer_management_capabilities set state='revoked',revoked_at=statement_timestamp() where state='active';
end $$;
alter function review_private.revoke_reviewer_verifier(text) owner to review_automation;

create or replace function app_public.run_due_review_lifecycle(p_now timestamptz,p_limit integer default 100)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare finalized integer; restrictions integer; review_appeals integer; restriction_appeals integer; capabilities jsonb;
begin
  if p_now is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='review_lifecycle_input_invalid'; end if;
  finalized:=review_private.finalize_review_deletions(p_now,p_limit);
  with due as (select restriction_id from review_private.review_restrictions where state='active' and expires_at is not null and expires_at<=p_now order by expires_at for update skip locked limit p_limit)
  update review_private.review_restrictions r set state='expired',ended_at=p_now,version=version+1 from due where r.restriction_id=due.restriction_id;
  get diagnostics restrictions=row_count;
  with due as (select appeal_id from review_private.review_appeals where state in ('submitted','assigned') and deadline_at<=p_now order by deadline_at for update skip locked limit p_limit)
  update review_private.review_appeals a set state='expired',decided_at=p_now from due where a.appeal_id=due.appeal_id;
  get diagnostics review_appeals=row_count;
  with due as (select appeal_id from review_private.restriction_appeals where state in ('submitted','assigned') and deadline_at<=p_now order by deadline_at for update skip locked limit p_limit)
  update review_private.restriction_appeals a set state='expired',decided_at=p_now from due where a.appeal_id=due.appeal_id;
  get diagnostics restriction_appeals=row_count;
  capabilities:=review_private.purge_reviewer_management_capabilities(p_now,p_limit);
  if finalized+restrictions+review_appeals+restriction_appeals+coalesce((capabilities->>'expired')::integer,0)+coalesce((capabilities->>'purged')::integer,0)>0 then
    perform review_private.append_audit('review_lifecycle_sweep',null,null,null,'expired',jsonb_build_object('reviewsFinalized',finalized,'restrictionsExpired',restrictions,'appealsExpired',review_appeals+restriction_appeals,'capabilitiesExpired',capabilities->'expired','capabilitiesPurged',capabilities->'purged'));
  end if;
  return jsonb_build_object('reviewsFinalized',finalized,'restrictionsExpired',restrictions,'appealsExpired',review_appeals+restriction_appeals,'capabilitiesExpired',capabilities->'expired','capabilitiesPurged',capabilities->'purged');
end $$;
alter function app_public.run_due_review_lifecycle(timestamptz,integer) owner to review_automation;
revoke all on function app_public.run_due_review_lifecycle(timestamptz,integer) from public,anon,authenticated;
grant execute on function app_public.run_due_review_lifecycle(timestamptz,integer) to account_lifecycle_service;

revoke create on schema review_private,app_public from review_automation;
revoke review_automation,review_credential_capability_service from postgres;
