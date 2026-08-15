begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

select has_schema('portal_private','Package 6B has a private portal schema');
select has_table('portal_private','store_profiles','managed portal state exists');
select has_table('portal_private','controlled_changes','controlled changes remain private');
select has_table('portal_private','store_updates','text Store Updates are durable');
select has_table('portal_private','official_links','official social links are durable');
select has_table('portal_private','support_tickets','support tickets are durable');
select has_table('portal_private','support_replies','support replies are durable');
select has_table('portal_private','support_events','support status history is durable');
select has_table('portal_private','portal_audit_events','portal audit is narrow and append-only');

select has_function('app_public','portal_get_home',array[]::text[],'portal home RPC exists');
select has_function('app_public','portal_get_hours',array[]::text[],'hours read RPC exists');
select has_function('app_public','portal_save_hours',array['jsonb'],'hours save RPC exists');
select has_function('app_public','portal_save_managed_fields',array['jsonb'],'managed-field RPC exists');
select has_function('app_public','portal_submit_controlled_change',array['jsonb'],'controlled-change RPC exists');
select has_function('app_public','portal_list_updates',array[]::text[],'updates read RPC exists');
select has_function('app_public','portal_create_update',array['jsonb'],'text update create RPC exists');
select has_function('app_public','portal_archive_update',array['text'],'update archive RPC exists');
select has_function('app_public','portal_restore_update',array['text'],'update restore RPC exists');
select has_function('app_public','portal_list_official_links',array[]::text[],'official-link read RPC exists');
select has_function('app_public','portal_save_official_link',array['jsonb'],'official-link save RPC exists');
select has_function('app_public','portal_remove_official_link',array['text'],'official-link remove RPC exists');
select has_function('app_public','portal_list_support_tickets',array[]::text[],'support list RPC exists');
select has_function('app_public','portal_create_support_ticket',array['jsonb'],'support create RPC exists');
select has_function('app_public','portal_reply_support_ticket',array['text','text'],'support reply RPC exists');
select has_function('app_public','portal_confirm_support_resolution',array['text'],'support confirmation RPC exists');
select has_function('app_public','portal_reopen_support_ticket',array['text'],'support reopen RPC exists');
select has_function('app_public','portal_preview_public_listing',array[]::text[],'owner preview RPC exists');

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='portal_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)),'every portal table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='portal_private' and grantee in ('anon','authenticated')),'browser roles cannot access portal tables directly');
select ok(not exists(select 1 from information_schema.routines where routine_schema='app_public' and routine_name like 'portal_%media%'),'no Portal media command exists before M-01');
select ok(position($q$'official_media'$q$ in lower(pg_get_functiondef('app_public.portal_submit_controlled_change(jsonb)'::regprocedure)))>0
  and position('portal_unavailable' in lower(pg_get_functiondef('app_public.portal_submit_controlled_change(jsonb)'::regprocedure)))>0,'official-media controlled input fails closed');

select ok(position($q$g.state='active'$q$ in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0
  and position($q$p.state='active'$q$ in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0,'scope derives from active 6A grant and partnership');
select ok(position('current_session_is_active()' in lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)))>0
  and position('current_session_has_mfa()' in lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)))>0
  and position($q$current_session_recent_auth(interval '10 minutes')$q$ in lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)))>0,'every RPC inherits open-session, MFA, and recent-auth checks');
select ok(position('partner_access_revocations' in lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)))>0
  and position('partner_consent_is_current' in lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)))>0,'revocation and stale material consent deny Portal access');
