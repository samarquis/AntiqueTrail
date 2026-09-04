-- Issue #177: versioned paid consent, idempotent Checkout, and generation-safe completion.
-- Billing remains off by default; this migration performs no provider call.

grant billing_automation to postgres;
grant create on schema partner_private, app_public to billing_automation;
grant usage on schema app_private,extensions to billing_automation;
grant references on app_public.stores,partner_private.photo_tier_commercial_configs to billing_automation;
grant select on partner_private.store_partner_grants to billing_automation;
create policy billing_paid_checkout_partner_grants on partner_private.store_partner_grants
  for select to billing_automation using (true);
set role billing_automation;

create table partner_private.photo_tier_sales_control (
  singleton boolean primary key default true check (singleton),
  state text not null default 'off_prelaunch'
    check (state in ('off_prelaunch','sales_open','servicing_only')),
  commercial_config_version bigint references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  sales_generation bigint not null default 1 check (sales_generation > 0),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default statement_timestamp(),
  constraint photo_tier_sales_config_shape check (
    (state = 'off_prelaunch' and commercial_config_version is null)
    or (state in ('sales_open','servicing_only') and commercial_config_version is not null)
  )
);
insert into partner_private.photo_tier_sales_control(singleton) values (true);

create table partner_private.photo_tier_paid_consents (
  consent_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  representative_id uuid not null,
  target_tier text not null check (target_tier in ('gallery','full_gallery')),
  commercial_config_version bigint not null references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  disclosure_digest bytea not null check (octet_length(disclosure_digest) = 32),
  expected_store_version bigint not null check (expected_store_version >= 0),
  idempotency_key uuid not null,
  input_digest bytea not null check (octet_length(input_digest) = 32),
  state text not null default 'unused'
    check (state in ('unused','checkout_pending','consumed','expired','revoked')),
  expires_at timestamptz not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (representative_id,idempotency_key),
  constraint paid_consent_expiry check (expires_at <= created_at + interval '15 minutes')
);

create table partner_private.photo_tier_checkout_sessions (
  session_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  consent_id uuid not null unique references partner_private.photo_tier_paid_consents(consent_id) on delete restrict,
  target_tier text not null check (target_tier in ('gallery','full_gallery')),
  commercial_config_version bigint not null references partner_private.photo_tier_commercial_configs(version) on delete restrict,
  sales_generation bigint not null check (sales_generation > 0),
  idempotency_key uuid not null unique,
  input_digest bytea not null check (octet_length(input_digest) = 32),
  provider_session_id_hmac bytea unique check (provider_session_id_hmac is null or octet_length(provider_session_id_hmac) = 32),
  state text not null default 'open'
    check (state in ('open','completed','expire_pending','expired','refund_pending','refunded','failed')),
  expires_at timestamptz not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint checkout_expiry check (expires_at <= created_at + interval '30 minutes')
);

reset role;
alter table partner_private.store_billing_outbox drop constraint store_billing_outbox_event_kind_check;
alter table partner_private.store_billing_outbox add constraint store_billing_outbox_event_kind_check
  check (event_kind in ('checkout_completed','checkout_cancel_full_refund','portal_opened','subscription_synced','hidden_photo_grace_started'));
set role billing_automation;

do $$ declare table_name text; begin
  foreach table_name in array array['photo_tier_sales_control','photo_tier_paid_consents','photo_tier_checkout_sessions'] loop
    execute format('alter table partner_private.%I enable row level security',table_name);
    execute format('alter table partner_private.%I force row level security',table_name);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',table_name);
    execute format('grant select,insert,update on partner_private.%I to billing_automation',table_name);
    execute format('create policy billing_automation_%I on partner_private.%I for all to billing_automation using (true) with check (true)',table_name,table_name);
  end loop;
end $$;

create or replace function partner_private.photo_tier_billing_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from release_private.regional_releases r
    join release_private.release_capabilities c using(release_id)
    where r.region_key='topeka-ks' and r.state='active' and c.photo_tiers_enabled
  )
$$;

create or replace function app_public.billing_get_capability() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',partner_private.photo_tier_billing_enabled() and exists(
    select 1 from partner_private.photo_tier_sales_control s
    join partner_private.photo_tier_commercial_configs c on c.version=s.commercial_config_version and c.state='active'
    where s.singleton and s.state='sales_open'
  ),'source','server')
$$;

