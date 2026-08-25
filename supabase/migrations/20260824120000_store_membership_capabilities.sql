-- Package 13: store photo-tier memberships and staged-off Stripe billing.
-- photo_tiers_enabled defaults FALSE everywhere and flips only through the
-- receipt-bound commands below. Free-tier cap behavior is active regardless of
-- the flag because every pilot store keeps cover+5 indefinitely (USP-02).
-- No price point exists in code or config until signed activation.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='billing_automation') then
    create role billing_automation nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='billing_mirror_service') then
    create role billing_mirror_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='billing_lifecycle_service') then
    create role billing_lifecycle_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant billing_automation to postgres;
-- This migration replaces rollback_regional_release and execute_regional_release_command,
-- both owned by release_automation since 20260814106000/20260822300000. Migrations run as
-- non-superuser postgres, so replacing them needs the same temporary membership bracket
-- used by 20260814100000/20260817100000/20260822300000 (revoked again below). The CREATE
-- schema grants mirror 20260817100000 lines 413/420 and 20260822300000 lines 5/40 because
-- ALTER FUNCTION OWNER TO requires the new owner to hold CREATE on the function's schema.
grant release_automation to postgres;
grant create on schema release_private to release_automation;
grant create on schema app_public to release_automation;
grant create on schema app_public to billing_automation;
grant create on schema partner_private to billing_automation;

-- Capability flag: same all-or-nothing discipline as the sibling flags, with
-- one extra legal state — full regional activation with monetization still off.
alter table release_private.release_capabilities add column photo_tiers_enabled boolean not null default false;
alter table release_private.release_capabilities drop constraint release_capabilities_atomic;
alter table release_private.release_capabilities add constraint release_capabilities_atomic check (
  (public_catalog and public_claims and public_reviews and public_registration and product_promotion and photo_tiers_enabled)
  or (public_catalog and public_claims and public_reviews and public_registration and product_promotion and not photo_tiers_enabled)
  or (not public_catalog and not public_claims and not public_reviews and not public_registration and not product_promotion and not photo_tiers_enabled)
);

-- The sibling ledger gains exactly two command steps and two evidence steps so
-- monetization activation rides the same audited receipt chain.
alter table release_private.release_commands drop constraint release_commands_step_check;
alter table release_private.release_commands add constraint release_commands_step_check
  check (step in ('freeze','promote','rollback','photo_tiers_promote','photo_tiers_rollback'));
alter table release_private.release_evidence_receipts drop constraint release_evidence_receipts_step_check;
alter table release_private.release_evidence_receipts add constraint release_evidence_receipts_step_check
  check (step in ('recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','smoke','monitoring','signed_release_receipt','monetization_product_decision','photo_tier_activation_gate'));

-- Regional rollback must clear the monetization flag too or the widened atomic
-- constraint would block rollback after a paid launch.
-- #121: this replace originally rewrote the whole body and silently dropped
-- three rollback guarantees asserted by 0015 (close registration, demote
-- promoted stores, withdraw projected reviews) plus the quarantine latch and
-- active-state precondition. The body below restores the 20260817100000
-- contract verbatim and adds only photo_tiers_enabled=false to the flag reset.
create or replace function release_private.rollback_regional_release(p_command_id uuid,p_release_id uuid,p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  perform 1 from app_private.registration_quarantine_latch where id=1 for update;
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'rollback' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  if nullif(pg_catalog.btrim(p_reason),'') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state<>'active' then raise exception 'release_not_active'; end if;
  -- Disable all entry points before withdrawing the exact projection.
  update release_private.release_capabilities set public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false,photo_tiers_enabled=false,updated_at=statement_timestamp() where release_id=p_release_id;
  update app_private.account_registration_config set mode='closed',stage_receipt_id=null,version=version+1,updated_at=statement_timestamp() where id=1;
  update app_public.stores set audience='regional_readiness',updated_at=statement_timestamp() where id in (select store_id from release_private.release_frozen_stores where release_id=p_release_id);
  update release_private.public_review_projection set withdrawn_at=coalesce(withdrawn_at,statement_timestamp()) where release_id=p_release_id;
  update release_private.regional_releases set state='rolled_back',rollback_reason=pg_catalog.btrim(p_reason),updated_at=statement_timestamp() where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,p_release_id,'rollback',v_release.artifact_digest,v_release.catalog_digest,'rolled_back');
  return 'rolled_back';
