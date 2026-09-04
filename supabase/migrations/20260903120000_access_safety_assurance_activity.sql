-- Issue #130: expose exact representative assurance, scope dates, and
-- minimized recent privileged activity in the Access & Safety projection.
-- The 4-arg preview/change scope contract is unchanged.

grant create on schema app_public to identity_service;
grant select on app_private.profiles, app_private.active_sessions, app_private.privileged_audit_events to identity_service;

create or replace function app_public.admin_list_store_scopes()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'grantId',g.grant_id,
      'subjectUserId',g.auth_user_id,
      'subjectLabel',coalesce(nullif(p.public_display_name,''),'Store representative'),
      'storeId',g.store_id,
      'storeLabel',s.name,
      'state',g.state,
      'version',g.version,
      'verifiedEmail',app_private.provider_user_is_confirmed(g.auth_user_id),
      'mfaVerified',app_private.provider_user_has_verified_mfa(g.auth_user_id),
      'grantedAt',g.granted_at,
      'revokedAt',g.revoked_at,
      'recentActivity',coalesce((select jsonb_agg(item)
        from (
          select jsonb_build_object('action',e.action,'outcome',e.outcome,'occurredAt',e.occurred_at) as item
          from app_private.privileged_audit_events e
          where e.resource_id=g.grant_id and e.occurred_at>=statement_timestamp()-interval '90 days'
          order by e.occurred_at desc,e.sequence_no desc
          limit 5
        ) activity),'[]'::jsonb))
      order by s.name,g.granted_at desc)
    from partner_private.store_partner_grants g
    join app_public.stores s on s.id=g.store_id
    left join app_private.profiles p on p.user_id=g.auth_user_id
    where g.grant_id=(select x.grant_id from partner_private.store_partner_grants x
      where x.auth_user_id=g.auth_user_id and x.store_id=g.store_id
      order by x.granted_at desc,x.grant_id desc limit 1)),'[]'::jsonb);
end $$;
alter function app_public.admin_list_store_scopes() owner to identity_service;
revoke all on function app_public.admin_list_store_scopes() from public,anon;
grant execute on function app_public.admin_list_store_scopes() to authenticated;

revoke create on schema app_public from identity_service;
