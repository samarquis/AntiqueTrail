grant create on schema app_public to identity_service;

alter table app_private.profiles
  add column if not exists private_location_address text;

alter table app_private.profiles
  add constraint profiles_location_address_safe check (
    private_location_address is null
    or (
      private_location_address = pg_catalog.btrim(private_location_address)
      and pg_catalog.char_length(private_location_address) between 1 and 320
      and private_location_address !~ '[[:cntrl:]]'
    )
  );

grant update on app_private.profiles to identity_service;

create or replace function app_public.account_get_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare profile_row app_private.profiles%rowtype;
begin
  if not app_private.current_session_is_active() then
    raise exception using errcode='42501', message='account_settings_access_denied';
  end if;
  select * into profile_row
  from app_private.profiles
  where user_id=app_public.request_user_id();
  if not found then
    raise exception using errcode='42501', message='account_settings_access_denied';
  end if;
  return jsonb_build_object(
    'displayName', profile_row.public_display_name,
    'locationAddress', profile_row.private_location_address
  );
end; $$;

create or replace function app_public.account_update_settings(
  p_display_name text,
  p_location_address text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  normalized_display_name text := nullif(pg_catalog.btrim(coalesce(p_display_name, '')), '');
  normalized_location_address text := nullif(pg_catalog.btrim(coalesce(p_location_address, '')), '');
  profile_row app_private.profiles%rowtype;
begin
  if not app_private.current_session_is_active() then
    raise exception using errcode='42501', message='account_settings_access_denied';
  end if;
  if normalized_display_name is not null and (
    pg_catalog.char_length(normalized_display_name) > 80
    or normalized_display_name ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode='22023', message='invalid_display_name';
  end if;
  if normalized_location_address is not null and (
    pg_catalog.char_length(normalized_location_address) > 320
    or normalized_location_address ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode='22023', message='invalid_location_address';
  end if;
  update app_private.profiles
  set public_display_name=normalized_display_name,
      private_location_address=normalized_location_address,
      updated_at=statement_timestamp(),
      version=version+1
  where user_id=app_public.request_user_id()
  returning * into profile_row;
  if not found then
    raise exception using errcode='42501', message='account_settings_access_denied';
  end if;
  return jsonb_build_object(
    'displayName', profile_row.public_display_name,
    'locationAddress', profile_row.private_location_address
  );
end; $$;

alter function app_public.account_get_settings() owner to identity_service;
alter function app_public.account_update_settings(text,text) owner to identity_service;
revoke all on function app_public.account_get_settings() from public, anon;
revoke all on function app_public.account_update_settings(text,text) from public, anon;
grant execute on function app_public.account_get_settings() to authenticated;
grant execute on function app_public.account_update_settings(text,text) to authenticated;

alter function app_public.build_account_export_canonical_json(uuid,uuid)
  rename to build_account_export_before_settings;
revoke all on function app_public.build_account_export_before_settings(uuid,uuid)
  from public,anon,authenticated;

create or replace function app_public.build_account_export_canonical_json(p_job_id uuid,p_claim_token uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare canonical jsonb; location text;
begin
  canonical:=app_public.build_account_export_before_settings(p_job_id,p_claim_token)::jsonb;
  select p.private_location_address into location
  from app_private.account_export_jobs j
  join app_private.profiles p on p.user_id=j.user_id
  where j.export_job_id=p_job_id and j.claim_token=p_claim_token;
  return pg_catalog.jsonb_set(
    canonical,'{profile,locationAddress}',coalesce(pg_catalog.to_jsonb(location),'null'::jsonb),true
  )::text;
end; $$;
alter function app_public.build_account_export_canonical_json(uuid,uuid) owner to identity_service;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid)
  from public,anon,authenticated;
grant execute on function app_public.build_account_export_canonical_json(uuid,uuid) to identity_service;
revoke create on schema app_public from identity_service;
