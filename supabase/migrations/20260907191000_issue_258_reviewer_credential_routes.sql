-- Issue #258: expose only verifier-derived WebAuthn allowCredentials to the
-- capability holder. provider_credential_id is an opaque verifier record key,
-- never a browser WebAuthn raw ID.

grant review_automation to postgres;
grant create on schema review_private,app_public to review_automation;

create table review_private.reviewer_verifier_allow_credentials(
  provider_credential_id text primary key,
  allow_credential_id text not null check(char_length(allow_credential_id) between 1 and 8192 and allow_credential_id !~ '[^-A-Za-z0-9_]'),
  verifier_version bigint not null check(verifier_version>0),
  created_at timestamptz not null default statement_timestamp()
);
alter table review_private.reviewer_verifier_allow_credentials enable row level security;
alter table review_private.reviewer_verifier_allow_credentials force row level security;
revoke all on review_private.reviewer_verifier_allow_credentials from public,anon,authenticated,service_role;
grant select,insert,update,delete on review_private.reviewer_verifier_allow_credentials to review_automation;
create policy reviewer_automation_allow_credentials
  on review_private.reviewer_verifier_allow_credentials
  for all to review_automation using(true) with check(true);

alter table review_private.reviewer_credential_challenges
  drop constraint if exists reviewer_credential_challenges_check1;
alter table review_private.reviewer_credential_challenges
  add constraint reviewer_credential_challenges_ceremony_case
  check((ceremony='registration' and case_id is null) or ceremony='assertion');

create or replace function review_private.scrub_reviewer_verifier_allow_credential()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from review_private.reviewer_verifier_allow_credentials
    where provider_credential_id=old.provider_credential_id;
  return old;
end $$;
alter function review_private.scrub_reviewer_verifier_allow_credential() owner to review_automation;
revoke all on function review_private.scrub_reviewer_verifier_allow_credential() from public,anon,authenticated;
drop trigger if exists reviewer_credentials_scrub_verifier_mapping on review_private.reviewer_credentials;
create trigger reviewer_credentials_scrub_verifier_mapping
  after delete on review_private.reviewer_credentials
  for each row execute function review_private.scrub_reviewer_verifier_allow_credential();

set role review_automation;

create or replace function review_private.retire_reviewer_credential(
  p_credential_record_id uuid,p_now timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare cred review_private.reviewer_credentials%rowtype; k review_private.reviewer_credential_reuse_keys%rowtype; marker bytea;
begin
  select * into cred from review_private.reviewer_credentials where credential_record_id=p_credential_record_id for update;
  if not found then return null; end if;
  select * into k from review_private.reviewer_credential_reuse_keys where state='active' for update;
  if not found then raise exception using errcode='55000',message='reviewer_credential_reuse_key_unavailable'; end if;
  marker:=extensions.hmac(convert_to(k.environment||'|'||encode(cred.credential_id_digest,'hex'),'utf8'),k.key_material,'sha256');
  insert into review_private.reviewer_credential_reuse_markers(reuse_hmac,key_version,created_at,purge_after)
    values(marker,k.key_version,p_now,p_now+interval '90 days')
    on conflict(reuse_hmac,key_version) do update
      set created_at=excluded.created_at,purge_after=excluded.purge_after
      where review_private.reviewer_credential_reuse_markers.purge_after<=excluded.created_at;
  update review_private.reviewer_assertion_receipts set consumed_at=coalesce(consumed_at,p_now),credential_record_id=null where credential_record_id=cred.credential_record_id;
  update review_private.reviewer_credential_command_receipts r set credential_record_id=null,input_digest=null,result=jsonb_build_object('state','expired')
    where r.capability_id in (select capability_id from review_private.reviewer_management_capabilities where reviewer_identity_id=cred.reviewer_identity_id);
  delete from review_private.reviewer_credentials where credential_record_id=cred.credential_record_id;
  return cred.reviewer_identity_id;
end $$;
alter function review_private.retire_reviewer_credential(uuid,timestamptz) owner to review_automation;
revoke all on function review_private.retire_reviewer_credential(uuid,timestamptz) from public,anon,authenticated;

reset role;

create or replace function review_private.complete_reviewer_registration(
  p_challenge_id uuid,p_credential_id_digest bytea,p_public_key_digest bytea,
  p_provider_credential_id text,p_provider_verification_id text,p_provider_key_id text,
  p_allow_credential_id text,p_discoverable boolean,p_sign_count bigint
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
    or char_length(p_allow_credential_id) not between 1 and 8192 or p_allow_credential_id ~ '[^-A-Za-z0-9_]' then
    raise exception using errcode='42501',message='reviewer_registration_verification_invalid'; end if;
  delete from review_private.reviewer_credential_reuse_markers m using review_private.reviewer_credential_reuse_keys k
    where k.key_version=m.key_version and m.purge_after<=statement_timestamp()
      and m.reuse_hmac=extensions.hmac(convert_to(k.environment||'|'||encode(p_credential_id_digest,'hex'),'utf8'),k.key_material,'sha256');
  if exists(select 1 from review_private.reviewer_credential_reuse_markers m join review_private.reviewer_credential_reuse_keys k using(key_version)
    where m.purge_after>statement_timestamp() and m.reuse_hmac=extensions.hmac(convert_to(k.environment||'|'||encode(p_credential_id_digest,'hex'),'utf8'),k.key_material,'sha256')) then
    raise exception using errcode='42501',message='reviewer_registration_verification_invalid'; end if;
  insert into review_private.reviewer_credentials(reviewer_identity_id,credential_id_digest,public_key_digest,provider_credential_id,provider_verification_id,discoverable,sign_count,registration_challenge_id)
    values(c.reviewer_identity_id,p_credential_id_digest,p_public_key_digest,p_provider_credential_id,p_provider_verification_id,false,p_sign_count,c.challenge_id) returning credential_record_id into crid;
  insert into review_private.reviewer_verifier_allow_credentials(provider_credential_id,allow_credential_id,verifier_version)
    values(p_provider_credential_id,p_allow_credential_id,cfg.version);
  update review_private.reviewer_credential_challenges set consumed_at=statement_timestamp() where challenge_id=c.challenge_id;
  select count(*) into cnt from review_private.reviewer_credentials where reviewer_identity_id=c.reviewer_identity_id and state='active' and not discoverable;
  update review_private.reviewer_identities set active_credential_count=cnt,state=case when cnt>=2 then 'active' else 'pending' end where reviewer_identity_id=c.reviewer_identity_id;
  return jsonb_build_object('credentialRecordId',crid,'state',case when cnt>=2 then 'active' else 'pending' end);
end $$;
alter function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) owner to review_automation;
revoke all on function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) to review_credential_verifier;