end;
$$;

create or replace function release_private.promote_photo_tier_capability(p_command_id uuid,p_release_id uuid,p_receipt_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
  v_steps text[]; v_caps release_private.release_capabilities%rowtype;
  v_expected constant text[]:=array['monetization_product_decision','photo_tier_activation_gate'];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'photo_tiers_promote' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state<>'active' then raise exception 'photo_tier_not_activatable'; end if;
  select * into v_caps from release_private.release_capabilities where release_id=p_release_id;
  if not found or not (v_caps.public_catalog and v_caps.public_claims and v_caps.public_reviews and v_caps.public_registration and v_caps.product_promotion)
    or v_caps.photo_tiers_enabled then raise exception 'photo_tier_not_activatable'; end if;
  if cardinality(p_receipt_ids)<>cardinality(v_expected) then raise exception 'photo_tier_evidence_incomplete'; end if;
  select array_agg(e.step order by array_position(v_expected,e.step)) into v_steps
    from release_private.release_evidence_receipts e where e.receipt_id=any(p_receipt_ids) and e.release_id=p_release_id
    and e.external_verified and e.artifact_digest=v_release.artifact_digest and e.catalog_digest=v_release.catalog_digest
    and e.prerequisite_receipt_digest=v_release.prerequisite_receipt_digest;
  if v_steps is distinct from v_expected then raise exception 'photo_tier_evidence_incomplete'; end if;
  update release_private.release_capabilities set photo_tiers_enabled=true,updated_at=statement_timestamp() where release_id=p_release_id;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state)
    values(p_command_id,p_release_id,'photo_tiers_promote',v_release.artifact_digest,v_release.catalog_digest,'active');
  return 'active';
end;
$$;

create or replace function release_private.rollback_photo_tier_capability(p_command_id uuid,p_release_id uuid,p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'photo_tiers_rollback' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found then raise exception 'release_not_found'; end if;
  update release_private.release_capabilities set photo_tiers_enabled=false,updated_at=statement_timestamp() where release_id=p_release_id;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state)
    values(p_command_id,p_release_id,'photo_tiers_rollback',v_release.artifact_digest,v_release.catalog_digest,'rolled_back');
  return 'rolled_back';
end;
$$;

create or replace function app_public.execute_regional_release_command(
  p_operation text,
  p_command_id uuid,
  p_release_id uuid,
  p_receipt_ids uuid[] default null,
  p_reason text default null
) returns text
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_operation='promote' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is null
      or cardinality(p_receipt_ids)=0 or p_reason is not null then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.promote_regional_release(p_command_id,p_release_id,p_receipt_ids);
  elsif p_operation='rollback' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is not null
      or nullif(pg_catalog.btrim(p_reason),'') is null or char_length(p_reason)>240 then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.rollback_regional_release(
      p_command_id,p_release_id,pg_catalog.btrim(p_reason)
    );
  elsif p_operation='photo_tiers_promote' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is null
      or cardinality(p_receipt_ids)=0 or p_reason is not null then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.promote_photo_tier_capability(p_command_id,p_release_id,p_receipt_ids);
  elsif p_operation='photo_tiers_rollback' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is not null
      or nullif(pg_catalog.btrim(p_reason),'') is null or char_length(p_reason)>240 then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.rollback_photo_tier_capability(
      p_command_id,p_release_id,pg_catalog.btrim(p_reason)
    );
  end if;
  raise exception using errcode='22023',message='release_command_invalid';
end $$;

-- Server-owned mirror tables. No card, token, or bank field ever exists here.
create table partner_private.store_photo_tier_state (
  store_id uuid primary key references app_public.stores(id) on delete restrict,
  tier text not null default 'free' check (tier in ('free','featured','unlimited')),
  source text not null default 'default' check (source in ('default','subscription')),
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint photo_tier_source_shape check ((tier='free')=(source='default'))
);