create or replace function app_public.billing_record_paid_tier_consent(
  p_store_id uuid,p_target_tier text,p_commercial_config_version bigint,
  p_disclosure_digest text,p_expected_store_version bigint,p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id(); control partner_private.photo_tier_sales_control%rowtype;
  config partner_private.photo_tier_commercial_configs%rowtype; prior partner_private.photo_tier_paid_consents%rowtype;
  tier_state partner_private.store_photo_tier_state%rowtype; digest bytea; input_hash bytea; created partner_private.photo_tier_paid_consents%rowtype;
begin
  if p_store_id is null or p_target_tier not in ('gallery','full_gallery') or p_commercial_config_version is null
    or p_disclosure_digest is null or p_disclosure_digest !~ '^[0-9a-f]{64}$'
    or p_expected_store_version is null or p_expected_store_version < 0 or p_idempotency_key is null then
    raise exception using errcode='22023',message='billing_consent_invalid';
  end if;
  digest:=decode(p_disclosure_digest,'hex');
  input_hash:=extensions.digest(convert_to(concat_ws('|',p_store_id,p_target_tier,p_commercial_config_version,p_disclosure_digest,p_expected_store_version),'utf8'),'sha256');
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state<>'sales_open' or not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  select * into prior from partner_private.photo_tier_paid_consents where representative_id=actor and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.input_digest<>input_hash then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('consentId',prior.consent_id,'expiresAt',prior.expires_at,'state',prior.state,
      'configVersion',prior.commercial_config_version,'configDigest',encode((select c.digest from partner_private.photo_tier_commercial_configs c where c.version=prior.commercial_config_version),'hex'));
  end if;
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  select * into config from partner_private.photo_tier_commercial_configs
    where version=p_commercial_config_version and state='active' for share;
  if not found or control.commercial_config_version<>config.version or digest<>config.digest then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  if not exists(select 1 from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  select * into tier_state from partner_private.store_photo_tier_state where store_id=p_store_id for update;
  if found then
    if tier_state.tier<>'free' or tier_state.version<>p_expected_store_version then
      raise exception using errcode='42501',message='billing_action_denied';
    end if;
  elsif p_expected_store_version<>0 then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  insert into partner_private.photo_tier_paid_consents(
    store_id,representative_id,target_tier,commercial_config_version,disclosure_digest,
    expected_store_version,idempotency_key,input_digest,expires_at
  ) values (p_store_id,actor,p_target_tier,p_commercial_config_version,digest,
    p_expected_store_version,p_idempotency_key,input_hash,statement_timestamp()+interval '15 minutes') returning * into created;
  perform partner_private.append_audit('billing_consent_recorded',actor,p_store_id,'allowed',
    jsonb_build_object('consentId',created.consent_id,'targetTier',p_target_tier,'configVersion',p_commercial_config_version));
  return jsonb_build_object('consentId',created.consent_id,'expiresAt',created.expires_at,'state',created.state,
    'configVersion',config.version,'configDigest',encode(config.digest,'hex'));
end $$;

create or replace function app_public.billing_create_checkout_session(
  p_store_id uuid,p_target_tier text,p_consent_id uuid,p_commercial_config_version bigint,p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id(); control partner_private.photo_tier_sales_control%rowtype;
  config partner_private.photo_tier_commercial_configs%rowtype; consent partner_private.photo_tier_paid_consents%rowtype;
  prior partner_private.photo_tier_checkout_sessions%rowtype; created partner_private.photo_tier_checkout_sessions%rowtype;
  input_hash bytea; price bigint;
begin
  if p_store_id is null or p_target_tier not in ('gallery','full_gallery') or p_consent_id is null
    or p_commercial_config_version is null or p_idempotency_key is null then
    raise exception using errcode='22023',message='billing_checkout_invalid';
  end if;
  input_hash:=extensions.digest(convert_to(concat_ws('|',p_store_id,p_target_tier,p_consent_id,p_commercial_config_version),'utf8'),'sha256');
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  if control.state<>'sales_open' or not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  select * into prior from partner_private.photo_tier_checkout_sessions where idempotency_key=p_idempotency_key for update;
  if found then
    if prior.input_digest<>input_hash then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    select * into config from partner_private.photo_tier_commercial_configs where version=prior.commercial_config_version;
    return jsonb_build_object('checkoutSessionId',prior.session_id,'storeId',prior.store_id,'targetTier',prior.target_tier,
      'priceCents',case prior.target_tier when 'gallery' then config.gallery_price_cents else config.full_gallery_price_cents end,
      'currency',config.currency,'salesGeneration',prior.sales_generation,'expiresAt',prior.expires_at,'state',prior.state);
  end if;
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or not exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  select * into config from partner_private.photo_tier_commercial_configs
    where version=p_commercial_config_version and state='active' for share;
  select * into consent from partner_private.photo_tier_paid_consents where consent_id=p_consent_id for update;
  if not found or consent.store_id<>p_store_id or consent.representative_id<>actor or consent.target_tier<>p_target_tier
    or consent.commercial_config_version<>p_commercial_config_version or consent.state<>'unused'
    or consent.expires_at<=statement_timestamp() or control.commercial_config_version<>p_commercial_config_version
    or config.version is null then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  price:=case p_target_tier when 'gallery' then config.gallery_price_cents else config.full_gallery_price_cents end;
  update partner_private.photo_tier_paid_consents set state='checkout_pending',updated_at=statement_timestamp(),version=version+1 where consent_id=p_consent_id;
  insert into partner_private.photo_tier_checkout_sessions(
    store_id,consent_id,target_tier,commercial_config_version,sales_generation,idempotency_key,input_digest,expires_at
  ) values (p_store_id,p_consent_id,p_target_tier,p_commercial_config_version,control.sales_generation,p_idempotency_key,input_hash,
    statement_timestamp()+interval '30 minutes') returning * into created;
  perform partner_private.append_audit('billing_checkout_reserved',actor,p_store_id,'allowed',
    jsonb_build_object('checkoutSessionId',created.session_id,'consentId',p_consent_id,'salesGeneration',control.sales_generation));
  return jsonb_build_object('checkoutSessionId',created.session_id,'storeId',p_store_id,'targetTier',p_target_tier,
    'priceCents',price,'currency',config.currency,'salesGeneration',control.sales_generation,'expiresAt',created.expires_at,'state',created.state);
end $$;

-- The legacy stub cannot bypass the required consent.
create or replace function app_public.billing_create_checkout_session(p_store_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  raise exception using errcode='42501',message='billing_consent_required';
end $$;

create or replace function partner_private.billing_bind_checkout_provider(
  p_checkout_session_id uuid,p_provider_session_id text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if p_checkout_session_id is null or p_provider_session_id !~ '^cs_[A-Za-z0-9_]{8,120}$' then
    raise exception using errcode='22023',message='billing_provider_binding_invalid';
  end if;
  update partner_private.photo_tier_checkout_sessions set
    provider_session_id_hmac=extensions.digest(convert_to(p_provider_session_id,'utf8'),'sha256'),
    updated_at=statement_timestamp(),version=version+1
  where session_id=p_checkout_session_id and state='open'
    and (provider_session_id_hmac is null or provider_session_id_hmac=extensions.digest(convert_to(p_provider_session_id,'utf8'),'sha256'));
  if not found then raise exception using errcode='42501',message='billing_provider_binding_denied'; end if;
  return true;
end $$;

create or replace function partner_private.billing_apply_checkout_event(
  p_event_id text,p_event_time timestamptz,p_provider_session_id text,
  p_customer_id text,p_subscription_id text
) returns text language plpgsql volatile security definer set search_path='' as $$
declare control partner_private.photo_tier_sales_control%rowtype; checkout partner_private.photo_tier_checkout_sessions%rowtype;
begin
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]{8,120}$' or p_event_time is null
    or p_provider_session_id !~ '^cs_[A-Za-z0-9_]{8,120}$'
    or p_customer_id !~ '^cus_[A-Za-z0-9]{8,64}$' or p_subscription_id !~ '^sub_[A-Za-z0-9]{8,64}$' then
    raise exception using errcode='22023',message='billing_webhook_invalid';
  end if;
  begin
    insert into partner_private.store_webhook_events(event_id,event_kind) values(p_event_id,'checkout.session.completed');
  exception when unique_violation then return 'duplicate'; end;
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  select * into checkout from partner_private.photo_tier_checkout_sessions
    where provider_session_id_hmac=extensions.digest(convert_to(p_provider_session_id,'utf8'),'sha256') for update;
  if not found then return 'unbound'; end if;
  if checkout.state<>'open' then return checkout.state; end if;
  if control.state<>'sales_open' or checkout.sales_generation<>control.sales_generation then
    update partner_private.photo_tier_checkout_sessions set state='refund_pending',updated_at=statement_timestamp(),version=version+1 where session_id=checkout.session_id;
    update partner_private.photo_tier_paid_consents set state='revoked',updated_at=statement_timestamp(),version=version+1 where consent_id=checkout.consent_id;
    insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest) values(
      checkout.store_id,'checkout_cancel_full_refund',extensions.digest(convert_to(concat_ws('|',p_event_id,p_provider_session_id,p_customer_id,p_subscription_id),'utf8'),'sha256'));
    perform partner_private.append_audit('billing_checkout_late_completion',null,checkout.store_id,'denied',
      jsonb_build_object('checkoutSessionId',checkout.session_id,'eventId',p_event_id,'salesGeneration',checkout.sales_generation));
    return 'refund_pending';
  end if;
  update partner_private.photo_tier_checkout_sessions set state='completed',updated_at=statement_timestamp(),version=version+1 where session_id=checkout.session_id;
  update partner_private.photo_tier_paid_consents set state='consumed',updated_at=statement_timestamp(),version=version+1 where consent_id=checkout.consent_id and state='checkout_pending';
  if not found then raise exception using errcode='42501',message='billing_webhook_invalid'; end if;
  insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end,last_event_id,last_event_at)
    values(checkout.store_id,p_customer_id,p_subscription_id,'active',statement_timestamp()+interval '1 month',p_event_id,p_event_time)
    on conflict(store_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      state='active',current_period_end=excluded.current_period_end,last_event_id=excluded.last_event_id,last_event_at=excluded.last_event_at,
      updated_at=statement_timestamp(),version=store_subscriptions.version+1;
  insert into partner_private.store_photo_tier_state(store_id,tier,source) values(checkout.store_id,checkout.target_tier,'subscription')
    on conflict(store_id) do update set tier=excluded.tier,source='subscription',updated_at=statement_timestamp(),version=store_photo_tier_state.version+1;
  insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest) values(
    checkout.store_id,'checkout_completed',extensions.digest(convert_to(concat_ws('|',p_event_id,checkout.session_id),'utf8'),'sha256'));
  perform partner_private.append_audit('billing_checkout_completed',null,checkout.store_id,'allowed',
    jsonb_build_object('checkoutSessionId',checkout.session_id,'eventId',p_event_id,'targetTier',checkout.target_tier));
  return 'applied';
end $$;

create or replace function app_public.billing_bind_checkout_provider(p_checkout_session_id uuid,p_provider_session_id text)
returns boolean language sql volatile security definer set search_path='' as $$
  select partner_private.billing_bind_checkout_provider(p_checkout_session_id,p_provider_session_id)
$$;
create or replace function app_public.billing_record_checkout_event(
  p_event_id text,p_event_time timestamptz,p_provider_session_id text,p_customer_id text,p_subscription_id text
) returns text language sql volatile security definer set search_path='' as $$
  select partner_private.billing_apply_checkout_event(p_event_id,p_event_time,p_provider_session_id,p_customer_id,p_subscription_id)
$$;

alter function partner_private.photo_tier_billing_enabled() owner to billing_automation;
alter function app_public.billing_get_capability() owner to billing_automation;
alter function app_public.billing_record_paid_tier_consent(uuid,text,bigint,text,bigint,uuid) owner to billing_automation;
alter function app_public.billing_create_checkout_session(uuid,text,uuid,bigint,uuid) owner to billing_automation;
alter function app_public.billing_create_checkout_session(uuid,uuid) owner to billing_automation;
alter function partner_private.billing_bind_checkout_provider(uuid,text) owner to billing_automation;
alter function partner_private.billing_apply_checkout_event(text,timestamptz,text,text,text) owner to billing_automation;
alter function app_public.billing_bind_checkout_provider(uuid,text) owner to billing_automation;
alter function app_public.billing_record_checkout_event(text,timestamptz,text,text,text) owner to billing_automation;

reset role;
revoke all on function
  partner_private.billing_bind_checkout_provider(uuid,text),
  partner_private.billing_apply_checkout_event(text,timestamptz,text,text,text),
  app_public.billing_bind_checkout_provider(uuid,text),
  app_public.billing_record_checkout_event(text,timestamptz,text,text,text),
  app_public.billing_record_paid_tier_consent(uuid,text,bigint,text,bigint,uuid),
  app_public.billing_create_checkout_session(uuid,text,uuid,bigint,uuid),
  app_public.billing_create_checkout_session(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function app_private.current_session_is_active(),app_private.current_session_has_mfa(),app_private.current_session_recent_auth(interval),app_public.request_user_id() to billing_automation;
grant execute on function
  app_public.billing_record_paid_tier_consent(uuid,text,bigint,text,bigint,uuid),
  app_public.billing_create_checkout_session(uuid,text,uuid,bigint,uuid),
  app_public.billing_create_checkout_session(uuid,uuid)
  to authenticated;
grant execute on function
  app_public.billing_bind_checkout_provider(uuid,text),
  app_public.billing_record_checkout_event(text,timestamptz,text,text,text)
  to billing_mirror_service;
revoke create on schema partner_private,app_public from billing_automation;
revoke billing_automation from postgres;
