begin;
select plan(6);

select has_function(
  'partner_private','enforce_listing_claim_release_gate',array[]::text[],
  'listing claim release gate exists'
);
select ok(
  exists(select 1 from pg_trigger where tgname='listing_claim_release_gate' and not tgisinternal),
  'listing claim writes have a database release gate'
);
select ok(
  position('partner_private.claim_stage_allowed(new.store_id)'
    in pg_get_functiondef('partner_private.enforce_listing_claim_release_gate()'::regprocedure))>0
  and position('release_private.public_capability_enabled(''claims'')'
    in pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure))>0,
  'claim gate derives authority from the release capability'
);
select ok(
  not has_function_privilege(
    'authenticated','partner_private.enforce_listing_claim_release_gate()','EXECUTE'
  ),
  'browser roles cannot invoke the private gate directly'
);

insert into auth.users(id) values ('25000000-0000-4000-8000-000000000001');

insert into partner_private.listing_claims(
  claimant_id,store_id,state,relationship,authority_statement
)
select '25000000-0000-4000-8000-000000000001'::uuid,id,'draft',
  'Owner','I am authorized to represent this synthetic store.'
from app_public.stores where synthetic order by id limit 1;

select ok(
  (select partner_private.claim_stage_allowed(store_id)
    from partner_private.listing_claims
    where claimant_id='25000000-0000-4000-8000-000000000001'),
  'synthetic-alpha claims remain available without enabling public claims'
);

select is(
  (select state from partner_private.listing_claims
    where claimant_id='25000000-0000-4000-8000-000000000001'),
  'draft','non-submission claim preparation remains available'
);

select * from finish();
rollback;
