-- Package 9 final reviewer credential boundary: a setup/recovery capability
-- completes exactly two registrations, capability RPCs require no account
-- session, and retired credentials leave only a 90-day keyed reuse marker.

grant review_automation,review_credential_configurator to postgres;
grant create on schema review_private,app_public to review_automation;

alter table review_private.reviewer_management_capabilities
  add column registration_target_count smallint not null default 2,
  add column registration_completed_count smallint not null default 0;
update review_private.reviewer_management_capabilities
set registration_completed_count=2
where scope in ('enrollment','recovery') and state='consumed';
alter table review_private.reviewer_management_capabilities
  add constraint reviewer_capability_registration_progress check(
    (scope in ('enrollment','recovery') and registration_target_count=2 and registration_completed_count between 0 and 2)
    or (scope not in ('enrollment','recovery') and registration_target_count=2 and registration_completed_count=0)
  );
create unique index one_live_reviewer_setup_capability
  on review_private.reviewer_management_capabilities(reviewer_identity_id)
  where state='active' and scope in ('enrollment','recovery');

create table review_private.reviewer_credential_reuse_keys(
  key_version bigint primary key check(key_version>0),
  environment text not null check(environment ~ '^[a-z][a-z0-9_-]{1,63}$'),
  key_material bytea not null check(octet_length(key_material) between 32 and 64),
  evidence_digest bytea not null check(octet_length(evidence_digest)=32),
  state text not null check(state in ('active','retired')),
  accepted_at timestamptz not null default statement_timestamp(),
  retire_after timestamptz,
  check((state='active' and retire_after is null) or (state='retired' and retire_after is not null and retire_after<=accepted_at+interval '90 days'))
);
create unique index one_active_reviewer_reuse_key on review_private.reviewer_credential_reuse_keys((state)) where state='active';

create table review_private.reviewer_credential_reuse_markers(
  reuse_hmac bytea not null check(octet_length(reuse_hmac)=32),
  key_version bigint not null references review_private.reviewer_credential_reuse_keys(key_version) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  purge_after timestamptz not null,
  primary key(reuse_hmac,key_version),
  check(purge_after>created_at and purge_after<=created_at+interval '90 days')
);

do $$ declare t text; begin
  foreach t in array array['reviewer_credential_reuse_keys','reviewer_credential_reuse_markers'] loop
    execute format('alter table review_private.%I enable row level security',t);
    execute format('alter table review_private.%I force row level security',t);
    execute format('revoke all on review_private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update,delete on review_private.%I to review_automation',t);
    execute format('create policy review_automation_%I on review_private.%I for all to review_automation using(true) with check(true)',t,t);
  end loop;
end $$;

create function review_private.configure_reviewer_credential_reuse_key(
  p_environment text,p_key_version bigint,p_key_material bytea,p_evidence_digest bytea
) returns bigint language plpgsql security definer set search_path='' as $$
declare prior review_private.reviewer_credential_reuse_keys%rowtype;
begin
  select * into prior from review_private.reviewer_credential_reuse_keys where key_version=p_key_version;
  if found then
    if prior.environment<>p_environment or prior.key_material<>p_key_material or prior.evidence_digest<>p_evidence_digest then
      raise exception using errcode='22023',message='reviewer_reuse_key_version_conflict';
    end if;
    return prior.key_version;
  end if;
  if p_environment !~ '^[a-z][a-z0-9_-]{1,63}$' or p_key_version<=0 or octet_length(p_key_material) not between 32 and 64 or octet_length(p_evidence_digest)<>32 then
    raise exception using errcode='22023',message='reviewer_reuse_key_invalid';
  end if;
  update review_private.reviewer_credential_reuse_keys
    set state='retired',retire_after=least(statement_timestamp()+interval '90 days',accepted_at+interval '90 days')
    where state='active';
  insert into review_private.reviewer_credential_reuse_keys(key_version,environment,key_material,evidence_digest,state)
    values(p_key_version,p_environment,p_key_material,p_evidence_digest,'active');
  return p_key_version;
end $$;
alter function review_private.configure_reviewer_credential_reuse_key(text,bigint,bytea,bytea) owner to review_automation;
revoke all on function review_private.configure_reviewer_credential_reuse_key(text,bigint,bytea,bytea) from public,anon,authenticated;
grant execute on function review_private.configure_reviewer_credential_reuse_key(text,bigint,bytea,bytea) to review_credential_configurator;

