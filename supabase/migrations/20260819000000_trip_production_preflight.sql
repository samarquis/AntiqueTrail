-- A trip grant can enter authoritative state only from a ready signer preflight receipt.
grant identity_service to postgres;
grant create on schema trip_private to identity_service;

create or replace function trip_private.guard_offline_grant_preflight()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(
    select 1 from trip_private.offline_grant_signing_receipts r
    where r.trip_id=new.trip_id and r.user_id=new.user_id
      and r.session_security_version=new.session_security_version
      and r.signed_grant_hash=new.grant_hash and r.state='ready'
      and r.expires_at=new.expires_at and r.expires_at>statement_timestamp()
      and extensions.digest(convert_to(r.signed_grant->'claims'->>'deviceId','utf8'),'sha256')=new.device_hash
  ) then raise exception 'offline_grant_preflight_required'; end if;
  return new;
end; $$;
alter function trip_private.guard_offline_grant_preflight() owner to identity_service;
revoke all on function trip_private.guard_offline_grant_preflight() from public,anon,authenticated;

drop trigger if exists trip_offline_grant_preflight_guard on trip_private.trip_offline_grants;
create trigger trip_offline_grant_preflight_guard before insert on trip_private.trip_offline_grants
for each row execute function trip_private.guard_offline_grant_preflight();

revoke all on function app_public.start_trip(text),app_public.start_trip_with_offline_grant(text,text,text),app_public.transfer_navigator_device(text,text,text) from public,anon;
grant execute on function app_public.start_trip(text),app_public.start_trip_with_offline_grant(text,text,text),app_public.transfer_navigator_device(text,text,text) to authenticated;

revoke create on schema trip_private from identity_service;
revoke identity_service from postgres;
