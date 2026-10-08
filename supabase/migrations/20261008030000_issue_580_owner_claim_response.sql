create or replace function app_public.partner_admin_claim_command(
  p_operation text,p_claim_id uuid,p_expected_version bigint,p_idempotency_key text,
  p_reason_code text,p_transfer_from_claim_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
  old partner_private.listing_claims%rowtype; root partner_private.store_owner_intake_roots%rowtype;
  prior partner_private.claim_command_receipts%rowtype; d bytea; prior_state text; result jsonb;
begin
  if p_operation not in ('changes','conflict','approve','reject','revoke','recheck','transfer')
    or p_claim_id is null or p_expected_version<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' or ((p_operation='transfer')<>(p_transfer_from_claim_id is not null)) then
    raise exception using errcode='22023',message='partner_admin_command_invalid';
  end if;
  d:=extensions.digest(convert_to(concat_ws('|',p_operation,p_claim_id,p_expected_version,p_idempotency_key,p_reason_code,p_transfer_from_claim_id,actor),'utf8'),'sha256');
  select * into prior from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.operation<>p_operation or prior.claim_id<>p_claim_id or prior.input_digest<>d then
      raise exception using errcode='22023',message='partner_claim_idempotency_mismatch'; end if;
    return app_public.partner_admin_claim_case(p_claim_id);
  end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id;
  if not found then raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(c.claimant_id)
    on conflict (applicant_id) do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=c.claimant_id for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  perform 1 from partner_private.claim_authority_signals where claim_id=c.claim_id for update;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
  if not found or c.version<>p_expected_version or c.claimant_id=actor
    or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then
    raise exception using errcode='40001',message='partner_claim_unavailable_or_stale'; end if;
  perform 1 from partner_private.store_partner_grants where store_id=c.store_id for update;
  prior_state:=c.state;
  if p_operation='changes' and c.state in ('submitted','verification_pending','conflict') then
    update partner_private.listing_claims set state='changes_requested',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='conflict' and c.state in ('submitted','verification_pending') then
    update partner_private.listing_claims set state='conflict',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
    insert into partner_private.claim_conflicts(claim_id,conflict_kind,assigned_admin_id) values(c.claim_id,'authority_mismatch',actor);
  elsif p_operation='reject' and c.state in ('submitted','verification_pending','conflict') then
    update partner_private.listing_claims set state='rejected',assigned_admin_id=actor where claim_id=c.claim_id returning * into c;
  elsif p_operation='approve' then
    perform partner_private.approve_exact_claim(c.claim_id,actor);
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation in ('revoke','recheck') then
    perform partner_private.revoke_exact_claim_scope(c.claim_id,actor,p_reason_code,p_idempotency_key||'-scope');
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  elsif p_operation='transfer' then
    select * into old from partner_private.listing_claims where claim_id=p_transfer_from_claim_id and store_id=c.store_id for update;
    if old.state<>'approved' then raise exception using errcode='55000',message='partner_transfer_source_invalid'; end if;
    perform partner_private.revoke_exact_claim_scope(old.claim_id,actor,'scope_transfer',p_idempotency_key||'-old');
    perform partner_private.approve_exact_claim(c.claim_id,actor);
    select * into c from partner_private.listing_claims where claim_id=c.claim_id;
  else raise exception using errcode='55000',message='partner_claim_state_invalid'; end if;
  insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
    values(c.claim_id,actor,case p_operation when 'changes' then 'changes_requested' when 'conflict' then 'conflict_opened' when 'approve' then 'approved' when 'reject' then 'rejected' when 'transfer' then 'transferred' else 'revoked' end,prior_state,c.state,p_idempotency_key);
  insert into partner_private.claim_command_receipts(idempotency_key,operation,claim_id,actor_user_id,input_digest,result_state)
    values(p_idempotency_key,p_operation,c.claim_id,actor,d,c.state);
  -- Build the guarded response before this command advances the privileged audit anchor.
  result:=app_public.partner_admin_claim_case(c.claim_id);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,'administrator','partner_claim_'||p_operation,'completed','listing_claim',c.claim_id,p_reason_code,d,decode(repeat('00',32),'hex'));
  return result;
end $$;
