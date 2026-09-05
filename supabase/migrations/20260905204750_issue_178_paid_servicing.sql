-- #178: staged servicing. No activation, scheduler installation, or provider call.
grant billing_automation to postgres;
grant create on schema partner_private, app_public to billing_automation;
grant update(grant_id) on partner_private.store_partner_grants to billing_automation;
create policy billing_lock_active_grant on partner_private.store_partner_grants for update to billing_automation using(true) with check(false);
set role billing_automation;

create table partner_private.photo_tier_change_consents (
  consent_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id),
  representative_id uuid not null,
  subscription_id text not null,
  subscription_version bigint not null,
  source_tier text not null check(source_tier='gallery'),
  source_tier_version bigint not null,
  target_tier text not null default 'full_gallery' check(target_tier='full_gallery'),
  config_version bigint not null references partner_private.photo_tier_commercial_configs(version),
  config_digest bytea not null check(octet_length(config_digest)=32),
  sales_generation bigint not null,
  idempotency_key uuid not null,
  input_digest bytea not null,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '15 minutes',
  unique(representative_id,idempotency_key),
  check(expires_at=created_at+interval '15 minutes')
);
create trigger paid_change_consent_immutable before update or delete on partner_private.photo_tier_change_consents
for each row execute function partner_private.reject_append_only_mutation();

create table partner_private.photo_tier_subscription_changes (
  change_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id),
  representative_id uuid not null,
  subscription_id text not null,
  subscription_version bigint not null,
  source_tier text not null check(source_tier in ('gallery','full_gallery')),
  source_tier_version bigint not null,
  target_tier text not null check(target_tier in ('free','gallery','full_gallery')),
  consent_id uuid unique references partner_private.photo_tier_change_consents(consent_id),
  config_version bigint not null references partner_private.photo_tier_commercial_configs(version),
  config_digest bytea not null check(octet_length(config_digest)=32),
  sales_generation bigint not null,
  idempotency_key uuid not null unique,
  state text not null default 'pending' check(state in ('pending','applied','compensation_pending','compensated','superseded')),
  effective_at timestamptz not null,
  provider_request jsonb,
  dispatched_at timestamptz,
  provider_observation jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check((target_tier='full_gallery')=(consent_id is not null)),
  check((state in ('applied','compensated','superseded'))=(completed_at is not null))
);
create unique index one_pending_subscription_change on partner_private.photo_tier_subscription_changes(subscription_id)
where state in ('pending','compensation_pending');

create table partner_private.photo_tier_charge_refunds (
  refund_request_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id),
  subscription_id text not null,
  charge_id text not null unique check(charge_id~'^ch_[A-Za-z0-9]{8,120}$'),
  charged_at timestamptz not null,
  amount bigint not null check(amount>0),
  currency text not null check(currency~'^[a-z]{3}$'),
  requested_at timestamptz,
  representative_id uuid,
  idempotency_key uuid unique,
  provider_refund_id text,
  state text not null default 'available' check(state in ('available','pending','succeeded','failed')),
  check(requested_at is null or requested_at between charged_at and charged_at+interval '48 hours')
);

