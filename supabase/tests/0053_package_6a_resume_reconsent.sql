begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('partner_private','partner_invitation_resumes','opaque invitation resume records exist');
select has_table('partner_private','partner_onboarding_command_receipts','onboarding replay receipts exist');
select has_table('partner_private','partner_material_terms','versioned material terms exist');
select has_table('partner_private','partner_reconsent_receipts','immutable reconsent receipts exist');
select has_column('partner_private','listing_claims','material_reconsent_required','claims expose a durable reconsent transition');
select has_column('partner_private','store_partnerships','consent_policy_version','partnership activation records its consent version');
select has_column('partner_private','store_partner_grants','consent_policy_version','exact grants record their consent version');
select has_function('app_public','partner_consent_command',array['text','jsonb'],'bounded material-consent command exists');
select has_function('partner_private','partner_consent_is_current',array['uuid'],'current-consent decision is centralized');
select has_function('app_public','publish_partner_material_terms',array['text','jsonb'],'material-term publication creates an explicit version transition');

select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='partner_private' and c.relname='partner_invitation_resumes'),'resume records force RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='partner_private' and c.relname='partner_onboarding_command_receipts'),'replay receipts force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='partner_private' and table_name in ('partner_invitation_resumes','partner_onboarding_command_receipts','partner_material_terms','partner_reconsent_receipts') and grantee in ('anon','authenticated')),'browser roles cannot read resume handles or consent receipts directly');
select ok(not has_function_privilege('anon','app_public.partner_consent_command(text,jsonb)','EXECUTE') and has_function_privilege('authenticated','app_public.partner_consent_command(text,jsonb)','EXECUTE'),'only authenticated sessions may use reconsent');

select ok(position('gen_random_bytes(32)' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0
  and position('''resumeHandle''' in pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure))>0,'exchange returns a high-entropy server-issued resume handle');
select ok(position('handle_hash' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0
  and not exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='partner_invitation_resumes' and column_name in ('token','raw_token','resume_handle')),'only a handle hash is durable; raw invitation and resume secrets are absent');
select ok(position('actor_user_id=actor' in replace(lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)),' ',''))>0,'resume handles are bound to the authenticated actor');
select ok(position($q$p_operation in ('resume_invitation','accept_consent')$q$ in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'the same opaque handle supports refresh and final consent');
select ok(position('partner_onboarding_command_receipts' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0
  and position('return prior.result' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'lost-response replay returns the original receipt and state');
select ok(position('input_digest' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0
  and position('partner_consent_idempotency_mismatch' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'an idempotency key cannot be replayed with different consent input');
select ok(position('current_session_has_mfa()' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0
  and position($q$current_session_recent_auth(interval '15 minutes')$q$ in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'consent finalization preserves MFA and recent-auth requirements');
select ok(position($q$stage='synthetic_alpha'$q$ in replace(lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)),' ',''))>0,'provider-free onboarding remains limited to Synthetic Alpha');

select ok((select count(*)=1 from partner_private.partner_material_terms where is_current and policy_version='synthetic-v3'),'exactly one current policy version is authoritative');
select ok(exists(select 1 from pg_trigger where tgname='partner_material_terms_history' and not tgisinternal),'published material-term versions are immutable history');
select ok(position('current_session_has_mfa()' in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0
  and position($q$current_session_recent_auth(interval '15 minutes')$q$ in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0,'material reconsent requires MFA and recent authentication');
select ok(position('reviewed' in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0
  and position('voluntary' in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0,'material reconsent records separate reviewed and voluntary acknowledgements');
select ok(position('partner_reconsent_receipts' in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0
  and position('idempotency_key' in lower(pg_get_functiondef('app_public.partner_consent_command(text,jsonb)'::regprocedure)))>0,'reconsent creates one versioned idempotent receipt');
select ok(position('current_session_has_mfa()' in lower(pg_get_functiondef('app_public.publish_partner_material_terms(text,jsonb)'::regprocedure)))>0
  and position($q$current_session_recent_auth(interval '15 minutes')$q$ in lower(pg_get_functiondef('app_public.publish_partner_material_terms(text,jsonb)'::regprocedure)))>0
  and position($q$current_user_has_role('administrator'$q$ in lower(pg_get_functiondef('app_public.publish_partner_material_terms(text,jsonb)'::regprocedure)))>0,'only a recently reauthenticated MFA Administrator may publish a material version');
select ok(position('partner_consent_is_current(actor)' in lower(pg_get_functiondef('partner_private.require_claimant()'::regprocedure)))>0
  and position('current_session_has_mfa()' in lower(pg_get_functiondef('partner_private.require_claimant()'::regprocedure)))>0,'claimants need current consent plus existing verification gates');
select ok(exists(select 1 from pg_trigger where tgname='listing_claim_current_consent' and not tgisinternal)
  and exists(select 1 from pg_trigger where tgname='claim_signal_current_consent' and not tgisinternal),'claim creation and authority signals stop for stale material terms');
select ok(exists(select 1 from pg_trigger where tgname='partnership_current_consent' and not tgisinternal)
  and exists(select 1 from pg_trigger where tgname='partner_grant_current_consent' and not tgisinternal),'partnership and exact-grant activation stop for stale material terms');
select ok(position($q$public_capability_enabled('claims')$q$ in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0
  and position($q$stage='synthetic_alpha'$q$ in replace(lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)),' ',''))>0,'real claims remain fail-closed behind release gates while Synthetic testing remains explicit');

select * from finish();
rollback;
