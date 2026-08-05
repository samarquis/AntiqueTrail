-- Package 10B operational boundary. The constrained executor can invoke one
-- exact idempotent command but cannot directly mutate release evidence.

create or replace function app_public.execute_regional_release_command(
  p_operation text,
  p_command_id uuid,
  p_release_id uuid,
  p_receipt_ids uuid[] default null,
  p_reason text default null
) returns text
language plpgsql volatile security definer set search_path='' as $$
begin
  if p_operation='promote' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is null
      or cardinality(p_receipt_ids)=0 or p_reason is not null then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.promote_regional_release(p_command_id,p_release_id,p_receipt_ids);
  elsif p_operation='rollback' then
    if p_command_id is null or p_release_id is null or p_receipt_ids is not null
      or nullif(pg_catalog.btrim(p_reason),'') is null or char_length(p_reason)>240 then
      raise exception using errcode='22023',message='release_command_invalid';
    end if;
    return release_private.rollback_regional_release(
      p_command_id,p_release_id,pg_catalog.btrim(p_reason)
    );
  end if;
  raise exception using errcode='22023',message='release_command_invalid';
end $$;

alter function app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)
  owner to release_automation;
revoke all on function app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)
  from public,anon,authenticated;
grant execute on function app_public.execute_regional_release_command(text,uuid,uuid,uuid[],text)
  to release_executor;
