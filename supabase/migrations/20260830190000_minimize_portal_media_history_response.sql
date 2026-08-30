-- Portal media history is a representative-facing operational response, not a
-- storage diagnostic. Keep its projection mechanically limited to the six
-- fields required by Package 13 and the rejected-media resubmission flow.
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
      'uploadId', mu.upload_id,
      'kind', mu.kind,
      'state', mu.state,
      'altText', mu.alt_text,
      'submittedAt', mu.created_at,
      'rejectionReason', mu.rejection_reason
    ) order by mu.created_at desc, mu.upload_id desc), '[]'::jsonb)
  ) into v_result
  from media_private.media_uploads mu
  where mu.store_id = v_store_id;

  return coalesce(v_result, jsonb_build_object('uploads', '[]'::jsonb));
end $$;

revoke all on function app_public.portal_list_media_uploads() from public, anon, service_role;
grant execute on function app_public.portal_list_media_uploads() to authenticated;

comment on function app_public.portal_list_media_uploads() is
  'Returns only {uploadId, kind, state, altText, submittedAt, rejectionReason} for the caller active Store Portal grant; no storage identifiers or media metadata.';
