begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(1);
insert into auth.users(id) values
  ('93000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000002'),
  ('93000000-0000-4000-8000-000000000009'),
  ('93000000-0000-4000-8000-00000000000c');
insert into app_private.account_admission_receipts(
  admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,
  provider_user_id,claim_expires_at,state,claimed_at
) values (
  '93000000-0000-4000-8000-000000000003',decode(repeat('01',32),'hex'),'shopper',
  decode(repeat('02',32),'hex'),statement_timestamp(),'cleanup-guard-active',
  '93000000-0000-4000-8000-000000000001',statement_timestamp()+interval '1 hour',
  'active',statement_timestamp()
), (
  '93000000-0000-4000-8000-000000000004',decode(repeat('03',32),'hex'),'shopper',
  decode(repeat('04',32),'hex'),statement_timestamp(),'cleanup-guard-pending',
  '93000000-0000-4000-8000-000000000002',statement_timestamp()+interval '1 hour',
  'verification_pending',statement_timestamp()
);
insert into app_private.account_admission_receipts(
  admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,
  provider_user_id,claim_expires_at,state,claimed_at
) values (
  '93000000-0000-4000-8000-000000000008',decode(repeat('08',32),'hex'),'shopper',
  decode(repeat('09',32),'hex'),statement_timestamp(),'cleanup-guard-stale-pending',
  '93000000-0000-4000-8000-000000000001',statement_timestamp()+interval '1 hour',
  'verification_pending',statement_timestamp()
);
insert into app_private.account_admission_receipts(
  admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,
  provider_user_id,claim_expires_at,state,claimed_at
) values (
  '93000000-0000-4000-8000-00000000000a',decode(repeat('0a',32),'hex'),'shopper',
  decode(repeat('0b',32),'hex'),statement_timestamp(),'cleanup-guard-active-grant',
  '93000000-0000-4000-8000-000000000009',statement_timestamp()+interval '1 hour',
  'verification_pending',statement_timestamp()
);
insert into app_private.role_grants(subject_user_id,role) values
  ('93000000-0000-4000-8000-000000000009','shopper');
