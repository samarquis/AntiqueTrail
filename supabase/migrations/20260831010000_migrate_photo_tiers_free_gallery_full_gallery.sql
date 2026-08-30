-- Issue #174: Migrate tier vocabulary from featured/unlimited to gallery/full_gallery
-- Forward-only, rerun-safe. Server-owned resolver remains single authority.
-- Pilot stores absent from store_photo_tier_state remain Free indefinitely (cover+5).
-- shopper read path (catalog_details) is not touched and stays uncapped.

-- 1. Drop legacy tier constraints first so stored-value conversion can run
--    against the legacy schema (constraint checks fire per row on UPDATE).
do $$ declare r record; begin
  for r in select conname, oid from pg_constraint where conrelid='partner_private.store_photo_tier_state'::regclass and contype='c' loop
    if pg_get_constraintdef(r.oid) like '%featured%' or pg_get_constraintdef(r.oid) like '%unlimited%'
      or r.conname='store_photo_tier_state_tier_check' then
      execute format('alter table partner_private.store_photo_tier_state drop constraint %I', r.conname);
    end if;
  end loop;
end $$;

do $$ declare r record; begin
  for r in select conname, oid from pg_constraint where conrelid='partner_private.store_subscriptions'::regclass and contype='c' loop
    if pg_get_constraintdef(r.oid) like '%featured%' or pg_get_constraintdef(r.oid) like '%unlimited%'
      or r.conname='store_subscriptions_downgrade_to_check' then
      execute format('alter table partner_private.store_subscriptions drop constraint %I', r.conname);
    end if;
  end loop;
end $$;

-- 2. Migrate stored values idempotently (rerun safe: WHERE clauses no-op)
update partner_private.store_photo_tier_state set tier = 'gallery' where tier = 'featured';
update partner_private.store_photo_tier_state set tier = 'full_gallery' where tier = 'unlimited';
update partner_private.store_subscriptions set downgrade_to = 'gallery' where downgrade_to = 'featured';
update partner_private.store_subscriptions set downgrade_to = 'full_gallery' where downgrade_to = 'unlimited';

-- 3. Recreate constraints with canonical names, guarded so rerun is safe.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='store_photo_tier_state_tier_check' and conrelid='partner_private.store_photo_tier_state'::regclass) then
    alter table partner_private.store_photo_tier_state
      add constraint store_photo_tier_state_tier_check check (tier in ('free','gallery','full_gallery'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='store_subscriptions_downgrade_to_check' and conrelid='partner_private.store_subscriptions'::regclass) then
    alter table partner_private.store_subscriptions
      add constraint store_subscriptions_downgrade_to_check check (downgrade_to is null or downgrade_to in ('free','gallery','full_gallery'));
  end if;
end $$;

-- photo_tier_source_shape does not reference tier names, keep as is

-- 3. Single server authority: resolve_store_photo_cap -> free 5, gallery 15, full_gallery null
create or replace function partner_private.resolve_store_photo_cap(p_store_id uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare v_tier partner_private.store_photo_tier_state.tier%type;
begin
  select tier into v_tier from partner_private.store_photo_tier_state where store_id=p_store_id;
  return case v_tier when 'gallery' then 15 when 'full_gallery' then null else 5 end;
end $$;

-- 4. Rebuild media intake cap enforcement to use new tier names and copy
grant media_automation to postgres;
grant create on schema partner_private to media_automation;
set role media_automation;

create or replace function partner_private.check_store_media_cap(
  p_store_id uuid,
  p_kind text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cap integer;
  v_approved_count integer;
  v_is_cover boolean;
  v_tier text;
  v_upgrade_tier text;
  v_upgrade_cap integer;
  v_message text;
begin
  if p_store_id is null or p_kind not in ('cover','gallery') or p_idempotency_key is null then
    raise exception using errcode='22023',message='media_intake_invalid_input';
  end if;

  v_is_cover := (p_kind = 'cover');
  v_cap := partner_private.resolve_store_photo_cap(p_store_id);

  if v_is_cover then
    return jsonb_build_object('allowed', true, 'remaining', 1);
  end if;

  select count(*) into v_approved_count
  from media_private.media_uploads
  where store_id = p_store_id
    and state in ('approved_pending_publish','published')
    and kind = 'gallery';

  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', -1);
  end if;

  if v_approved_count >= v_cap then
    v_tier := case v_cap when 5 then 'free' when 15 then 'gallery' else 'full_gallery' end;

    if v_tier = 'free' then
      v_upgrade_tier := 'gallery';
      v_upgrade_cap := 15;
      v_message := 'Your Free tier (cover + 5 gallery images) is at capacity. Upgrade to Gallery (15 gallery images) or Full Gallery to continue uploading.';
    elsif v_tier = 'gallery' then
      v_upgrade_tier := 'full_gallery';
      v_upgrade_cap := null;
      v_message := 'Your Gallery tier (15 gallery images) is at capacity. Upgrade to Full Gallery for no plan-count cap.';
    else
      v_upgrade_tier := 'full_gallery';
      v_upgrade_cap := null;
      v_message := 'Upload limit reached. Contact support.';
    end if;

    return jsonb_build_object(
      'allowed', false,
      'error', 'media_cap_exceeded',
      'message', v_message,
      'currentTier', v_tier,
      'upgradeTier', v_upgrade_tier,
      'upgradeCap', v_upgrade_cap,
      'approvedCount', v_approved_count,
      'cap', v_cap
    );
  end if;

  return jsonb_build_object('allowed', true, 'remaining', v_cap - v_approved_count);
end $$;

grant execute on function partner_private.check_store_media_cap(uuid,text,uuid) to media_automation;
grant execute on function partner_private.check_store_media_cap(uuid,text,uuid) to postgres;
revoke all on function partner_private.check_store_media_cap(uuid,text,uuid) from public,anon,authenticated,service_role;

comment on function partner_private.check_store_media_cap(uuid,text,uuid) is
  'Intake gate: validates store gallery upload count against tier cap via resolve_store_photo_cap. Full Gallery (null cap) never enforces count cap.';

reset role;
revoke create on schema partner_private from media_automation;
revoke media_automation from postgres;

-- 5. Update billing webhook validation to accept new tier names (keep legacy for compatibility during rolling deploy)
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
    or (p_tier is not null and p_tier not in ('free','gallery','full_gallery','featured','unlimited'))
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

-- Re-apply RLS owner and grants (idempotent)
alter function partner_private.resolve_store_photo_cap(uuid) owner to billing_automation;
alter function partner_private.billing_apply_subscription_event(text,text,timestamptz,uuid,text,text,text,timestamptz,text) owner to billing_automation;
grant execute on function partner_private.resolve_store_photo_cap(uuid) to media_automation;
grant execute on function partner_private.append_audit(text,uuid,uuid,text,jsonb) to media_automation;

-- Rollback / forward-repair notes (recorded, not executed here):
-- Rerun is safe: updates are idempotent where-clauses; constraint drops guard existence.
-- Forward repair: if legacy rows reappear, rerun the two UPDATEs above then re-apply this file.
-- Rollback to featured/unlimited: reverse UPDATEs (gallery->featured, full_gallery->unlimited),
--   recreate legacy check constraints (tier in free,featured,unlimited), and restore prior function bodies
--   from git history at 20260825100000 and 20260824120000. Do not delete provenance or audit rows.
