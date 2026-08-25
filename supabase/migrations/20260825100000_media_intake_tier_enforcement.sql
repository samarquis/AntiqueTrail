-- Package 13: media intake tier cap enforcement.
-- Validates approved-photo count against store tier cap at upload intake.
-- Returns over-cap rejection with plain-language upgrade copy.

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
  -- Capability gate: only M-01 intake may call this (granted to media_automation).
  if not partner_private.photo_tier_billing_enabled() then
    raise exception using errcode='55000',message='billing_stage_disabled';
  end if;

  -- Validate inputs
  if p_store_id is null or p_kind not in ('cover','gallery') or p_idempotency_key is null then
    raise exception using errcode='22023',message='media_intake_invalid_input';
  end if;

  v_is_cover := (p_kind = 'cover');
  v_cap := partner_private.resolve_store_photo_cap(p_store_id);

  -- Count existing approved media for this store.
  -- Cover uploads don't count against the gallery cap; they have their own slot.
  if v_is_cover then
    -- Cover uploads always allowed (single cover slot per store).
    return jsonb_build_object('allowed', true, 'remaining', 1);
  end if;

  -- Gallery uploads: count approved gallery media (excluding cover).
  select count(*) into v_approved_count
  from media_private.media_uploads
  where store_id = p_store_id
    and state = 'approved'
    and kind = 'gallery';

  -- Unlimited tier: null cap means no limit
  if v_cap is null then
    return jsonb_build_object('allowed', true, 'remaining', -1);
  end if;

  -- At or over cap: reject with upgrade copy
  if v_approved_count >= v_cap then
    -- Get current tier for upgrade copy
    select tier into _ from partner_private.store_photo_tier_state where store_id = p_store_id;
    v_tier := coalesce((select tier from partner_private.store_photo_tier_state where store_id = p_store_id), 'free');

    if v_tier = 'free' then
      v_upgrade_tier := 'featured';
      v_upgrade_cap := 15;
      v_message := 'Your free tier (cover + 5 gallery images) is at capacity. Upgrade to Featured (15 gallery images) or Unlimited to continue uploading.';
    elsif v_tier = 'featured' then
      v_upgrade_tier := 'unlimited';
      v_upgrade_cap := null;
      v_message := 'Your Featured tier (15 gallery images) is at capacity. Upgrade to Unlimited for unrestricted uploads.';
    else
      -- Should never hit: unlimited is null cap
      v_upgrade_tier := 'unlimited';
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

  -- Under cap: allowed
  return jsonb_build_object('allowed', true, 'remaining', v_cap - v_approved_count);
end $$;

grant execute on function partner_private.check_store_media_cap(uuid,text,uuid) to media_automation;
revoke all on function partner_private.check_store_media_cap(uuid,text,uuid) from public,anon,authenticated,service_role;

comment on function partner_private.check_store_media_cap(uuid,text,uuid) is
  'Intake gate for M-01: validates store gallery upload count against tier cap.
   Returns {allowed:true, remaining:int} or {allowed:false, error:"media_cap_exceeded", message, currentTier, upgradeTier, upgradeCap, approvedCount, cap}.';