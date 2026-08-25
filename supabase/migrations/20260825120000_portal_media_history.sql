-- Package 13: Store Portal media upload history with rejection reasons and resubmit.

-- Portal: list media uploads for the store with rejection reasons and resubmit support
create or replace function app_public.portal_list_media_uploads()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := app_public.request_user_id();
  v_store_id uuid;
  v_result jsonb;
begin
  -- Authorization: store partner grant required
  select store_id into v_store_id
  from partner_private.store_partner_grants
  where auth_user_id = v_actor and state = 'active'
  limit 1;

  if v_store_id is null then
    raise exception using errcode='42501', message='portal_access_denied';
  end if;

  select jsonb_agg(to_jsonb(r) order by r.submitted_at desc)
  into v_result
  from (
    select
      mu.upload_id,
      mu.kind,
      mu.state,
      mu.alt_text,
      mu.original_object_key,
      mu.derivative_object_key,
      mu.created_at as submitted_at,
      mu.rejection_reason,
      mu.approved_at,
      mu.rejected_at,
      mu.width as derivative_width,
      mu.height as derivative_height
    from media_private.media_uploads mu
    where mu.store_id = v_store_id
    order by mu.created_at desc
  ) r;

  return coalesce(v_result, '[]'::jsonb);
end $$;

grant execute on function app_public.portal_list_media_uploads() to authenticated;
revoke all on function app_public.portal_list_media_uploads() from public,anon,service_role;
grant execute on function app_public.portal_list_media_uploads() to authenticated;

comment on function app_public.portal_list_media_uploads() is
  'Portal: list all media uploads for the store with rejection reasons and resubmit eligibility.
   Returns array of {uploadId, kind, state, altText, originalObjectKey, derivativeObjectKey, submittedAt, rejectionReason, approvedAt, rejectedAt, derivativeWidth, derivativeHeight}.';