drop trigger reviewer_credentials_no_delete on review_private.reviewer_credentials;
drop trigger reviewer_credential_commands_immutable on review_private.reviewer_credential_command_receipts;

create function review_private.guard_reviewer_credential_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(
    select 1 from review_private.reviewer_credential_reuse_markers m
    join review_private.reviewer_credential_reuse_keys k using(key_version)
    where m.reuse_hmac=extensions.hmac(convert_to(k.environment||'|'||encode(old.credential_id_digest,'hex'),'utf8'),k.key_material,'sha256')
      and m.purge_after>statement_timestamp()
  ) then raise exception using errcode='42501',message='reviewer_credential_retirement_denied'; end if;
  return old;
end $$;
alter function review_private.guard_reviewer_credential_delete() owner to review_automation;
create trigger reviewer_credentials_guarded_delete before delete on review_private.reviewer_credentials for each row execute function review_private.guard_reviewer_credential_delete();

create function review_private.retire_reviewer_credential(p_credential_record_id uuid,p_now timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare cred review_private.reviewer_credentials%rowtype; k review_private.reviewer_credential_reuse_keys%rowtype; marker bytea;
begin
  select * into cred from review_private.reviewer_credentials where credential_record_id=p_credential_record_id for update;
  if not found then return null; end if;
  select * into k from review_private.reviewer_credential_reuse_keys where state='active' for update;
  if not found then raise exception using errcode='55000',message='reviewer_credential_reuse_key_unavailable'; end if;
  marker:=extensions.hmac(convert_to(k.environment||'|'||encode(cred.credential_id_digest,'hex'),'utf8'),k.key_material,'sha256');
  insert into review_private.reviewer_credential_reuse_markers(reuse_hmac,key_version,created_at,purge_after)
    values(marker,k.key_version,p_now,p_now+interval '90 days')
    on conflict(reuse_hmac,key_version) do update set purge_after=greatest(review_private.reviewer_credential_reuse_markers.purge_after,excluded.purge_after);
  update review_private.reviewer_assertion_receipts set consumed_at=coalesce(consumed_at,p_now),credential_record_id=null where credential_record_id=cred.credential_record_id;
  update review_private.reviewer_credential_command_receipts r set credential_record_id=null,input_digest=null,result=jsonb_build_object('state','expired')
    where r.capability_id in (select capability_id from review_private.reviewer_management_capabilities where reviewer_identity_id=cred.reviewer_identity_id);
  delete from review_private.reviewer_credentials where credential_record_id=cred.credential_record_id;
  return cred.reviewer_identity_id;
end $$;
alter function review_private.retire_reviewer_credential(uuid,timestamptz) owner to review_automation;
revoke all on function review_private.retire_reviewer_credential(uuid,timestamptz) from public,anon,authenticated;

create or replace function review_private.issue_reviewer_management_capability(
  p_reviewer_identity_id uuid,p_scope text,p_case_id uuid,p_token_hash bytea,p_delivery_verification_id text,p_expires_at timestamptz,p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior review_private.reviewer_management_capabilities%rowtype; cid uuid; old_credential record;
begin
  select * into prior from review_private.reviewer_management_capabilities where issuance_idempotency_key=p_idempotency_key;
  if found then
    if prior.reviewer_identity_id<>p_reviewer_identity_id or prior.scope<>p_scope or prior.case_id is distinct from p_case_id or prior.token_hash<>p_token_hash or prior.delivery_verification_id<>p_delivery_verification_id or prior.expires_at<>p_expires_at then raise exception using errcode='22023',message='reviewer_capability_idempotency_reused'; end if;
    return prior.capability_id;
  end if;
  if p_scope not in ('enrollment','management','recovery','appeal') or octet_length(p_token_hash)<>32
    or p_delivery_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_expires_at<=statement_timestamp() or p_expires_at>statement_timestamp()+interval '30 minutes'
    or (p_scope='management' and p_expires_at>statement_timestamp()+interval '10 minutes') or ((p_scope='appeal')<>(p_case_id is not null))
    or not exists(select 1 from review_private.reviewer_identities where reviewer_identity_id=p_reviewer_identity_id and relationship_ended_at is null)
    or (p_scope in ('enrollment','recovery') and not exists(select 1 from review_private.reviewer_credential_reuse_keys where state='active'))
    or (p_scope in ('enrollment','recovery') and exists(select 1 from review_private.reviewer_management_capabilities where reviewer_identity_id=p_reviewer_identity_id and scope in ('enrollment','recovery') and state='active')) then
    raise exception using errcode='22023',message='reviewer_capability_issue_invalid'; end if;
  if p_scope='enrollment' and exists(select 1 from review_private.reviewer_credentials where reviewer_identity_id=p_reviewer_identity_id) then
    raise exception using errcode='42501',message='reviewer_credential_unavailable';
  end if;
  if p_scope='recovery' then
    update review_private.reviewer_management_capabilities set state='revoked',revoked_at=statement_timestamp()
      where reviewer_identity_id=p_reviewer_identity_id and state='active';
    for old_credential in select credential_record_id from review_private.reviewer_credentials where reviewer_identity_id=p_reviewer_identity_id for update loop
      perform review_private.retire_reviewer_credential(old_credential.credential_record_id,statement_timestamp());
    end loop;
    update review_private.reviewer_identities set state='pending',active_credential_count=0,assertion_verified_at=null where reviewer_identity_id=p_reviewer_identity_id;
  end if;
  insert into review_private.reviewer_management_capabilities(reviewer_identity_id,scope,case_id,token_hash,delivery_verification_id,issuance_idempotency_key,expires_at)
    values(p_reviewer_identity_id,p_scope,p_case_id,p_token_hash,p_delivery_verification_id,p_idempotency_key,p_expires_at) returning capability_id into cid;
  return cid;
end $$;
alter function review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamptz,uuid) owner to review_automation;

create or replace function app_public.reviews_request_reviewer_capability_challenge(p_capability_token text,p_ceremony text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; i review_private.reviewer_identities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; c review_private.reviewer_credential_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32); request_hash bytea;
begin
  if p_capability_token !~ '^[A-Za-z0-9_-]{32,512}$' or p_ceremony not in ('registration','assertion') then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into cap from review_private.reviewer_management_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  request_hash:=extensions.digest(convert_to(concat_ws('|',cap.capability_id,p_ceremony),'utf8'),'sha256');
  select * into c from review_private.reviewer_credential_challenges where idempotency_key=p_idempotency_key;
  if found then
    if c.capability_id<>cap.capability_id or c.ceremony<>p_ceremony or c.request_digest<>request_hash then raise exception using errcode='22023',message='reviewer_challenge_idempotency_reused'; end if;
    return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state',case when c.consumed_at is null then 'pending' else 'consumed' end);
  end if;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if cap.state<>'active' or cap.expires_at<=statement_timestamp() or cfg.singleton is null
    or (p_ceremony='registration' and (cap.scope not in ('enrollment','recovery') or cap.registration_completed_count>=cap.registration_target_count))
    or (p_ceremony='assertion' and cap.scope not in ('management','appeal')) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into i from review_private.reviewer_identities where reviewer_identity_id=cap.reviewer_identity_id and relationship_ended_at is null;
  if i.reviewer_identity_id is null or (p_ceremony='registration' and i.state not in ('pending','active','disabled'))
    or (p_ceremony='assertion' and (i.state<>'active' or not review_private.reviewer_has_two_active_credentials(i.reviewer_identity_id))) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  if cap.scope='appeal' and not (exists(select 1 from review_private.review_appeals a where a.case_id=cap.case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')
    or exists(select 1 from review_private.restriction_appeals a join review_private.review_restrictions r on r.restriction_id=a.restriction_id where r.source_case_id=cap.case_id and a.assigned_reviewer_identity_id=i.reviewer_identity_id and a.state='assigned')) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp()
    where capability_id=cap.capability_id and ceremony=p_ceremony and consumed_at is null and expires_at<=statement_timestamp();
  if exists(select 1 from review_private.reviewer_credential_challenges where capability_id=cap.capability_id and ceremony=p_ceremony and consumed_at is null) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  insert into review_private.reviewer_credential_challenges(reviewer_identity_id,case_id,ceremony,idempotency_key,request_digest,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at,capability_id)
    values(i.reviewer_identity_id,cap.case_id,p_ceremony,p_idempotency_key,request_hash,nonce,extensions.digest(nonce,'sha256'),cfg.rp_id,cfg.expected_origin,least(cap.expires_at,statement_timestamp()+interval '5 minutes'),cap.capability_id) returning * into c;
  return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state','pending');
end $$;
alter function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) from public,authenticated;
grant execute on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) to anon;

