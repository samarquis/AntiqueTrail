begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='listing_claims' and column_name='relationship'),
  'listing claims retain the claimant relationship privately'
);
select ok(
  exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='listing_claims' and column_name='authority_statement'),
  'listing claims retain a bounded authority statement privately'
);
select ok(
  exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='listing_claims' and column_name='authority_recheck_due_at'),
  'listing claims track the next authority recheck'
);
select ok(
  exists(select 1 from pg_trigger where tgname='listing_claim_state_guard' and not tgisinternal),
  'listing claim transitions are guarded by a trigger'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='partner_private' and p.proname='enforce_listing_claim_transition'
      and pg_get_functiondef(p.oid) like '%count(distinct channel_class)%'
  ),
  'approval checks two independent verified authority channels'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='partner_private' and p.proname='enforce_listing_claim_transition'
      and pg_get_functiondef(p.oid) like '%old.state%submitted%verification_pending%'
  ),
  'claim state changes are constrained by the prior state'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='partner_private' and p.proname='enforce_listing_claim_transition'
      and pg_get_functiondef(p.oid) like '%interval ''1 year''%'
      and pg_get_functiondef(p.oid) like '%interval ''180 days''%'
      and pg_get_functiondef(p.oid) like '%interval ''90 days''%'
  ),
  'standard, elevated, and high risk tiers receive bounded recheck intervals'
);
select ok(
  not has_table_privilege('authenticated','partner_private.listing_claims','UPDATE'),
  'authenticated callers cannot update claim review state directly'
);
select ok(
  exists(select 1 from pg_trigger where tgname='partner_access_revocation_append_only' and not tgisinternal),
  'access revocations remain append-only'
);
select ok(
  exists(select 1 from pg_constraint where conname='partner_grant_state_shape'),
  'exact store grants retain active/revoked state shape enforcement'
);

select * from finish();
rollback;
