begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

select has_schema('beta_private','Package 8C has a private beta schema');
select has_table('beta_private','beta_capability','server-owned beta capability exists');
select has_table('beta_private','pilot_cohorts','durable cohorts exist');
select has_table('beta_private','pilot_cohort_accounts','verified invited cohort accounts are durable');
select has_table('beta_private','pilot_visibility_grants','exact private visibility grants exist');
select has_table('beta_private','pilot_store_admissions','sequential store admissions exist');
select has_table('beta_private','beta_evidence_events','content-free gate evidence exists');
select has_table('beta_private','gate_assessments','owner outcome assessment exists');
select has_table('beta_private','beta_defect_events','blocking defects are durable');
select has_table('beta_private','operational_fact_events','operational latch facts are durable');
select has_table('beta_private','gate_challenges','one-use signing challenges exist');
select has_table('beta_private','gate_receipts','Product Owner receipts exist');
select has_table('beta_private','expansion_receipts','every explicit store expansion has an authenticated receipt');
select has_table('beta_private','command_receipts','idempotent command results exist');
select has_table('beta_private','beta_audit_events','narrow beta audit exists');

select is((select state from beta_private.beta_capability where singleton),'disabled','beta capability defaults off');
select is((select operational_state from beta_private.beta_capability where singleton),'blocked','operational latch defaults blocked');
select is((select count(*) from beta_private.prerequisite_receipts),0::bigint,'migration fabricates no external prerequisite receipt');
select is((select count(*) from beta_private.product_owner_bindings),0::bigint,'migration fabricates no Product Owner binding');
select is((select count(*) from beta_private.pilot_cohort_accounts),0::bigint,'migration fabricates no invited human account');
select is((select count(*) from beta_private.beta_evidence_events),0::bigint,'migration fabricates no human or provider evidence');
select ok((select count(*)=16 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='beta_private' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),'every beta table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='beta_private' and grantee in ('anon','authenticated','service_role')),'browser and generic service roles cannot access beta tables directly');

select has_function('app_public','beta_get_state',array['uuid'],'authorized beta state RPC exists');
select has_function('app_public','beta_request_gate_decision',array['uuid','smallint','text'],'server freeze/challenge RPC exists');
select has_function('app_public','beta_complete_gate_decision',array['uuid','text','text'],'authenticated signing RPC exists');
select has_function('app_public','beta_admit_next_store',array['uuid','uuid','uuid','bigint','text'],'explicit admission RPC exists');
select has_function('app_public','beta_withdraw_store',array['uuid','uuid','text','bigint','text'],'exact withdrawal RPC exists');
select has_function('app_public','beta_recover_cohort',array['uuid','bigint','text'],'explicit recovery RPC exists');
select has_function('app_public','beta_refresh_operational_latch',array['timestamp with time zone'],'bounded latch worker RPC exists');
select has_function('beta_private','current_gate_digest',array['uuid','smallint','text','timestamp with time zone'],'server derives an exact frozen gate packet digest');
select has_function('beta_private','cohort_accounts_ready',array['uuid','uuid','uuid','boolean'],'server validates the invited human cohort');
select ok(not has_function_privilege('anon','app_public.beta_get_state(uuid)','EXECUTE') and has_function_privilege('authenticated','app_public.beta_get_state(uuid)','EXECUTE'),'beta state is authenticated only');
select ok(not has_function_privilege('authenticated','app_public.beta_refresh_operational_latch(timestamp with time zone)','EXECUTE') and has_function_privilege('service_role','app_public.beta_refresh_operational_latch(timestamp with time zone)','EXECUTE'),'only the worker service role can refresh the latch');

select ok(position('current_session_has_mfa()' in lower(pg_get_functiondef('beta_private.require_product_owner()'::regprocedure)))>0
  and position("current_session_recent_auth(interval '15 minutes')" in lower(pg_get_functiondef('beta_private.require_product_owner()'::regprocedure)))>0
  and position("responsibility='productowner'" in replace(lower(pg_get_functiondef('beta_private.require_product_owner()'::regprocedure)),' ',''))>0,'Product Owner decisions require responsibility, MFA, and recent auth');
select ok(position("evidence_class='real'" in replace(lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)),' ',''))>0
  and position('synthetic' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))=0,'synthetic evidence cannot satisfy a real gate');
select ok(position('count(*) = 16' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0
  or position('count(*)=16' in replace(lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)),' ',''))>0,'all sixteen gate checks must pass');
select ok(position('support_load_accepted' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0
  and position('direct_edit_or_reviewed_change' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0
  and position('channel_accept_decline_proven' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0,'usefulness, edit/review, channel decision, and support load are frozen server facts');
select ok(position("severity in ('blocking', 'privacy', 'security', 'data_loss')" in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0
  or position("severityin('blocking','privacy','security','data_loss')" in replace(lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)),' ',''))>0,'blocking defects close a gate');
select ok(position('real_operations_current' in lower(pg_get_functiondef('beta_private.gate_passable(uuid,smallint,timestamp with time zone)'::regprocedure)))>0,'support, monitoring, and recovery freshness latch the gate');
select ok(position('count(*)=4' in replace(lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)),' ',''))>0
  and position("account_role='shopper'" in replace(lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)),' ',''))>0
  and position("account_role='administrator'" in replace(lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)),' ',''))>0
  and position("account_role='store_representative'" in replace(lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)),' ',''))>0
  and position('email_confirmed_at is not null' in lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)))>0
  and position('role_grants' in lower(pg_get_functiondef('beta_private.cohort_accounts_ready(uuid,uuid,uuid,boolean)'::regprocedure)))>0,'Store 1 requires exactly four separate verified humans with two shopper, one Administrator, and one exact Representative role');
