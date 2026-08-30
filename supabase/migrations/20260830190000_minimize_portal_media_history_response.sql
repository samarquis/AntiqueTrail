-- Portal media history is a representative-facing operational response, not a
-- storage diagnostic. Keep its projection mechanically limited to the six
-- fields required by Package 13 and the rejected-media resubmission flow.
-- The shared scope helper is already owned by this restricted service role.
-- Migrations run as supabase_admin, so assume the owner before replacing it.
grant usage,create on schema portal_private,app_public to identity_service;
set role identity_service;
-- Repair the shared Portal scope resolver before using it here. PostgreSQL has
-- no min(uuid), and the prior aggregate therefore failed before authorization
-- could yield its generic denial. The exact-count test permits one scoped grant
-- and denies zero or multiple grants.
create or replace function portal_private.require_portal_scope()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid; has_exactly_one_scope boolean;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or not partner_private.partner_consent_is_current(actor) then raise exception using errcode='42501',message='portal_unavailable'; end if;
  select count(*)=1, (array_agg(g.store_id))[1] into has_exactly_one_scope, target
    from partner_private.store_partner_grants g
    join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
    join app_public.stores s on s.id=g.store_id
    cross join app_private.environment_stage e
    where g.auth_user_id=actor and g.state='active'
      and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id)
      and ((s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
        or (not s.synthetic and s.audience='regional_readiness' and e.id=1 and e.stage='private_beta')
        or (not s.synthetic and s.audience='public' and e.id=1 and e.stage='regional_public'));
  if not coalesce(has_exactly_one_scope,false) or target is null then raise exception using errcode='42501',message='portal_unavailable'; end if;
  return target;
end $$;

create or replace function app_public.portal_list_media_uploads()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_store_id uuid := portal_private.require_portal_scope();
  v_result jsonb;
begin
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

reset role;
revoke create on schema portal_private,app_public from identity_service;
