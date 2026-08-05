-- Keep claimant claim status reason-neutral and free of internal verification policy.
grant identity_service to postgres;

create or replace function app_public.partner_claim_status(p_claim_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  c partner_private.listing_claims%rowtype;
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode = '42501', message = 'partner_auth_required';
  end if;

  select *
  into c
  from partner_private.listing_claims
  where claimant_id = actor
    and (p_claim_id is null or claim_id = p_claim_id)
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'claimId', c.claim_id,
    'state', case c.state
      when 'submitted' then 'in_review'
      when 'verification_pending' then 'in_review'
      when 'conflict' then 'in_review'
      when 'rejected' then 'closed'
      when 'revoked' then 'closed'
      else c.state
    end,
    'exactStoreScope', (select slug from app_public.stores where id = c.store_id),
    'version', c.version
  );
end
$$;

alter function app_public.partner_claim_status(uuid) owner to identity_service;

revoke identity_service from postgres;
