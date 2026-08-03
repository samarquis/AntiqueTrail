create or replace function release_private.promote_regional_release(p_command_id uuid,p_release_id uuid,p_receipt_ids uuid[])
returns text language plpgsql security definer set search_path = '' as $$
declare v_release release_private.regional_releases%rowtype; v_command release_private.release_commands%rowtype; v_steps text[]; v_expected constant text[]:=array['recovery_point','migration_dry_run','config_secret_digest_sbom','canary','production_migration','smoke','monitoring','signed_release_receipt']; v_final_receipt uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('release:topeka-ks',0));
  select * into v_command from release_private.release_commands where command_id=p_command_id;
  if found then if v_command.release_id<>p_release_id or v_command.step<>'promote' then raise exception 'release_idempotency_mismatch'; end if; return v_command.result_state; end if;
  select * into v_release from release_private.regional_releases where release_id=p_release_id for update;
  if not found or v_release.state<>'frozen' then raise exception 'release_not_promotable'; end if;
  if cardinality(p_receipt_ids)<>cardinality(v_expected) then raise exception 'release_evidence_incomplete'; end if;
  select array_agg(e.step order by array_position(v_expected,e.step)),max(e.receipt_id) filter(where e.step='signed_release_receipt') into v_steps,v_final_receipt from release_private.release_evidence_receipts e where e.receipt_id=any(p_receipt_ids) and e.release_id=p_release_id and e.external_verified and e.artifact_digest=v_release.artifact_digest and e.catalog_digest=v_release.catalog_digest and e.prerequisite_receipt_digest=v_release.prerequisite_receipt_digest;
  if v_steps is distinct from v_expected or v_final_receipt is null then raise exception 'release_evidence_incomplete'; end if;
  update release_private.release_capabilities set public_catalog=true,public_claims=true,public_reviews=true,public_registration=true,product_promotion=true,updated_at=statement_timestamp() where release_id=p_release_id;
  update release_private.regional_releases set state='active',step_ordinal=9,signed_release_receipt=v_final_receipt::text,updated_at=statement_timestamp() where release_id=p_release_id returning * into v_release;
  insert into release_private.release_commands(command_id,release_id,step,artifact_digest,catalog_digest,result_state) values(p_command_id,p_release_id,'promote',v_release.artifact_digest,v_release.catalog_digest,'active');
  return 'active';
end;
$$;
