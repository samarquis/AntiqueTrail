-- #426: local synthetic cancellation only. No provider network or scheduler activation.
grant identity_service to postgres;
grant create on schema portal_private to identity_service;
set role identity_service;
create function portal_private.owner_cancel_local_test() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from app_private.audit_anchor_capability where id=1 and deployment_environment='local')
    and exists(select 1 from app_private.environment_stage where id=1 and stage='synthetic_alpha')
$$;
revoke all on function portal_private.owner_cancel_local_test() from public,anon,authenticated,service_role;
grant execute on function portal_private.owner_cancel_local_test() to billing_automation;
reset role;
revoke create on schema portal_private from identity_service;
revoke identity_service from postgres;
grant billing_automation to postgres;
grant create on schema partner_private,app_public to billing_automation;
set role billing_automation;

create table partner_private.owner_cancellation_test_control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into partner_private.owner_cancellation_test_control values(true,false);
create table partner_private.owner_cancellation_fake_provider (
  store_id uuid primary key references app_public.stores(id),
  subscription_id text not null unique check(subscription_id like 'sub_fake426%'),
  version bigint not null default 1 check(version>0),
  schedule_version bigint not null default 1 check(schedule_version>0),
  cancel_at_period_end boolean not null default false,
  ended boolean not null default false,
  applied_intent_id uuid unique,
  effects integer not null default 0 check(effects between 0 and 1)
);
create table partner_private.owner_cancellation_consents (
  consent_id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null, store_id uuid not null references app_public.stores(id),
  snapshot jsonb not null, snapshot_digest text not null,
  idempotency_key uuid not null, created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '15 minutes',
  unique(actor_id,idempotency_key)
);
create table partner_private.owner_cancellation_intents (
  intent_id uuid primary key default extensions.gen_random_uuid(),
  consent_id uuid not null unique references partner_private.owner_cancellation_consents(consent_id),
  actor_id uuid not null, store_id uuid not null references app_public.stores(id),
  idempotency_key uuid not null unique,
  state text not null default 'pending' check(state in ('pending','reconciliation_pending','scheduled','completed','failed')),
  created_at timestamptz not null default statement_timestamp()
);
create unique index owner_one_cancellation_obligation on partner_private.owner_cancellation_intents(store_id)
 where state in ('pending','reconciliation_pending','scheduled');
