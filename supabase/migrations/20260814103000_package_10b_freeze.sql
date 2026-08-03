create or replace function release_private.freeze_regional_release(p_command_id uuid,p_artifact_digest text,p_catalog_digest text,p_prerequisite_receipt_digest text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_release_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  if exists(select 1 from release_private.release_commands c join release_private.regional_releases r using(release_id) where c.command_id=p_command_id and (c.step<>'freeze' or c.artifact_digest<>p_artifact_digest or c.catalog_digest<>p_catalog_digest or r.prerequisite_receipt_digest<>p_prerequisite_receipt_digest)) then raise exception 'release_idempotency_mismatch'; end if;
  select release_id into v_release_id from release_private.release_commands where command_id=p_command_id;
  if found then return v_release_id; end if;
  insert into release_private.regional_releases(region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest) values('topeka-ks',p_artifact_digest,p_catalog_digest,p_prerequisite_receipt_digest) returning release_id into v_release_id;
  insert into release_private.release_capabilities(release_id) values(v_release_id);
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,v_release_id,'freeze',p_artifact_digest,p_catalog_digest,'frozen');
  return v_release_id;
end;
$$;
