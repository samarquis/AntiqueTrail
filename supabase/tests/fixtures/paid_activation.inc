-- Synthetic-only setup for downstream billing tests. Real source rows and the
-- production composite validator are used; no function is replaced or bypassed.
create or replace function pg_temp.seed_paid_activation(v bigint) returns uuid language plpgsql as $$
declare c partner_private.photo_tier_commercial_configs%rowtype; rid uuid; rgid uuid:=extensions.gen_random_uuid();
  runid uuid; selection uuid; readiness uuid; activation uuid; gate uuid; previous uuid; gates uuid[]:='{}'; runids uuid[]:='{}';
  n integer; k text; eid uuid; ids uuid[]:='{}'; aid uuid:=extensions.gen_random_uuid(); source uuid; d bytea; rg_run uuid:=extensions.gen_random_uuid(); rg_challenge uuid:=extensions.gen_random_uuid(); rg_receipt uuid:=extensions.gen_random_uuid();
begin
  select * into c from partner_private.photo_tier_commercial_configs where version=v;
  d:=extensions.digest(convert_to(partner_private.commercial_config_canonical_bytes(c),'utf8'),'sha256');
  -- Older fixtures use deliberately synthetic digests; normalize them to their
  -- canonical bytes before exercising the new activation boundary.
  alter table partner_private.photo_tier_commercial_configs disable trigger photo_tier_commercial_config_guard;
  update partner_private.photo_tier_commercial_configs set canonical_bytes=partner_private.commercial_config_canonical_bytes(c),digest=d where version=v;
  alter table partner_private.photo_tier_commercial_configs enable trigger photo_tier_commercial_config_guard;
  select release_id into rid from release_private.regional_releases where state='active';
  update release_private.regional_releases set signed_release_receipt='synthetic-180' where release_id=rid;
  insert into release_private.release_evidence_receipts(receipt_id,release_id,step,artifact_digest,catalog_digest,prerequisite_receipt_digest,payload_digest,external_verified)
    select extensions.gen_random_uuid(),release_id,'signed_release_receipt',artifact_digest,catalog_digest,prerequisite_receipt_digest,d,true from release_private.regional_releases where release_id=rid;
  insert into rg01_private.rg01_runs(run_id,release_id,window_start,window_end,source_cutoff,state,manifest_digest,source_head_digest,blockers,frozen_at)
    values(rg_run,rid,now()-interval '180 days',now(),now(),'frozen',d,rg01_private.source_head_digest(),array[]::text[],now());
  insert into rg01_private.rg01_signing_challenges(challenge_id,run_id,signer_user_id,frozen_digest,decision,failed_codes,nonce,payload_digest,expires_at,consumed_at)
    values(rg_challenge,rg_run,c.approved_by,d,'pass',array[]::text[],d,d,now()+interval '30 minutes',now());
  insert into rg01_private.rg01_receipts(receipt_id,run_id,challenge_id,release_id,signer_user_id,responsibility,decision,manifest_digest,source_head_digest,signed_payload_digest,signature_digest,provider_key_id,provider_verification_id,failed_codes,claim_approved,claim_rejected,claim_abusive)
    values(rg_receipt,rg_run,rg_challenge,rid,c.approved_by,'ProductOwner','pass',d,rg01_private.source_head_digest(),d,d,'synthetic-key',gen_random_uuid()::text,array[]::text[],0,0,0);
  update rg01_private.rg01_runs set state='signed',receipt_id=rg_receipt,disposed_at=now() where run_id=rg_run;
  insert into community_private.community_evidence_receipts(receipt_id,receipt_kind,responsibility,decision,area_slug,signed_payload_digest,external_verified,mfa_verified,recent_authentication,rg01_authoritative_receipt_id)
    values(rgid,'rg01_pass','ProductOwner','pass','topeka-ks',d,true,true,true,rg_receipt);
  for n in 1..3 loop
    runid:=extensions.gen_random_uuid(); selection:=extensions.gen_random_uuid(); readiness:=extensions.gen_random_uuid(); activation:=extensions.gen_random_uuid(); gate:=extensions.gen_random_uuid();
    insert into community_private.community_evidence_receipts(receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,prior_receipt_id,artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,mfa_verified,recent_authentication,predicates)
      values(selection,'selection','ProductOwner','pass','synthetic-'||n,runid,coalesce(previous,rgid),d,d,d,true,true,true,'{"eligible_small_community":true}'),
        (readiness,'readiness','ProductOwner','pass','synthetic-'||n,runid,null,d,d,d,true,true,true,'{"all_predicates_pass":true}'),
        (activation,'activation','ProductOwner','pass','synthetic-'||n,runid,null,d,d,d,true,true,true,jsonb_build_object('all_predicates_pass',true,'canonical_route','/stores?area=synthetic-'||n)),
        (gate,'community_gate','PrimaryInternalTester','pass','synthetic-'||n,runid,activation,d,d,d,true,true,true,'{"all_predicates_pass":true}');
    insert into community_private.community_activation_runs(run_id,attempt_sequence,target_ordinal,activation_ordinal,area_slug,selection_receipt_id,rg01_receipt_id,prior_gate_receipt_id,state,readiness_receipt_id,activation_receipt_id,gate_receipt_id,artifact_binding_digest,store_set_digest,activated_at)
      values(runid,n,n,n,'synthetic-'||n,selection,case when n=1 then rgid end,previous,'live',readiness,activation,gate,d,d,statement_timestamp());
    previous:=gate; gates:=array_append(gates,gate); runids:=array_append(runids,runid);
  end loop;
  update partner_private.commercial_research_signature_challenges set config_digest=d,community_gate_receipt_ids=gates
    where config_version=v;
  alter table partner_private.commercial_research_signature_receipts disable trigger commercial_research_signature_receipt_append_only;
  update partner_private.commercial_research_signature_receipts set config_digest=d where config_version=v;
  alter table partner_private.commercial_research_signature_receipts enable trigger commercial_research_signature_receipt_append_only;
  foreach k in array array['package_10b','rg01','community_1','community_2','community_3','research_authorization','paid_value','monetization_decision','package_13','media','security','provider','hosted_ci','deployment'] loop
    eid:=extensions.gen_random_uuid();
    source:=case k when 'package_10b' then rid when 'rg01' then rgid when 'community_1' then runids[1] when 'community_2' then runids[2] when 'community_3' then runids[3] when 'research_authorization' then c.research_authorization_id end;
    insert into partner_private.photo_tier_activation_evidence(receipt_id,kind,revision,decision,source_id,config_version,commercial_digest,artifact_digest,schema_digest,deployment_config_digest,payload_digest,signed_by_roles,provider_verification_id,signed_at,expires_at)
      values(eid,k,1,'pass',source,v,d,d,d,d,d,array['ProductOwner','Operations','Security'],extensions.gen_random_uuid()::text,statement_timestamp(),statement_timestamp()+interval '1 day');
    ids:=array_append(ids,eid);
  end loop;
  perform app_public.prepare_photo_tier_activation(aid,v,ids);
  update partner_private.photo_tier_sales_control set activation_receipt_id=aid where singleton;
  return aid;
end $$;


create function pg_temp.paid_digest() returns text language sql security definer set search_path='' as $$
  select encode(digest,'hex') from partner_private.photo_tier_commercial_configs order by version desc limit 1
$$;
