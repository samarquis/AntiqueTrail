begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select has_table('partner_private','photo_tier_change_consents','paid changes have separate immutable consent');
select has_table('partner_private','photo_tier_subscription_changes','paid changes remain durable until verified application or compensation');
select has_table('partner_private','photo_tier_charge_refunds','refund request time survives processing delays');
select has_function('app_public','billing_record_paid_change_consent',array['uuid','bigint','bigint','bigint','text','uuid','uuid'],'upgrade consent binds source and config versions');
select has_function('app_public','billing_request_subscription_change',array['uuid','text','uuid','bigint','uuid'],'exact-store servicing command exists');
select has_function('app_public','billing_request_charge_refund',array['uuid','text','uuid'],'charge refund requests are server-owned');
select has_function('app_public','billing_due_servicing',array[]::text[],'servicing recovery is runnable');
\ir fixtures/paid_servicing.inc
insert into partner_private.store_photo_tier_state(store_id,tier,source)
values('17800000-0000-4000-8000-000000000001','gallery','subscription');
insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
values('17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','active',statement_timestamp()+interval '20 days');
select throws_ok($$select app_public.billing_record_paid_tier_consent('17800000-0000-4000-8000-000000000001','full_gallery',178,repeat('11',32),1,gen_random_uuid())$$,
  '42501','billing_action_denied','initial Checkout consent remains Free-only');
set local role authenticated;
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',2,1,178,repeat('11',32),gen_random_uuid())$$,
  '42501','billing_action_denied','stale subscription version cannot consent');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000002',1,1,178,repeat('11',32),gen_random_uuid())$$,
  '42501','billing_action_denied','wrong-store consent is denied');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('99',32),gen_random_uuid())$$,
  '42501','billing_action_denied','disclosure mismatch is denied');
select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),'17800000-0000-4000-8000-000000000040');
reset role;
select is((select count(*)::integer from partner_private.photo_tier_change_consents),1,'one immutable consent');
select throws_ok($$update partner_private.photo_tier_change_consents set expires_at=expires_at+interval '1 hour'$$,
  '42501','billing_append_only','consent terms cannot mutate');
select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),'17800000-0000-4000-8000-000000000040');
select is((select count(*)::integer from partner_private.photo_tier_change_consents),1,'same consent retry returns prior receipt');
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_change_consents),1,'17800000-0000-4000-8000-000000000041');
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'gallery','reservation cannot apply entitlement');
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_change_consents),1,'17800000-0000-4000-8000-000000000041');
select is((select count(*)::integer from partner_private.photo_tier_subscription_changes),1,'lost response cannot allocate another change');
select throws_ok($$select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','free',null,1,'17800000-0000-4000-8000-000000000041')$$,
  '22023','billing_idempotency_mismatch','same change key different input denies');
set local role billing_automation;
update partner_private.photo_tier_sales_control set state='servicing_only',sales_generation=sales_generation+1;
reset role;
select is(app_public.billing_prepare_subscription_change((select change_id from partner_private.photo_tier_subscription_changes))->>'state','superseded','pause before dispatch prevents provider work');
select is((select state from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),'active','pause never cancels existing subscription');
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),gen_random_uuid())$$,
  '55000','billing_stage_disabled','servicing-only denies fresh upgrade consent');
