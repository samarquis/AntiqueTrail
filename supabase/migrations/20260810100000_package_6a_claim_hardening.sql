-- Package 6A claim hardening: retain minimized claimant assertions, require two
-- independent verified authority channels, and bound risk-tier rechecks.

alter table partner_private.listing_claims
  add column if not exists relationship text,
  add column if not exists authority_statement text,
  add column if not exists last_authority_verified_at timestamptz,
  add column if not exists authority_recheck_due_at timestamptz;

alter table partner_private.listing_claims
  drop constraint if exists listing_claim_relationship_safe,
  add constraint listing_claim_relationship_safe check (
    relationship is null or (
      relationship=btrim(relationship)
      and char_length(relationship) between 1 and 120
      and relationship !~ '[[:cntrl:]]'
    )
  ),
  drop constraint if exists listing_claim_authority_statement_safe,
  add constraint listing_claim_authority_statement_safe check (
    authority_statement is null or (
      authority_statement=btrim(authority_statement)
      and char_length(authority_statement) between 1 and 1000
      and authority_statement !~ '[[:cntrl:]]'
    )
  ),
  drop constraint if exists listing_claim_recheck_order,
  add constraint listing_claim_recheck_order check (
    authority_recheck_due_at is null
    or (
      last_authority_verified_at is not null
      and authority_recheck_due_at > last_authority_verified_at
    )
  );

create or replace function partner_private.enforce_listing_claim_transition()
returns trigger
language plpgsql
set search_path = pg_catalog,partner_private,auth
as $$
declare
  v_verified_channels integer;
begin
  if tg_op='INSERT' then
    if new.state<>'draft'
      or new.assigned_admin_id is not null
      or new.approved_at is not null
      or new.approved_by is not null
      or new.revoked_at is not null
      or new.last_authority_verified_at is not null
      or new.authority_recheck_due_at is not null then
      raise exception 'listing_claim_initial_state_forbidden';
    end if;
    if new.relationship is null or new.authority_statement is null then
      raise exception 'listing_claim_assertion_required';
    end if;
    return new;
  end if;

  if new.claimant_id is distinct from old.claimant_id
    or new.store_id is distinct from old.store_id
    or new.created_at is distinct from old.created_at then
    raise exception 'listing_claim_identity_immutable';
  end if;

  if old.state in ('rejected','withdrawn','revoked') then
    if new is distinct from old then
      raise exception 'listing_claim_terminal';
    end if;
    return old;
  end if;

  if old.state='approved' then
    if new.state='approved' and new is distinct from old then
      raise exception 'listing_claim_terminal';
    elsif new.state not in ('approved','revoked') then
      raise exception 'listing_claim_transition_forbidden';
    end if;
  end if;

  if (old.state='draft' and new.state not in ('draft','submitted','withdrawn'))
    or (old.state='submitted' and new.state not in ('submitted','verification_pending','changes_requested','conflict','rejected','withdrawn'))
    or (old.state='verification_pending' and new.state not in ('verification_pending','changes_requested','conflict','approved','rejected','withdrawn'))
    or (old.state='changes_requested' and new.state not in ('changes_requested','submitted','withdrawn'))
    or (old.state='conflict' and new.state not in ('conflict','verification_pending','rejected','withdrawn','revoked')) then
    raise exception 'listing_claim_transition_forbidden';
  end if;

  if new.state='approved' then
    select count(distinct channel_class)
      into v_verified_channels
      from partner_private.claim_authority_signals
      where claim_id=old.claim_id and status='verified';
    if v_verified_channels<2 then
      raise exception 'listing_claim_two_signals_required';
    end if;
    if new.assigned_admin_id is null
      or new.approved_by is null
      or new.approved_at is null
      or new.approved_by is distinct from new.assigned_admin_id then
      raise exception 'listing_claim_approval_evidence_required';
    end if;
    new.last_authority_verified_at := new.approved_at;
    new.authority_recheck_due_at := new.approved_at + case new.risk_tier
      when 'standard' then interval '1 year'
      when 'elevated' then interval '180 days'
      else interval '90 days'
    end;
  elsif new.last_authority_verified_at is distinct from old.last_authority_verified_at
    or new.authority_recheck_due_at is distinct from old.authority_recheck_due_at then
    raise exception 'listing_claim_recheck_server_owned';
  end if;

  if new.state='withdrawn' and new.revoked_at is null then
    new.revoked_at := statement_timestamp();
  elsif new.state='revoked' and new.revoked_at is null then
    new.revoked_at := statement_timestamp();
  end if;

  new.version := old.version+1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists listing_claim_state_guard on partner_private.listing_claims;
create trigger listing_claim_state_guard
before insert or update on partner_private.listing_claims
for each row execute function partner_private.enforce_listing_claim_transition();

revoke all on function partner_private.enforce_listing_claim_transition() from public,anon,authenticated;

create index if not exists listing_claim_recheck_due_idx
  on partner_private.listing_claims(authority_recheck_due_at)
  where state='approved' and authority_recheck_due_at is not null;