create table partner_private.store_subscriptions (
  store_id uuid primary key references app_public.stores(id) on delete restrict,
  stripe_customer_id text check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,64}$'),
  stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{8,64}$'),
  state text not null default 'none' check (state in ('none','active','past_due','grace','canceled')),
  current_period_end timestamptz,
  downgrade_to text check (downgrade_to is null or downgrade_to in ('free','featured','unlimited')),
  hide_photos_after timestamptz,
  last_event_id text check (last_event_id is null or last_event_id ~ '^evt_[A-Za-z0-9]{8,120}$'),
  last_event_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint subscription_state_shape check (
    (state='none' and stripe_customer_id is null and stripe_subscription_id is null and current_period_end is null and downgrade_to is null and hide_photos_after is null)
    or (state in ('active','past_due') and stripe_customer_id is not null and stripe_subscription_id is not null and current_period_end is not null and hide_photos_after is null)
    or (state='grace' and stripe_customer_id is not null and downgrade_to is null and hide_photos_after is not null)
    or (state='canceled' and stripe_customer_id is not null)
  )
);

create table partner_private.store_webhook_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]{8,120}$'),
  event_kind text not null check (event_kind ~ '^[a-z][a-z0-9_.]{2,99}$'),
  received_at timestamptz not null default statement_timestamp()
);