do $$ declare t text; begin
  foreach t in array array['owner_cancellation_test_control','owner_cancellation_fake_provider','owner_cancellation_consents','owner_cancellation_intents'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',t);
    execute format('create policy billing_owner on partner_private.%I to billing_automation using(true) with check(true)',t);
  end loop;
end $$;

create function partner_private.owner_cancel_snapshot() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare selected uuid; sub partner_private.store_subscriptions%rowtype;
 tier partner_private.store_photo_tier_state%rowtype; provider partner_private.owner_cancellation_fake_provider%rowtype;
 control partner_private.photo_tier_sales_control%rowtype; store_name text;
begin
  begin selected:=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid;
  exception when invalid_text_representation then raise exception using errcode='42501',message='billing_action_denied'; end;
  -- Lock the grant before reading current authority; revocation cannot race a committed intent.
  perform 1 from partner_private.store_partner_grants where store_id=selected
    and auth_user_id=app_public.request_user_id() and role='store_owner' and state='active' for share;
  if not found or not exists(select 1 from portal_private.owner_access_roles() where store_id=selected and store_role='store_owner') then
    perform portal_private.log_owner_access_denial('owner_cancellation',selected);
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  if not exists(select 1 from partner_private.owner_cancellation_test_control where singleton and enabled)
    or not portal_private.owner_cancel_local_test() then
    raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state not in ('sales_open','servicing_only') then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into sub from partner_private.store_subscriptions where store_id=selected for update;
  select * into tier from partner_private.store_photo_tier_state where store_id=selected for update;
  select * into provider from partner_private.owner_cancellation_fake_provider where store_id=selected for update;
  if (sub.state not in ('active','past_due','grace') or tier.tier is null or tier.tier not in ('gallery','full_gallery') or provider.ended)
    and not exists(select 1 from partner_private.owner_cancellation_intents where store_id=selected and state='completed' and provider.ended and sub.state='canceled') then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  if sub.stripe_subscription_id is null or sub.current_period_end is null
    or provider.subscription_id is distinct from sub.stripe_subscription_id then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  if sub.current_period_end<=statement_timestamp() and not provider.ended then
    raise exception using errcode='42501',message='billing_action_denied'; end if;
  if exists(select 1 from partner_private.photo_tier_subscription_changes where subscription_id=sub.stripe_subscription_id and state in ('pending','compensation_pending')) then
    raise exception using errcode='55000',message='billing_change_pending'; end if;
  select s.store_name into store_name from portal_private.owner_access_roles() s where s.store_id=selected and s.store_role='store_owner';
  return jsonb_build_object('actorId',app_public.request_user_id(),'storeId',selected,'storeName',store_name,
    'subscriptionId',sub.stripe_subscription_id,'subscriptionVersion',sub.version,'tierVersion',tier.version,
    'paidThrough',sub.current_period_end,'tier',tier.tier,'providerVersion',provider.version,
    'scheduleVersion',provider.schedule_version,'schedule',coalesce((select jsonb_agg(jsonb_build_array(change_id,state,target_tier,effective_at) order by change_id)
      from partner_private.photo_tier_subscription_changes where subscription_id=sub.stripe_subscription_id and state='scheduled'),'[]'::jsonb),
    'action','cancel_renewal','termsVersion',1,'termsDigest',encode(extensions.digest('Period-end cancellation; retained paid access; scheduled target superseded; no refund.','sha256'),'hex'),
    'stage',control.state,'stageGeneration',control.sales_generation);
end $$;

create function app_public.billing_get_owner_cancellation() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare snapshot jsonb; outcome text;
begin
  if not exists(select 1 from partner_private.owner_cancellation_test_control where singleton and enabled) then return null; end if;
  if exists(select 1 from portal_private.owner_access_roles() where store_role in ('co_owner','full_store_access')
    and store_id=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid)
    and not exists(select 1 from portal_private.owner_access_roles() where store_role='store_owner'
      and store_id=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid) then return null; end if;
  snapshot:=partner_private.owner_cancel_snapshot();
  select state into outcome from partner_private.owner_cancellation_intents
    where store_id=(snapshot->>'storeId')::uuid order by created_at desc,intent_id desc limit 1;
  return jsonb_build_object('storeName',snapshot->>'storeName','paidThrough',snapshot->>'paidThrough',
    'snapshot',encode(extensions.digest(snapshot::text,'sha256'),'hex'),'state',coalesce(outcome,'available'));
exception when insufficient_privilege or object_not_in_prerequisite_state then
  perform portal_private.log_owner_access_denial('owner_cancellation',null);
  raise;
end $$;

create function app_public.billing_record_owner_cancel_consent(p_snapshot text,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare snapshot jsonb:=partner_private.owner_cancel_snapshot(); digest text;
 receipt partner_private.owner_cancellation_consents%rowtype;
begin
  digest:=encode(extensions.digest(snapshot::text,'sha256'),'hex');
  if p_idempotency_key is null or p_snapshot is distinct from digest then raise exception using errcode='42501',message='billing_consent_invalid'; end if;
  select * into receipt from partner_private.owner_cancellation_consents
    where actor_id=app_public.request_user_id() and idempotency_key=p_idempotency_key;
  if found then
    if receipt.snapshot_digest<>digest or receipt.expires_at<=statement_timestamp() then raise exception using errcode='42501',message='billing_consent_invalid'; end if;
  else
    if exists(select 1 from partner_private.owner_cancellation_intents where store_id=(snapshot->>'storeId')::uuid and state<>'failed') then
      raise exception using errcode='55000',message='billing_change_pending'; end if;
    insert into partner_private.owner_cancellation_consents(actor_id,store_id,snapshot,snapshot_digest,idempotency_key)
      values(app_public.request_user_id(),(snapshot->>'storeId')::uuid,snapshot,digest,p_idempotency_key) returning * into receipt;
    perform partner_private.append_audit('owner_cancel_consent',receipt.actor_id,receipt.store_id,'allowed',jsonb_build_object('consentId',receipt.consent_id,'snapshot',digest));
  end if;
  return jsonb_build_object('consentId',receipt.consent_id,'expiresAt',receipt.expires_at);
end $$;

create function app_public.billing_request_owner_cancellation(p_consent_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare snapshot jsonb:=partner_private.owner_cancel_snapshot(); receipt partner_private.owner_cancellation_consents%rowtype;
 intent partner_private.owner_cancellation_intents%rowtype;
begin
  if p_consent_id is null or p_idempotency_key is null then raise exception using errcode='22023',message='billing_consent_invalid'; end if;
  select * into intent from partner_private.owner_cancellation_intents where idempotency_key=p_idempotency_key;
  if found then
    if intent.actor_id<>app_public.request_user_id() or intent.store_id<>(snapshot->>'storeId')::uuid or intent.consent_id<>p_consent_id then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('state',intent.state);
  end if;
  select * into receipt from partner_private.owner_cancellation_consents where consent_id=p_consent_id for update;
  if not found or receipt.actor_id<>app_public.request_user_id() or receipt.store_id<>(snapshot->>'storeId')::uuid
    or receipt.snapshot is distinct from snapshot or receipt.expires_at<=statement_timestamp() then
    raise exception using errcode='42501',message='billing_consent_invalid'; end if;
  if exists(select 1 from partner_private.owner_cancellation_intents where consent_id=p_consent_id
    or (store_id=receipt.store_id and state<>'failed')) then raise exception using errcode='42501',message='billing_consent_invalid'; end if;
  insert into partner_private.owner_cancellation_intents(consent_id,actor_id,store_id,idempotency_key)
    values(receipt.consent_id,receipt.actor_id,receipt.store_id,p_idempotency_key) returning * into intent;
  perform partner_private.append_audit('owner_cancel_requested',receipt.actor_id,receipt.store_id,'allowed',jsonb_build_object('intentId',intent.intent_id,'consentId',receipt.consent_id));
  return jsonb_build_object('state',intent.state);
end $$;

-- Worker-only, with no network path. Fake effect and reconciliation commit independently.
create function app_public.billing_execute_owner_fake_cancellation(p_intent_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare intent partner_private.owner_cancellation_intents%rowtype; receipt partner_private.owner_cancellation_consents%rowtype;
 provider partner_private.owner_cancellation_fake_provider%rowtype;
begin
  if not exists(select 1 from partner_private.owner_cancellation_test_control where singleton and enabled)
    or not portal_private.owner_cancel_local_test() then
    raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into intent from partner_private.owner_cancellation_intents where intent_id=p_intent_id for update;
  if not found then raise exception using errcode='42501',message='billing_action_denied'; end if;
  select * into receipt from partner_private.owner_cancellation_consents where consent_id=intent.consent_id;
  perform 1 from partner_private.store_subscriptions where store_id=intent.store_id for share;
  perform 1 from partner_private.store_photo_tier_state where store_id=intent.store_id for share;
  select * into provider from partner_private.owner_cancellation_fake_provider where store_id=intent.store_id for update;
  if provider.applied_intent_id=p_intent_id then return jsonb_build_object('state','verified'); end if;
  update partner_private.owner_cancellation_intents set state='reconciliation_pending' where intent_id=p_intent_id;
  if provider.subscription_id is distinct from receipt.snapshot->>'subscriptionId'
    or provider.version is distinct from (receipt.snapshot->>'providerVersion')::bigint
    or provider.schedule_version is distinct from (receipt.snapshot->>'scheduleVersion')::bigint or provider.ended
    or not exists(select 1 from partner_private.store_subscriptions where store_id=intent.store_id
      and stripe_subscription_id=provider.subscription_id and version=(receipt.snapshot->>'subscriptionVersion')::bigint)
    or not exists(select 1 from partner_private.store_photo_tier_state where store_id=intent.store_id
      and version=(receipt.snapshot->>'tierVersion')::bigint)
    or not exists(select 1 from partner_private.store_partner_grants where store_id=intent.store_id
      and auth_user_id=intent.actor_id and role='store_owner' and state='active')
    or coalesce((select jsonb_agg(jsonb_build_array(change_id,state,target_tier,effective_at) order by change_id)
      from partner_private.photo_tier_subscription_changes where subscription_id=provider.subscription_id and state='scheduled'),'[]'::jsonb)
      is distinct from receipt.snapshot->'schedule'
    or not exists(select 1 from partner_private.photo_tier_sales_control where singleton and state in ('sales_open','servicing_only')) then
    return jsonb_build_object('state','reconciliation_pending'); end if;
  update partner_private.owner_cancellation_fake_provider set cancel_at_period_end=true,applied_intent_id=p_intent_id,
    version=version+1,schedule_version=schedule_version+1,effects=effects+1 where store_id=intent.store_id;
  perform partner_private.append_audit('owner_cancel_fake_effect',intent.actor_id,intent.store_id,'allowed',jsonb_build_object('intentId',intent.intent_id));
  return jsonb_build_object('state','verified');
end $$;

create function app_public.billing_reconcile_owner_cancellation(p_intent_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare intent partner_private.owner_cancellation_intents%rowtype; provider partner_private.owner_cancellation_fake_provider%rowtype;
 receipt partner_private.owner_cancellation_consents%rowtype; next_state text;
begin
  if not exists(select 1 from partner_private.owner_cancellation_test_control where singleton and enabled)
    or not portal_private.owner_cancel_local_test() then
    raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into intent from partner_private.owner_cancellation_intents where intent_id=p_intent_id for update;
  if not found then raise exception using errcode='42501',message='billing_action_denied'; end if;
  select * into receipt from partner_private.owner_cancellation_consents where consent_id=intent.consent_id;
  select * into provider from partner_private.owner_cancellation_fake_provider where store_id=intent.store_id for update;
  next_state:='reconciliation_pending';
  if provider.subscription_id=receipt.snapshot->>'subscriptionId' and provider.applied_intent_id=p_intent_id and provider.cancel_at_period_end then
    next_state:=case when provider.ended then 'completed' else 'scheduled' end;
    if intent.state='completed' then next_state:='completed'; end if;
    update partner_private.photo_tier_subscription_changes set state='superseded',completed_at=statement_timestamp()
      where subscription_id=provider.subscription_id and state='scheduled';
    if provider.ended then
      update partner_private.store_subscriptions set state='canceled',version=version+1,updated_at=statement_timestamp()
        where store_id=intent.store_id and stripe_subscription_id=provider.subscription_id and state<>'canceled';
      update partner_private.store_photo_tier_state set tier='free',version=version+1
        where store_id=intent.store_id and tier<>'free';
    end if;
  end if;
  if next_state<>intent.state then
    update partner_private.owner_cancellation_intents set state=next_state where intent_id=p_intent_id;
    perform partner_private.append_audit('owner_cancel_reconciled',intent.actor_id,intent.store_id,'allowed',jsonb_build_object('intentId',intent.intent_id,'state',next_state));
  end if;
  return jsonb_build_object('state',next_state);
end $$;

revoke all on function partner_private.owner_cancel_snapshot() from public,anon,authenticated,service_role;
revoke all on function app_public.billing_get_owner_cancellation(),app_public.billing_record_owner_cancel_consent(text,uuid),app_public.billing_request_owner_cancellation(uuid,uuid),
 app_public.billing_execute_owner_fake_cancellation(uuid),app_public.billing_reconcile_owner_cancellation(uuid) from public,anon,authenticated,service_role;
grant execute on function app_public.billing_get_owner_cancellation(),app_public.billing_record_owner_cancel_consent(text,uuid),app_public.billing_request_owner_cancellation(uuid,uuid) to authenticated;
reset role;
revoke create on schema partner_private,app_public from billing_automation;
revoke billing_automation from postgres;