create or replace function review_private.consume_registration_capability() returns trigger language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; next_count smallint;
begin
  select c.* into cap from review_private.reviewer_management_capabilities c join review_private.reviewer_credential_challenges h on h.capability_id=c.capability_id
    where h.challenge_id=new.registration_challenge_id for update of c;
  if cap.capability_id is null or cap.scope not in ('enrollment','recovery') or cap.state<>'active' or cap.expires_at<=statement_timestamp() or cap.registration_completed_count>=cap.registration_target_count then
    raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  next_count:=cap.registration_completed_count+1;
  update review_private.reviewer_management_capabilities set registration_completed_count=next_count,
    state=case when next_count=registration_target_count then 'consumed' else state end,
    consumed_at=case when next_count=registration_target_count then statement_timestamp() else consumed_at end
    where capability_id=cap.capability_id;
  return new;
end $$;
alter function review_private.consume_registration_capability() owner to review_automation;

create or replace function review_private.complete_reviewer_registration(
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
    or p_provider_credential_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or exists(select 1 from review_private.reviewer_credential_reuse_markers m join review_private.reviewer_credential_reuse_keys k using(key_version)
      where m.purge_after>statement_timestamp() and m.reuse_hmac=extensions.hmac(convert_to(k.environment||'|'||encode(p_credential_id_digest,'hex'),'utf8'),k.key_material,'sha256')) then
    raise exception using errcode='42501',message='reviewer_registration_verification_invalid'; end if;
  insert into review_private.reviewer_credentials(reviewer_identity_id,credential_id_digest,public_key_digest,provider_credential_id,provider_verification_id,discoverable,sign_count,registration_challenge_id)
    values(c.reviewer_identity_id,p_credential_id_digest,p_public_key_digest,p_provider_credential_id,p_provider_verification_id,false,p_sign_count,c.challenge_id) returning credential_record_id into crid;
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=c.reviewer_identity_id and state='active' and not discoverable;
  update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then 'active' else 'pending' end where reviewer_identity_id=c.reviewer_identity_id;
  return jsonb_build_object('credentialRecordId',crid,'state',case when cnt>=2 then 'active' else 'pending' end);
end $$;
alter function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint) owner to review_automation;

