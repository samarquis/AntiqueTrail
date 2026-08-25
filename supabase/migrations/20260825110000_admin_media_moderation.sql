-- Package 13: Administrator moderation queue for awaiting_review media uploads.
-- Provides queue listing, approve (advances to publish), reject with required reason.
-- Audit trail on every action; Administrator-only access.

-- Admin-only role for moderation
do $$ begin
  if not exists(select 1 from pg_roles where rolname='media_moderation') then
    create role media_moderation nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant media_moderation to postgres;

-- Queue: list awaiting_review uploads with store context
create or replace function app_public.media_list_awaiting_review(
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_result jsonb;
begin
  -- Authorization: media_moderation role or admin
  if not (pg_has_role(v_actor, 'media_moderation', 'member') or app_private.current_user_has_role('administrator', v_actor)) then
    raise exception using errcode='42501', message='moderation_access_denied';
  end if;

  if p_limit < 1 or p_limit > 200 or p_offset < 0 then
    raise exception using errcode='22023', message='moderation_invalid_pagination';
  end if;

  select jsonb_agg(to_jsonb(r) order by r.created_at desc)
  into v_result
  from (
    select
      mu.upload_id,
      mu.store_id,
      s.name as store_name,
      s.address as store_address,
      mu.kind,
      mu.alt_text,
      mu.original_object_key,
      mu.derivative_object_key,
      mu.bytes as original_bytes,
      mu.derivative_bytes,
      mu.width,
      mu.height,
      mu.created_at,
      mu.updated_at
    from media_private.media_uploads mu
    join app_public.stores s on s.id = mu.store_id
    where mu.state = 'awaiting_review'
    order by mu.created_at desc
    limit p_limit offset p_offset
  ) r;

  return coalesce(v_result, '[]'::jsonb);
end $$;

-- Approve: advances awaiting_review -> approved_pending_publish -> publish via media-provider-command
create or replace function app_public.media_approve_upload(
  p_upload_id uuid,
  p_admin_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_upload media_private.media_uploads%rowtype;
  v_version bigint;
begin
  -- Authorization
  if not (pg_has_role(v_actor, 'media_moderation', 'member') or app_private.current_user_has_role('administrator', v_actor)) then
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

-- Reject: requires reason, advances awaiting_review -> rejected
create or replace function app_public.media_reject_upload(
  p_upload_id uuid,
  p_admin_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_upload media_private.media_uploads%rowtype;
  v_version bigint;
begin
  -- Authorization
  if not (pg_has_role(v_actor, 'media_moderation', 'member') or app_private.current_user_has_role('administrator', v_actor)) then
    raise exception using errcode='42501', message='moderation_access_denied';
  end if;

  if nullif(pg_catalog.btrim(p_admin_reason), '') is null then
    raise exception using errcode='22023', message='moderation_reason_required';
  end if;

  select * into v_upload from media_private.media_uploads where upload_id = p_upload_id for update;
  if not found then
    raise exception using errcode='22023', message='upload_not_found';
  end if;

  if v_upload.state <> 'awaiting_review' then
    raise exception using errcode='55000', message='upload_not_awaiting_review';
  end if;

  v_version := v_upload.version;

  -- Reject with reason
  update media_private.media_uploads
  set state = 'rejected',
      rejection_reason = pg_catalog.btrim(p_admin_reason),
      rejected_by = v_actor,
      rejected_at = statement_timestamp(),
      version = version + 1
  where upload_id = p_upload_id and version = v_version;

  if not found then
    raise exception using errcode='55000', message='upload_concurrent_modification';
  end if;

  -- Audit trail
  perform partner_private.append_audit(
    'media_rejected', v_actor, v_upload.store_id, 'allowed',
    jsonb_build_object('uploadId', p_upload_id, 'reason', pg_catalog.btrim(p_admin_reason))
  );

  return jsonb_build_object('state', 'rejected', 'uploadId', p_upload_id);
end $$;

-- Grant execute to moderation roles
grant execute on function app_public.media_list_awaiting_review(integer,integer) to media_moderation;
grant execute on function app_public.media_approve_upload(uuid,text) to media_moderation;
grant execute on function app_public.media_reject_upload(uuid,text) to media_moderation;
revoke all on function app_public.media_list_awaiting_review(integer,integer) from public,anon,authenticated,service_role;
revoke all on function app_public.media_approve_upload(uuid,text) from public,anon,authenticated,service_role;
revoke all on function app_public.media_reject_upload(uuid,text) from public,anon,authenticated,service_role;
grant execute on function app_public.media_list_awaiting_review(integer,integer) to media_moderation;
grant execute on function app_public.media_approve_upload(uuid,text) to media_moderation;
grant execute on function app_public.media_reject_upload(uuid,text) to media_moderation;

-- Ensure media_moderation can read media_uploads and stores for queue
grant select on media_private.media_uploads to media_moderation;
grant select on app_public.stores to media_moderation;
grant select on media_private.media_uploads to media_moderation;
grant usage on schema media_private to media_moderation;