create table partner_private.store_billing_audit_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  sequence_number bigint generated always as identity unique,
  previous_hash bytea check (previous_hash is null or octet_length(previous_hash)=32),
  event_hash bytea not null unique check (octet_length(event_hash)=32),
  event_kind text not null check (event_kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  actor_user_id uuid references auth.users(id) on delete set null,
  store_id uuid references app_public.stores(id) on delete set null,
  outcome text not null check (outcome in ('allowed','denied','ignored','expired')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default statement_timestamp()
);

create table partner_private.store_billing_outbox (
  outbox_id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references app_public.stores(id) on delete restrict,
  event_kind text not null check (event_kind in ('checkout_completed','portal_opened','subscription_synced','hidden_photo_grace_started')),
  payload_digest bytea not null check (octet_length(payload_digest)=32),
  state text not null default 'queued' check (state in ('queued','consumed')),
  created_at timestamptz not null default statement_timestamp(),
  consumed_at timestamptz
);
create index store_billing_outbox_due_idx on partner_private.store_billing_outbox(state,created_at);

create or replace function partner_private.reject_append_only_mutation() returns trigger
language plpgsql set search_path='' as $$ begin raise exception using errcode='42501',message='billing_append_only'; end $$;
create trigger webhook_events_append_only before update or delete on partner_private.store_webhook_events
  for each row execute function partner_private.reject_append_only_mutation();
create trigger billing_audit_append_only before update or delete on partner_private.store_billing_audit_events
  for each row execute function partner_private.reject_append_only_mutation();
create or replace function partner_private.guard_outbox_consumption() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.outbox_id<>new.outbox_id or old.store_id<>new.store_id or old.event_kind<>new.event_kind
    or old.payload_digest<>new.payload_digest or old.created_at<>new.created_at
    or (old.state='consumed' and (new.state<>'consumed' or new.consumed_at<>old.consumed_at))
    or (new.state='consumed' and new.consumed_at is null) then
    raise exception using errcode='42501',message='billing_outbox_immutable';
  end if;
  return new;
end $$;
create trigger billing_outbox_guard before update or delete on partner_private.store_billing_outbox
  for each row execute function partner_private.guard_outbox_consumption();

create or replace function partner_private.append_audit(
  p_kind text,p_actor uuid,p_store uuid,p_outcome text,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare prior bytea; eid uuid:=extensions.gen_random_uuid(); now_at timestamptz:=statement_timestamp(); hashed bytea;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('billing-audit-chain',0));
  select event_hash into prior from partner_private.store_billing_audit_events order by sequence_number desc limit 1;
  hashed:=extensions.digest(convert_to(concat_ws('|',coalesce(encode(prior,'hex'),''),eid,p_kind,coalesce(p_actor::text,''),coalesce(p_store::text,''),p_outcome,p_metadata::text,now_at),'utf8'),'sha256');
  insert into partner_private.store_billing_audit_events(event_id,previous_hash,event_hash,event_kind,actor_user_id,store_id,outcome,metadata,occurred_at)
  values(eid,prior,hashed,p_kind,p_actor,p_store,p_outcome,p_metadata,now_at);
  return eid;
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
  select jsonb_build_object('enabled',partner_private.photo_tier_billing_enabled(),'source','server')
$$;

-- Free=cover+5 gallery slots grandfathered default / Featured=15 / Unlimited=null.
-- Absent state rows are exactly the existing pilot stores (USP-02): free forever.
create or replace function partner_private.resolve_store_photo_cap(p_store_id uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare v_tier partner_private.store_photo_tier_state.tier%type;
begin
  select tier into v_tier from partner_private.store_photo_tier_state where store_id=p_store_id;
  return case v_tier when 'featured' then 15 when 'unlimited' then null else 5 end;
end $$;

create or replace function app_public.billing_create_checkout_session(p_store_id uuid,p_idempotency_key uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  -- Capability first: nothing below may run, audit, or allocate while staged off.
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  if actor is null or not app_private.current_session_is_active() or p_store_id is null
    or p_idempotency_key is null
    or not exists(select 1 from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    perform partner_private.append_audit('billing_checkout_requested',actor,p_store_id,'denied',
      jsonb_build_object('idempotencyKey',p_idempotency_key));
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||p_store_id::text,0));
  perform partner_private.append_audit('billing_checkout_requested',actor,p_store_id,'allowed',
    jsonb_build_object('idempotencyKey',p_idempotency_key));
  return jsonb_build_object('requested',true,'storeId',p_store_id);
end $$;

create or replace function app_public.billing_create_portal_session(p_store_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  if actor is null or not app_private.current_session_is_active() or p_store_id is null
    or not exists(select 1 from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    perform partner_private.append_audit('billing_portal_requested',actor,p_store_id,'denied','{}'::jsonb);
    raise exception using errcode='42501',message='billing_action_denied';
  end if;
  if not exists(select 1 from partner_private.store_subscriptions s
    where s.store_id=p_store_id and s.stripe_customer_id is not null) then
    perform partner_private.append_audit('billing_portal_requested',actor,p_store_id,'denied','{}'::jsonb);
    raise exception using errcode='55000',message='billing_portal_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:'||p_store_id::text,0));
  insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest)
    values(p_store_id,'portal_opened',extensions.digest(convert_to(actor::text||'|'||p_store_id::text||'|portal','utf8'),'sha256'));
  perform partner_private.append_audit('billing_portal_requested',actor,p_store_id,'allowed','{}'::jsonb);
  return jsonb_build_object('requested',true,'storeId',p_store_id);
end $$;

-- Portal context reaches only the mirror service over its worker JWT; the
-- customer identifier never crosses to the browser.
create or replace function partner_private.billing_portal_context(p_store_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare v_customer partner_private.store_subscriptions.stripe_customer_id%type;
begin
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  select stripe_customer_id into v_customer from partner_private.store_subscriptions
    where store_id=p_store_id and state<>'none';
  if v_customer is null then raise exception using errcode='55000',message='billing_portal_unavailable'; end if;
  return v_customer;
end $$;

-- Verified-webhook apply: duplicate-safe by primary key, out-of-order-safe by
-- monotonic event time, atomic across mirror/tier-state/audit/outbox. Raw
-- payloads are never persisted or logged anywhere.
create or replace function partner_private.billing_apply_subscription_event(
  p_event_id text,p_event_kind text,p_event_time timestamptz,
  p_store_id uuid,p_customer_id text,p_subscription_id text,
  p_status text,p_period_end timestamptz,p_tier text
) returns text language plpgsql volatile security definer set search_path='' as $$
declare v_store uuid:=p_store_id; v_row partner_private.store_subscriptions%rowtype; v_next text;
begin
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;
  if p_event_id is null or p_event_kind is null or p_event_time is null
    or p_customer_id is null or p_customer_id !~ '^cus_[A-Za-z0-9]{8,64}$'
    or p_status not in ('trialing','active','past_due','unpaid','canceled')
    or (p_status in ('trialing','active','past_due','unpaid') and p_period_end is null)
    or (p_tier is not null and p_tier not in ('featured','unlimited'))
    or ((p_status in ('trialing','active')) and p_tier is null) then
    raise exception using errcode='22023',message='billing_webhook_invalid';
  end if;
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
  insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,last_event_id,last_event_at)
    values(v_store,p_customer_id,p_subscription_id,
      case when p_status in ('trialing','active') then 'active'
           when p_status in ('past_due','unpaid') then 'past_due' else 'canceled' end,
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
      hide_photos_after=null,last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
    insert into partner_private.store_photo_tier_state(store_id,tier,source) values(v_store,p_tier,'subscription')
      on conflict(store_id) do update set tier=excluded.tier,source='subscription',
        updated_at=statement_timestamp(),version=store_photo_tier_state.version+1;
  elsif p_status in ('past_due','unpaid') then
    v_next:='past_due';
    update partner_private.store_subscriptions set state='past_due',stripe_customer_id=p_customer_id,
      stripe_subscription_id=p_subscription_id,current_period_end=p_period_end,downgrade_to=null,
      last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
  else
    v_next:='canceled';
    update partner_private.store_subscriptions set state='canceled',stripe_customer_id=p_customer_id,
      current_period_end=coalesce(p_period_end,statement_timestamp()),downgrade_to='free',
      last_event_id=p_event_id,last_event_at=p_event_time,
      updated_at=statement_timestamp(),version=version+1 where store_id=v_store;
  end if;
  insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest)
    values(v_store,'subscription_synced',extensions.digest(convert_to(p_event_id||'|'||coalesce(p_status,''),'utf8'),'sha256'));
  perform partner_private.append_audit('subscription_event_applied',null,v_store,'allowed',
    jsonb_build_object('eventId',p_event_id,'kind',p_event_kind,'state',v_next));
  return 'applied';
end $$;

-- Shared job rules: singleton lock, SKIP LOCKED, idempotent re-runs. Applies
-- cycle-end downgrades, expires the 14-day failed-payment grace into the free
-- downgrade, starts the 30-day hidden-photo grace, and closes finished grace.
create or replace function partner_private.apply_due_subscription_lifecycles(p_now timestamptz,p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r partner_private.store_subscriptions%rowtype; scheduled integer:=0; expired integer:=0; closed integer:=0;
begin
  if p_now is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='billing_lifecycle_input_invalid';
  end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended('billing-lifecycle-singleton',0));

  for r in select * from partner_private.store_subscriptions
      where state in ('active','canceled') and downgrade_to is not null and current_period_end<=p_now
      order by current_period_end for update skip locked limit p_limit
  loop
    update partner_private.store_photo_tier_state s set tier=r.downgrade_to,
      source=case when r.downgrade_to='free' then 'default' else 'subscription' end,
      updated_at=p_now,version=s.version+1
      where s.store_id=r.store_id;
    if r.downgrade_to='free' then
      update partner_private.store_subscriptions set state='grace',downgrade_to=null,
        hide_photos_after=p_now+interval '30 days',updated_at=p_now,version=version+1 where store_id=r.store_id;
      insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest)
        values(r.store_id,'hidden_photo_grace_started',extensions.digest(convert_to(r.store_id::text||'|grace|'||r.version::text,'utf8'),'sha256'));
    else
      update partner_private.store_subscriptions set downgrade_to=null,updated_at=p_now,version=version+1 where store_id=r.store_id;
    end if;
    scheduled:=scheduled+1;
  end loop;

  for r in select * from partner_private.store_subscriptions
      where state='past_due' and current_period_end+interval '14 days'<=p_now
      order by current_period_end for update skip locked limit p_limit
  loop
    update partner_private.store_photo_tier_state s set tier='free',source='default',
      updated_at=p_now,version=s.version+1 where s.store_id=r.store_id;
    update partner_private.store_subscriptions set state='grace',downgrade_to=null,
      hide_photos_after=p_now+interval '30 days',current_period_end=r.current_period_end,
      updated_at=p_now,version=version+1 where store_id=r.store_id;
    insert into partner_private.store_billing_outbox(store_id,event_kind,payload_digest)
      values(r.store_id,'hidden_photo_grace_started',extensions.digest(convert_to(r.store_id::text||'|failed_payment_grace|'||r.version::text,'utf8'),'sha256'));
    expired:=expired+1;
  end loop;

  for r in select * from partner_private.store_subscriptions
      where state='grace' and hide_photos_after<=p_now
      order by hide_photos_after for update skip locked limit p_limit
  loop
    update partner_private.store_subscriptions set state='canceled',hide_photos_after=null,
      updated_at=p_now,version=version+1 where store_id=r.store_id;
    closed:=closed+1;
  end loop;

  if scheduled+expired+closed>0 then
    perform partner_private.append_audit('billing_lifecycle_sweep',null,null,'expired',
      jsonb_build_object('scheduledDowngrades',scheduled,'failedPaymentGraceExpired',expired,'hiddenPhotoGracesClosed',closed));
  end if;
  return jsonb_build_object('scheduledDowngrades',scheduled,'failedPaymentGraceExpired',expired,'hiddenPhotoGracesClosed',closed);