create or replace function app_public.reviews_manage_reviewer_credentials(p_operation text,p_capability_token text,p_credential_record_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; proof review_private.reviewer_assertion_receipts%rowtype; prior review_private.reviewer_credential_command_receipts%rowtype; target review_private.reviewer_credentials%rowtype; input_hash bytea; result jsonb; cnt integer;
begin
  if p_operation not in ('list','revoke') or p_capability_token !~ '^[A-Za-z0-9_-]{32,512}$' or (p_operation='list' and p_credential_record_id is not null) or (p_operation='revoke' and p_credential_record_id is null) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into cap from review_private.reviewer_management_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  if cap.capability_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  input_hash:=extensions.digest(convert_to(concat_ws('|',p_operation,cap.capability_id,coalesce(p_credential_record_id::text,'')),'utf8'),'sha256');
  select * into prior from review_private.reviewer_credential_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.input_digest<>input_hash then raise exception using errcode='22023',message='reviewer_credential_idempotency_reused'; end if; return prior.result; end if;
  if cap.scope<>'management' or cap.state<>'active' or cap.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into proof from review_private.reviewer_assertion_receipts where capability_id=cap.capability_id and consumed_at is null and expires_at>statement_timestamp() for update;
  if proof.assertion_receipt_id is null then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  if p_operation='list' then
    result:=jsonb_build_object('credentials',coalesce((select jsonb_agg(jsonb_build_object('credentialRecordId',c.credential_record_id,'state',c.state,'verifiedAt',c.verified_at) order by c.verified_at) from review_private.reviewer_credentials c where c.reviewer_identity_id=cap.reviewer_identity_id),'[]'::jsonb));
  else
    select * into target from review_private.reviewer_credentials where credential_record_id=p_credential_record_id and reviewer_identity_id=cap.reviewer_identity_id and state='active' for update;
    if not found then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
    perform review_private.retire_reviewer_credential(target.credential_record_id,statement_timestamp());
    select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=cap.reviewer_identity_id and state='active';
    update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then state else 'disabled' end,assertion_verified_at=case when cnt>=2 then assertion_verified_at else null end where reviewer_identity_id=cap.reviewer_identity_id;
    result:=jsonb_build_object('state','revoked','reviewerState',case when cnt>=2 then 'active' else 'disabled' end);
  end if;
  update review_private.reviewer_assertion_receipts set consumed_at=statement_timestamp() where assertion_receipt_id=proof.assertion_receipt_id;
  insert into review_private.reviewer_credential_command_receipts(idempotency_key,operation,credential_record_id,capability_id,input_digest,result) values(p_idempotency_key,p_operation,null,cap.capability_id,input_hash,result);
  return result;
end $$;
alter function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) owner to review_automation;
revoke all on function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) from public,authenticated;
grant execute on function app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid) to anon;

