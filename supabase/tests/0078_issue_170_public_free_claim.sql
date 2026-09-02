begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('partner_private','store_owner_intake_roots','claim and add starts share an applicant root');
select has_column('partner_private','store_owner_intake_roots','active_kind','the root records the active intake kind');
select has_table('partner_private','claim_free_activation_receipts','Free approval has an immutable receipt');
select ok(
  not has_table_privilege('authenticated','partner_private.store_owner_intake_roots','INSERT')
  and not has_table_privilege('authenticated','partner_private.claim_free_activation_receipts','INSERT'),
  'browser roles cannot write root or Free activation receipt rows directly'
);
select has_function('app_public','public_listing_claim_command',array['text','jsonb']::text[],
  'public claim command exists behind the server release seam');
select ok(
  position('partner_private.claim_stage_allowed(store_id)' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('not synthetic' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'public start checks server stage and rejects Synthetic/route-selected authority'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('active_kind=''claim''' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'start locks and reserves exactly one applicant root'
);
select ok(
  position('role=''representative''' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'an existing Representative grant denies another intake'
);
select ok(
  position('listing_claim_unavailable' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'stage-off and invalid public starts use one generic denial'
);
select ok(
  position('whereid=p_store_idandsynthetic' in regexp_replace(lower(pg_get_functiondef('app_public.partner_start_claim(uuid,text,text,text)'::regprocedure)),'[[:space:]]','','g'))>0,
  'legacy authenticated start RPC is Synthetic-only and cannot bypass the public command'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('app_public.partner_start_claim(uuid,text,text,text)'::regprocedure)))>0,
  'Synthetic claim starts use the same root for future add-versus-claim locking'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
    < position('claim_authority_signals' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
  and position('claim_authority_signals' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
    < position('listing_claims where claim_id=p_claim_id for update' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure))),
  'approval locks applicant root then authority signals then exact claim'
);
select ok(
  position('store_partner_grants' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('store_photo_tier_state' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('claim_free_activation_receipts' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,
  'approval creates grant, Free tier, and receipt in its transaction'
);
select ok(
  position('root.active_kind<>''claim''' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('root.active_id<>c.claim_id' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,
  'approval compares the exact claim root before granting scope'
);
select ok(exists(select 1 from pg_trigger where tgname='listing_claim_clear_matching_intake_root' and not tgisinternal),
  'terminal claim transitions clear only their matching applicant root');
select ok(
  position('active_kind=''claim''andactive_id=new.claim_id' in regexp_replace(lower(pg_get_functiondef('partner_private.clear_matching_claim_intake_root()'::regprocedure)),'[[:space:]]','','g'))>0,
  'root cleanup is claim-ID exact rather than broad applicant cleanup'
);
select ok(
  has_function_privilege('authenticated','app_public.public_listing_claim_command(text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.public_listing_claim_command(text,jsonb)','EXECUTE'),
  'only authenticated sessions may call the bounded public command'
);
select ok(
  position('public_capability_enabled(''claims'')' in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0,
  'the claim capability remains server-owned and staged off by default'
);

select * from finish();
rollback;
