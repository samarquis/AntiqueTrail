-- Normalize account-settings and registration-cleanup RPC errors without changing
-- their owners, grants, retry receipts, locking, or externally visible success shapes.

create or replace function app_public.account_get_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := app_public.request_user_id();
  profile_row app_private.profiles%rowtype;
begin
  if actor is null or nullif(current_setting('request.jwt.claims',true),'') is null
    or not app_private.current_session_is_active() then
    raise exception using errcode='P0001',message='authentication_required';
  end if;
  select * into profile_row from app_private.profiles where user_id=actor;
  if not found then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  return jsonb_build_object('displayName',profile_row.public_display_name,
    'locationAddress',profile_row.private_location_address,'version',profile_row.version);
end; $$;

create or replace function app_public.account_update_settings(
  p_display_name text,p_location_address text,p_expected_version bigint,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := app_public.request_user_id();
  profile_row app_private.profiles%rowtype;
  receipt app_private.account_settings_receipts%rowtype;
  normalized_name text := nullif(pg_catalog.btrim(coalesce(p_display_name,'')),'');
  normalized_address text := nullif(pg_catalog.btrim(coalesce(p_location_address,'')),'');
begin
  if actor is null or nullif(current_setting('request.jwt.claims',true),'') is null
    or not app_private.current_session_is_active() then
    raise exception using errcode='P0001',message='authentication_required';
  end if;
  if p_expected_version is null or p_expected_version<=0 or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  if normalized_name is not null and
    (pg_catalog.char_length(normalized_name)>80 or normalized_name ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  if normalized_address is not null and
    (pg_catalog.char_length(normalized_address)>320 or normalized_address ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='validation_failed';
  end if;

  select * into profile_row from app_private.profiles where user_id=actor for update;
  if not found then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  if not app_private.current_session_is_active() then
    raise exception using errcode='P0001',message='authentication_required';
  end if;

  select * into receipt from app_private.account_settings_receipts
    where user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('state','saved','version',receipt.result_version);
  end if;
  if profile_row.version<>p_expected_version then
    return jsonb_build_object('state','conflict',
      'latest',jsonb_build_object('version',profile_row.version));
  end if;
  update app_private.profiles set public_display_name=normalized_name,
    private_location_address=normalized_address,updated_at=statement_timestamp(),version=version+1
    where user_id=actor returning * into profile_row;
  if not found then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  insert into app_private.account_settings_receipts(user_id,idempotency_key,result_version)
    values(actor,p_idempotency_key,profile_row.version);
  return jsonb_build_object('state','saved','version',profile_row.version);
end; $$;

create or replace function app_public.begin_account_registration_cleanup(
  p_cleanup_ticket_id uuid,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype;
begin
  if p_cleanup_ticket_id is null or p_provider_user_id is null then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id for update;
  if not found then
    raise exception using errcode='P0001',message='provider_unavailable';
  end if;
  if ticket.provider_user_id is distinct from p_provider_user_id then
    raise exception using errcode='P0001',message='not_allowed';
  end if;
  if ticket.state='reconciliation_required' then
    return jsonb_build_object('state','reconciliation_required');
  end if;
  if ticket.state not in ('pending','calling','completed_absent','escalated') then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  if ticket.state<>'pending' then
    raise exception using errcode='P0001',message='conflict';
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
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id
    returning * into ticket;
  if not found then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  return jsonb_build_object('state','calling');
end; $$;

create or replace function app_public.settle_account_registration_cleanup(
  p_cleanup_ticket_id uuid,p_provider_user_id uuid,p_outcome text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; delay_seconds integer;
begin
  if p_cleanup_ticket_id is null or p_provider_user_id is null or p_outcome is null
    or p_outcome not in ('confirmed_deleted','confirmed_not_deleted','unknown') then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id for update;
  if not found then
    raise exception using errcode='P0001',message='conflict';
  end if;
  if ticket.provider_user_id is distinct from p_provider_user_id then
    raise exception using errcode='P0001',message='not_allowed';
  end if;
  if ticket.state not in ('pending','calling','reconciliation_required','completed_absent','escalated') then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  if ticket.state<>'calling' then
    raise exception using errcode='P0001',message='conflict';
  end if;
  if p_outcome='confirmed_not_deleted' then
    if ticket.attempt_count>=ticket.max_attempts then
      update app_private.registration_cleanup_tickets
        set state='escalated',operator_case_id=extensions.gen_random_uuid(),
          last_outcome=p_outcome,updated_at=statement_timestamp()
        where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
      if not found then raise exception using errcode='P0001',message='internal_error'; end if;
      return jsonb_build_object('state','escalated');
    end if;
    delay_seconds:=least(3600,60*(2^(ticket.attempt_count-1))::integer);
    update app_private.registration_cleanup_tickets
      set state='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>delay_seconds),
        call_started_at=null,call_deadline=null,finality_due_at=null,
        last_outcome=p_outcome,updated_at=statement_timestamp()
      where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
    if not found then raise exception using errcode='P0001',message='internal_error'; end if;
    return jsonb_build_object('state','retry');
  end if;
  update app_private.registration_cleanup_tickets
    set state='reconciliation_required',last_outcome=p_outcome,updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
  if not found then raise exception using errcode='P0001',message='internal_error'; end if;
  return jsonb_build_object('state','reconciliation_required');
end; $$;

create or replace function app_public.reconcile_account_registration_cleanup(
  p_cleanup_ticket_id uuid,p_provider_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype; delay_seconds integer; provider_matches integer;
begin
  if p_cleanup_ticket_id is null or p_provider_user_id is null then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id for update;
  if not found then
    raise exception using errcode='P0001',message='conflict';
  end if;
  if ticket.provider_user_id is distinct from p_provider_user_id then
    raise exception using errcode='P0001',message='not_allowed';
  end if;
  if ticket.state not in ('pending','calling','reconciliation_required','completed_absent','escalated') then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  if ticket.state<>'reconciliation_required' then
    raise exception using errcode='P0001',message='conflict';
  end if;
  select count(*) into provider_matches from auth.users where id=ticket.provider_user_id;
  if provider_matches=0 then
    update app_private.registration_cleanup_tickets
      set state='completed_absent',last_outcome='absent',updated_at=statement_timestamp()
      where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
    if not found then raise exception using errcode='P0001',message='internal_error'; end if;
    update app_private.account_admission_receipts
      set state='completed_terminal_cleanup',provider_user_id=null,
        updated_at=statement_timestamp(),version=version+1
      where provider_user_id=p_provider_user_id and state in ('cleanup_pending','orphan_quarantined');
    update app_private.registration_quarantine_subjects
      set resolved_absent_at=statement_timestamp() where provider_user_id=p_provider_user_id;
    return jsonb_build_object('state','completed_terminal_cleanup');
  end if;
  if ticket.attempt_count>=ticket.max_attempts then
    update app_private.registration_cleanup_tickets
      set state='escalated',operator_case_id=extensions.gen_random_uuid(),
        last_outcome='provider_present',updated_at=statement_timestamp()
      where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
    if not found then raise exception using errcode='P0001',message='internal_error'; end if;
    return jsonb_build_object('state','escalated');
  end if;
  delay_seconds:=least(3600,60*(2^(ticket.attempt_count-1))::integer);
  update app_private.registration_cleanup_tickets
    set state='pending',next_attempt_at=statement_timestamp()+make_interval(secs=>delay_seconds),
      call_started_at=null,call_deadline=null,finality_due_at=null,
      last_outcome='provider_present',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id returning * into ticket;
  if not found then raise exception using errcode='P0001',message='internal_error'; end if;
  return jsonb_build_object('state','retry');
end; $$;

create or replace function app_public.resolve_registration_cleanup_operator_case(
  p_cleanup_ticket_id uuid,p_provider_user_id uuid,p_resolution text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ticket app_private.registration_cleanup_tickets%rowtype;
begin
  if p_cleanup_ticket_id is null or p_provider_user_id is null
    or p_resolution is null or p_resolution<>'retry' then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  select * into ticket from app_private.registration_cleanup_tickets
    where cleanup_ticket_id=p_cleanup_ticket_id for update;
  if not found then
    raise exception using errcode='P0001',message='conflict';
  end if;
  if ticket.provider_user_id is distinct from p_provider_user_id then
    raise exception using errcode='P0001',message='not_allowed';
  end if;
  if ticket.state not in ('pending','calling','reconciliation_required','completed_absent','escalated') then
    raise exception using errcode='P0001',message='internal_error';
  end if;
  if ticket.state<>'escalated' then
    raise exception using errcode='P0001',message='conflict';
  end if;
  update app_private.registration_cleanup_tickets
    set state='pending',attempt_count=0,operator_case_id=null,next_attempt_at=statement_timestamp(),
      call_started_at=null,call_deadline=null,finality_due_at=null,
      last_outcome='operator_retry',updated_at=statement_timestamp()
    where cleanup_ticket_id=p_cleanup_ticket_id and provider_user_id=p_provider_user_id
      and state='escalated' returning * into ticket;
  if not found then raise exception using errcode='P0001',message='internal_error'; end if;
  return jsonb_build_object('state','retry');
end; $$;
