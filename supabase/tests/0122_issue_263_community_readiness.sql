begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('community_private','community_readiness_capabilities','readiness capabilities exist');
select has_table('community_private','community_gate_packets','frozen gate packets exist');
select has_table('community_private','community_gate_capabilities','gate capabilities exist');
select has_table('community_private','community_gate_command_receipts','gate command receipts exist');
select has_function('community_private','community_preparation_projection','bounded preparation projection exists');
select has_function('app_public','community_preparation_command','authenticated preparation wrapper exists');
select has_function('app_public','community_gate_command','authenticated gate wrapper exists');
select has_function('community_private','request_readiness_capability','one-use readiness capability exists');
select has_function('community_private','consume_readiness_capability','readiness capability consumption exists');
select has_function('community_private','gate_failed_codes','content-free gate failures are derived server-side');

select ok(
  not has_function_privilege('anon','app_public.community_preparation_command(text,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','app_public.community_preparation_command(text,jsonb)','EXECUTE'),
  'preparation is reachable only through an authenticated session wrapper'
);
select ok(
  not has_function_privilege('anon','app_public.community_gate_command(text,jsonb)','EXECUTE')
  and has_function_privilege('authenticated','app_public.community_gate_command(text,jsonb)','EXECUTE'),
  'the current-area gate is reachable only through an authenticated session wrapper'
);
select ok(
  not has_function_privilege('community_deployment_service','app_public.community_preparation_command(text,jsonb)','EXECUTE')
  and not has_function_privilege('community_deployment_service','app_public.community_gate_command(text,jsonb)','EXECUTE'),
  'deployment credentials cannot use the browser command wrappers'
);
select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='community_private' and c.relname in (
      'community_readiness_capabilities','community_gate_packets',
      'community_gate_capabilities','community_gate_command_receipts'
    ) and c.relforcerowsecurity),
  4,
  'all new persistence tables force RLS'
);
select ok(
  exists(select 1 from pg_trigger where tgname='community_gate_commands_append_only' and not tgisinternal),
  'gate decisions are append-only receipts'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='community_private'
    and indexname='community_one_live_readiness_capability'),
  'readiness signing has one live capability per user, run, and frozen digest'
);
select ok(
  (select pg_get_userbyid(p.proowner)='community_automation' and p.prosecdef
     and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%'
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='app_public' and p.proname='community_preparation_command'),
  'preparation wrapper is a pinned security-definer boundary'
);
select ok(
  (select pg_get_userbyid(p.proowner)='community_automation' and p.prosecdef
     and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%'
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='app_public' and p.proname='community_gate_command'),
  'gate wrapper is a pinned security-definer boundary'
);
select ok(
  not has_table_privilege('anon','community_private.community_readiness_capabilities','SELECT')
  and not has_table_privilege('authenticated','community_private.community_readiness_capabilities','SELECT')
  and not has_table_privilege('anon','community_private.community_gate_packets','SELECT')
  and not has_table_privilege('authenticated','community_private.community_gate_packets','SELECT'),
  'browser roles cannot directly read capability or packet tables'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname in ('community_preparation_command','community_gate_command')
      and lower(pg_get_functiondef(p.oid)) like '%community_deployment_service%'
  ),
  'user-session wrappers do not depend on deployment credentials'
);
select ok(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='community_preparation_command'
      and lower(pg_get_functiondef(p.oid)) like '%activate_community%'
  ),
  'preparation wrapper cannot activate, rollback, or reactivate a run'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='app_public' and p.proname='community_gate_command'
      and position('PrimaryInternalTester' in pg_get_functiondef(p.oid))>0
      and position('community_gate_command_receipts' in pg_get_functiondef(p.oid))>0
  ),
  'gate decisions require the separate tester responsibility and durable receipt'
);
select ok(
  exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname='community_preparation_projection'
      and position('receipt_is_current_pass' in pg_get_functiondef(p.oid))>0
  ),
  'preparation availability checks the current authoritative RG-01 pass'
);
select ok(
  exists(select 1 from pg_constraint where conname='community_gate_capabilities_decision_check'),
  'gate capabilities constrain decisions to pass or reject'
);
select ok(
  exists(select 1 from pg_constraint where conname='community_gate_packets_pkey'),
  'a frozen packet is unique per exact run and digest'
);
select ok(
  exists(select 1 from pg_policy where polname='community_automation_gate_packets')
  and exists(select 1 from pg_policy where polname='community_automation_gate_capabilities'),
  'new private tables expose rows only to their automation owner'
);
select ok(
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='community_private' and p.proname='require_user_responsibility'
      and p.prosecdef and pg_get_userbyid(p.proowner)='identity_service'),
  'responsibility and session authorization is delegated to the identity boundary'
);

select * from finish();
rollback;
