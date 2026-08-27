-- Repair media-history columns and function output for databases that already
-- ran the original Package 13 migrations before the contract was corrected.
alter table media_private.media_uploads
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz;

alter table media_private.media_uploads drop constraint if exists media_uploads_approval_reason_check;
alter table media_private.media_uploads
  add constraint media_uploads_approval_reason_check
  check (approval_reason is null or char_length(btrim(approval_reason)) between 1 and 240);

create or replace function app_public.portal_list_media_uploads()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_store_id uuid;
  v_result jsonb;
begin
  select store_id into v_store_id
  from partner_private.store_partner_grants
  where auth_user_id = v_actor and state = 'active'
  limit 1;

  if v_store_id is null then
    raise exception using errcode='42501', message='portal_access_denied';
  end if;

  select jsonb_build_object(
    'uploads',
    coalesce(jsonb_agg(jsonb_build_object(
      'uploadId', r.upload_id,
      'kind', r.kind,
      'state', r.state,
      'altText', r.alt_text,
      'originalObjectKey', r.original_object_key,
      'derivativeObjectKey', r.derivative_object_key,
      'submittedAt', r.submitted_at,
      'rejectionReason', r.rejection_reason,
      'approvedAt', r.approved_at,
      'rejectedAt', r.rejected_at,
      'derivativeWidth', r.derivative_width,
      'derivativeHeight', r.derivative_height
    ) order by r.submitted_at desc), '[]'::jsonb)
  ) into v_result
  from (
    select
      mu.upload_id,
      mu.kind,
      mu.state,
      mu.alt_text,
      mu.original_object_key,
      mu.private_derivative_object_key as derivative_object_key,
      mu.created_at as submitted_at,
      mu.rejection_reason,
      mu.approved_at,
      mu.rejected_at,
      mu.derivative_width,
      mu.derivative_height
    from media_private.media_uploads mu
    where mu.store_id = v_store_id
  ) r;

  return coalesce(v_result, jsonb_build_object('uploads', '[]'::jsonb));
end $$;

revoke all on function app_public.portal_list_media_uploads() from public, anon, service_role;
grant execute on function app_public.portal_list_media_uploads() to authenticated;