do $$ declare t text; begin
  foreach t in array array['photo_tier_change_consents','photo_tier_subscription_changes','photo_tier_charge_refunds'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',t);
    execute format('create policy billing_owner on partner_private.%I for all to billing_automation using(true) with check(true)',t);
  end loop;
end $$;

create function partner_private.assert_servicing_actor(p_store_id uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  perform 1 from partner_private.store_partner_grants where store_id=p_store_id and auth_user_id=actor and state='active' for share;
  if not found then raise exception using errcode='42501',message='billing_action_denied'; end if;
  return actor;
end $$;

create function app_public.billing_record_paid_change_consent(
  p_store_id uuid,p_subscription_version bigint,p_tier_version bigint,p_config_version bigint,p_config_digest text,p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare control partner_private.photo_tier_sales_control%rowtype; config partner_private.photo_tier_commercial_configs%rowtype;
  sub partner_private.store_subscriptions%rowtype; tier partner_private.store_photo_tier_state%rowtype;
  receipt partner_private.photo_tier_change_consents%rowtype; actor uuid; input bytea;
begin
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state<>'sales_open' or not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into config from partner_private.photo_tier_commercial_configs where version=p_config_version and state='active' for share;
  actor:=partner_private.assert_servicing_actor(p_store_id);
  if config.version is null or config.version<>control.commercial_config_version or p_config_digest is null
    or encode(config.digest,'hex')<>p_config_digest or p_idempotency_key is null or p_subscription_version is null or p_tier_version is null then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  input:=extensions.digest(convert_to(jsonb_build_array(p_store_id,p_subscription_version,p_tier_version,p_config_version,p_config_digest)::text,'utf8'),'sha256');
  select * into receipt from partner_private.photo_tier_change_consents where representative_id=actor and idempotency_key=p_idempotency_key for share;
  if found then
    if receipt.input_digest<>input then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('consentId',receipt.consent_id,'expiresAt',receipt.expires_at);
  end if;
  select * into sub from partner_private.store_subscriptions where store_id=p_store_id for update;
  select * into tier from partner_private.store_photo_tier_state where store_id=p_store_id for update;
  if sub.state is distinct from 'active' or sub.version<>p_subscription_version or tier.tier is distinct from 'gallery'
    or tier.version<>p_tier_version or exists(select 1 from partner_private.photo_tier_subscription_changes where subscription_id=sub.stripe_subscription_id and state in ('pending','compensation_pending')) then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  insert into partner_private.photo_tier_change_consents(store_id,representative_id,subscription_id,subscription_version,source_tier,source_tier_version,
    config_version,config_digest,sales_generation,idempotency_key,input_digest)
  values(p_store_id,actor,sub.stripe_subscription_id,sub.version,tier.tier,tier.version,config.version,config.digest,control.sales_generation,p_idempotency_key,input)
  returning * into receipt;
  return jsonb_build_object('consentId',receipt.consent_id,'expiresAt',receipt.expires_at);
end $$;

create function app_public.billing_request_subscription_change(p_store_id uuid,p_target_tier text,p_consent_id uuid,p_subscription_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare control partner_private.photo_tier_sales_control%rowtype; config partner_private.photo_tier_commercial_configs%rowtype;
  consent partner_private.photo_tier_change_consents%rowtype; sub partner_private.store_subscriptions%rowtype;
  tier partner_private.store_photo_tier_state%rowtype; prior partner_private.photo_tier_subscription_changes%rowtype; actor uuid;
begin
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state='off_prelaunch' or (p_target_tier='full_gallery' and (control.state<>'sales_open' or not partner_private.photo_tier_billing_enabled())) then
    raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into config from partner_private.photo_tier_commercial_configs where version=control.commercial_config_version for share;
  actor:=partner_private.assert_servicing_actor(p_store_id);
  select * into consent from partner_private.photo_tier_change_consents where consent_id=p_consent_id for share;
  select * into sub from partner_private.store_subscriptions where store_id=p_store_id for update;
  select * into tier from partner_private.store_photo_tier_state where store_id=p_store_id for update;
  select * into prior from partner_private.photo_tier_subscription_changes where idempotency_key=p_idempotency_key for update;
  if found then
    if prior.store_id<>p_store_id or prior.representative_id<>actor or prior.target_tier is distinct from p_target_tier
      or prior.consent_id is distinct from p_consent_id or prior.subscription_version is distinct from p_subscription_version then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('changeId',prior.change_id,'state',prior.state,'effectiveAt',prior.effective_at);
  end if;
  if p_target_tier is null or p_target_tier not in ('free','gallery','full_gallery') or p_idempotency_key is null
    or sub.state is distinct from 'active' or sub.version is distinct from p_subscription_version or tier.tier not in ('gallery','full_gallery')
    or tier.tier=p_target_tier then raise exception using errcode='42501',message='billing_action_denied'; end if;
  if p_target_tier='full_gallery' then
    if consent.consent_id is null or consent.store_id<>p_store_id or consent.representative_id<>actor
      or consent.subscription_id<>sub.stripe_subscription_id or consent.subscription_version<>sub.version
      or consent.source_tier<>tier.tier or consent.source_tier_version<>tier.version or consent.config_version<>config.version
      or consent.config_digest<>config.digest or consent.sales_generation<>control.sales_generation
      or consent.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='billing_action_denied'; end if;
  elsif p_consent_id is not null then raise exception using errcode='42501',message='billing_action_denied'; end if;
  -- Only an undispatched scheduled downgrade can be replaced. In-flight work reconciles first.
  update partner_private.photo_tier_subscription_changes set state='superseded',completed_at=statement_timestamp()
    where subscription_id=sub.stripe_subscription_id and state='pending' and target_tier<>'full_gallery' and dispatched_at is null;
  if exists(select 1 from partner_private.photo_tier_subscription_changes where subscription_id=sub.stripe_subscription_id and state in ('pending','compensation_pending')) then
    raise exception using errcode='55000',message='billing_change_pending'; end if;
  insert into partner_private.photo_tier_subscription_changes(store_id,representative_id,subscription_id,subscription_version,source_tier,source_tier_version,
    target_tier,consent_id,config_version,config_digest,sales_generation,idempotency_key,effective_at)
  values(p_store_id,actor,sub.stripe_subscription_id,sub.version,tier.tier,tier.version,p_target_tier,p_consent_id,config.version,config.digest,
    control.sales_generation,p_idempotency_key,case when p_target_tier='full_gallery' then statement_timestamp() else sub.current_period_end end)
  returning * into prior;
  return jsonb_build_object('changeId',prior.change_id,'state',prior.state,'effectiveAt',prior.effective_at);
end $$;

create function app_public.billing_request_charge_refund(p_store_id uuid,p_charge_id text,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid; r partner_private.photo_tier_charge_refunds%rowtype;
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  actor:=partner_private.assert_servicing_actor(p_store_id);
  select * into r from partner_private.photo_tier_charge_refunds where store_id=p_store_id and charge_id=p_charge_id for update;
  if not found or p_idempotency_key is null then raise exception using errcode='42501',message='billing_action_denied'; end if;
  if r.requested_at is not null then
    if r.idempotency_key<>p_idempotency_key or r.representative_id<>actor then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
  else
    if statement_timestamp()<r.charged_at or statement_timestamp()>r.charged_at+interval '48 hours' then
      raise exception using errcode='55000',message='billing_refund_window_closed'; end if;
    update partner_private.photo_tier_charge_refunds set requested_at=statement_timestamp(),representative_id=actor,
      idempotency_key=p_idempotency_key,state='pending' where charge_id=p_charge_id returning * into r;
  end if;
  return jsonb_build_object('refundRequestId',r.refund_request_id,'state',r.state,'requestedAt',r.requested_at);
end $$;

-- The same durable rows are the #179 pause/closure obligation inventory.
create function app_public.billing_due_servicing() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  return jsonb_build_object('changes',(select coalesce(jsonb_agg(change_id),'[]'::jsonb) from (
    select change_id from partner_private.photo_tier_subscription_changes where state in ('pending','compensation_pending')
      and effective_at<=statement_timestamp() order by created_at limit 50) c),
    'refunds',(select coalesce(jsonb_agg(refund_request_id),'[]'::jsonb) from (
      select refund_request_id from partner_private.photo_tier_charge_refunds where state='pending' order by requested_at limit 50) r));
end $$;

create function app_public.billing_prepare_subscription_change(p_change_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare control partner_private.photo_tier_sales_control%rowtype; config partner_private.photo_tier_commercial_configs%rowtype;
  change partner_private.photo_tier_subscription_changes%rowtype; sub partner_private.store_subscriptions%rowtype;
  tier partner_private.store_photo_tier_state%rowtype; consent partner_private.photo_tier_change_consents%rowtype; valid boolean;
begin
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state='off_prelaunch' then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into change from partner_private.photo_tier_subscription_changes where change_id=p_change_id;
  if not found then raise exception using errcode='42501',message='billing_action_denied'; end if;
  select * into config from partner_private.photo_tier_commercial_configs where version=change.config_version for share;
  perform 1 from partner_private.store_partner_grants where store_id=change.store_id and auth_user_id=change.representative_id and state='active' for share;
  valid:=found;
  select * into consent from partner_private.photo_tier_change_consents where consent_id=change.consent_id for share;
  select * into sub from partner_private.store_subscriptions where store_id=change.store_id for update;
  select * into tier from partner_private.store_photo_tier_state where store_id=change.store_id for update;
  select * into change from partner_private.photo_tier_subscription_changes where change_id=p_change_id for update;
  if change.state not in ('pending','compensation_pending') then return jsonb_build_object('state',change.state); end if;
  if change.effective_at>statement_timestamp() then return jsonb_build_object('state','scheduled'); end if;
  valid:=valid and sub.stripe_subscription_id=change.subscription_id and sub.state='active'
    and tier.tier=change.source_tier;
  if change.target_tier='full_gallery' then
    valid:=valid and control.state='sales_open' and control.sales_generation=change.sales_generation
      and control.commercial_config_version=config.version and config.state='active' and config.digest=change.config_digest
      and sub.version=change.subscription_version and tier.version=change.source_tier_version
      and (change.dispatched_at is not null or consent.expires_at>statement_timestamp());
  end if;
  if not coalesce(valid,false) and change.state='pending' then
    update partner_private.photo_tier_subscription_changes set state=case when dispatched_at is null then 'superseded' else 'compensation_pending' end,
      completed_at=case when dispatched_at is null then statement_timestamp() else null end where change_id=p_change_id returning * into change;
    if change.state='superseded' then return jsonb_build_object('state',change.state); end if;
  end if;
  update partner_private.photo_tier_subscription_changes set dispatched_at=coalesce(dispatched_at,statement_timestamp())
    where change_id=p_change_id returning * into change;
  return jsonb_build_object('changeId',change.change_id,'state',change.state,'storeId',change.store_id,
    'subscriptionId',change.subscription_id,'customerId',sub.stripe_customer_id,'sourceTier',change.source_tier,'targetTier',change.target_tier,
    'priceCents',case change.target_tier when 'gallery' then config.gallery_price_cents else config.full_gallery_price_cents end,
    'currency',lower(config.currency),'generation',change.sales_generation,'request',change.provider_request,
    'currentTier',tier.tier,'currentState',sub.state,'currentSubscriptionVersion',sub.version);
end $$;

create function app_public.billing_bind_change_request(p_change_id uuid,p_request jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb; c partner_private.photo_tier_subscription_changes%rowtype;
begin
  context:=app_public.billing_prepare_subscription_change(p_change_id);
  select * into c from partner_private.photo_tier_subscription_changes where change_id=p_change_id for update;
  if c.provider_request is not null then
    if c.provider_request<>p_request then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return context;
  end if;
  if c.state<>'pending' or jsonb_typeof(p_request) is distinct from 'object'
    or p_request->>'subscriptionId' is distinct from c.subscription_id
    or p_request->>'customerId' is distinct from context->>'customerId'
    or p_request->>'itemId' is null or p_request->>'itemId' !~ '^si_[A-Za-z0-9]{8,120}$'
    or p_request->>'sourcePriceId' is null or p_request->>'sourcePriceId' !~ '^price_[A-Za-z0-9]{8,120}$'
    or p_request->>'targetTier' is distinct from c.target_tier
    or p_request->>'priceCents' is distinct from context->>'priceCents'
    or p_request->>'currency' is distinct from context->>'currency'
    or p_request - array['subscriptionId','customerId','itemId','sourcePriceId','targetTier','priceCents','currency'] <> '{}'::jsonb then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  update partner_private.photo_tier_subscription_changes set provider_request=p_request where change_id=p_change_id;
  return context||jsonb_build_object('request',p_request);
end $$;

create function app_public.billing_record_change_event(p_change_id uuid,p_event_id text,p_event_time timestamptz,
  p_subscription_id text,p_customer_id text,p_tier text,p_period_end timestamptz) returns text
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb; c partner_private.photo_tier_subscription_changes%rowtype; result text;
begin
  context:=app_public.billing_prepare_subscription_change(p_change_id);
  select * into c from partner_private.photo_tier_subscription_changes where change_id=p_change_id for update;
  if c.subscription_id is distinct from p_subscription_id or context->>'customerId' is distinct from p_customer_id
    or c.target_tier is distinct from p_tier or c.provider_request is null or p_event_time is null
    or p_event_time<c.created_at-interval '1 second' or p_event_time>statement_timestamp()+interval '5 minutes'
    or p_period_end is null then raise exception using errcode='42501',message='billing_action_denied'; end if;
  if c.state='compensation_pending' then return 'compensation_pending'; end if;
  if c.state<>'pending' then return c.state; end if;
  result:=partner_private.billing_apply_subscription_event(p_event_id,'customer.subscription.updated',p_event_time,c.store_id,
    p_customer_id,p_subscription_id,case when p_tier='free' then 'canceled' else 'active' end,p_period_end,
    case when p_tier='free' then null else p_tier end);
  if result='applied' then
    update partner_private.photo_tier_subscription_changes set state='applied',completed_at=statement_timestamp() where change_id=p_change_id;
  end if;
  return result;
end $$;

create function app_public.billing_record_change_compensation(p_change_id uuid,p_subscription_id text,p_observation jsonb) returns text
language plpgsql volatile security definer set search_path='' as $$
declare context jsonb; c partner_private.photo_tier_subscription_changes%rowtype;
begin
  context:=app_public.billing_prepare_subscription_change(p_change_id);
  select * into c from partner_private.photo_tier_subscription_changes where change_id=p_change_id for update;
  if c.state='compensated' then return 'compensated'; end if;
  if c.state<>'compensation_pending' or c.subscription_id is distinct from p_subscription_id
    or jsonb_typeof(p_observation) is distinct from 'object' or p_observation->>'subscriptionId' is distinct from c.subscription_id
    or p_observation->>'entitlementReconciled' is distinct from 'true' or p_observation->>'incrementalChargeReconciled' is distinct from 'true'
    or p_observation->>'currentSubscriptionVersion' is distinct from context->>'currentSubscriptionVersion'
    or p_observation->>'observedAt' is null or (p_observation->>'observedAt')::timestamptz<statement_timestamp()-interval '1 minute'
    or (p_observation->>'observedAt')::timestamptz>statement_timestamp() then
    raise exception using errcode='55000',message='billing_compensation_unresolved'; end if;
  -- This receipt resolves the provider obligation only. Never roll the mirror back over a later event.
  update partner_private.photo_tier_subscription_changes set state='compensated',completed_at=statement_timestamp(),provider_observation=p_observation
    where change_id=p_change_id;
  return 'compensated';
end $$;

create function app_public.billing_record_charge(p_store_id uuid,p_subscription_id text,p_customer_id text,p_charge_id text,
  p_charged_at timestamptz,p_amount bigint,p_currency text) returns text
language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  perform 1 from partner_private.store_subscriptions where store_id=p_store_id and stripe_subscription_id=p_subscription_id and stripe_customer_id=p_customer_id for update;
  if not found then return 'unbound'; end if;
  if p_charged_at is null or p_charged_at>statement_timestamp()+interval '5 minutes' then raise exception using errcode='22023',message='billing_charge_invalid'; end if;
  insert into partner_private.photo_tier_charge_refunds(store_id,subscription_id,charge_id,charged_at,amount,currency)
    values(p_store_id,p_subscription_id,p_charge_id,p_charged_at,p_amount,p_currency) on conflict(charge_id) do nothing;
  if not exists(select 1 from partner_private.photo_tier_charge_refunds where charge_id=p_charge_id and store_id=p_store_id
    and subscription_id=p_subscription_id and charged_at=p_charged_at and amount=p_amount and currency=p_currency) then
    raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
  return 'recorded';
end $$;

create function app_public.billing_prepare_charge_refund(p_refund_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r partner_private.photo_tier_charge_refunds%rowtype;
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into r from partner_private.photo_tier_charge_refunds where refund_request_id=p_refund_request_id for update;
  if not found or r.requested_at is null then raise exception using errcode='42501',message='billing_action_denied'; end if;
  return jsonb_build_object('refundRequestId',r.refund_request_id,'chargeId',r.charge_id,'amount',r.amount,'currency',r.currency,
    'state',r.state,'providerRefundId',r.provider_refund_id);
end $$;

create function app_public.billing_record_charge_refund(p_refund_request_id uuid,p_charge_id text,p_refund_id text,p_state text,p_amount bigint) returns text
language plpgsql volatile security definer set search_path='' as $$
declare r partner_private.photo_tier_charge_refunds%rowtype;
begin
  perform app_public.billing_prepare_charge_refund(p_refund_request_id);
  select * into r from partner_private.photo_tier_charge_refunds where refund_request_id=p_refund_request_id for update;
  if r.charge_id is distinct from p_charge_id or r.amount is distinct from p_amount or p_state is null or p_state not in ('pending','succeeded','failed')
    or p_refund_id is null or p_refund_id !~ '^re_[A-Za-z0-9]{8,120}$'
    or (r.provider_refund_id is not null and r.provider_refund_id<>p_refund_id) then raise exception using errcode='42501',message='billing_action_denied'; end if;
  if r.state='succeeded' then return 'succeeded'; end if;
  update partner_private.photo_tier_charge_refunds set state=p_state,provider_refund_id=p_refund_id where refund_request_id=p_refund_request_id;
  return p_state;
end $$;

reset role;
revoke all on function partner_private.assert_servicing_actor(uuid),
  app_public.billing_record_paid_change_consent(uuid,bigint,bigint,bigint,text,uuid),
  app_public.billing_request_subscription_change(uuid,text,uuid,bigint,uuid),
  app_public.billing_request_charge_refund(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_public.billing_record_paid_change_consent(uuid,bigint,bigint,bigint,text,uuid),
  app_public.billing_request_subscription_change(uuid,text,uuid,bigint,uuid),
  app_public.billing_request_charge_refund(uuid,text,uuid) to authenticated;
revoke create on schema partner_private,app_public from billing_automation;
revoke all on function app_public.billing_due_servicing(),app_public.billing_prepare_subscription_change(uuid),
  app_public.billing_bind_change_request(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_public.billing_due_servicing(),app_public.billing_prepare_subscription_change(uuid),
  app_public.billing_bind_change_request(uuid,jsonb) to billing_mirror_service;
revoke all on function app_public.billing_record_change_event(uuid,text,timestamptz,text,text,text,timestamptz),
  app_public.billing_record_change_compensation(uuid,text,jsonb),app_public.billing_record_charge(uuid,text,text,text,timestamptz,bigint,text),
  app_public.billing_prepare_charge_refund(uuid),app_public.billing_record_charge_refund(uuid,text,text,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function app_public.billing_record_change_event(uuid,text,timestamptz,text,text,text,timestamptz),
  app_public.billing_record_change_compensation(uuid,text,jsonb),app_public.billing_record_charge(uuid,text,text,text,timestamptz,bigint,text),
  app_public.billing_prepare_charge_refund(uuid),app_public.billing_record_charge_refund(uuid,text,text,text,bigint) to billing_mirror_service;
revoke billing_automation from postgres;

-- Remove hidden photos from the publication projection, leaving catalog_details unchanged.
grant media_automation to postgres;
grant create on schema media_private to media_automation;
grant references on app_public.stores,media_private.media_uploads to media_automation;
alter table media_private.media_uploads drop constraint media_uploads_state_check;
alter table media_private.media_uploads add constraint media_uploads_state_check check(state in
  ('reserved','staged','quarantined','awaiting_review','approved_pending_publish','published','tier_hidden','rejected','withdrawn','purge_pending','purged'));
alter table media_private.media_purge_jobs drop constraint media_purge_jobs_reason_code_check;
alter table media_private.media_purge_jobs add constraint media_purge_jobs_reason_code_check check(reason_code in
  ('abandoned','quarantine_retention','rejected','withdrawn','replacement','private_after_publish','store_withdrawal','relationship_end','tier_grace_expired'));
set role media_automation;
create table media_private.tier_hidden_photos (
  media_id uuid primary key,
  store_id uuid not null references app_public.stores(id),
  upload_id uuid references media_private.media_uploads(upload_id),
  projection jsonb not null,
  hidden_at timestamptz not null,
  delete_after timestamptz not null,
  state text not null default 'hidden' check(state in ('hidden','restored','purge_pending','purged')),
  check(delete_after=hidden_at+interval '30 days')
);
alter table media_private.tier_hidden_photos enable row level security;
alter table media_private.tier_hidden_photos force row level security;
create policy media_hidden_owner on media_private.tier_hidden_photos for all to media_automation using(true) with check(true);
revoke all on media_private.tier_hidden_photos from public,anon,authenticated,service_role;

create function media_private.reconcile_tier_photos(p_store_id uuid,p_now timestamptz) returns void
language plpgsql volatile security definer set search_path='' as $$
declare cap integer; r record; current_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text,0));
  cap:=partner_private.resolve_store_photo_cap(p_store_id);
  for r in select m.*,u.upload_id from app_public.store_media m
    left join media_private.media_uploads u on u.catalog_media_id=m.id
    where m.store_id=p_store_id and m.kind='gallery' order by m.display_order,m.id offset coalesce(cap,2147483647)
  loop
    insert into media_private.tier_hidden_photos(media_id,store_id,upload_id,projection,hidden_at,delete_after)
    values(r.id,p_store_id,r.upload_id,to_jsonb(r)-'upload_id',p_now,p_now+interval '30 days')
    on conflict(media_id) do update set state='hidden',hidden_at=excluded.hidden_at,delete_after=excluded.delete_after,projection=excluded.projection;
    update media_private.media_uploads set state='tier_hidden',updated_at=p_now,version=version+1 where upload_id=r.upload_id and state='published';
    delete from app_public.store_media where id=r.id;
  end loop;
  select count(*) into current_count from app_public.store_media where store_id=p_store_id and kind='gallery';
  for r in select * from media_private.tier_hidden_photos where store_id=p_store_id and state='hidden' order by hidden_at,media_id for update
  loop
    if r.delete_after<=p_now then
      update media_private.tier_hidden_photos set state=case when r.upload_id is null then 'purged' else 'purge_pending' end where media_id=r.media_id;
      if r.upload_id is not null then
        update media_private.media_uploads set state='purge_pending',purge_due_at=p_now,updated_at=p_now,version=version+1
          where upload_id=r.upload_id and state='tier_hidden';
        if found then
          insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
          values(r.upload_id,'tier_grace_expired',true,true,p_now) on conflict do nothing;
        end if;
      end if;
    elsif (cap is null or current_count<cap)
      and not exists(select 1 from app_public.store_media where store_id=p_store_id and display_order=(r.projection->>'display_order')::integer)
      and (r.upload_id is null or exists(select 1 from media_private.media_uploads where upload_id=r.upload_id and state='tier_hidden'
        and scan_state='clean' and approved_at is not null and public_deleted_at is null)) then
      insert into app_public.store_media select (jsonb_populate_record(null::app_public.store_media,r.projection)).*;
      update media_private.media_uploads set state='published',catalog_media_id=r.media_id,updated_at=p_now,version=version+1 where upload_id=r.upload_id;
      update media_private.tier_hidden_photos set state='restored' where media_id=r.media_id;
      current_count:=current_count+1;
    end if;
  end loop;
end $$;
reset role;
revoke all on function media_private.reconcile_tier_photos(uuid,timestamptz) from public,anon,authenticated,service_role;
grant usage on schema media_private to billing_automation;
grant execute on function media_private.reconcile_tier_photos(uuid,timestamptz) to billing_automation;
revoke create on schema media_private from media_automation;
revoke media_automation from postgres;

grant billing_automation to postgres;
grant create on schema partner_private,app_public to billing_automation;
alter table partner_private.store_subscriptions add column failed_payment_started_at timestamptz;
set role billing_automation;
create or replace function partner_private.billing_apply_subscription_event(
  p_event_id text,p_event_kind text,p_event_time timestamptz,
  p_store_id uuid,p_customer_id text,p_subscription_id text,
  p_status text,p_period_end timestamptz,p_tier text
) returns text language plpgsql volatile security definer set search_path='' as $$
declare v_store uuid:=p_store_id; v_row partner_private.store_subscriptions%rowtype; v_next text;
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  if p_event_id is null or p_event_kind is null or p_event_time is null
    or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]{8,64}$'
    or p_status not in ('trialing','active','past_due','unpaid','canceled')
    or (p_status in ('trialing','active','past_due','unpaid') and p_period_end is null)
    or (p_tier is not null and p_tier not in ('gallery','full_gallery','featured','unlimited'))
    or ((p_status in ('trialing','active')) and p_tier is null) then
    raise exception using errcode='22023',message='billing_webhook_invalid';
  end if;
  -- Normalize legacy tier names to canonical
  if p_tier = 'featured' then p_tier := 'gallery'; end if;
  if p_tier = 'unlimited' then p_tier := 'full_gallery'; end if;
  if v_store is null then
    select store_id into v_store from partner_private.store_subscriptions
      where stripe_customer_id=p_customer_id limit 1;
  end if;
  if v_store is null then
    perform partner_private.append_audit('subscription_event_ignored',null,null,'ignored',
      jsonb_build_object('eventId',p_event_id,'reason','unbound'));
    return 'unbound';
  end if;
  begin
    insert into partner_private.store_webhook_events(event_id,event_kind) values(p_event_id,p_event_kind);
  exception when unique_violation then
    return 'duplicate';
  end;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||v_store::text,0));
  insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end,last_event_id,last_event_at)
    values(v_store,p_customer_id,p_subscription_id,
      case when p_status in ('trialing','active') then 'active'
           when p_status in ('past_due','unpaid') then 'past_due' else 'canceled' end,
      p_period_end,
      p_event_id,p_event_time)
    on conflict(store_id) do nothing;
  select * into v_row from partner_private.store_subscriptions where store_id=v_store for update;
  if v_row.last_event_at is not null and p_event_time<v_row.last_event_at then
    perform partner_private.append_audit('subscription_event_stale',null,v_store,'ignored',
      jsonb_build_object('eventId',p_event_id));
    return 'stale';
  end if;
  if p_status in ('trialing','active') then
    v_next:='active';
    update partner_private.store_subscriptions set state=v_next,stripe_customer_id=p_customer_id,
      stripe_subscription_id=p_subscription_id,current_period_end=p_period_end,downgrade_to=null,
      failed_payment_started_at=null,hide_photos_after=null,last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
    insert into partner_private.store_photo_tier_state(store_id,tier,source) values(v_store,p_tier,'subscription')
      on conflict(store_id) do update set tier=excluded.tier,source='subscription',
        updated_at=statement_timestamp(),version=store_photo_tier_state.version+1;
  elsif p_status in ('past_due','unpaid') then
    v_next:='past_due';
    update partner_private.store_subscriptions set state='past_due',failed_payment_started_at=coalesce(failed_payment_started_at,p_event_time),stripe_customer_id=p_customer_id,
      stripe_subscription_id=p_subscription_id,current_period_end=p_period_end,downgrade_to=null,
      last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
  else
    v_next:='canceled';
    update partner_private.store_subscriptions set state='canceled',stripe_customer_id=p_customer_id,
      current_period_end=p_event_time,downgrade_to='free',
      last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
  end if;
  insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest)
    values(v_store,'subscription_synced',extensions.digest(convert_to(p_event_id||'|'||coalesce(p_status,''),'utf8'),'sha256'));
  perform partner_private.append_audit('subscription_event_applied',null,v_store,'allowed',
    jsonb_build_object('eventId',p_event_id,'kind',p_event_kind,'state',v_next));
  perform media_private.reconcile_tier_photos(v_store,statement_timestamp());
  return 'applied';
end $$;
create or replace function partner_private.apply_due_subscription_lifecycles(p_now timestamptz,p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r partner_private.store_subscriptions%rowtype; scheduled integer:=0; expired integer:=0; closed integer:=0;
begin
  if p_now is null or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='billing_lifecycle_input_invalid'; end if;
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  for r in select * from partner_private.store_subscriptions
    where (state in ('active','canceled') and downgrade_to is not null and current_period_end<=p_now)
      or (state='past_due' and coalesce(failed_payment_started_at,current_period_end)+interval '14 days'<=p_now)
      or (state='grace' and hide_photos_after<=p_now)
    order by store_id for update skip locked limit p_limit
  loop
    if r.state='grace' then
      update partner_private.store_subscriptions set state='canceled',hide_photos_after=null,version=version+1,updated_at=p_now where store_id=r.store_id;
      closed:=closed+1;
    else
      update partner_private.store_photo_tier_state set tier=case when r.state='past_due' then 'free' else r.downgrade_to end,
        source=case when r.state='past_due' or r.downgrade_to='free' then 'default' else 'subscription' end,version=version+1,updated_at=p_now where store_id=r.store_id;
      update partner_private.store_subscriptions set state=case when r.state='past_due' or r.downgrade_to='free' then 'grace' else 'active' end,
        hide_photos_after=case when r.state='past_due' or r.downgrade_to='free' then p_now+interval '30 days' else null end,
        downgrade_to=null,version=version+1,updated_at=p_now where store_id=r.store_id;
      if r.state='past_due' then expired:=expired+1; else scheduled:=scheduled+1; end if;
    end if;
    perform media_private.reconcile_tier_photos(r.store_id,p_now);
  end loop;
  -- Paid-to-paid downgrades have the same independent photo-deletion obligation.
  for r in select * from partner_private.store_subscriptions order by store_id limit p_limit loop
    perform media_private.reconcile_tier_photos(r.store_id,p_now);
  end loop;
  return jsonb_build_object('scheduledDowngrades',scheduled,'failedPaymentGraceExpired',expired,'hiddenPhotoGracesClosed',closed);
end $$;
reset role;
revoke create on schema partner_private,app_public from billing_automation;
revoke billing_automation from postgres;
