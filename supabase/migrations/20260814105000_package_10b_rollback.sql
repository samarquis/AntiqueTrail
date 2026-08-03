create or replace function release_private.rollback_regional_release(p_command_id uuid,p_release_id uuid,p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'rollback' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found then raise exception 'release_not_found'; end if;
  update release_private.release_capabilities set public_catalog=false,public_claims=false,public_reviews=false,public_registration=false,product_promotion=false,updated_at=statement_timestamp() where release_id=p_release_id;
  update release_private.regional_releases set state='rolled_back',rollback_reason=btrim(p_reason),updated_at=statement_timestamp() where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,p_release_id,'rollback',v_release.artifact_digest,v_release.catalog_digest,'rolled_back');
  return 'rolled_back';
end;
$$;
