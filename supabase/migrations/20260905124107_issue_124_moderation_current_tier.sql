-- Issue #124: service moderation must use the same serialized current-tier
-- boundary as four-argument moderation; this does not enable paid sales.
grant media_automation to postgres;
grant create on schema app_public to media_automation;
set role media_automation;
create or replace function app_public.media_approve_upload(
  p_upload_id uuid,
  p_admin_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_upload media_private.media_uploads%rowtype;
  v_version bigint;
  cap_result jsonb;
begin
  -- Authorization
  if not (pg_has_role(session_user, 'media_moderation', 'member') or app_private.current_user_has_role('administrator', v_actor)) then
    raise exception using errcode='42501', message='moderation_access_denied';
  end if;

  if nullif(pg_catalog.btrim(p_admin_reason), '') is null then
    raise exception using errcode='22023', message='moderation_reason_required';
  end if;

  -- Fetch upload with lock
  select * into v_upload from media_private.media_uploads where upload_id = p_upload_id for update;
  if not found then
    raise exception using errcode='22023', message='upload_not_found';
  end if;

  if v_upload.state <> 'awaiting_review' then
    raise exception using errcode='55000', message='upload_not_awaiting_review';
  end if;

  -- Serialize approvals for one store across both RPC overloads before counting.
  perform pg_advisory_xact_lock(hashtextextended(v_upload.store_id::text,0));
  cap_result := partner_private.check_store_media_cap(v_upload.store_id,v_upload.kind,v_upload.idempotency_key);
  if not coalesce((cap_result->>'allowed')::boolean,false) then
    raise exception using errcode='23505',message='media_unavailable';
  end if;

  v_version := v_upload.version;

  -- Advance to approved_pending_publish (will be picked up by media-provider-command publish path)
  update media_private.media_uploads
  set state = 'approved_pending_publish',
      approval_reason = pg_catalog.btrim(p_admin_reason),
      approved_by = v_actor,
      approved_at = statement_timestamp(),
      version = version + 1
  where upload_id = p_upload_id and version = v_version;

  if not found then
    raise exception using errcode='55000', message='upload_concurrent_modification';
  end if;

  -- Audit trail
  perform partner_private.append_audit(
    'media_approved', v_actor, v_upload.store_id, 'allowed',
    jsonb_build_object('uploadId', p_upload_id, 'reason', pg_catalog.btrim(p_admin_reason))
  );

  return jsonb_build_object('state', 'approved_pending_publish', 'uploadId', p_upload_id);
end $$;
reset role;
revoke create on schema app_public from media_automation;
revoke media_automation from postgres;