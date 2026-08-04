-- Close the Package 6A Administrator verification path. Clients see only
-- channel metadata; evidence references remain inside the security-definer
-- boundary and a server-generated verification event binds every decision.

grant identity_service to postgres;
grant create on schema partner_private,app_public to identity_service;

alter table partner_private.claim_command_receipts
  drop constraint claim_command_receipts_operation_check;
alter table partner_private.claim_command_receipts
  add constraint claim_command_receipts_operation_check check(operation in (
    'start','submit','withdraw','recheck','changes','conflict','approve','reject',
    'revoke','transfer','signal_verify','signal_reject'
  ));

alter table partner_private.claim_events
  drop constraint claim_events_event_kind_check;
alter table partner_private.claim_events
  add constraint claim_events_event_kind_check check(event_kind in (
    'created','submitted','signal_submitted','signal_verified','signal_rejected',
    'changes_requested','conflict_opened','approved','rejected','withdrawn',
    'revoked','transferred','recheck_requested'
  ));

create or replace function partner_private.verify_synthetic_claim_signal(
  p_signal_id uuid,
  p_verifier_user_id uuid,
  p_authority_object_hmac bytea,
  p_verification_event_id uuid,
  p_decision text
) returns void
language plpgsql volatile security definer set search_path='' as $$
declare
  s partner_private.claim_authority_signals%rowtype;
  c partner_private.listing_claims%rowtype;
begin
  select lc.* into c
  from partner_private.claim_authority_signals sig
  join partner_private.listing_claims lc using(claim_id)
  where sig.signal_id=p_signal_id;
  if not found then
    raise exception using errcode='42501',message='partner_signal_verification_denied';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=c.claim_id for update;
  select * into s from partner_private.claim_authority_signals where signal_id=p_signal_id for update;
  if s.signal_id is null or s.status<>'submitted' or p_decision not in ('verified','rejected')
    or p_verifier_user_id=c.claimant_id or octet_length(p_authority_object_hmac)<>32
    or p_verification_event_id is null
    or not exists(
      select 1 from app_private.role_grants
      where subject_user_id=p_verifier_user_id and role='administrator'
        and store_id is null and state='active'
    )
    or not exists(select 1 from app_public.stores where id=c.store_id and synthetic)
  then
    raise exception using errcode='42501',message='partner_signal_verification_denied';
  end if;
  update partner_private.claim_authority_signals
  set status=p_decision,
      verified_by=case when p_decision='verified' then p_verifier_user_id else null end,
      verified_at=case when p_decision='verified' then statement_timestamp() else null end,
      authority_object_hmac=case when p_decision='verified' then p_authority_object_hmac else null end,
      verification_event_id=case when p_decision='verified' then p_verification_event_id else null end
  where signal_id=p_signal_id;
  insert into partner_private.claim_events(
    claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key
  ) values(
    c.claim_id,p_verifier_user_id,
    case when p_decision='verified' then 'signal_verified' else 'signal_rejected' end,
    c.state,c.state,'verify-'||p_verification_event_id
  );
end $$;

create or replace function app_public.partner_admin_claim_case(p_claim_id uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin();
  c partner_private.listing_claims%rowtype;
begin
  select * into c from partner_private.listing_claims
  where claim_id=p_claim_id and (assigned_admin_id is null or assigned_admin_id=actor);
  if not found then
    raise exception using errcode='55000',message='partner_claim_case_unavailable';
  end if;
  return jsonb_build_object(
    'claimId',c.claim_id,
    'state',c.state,
    'riskTier',c.risk_tier,
    'version',c.version,
    'exactStoreScope',(select slug from app_public.stores where id=c.store_id),
    'verifiedSignals',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'channelClass',channel_class,'signalType',signal_type
      ) order by created_at),'[]'::jsonb)
      from partner_private.claim_authority_signals
      where claim_id=c.claim_id and status='verified'
    ),
    'pendingSignals',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'signalId',signal_id,'channelClass',channel_class,'signalType',signal_type
      ) order by created_at),'[]'::jsonb)
      from partner_private.claim_authority_signals
      where claim_id=c.claim_id and status='submitted'
    )
  );
end $$;

create or replace function app_public.partner_admin_signal_command(
  p_operation text,
  p_claim_id uuid,
  p_signal_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_reason_code text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin();
  c partner_private.listing_claims%rowtype;
  s partner_private.claim_authority_signals%rowtype;
  prior partner_private.claim_command_receipts%rowtype;
  d bytea;
  verification_event_id uuid:=extensions.gen_random_uuid();
  receipt_operation text;
begin
  if p_operation not in ('verify','reject') or p_claim_id is null or p_signal_id is null
    or p_expected_version<1
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$'
  then
    raise exception using errcode='22023',message='partner_admin_signal_command_invalid';
  end if;
  receipt_operation:='signal_'||p_operation;
  d:=extensions.digest(convert_to(concat_ws('|',receipt_operation,p_claim_id,p_signal_id,p_expected_version,p_reason_code,actor),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>receipt_operation
      or prior.claim_id<>p_claim_id or prior.input_digest<>d
    then
      raise exception using errcode='22023',message='partner_claim_idempotency_mismatch';
    end if;
    return app_public.partner_admin_claim_case(p_claim_id);
  end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found then
    raise exception using errcode='40001',message='partner_claim_unavailable_or_stale';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  select * into s from partner_private.claim_authority_signals
    where signal_id=p_signal_id and claim_id=p_claim_id for update;
  if c.claim_id is null or c.version<>p_expected_version
    or c.state not in ('submitted','verification_pending')
    or c.claimant_id=actor or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor)
    or s.signal_id is null or s.status<>'submitted' or octet_length(s.evidence_ref_hmac)<>32
  then
    raise exception using errcode='40001',message='partner_claim_unavailable_or_stale';
  end if;
  perform partner_private.verify_synthetic_claim_signal(
    s.signal_id,actor,s.evidence_ref_hmac,verification_event_id,
    case when p_operation='verify' then 'verified' else 'rejected' end
  );
  update partner_private.listing_claims
  set assigned_admin_id=coalesce(assigned_admin_id,actor),
      version=version+1,
      updated_at=statement_timestamp()
  where claim_id=c.claim_id;
  insert into partner_private.claim_command_receipts(
    idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state
  ) values(
    p_idempotency_key,receipt_operation,c.claim_id,actor,d,c.state
  );
  insert into app_private.privileged_audit_events(
    actor_user_id,actor_role,action,outcome,resource_kind,resource_id,
    reason_code,payload_hash,event_hash
  ) values(
    actor,'administrator','partner_claim_signal_'||p_operation,'completed',
    'listing_claim',c.claim_id,p_reason_code,d,decode(repeat('00',32),'hex')
  );
  return app_public.partner_admin_claim_case(c.claim_id);
end $$;

alter function partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text) owner to identity_service;
alter function app_public.partner_admin_claim_case(uuid) owner to identity_service;
alter function app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text) owner to identity_service;

revoke all on function app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text) to authenticated;
revoke all on function partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text) from public,anon,authenticated;

revoke create on schema partner_private,app_public from identity_service;
revoke identity_service from postgres;
