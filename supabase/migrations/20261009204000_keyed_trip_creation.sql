create table trip_private.trip_create_receipts (
  actor_user_id uuid not null references app_private.profiles(user_id) on delete cascade,
  idempotency_key uuid not null,
  payload_digest bytea not null,
  trip_id uuid references trip_private.trips(trip_id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  primary key(actor_user_id,idempotency_key),
  constraint trip_create_receipt_digest_size check (octet_length(payload_digest)=32)
);

alter table trip_private.trip_create_receipts enable row level security;
alter table trip_private.trip_create_receipts force row level security;
revoke all on trip_private.trip_create_receipts from public,anon,authenticated,service_role;
grant select,insert on trip_private.trip_create_receipts to identity_service;
create policy identity_service_trip_create_receipts on trip_private.trip_create_receipts
  for all to identity_service using (true) with check (true);

create function app_public.create_trip(name text,local_date text,idempotency_key uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,trip_private,app_public,app_private,auth,extensions as $$
declare
  v_actor uuid;
  v_key uuid:=idempotency_key;
  v_trip_id uuid;
  v_area_id uuid;
  v_date date;
  v_digest bytea;
  v_receipt trip_private.trip_create_receipts%rowtype;
begin
  if not app_private.current_session_is_active() then raise exception 'authorization_lost'; end if;
  v_actor:=app_public.request_user_id();
  if v_key is null then
    raise exception using errcode='22023',message='trip_create_idempotency_key_required';
  end if;
  if name is null or name<>btrim(name) or char_length(name) not between 1 and 80
    or name ~ '[[:cntrl:]]' then raise exception 'trip_name_invalid'; end if;
  begin v_date:=local_date::date; exception when others then raise exception 'trip_date_invalid'; end;

  v_digest:=extensions.digest(convert_to(jsonb_build_array(name,v_date)::text,'utf8'),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text||':'||v_key::text,0));

  select * into v_receipt from trip_private.trip_create_receipts
    where actor_user_id=v_actor and trip_create_receipts.idempotency_key=v_key
    for update;
  if found then
    if v_receipt.payload_digest is distinct from v_digest then
      raise exception 'trip_create_idempotency_conflict';
    end if;
    if v_receipt.trip_id is null then raise exception 'trip_create_result_deleted'; end if;
    return trip_private.trip_command_json(v_receipt.trip_id);
  end if;

  select id into v_area_id from app_public.catalog_areas order by sort_order,slug limit 1;
  if v_area_id is null then raise exception 'trip_area_unavailable'; end if;
  insert into trip_private.trips(owner_id,area_id,name,local_date)
    values(v_actor,v_area_id,name,v_date) returning trip_id into v_trip_id;
  insert into trip_private.trip_participants(trip_id,user_id,participant_role)
    values(v_trip_id,v_actor,'creator');
  insert into trip_private.trip_create_receipts(actor_user_id,idempotency_key,payload_digest,trip_id)
    values(v_actor,v_key,v_digest,v_trip_id);
  return trip_private.trip_command_json(v_trip_id);
end;
$$;

grant create on schema app_public to identity_service;
alter function app_public.create_trip(text,text,uuid) owner to identity_service;
revoke create on schema app_public from identity_service;
revoke all on function app_public.create_trip(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function app_public.create_trip(text,text,uuid) to authenticated;
