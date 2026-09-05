-- Reject missing and JSON-null payload fields without SQL three-valued-logic gaps.
create or replace function research_private.synthetic_owner_payload(
  p_operation text,p_payload jsonb,p_intake research_private.owner_intakes default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare d jsonb; k text:=coalesce(p_intake.kind,p_payload->>'kind'); keys text[];
begin
  if p_operation is null or p_operation not in ('start','save','resume','submit','status')
    or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid'; end if;
  select array_agg(key order by key) into keys from jsonb_object_keys(p_payload) key;
  if p_operation='start' then
    if keys is distinct from array['kind'] or coalesce(k,'') not in ('existing_claim','add_store') then raise exception 'invalid'; end if;
    return jsonb_build_object('kind',k,'initialDraft',jsonb_build_object(
      'fixture',case when k='existing_claim' then 'existing-store-a' else 'new-store-a' end,
      'relationship','owner','ownerFactsConfirmed',false,'reviewedFactsUnderstood',false));
  elsif p_operation='save' then
    if keys is distinct from array['draft'] then raise exception 'invalid'; end if; d:=p_payload->'draft';
    if jsonb_typeof(d) is distinct from 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(d) key) is distinct from array['fixture','ownerFactsConfirmed','relationship','reviewedFactsUnderstood']
      or coalesce(d->>'relationship','') not in ('owner','manager')
      or jsonb_typeof(d->'ownerFactsConfirmed') is distinct from 'boolean' or jsonb_typeof(d->'reviewedFactsUnderstood') is distinct from 'boolean'
      or (k='existing_claim' and d->>'fixture' is distinct from 'existing-store-a') or (k='add_store' and d->>'fixture' is distinct from 'new-store-a') then raise exception 'invalid'; end if;
    return p_payload;
  elsif p_operation='submit' then
    if coalesce(keys,array[]::text[])<>array[]::text[] or p_intake.run_id is null
      or (p_intake.draft->>'ownerFactsConfirmed')::boolean is not true
      or (p_intake.draft->>'reviewedFactsUnderstood')::boolean is not true then raise exception 'invalid'; end if;
  elsif coalesce(keys,array[]::text[])<>array[]::text[] then raise exception 'invalid'; end if;
  return p_payload;
end $$;

create or replace function research_private.public_owner_payload(
  p_operation text,p_payload jsonb,p_intake research_private.owner_intakes default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare d jsonb; k text:=coalesce(p_intake.kind,p_payload->>'kind'); keys text[]; expected text[];
begin
  if p_operation is null or p_operation not in ('start','save','resume','submit','status')
    or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid'; end if;
  select array_agg(key order by key) into keys from jsonb_object_keys(p_payload) key;
  if p_operation='start' then
    if keys is distinct from array['kind'] or coalesce(k,'') not in ('existing_claim','add_store') then raise exception 'invalid'; end if;
    d:=jsonb_build_object('relationship','owner','ownerFactsConfirmed',false,'reviewedFactsUnderstood',false);
    if k='existing_claim' then d:=d||jsonb_build_object('storeId','');
    else d:=d||jsonb_build_object('storeName','','address','','website','','description',''); end if;
    return jsonb_build_object('kind',k,'initialDraft',d);
  elsif p_operation='save' then
    if keys is distinct from array['draft'] or p_intake.run_id is null then raise exception 'invalid'; end if; d:=p_payload->'draft';
    expected:=case when k='existing_claim' then array['ownerFactsConfirmed','relationship','reviewedFactsUnderstood','storeId']
      else array['address','description','ownerFactsConfirmed','relationship','reviewedFactsUnderstood','storeName','website'] end;
    if jsonb_typeof(d) is distinct from 'object' or (select array_agg(key order by key) from jsonb_object_keys(d) key) is distinct from expected
      or coalesce(d->>'relationship','') not in ('owner','manager')
      or jsonb_typeof(d->'ownerFactsConfirmed') is distinct from 'boolean' or jsonb_typeof(d->'reviewedFactsUnderstood') is distinct from 'boolean'
      or (k='existing_claim' and coalesce(d->>'storeId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      or (k='add_store' and (jsonb_typeof(d->'storeName') is distinct from 'string'
        or jsonb_typeof(d->'address') is distinct from 'string'
        or jsonb_typeof(d->'website') is distinct from 'string'
        or jsonb_typeof(d->'description') is distinct from 'string'
        or nullif(btrim(d->>'storeName'),'') is null or char_length(d->>'storeName')>160
        or nullif(btrim(d->>'address'),'') is null or char_length(d->>'address')>320
        or char_length(d->>'description')>4000
        or (nullif(d->>'website','') is not null and (d->>'website') !~* '^https?://[^[:space:]]+$'))) then raise exception 'invalid'; end if;
    return p_payload;
  elsif p_operation='submit' then
    if coalesce(keys,array[]::text[])<>array[]::text[] or p_intake.run_id is null
      or (p_intake.draft->>'ownerFactsConfirmed')::boolean is not true
      or (p_intake.draft->>'reviewedFactsUnderstood')::boolean is not true
      or (k='existing_claim' and nullif(p_intake.draft->>'storeId','') is null)
      or (k='add_store' and (nullif(btrim(p_intake.draft->>'storeName'),'') is null
        or nullif(btrim(p_intake.draft->>'address'),'') is null)) then raise exception 'invalid'; end if;
  elsif coalesce(keys,array[]::text[])<>array[]::text[] then raise exception 'invalid'; end if;
  return p_payload;
end $$;
