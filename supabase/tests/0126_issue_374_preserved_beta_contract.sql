-- Current behavior restored by the forward-only preserved-beta bridge.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select ok(has_schema_privilege('review_automation','extensions','usage'),'review cryptographic helpers are reachable by their existing owner');
select ok(has_schema_privilege('release_executor','app_public','usage'),'release executor can reach its existing boundary');
select has_column('media_private','media_uploads','rejection_reason','existing uploads retain optional rejection reason');
select has_column('media_private','media_uploads','rejected_by','existing uploads retain optional moderator reference');
select has_column('media_private','media_uploads','rejected_at','existing uploads retain optional rejection time');
select has_function('app_public','shopper_submit_correction',array['uuid','text','text','bytea','text'],'correction command requires rate context');
select ok(to_regprocedure('app_public.shopper_submit_correction(uuid,text,text,text)') is null,'obsolete unrate-limited correction overload is absent');
select ok(not has_table_privilege('authenticated','shopper_private.correction_rate_events','select,insert,update,delete'),'authenticated callers cannot read or alter rate history directly');
select ok(not has_function_privilege('anon','app_public.shopper_submit_correction(uuid,text,text,bytea,text)','execute'),'anonymous callers cannot submit private corrections');
select ok(has_function_privilege('authenticated','app_public.shopper_submit_correction(uuid,text,text,bytea,text)','execute'),'authenticated callers retain the guarded correction boundary');
select ok(to_regprocedure('app_public.probe_env()') is null,'historical diagnostic remains removed');

-- Exercise the trigger with distinct record shapes. The old combined condition
-- resolved listing-only fields on partnership/grant records and failed before
-- it could evaluate their state. No real account, grant or store is changed.
create temporary table listing_claims(claimant_id uuid,state text,material_reconsent_required boolean);
create temporary table beta_test_partnership(auth_user_id uuid,state text);
create trigger issue374_claim before insert or update on listing_claims for each row execute function partner_private.guard_current_partner_consent();
create trigger issue374_partnership before insert or update on beta_test_partnership for each row execute function partner_private.guard_current_partner_consent();
select lives_ok($$insert into listing_claims values(null,'draft',false)$$,'draft claim insert does not inspect unavailable OLD state');
select lives_ok($$insert into beta_test_partnership values(null,'retired')$$,'inactive partnership does not read listing-only fields');
select throws_ok($$insert into beta_test_partnership values(null,'active')$$,'42501','partner_material_reconsent_required','active partnership without current consent remains denied');
select lives_ok($$update listing_claims set material_reconsent_required=true$$,'material reconsent flag can be raised without activating the claim');

select * from finish();
rollback;