insert into partner_private.photo_tier_charge_refunds(store_id,subscription_id,charge_id,charged_at,amount,currency)
values('17800000-0000-4000-8000-000000000001','sub_servicing178','ch_servicing178',statement_timestamp()-interval '47 hours',1200,'usd');
set local role authenticated;
select app_public.billing_request_charge_refund('17800000-0000-4000-8000-000000000001',(app_public.billing_get_servicing_context()->'charges'->0->>'refundRequestId'),'17800000-0000-4000-8000-000000000051');
reset role;
select is((select state from partner_private.photo_tier_charge_refunds where charge_id='ch_servicing178'),'pending','eligible charge request is durable in servicing-only');
select is((select amount from partner_private.photo_tier_charge_refunds where charge_id='ch_servicing178'),1200::bigint,'full charge is reserved for refund');
select is(app_public.billing_request_charge_refund('17800000-0000-4000-8000-000000000001',(select refund_request_id::text from partner_private.photo_tier_charge_refunds where charge_id='ch_servicing178'),'17800000-0000-4000-8000-000000000051')->>'state','pending','opaque refund UUID replay retains the original pending request');
select ok(not has_table_privilege('authenticated','partner_private.photo_tier_charge_refunds','select'),'charge records are private');
select ok(not has_function_privilege('authenticated','app_public.billing_prepare_subscription_change(uuid)','execute'),'browser cannot dispatch provider work');
select ok(not has_function_privilege('authenticated','app_public.billing_bind_provider_mutation(uuid,text,jsonb,text)','execute'),'browser cannot bind a provider mutation');
-- Provider scheduling must be dispatched now, not at the future renewal boundary.
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','free',null,1,'17800000-0000-4000-8000-000000000061');
select is(jsonb_array_length(app_public.billing_due_servicing()->'changes'),1,'future cancellation is immediately due for provider dispatch');
select is(app_public.billing_prepare_subscription_change((select change_id from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000061'))->>'state','pending','future boundary does not suppress dispatch');
-- Failure, not renewal, anchors fourteen days of retained paid entitlement.
insert into app_public.store_media(store_id,asset_path,kind,alt_text,display_order)
select '17800000-0000-4000-8000-000000000001','/assets/fixture.svg','gallery','Photo '||n,n from generate_series(1,7) n;
update partner_private.store_subscriptions set state='past_due',failed_payment_started_at='2026-09-01T00:00:00Z',current_period_end='2026-10-01T00:00:00Z'
where store_id='17800000-0000-4000-8000-000000000001';
select partner_private.apply_due_subscription_lifecycles('2026-09-14T23:59:59Z',50);
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'gallery','paid access remains through fourteen-day failure grace');
select partner_private.apply_due_subscription_lifecycles('2026-09-15T00:00:00Z',50);
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'free','failure clock downgrades before a later renewal date');
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001'),5,'Free retains five gallery photos in the uncapped catalog projection');
select is((select count(*)::integer from media_private.tier_hidden_photos where store_id='17800000-0000-4000-8000-000000000001' and state='hidden'),2,'only excess photos enter the thirty-day hidden grace');
update partner_private.store_photo_tier_state set tier='gallery',source='subscription' where store_id='17800000-0000-4000-8000-000000000001';
select media_private.reconcile_tier_photos('17800000-0000-4000-8000-000000000001','2026-09-20T00:00:00Z');
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001'),7,'capacity recovery restores approved unexpired photos');
update partner_private.store_photo_tier_state set tier='free',source='default' where store_id='17800000-0000-4000-8000-000000000001';
select media_private.reconcile_tier_photos('17800000-0000-4000-8000-000000000001','2026-09-21T00:00:00Z');
select media_private.reconcile_due_tier_photos('2026-10-21T00:00:00Z',1);
select is((select count(*)::integer from media_private.tier_hidden_photos where state='purged'),2,'bounded cleanup selects actual due obligations');
-- Verified cancellation schedules the exact paid-through boundary without granting Free early.
update partner_private.photo_tier_subscription_changes set state='superseded',completed_at=statement_timestamp() where state='pending';
update partner_private.store_subscriptions set state='active',hide_photos_after=null,failed_payment_started_at=null,entitled_tier='gallery' where store_id='17800000-0000-4000-8000-000000000001';
update partner_private.store_photo_tier_state set tier='gallery',source='subscription' where store_id='17800000-0000-4000-8000-000000000001';
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','free',null,
  (select version from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),'17800000-0000-4000-8000-000000000071');
select app_public.billing_bind_change_request(c.change_id,jsonb_build_object('subscriptionId',c.subscription_id,'customerId','cus_servicing178','itemId','si_servicing178',
  'sourcePriceId','price_original178','productId','prod_servicing178','periodEnd',extract(epoch from s.current_period_end),'targetTier','free','priceCents',0,'currency','usd'))
from partner_private.photo_tier_subscription_changes c join partner_private.store_subscriptions s on s.store_id=c.store_id where c.idempotency_key='17800000-0000-4000-8000-000000000071';
select app_public.billing_bind_provider_mutation(change_id,'subscriptions/sub_servicing178',jsonb_build_object('metadata[paid_change_id]',change_id::text,'cancel_at_period_end','true'),null)
from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000071';
select is(app_public.billing_record_change_event(change_id,'evt_cancel178777',statement_timestamp(),subscription_id,'cus_servicing178','price_original178','active',effective_at,true),
  'scheduled','verified provider cancellation records future intent') from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000071';
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'gallery','scheduled cancellation keeps paid entitlement');
set local role billing_automation;
update partner_private.photo_tier_sales_control set state='sales_open',sales_generation=sales_generation+1;
reset role;
select throws_ok($$select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',
  (select version from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),
  (select version from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),178,repeat('11',32),gen_random_uuid())$$,
  '42501','billing_action_denied','upgrade cannot omit the accepted future cancellation from consent');
select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',
  (select version from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),
  (select version from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),178,repeat('11',32),'17800000-0000-4000-8000-000000000072',
  (select change_id from partner_private.photo_tier_subscription_changes where state='scheduled'));