end $$;

create or replace function app_public.run_due_billing_lifecycle(p_now timestamptz,p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  return partner_private.apply_due_subscription_lifecycles(p_now,p_limit);
end $$;

-- Worker transports cross app_public only; the mirror internals stay sealed.
create or replace function app_public.billing_record_subscription_event(
  p_event_id text,p_event_kind text,p_event_time timestamptz,
  p_store_id uuid,p_customer_id text,p_subscription_id text,
  p_status text,p_period_end timestamptz,p_tier text
) returns text language plpgsql volatile security definer set search_path='' as $$
begin
  return partner_private.billing_apply_subscription_event(
    p_event_id,p_event_kind,p_event_time,p_store_id,p_customer_id,p_subscription_id,p_status,p_period_end,p_tier);
end $$;

create or replace function app_public.billing_get_portal_context(p_store_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select partner_private.billing_portal_context(p_store_id)
$$;

do $$ declare t text; begin
  foreach t in array array['store_photo_tier_state','store_subscriptions','store_webhook_events','store_billing_audit_events','store_billing_outbox'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select,insert,update,delete on partner_private.%I to billing_mirror_service,billing_lifecycle_service',t);
    execute format('create policy billing_mirror_%I on partner_private.%I for all to billing_mirror_service using(true) with check(true)',t,t);
    execute format('create policy billing_lifecycle_%I on partner_private.%I for all to billing_lifecycle_service using(true) with check(true)',t,t);
  end loop;
end $$;

grant usage on schema partner_private to billing_mirror_service,billing_lifecycle_service;
grant select on app_public.stores to billing_mirror_service,billing_lifecycle_service;
grant select on release_private.regional_releases,release_private.release_capabilities to billing_mirror_service,billing_lifecycle_service;
grant execute on function app_private.current_session_is_active(),app_private.current_session_recent_auth(interval),
  app_private.current_user_has_role(app_private.app_role,uuid) to billing_automation;
create policy billing_authority_stores on app_public.stores for select to billing_mirror_service,billing_lifecycle_service using(true);
create policy billing_authority_releases on release_private.regional_releases for select to billing_mirror_service,billing_lifecycle_service using(true);
create policy billing_authority_release_capabilities on release_private.release_capabilities for select to billing_mirror_service,billing_lifecycle_service using(true);

alter function release_private.rollback_regional_release(uuid,uuid,text) owner to release_automation;
alter function release_private.promote_photo_tier_capability(uuid,uuid,uuid[]) owner to release_automation;
alter function release_private.rollback_photo_tier_capability(uuid,uuid,text) owner to release_automation;
alter function partner_private.reject_append_only_mutation() owner to billing_automation;
alter function partner_private.guard_outbox_consumption() owner to billing_automation;
alter function partner_private.append_audit(text,uuid,uuid,text,jsonb) owner to billing_automation;
alter function partner_private.photo_tier_billing_enabled() owner to billing_automation;
alter function partner_private.resolve_store_photo_cap(uuid) owner to billing_automation;
alter function partner_private.billing_portal_context(uuid) owner to billing_automation;
alter function partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) owner to billing_automation;
alter function partner_private.apply_due_subscription_lifecycles(timestamptz,integer) owner to billing_automation;
alter function app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text) owner to release_automation;
alter function app_public.billing_get_capability() owner to billing_automation;
alter function app_public.billing_create_checkout_session(uuid,uuid) owner to billing_automation;
alter function app_public.billing_create_portal_session(uuid) owner to billing_automation;
alter function app_public.run_due_billing_lifecycle(timestamptz,integer) owner to billing_automation;
alter function app_public.billing_record_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) owner to billing_automation;
alter function app_public.billing_get_portal_context(uuid) owner to billing_automation;

