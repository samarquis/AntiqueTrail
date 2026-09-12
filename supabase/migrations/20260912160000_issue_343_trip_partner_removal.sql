-- Issue #343: creator-authorized, replay-safe removal of one accepted trip partner.

grant create on schema app_public, trip_private to identity_service;

do $wrapper$
begin
  perform set_config('role', 'identity_service', true);

  execute $function$
    create or replace function trip_private.collaboration_json(target_trip_id uuid)
    returns jsonb language sql stable security definer set search_path='' as $$
      select jsonb_build_object(
        'tripId',t.trip_id::text,'tripVersion',t.version,
        'currentUserId',app_public.request_user_id()::text,
        'participants',coalesce((select jsonb_agg(jsonb_build_object(
          'userId',p.user_id::text,
          'displayName',case when p.participant_role='creator' then 'Trip creator' else 'Trip partner' end,
          'role',p.participant_role,
          'membershipVersion',p.version) order by p.participant_role,p.joined_at)
          from trip_private.trip_participants p
          where p.trip_id=t.trip_id and p.state='active'),'[]'::jsonb),
        'navigatorUserId',t.navigator_user_id::text,
        'invitation',(select jsonb_build_object(
          'id',i.invitation_id::text,'state',i.state,'expiresAt',i.expires_at::text)
          from trip_private.trip_invitations i
          where i.trip_id=t.trip_id order by i.created_at desc limit 1)
      ) from trip_private.trips t where t.trip_id=target_trip_id;
    $$
  $function$;

  execute $function$
    create or replace function app_public.remove_trip_partner(
      trip_id text,
      partner_id text,
      membership_version bigint,
      expected_version bigint,
      idempotency_key text
    )
    returns jsonb language plpgsql security definer set search_path='' as $$
    declare
      v_trip uuid;
      v_partner uuid;
      v_current_version bigint;
      v_trip_version bigint;
      v_prior jsonb;
      v_result jsonb;
    begin
      begin
        v_trip:=trip_id::uuid;
        v_partner:=partner_id::uuid;
      exception when others then
        raise exception 'trip_partner_removal_invalid';
      end;
      if membership_version is null or membership_version<1
        or expected_version is null or expected_version<1
        or idempotency_key is null or char_length(idempotency_key) not between 1 and 128
        or idempotency_key~'[[:cntrl:]]' then
        raise exception 'trip_partner_removal_invalid';
      end if;
      if not trip_private.trip_owner_can_access(v_trip) then
        raise exception 'authorization_lost';
      end if;

      select r.result_metadata into v_prior
      from trip_private.trip_mutation_receipts r
      where r.trip_id=v_trip and r.idempotency_key=remove_trip_partner.idempotency_key;
      if found then return v_prior; end if;

      select t.version into v_trip_version
      from trip_private.trips t
      where t.trip_id=v_trip and t.state in ('draft','ready','active')
      for update;
      if v_trip_version is null then raise exception 'authorization_lost'; end if;
      if v_trip_version<>expected_version then
        v_result:=jsonb_build_object(
          'state','conflict',
          'latest',jsonb_build_object('tripVersion',v_trip_version));
        insert into trip_private.trip_mutation_receipts(
          trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata)
        values(
          v_trip,remove_trip_partner.idempotency_key,remove_trip_partner.expected_version,
          'conflict',v_trip_version,v_result);
        return v_result;
      end if;

      select p.version into v_current_version
      from trip_private.trip_participants p
      where p.trip_id=v_trip and p.user_id=v_partner
        and p.participant_role='partner' and p.state='active'
      for update;
      if v_current_version is null or v_current_version<>membership_version then
        raise exception 'trip_partner_unavailable';
      end if;

      update trip_private.trips t
      set navigator_user_id=case when t.navigator_user_id=v_partner then null else t.navigator_user_id end,
          navigator_device_hash=case when t.navigator_user_id=v_partner then null else t.navigator_device_hash end,
          version=t.version+1,
          updated_at=statement_timestamp()
      where t.trip_id=v_trip;

      update trip_private.trip_device_bindings b
      set state='revoked',revoked_at=statement_timestamp(),revocation_reason='partner_removed'
      where b.trip_id=v_trip and b.user_id=v_partner and b.state='active';

      update trip_private.trip_offline_grants g
      set state='revoked',revoked_at=statement_timestamp()
      where g.trip_id=v_trip and g.user_id=v_partner and g.state='active';

      update trip_private.offline_grant_signing_receipts r
      set state='revoked'
      where r.trip_id=v_trip and r.user_id=v_partner and r.state='ready';

      update trip_private.trip_participants p
      set state='revoked',left_at=statement_timestamp(),version=p.version+1
      where p.trip_id=v_trip and p.user_id=v_partner
        and p.participant_role='partner' and p.state='active'
        and p.version=membership_version;
      if not found then
        raise exception 'trip_partner_unavailable';
      end if;

      v_result:=jsonb_build_object(
        'state','applied',
        'collaboration',trip_private.collaboration_json(v_trip));
      insert into trip_private.trip_mutation_receipts(
        trip_id,idempotency_key,base_version,result_state,resulting_version,result_metadata)
      values(
        v_trip,remove_trip_partner.idempotency_key,remove_trip_partner.expected_version,
        'applied',v_trip_version+1,v_result);
      return v_result;
    end;
    $$
  $function$;

  execute 'revoke all on function app_public.remove_trip_partner(text,text,bigint,bigint,text) from public, anon';
  execute 'grant execute on function app_public.remove_trip_partner(text,text,bigint,bigint,text) to authenticated';

  perform set_config('role', 'none', true);
end;
$wrapper$;

revoke create on schema app_public, trip_private from identity_service;
