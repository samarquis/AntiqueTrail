begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('shopper_private','private_memory_deletions','memory Undo receipts are server-owned');
select ok(
  (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='shopper_private' and c.relname='private_memory_deletions'),
  'memory Undo receipts FORCE RLS'
);
select ok(
  not has_table_privilege('authenticated','shopper_private.private_memory_deletions','SELECT')
  and not has_table_privilege('authenticated','shopper_private.private_memory_deletions','UPDATE'),
  'authenticated callers cannot read or mutate Undo receipts directly'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='shopper_private'
    and indexname='one_pending_private_memory_deletion'),
  'one pending deletion per owner/store makes delete retry bounded'
);

select has_table('shopper_private','correction_rate_events','correction mechanical-limit events are server-owned');
select ok(
  (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='shopper_private' and c.relname='correction_rate_events'),
  'correction rate events FORCE RLS'
);
select ok(
  not has_table_privilege('authenticated','shopper_private.correction_rate_events','SELECT')
  and not has_table_privilege('authenticated','shopper_private.correction_rate_events','INSERT'),
  'authenticated callers cannot read or write correction rate events directly'
);
select ok(
  exists(select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='shopper_private' and t.relname='correction_rate_events'
      and c.conname='correction_rate_retention'),
  'correction rate events expire after 90 days by constraint'
);

select has_function('app_public','shopper_list_saved','saved-store read RPC exists');
select has_function('app_public','shopper_toggle_save','save toggle RPC exists');
select has_function('app_public','shopper_get_memory','private-memory read RPC exists');
select has_function('app_public','shopper_upsert_memory','versioned private-memory write RPC exists');
select has_function('app_public','shopper_delete_memory','delayed private-memory delete RPC exists');
select has_function('app_public','shopper_undo_delete_memory','private-memory Undo RPC exists');
select has_function('app_public','shopper_get_new_since','coarse-area New Since RPC exists');
select has_function('app_public','shopper_mark_catalog_seen','coarse last-seen RPC exists');
select has_function('app_public','shopper_submit_correction','correction submission RPC exists');
select ok(
  position('correction_case_events' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0
  and position('''submitted''' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0,
  'correction submission appends an idempotent submitted event'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='shopper_submit_correction'
      and p.pronargs=4
  ),
  'the un-rate-limited 4-arg correction submission is not callable'
);
select ok(
  position('correction_rate_events' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0
  and position('correction_rate_limited' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0
  and position('pg_advisory_xact_lock' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0,
  'correction submission enforces mechanical limits atomically'
);
select ok(
  position('app_public.request_user_id()' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))>0
  and position('auth.uid' in pg_get_functiondef('app_public.shopper_submit_correction(uuid,text,text,bytea,text)'::regprocedure))=0,
  'correction submission derives the actor from request_user_id(), never auth.uid()'
);
select has_function('app_public','shopper_get_correction','own correction-status RPC exists');

select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname like 'shopper_%'
      and 'user_id'=any(coalesce(p.proargnames,array[]::text[]))
  ),
  'shopper RPCs never accept a caller-selected owner ID'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname like 'shopper_%'
      and (not p.prosecdef or pg_get_userbyid(p.proowner)<>'identity_service')
  ),
  'all shopper RPCs execute under the narrow identity-service owner'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname like 'shopper_%'
      and has_function_privilege('anon',p.oid,'EXECUTE')
  ),
  'anonymous callers receive no shopper RPC execution privilege'
);

set local role authenticated;
select throws_ok(
  $$select app_public.shopper_list_saved()$$,
  '42501','shopper_private_access_denied',
  'an authenticated role without an active shopper session fails closed'
);
select throws_ok(
  $$select app_public.shopper_submit_correction('00000000-0000-0000-0000-000000000000'::uuid,'other','x',decode(repeat('00',32),'hex'))$$,
  '42501','shopper_private_access_denied',
  'correction submission without an active shopper session fails closed'
);

select * from finish();
rollback;