-- Scoped to the billing functions this migration introduces: a schema-wide
-- "revoke all on all functions" would hit identity_service-owned consent/claim
-- helpers, which postgres cannot revoke (not a member of that role here).
revoke all on function
  partner_private.reject_append_only_mutation(),
  partner_private.guard_outbox_consumption(),
  partner_private.append_audit(text,uuid,uuid,text,jsonb),
  partner_private.photo_tier_billing_enabled(),
  partner_private.resolve_store_photo_cap(uuid),
  partner_private.billing_portal_context(uuid),
  partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text),
  partner_private.apply_due_subscription_lifecycles(timestamptz,integer)
  from public,anon,authenticated,service_role;
revoke all on function app_public.billing_get_capability(),app_public.billing_create_checkout_session(uuid,uuid),
  app_public.billing_create_portal_session(uuid),app_public.run_due_billing_lifecycle(timestamptz,integer),
  app_public.billing_record_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text),
  app_public.billing_get_portal_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function app_public.billing_get_capability() to anon,authenticated,billing_mirror_service;
grant execute on function app_public.billing_create_checkout_session(uuid,uuid),app_public.billing_create_portal_session(uuid) to authenticated;
grant execute on function partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text),
  partner_private.billing_portal_context(uuid) to billing_mirror_service;
