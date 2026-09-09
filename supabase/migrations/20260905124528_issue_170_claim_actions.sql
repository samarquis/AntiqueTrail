-- Public applicants must not borrow the invitation-only command path.
grant identity_service to postgres;
grant create on schema app_public,partner_private to identity_service;
set role identity_service;

create function app_public.public_listing_claim_action(p_operation text,p_claim_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claimant(); c partner_private.listing_claims%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; command_key text;
begin
  if not app_private.current_session_is_active() or p_operation is null
    or p_operation not in ('withdraw','recheck') or p_claim_id is null then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor;
  if not found or not partner_private.claim_stage_allowed(c.store_id) then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||c.store_id,0));
  select * into c from partner_private.listing_claims where claim_id=p_claim_id and claimant_id=actor for update;
  if p_operation='withdraw' and c.state='withdrawn' then return app_public.public_listing_claim_status(c.claim_id); end if;
  if root.active_kind is distinct from 'claim' or root.active_id is distinct from c.claim_id
    or c.state not in ('draft','submitted','verification_pending','changes_requested','conflict') then
    raise exception using errcode='42501',message='listing_claim_unavailable'; end if;
  command_key:='public-'||p_operation||'-'||c.claim_id||'-v'||c.version;
  if p_operation='withdraw' or c.state in ('draft','changes_requested') then
    perform app_public.partner_claimant_claim_command(
      case when p_operation='withdraw' then 'withdraw' else 'submit' end,c.claim_id,c.version,command_key);
  else
    -- A request records no verification or authority and never clears a conflict.
    insert into partner_private.claim_events(claim_id,actor_user_id,event_kind,from_state,to_state,idempotency_key)
      values(c.claim_id,actor,'recheck_requested',c.state,c.state,command_key)
      on conflict (claim_id,idempotency_key) do nothing;
  end if;
  return app_public.public_listing_claim_status(c.claim_id);
end $$;
revoke all on function app_public.public_listing_claim_action(text,uuid) from public,anon;
grant execute on function app_public.public_listing_claim_action(text,uuid) to authenticated;

reset role;
revoke create on schema app_public,partner_private from identity_service;
revoke identity_service from postgres;
