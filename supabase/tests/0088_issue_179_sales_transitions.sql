begin;
set local search_path=public,extensions;
select no_plan();
\ir fixtures/paid_servicing.inc
reset role;

create function pg_temp.authorize(action text, v bigint, fid uuid default null, eid text default null, closed_id uuid default null) returns uuid
language plpgsql as $$ declare rid uuid:=extensions.gen_random_uuid(); begin
  insert into partner_private.photo_tier_transition_authorizations(receipt_id,action,expected_sales_version,reason,finality_id,event_id,falsified_receipt_id,product_owner_notified_at,expires_at)
    values(rid,action,v,'synthetic_test',fid,eid,closed_id,statement_timestamp(),statement_timestamp()+interval '10 minutes');
  insert into partner_private.photo_tier_transition_signatures(receipt_id,responsibility,signer_id,payload_digest,provider_verification_id)
    select rid,r,extensions.gen_random_uuid(),partner_private.billing_transition_payload(rid),extensions.gen_random_uuid()::text
    from unnest(case when action='close' then array['Operations','ProductOwner'] else array['Operations','Security'] end) r;
  return rid;
end $$;
create function pg_temp.finality(v bigint, patch jsonb default '{}') returns uuid language plpgsql as $$
declare fid uuid:=extensions.gen_random_uuid(); inv jsonb; e jsonb; begin
  inv:=partner_private.billing_transition_inventory();
  e:=jsonb_build_object('history_complete',true,'balance_settled',true,'provider_account_digest',repeat('1',64),'finality_digest',repeat('2',64),
    'horizon_policy_version','synthetic-v1','historical_charge_digest',inv->'photo_tier_charge_refunds'->>'digest',
    'historical_charge_count',inv->'photo_tier_charge_refunds'->'count',
    'obligations',jsonb_build_object('open_checkout',0,'live_subscription',0,'refund',0,'dispute',0,'invoice',0,'payment',0,'webhook',0,'outbox',0,'reconciliation',0,'unknown',0),
    'horizon_ends_at',jsonb_build_object('dispute',now()-interval '1 day','reversal',now()-interval '1 day','adjustment',now()-interval '1 day','settlement',now()-interval '1 day'))||patch;
  insert into partner_private.photo_tier_provider_finality values(fid,v,extensions.digest(convert_to(inv::text,'utf8'),'sha256'),statement_timestamp(),e,statement_timestamp());
  return fid;
end $$;
create temp table ids(kind text primary key, id uuid);
insert into ids values('pause',pg_temp.authorize('pause',1));
select ok(not has_function_privilege('authenticated','app_public.pause_photo_tier_sales(uuid,bigint,uuid)','execute'),'browser cannot pause');
select ok(not has_function_privilege('billing_mirror_service','app_public.close_photo_tier_servicing(uuid,bigint,uuid)','execute'),'provider worker cannot close');
select ok(not has_table_privilege('billing_transition_service','partner_private.photo_tier_transition_signatures','insert'),'deployment cannot forge signatures');
select ok(not has_table_privilege('billing_transition_service','partner_private.photo_tier_provider_finality','insert'),'deployment cannot forge finality');
select ok(not has_table_privilege('authenticated','partner_private.photo_tier_webhook_journal','select'),'journal private');
select throws_ok($$select app_public.pause_photo_tier_sales((select id from ids where kind='pause'),2,'17900000-0000-4000-8000-000000000001')$$,'40001','billing_sales_version_stale','CAS denies stale version');
select throws_ok($$select app_public.pause_photo_tier_sales(null,1,null)$$,'22023','billing_transition_invalid','null inputs deny');
insert into ids values('wrong',pg_temp.authorize('close',1,pg_temp.finality(1)));
select throws_ok($$select app_public.pause_photo_tier_sales((select id from ids where kind='wrong'),1,'17900000-0000-4000-8000-000000000001')$$,'42501','billing_transition_authorization_denied','action bound to signatures');
insert into partner_private.photo_tier_transition_authorizations(receipt_id,action,expected_sales_version,reason,product_owner_notified_at,expires_at)
 values('17900000-0000-4000-8000-000000000002','pause',1,'unsigned_test',now(),now()+interval '1 minute');
