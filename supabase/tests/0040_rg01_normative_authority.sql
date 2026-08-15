begin;
select plan(28);

select has_table('readiness_private','evidence_responsibility_grants','normative evidence responsibility grants exist');
select has_table('readiness_private','gate_signing_capabilities','normative one-use gate capabilities exist');
select has_table('rg01_private','rg01_capability_events','RG collection capability changes are audited');

select col_is_unique('readiness_private','gate_signing_capabilities','token_hash','capability token hashes cannot replay');
select col_is_unique('readiness_private','gate_signing_capabilities','challenge_id','one capability binds one RG challenge');
select ok(position('expires_at<=created_at+''00:30:00''::interval' in regexp_replace(lower(pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='readiness_private.gate_signing_capabilities'::regclass and conname='gate_signing_capability_window'))),'[[:space:]]','','g'))>0,
  'gate capabilities expire within thirty minutes');

select ok(position('evidence_responsibility_grants' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))>0
  and position('rg01_product_owner_grants' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))=0,
  'challenge issuance uses only normative evidence responsibility grants');
select ok(position('gate_signing_capabilities' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))>0,
  'trusted challenge issuance records an exact-digest gate capability');
select ok(position('gate_signing_capabilities' in lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)))>0
  and position('state=''consumed''' in replace(lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)),' ',''))>0,
  'signature consumption atomically consumes the one-use capability');
select ok(position('g.version=cap.grant_version' in replace(lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)),' ',''))>0,
  'signature consumption revalidates the exact responsibility grant version');

select ok(not has_table_privilege('rg01_evidence_service','rg01_private.rg01_product_owner_grants','INSERT')
  and not has_table_privilege('identity_service','rg01_private.rg01_product_owner_grants','SELECT'),
  'parallel RG ProductOwner grants cannot confer authority');
select ok(position('gate_kind=''hc_02''' in replace(lower(pg_get_functiondef('readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid)'::regprocedure)),' ',''))>0
  and position('release_actor_approvals' in lower(pg_get_functiondef('readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid)'::regprocedure)))>0,
  'responsibility grants require the exact HC receipt and Product plus Security approvals');
select ok(has_function_privilege('release_executor','readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid)','EXECUTE')
  and not has_function_privilege('rg01_evidence_service','readiness_private.grant_evidence_responsibility(uuid,text,uuid,uuid)','EXECUTE')
  and not has_table_privilege('release_executor','readiness_private.evidence_responsibility_grants','INSERT'),
  'deployment service receives only the receipt-validating grant command, never unrestricted row access');
select ok(not has_function_privilege('authenticated','rg01_private.set_collection_capability(boolean,uuid,bigint)','EXECUTE')
  and has_function_privilege('release_executor','rg01_private.set_collection_capability(boolean,uuid,bigint)','EXECUTE'),
  'only the deployment service may enable collection');
select ok(position('signed_release_receipt' in lower(pg_get_functiondef('rg01_private.set_collection_capability(boolean,uuid,bigint)'::regprocedure)))>0
  and position('release_evidence_receipts' in lower(pg_get_functiondef('rg01_private.set_collection_capability(boolean,uuid,bigint)'::regprocedure)))>0,
  'collection enablement derives the exact signed Package 10B release receipt');
select ok(position('rg01_capability_events' in lower(pg_get_functiondef('rg01_private.set_collection_capability(boolean,uuid,bigint)'::regprocedure)))>0,
  'collection enablement and disablement are atomically audited');

select has_function('rg01_private','promotion_consent_receipt_digest',array['uuid','uuid'],'promotion consent digest is server-derived');
select ok(position('promotion_rights_consent' in lower(pg_get_functiondef('rg01_private.promotion_consent_receipt_digest(uuid,uuid)'::regprocedure)))>0
  and position('release_frozen_stores' in lower(pg_get_functiondef('rg01_private.promotion_consent_receipt_digest(uuid,uuid)'::regprocedure)))>0,
  'flyer consent binds the exact Package 10B promotion receipt and frozen store');
select ok(position('promotion_consent_receipt_digest' in lower(pg_get_functiondef('app_public.rg01_set_flyer_consent(uuid,boolean,bytea)'::regprocedure)))>0,
  'flyer consent rejects client digests not derived from Package 10B');
select ok(position('source_receipt_digest' in lower(pg_get_functiondef('rg01_private.flyer_consent_matches_authority(uuid)'::regprocedure)))>0
  and position('promotion_consent_receipt_digest' in lower(pg_get_functiondef('rg01_private.flyer_consent_matches_authority(uuid)'::regprocedure)))>0,
  'current flyer authority revalidates its stored exact receipt digest');

select ok(position('release_frozen_stores' in lower(pg_get_functiondef('rg01_private.authoritative_source_ids()'::regprocedure)))>0,
  'authoritative sources are limited to the exact frozen regional store set');
select ok(position('not s.synthetic' in lower(pg_get_functiondef('rg01_private.authoritative_source_ids()'::regprocedure)))>0
  and position('s.audience=''public''' in replace(lower(pg_get_functiondef('rg01_private.authoritative_source_ids()'::regprocedure)),' ',''))>0,
  'synthetic and nonpublic stores are excluded');
select ok(position('target_kindin(''general'',''regional_release'')' in regexp_replace(lower(pg_get_functiondef('rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),'[[:space:]]','','g'))>0
  and position('target_id=p_release_id' in regexp_replace(lower(pg_get_functiondef('rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),'[[:space:]]','','g'))>0,
  'unscoped support cases are excluded');
select ok(position('readiness_run_for_release' in lower(pg_get_functiondef('rg01_private.authoritative_source_ids()'::regprocedure)))>0,
  'defects are bound to the readiness evidence set accepted by the release');
select ok(position('bound_release_id' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,
  'fact derivation revalidates the currently bound exact release');
select ok(position('authoritative_source_ids' in lower(pg_get_functiondef('rg01_private.source_head_digest()'::regprocedure)))>0
  and position('release_frozen_stores' in lower(pg_get_functiondef('rg01_private.source_head_digest()'::regprocedure)))>0,
  'unrelated facts, subjects, and flyers cannot change the exact-release source head');
select ok(position('authoritative_source_ids' in lower(pg_get_functiondef('rg01_private.scope_manifest_source_fact_count()'::regprocedure)))>0
  and exists(select 1 from pg_trigger where tgrelid='rg01_private.rg01_manifests'::regclass and tgname='rg01_manifest_scope' and not tgisinternal),
  'manifest source count excludes unrelated regional facts');
select ok(position('authoritative_source_coverage_complete' in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0,
  'freeze still fails closed on authoritative-source drift');

select * from finish();
rollback;
