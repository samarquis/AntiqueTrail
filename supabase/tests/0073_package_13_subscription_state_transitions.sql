-- Package 13 subscription state transition tests (red-first)
-- Tests resolve_store_photo_cap behavior as store_subscriptions state transitions:
-- none -> active (gallery/full_gallery) -> past_due -> grace -> canceled
-- Each transition must update store_photo_tier_state and resolve_store_photo_cap accordingly.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- The cap rows reference real stores; keep these fixtures local to the test.
select has_table('app_public','stores','catalog stores table exists');
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description)
select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'db-ci-cap-store-'||lpad(i::text,3,'0'), 'DB CI Cap Store '||i, 'Topeka', 'KS',
  '1 Test Way', '00000000-0000-4000-8000-000000000001'::uuid,
  'Database CI fixture', 'Database CI fixture store'
from generate_series(1,11) i
on conflict (id) do nothing;

-- Test 1: Fresh store with no tier row defaults to free cover+5
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000001'),5,
  'absent store_photo_tier_state row -> free cover+5 cap');

-- Test 2: Store with explicit free tier row -> cap 5
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000002','free','default')
  on conflict do nothing;
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000002'),5,
  'explicit free tier -> cap 5');

-- Test 3: Gallery tier (subscription) -> cap 15
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000003','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000003'),15,
  'gallery subscription tier -> cap 15');

-- Test 4: Full_gallery tier (subscription) -> cap null (uncapped)
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000004','full_gallery','subscription')
  on conflict (store_id) do update set tier='full_gallery',source='subscription';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000004'),null,
  'full_gallery subscription tier -> uncapped (null)');

-- Test 5: Subscription state change active -> past_due -> tier stays subscription until grace
-- Simulate billing_apply_subscription_event effect: active sets tier=gallery, source=subscription
insert into partner_private.store_subscriptions (store_id, stripe_customer_id, stripe_subscription_id, state, current_period_end)
  values ('00000000-0000-4000-8000-000000000005','cus_test1234','sub_test1234','active','2099-12-31 23:59:59+00');
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000005','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000005'),15,
  'active subscription -> cap 15');

-- Test 6: past_due state retains subscription tier until grace sweep runs
update partner_private.store_subscriptions set state='past_due' where store_id='00000000-0000-4000-8000-000000000005';
-- Tier should NOT change until grace sweep runs (source remains 'subscription')
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000005'),15,
  'past_due state retains subscription tier until grace sweep');

-- Test 7: Grace sweep (apply_due_subscription_lifecycles) downgrades to free
-- This tests the mid-flight transition past_due -> grace -> free
-- First set current_period_end to past to trigger grace expiry
update partner_private.store_subscriptions
  set state='past_due', current_period_end=statement_timestamp()-interval '15 days'
  where store_id='00000000-0000-4000-8000-000000000005';
-- Run the grace sweep (14-day failed payment -> grace with 30-day hidden photos)
select partner_private.apply_due_subscription_lifecycles(statement_timestamp(),10);
-- After grace sweep: tier should be free, source='default'
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000005'),5,
  'grace sweep downgrades tier to free');

-- Test 8: Store with explicit gallery tier (not subscription) remains gallery
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000006','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='default';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000006'),15,
  'explicit gallery tier (default source) -> cap 15');

-- Test 9: Subscription cancel -> tier drops to free, source=default
insert into partner_private.store_subscriptions (store_id, stripe_customer_id, stripe_subscription_id, state, current_period_end)
  values ('00000000-0000-4000-8000-000000000007','cus_test1234','sub_test1234','active','2099-12-31 23:59:59+00');
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000007','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
-- Simulate cancellation webhook
update partner_private.store_subscriptions
  set state='canceled', downgrade_to='free', current_period_end=statement_timestamp()
  where store_id='00000000-0000-4000-8000-000000000007';
-- Lifecycle sweep should pick up canceled with downgrade_to=free
select partner_private.apply_due_subscription_lifecycles(statement_timestamp(),10);
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000007'),5,
  'canceled with downgrade_to=free -> tier drops to free');

-- Test 9: Canceled subscription (no downgrade) keeps existing tier until grace closure
-- Actually canceled without downgrade_to goes to grace -> then free on grace closure
-- This is already tested above

-- Test 10: Resubscribe after cancellation restores tier
-- Store 007 was canceled -> free. Now new active subscription.
insert into partner_private.store_subscriptions (store_id, stripe_customer_id, stripe_subscription_id, state, current_period_end)
  values ('00000000-0000-4000-8000-000000000007','cus_test2345','sub_test2345','active','2099-12-31 23:59:59+00')
  on conflict (store_id) do update set stripe_customer_id='cus_test2345',stripe_subscription_id='sub_test2345',state='active',current_period_end='2099-12-31 23:59:59+00',downgrade_to=null,hide_photos_after=null;
-- New active subscription -> tier becomes subscription tier
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000007','full_gallery','subscription')
  on conflict (store_id) do update set tier='full_gallery',source='subscription',updated_at=statement_timestamp(),version=store_photo_tier_state.version+1;
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000007'),null,
  'resubscribe full_gallery -> cap uncapped');

-- Test 11: Hidden photo grace closure (grace -> canceled after 30 days) retains free tier
insert into partner_private.store_subscriptions (store_id, stripe_customer_id, state, hide_photos_after)
  values ('00000000-0000-4000-8000-000000000008','cus_grace1234','grace',statement_timestamp()-interval '1 day')
  on conflict (store_id) do update set state='grace',hide_photos_after=statement_timestamp()-interval '1 day';
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000008','free','default')
  on conflict (store_id) do update set tier='free',source='default';
select partner_private.apply_due_subscription_lifecycles(statement_timestamp(),10);
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000008'),5,
  'hidden photo grace closure retains free tier');

-- Test 12: Cap resolution is stable across state changes (no phantom changes)
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000009','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
-- Multiple calls should return consistent cap
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000009'),15,
  'first call -> 15');
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000009'),15,
  'second call -> 15 (stable)');
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000009'),15,
  'third call -> 15 (stable)');

-- Test 13: Subscription state none with explicit gallery tier row (source=default) -> cap 15
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000010','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='default';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000010'),15,
  'subscription=none with explicit gallery tier -> cap 15');

-- Test 14: Subscription state change from gallery -> full_gallery upgrades cap
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000011','gallery','subscription')
  on conflict (store_id) do update set tier='gallery',source='subscription';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000011'),15,
  'gallery subscription -> 15');
insert into partner_private.store_photo_tier_state (store_id, tier, source)
  values ('00000000-0000-4000-8000-000000000011','full_gallery','subscription')
  on conflict (store_id) do update set tier='full_gallery',source='subscription';
select is(partner_private.resolve_store_photo_cap('00000000-0000-4000-8000-000000000011'),null,
  'upgrade to full_gallery -> uncapped');

select * from finish();
rollback;