select throws_ok($$select app_public.pause_photo_tier_sales('17900000-0000-4000-8000-000000000002',1,'17900000-0000-4000-8000-000000000001')$$,'42501','billing_transition_signatures_required','unsigned stop denied');
select throws_ok($$update partner_private.photo_tier_transition_authorizations set reason='mutated'$$,'42501','billing_append_only','signed input immutable');
select throws_ok($$update partner_private.photo_tier_transition_signatures set responsibility='ProductOwner'$$,'42501','billing_append_only','signature immutable');
-- Reserve an initial Checkout with the shipped public API.
set local role authenticated;
create temp table consent as select app_public.billing_record_paid_tier_consent('17800000-0000-4000-8000-000000000001','gallery',178,repeat('11',32),
 (select 0), '17900000-0000-4000-8000-000000000003') as result;
reset role;
set local role authenticated;
select app_public.billing_create_checkout_session('17800000-0000-4000-8000-000000000001','gallery',
  (select (result->>'consentId')::uuid from consent),178,'17900000-0000-4000-8000-000000000004');
reset role;
savepoint crash;
select is(app_public.pause_photo_tier_sales((select id from ids where kind='pause'),1,'17900000-0000-4000-8000-000000000001')->>'state','servicing_only','pause commits servicing');
rollback to crash;
select is((select state from partner_private.photo_tier_sales_control),'sales_open','crash rolls back state');
select is((select count(*) from partner_private.photo_tier_sales_transition_receipts),0::bigint,'crash rolls back receipt');
select is(app_public.pause_photo_tier_sales((select id from ids where kind='pause'),1,'17900000-0000-4000-8000-000000000001')->>'salesGeneration','2','pause fences old generation');
select is((select state from partner_private.photo_tier_checkout_sessions),'expire_pending','pause freezes open Checkout');
select is(jsonb_array_length((select inventory->'open_checkout_ids' from partner_private.photo_tier_sales_transition_receipts)),1,'stop receipt binds exact Checkout');
select is(app_public.pause_photo_tier_sales((select id from ids where kind='pause'),1,'17900000-0000-4000-8000-000000000001')->>'version','2','same input replay succeeds');
select throws_ok($$select app_public.pause_photo_tier_sales((select id from ids where kind='pause'),1,gen_random_uuid())$$,'22023','billing_idempotency_mismatch','different key denies receipt reuse');
select throws_ok($$select app_public.resume_photo_tier_sales(gen_random_uuid(),gen_random_uuid(),2,gen_random_uuid())$$,'55000','billing_resume_not_implemented','resume denied before 180');
savepoint late_checkout;
select app_public.billing_bind_checkout_provider((select session_id from partner_private.photo_tier_checkout_sessions),repeat('5',64),1,'synthetic-reference');
select is(app_public.billing_record_checkout_event('evt_pause179completion',now(),repeat('5',64),1,'cus_pause179completion','sub_pause179completion',now()+interval '1 month'),'refund_pending','old-generation completion must cancel and fully refund');
select ok(not exists(select 1 from partner_private.store_photo_tier_state where tier<>'free'),'old-generation initial payment never grants paid entitlement');
select is((select state from partner_private.photo_tier_refund_reconciliations),'queued','cancel/refund obligation durable after pause');
rollback to late_checkout;
insert into ids values('open_close',pg_temp.authorize('close',2,pg_temp.finality(2)));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='open_close'),2,gen_random_uuid())$$,'55000','billing_obligations_open','even signed provider zero cannot hide local open Checkout');
select is(app_public.billing_due_checkout_expiry(),'[]'::jsonb,'undispatched paused reservation expires without a provider call');
select is((select state from partner_private.photo_tier_checkout_sessions),'expired','paused undispatched session terminal');
-- Every provider obligation category must be explicitly zero.
create function pg_temp.test_finality_denials() returns setof text language plpgsql as $$
declare k text; fid uuid; rid uuid; e jsonb; begin
  foreach k in array array['open_checkout','live_subscription','refund','dispute','invoice','payment','webhook','outbox','reconciliation','unknown'] loop
    fid:=pg_temp.finality(2);
    select evidence into e from partner_private.photo_tier_provider_finality where finality_id=fid;
    fid:=pg_temp.finality(2,jsonb_build_object('obligations',(e->'obligations')||jsonb_build_object(k,1)));
    rid:=pg_temp.authorize('close',2,fid);
    return next throws_ok(format('select app_public.close_photo_tier_servicing(%L,2,gen_random_uuid())',rid),'55000','billing_finality_unproved','denies provider obligation: '||k);
  end loop;
  foreach k in array array['dispute','reversal','adjustment','settlement'] loop
    fid:=pg_temp.finality(2);
    select evidence into e from partner_private.photo_tier_provider_finality where finality_id=fid;
    fid:=pg_temp.finality(2,jsonb_build_object('horizon_ends_at',(e->'horizon_ends_at')||jsonb_build_object(k,now()+interval '1 day')));
    rid:=pg_temp.authorize('close',2,fid);
    return next throws_ok(format('select app_public.close_photo_tier_servicing(%L,2,gen_random_uuid())',rid),'55000','billing_finality_unproved','denies incomplete horizon: '||k);
  end loop;
  for e in select value from jsonb_array_elements('[{"history_complete":false},{"balance_settled":false},{"historical_charge_digest":"wrong"},{"horizon_policy_version":null},{"obligations":{}},{"finality_digest":null}]') loop
    rid:=pg_temp.authorize('close',2,pg_temp.finality(2,e));
    return next throws_ok(format('select app_public.close_photo_tier_servicing(%L,2,gen_random_uuid())',rid),'55000','billing_finality_unproved','denies incomplete finality: '||e::text);
  end loop;