select ok(position('count(*)=1' in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0,'ambiguous multi-store scope fails closed');
select ok(position($q$stage='private_beta'$q$ in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0
  and position($q$audience='regional_readiness'$q$ in replace(lower(pg_get_functiondef('portal_private.require_portal_scope()'::regprocedure)),' ',''))>0,'real Portal records remain hidden in the private-beta audience');

select ok(position('store_weekly_hours' in lower(pg_get_functiondef('app_public.portal_save_hours(jsonb)'::regprocedure)))>0
  and position('store_hour_exceptions' in lower(pg_get_functiondef('app_public.portal_save_hours(jsonb)'::regprocedure)))>0,'weekly and date-specific hours publish to catalog authority');
select ok(position('store_fact_verifications' in lower(pg_get_functiondef('app_public.portal_save_hours(jsonb)'::regprocedure)))>0,'direct managed publishing records hours provenance');
select ok(position('update app_public.stores' in lower(pg_get_functiondef('app_public.portal_save_managed_fields(jsonb)'::regprocedure)))>0
  and position($q$'contact'$q$ in lower(pg_get_functiondef('app_public.portal_save_managed_fields(jsonb)'::regprocedure)))>0
  and position($q$'categories_attributes'$q$ in lower(pg_get_functiondef('app_public.portal_save_managed_fields(jsonb)'::regprocedure)))>0
  and position('store_partner' in lower(pg_get_functiondef('app_public.portal_save_managed_fields(jsonb)'::regprocedure)))>0,'representative-managed fields publish directly with field-group provenance');
select ok(position('admin_review_cases' in lower(pg_get_functiondef('app_public.portal_submit_controlled_change(jsonb)'::regprocedure)))>0
  and position('admin_field_change_requests' in lower(pg_get_functiondef('app_public.portal_submit_controlled_change(jsonb)'::regprocedure)))>0,'controlled fields enter typed Administrator review');
select ok(position('update app_public.stores' in lower(pg_get_functiondef('app_public.portal_submit_controlled_change(jsonb)'::regprocedure)))=0,'controlled requested values remain unpublished');

select ok(position($q$imageRequested'$q$ in pg_get_functiondef('app_public.portal_create_update(jsonb)'::regprocedure))>0
  and position('portal_unavailable' in lower(pg_get_functiondef('app_public.portal_create_update(jsonb)'::regprocedure)))>0,'image-bearing Store Updates fail closed');
select ok(position($q$state='archived'$q$ in replace(lower(pg_get_functiondef('app_public.portal_archive_update(text)'::regprocedure)),' ',''))>0
  and position($q$state='live'$q$ in replace(lower(pg_get_functiondef('app_public.portal_restore_update(text)'::regprocedure)),' ',''))>0,'text updates support durable archive and restore');
select ok(position('facebook\.com' in lower(pg_get_functiondef('portal_private.official_link_allowed(text,text)'::regprocedure)))>0
  and position('instagram\.com' in lower(pg_get_functiondef('portal_private.official_link_allowed(text,text)'::regprocedure)))>0
  and position('tiktok\.com' in lower(pg_get_functiondef('portal_private.official_link_allowed(text,text)'::regprocedure)))>0,'official social links use a server allowlist');

select ok(position('jsonb_array_length' in lower(pg_get_functiondef('portal_private.diagnostics_allowed(jsonb)'::regprocedure)))>0
  and position('120' in pg_get_functiondef('portal_private.diagnostics_allowed(jsonb)'::regprocedure))>0,'support diagnostics are bounded');
select ok(position($q$'browser'$q$ in pg_get_functiondef('portal_private.diagnostics_allowed(jsonb)'::regprocedure))>0
  and position($q$'operating_system'$q$ in pg_get_functiondef('portal_private.diagnostics_allowed(jsonb)'::regprocedure))>0
  and position('token|code|secret|key' in lower(pg_get_functiondef('portal_private.diagnostics_allowed(jsonb)'::regprocedure)))>0,'support diagnostics are allowlisted and secret-scrubbed');
select ok(position($q$'screenshotAttached',false$q$ in replace(pg_get_functiondef('portal_private.support_ticket_json(uuid)'::regprocedure),' ',''))>0,'support responses cannot imply a media attachment');
select ok(position($q$state='reopened'$q$ in replace(lower(pg_get_functiondef('app_public.portal_reopen_support_ticket(text)'::regprocedure)),' ',''))>0
  and position('support_events' in lower(pg_get_functiondef('app_public.portal_reopen_support_ticket(text)'::regprocedure)))>0,'support reopen is durable with status history');

select ok(position('pg_advisory_xact_lock' in lower(pg_get_functiondef('portal_private.lock_portal_store(uuid)'::regprocedure)))>0,'portal mutations serialize per exact store');
select ok(position('portal_audit_events' in lower(pg_get_functiondef('portal_private.record_portal_event(text,uuid,uuid,uuid,bytea,bigint,bigint)'::regprocedure)))>0
  and position('privileged_audit_events' in lower(pg_get_functiondef('portal_private.record_portal_event(text,uuid,uuid,uuid,bytea,bigint,bigint)'::regprocedure)))>0,'mutations write narrow local and hash-chained audit evidence');
select ok(position('shopper_private' in lower(pg_get_functiondef('app_public.portal_get_home()'::regprocedure)))=0
  and position('review_private' in lower(pg_get_functiondef('app_public.portal_get_home()'::regprocedure)))=0,'Portal home cannot browse shopper-private or review data');
select ok(not has_function_privilege('anon','app_public.portal_get_home()','EXECUTE')
  and has_function_privilege('authenticated','app_public.portal_get_home()','EXECUTE'),'Portal RPCs are authenticated only');
select ok(has_table_privilege('identity_service','app_public.stores','SELECT,UPDATE')
  and has_table_privilege('identity_service','app_public.store_category_assignments','SELECT')
  and has_table_privilege('identity_service','app_public.store_fact_verifications','SELECT,INSERT,UPDATE')
  and has_table_privilege('identity_service','app_public.store_weekly_hours','SELECT,INSERT,DELETE')
  and has_table_privilege('identity_service','app_public.store_hour_exceptions','SELECT,INSERT,DELETE'),
  'Portal definer has only the catalog privileges required by direct publication');
select is((select count(*)::integer from pg_policies where schemaname='app_public'
  and tablename in ('stores','store_category_assignments','store_fact_verifications','store_weekly_hours','store_hour_exceptions')
  and policyname like 'identity_service_portal_%'),5,'each published catalog table and its invariant dependency has an explicit Portal definer RLS path');

select * from finish();
rollback;