create or replace function review_private.purge_reviewer_management_capabilities(p_now timestamptz default statement_timestamp(),p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' as $$
declare expired_count integer; purged_count integer; revoked_capabilities integer; retired_credentials integer:=0; challenges_purged integer; markers_purged integer; old_credential record;
begin
  update review_private.reviewer_management_capabilities c set state='revoked',revoked_at=p_now
    from review_private.reviewer_identities i where i.reviewer_identity_id=c.reviewer_identity_id and c.state='active' and (i.user_id is null or i.relationship_ended_at is not null);
  get diagnostics revoked_capabilities=row_count;
  for old_credential in select c.credential_record_id from review_private.reviewer_credentials c join review_private.reviewer_identities i using(reviewer_identity_id)
    where i.user_id is null or i.relationship_ended_at is not null order by c.credential_record_id for update of c skip locked limit least(greatest(p_limit,1),1000) loop
    perform review_private.retire_reviewer_credential(old_credential.credential_record_id,p_now); retired_credentials:=retired_credentials+1;
  end loop;
  update review_private.reviewer_identities set state='ended',active_credential_count=0,assertion_verified_at=null,relationship_ended_at=coalesce(relationship_ended_at,p_now) where user_id is null or relationship_ended_at is not null;
  update review_private.reviewer_credentials c set registration_challenge_id=null from review_private.reviewer_credential_challenges h
    where c.registration_challenge_id=h.challenge_id and coalesce(h.consumed_at,h.expires_at)<=p_now-interval '24 hours';
  update review_private.reviewer_assertion_receipts a set challenge_id=null where exists(select 1 from review_private.reviewer_credential_challenges h where h.challenge_id=a.challenge_id and coalesce(h.consumed_at,h.expires_at)<=p_now-interval '24 hours');
  delete from review_private.reviewer_credential_challenges where coalesce(consumed_at,expires_at)<=p_now-interval '24 hours';
  get diagnostics challenges_purged=row_count;
  with due as (select capability_id from review_private.reviewer_management_capabilities where state='active' and expires_at<=p_now order by expires_at limit least(greatest(p_limit,1),1000) for update skip locked)
  update review_private.reviewer_management_capabilities c set state='expired',revoked_at=p_now from due where c.capability_id=due.capability_id;
  get diagnostics expired_count=row_count;
  with due as (select capability_id,state from review_private.reviewer_management_capabilities where state in ('consumed','revoked','expired') and coalesce(consumed_at,revoked_at,expires_at)<=p_now-interval '24 hours' order by created_at limit least(greatest(p_limit,1),1000) for update skip locked),
  receipts as (insert into review_private.reviewer_capability_purge_receipts(capability_id,prior_state,outcome_digest,purged_at) select capability_id,state,extensions.digest(convert_to(concat_ws('|',capability_id,state,p_now),'utf8'),'sha256'),p_now from due on conflict(capability_id) do nothing returning capability_id)
  update review_private.reviewer_management_capabilities c set state='purged',token_hash=null,purged_at=p_now from receipts r where c.capability_id=r.capability_id;
  get diagnostics purged_count=row_count;
  with due as (select reuse_hmac,key_version from review_private.reviewer_credential_reuse_markers where purge_after<=p_now order by purge_after limit least(greatest(p_limit,1),1000) for update skip locked)
  delete from review_private.reviewer_credential_reuse_markers m using due where m.reuse_hmac=due.reuse_hmac and m.key_version=due.key_version;
  get diagnostics markers_purged=row_count;
  delete from review_private.reviewer_credential_reuse_keys k where state='retired' and retire_after<=p_now and not exists(select 1 from review_private.reviewer_credential_reuse_markers m where m.key_version=k.key_version);
  return jsonb_build_object('expired',expired_count,'purged',purged_count,'capabilitiesRevoked',revoked_capabilities,'credentialsRetired',retired_credentials,'challengesPurged',challenges_purged,'reuseMarkersPurged',markers_purged);
end $$;
alter function review_private.purge_reviewer_management_capabilities(timestamptz,integer) owner to review_automation;

drop trigger reviewer_challenges_no_delete on review_private.reviewer_credential_challenges;

revoke create on schema review_private,app_public from review_automation;
revoke review_automation,review_credential_configurator from postgres;