select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',
  (select consent_id from partner_private.photo_tier_change_consents where idempotency_key='17800000-0000-4000-8000-000000000072'),
  (select version from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001'),'17800000-0000-4000-8000-000000000073');
select app_public.billing_bind_change_request(c.change_id,jsonb_build_object('subscriptionId',c.subscription_id,'customerId','cus_servicing178','itemId','si_servicing178',
  'sourcePriceId','price_original178','productId','prod_servicing178','periodEnd',extract(epoch from s.current_period_end),'targetTier','full_gallery','priceCents',1900,'currency','usd'))
from partner_private.photo_tier_subscription_changes c join partner_private.store_subscriptions s on s.store_id=c.store_id where c.idempotency_key='17800000-0000-4000-8000-000000000073';
select app_public.billing_bind_provider_mutation(change_id,'subscriptions/sub_servicing178',jsonb_build_object('metadata[paid_change_id]',change_id::text,'items[0][price]','price_upgrade178','proration_behavior','create_prorations'),'price_upgrade178')
from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000073';
select is(app_public.billing_record_change_event(change_id,'evt_wrong178777',statement_timestamp(),subscription_id,'cus_servicing178','price_wrong17899','active',statement_timestamp()+interval '20 days',false),
  'awaiting_target','unbound provider price cannot apply an upgrade') from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000073';
set local role billing_automation;
update partner_private.photo_tier_sales_control set state='servicing_only',sales_generation=sales_generation+1;
reset role;
select is(app_public.billing_record_change_event(change_id,'evt_pause178777',statement_timestamp(),subscription_id,'cus_servicing178','price_upgrade178','active',statement_timestamp()+interval '20 days',false),
  'compensation_pending','pause after dispatch requires compensation instead of granting the tier') from partner_private.photo_tier_subscription_changes where idempotency_key='17800000-0000-4000-8000-000000000073';
select is((select count(*)::integer from partner_private.photo_tier_subscription_changes where state='scheduled'),1,'compensation preserves the previously accepted cancellation');
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'gallery','stale upgrade does not force Free or cancel old subscription');
-- Uploaded photos use the existing object-deletion worker, not just catalog removal.
insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order)
select ('17800000-0000-4000-8000-00000000009'||n)::uuid,'17800000-0000-4000-8000-000000000001','/assets/fixture.svg','gallery','Uploaded photo '||n,n
from generate_series(6,7) n;
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
  source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,public_derivative_object_key,
  derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state,
  approved_by,approved_at,approval_reason,catalog_media_id,published_at)
select id,gen_random_uuid(),store_id,'gallery',alt_text,statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,
  'quarantine/'||id||'/original','quarantine/'||id||'/derivative.webp','official/'||id||'/v1/'||repeat('a',16)||'.webp',
  decode(repeat('11',32),'hex'),1000,640,480,'clean',true,true,'published','17800000-0000-4000-8000-000000000010',statement_timestamp(),
  'image_quality_verified',id,statement_timestamp()
from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001' and display_order in (6,7);
update partner_private.store_photo_tier_state set tier='free',source='default' where store_id='17800000-0000-4000-8000-000000000001';
select media_private.reconcile_tier_photos('17800000-0000-4000-8000-000000000001',statement_timestamp()-interval '31 days');
select is((select count(*)::integer from media_private.media_uploads where store_id='17800000-0000-4000-8000-000000000001' and state='tier_hidden'),2,'published uploads enter hidden state before their catalog FK is removed');
select media_private.reconcile_due_tier_photos(statement_timestamp(),50);
select is((select count(*)::integer from media_private.media_purge_jobs where reason_code='tier_grace_expired' and include_private and include_public and state='queued'),2,'expiry queues deletion of both private and public objects');
select media_private.claim_purge_job(purge_job_id) from media_private.media_purge_jobs where reason_code='tier_grace_expired';
select media_private.complete_purge_job(purge_job_id,upload_id) from media_private.media_purge_jobs where reason_code='tier_grace_expired';
select media_private.reconcile_due_tier_photos(statement_timestamp(),50);
select is((select count(*)::integer from media_private.media_uploads where store_id='17800000-0000-4000-8000-000000000001' and state='purged' and private_deleted_at is not null and public_deleted_at is not null),2,'worker receipts confirm both object deletions');
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001'),5,'object cleanup retains the Free gallery and store');
set local role billing_mirror_service;
select lives_ok('select app_public.billing_due_servicing()','the actual mirror worker can invoke its scoped API');
reset role;
set local role billing_lifecycle_service;
select lives_ok('select app_public.run_due_billing_lifecycle(statement_timestamp(),1)','the actual lifecycle worker can invoke its scoped API');
reset role;