insert into app_private.account_admission_receipts(
  admission_id,token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,
  provider_user_id,claim_expires_at,state,claimed_at
) values (
  '93000000-0000-4000-8000-00000000000d',decode(repeat('0c',32),'hex'),'shopper',
  decode(repeat('0d',32),'hex'),statement_timestamp(),'cleanup-guard-granted-after-queue',
  '93000000-0000-4000-8000-00000000000c',statement_timestamp()+interval '1 hour',
  'verification_pending',statement_timestamp()
);
do $test$
declare pending_ticket uuid; protected_ticket uuid;
begin
  if app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-000000000003',
    '93000000-0000-4000-8000-000000000001')->>'state' <> 'blocked' then
    raise exception 'active_account_cleanup_not_blocked';
  end if;
  if app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000001')->>'state' <> 'blocked' then
    raise exception 'mismatched_account_cleanup_not_blocked';
  end if;
  if app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-000000000008',
    '93000000-0000-4000-8000-000000000001')->>'state' <> 'blocked' then
    raise exception 'established_account_stale_receipt_cleanup_not_blocked';
  end if;
  if app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-00000000000a',
    '93000000-0000-4000-8000-000000000009')->>'state' <> 'blocked' then
    raise exception 'active_grant_cleanup_not_blocked';
  end if;
  if exists(select 1 from app_private.registration_cleanup_tickets where provider_user_id=
    '93000000-0000-4000-8000-000000000001') then
    raise exception 'active_account_cleanup_ticket_created';
  end if;
  if app_public.account_registration_fingerprint_mode(
    'cleanup-guard-pending',decode(repeat('05',32),'hex'),
    decode(repeat('04',32),'hex')) <> 'legacy' then
    raise exception 'legacy_receipt_retry_missing';
  end if;
  if app_public.account_registration_fingerprint_mode(
    'different-request-key',decode(repeat('05',32),'hex'),
    decode(repeat('04',32),'hex')) <> 'blocked' then
    raise exception 'legacy_receipt_duplicate_not_blocked';
  end if;
  if app_public.account_registration_fingerprint_mode(
    'different-request-key',decode(repeat('05',32),'hex'),
    decode(repeat('02',32),'hex')) <> 'blocked' then
    raise exception 'active_legacy_account_duplicate_not_blocked';
  end if;
  if app_public.account_registration_fingerprint_mode(
    'new-request-key',decode(repeat('05',32),'hex'),
    decode(repeat('06',32),'hex')) <> 'current' then
    raise exception 'new_registration_not_keyed';
  end if;
  if app_public.account_registration_fingerprint_mode(
    'new-request-key',null,decode(repeat('06',32),'hex')) <> 'blocked'
    or app_public.account_registration_fingerprint_mode(
      'new-request-key',decode(repeat('05',32),'hex'),null) <> 'blocked' then
    raise exception 'null_email_fingerprint_not_blocked';
  end if;
  protected_ticket := (app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-00000000000d',
    '93000000-0000-4000-8000-00000000000c')->>'cleanupTicketId')::uuid;
  insert into app_private.role_grants(subject_user_id,role) values
    ('93000000-0000-4000-8000-00000000000c','shopper');
  if app_public.begin_account_registration_cleanup(
    protected_ticket,'93000000-0000-4000-8000-00000000000c')->>'state' <> 'blocked' then
    raise exception 'new_active_grant_cleanup_not_blocked';
  end if;
  if exists(select 1 from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=protected_ticket and state<>'completed_absent') then
    raise exception 'protected_ticket_still_blocks_registration';
  end if;
  if not exists(select 1 from app_private.registration_quarantine_subjects
    where provider_user_id='93000000-0000-4000-8000-00000000000c'
      and resolved_protected_at is not null) then
    raise exception 'protected_cleanup_resolution_not_recorded';
  end if;
  if not exists(select 1 from app_private.profiles
    where user_id='93000000-0000-4000-8000-00000000000c') then
    raise exception 'protected_profile_deleted';
  end if;
  pending_ticket := (app_public.enqueue_account_registration_cleanup(
    '93000000-0000-4000-8000-000000000004',
    '93000000-0000-4000-8000-000000000002')->>'cleanupTicketId')::uuid;
  if pending_ticket is null then
    raise exception 'pending_account_cleanup_missing';
  end if;
  if app_public.begin_account_registration_cleanup(
    pending_ticket,'93000000-0000-4000-8000-000000000002')->>'state' <> 'calling' then
    raise exception 'pending_account_cleanup_not_started';
  end if;
  if exists(select 1 from app_private.profiles
    where user_id='93000000-0000-4000-8000-000000000002') then
    raise exception 'pending_profile_blocks_provider_deletion';
  end if;
  delete from auth.users where id='93000000-0000-4000-8000-000000000002';
  if exists(select 1 from auth.users where id='93000000-0000-4000-8000-000000000002') then
    raise exception 'pending_provider_identity_not_deleted';
  end if;
end $test$;
insert into public_test_private.bindings(
  binding_id,source_sha,artifact_digest,configuration_digest,schema_digest,evidence_digest,
  decision_ref,review_ref,operator_ref,stop_owner,capabilities,store_ids,starts_at,
  expires_at,expected_runtime_version,request_id,spec_digest
) values (
  '93000000-0000-4000-8000-000000000005',repeat('a',40),repeat('b',64),
  repeat('c',64),repeat('d',64),repeat('e',64),'account settings test',
  'https://github.com/samarquis/AntiqueTrail/pull/1','test','test',
  array['registration'],array_fill('93000000-0000-4000-8000-000000000006'::uuid,array[12]),
  statement_timestamp(),statement_timestamp()+interval '1 day',1,
  '93000000-0000-4000-8000-000000000007',decode(repeat('ff',32),'hex')
);
insert into public_test_private.testers(
  binding_id,email,email_hmac,auth_user_id,admission_id,admitted_at
) values (
  '93000000-0000-4000-8000-000000000005','tester@example.test',
  decode(repeat('02',32),'hex'),'93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000003',statement_timestamp()
);
select set_config('request.method','POST',true);
select set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);
do $test$
begin
  perform set_config('request.path','/rpc/account_get_settings',true);
  if not public_test_private.actor_allowed('93000000-0000-4000-8000-000000000001') then
    raise exception 'admitted_tester_settings_read_blocked';
  end if;
  perform set_config('request.path','/rpc/account_update_settings',true);
  if not public_test_private.actor_allowed('93000000-0000-4000-8000-000000000001') then
    raise exception 'admitted_tester_settings_update_blocked';
  end if;
  perform set_config('request.path','/rpc/unknown_account_write',true);
  if public_test_private.actor_allowed('93000000-0000-4000-8000-000000000001') then
    raise exception 'admitted_tester_unknown_route_allowed';
  end if;
end $test$;
select pass('registration cleanup protects established accounts and preserves guarded retries');
select * from finish();
rollback;
