alter table app_private.registration_quarantine_subjects
  add column resolved_protected_at timestamptz;

create or replace function app_public.enqueue_account_registration_cleanup(
  p_admission_id uuid,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt app_private.account_admission_receipts%rowtype;
  ticket app_private.registration_cleanup_tickets%rowtype;
  deletion_ticket uuid;
begin
  select * into receipt from app_private.account_admission_receipts
    where admission_id=p_admission_id for update;
  if receipt.admission_id is null or receipt.provider_user_id is distinct from p_provider_user_id
    or receipt.state not in ('provider_pending','provider_created','delivery_pending',
      'verification_pending','cleanup_pending','orphan_quarantined')
    or exists(select 1 from app_private.account_admission_receipts
      where provider_user_id=p_provider_user_id and state='active')
    or exists(select 1 from app_private.role_grants
      where subject_user_id=p_provider_user_id) then
    return jsonb_build_object('state','blocked');
  end if;
  insert into app_private.registration_quarantine_subjects(provider_user_id)
    values(p_provider_user_id)
    on conflict(provider_user_id) do update set provider_user_id=excluded.provider_user_id
    returning deletion_ticket_id into deletion_ticket;
  insert into app_private.registration_cleanup_tickets(
    cleanup_ticket_id,provider_user_id,asserted_admission_id
  ) values(deletion_ticket,p_provider_user_id,p_admission_id)
    on conflict(provider_user_id) do update
      set updated_at=app_private.registration_cleanup_tickets.updated_at
    returning * into ticket;
  update app_private.account_admission_receipts
    set state='orphan_quarantined',provider_user_id=p_provider_user_id,
      cleanup_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
    where admission_id=p_admission_id and state in (
      'provider_pending','provider_created','delivery_pending','verification_pending',
      'cleanup_pending','orphan_quarantined');
  return jsonb_build_object('state',ticket.state,'cleanupTicketId',ticket.cleanup_ticket_id,
    'providerUserId',ticket.provider_user_id);
end; $$;

create or replace function app_public.begin_account_registration_cleanup(
  p_cleanup_ticket_id uuid,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype;
begin
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id for update;
  if ticket.cleanup_ticket_id is null then
    raise exception using errcode='22023',message='registration_cleanup_unavailable';
  end if;
  if ticket.state='reconciliation_required' then
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if ticket.state<>'pending' then
    raise exception using errcode='55000',message='registration_cleanup_unavailable';
  end if;
  if exists(select 1 from app_private.account_admission_receipts
      where provider_user_id=p_provider_user_id and state='active')
    or exists(select 1 from app_private.role_grants
      where subject_user_id=p_provider_user_id) then
    update app_private.registration_quarantine_subjects
      set resolved_protected_at=statement_timestamp()
      where provider_user_id=p_provider_user_id;
    delete from app_private.registration_cleanup_tickets
      where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id;
    return jsonb_build_object('state','blocked');
  end if;
  delete from app_private.profiles where user_id=p_provider_user_id;
  update app_private.registration_cleanup_tickets
    set state='calling',attempt_count=attempt_count+1,
      call_started_at=statement_timestamp(),call_deadline=statement_timestamp()+interval '10 seconds',
      finality_due_at=statement_timestamp()+interval '15 minutes',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id;
  return jsonb_build_object('state','calling');
end; $$;

create function app_public.account_registration_fingerprint_mode(
  p_idempotency_key text,p_keyed_email_hmac bytea,p_legacy_email_digest bytea
) returns text language plpgsql stable security definer set search_path='' as $$
declare existing_digest bytea;
begin
  if p_idempotency_key is null or p_keyed_email_hmac is null
    or p_legacy_email_digest is null or octet_length(p_keyed_email_hmac)<>32
    or octet_length(p_legacy_email_digest)<>32 then
    return 'blocked';
  end if;
  select email_hmac into existing_digest from app_private.account_admission_receipts
    where idempotency_key=p_idempotency_key;
  if found then
    if existing_digest=p_keyed_email_hmac then return 'current'; end if;
    if existing_digest=p_legacy_email_digest then return 'legacy'; end if;
    return 'blocked';
  end if;
  if exists(select 1 from app_private.account_admission_receipts
    where email_hmac in (p_keyed_email_hmac,p_legacy_email_digest)
      and state in ('issued','claimed','provider_pending','provider_created',
        'delivery_pending','verification_pending','active')) then
    return 'blocked';
  end if;
  if exists(select 1 from public_test_private.testers
    where binding_id=public_test_private.active_binding('registration',false)
      and auth_user_id is null and email_hmac=p_legacy_email_digest) then
    return 'legacy';
  end if;
  return 'current';
end; $$;
revoke all on function app_public.account_registration_fingerprint_mode(text,bytea,bytea)
  from public,anon,authenticated;
grant execute on function app_public.account_registration_fingerprint_mode(text,bytea,bytea)
  to service_role;

create or replace function public_test_private.actor_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public_test_private.testers where auth_user_id=p_user_id)
 then true else
  current_setting('request.method',true)='POST' and exists(
   select 1 from public_test_private.runtime r where r.id=1 and r.exact_origin=
    coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'origin'
  ) and (
   (exists(select 1 from public_test_private.testers where auth_user_id=p_user_id
      and admitted_at is not null and admission_id is not null)
    and ltrim(coalesce(current_setting('request.path',true),''),'/') in (
     'rpc/register_current_session','rpc/current_session_is_active','rpc/revoke_current_session',
     'rpc/account_lifecycle_status','rpc/request_account_export','rpc/get_account_export_status',
     'rpc/issue_account_export_download','rpc/request_account_deletion','rpc/cancel_account_deletion',
     'rpc/account_get_settings','rpc/account_update_settings'))
   or (exists(select 1 from public_test_private.testers t
      where t.auth_user_id=p_user_id and t.binding_id=public_test_private.active_binding('saved')
       and t.admission_id is not null and t.admitted_at is not null)
    and ltrim(coalesce(current_setting('request.path',true),''),'/') in (
      'rpc/shopper_list_saved','rpc/shopper_save_state','rpc/shopper_set_save'))
  ) end;
$$;
