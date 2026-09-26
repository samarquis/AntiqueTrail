-- Retry keys identify commands; receipts retain no payload-derived private data.
alter table app_private.account_settings_receipts drop column input_digest;

create or replace function app_public.account_update_settings(
  p_display_name text,p_location_address text,p_expected_version bigint,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid := app_public.request_user_id();
  profile_row app_private.profiles%rowtype;
  receipt app_private.account_settings_receipts%rowtype;
  normalized_name text := nullif(pg_catalog.btrim(coalesce(p_display_name,'')),'');
  normalized_address text := nullif(pg_catalog.btrim(coalesce(p_location_address,'')),'');
begin
  if not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  if p_expected_version is null or p_expected_version<=0 or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='validation_failed';
  end if;
  select * into profile_row from app_private.profiles where user_id=actor for update;
  if not found or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='account_settings_access_denied';
  end if;
  select * into receipt from app_private.account_settings_receipts
    where user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('state','saved','version',receipt.result_version);
  end if;
  if normalized_name is not null and
    (pg_catalog.char_length(normalized_name)>80 or normalized_name ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='invalid_display_name';
  end if;
  if normalized_address is not null and
    (pg_catalog.char_length(normalized_address)>320 or normalized_address ~ '[[:cntrl:]]') then
    raise exception using errcode='22023',message='invalid_location_address';
  end if;
  if profile_row.version<>p_expected_version then
    return jsonb_build_object('state','conflict','latest',jsonb_build_object('version',profile_row.version));
  end if;
  update app_private.profiles set public_display_name=normalized_name,
    private_location_address=normalized_address,updated_at=statement_timestamp(),version=version+1
    where user_id=actor returning * into profile_row;
  insert into app_private.account_settings_receipts(user_id,idempotency_key,result_version)
    values(actor,p_idempotency_key,profile_row.version);
  return jsonb_build_object('state','saved','version',profile_row.version);
end; $$;