select ok(position('current_gate_digest' in lower(pg_get_functiondef('app_public.beta_request_gate_decision(uuid,smallint,text)'::regprocedure)))>0
  and position('current_gate_digest' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position('frozen_payload_digest' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0,'completion recomputes the exact server evidence packet so stale challenges fail');

select ok(position('consumed_at is not null' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position('expires_at < decision_now' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0,'decision challenges are one-use and short-lived');
select ok(position('authenticated_product_owner_mfa' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position('signature' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0,'receipt records the actual authenticated Product Owner signing ceremony');
select ok(position('idempotency_key_reused' in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position('idempotency_key_reused' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('idempotency_key_reused' in lower(pg_get_functiondef('app_public.beta_withdraw_store(uuid,uuid,text,bigint,text)'::regprocedure)))>0,'mutations replay safely and reject key/payload mismatch');

select ok(position('current_ordinal + 1' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('next_ordinal not between 1 and 3' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'admission is strictly sequential and capped at three');
select ok(position('next_ordinal - 1' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position("decision = 'pass'" in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'the prior ordinal needs a passing signed receipt');
select ok(position('pilot_consent_receipts' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('store_partnerships' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('store_partner_grants' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'admission derives consent and exact active representative scope');
select ok(position('listing_claims' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('claim_authority_signals' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('count(distinct cas.channel_class)' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'approved claim and two-channel authority are prerequisites');
select ok(position('catalog_freshness' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position("= 'current'" in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'admission requires current authoritative catalog facts');
select ok(position('privileged_anchor_is_current' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'admission is stopped by a stale privileged audit anchor');
select ok(position('expansion_receipts' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('authenticated_product_owner_mfa' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'every Store 1 through 3 expansion records the actual MFA-backed Product Owner action');
select ok(position('cohort_accounts_ready' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0
  and position('next_ordinal = 1' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'initial admission is blocked until the exact separated cohort is verified');
select ok(position('selectp_cohort_id,user_id,p_store_id' in replace(lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)),' ',''))>0
  and position('pilot_cohort_accounts' in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'admission grants visibility only to the invited cohort account set');

select ok(position("audience = 'private_beta'" in lower(pg_get_functiondef('app_public.beta_admit_next_store(uuid,uuid,uuid,bigint,text)'::regprocedure)))>0,'real admitted store receives only private-beta audience');
select ok(position("publication_state = 'hidden'" in lower(pg_get_functiondef('app_public.beta_withdraw_store(uuid,uuid,text,bigint,text)'::regprocedure)))>0
  and position("state = 'revoked'" in lower(pg_get_functiondef('app_public.beta_withdraw_store(uuid,uuid,text,bigint,text)'::regprocedure)))>0,'withdrawal hides the exact store and revokes exact beta visibility');
select ok(position("'rolled_back'" in lower(pg_get_functiondef('app_public.beta_withdraw_store(uuid,uuid,text,bigint,text)'::regprocedure)))>0
  and position("'owner_withdrawn'" in lower(pg_get_functiondef('app_public.beta_withdraw_store(uuid,uuid,text,bigint,text)'::regprocedure)))>0,'operational rollback is distinct from voluntary owner withdrawal');
select ok(position("state = 'paused'" in lower(pg_get_functiondef('app_public.beta_refresh_operational_latch(timestamp with time zone)'::regprocedure)))>0
  and position("publication_state = 'hidden'" in lower(pg_get_functiondef('app_public.beta_refresh_operational_latch(timestamp with time zone)'::regprocedure)))>0,'latch failure pauses cohorts and hides active beta stores');
select ok(position("set state = 'active'" in lower(pg_get_functiondef('app_public.beta_refresh_operational_latch(timestamp with time zone)'::regprocedure)))=0
  and position("publication_state = 'active'" in lower(pg_get_functiondef('app_public.beta_refresh_operational_latch(timestamp with time zone)'::regprocedure)))=0,'latch recovery never automatically expands or reactivates');
select ok(position("c.state <> 'paused'" in lower(pg_get_functiondef('app_public.beta_recover_cohort(uuid,bigint,text)'::regprocedure)))>0
  and position("operational_state = 'current'" in lower(pg_get_functiondef('app_public.beta_recover_cohort(uuid,bigint,text)'::regprocedure)))>0
  and position('p_expected_cohort_version' in lower(pg_get_functiondef('app_public.beta_recover_cohort(uuid,bigint,text)'::regprocedure)))>0,'recovery is an explicit versioned Product Owner command after the latch is current');
select ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='beta_private' and not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%admit%'),'no trigger can automatically admit the next store');
select ok(position("ordinal = 3" in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position("readiness_review" in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))>0
  and position("audience = 'public'" in lower(pg_get_functiondef('app_public.beta_complete_gate_decision(uuid,text,text)'::regprocedure)))=0,'Store 3 opens readiness review without opening public access');
select ok((select pg_get_constraintdef(oid) ilike '%private_beta%' from pg_constraint where conrelid='app_public.stores'::regclass and conname='stores_audience_stage'),'catalog permits a distinct non-public private-beta audience');
select ok(not exists(select 1 from information_schema.columns where table_schema='beta_private' and table_name='beta_audit_events' and column_name ~ '(email|payload|signature|artifact|description|name|address|phone|website)'),'beta audit contains no private content or evidence payload');

select * from finish();
rollback;
