-- Package 6A correction: a channel label alone is not independent authority.
-- The trusted verification service binds each verified signal to one normalized
-- authority object and one verification event; neither identifier is exposed.

drop policy if exists listing_claim_claimant_write
  on partner_private.listing_claims;

alter table partner_private.claim_authority_signals
  add column if not exists authority_object_hmac bytea,
  add column if not exists verification_event_id uuid;

alter table partner_private.claim_authority_signals
  drop constraint if exists claim_signal_authority_object_size,
  add constraint claim_signal_authority_object_size check (
    authority_object_hmac is null or octet_length(authority_object_hmac)=32
  ),
  drop constraint if exists claim_signal_independent_verification_shape,
  add constraint claim_signal_independent_verification_shape check (
    status<>'verified'
    or (authority_object_hmac is not null and verification_event_id is not null)
  );

create unique index if not exists claim_verified_authority_object_unique
  on partner_private.claim_authority_signals(claim_id,authority_object_hmac)
  where status='verified';

create unique index if not exists claim_verified_event_unique
  on partner_private.claim_authority_signals(claim_id,verification_event_id)
  where status='verified';

create or replace function partner_private.enforce_claim_signal_independence()
returns trigger
language plpgsql
set search_path = pg_catalog,partner_private
as $$
declare
  v_channels integer;
  v_objects integer;
  v_events integer;
begin
  if new.state='approved' and old.state<>'approved' then
    select count(distinct channel_class),
           count(distinct authority_object_hmac),
           count(distinct verification_event_id)
      into v_channels,v_objects,v_events
      from partner_private.claim_authority_signals
      where claim_id=old.claim_id and status='verified';
    if v_channels<2 or v_objects<2 or v_events<2 then
      raise exception 'listing_claim_independent_signals_required';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listing_claim_signal_independence_guard
  on partner_private.listing_claims;
create trigger listing_claim_signal_independence_guard
before update on partner_private.listing_claims
for each row execute function partner_private.enforce_claim_signal_independence();

revoke all on function partner_private.enforce_claim_signal_independence()
  from public,anon,authenticated;
