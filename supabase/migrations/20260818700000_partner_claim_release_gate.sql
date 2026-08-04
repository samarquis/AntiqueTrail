-- Listing claims remain server-disabled until the atomic regional release
-- enables the exact claims capability. UI route visibility is not authority.

grant identity_service to postgres;
grant create on schema partner_private to identity_service;
grant usage on schema release_private to identity_service;
grant execute on function release_private.public_capability_enabled(text) to identity_service;

create or replace function partner_private.enforce_listing_claim_release_gate()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.state='submitted'
    and (tg_op='INSERT' or old.state is distinct from new.state)
    and not release_private.public_capability_enabled('claims') then
    raise exception using errcode='42501',message='listing_claim_release_disabled';
  end if;
  return new;
end
$$;

alter function partner_private.enforce_listing_claim_release_gate() owner to identity_service;
revoke all on function partner_private.enforce_listing_claim_release_gate()
  from public,anon,authenticated;

drop trigger if exists listing_claim_release_gate on partner_private.listing_claims;
create trigger listing_claim_release_gate
before insert or update of state on partner_private.listing_claims
for each row execute function partner_private.enforce_listing_claim_release_gate();

revoke create on schema partner_private from identity_service;
revoke identity_service from postgres;
