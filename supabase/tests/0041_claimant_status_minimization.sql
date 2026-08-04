begin;
select plan(2);

select ok(
  position('risktier' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure))) = 0
  and position('verifiedsignalcount' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure))) = 0
  and position('requiredsignalcount' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure))) = 0,
  'claimant projection omits internal risk and verification policy'
);

select ok(
  position('assigned_admin_id' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure))) = 0
  and position('evidence_ref_hmac' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure))) = 0,
  'claimant projection omits administrator and evidence identities'
);

select * from finish();
rollback;
