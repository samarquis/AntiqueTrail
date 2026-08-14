begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_schema('release_private','private release schema exists');
select has_table('release_private','regional_releases','exact frozen releases are durable');
select has_table('release_private','release_commands','release command evidence is durable');
select has_table('release_private','release_capabilities','atomic capabilities are durable');
select ok(exists(select 1 from pg_constraint where conname='release_capabilities_atomic'),'partial public capability states are forbidden');
select ok(not has_table_privilege('release_executor','release_private.release_commands','UPDATE') and not has_table_privilege('release_executor','release_private.release_commands','DELETE'),'command evidence is append-only to the execute-only deployment role');
select ok(not has_table_privilege('authenticated','release_private.regional_releases','SELECT'),'authenticated users cannot read release state directly');
select has_table('release_private','release_evidence_receipts','externally verified release evidence is durable');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='release_private' and p.proname='advance_regional_release'),'stepwise public activation is absent');
select ok(not has_function_privilege('authenticated','release_private.promote_regional_release(uuid,uuid,uuid[])','EXECUTE'),'browser sessions cannot promote releases');
select ok(has_function_privilege('release_executor','release_private.promote_regional_release(uuid,uuid,uuid[])','EXECUTE'),'deployment executor has execute-only atomic promotion access');
select ok((select r.rolsuper=false and r.rolbypassrls=false and r.rolcanlogin=false from pg_roles r where r.rolname='release_automation'),'release functions use a dedicated constrained owner');
select ok(not has_schema_privilege('release_automation','release_private','CREATE'),'release automation cannot create new private objects after ownership transfer');
select has_table('release_private','release_frozen_stores','the exact promoted store set is frozen durably');
select has_table('release_private','release_actor_approvals','required human evidence roles are signature bound');
select has_table('release_private','release_gate_receipts','provider recovery capacity consent and smoke gates are durable');
select has_table('release_private','public_review_projection','approved public review projection has a rollback surface');
select ok(exists(select 1 from pg_constraint where conname='stores_audience_stage'),'catalog rows distinguish readiness from public audience');
select ok(not has_function_privilege('anon','app_public.catalog_list(text,text,text)','EXECUTE') and not has_function_privilege('authenticated','app_public.catalog_list(text,text,text)','EXECUTE'),'browser roles cannot bypass the typed catalog gateway');
select ok(has_function_privilege('public_catalog_gateway','app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE'),
  'typed rate-limited catalog gateway is the only anonymous catalog boundary');
select ok(position('public_capability_enabled' in pg_get_functiondef('app_public.submit_listing_claim(text)'::regprocedure))>0,
  'bounded claim command is server-gated by active release capability');
select ok(exists(select 1 from pg_policies where schemaname='release_private' and policyname='public_review_gateway_read' and coalesce(qual,'') like '%public_capability_enabled%'),'review publication is server-gated by active release capability');
select ok(position('select state into v_latch_state from app_private.registration_quarantine_latch' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure))<position('select * into v_release from release_private.regional_releases' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure)),'promotion locks registration quarantine before release state');
select ok(position('account_registration_config' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure))>0,'promotion changes real registration mode in its transaction');
select ok(position('update app_public.stores' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure))>0,'promotion changes the exact catalog projection');
select ok(position('release_actor_approvals_incomplete' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure))>0 and position('release_gate_receipts_incomplete' in pg_get_functiondef('release_private.promote_regional_release(uuid,uuid,uuid[])'::regprocedure))>0,'promotion fails closed on missing signed actors or prerequisite gates');
select ok(position($q$mode='closed'$q$ in pg_get_functiondef('release_private.rollback_regional_release(uuid,uuid,text)'::regprocedure))>0 and position($q$audience='regional_readiness'$q$ in pg_get_functiondef('release_private.rollback_regional_release(uuid,uuid,text)'::regprocedure))>0,'rollback closes registration and withdraws the promoted catalog');
select ok((select count(*)=3 from pg_trigger where tgname in ('release_frozen_stores_append_only','release_actor_approvals_append_only','release_gate_receipts_append_only')),'frozen store and signed evidence records are append-only');
select ok(has_function_privilege('release_executor','release_private.bind_release_candidate(uuid,text,text)','EXECUTE') and not has_function_privilege('authenticated','release_private.bind_release_candidate(uuid,text,text)','EXECUTE'),'execute-only deployment command seals the exact candidate set');
select ok(position($q$audience='public'$q$ in pg_get_functiondef('app_public.regional_catalog_list(text,text,text)'::regprocedure))>0 and position($q$not s.synthetic$q$ in pg_get_functiondef('app_public.regional_catalog_list(text,text,text)'::regprocedure))>0,'regional gateway exposes only promoted non-synthetic rows');
select ok(not has_function_privilege('public_catalog_gateway','app_public.catalog_list(text,text,text)','EXECUTE'),'public gateway cannot call the synthetic catalog RPC');
select ok(not has_table_privilege('authenticated','partner_private.listing_claims','INSERT')
  and has_function_privilege('authenticated','app_public.submit_listing_claim(text)','EXECUTE'),
  'authenticated claims use only the bounded command and cannot choose server fields');

select * from finish();
rollback;