create or replace function app_public.reviews_complete_reviewer_registration(
  p_challenge_id uuid,p_credential_id_digest bytea,p_public_key_digest bytea,
  p_provider_credential_id text,p_provider_verification_id text,p_provider_key_id text,
  p_allow_credential_id text,p_discoverable boolean,p_sign_count bigint
) returns jsonb language sql security definer set search_path='' as $$
  select review_private.complete_reviewer_registration(p_challenge_id,p_credential_id_digest,p_public_key_digest,p_provider_credential_id,p_provider_verification_id,p_provider_key_id,p_allow_credential_id,p_discoverable,p_sign_count);
$$;
alter function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) owner to postgres;
revoke all on function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint) to review_credential_verifier;

set role review_automation;

create or replace function app_public.reviews_request_reviewer_capability_challenge(
  p_capability_token text,p_ceremony text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cap review_private.reviewer_management_capabilities%rowtype; i review_private.reviewer_identities%rowtype; cfg review_private.reviewer_verifier_config%rowtype; c review_private.reviewer_credential_challenges%rowtype; nonce bytea:=extensions.gen_random_bytes(32); request_hash bytea; allow_list jsonb; completed smallint;
begin
  if char_length(p_capability_token) not between 32 and 512 or p_capability_token ~ '[^-A-Za-z0-9_]' or p_ceremony not in ('registration','assertion') then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
  select * into cap from review_private.reviewer_management_capabilities where token_hash=extensions.digest(convert_to(p_capability_token,'utf8'),'sha256') for update;
  request_hash:=extensions.digest(convert_to(concat_ws('|',cap.capability_id,p_ceremony),'utf8'),'sha256');
  select * into c from review_private.reviewer_credential_challenges where idempotency_key=p_idempotency_key;
  if found then
    if c.capability_id<>cap.capability_id or c.ceremony<>p_ceremony or c.request_digest<>request_hash then raise exception using errcode='22023',message='reviewer_challenge_idempotency_reused'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',v.allow_credential_id,'type','public-key') order by cr.verified_at),'[]'::jsonb) into allow_list
      from review_private.reviewer_credentials cr join review_private.reviewer_verifier_allow_credentials v using(provider_credential_id) join review_private.reviewer_verifier_config accepted on accepted.singleton and accepted.state='accepted' and accepted.version=v.verifier_version
      where cr.reviewer_identity_id=c.reviewer_identity_id and cr.state='active' and not cr.discoverable and p_ceremony='assertion';
    select registration_completed_count into completed from review_private.reviewer_management_capabilities where capability_id=c.capability_id;
    return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state',case when c.consumed_at is null then 'pending' else 'consumed' end,'allowCredentials',allow_list,'registrationCompletedCount',coalesce(completed,0),'registrationTargetCount',2);
  end if;
  select * into cfg from review_private.reviewer_verifier_config where singleton and state='accepted';
  if cap.capability_id is null or cap.state<>'active' or cap.expires_at<=statement_timestamp() or cfg.singleton is null
    or (p_ceremony='registration' and (cap.scope not in ('enrollment','recovery') or cap.registration_completed_count>=cap.registration_target_count))
    or (p_ceremony='assertion' and (cap.scope not in ('management','appeal') or not exists(select 1 from review_private.reviewer_credentials cr join review_private.reviewer_verifier_allow_credentials v using(provider_credential_id) where cr.reviewer_identity_id=cap.reviewer_identity_id and cr.state='active' and not cr.discoverable and v.verifier_version=cfg.version))) then raise exception using errcode='42501',message='reviewer_credential_unavailable'; end if;
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
  select coalesce(jsonb_agg(jsonb_build_object('id',v.allow_credential_id,'type','public-key') order by cr.verified_at),'[]'::jsonb) into allow_list
    from review_private.reviewer_credentials cr join review_private.reviewer_verifier_allow_credentials v using(provider_credential_id) where cr.reviewer_identity_id=i.reviewer_identity_id and cr.state='active' and not cr.discoverable and v.verifier_version=cfg.version and p_ceremony='assertion';
  return jsonb_build_object('challengeId',c.challenge_id,'challenge',encode(c.challenge_nonce,'hex'),'rpId',c.rp_id,'origin',c.expected_origin,'expiresAt',c.expires_at,'state','pending','allowCredentials',allow_list,'registrationCompletedCount',cap.registration_completed_count,'registrationTargetCount',cap.registration_target_count);
end $$;
alter function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) owner to review_automation;
revoke all on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) from public,authenticated;
grant execute on function app_public.reviews_request_reviewer_capability_challenge(text,text,uuid) to anon;

reset role;
revoke create on schema review_private,app_public from review_automation;
revoke review_automation from postgres;