end $$;
select * from pg_temp.test_finality_denials();
-- Observation freshness and local compensation are independent of provider zeroes.
insert into ids values('fresh_finality',pg_temp.finality(2));
insert into partner_private.photo_tier_provider_finality(finality_id,expected_sales_version,inventory_digest,observed_at,evidence)
select '17900000-0000-4000-8000-000000000070',2,inventory_digest,now()-interval '2 minutes',evidence
from partner_private.photo_tier_provider_finality where finality_id=(select id from ids where kind='fresh_finality');
insert into ids values('stale_close',pg_temp.authorize('close',2,'17900000-0000-4000-8000-000000000070'));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='stale_close'),2,gen_random_uuid())$$,'55000','billing_finality_unproved','stale provider observation denies closure');
savepoint compensation;
insert into partner_private.photo_tier_subscription_changes(store_id,representative_id,subscription_id,subscription_version,source_tier,source_tier_version,target_tier,config_version,config_digest,sales_generation,idempotency_key,state,effective_at)
values('17800000-0000-4000-8000-000000000001','17800000-0000-4000-8000-000000000010','sub_unknown179',1,'full_gallery',1,'gallery',178,decode(repeat('11',32),'hex'),1,gen_random_uuid(),'compensation_pending',now());
insert into ids values('compensation_close',pg_temp.authorize('close',2,pg_temp.finality(2)));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='compensation_close'),2,gen_random_uuid())$$,'55000','billing_obligations_open','unresolved compensation blocks even provider zero');
rollback to compensation;
savepoint refundable;
insert into partner_private.photo_tier_charge_refunds(store_id,subscription_id,charge_id,charged_at,amount,currency)
values('17800000-0000-4000-8000-000000000001','sub_unknown179','ch_refundable179',now(),1200,'usd');
insert into ids values('refundable_close',pg_temp.authorize('close',2,pg_temp.finality(2)));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='refundable_close'),2,gen_random_uuid())$$,'55000','billing_obligations_open','promised 48-hour refund window blocks closure');
rollback to refundable;
savepoint overlapping_workers;
select ok(app_public.billing_begin_provider_work('17900000-0000-4000-8000-000000000090'),'first provider invocation fenced');
select ok(app_public.billing_begin_provider_work('17900000-0000-4000-8000-000000000091'),'duplicate provider invocation independently fenced');
select ok(app_public.billing_finish_provider_work('17900000-0000-4000-8000-000000000090'),'first worker completes only its own fence');
insert into ids values('worker_close',pg_temp.authorize('close',2,pg_temp.finality(2)));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='worker_close'),2,gen_random_uuid())$$,'55000','billing_obligations_open','a delayed duplicate worker blocks closure after peer completion');
select throws_ok($$select app_public.billing_reconcile_provider_work('17900000-0000-4000-8000-000000000091','{}')$$,'55000','billing_work_unresolved','crashed worker cannot time out without termination and provider proof');
select ok(app_public.billing_reconcile_provider_work('17900000-0000-4000-8000-000000000091',jsonb_build_object('attempt_id','17900000-0000-4000-8000-000000000091','invocation_terminated',true,'provider_reconciled',true,'observed_at',statement_timestamp(),'evidence_digest',repeat('9',64))),'verified termination and reconciliation resolve crashed invocation');
select ok(not has_function_privilege('billing_mirror_service','app_public.billing_reconcile_provider_work(uuid,jsonb)','execute'),'ordinary worker cannot attest independent termination/reconciliation');
select ok(not has_function_privilege('authenticated','app_public.billing_begin_provider_work(uuid)','execute'),'browser cannot reserve provider work');
rollback to overlapping_workers;
insert into ids values('close',pg_temp.authorize('close',2,pg_temp.finality(2)));
savepoint close_crash;
select is(app_public.close_photo_tier_servicing((select id from ids where kind='close'),2,'17900000-0000-4000-8000-000000000005')->>'state','off_prelaunch','complete finality closes');
rollback to close_crash;
select is((select state from partner_private.photo_tier_sales_control),'servicing_only','closure crash rolls back');
select is(app_public.close_photo_tier_servicing((select id from ids where kind='close'),2,'17900000-0000-4000-8000-000000000005')->>'state','off_prelaunch','replayed closure succeeds');
select is(app_public.close_photo_tier_servicing((select id from ids where kind='close'),2,'17900000-0000-4000-8000-000000000005')->>'version','3','closed command is idempotent');
select throws_ok($$select app_public.billing_record_checkout_expired(repeat('1',64),1)$$,'55000','billing_stage_disabled','off blocks direct worker mutation');
select throws_ok($$select app_public.billing_due_checkout_expiry()$$,'55000','billing_stage_disabled','off blocks expiry job');
select is(app_public.billing_capture_verified_event('evt_late1790001','charge.dispute.created',repeat('3',64)),'quarantined','late verified dispute is quarantined');
select is((select state from partner_private.photo_tier_sales_control),'off_prelaunch','capture never reopens or applies');
select throws_ok($$update partner_private.photo_tier_webhook_journal set event_kind='charge.other'$$,'42501','billing_append_only','captured journal identity immutable');
select is((select count(*) from partner_private.store_webhook_events),0::bigint,'quarantine has no business event effect');
select throws_ok($$select app_public.billing_resolve_verified_event('evt_late1790001',repeat('3',64),repeat('4',64))$$,'55000','billing_stage_disabled','quarantined event cannot resolve while off');
select throws_ok($$select app_public.billing_capture_verified_event('evt_late1790001','charge.dispute.created',repeat('4',64))$$,'22023','billing_idempotency_mismatch','same event changed payload denied');
insert into ids values('reopen',pg_temp.authorize('reopen_obligation',3,null,'evt_late1790001',(select id from ids where kind='close')));
savepoint reopen_crash;
select is(app_public.reopen_photo_tier_servicing_for_obligation((select id from ids where kind='reopen'),3,'17900000-0000-4000-8000-000000000006')->>'state','servicing_only','signed late obligation reopens servicing');
rollback to reopen_crash;
select is((select state from partner_private.photo_tier_sales_control),'off_prelaunch','reopen rollback preserves off');
select is(app_public.reopen_photo_tier_servicing_for_obligation((select id from ids where kind='reopen'),3,'17900000-0000-4000-8000-000000000006')->>'version','4','reopen replay after crash');
select is((select commercial_config_version from partner_private.photo_tier_sales_control),178::bigint,'reopen restores servicing configuration');
select is((select count(*) from partner_private.photo_tier_webhook_journal where resolved_at is null),1::bigint,'reopen does not apply quarantined event');
insert into ids values('pending_close',pg_temp.authorize('close',4,pg_temp.finality(4)));
select throws_ok($$select app_public.close_photo_tier_servicing((select id from ids where kind='pending_close'),4,gen_random_uuid())$$,'55000','billing_obligations_open','unresolved journal prevents another close');
select is(app_public.billing_resolve_verified_event('evt_late1790001',repeat('3',64),repeat('4',64)),'resolved','provider reconciliation resolves only after reopen');
insert into ids values('reclose',pg_temp.authorize('close',4,pg_temp.finality(4)));
select is(app_public.close_photo_tier_servicing((select id from ids where kind='reclose'),4,gen_random_uuid())->>'state','off_prelaunch','reclose requires fresh finality');
select * from finish();
rollback;
