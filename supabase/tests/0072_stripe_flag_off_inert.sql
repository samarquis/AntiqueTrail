-- Package 13 red-first proof: the entire Stripe billing surface is inert while
-- photo_tiers_enabled is false. Asserts the POST-migration contract only; no
-- fixture stores are fabricated because absent tier rows ARE the pilot default.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select has_column('release_private','release_capabilities','photo_tiers_enabled','monetization capability column exists');
select col_default_is('release_private','release_capabilities','photo_tiers_enabled','false','monetization defaults OFF everywhere');
select ok(coalesce((select bool_or(pg_get_constraintdef(oid) ilike '%photo_tiers_enabled%') from pg_constraint where conrelid='release_private.release_capabilities'::regclass and conname='release_capabilities_atomic'),false),'capability atomicity check covers monetization');
select ok(coalesce((select bool_or(pg_get_constraintdef(oid) ilike '%photo_tier_activation_gate%') from pg_constraint where conrelid='release_private.release_evidence_receipts'::regclass),false),'activation receipt steps joined the evidence ledger');

select has_table('partner_private','store_photo_tier_state','tier state is durable');
select has_table('partner_private','store_subscriptions','subscription mirror is durable');
select has_table('partner_private','store_webhook_events','webhook replay dedup is durable');
select has_table('partner_private','store_billing_audit_events','billing audit chain is durable');
select has_table('partner_private','store_billing_outbox','billing outbox is durable');
select ok((select count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='partner_private' and c.relname in ('store_photo_tier_state','store_subscriptions','store_webhook_events','store_billing_audit_events','store_billing_outbox') and c.relrowsecurity and c.relforcerowsecurity),'mirror tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='partner_private' and table_name in ('store_photo_tier_state','store_subscriptions','store_webhook_events','store_billing_audit_events','store_billing_outbox') and grantee in ('anon','authenticated','service_role')),'browser and generic service roles cannot touch mirror tables');
select has_column('partner_private','store_subscriptions','hide_photos_after','hidden-photo grace deadline is durable');
select ok(coalesce((select bool_or(pg_get_constraintdef(oid) ilike '%past_due%grace%') from pg_constraint where conrelid='partner_private.store_subscriptions'::regclass and conname='subscription_state_shape'),false),'mirror states cover the failed-payment and hidden-photo graces');

select has_function('partner_private','resolve_store_photo_cap',array['uuid'],'photo cap helper exists');
select is(partner_private.resolve_store_photo_cap(gen_random_uuid()),5,'stores without tier rows keep the grandfathered free cover+5 cap');
select ok(position('full_gallery' in lower(pg_get_functiondef('partner_private.resolve_store_photo_cap(uuid)'::regprocedure)))>0 and position('15' in pg_get_functiondef('partner_private.resolve_store_photo_cap(uuid)'::regprocedure))>0,'cap helper resolves gallery 15 and full_gallery uncapped');
select ok(has_function_privilege('media_automation','partner_private.resolve_store_photo_cap(uuid)','EXECUTE'),'M-01 intake consumes the resolved cap');

select has_function('app_public','billing_get_capability',array[]::text[],'billing capability RPC exists');
select is(app_public.billing_get_capability()->>'enabled','false','served capability reports staged-off');
select is(app_public.billing_get_capability()->>'source','server','capability source is server-owned');

select has_function('app_public','billing_create_checkout_session',array['uuid','uuid'],'checkout command exists');
select has_function('app_public','billing_create_portal_session',array['uuid'],'portal command exists');
select ok(position($q$message='billing_stage_disabled'$q$ in replace(lower(pg_get_functiondef('app_public.billing_create_checkout_session(uuid,uuid)'::regprocedure)),' ',''))>0,'checkout denies with stage_disabled semantics');
select ok(position($q$message='billing_stage_disabled'$q$ in replace(lower(pg_get_functiondef('app_public.billing_create_portal_session(uuid)'::regprocedure)),' ',''))>0,'portal denies with stage_disabled semantics');
select throws_ok('select app_public.billing_create_checkout_session(gen_random_uuid(),gen_random_uuid())','55000','billing_stage_disabled','checkout is inert while the flag is off');
select throws_ok('select app_public.billing_create_portal_session(gen_random_uuid())','55000','billing_stage_disabled','portal is inert while the flag is off');
select ok(position($q$message='billing_stage_disabled'$q$ in replace(lower(pg_get_functiondef('app_public.billing_create_checkout_session(uuid,uuid)'::regprocedure)),' ',''))>0
  and position('store_partner_grants' in lower(pg_get_functiondef('app_public.billing_create_checkout_session(uuid,uuid)'::regprocedure)))=0,
  'legacy checkout checks capability and cannot bypass paid consent');
select ok(position($q$message='billing_stage_disabled'$q$ in replace(lower(pg_get_functiondef('app_public.billing_create_portal_session(uuid)'::regprocedure)),' ',''))<position('store_partner_grants' in lower(pg_get_functiondef('app_public.billing_create_portal_session(uuid)'::regprocedure))),'portal checks the capability before any authorization lookup');

select has_function('partner_private','billing_apply_subscription_event',array['text','text','timestamp with time zone','uuid','text','text','text','timestamp with time zone','text'],'webhook apply exists');
select ok(not has_function_privilege('authenticated','partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text)','EXECUTE') and not has_function_privilege('anon','partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text)','EXECUTE'),'no browser role gains webhook EXECUTE while off or ever');
select ok(has_function_privilege('billing_mirror_service','partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text)','EXECUTE'),'only the mirror service applies verified events');
select ok(has_function_privilege('billing_lifecycle_service','app_public.run_due_billing_lifecycle(timestamptz,integer)','EXECUTE') and not has_function_privilege('authenticated','app_public.run_due_billing_lifecycle(timestamptz,integer)','EXECUTE'),'only the lifecycle service sweeps billing grace expiry');
select ok(position('for update skip locked' in lower(pg_get_functiondef('partner_private.apply_due_subscription_lifecycles(timestamptz,integer)'::regprocedure)))>0 and position('billing-lifecycle-singleton' in pg_get_functiondef('partner_private.apply_due_subscription_lifecycles(timestamptz,integer)'::regprocedure))>0,'grace sweep follows shared job rules');
select ok(position($q$interval '14 days'$q$ in lower(pg_get_functiondef('partner_private.apply_due_subscription_lifecycles(timestamptz,integer)'::regprocedure)))>0 and position($q$interval '30 days'$q$ in lower(pg_get_functiondef('partner_private.apply_due_subscription_lifecycles(timestamptz,integer)'::regprocedure)))>0,'sweep enforces 14-day failed-payment grace into 30-day hidden-photo grace');

select has_function('release_private','promote_photo_tier_capability',array['uuid','uuid','uuid[]'],'receipt-bound monetization promotion exists');
select has_function('release_private','rollback_photo_tier_capability',array['uuid','uuid','text'],'receipt-bound monetization rollback exists');
select ok(position('external_verified' in lower(pg_get_functiondef('release_private.promote_photo_tier_capability(uuid,uuid,uuid[])'::regprocedure)))>0,'promotion binds externally verified receipts');
select ok(position('photo_tier_activation_gate' in replace(lower(pg_get_functiondef('release_private.promote_photo_tier_capability(uuid,uuid,uuid[])'::regprocedure)),' ',''))>0,'promotion requires this package''s activation gate receipt');
select ok(position('rollback_reason_required' in replace(lower(pg_get_functiondef('release_private.rollback_photo_tier_capability(uuid,uuid,text)'::regprocedure)),' ',''))>0,'rollback demands a recorded reason');
select ok(position('photo_tiers_promote' in replace(lower(pg_get_functiondef('app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)'::regprocedure)),' ',''))>0 and position('photo_tiers_rollback' in replace(lower(pg_get_functiondef('app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)'::regprocedure)),' ',''))>0,'executor dispatches both monetization commands');
select ok(position('photo_tiers_enabled=false' in replace(lower(pg_get_functiondef('release_private.rollback_regional_release(uuid,uuid,text)'::regprocedure)),' ',''))>0,'regional rollback also disables monetization');

select ok(exists(select 1 from pg_trigger where tgname='webhook_events_append_only' and not tgisinternal),'webhook dedup ledger is append-only');
select ok(exists(select 1 from pg_trigger where tgname='billing_audit_append_only' and not tgisinternal),'billing audit chain is append-only');
select ok(exists(select 1 from pg_trigger where tgname='billing_outbox_guard' and not tgisinternal),'outbox rows cannot be rewritten');
select has_column('partner_private','store_subscriptions','last_event_at','out-of-order protection anchor exists');

select has_function('app_public','billing_record_subscription_event',array['text','text','timestamp with time zone','uuid','text','text','text','timestamp with time zone','text'],'worker transport for verified events exists');
select ok(has_function_privilege('billing_mirror_service','app_public.billing_get_portal_context(uuid)','EXECUTE') and not has_function_privilege('authenticated','app_public.billing_get_portal_context(uuid)','EXECUTE'),'portal customer context reaches only the mirror service');

select * from finish();
rollback;