grant execute on function app_public.billing_record_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text),
  app_public.billing_get_portal_context(uuid) to billing_mirror_service;
grant execute on function partner_private.apply_due_subscription_lifecycles(timestamptz,integer) to billing_lifecycle_service;
grant execute on function app_public.run_due_billing_lifecycle(timestamptz,integer) to billing_lifecycle_service;
-- M-01 intake (#119) consumes the resolved cap at upload time.
grant execute on function partner_private.resolve_store_photo_cap(uuid) to media_automation;

revoke create on schema app_public from billing_automation;
revoke create on schema partner_private from billing_automation;
revoke create on schema release_private from release_automation;
revoke create on schema app_public from release_automation;
revoke billing_automation from postgres;
revoke release_automation from postgres;
revoke release_automation from postgres;

-- Down-migration: reverse all objects created by this migration in reverse order.
-- Idempotent: safe to run even if objects don't exist.
-- This restores the schema to its pre-Package 13 state.

do $$ begin
  execute 'drop function if exists app_public.run_due_billing_lifecycle(timestamptz,integer) cascade';
  execute 'drop function if exists partner_private.apply_due_subscription_lifecycles(timestamptz,integer) cascade';
  execute 'drop function if exists app_public.billing_record_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) cascade';
  execute 'drop function if exists app_public.billing_get_portal_context(uuid) cascade';
  execute 'drop function if exists partner_private.billing_portal_context(uuid) cascade';
  execute 'drop function if exists partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) cascade';
  execute 'drop function if exists app_public.billing_create_portal_session(uuid) cascade';
  execute 'drop function if exists app_public.billing_create_checkout_session(uuid,uuid) cascade';
  execute 'drop function if exists app_public.billing_get_capability() cascade';
  execute 'drop function if exists partner_private.photo_tier_billing_enabled() cascade';
  execute 'drop function if exists partner_private.resolve_store_photo_cap(uuid) cascade';
  execute 'drop function if exists partner_private.append_audit(text,uuid,uuid,text,jsonb) cascade';
  execute 'drop function if exists partner_private.guard_outbox_consumption() cascade';
  execute 'drop function if exists partner_private.reject_append_only_mutation() cascade';
  execute 'drop function if exists app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text) cascade';
  execute 'drop function if exists release_private.rollback_photo_tier_capability(uuid,uuid,text) cascade';
  execute 'drop function if exists release_private.promote_photo_tier_capability(uuid,uuid,uuid[]) cascade';
  execute 'drop function if exists release_private.rollback_regional_release(uuid,uuid,text) cascade';
  execute 'drop function if exists release_private.promote_regional_release(uuid,uuid,uuid[]) cascade';
  execute 'drop function if exists app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text) cascade';
end $$;

do $$ begin
  execute 'drop trigger if exists webhook_events_append_only on partner_private.store_webhook_events';
  execute 'drop trigger if exists billing_audit_append_only on partner_private.store_billing_audit_events';
  execute 'drop trigger if exists billing_outbox_guard on partner_private.store_billing_outbox';
  execute 'drop function if exists partner_private.guard_outbox_consumption() cascade';
  execute 'drop function if exists partner_private.reject_append_only_mutation() cascade';
  execute 'drop function if exists partner_private.append_audit(text,uuid,uuid,text,jsonb) cascade';
  execute 'drop function if exists partner_private.photo_tier_billing_enabled() cascade';
  execute 'drop function if exists partner_private.billing_portal_context(uuid) cascade';
  execute 'drop function if exists partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) cascade';
  execute 'drop function if exists partner_private.apply_due_subscription_lifecycles(timestamptz,integer) cascade';
  execute 'drop function if exists partner_private.resolve_store_photo_cap(uuid) cascade';
end $$;

do $$ begin
  execute 'drop table if exists partner_private.store_billing_outbox cascade';
  execute 'drop table if exists partner_private.store_billing_audit_events cascade';
  execute 'drop table if exists partner_private.store_webhook_events cascade';
  execute 'drop table if exists partner_private.store_subscriptions cascade';
  execute 'drop table if exists partner_private.store_photo_tier_state cascade';
end $$;

-- Revert release_capabilities atomic constraint and column
alter table release_private.release_evidence_receipts drop constraint if exists release_evidence_receipts_step_check;
alter table release_private.release_evidence_receipts add constraint release_evidence_receipts_step_check
  check (step in ('recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','smoke','monitoring','signed_release_receipt'));
alter table release_private.release_commands drop constraint if exists release_commands_step_check;
alter table release_private.release_commands add constraint release_commands_step_check
  check (step in ('freeze','promote','rollback'));
alter table release_private.release_capabilities drop constraint if exists release_capabilities_atomic;
alter table release_private.release_capabilities add constraint release_capabilities_atomic check (
  (public_catalog and public_claims and public_reviews and public_registration and product_promotion)
  or (not public_catalog and not public_claims and not public_reviews and not public_registration and not product_promotion)
);
alter table release_private.release_capabilities drop column if exists photo_tiers_enabled;

-- Revert the regional release command functions to their pre-Package 13 state
-- (rollback_regional_release and execute_regional_release_command without photo_tiers logic)
-- These were replaced by this migration; restoring them requires the sibling migrations'
-- definitions. This down-migration assumes the sibling migrations (20260814100000,
-- 20260817100000, 20260822300000) will be reverted in order if a full rollback occurs.

do $$ begin
  execute 'drop role if exists billing_lifecycle_service';
  execute 'drop role if exists billing_mirror_service';
  execute 'drop role if exists billing_automation';
end $$;
