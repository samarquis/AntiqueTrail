-- The Store Information form sends a complete managed-field object. Return the approved
-- values from the already scoped Portal home RPC so a partial edit cannot blank the rest.
create or replace function app_public.portal_get_home()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid:=portal_private.require_portal_scope(); s app_public.stores%rowtype; p portal_private.store_profiles%rowtype; freshness text; verified timestamptz; source text;
begin
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select * into s from app_public.stores where id=target;
  select * into p from portal_private.store_profiles where store_id=target;
  select f.freshness_state,f.oldest_verified_at into freshness,verified from app_public.catalog_freshness(target,statement_timestamp()) f;
  select coalesce(min(v.provenance_label),'Store representative confirmation') into source from app_public.store_fact_verifications v where v.store_id=target;
  return jsonb_build_object('store',jsonb_build_object('id',s.id,'name',s.name,'listingState',p.listing_state,'timeZone',s.timezone_name),
    'freshness',jsonb_strip_nulls(jsonb_build_object('state',case freshness when 'current' then 'verified' when 'overdue' then 'overdue' when 'stale' then 'stale' else 'unknown' end,
      'label',case freshness when 'current' then 'Verified' when 'overdue' then 'Verification overdue' when 'stale' then 'Verification required' else 'Verification date unavailable' end,
      'verifiedAt',verified,'daysSinceVerification',case when verified is null then null else greatest(0,floor(extract(epoch from statement_timestamp()-verified)/86400)::int) end)),
    'provenance',jsonb_build_object('sourceLabel',source,'verifiedBy','Store representative','verifiedAt',coalesce(verified,statement_timestamp()),'ownerConfirmed',exists(select 1 from app_public.store_fact_verifications v where v.store_id=target and v.verifier_kind='store_partner')),
    'pendingChanges',coalesce((select jsonb_agg(portal_private.controlled_change_json(c.change_id) order by c.submitted_at) from portal_private.controlled_changes c where c.store_id=target and c.state in ('pending','changes_requested')),'[]'::jsonb),
    'managedFields',jsonb_build_object('phone',coalesce(s.phone,''),'website',coalesce(s.website,''),'description',coalesce(s.description,'')));
end $$;
alter function app_public.portal_get_home() owner to identity_service;

revoke all on function app_public.portal_get_home() from public,anon;
grant execute on function app_public.portal_get_home() to authenticated;