-- Full Gallery publication uses the real moderation and worker path beyond old 5/20 ordinals.
update partner_private.store_photo_tier_state set tier='full_gallery',source='subscription' where store_id='17800000-0000-4000-8000-000000000001';
insert into media_private.media_uploads(upload_id,actor_tombstone,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
  source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,
  derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state)
select id,gen_random_uuid(),'17800000-0000-4000-8000-000000000001','gallery','Paid photo '||n,statement_timestamp(),gen_random_uuid(),
  'image/png',1000,640,480,'quarantine/'||id||'/original','quarantine/'||id||'/derivative.webp',
  decode(md5(id::text)||md5(id::text),'hex'),1000,640,480,'clean',true,true,'awaiting_review'
from (select n,gen_random_uuid() id from generate_series(1,25) n) rows;
select lives_ok($test$do $body$ declare r record; job jsonb; begin
  for r in select upload_id from media_private.media_uploads where state='awaiting_review' and store_id='17800000-0000-4000-8000-000000000001' loop
    perform app_public.media_approve_upload(r.upload_id,'image_quality_verified');
    job:=media_private.claim_publish_job(r.upload_id);
    perform media_private.complete_publish_job(r.upload_id,r.upload_id,job->>'publicDerivativeKey');
  end loop;
end $body$$test$,'two-argument moderation publishes more than 20 images through the real worker');
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001' and kind='gallery'),30,'Full Gallery has no hidden ordinal count cap');
update partner_private.store_photo_tier_state set tier='gallery' where store_id='17800000-0000-4000-8000-000000000001';
select media_private.reconcile_tier_photos('17800000-0000-4000-8000-000000000001',statement_timestamp());
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001' and kind='gallery'),15,'Gallery retains its 15 published photos beyond the old upload ordinal limit');
insert into app_public.store_media(store_id,asset_path,kind,alt_text,display_order)
values('17800000-0000-4000-8000-000000000001','/assets/fixture.svg','cover','Cover reusing a hidden ordinal',29);
update partner_private.store_photo_tier_state set tier='full_gallery',source='subscription' where store_id='17800000-0000-4000-8000-000000000001';
select media_private.reconcile_tier_photos('17800000-0000-4000-8000-000000000001',statement_timestamp());
select is((select count(*)::integer from app_public.store_media where store_id='17800000-0000-4000-8000-000000000001' and kind='gallery'),30,'recovery allocates a free ordinal rather than stranding an eligible hidden image');


-- Independently valid lifecycle events keep working while the upgrade is unresolved.
select is(app_public.billing_record_subscription_event('evt_failure178later','customer.subscription.updated',statement_timestamp(),
  '17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','past_due',statement_timestamp()+interval '20 days',null),'applied','payment failure applies while upgrade compensation remains pending');
select is((select count(*)::integer from partner_private.photo_tier_subscription_changes where state='compensation_pending'),1,'valid failure retains the incremental compensation obligation');
update partner_private.store_subscriptions set failed_payment_started_at=statement_timestamp()-interval '45 days',entitled_tier='full_gallery' where store_id='17800000-0000-4000-8000-000000000001';
select app_public.run_due_billing_lifecycle(statement_timestamp()-interval '31 days',50);
select app_public.run_due_billing_lifecycle(statement_timestamp(),50);
select is(app_public.billing_record_subscription_event('evt_recovery178later','customer.subscription.updated',statement_timestamp()+interval '1 second',
  '17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','active',statement_timestamp()+interval '20 days',null),'applied','payment can recover after photo cleanup without fabricating provider cancellation');
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'full_gallery','recovery restores the previously authorized paid entitlement');
select is(app_public.billing_record_subscription_event('evt_cancel178later','customer.subscription.deleted',statement_timestamp()+interval '2 seconds',
  '17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','canceled',statement_timestamp(),null),'applied','provider cancellation applies during unresolved compensation');
select is((select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001'),'free','independent cancellation removes paid entitlement');
select is((select count(*)::integer from partner_private.photo_tier_subscription_changes where state='compensation_pending'),1,'cancellation never erases unresolved financial compensation');

select is(app_public.billing_record_subscription_event('evt_recoveryaftercancel178','customer.subscription.updated',statement_timestamp()+interval '3 seconds',
  '17800000-0000-4000-8000-000000000001','cus_servicing178','sub_servicing178','active',statement_timestamp()+interval '20 days',null),'stale','actual provider cancellation cannot be undone by an ordinary active event');
select * from finish();
rollback;
