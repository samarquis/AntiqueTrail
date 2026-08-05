-- Package 12 operational boundary. This wrapper performs no selection,
-- evidence creation, signing, or automatic promotion. It only converts one
-- exact deployment command into the existing durable private state machine.

grant community_automation to postgres;
grant community_deployment_service to authenticator;
grant create on schema community_private,app_public to community_automation;
grant usage on schema app_public to community_deployment_service;

create or replace function community_private.deployment_payload_exact(
  p_payload jsonb,
  p_keys text[]
) returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(p_payload)='object'
    and (select array_agg(key order by key) from jsonb_object_keys(p_payload) key)
      = (select array_agg(key order by key) from unnest(p_keys) key)
$$;

create or replace function community_private.validate_deployment_payload(
  p_operation text,
  p_payload jsonb
) returns void language plpgsql immutable set search_path='' as $$
declare
  keys text[];
  receipt_key text;
begin
  keys:=case p_operation
    when 'prepare' then array['runId','areaSlug','selectionReceiptId','prerequisiteReceiptId','expectedRootVersion','idempotencyKey']
    when 'freeze' then array['runId','freezeReceiptId','expectedRootVersion','expectedRunVersion','artifactDigest','storeSetDigest','storeIds','idempotencyKey']
    when 'sign' then array['runId','readinessReceiptId','expectedRootVersion','expectedRunVersion','idempotencyKey']
    when 'activate' then array['runId','activationReceiptId','expectedRootVersion','expectedRunVersion','idempotencyKey']
    when 'rollback' then array['runId','rollbackReceiptId','expectedRootVersion','expectedRunVersion','idempotencyKey']
    when 'reactivate' then array['runId','reactivationReceiptId','expectedRootVersion','expectedRunVersion','idempotencyKey']
    when 'cancel' then array['runId','cancellationReceiptId','reason','expectedRootVersion','expectedRunVersion','idempotencyKey']
    else null end;
  if keys is null or not community_private.deployment_payload_exact(p_payload,keys)
    or jsonb_typeof(p_payload->'runId')<>'string'
    or (p_payload->>'runId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_payload->'expectedRootVersion')<>'number'
    or (p_payload->>'expectedRootVersion') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_payload->'idempotencyKey')<>'string'
    or (p_payload->>'idempotencyKey') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='community_command_input_invalid';
  end if;

  if p_operation='prepare' then
    if jsonb_typeof(p_payload->'areaSlug')<>'string'
      or (p_payload->>'areaSlug') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or char_length(p_payload->>'areaSlug')>80
      or jsonb_typeof(p_payload->'selectionReceiptId')<>'string'
      or (p_payload->>'selectionReceiptId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_payload->'prerequisiteReceiptId')<>'string'
      or (p_payload->>'prerequisiteReceiptId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='community_command_input_invalid';
    end if;
    return;
  end if;

  receipt_key:=case p_operation
    when 'freeze' then 'freezeReceiptId'
    when 'sign' then 'readinessReceiptId'
    when 'activate' then 'activationReceiptId'
    when 'rollback' then 'rollbackReceiptId'
    when 'reactivate' then 'reactivationReceiptId'
    when 'cancel' then 'cancellationReceiptId' end;
  if jsonb_typeof(p_payload->'expectedRunVersion')<>'number'
    or (p_payload->>'expectedRunVersion') !~ '^[1-9][0-9]*$'
    or jsonb_typeof(p_payload->receipt_key)<>'string'
    or (p_payload->>receipt_key) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='community_command_input_invalid';
  end if;

  if p_operation='freeze' and (
    jsonb_typeof(p_payload->'artifactDigest')<>'string'
    or (p_payload->>'artifactDigest') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'storeSetDigest')<>'string'
    or (p_payload->>'storeSetDigest') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_payload->'storeIds')<>'array'
    or jsonb_array_length(p_payload->'storeIds')<2
    or exists(select 1 from jsonb_array_elements(p_payload->'storeIds') value
      where jsonb_typeof(value)<>'string' or trim(both '"' from value::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    or (select count(distinct value) from jsonb_array_elements_text(p_payload->'storeIds') value)<>jsonb_array_length(p_payload->'storeIds')
  ) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;

  if p_operation='cancel' and (
    jsonb_typeof(p_payload->'reason')<>'string'
    or p_payload->>'reason'<>btrim(p_payload->>'reason')
    or char_length(p_payload->>'reason') not between 1 and 500
    or p_payload->>'reason' ~ '[[:cntrl:]]'
  ) then raise exception using errcode='22023',message='community_command_input_invalid'; end if;
end $$;

create or replace function app_public.community_deployment_command(
  p_operation text,
  p_payload jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  input_digest bytea;
  result jsonb;
  target_ordinal smallint;
begin
  perform community_private.validate_deployment_payload(p_operation,p_payload);
  input_digest:=extensions.digest(
    convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256'
  );
  case p_operation
    when 'prepare' then
      select (last_activation_ordinal+1)::smallint into target_ordinal
      from community_private.community_expansion_root where root_id=1;
      result:=community_private.prepare_community(
        (p_payload->>'runId')::uuid,p_payload->>'areaSlug',target_ordinal,
        (p_payload->>'selectionReceiptId')::uuid,(p_payload->>'prerequisiteReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,p_payload->>'idempotencyKey',input_digest);
    when 'freeze' then
      result:=community_private.freeze_community(
        (p_payload->>'runId')::uuid,(p_payload->>'freezeReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        decode(p_payload->>'artifactDigest','hex'),decode(p_payload->>'storeSetDigest','hex'),
        array(select value::uuid from jsonb_array_elements_text(p_payload->'storeIds') value),
        p_payload->>'idempotencyKey',input_digest);
    when 'sign' then
      result:=community_private.sign_community_readiness(
        (p_payload->>'runId')::uuid,(p_payload->>'readinessReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        p_payload->>'idempotencyKey',input_digest);
    when 'activate' then
      result:=community_private.activate_community(
        (p_payload->>'runId')::uuid,(p_payload->>'activationReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        p_payload->>'idempotencyKey',input_digest);
    when 'rollback' then
      result:=community_private.rollback_community(
        (p_payload->>'runId')::uuid,(p_payload->>'rollbackReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        p_payload->>'idempotencyKey',input_digest);
    when 'reactivate' then
      result:=community_private.reactivate_community(
        (p_payload->>'runId')::uuid,(p_payload->>'reactivationReceiptId')::uuid,
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        p_payload->>'idempotencyKey',input_digest);
    when 'cancel' then
      result:=community_private.cancel_community(
        (p_payload->>'runId')::uuid,(p_payload->>'cancellationReceiptId')::uuid,p_payload->>'reason',
        (p_payload->>'expectedRootVersion')::bigint,(p_payload->>'expectedRunVersion')::bigint,
        p_payload->>'idempotencyKey',input_digest);
  end case;
  return result;
end $$;

alter function community_private.deployment_payload_exact(jsonb,text[]) owner to community_automation;
alter function community_private.validate_deployment_payload(text,jsonb) owner to community_automation;
alter function app_public.community_deployment_command(text,jsonb) owner to community_automation;

revoke all on function community_private.deployment_payload_exact(jsonb,text[]),
  community_private.validate_deployment_payload(text,jsonb),
  app_public.community_deployment_command(text,jsonb)
  from public,anon,authenticated,service_role,community_deployment_service;
grant execute on function app_public.community_deployment_command(text,jsonb) to community_deployment_service;

revoke create on schema community_private,app_public from community_automation;
revoke community_automation from postgres;
