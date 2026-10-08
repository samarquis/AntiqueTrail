create temporary table issue577_prior_identity_service_membership on commit drop as
select 1 as present
where exists (
  select 1 from pg_auth_members
  where roleid='identity_service'::regrole and member='postgres'::regrole
);
grant identity_service to postgres;
grant create on schema app_public to identity_service;

set role identity_service;
alter function app_public.build_account_export_canonical_json(uuid,uuid)
  rename to build_account_export_before_private_stops;
revoke all on function app_public.build_account_export_before_private_stops(uuid,uuid)
  from public,anon,authenticated;
reset role;

create or replace function app_public.build_account_export_canonical_json(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare
  canonical jsonb;
  export_user_id uuid;
  location text;
  private_stops jsonb;
  visit_memories jsonb;
begin
  canonical:=app_public.build_account_export_before_settings(p_job_id,p_claim_token)::jsonb;

  select j.user_id,p.private_location_address
    into export_user_id,location
    from app_private.account_export_jobs as j
    join app_private.profiles as p on p.user_id=j.user_id
   where j.export_job_id=p_job_id and j.state='building'
     and j.claim_token=p_claim_token and j.lease_expires_at>statement_timestamp();
  if not found then
    raise exception using errcode='42501',message='account_export_claim_invalid';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'tripId',t.trip_id,
    'stopId',s.stop_id,
    'kind',s.kind,
    'label',s.private_name,
    'address',case when t.state='completed' then null else s.private_address end,
    'sourceUrl',s.private_source_url,
    'shopperHours',s.private_hours,
    'destination',s.destination_status,
    'position',s.position,
    'priority',s.priority,
    'plannedDwellMinutes',s.planned_dwell_minutes,
    'state',s.state,
    'completedAt',s.completed_at,
    'version',s.version
  ) order by t.trip_id,s.position,s.stop_id),'[]'::jsonb)
    into private_stops
    from trip_private.trips as t
    join trip_private.trip_stops as s on s.trip_id=t.trip_id
   where t.owner_id=export_user_id and s.kind='private';

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'memoryId',m.memory_id,
    'tripId',m.trip_id,
    'stopId',m.stop_id,
    'storeId',m.store_id,
    'privateStopId',m.private_stop_id,
    'privateStopName',m.private_stop_name,
    'privateStopAddress',m.private_stop_address,
    'rating',m.rating,
    'returnChoice',m.return_choice,
    'note',m.note,
    'version',m.version,
    'createdAt',m.created_at,
    'updatedAt',m.updated_at
  ) order by m.trip_id,m.memory_id),'[]'::jsonb)
    into visit_memories
    from trip_private.trip_visit_memories as m
   where m.author_user_id=export_user_id;

  canonical:=pg_catalog.jsonb_set(canonical,'{shopper,privateStops}',private_stops,true);
  canonical:=pg_catalog.jsonb_set(canonical,'{shopper,visitMemories}',visit_memories,true);
  canonical:=pg_catalog.jsonb_set(
    canonical,'{profile,locationAddress}',coalesce(pg_catalog.to_jsonb(location),'null'::jsonb),true
  );
  return canonical::text;
end; $$;

alter function app_public.build_account_export_canonical_json(uuid,uuid) owner to identity_service;
revoke create on schema app_public from identity_service;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid)
  from public,anon,authenticated;
grant execute on function app_public.build_account_export_canonical_json(uuid,uuid) to identity_service;

do $cleanup$
begin
  if not exists (select 1 from pg_temp.issue577_prior_identity_service_membership) then
    execute 'revoke identity_service from postgres';
  end if;
end;
$cleanup$;
