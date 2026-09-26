-- Account-scoped retry receipts retain no display name or private address.
create table app_private.account_settings_receipts (
  user_id uuid not null references app_private.profiles(user_id) on delete cascade,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  input_digest bytea not null check (octet_length(input_digest)=32),
  result_version bigint not null check (result_version>0),
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id,idempotency_key)
);
alter table app_private.account_settings_receipts enable row level security;
alter table app_private.account_settings_receipts force row level security;
revoke all on app_private.account_settings_receipts from public,anon,authenticated;
grant select,insert on app_private.account_settings_receipts to identity_service;
create policy identity_service_settings_receipts on app_private.account_settings_receipts
  for all to identity_service using (true) with check (true);

grant create on schema app_public to identity_service;
create or replace function app_public.account_get_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile_row app_private.profiles%rowtype;
begin
  if not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  select * into profile_row from app_private.profiles where user_id=app_public.request_user_id();
  if not found then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  return jsonb_build_object('displayName',profile_row.public_display_name,
    'locationAddress',profile_row.private_location_address,'version',profile_row.version);
end; $$;

-- Old clients must reload rather than bypass the version check.
drop function app_public.account_update_settings(text,text);
create function app_public.account_update_settings(
  p_display_name text,p_location_address text,p_expected_version bigint,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := app_public.request_user_id();
  profile_row app_private.profiles%rowtype;
  receipt app_private.account_settings_receipts%rowtype;
  normalized_name text := nullif(pg_catalog.btrim(coalesce(p_display_name,'')),'');
  normalized_address text := nullif(pg_catalog.btrim(coalesce(p_location_address,'')),'');
  request_digest bytea;
begin
  if not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  if p_expected_version is null or p_expected_version<=0 or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  if normalized_name is not null and
    (pg_catalog.char_length(normalized_name)>80 or normalized_name ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='invalid_display_name';
  end if;
  if normalized_address is not null and
    (pg_catalog.char_length(normalized_address)>320 or normalized_address ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='invalid_location_address';
  end if;
  select * into profile_row from app_private.profiles where user_id=actor for update;
  if not found or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  request_digest := extensions.digest(convert_to(jsonb_build_object(
    'displayName',normalized_name,'locationAddress',normalized_address,'version',p_expected_version
  )::text,'UTF8'),'sha256');
  select * into receipt from app_private.account_settings_receipts
    where user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if receipt.input_digest<>request_digest then
      return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',profile_row.version));
    end if;
    -- Reconstruct prior success from the digest-verified request; never restore its values.
    return jsonb_build_object('displayName',normalized_name,'locationAddress',normalized_address,
      'version',receipt.result_version);
  end if;
  if profile_row.version<>p_expected_version then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',profile_row.version));
  end if;
  update app_private.profiles set public_display_name=normalized_name,
    private_location_address=normalized_address,updated_at=statement_timestamp(),version=version+1
    where user_id=actor returning * into profile_row;
  insert into app_private.account_settings_receipts(user_id,idempotency_key,input_digest,result_version)
    values(actor,p_idempotency_key,request_digest,profile_row.version);
  return jsonb_build_object('displayName',normalized_name,'locationAddress',normalized_address,
    'version',profile_row.version);
end; $$;
alter function app_public.account_get_settings() owner to identity_service;
alter function app_public.account_update_settings(text,text,bigint,text) owner to identity_service;
revoke all on function app_public.account_get_settings() from public,anon;
revoke all on function app_public.account_update_settings(text,text,bigint,text) from public,anon;
grant execute on function app_public.account_get_settings() to authenticated;
grant execute on function app_public.account_update_settings(text,text,bigint,text) to authenticated;
revoke create on schema app_public from identity_service;
