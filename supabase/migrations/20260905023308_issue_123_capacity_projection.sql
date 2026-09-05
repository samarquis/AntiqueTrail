-- Read-only status remains available with M-01 off; this grants no upload capability.
grant media_automation to postgres;
grant create on schema app_public to media_automation;
set role media_automation;
create function app_public.portal_get_media_capacity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid:=portal_private.require_portal_scope(); photo_cap integer; approved_count integer;
begin
  photo_cap:=partner_private.resolve_store_photo_cap(target);
  select count(*) into approved_count from media_private.media_uploads
    where store_id=target and kind='gallery' and state in ('approved_pending_publish','published');
  return jsonb_build_object(
    'currentTier',case photo_cap when 5 then 'free' when 15 then 'gallery' else 'full_gallery' end,
    'approvedCount',approved_count,'cap',photo_cap);
end $$;
revoke all on function app_public.portal_get_media_capacity() from public,anon,service_role;
grant execute on function app_public.portal_get_media_capacity() to authenticated;
reset role;
revoke create on schema app_public from media_automation;
revoke media_automation from postgres;
