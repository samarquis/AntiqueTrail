-- #425: expose a minimal read-only billing snapshot to approved store roles.
grant identity_service to postgres;
set role identity_service;
grant execute on function portal_private.owner_access_roles() to billing_automation;
reset role;
revoke identity_service from postgres;
grant billing_automation to postgres;
grant usage,create on schema app_public to billing_automation;
grant create on schema partner_private to billing_automation;
grant usage on schema portal_private to billing_automation;
set role billing_automation;

create or replace function partner_private.assert_servicing_actor(p_store_id uuid) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  perform 1 from partner_private.store_partner_grants
   where store_id=p_store_id and auth_user_id=actor and state='active' and role='representative' for share;
  if not found then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  return actor;
end $$;

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
  actor:=partner_private.assert_servicing_actor(p_store_id);
  select * into prior from partner_private.photo_tier_paid_consents where representative_id=actor and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.input_digest<>input_hash then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('consentId',prior.consent_id,'expiresAt',prior.expires_at,'state',prior.state,
      'configVersion',prior.commercial_config_version,'configDigest',encode((select c.digest from partner_private.photo_tier_commercial_configs c where c.version=prior.commercial_config_version),'hex'));
  end if;
  select * into config from partner_private.photo_tier_commercial_configs
    where version=p_commercial_config_version and state='active' for share;
  if not found or control.commercial_config_version<>config.version or digest<>config.digest then
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
    jsonb_build_object('consentId',created.consent_id,'targetTier',p_target_tier,'configVersion',config.version));
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
  input_hash bytea; price bigint; tier_state partner_private.store_photo_tier_state%rowtype;
begin
  if p_store_id is null or p_target_tier not in ('gallery','full_gallery') or p_consent_id is null
    or p_commercial_config_version is null or p_idempotency_key is null then
    raise exception using errcode='22023',message='billing_checkout_invalid';
  end if;
  input_hash:=extensions.digest(convert_to(concat_ws('|',p_store_id,p_target_tier,p_consent_id,p_commercial_config_version),'utf8'),'sha256');
  select * into control from partner_private.photo_tier_sales_control where singleton for update;
  actor:=partner_private.assert_servicing_actor(p_store_id);
  select * into prior from partner_private.photo_tier_checkout_sessions where idempotency_key=p_idempotency_key for update;
  if found then
    if prior.input_digest<>input_hash or prior.store_id<>p_store_id or prior.consent_id<>p_consent_id
      or not exists(select 1 from partner_private.photo_tier_paid_consents c where c.consent_id=prior.consent_id and c.representative_id=actor) then
      raise exception using errcode='42501',message='billing_action_denied';
    end if;
    select * into config from partner_private.photo_tier_commercial_configs where version=prior.commercial_config_version;
    return jsonb_build_object('checkoutSessionId',prior.session_id,'storeId',prior.store_id,'targetTier',prior.target_tier,
      'priceCents',case prior.target_tier when 'gallery' then config.gallery_price_cents else config.full_gallery_price_cents end,
      'currency',config.currency,'salesGeneration',prior.sales_generation,'expiresAt',prior.expires_at,'state',prior.state);
  end if;
  if control.state<>'sales_open' or not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
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
  select * into tier_state from partner_private.store_photo_tier_state where store_id=p_store_id for update;
  if (found and (tier_state.tier<>'free' or tier_state.version<>consent.expected_store_version))
    or (not found and consent.expected_store_version<>0) then
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  perform 1 from partner_private.store_subscriptions where store_id=p_store_id for update;
  if exists(select 1 from partner_private.store_subscriptions where store_id=p_store_id and state in ('active','past_due','grace'))
    or exists(select 1 from partner_private.photo_tier_checkout_sessions where store_id=p_store_id and state in ('open','expire_pending','refund_pending')) then
    raise exception using errcode='42501',message='billing_purchase_in_progress';
  end if;
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

create function app_public.billing_get_owner_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare selected_store uuid; v_tier text; v_state text; v_paid_through timestamptz; v_sales_open boolean;
begin
  begin
    selected_store:=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='42501',message='billing_status_unavailable';
  end;
  if selected_store is null or not exists(
    select 1 from portal_private.owner_access_roles()
    where store_id=selected_store and store_role in ('store_owner','co_owner','full_store_access')
  ) then
    raise exception using errcode='42501',message='billing_status_unavailable';
  end if;

  select coalesce((select tier from partner_private.store_photo_tier_state where store_id=selected_store),'free'),
    coalesce((select state from partner_private.store_subscriptions where store_id=selected_store),'none'),
    (select current_period_end from partner_private.store_subscriptions where store_id=selected_store),
    coalesce((select state='sales_open' and partner_private.photo_tier_billing_enabled()
      from partner_private.photo_tier_sales_control where singleton),false)
    into v_tier,v_state,v_paid_through,v_sales_open;
  return jsonb_build_object('tier',v_tier,'subscriptionState',v_state,'paidThrough',v_paid_through,
    'salesOpen',v_sales_open,'availableActions','[]'::jsonb);
exception when insufficient_privilege then
  raise exception using errcode='42501',message='billing_status_unavailable';
end $$;

reset role;
revoke create on schema app_public,partner_private from billing_automation;
revoke all on function app_public.billing_get_owner_status() from public,anon,authenticated,service_role;
grant execute on function app_public.billing_get_owner_status() to authenticated;
revoke billing_automation from postgres;
