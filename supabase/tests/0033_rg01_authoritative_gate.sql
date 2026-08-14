begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

select has_schema('rg01_private','RG-01 has an isolated private schema');
select has_table('rg01_private','rg01_capability','independent capability exists');
select has_table('rg01_private','rg01_subject_consents','consent and dedup ledger exists');
select has_table('rg01_private','rg01_dedup_keys','purpose-specific dedup key registry exists');
select has_table('rg01_private','rg01_flyer_consents','exact-store flyer consent exists');
select has_table('rg01_private','rg01_source_facts','authoritative source facts exist');
select has_table('rg01_private','rg01_runs','calculation runs exist');
select has_table('rg01_private','rg01_run_subjects','receipt-local pseudonym ledger exists');
select has_table('rg01_private','rg01_metrics','derived metrics exist');
select has_table('rg01_private','rg01_exclusions','reason-coded exclusions exist');
select has_table('rg01_private','rg01_manifests','frozen source manifests exist');
select has_table('rg01_private','rg01_signing_challenges','one-use signing challenges exist');
select has_table('rg01_private','rg01_receipts','content-free decisions exist');
select has_table('rg01_private','rg01_receipt_supersessions','supersession chain exists');
select has_table('rg01_private','rg01_purge_receipts','three-year content-free purge receipts exist');

select is((select collection_enabled from rg01_private.rg01_capability where singleton_id=1),false,'RG-01 collection defaults off');
select is((select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='rg01_private' and c.relkind='r' and c.relforcerowsecurity),15,'every RG-01 persistence table forces RLS');
select ok((select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname='rg01_automation'),'automation owner is constrained');
select ok((select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname='rg01_source_service'),'source service is constrained');
select ok(not has_schema_privilege('rg01_automation','rg01_private','CREATE'),'automation cannot create objects after migration');
select ok(not has_table_privilege('anon','rg01_private.rg01_metrics','SELECT') and not has_table_privilege('authenticated','rg01_private.rg01_metrics','SELECT'),'shoppers never read totals');
select ok(not has_table_privilege('authenticated','rg01_private.rg01_source_facts','INSERT'),'clients cannot author source facts or counts');
select ok(not has_table_privilege('rg01_calculation_service','rg01_private.rg01_metrics','INSERT'),'calculation service has execute-only authority');
select ok(not has_table_privilege('rg01_signature_service','rg01_private.rg01_receipts','INSERT'),'signature service cannot directly fabricate receipts');
select ok(not has_function_privilege('authenticated','rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text)','EXECUTE'),'browser cannot author facts');
select ok(has_function_privilege('rg01_source_service','rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamptz,date,integer,integer,boolean,text)','EXECUTE'),'narrow source service can ingest authoritative facts');
select ok(has_function_privilege('rg01_calculation_service','rg01_private.freeze_run(uuid)','EXECUTE'),'narrow calculation service derives and freezes');
select ok(has_function_privilege('rg01_signature_service','rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)','EXECUTE'),'narrow signature service consumes verified challenges');
select ok(has_function_privilege('rg01_lifecycle_service','rg01_private.purge_run_linkage(uuid,text,bytea)','EXECUTE'),'narrow lifecycle service owns purge');

select ok(exists(select 1 from pg_trigger where tgname='rg01_source_facts_immutable' and not tgisinternal),'source facts are immutable');
select ok(exists(select 1 from pg_trigger where tgname='rg01_receipts_immutable' and not tgisinternal),'signed receipts are immutable');
select ok(exists(select 1 from pg_trigger where tgname='rg01_manifests_immutable' and not tgisinternal),'frozen manifests are immutable');
select ok(exists(select 1 from pg_trigger where tgname='rg01_supersessions_immutable' and not tgisinternal),'supersession links are append-only');
select ok(exists(select 1 from pg_trigger where tgname='rg01_dedup_key_guard' and not tgisinternal),'dedup keys only transition once to destroyed');
select ok(exists(select 1 from pg_trigger where tgname='rg01_run_guard' and not tgisinternal),'frozen calculation inputs and dispositions are immutable');
select ok(exists(select 1 from pg_trigger where tgname='rg01_run_subject_guard' and not tgisinternal),'receipt-local labels survive linkage purge without mutation');
select ok(exists(select 1 from pg_indexes where schemaname='rg01_private' and indexname='rg01_one_live_calculation'),'only one calculation can collect or await disposition');
select ok(position('row_number() over(partition by s.dedup_hmac order by f.occurred_at,f.authoritative_source_id)' in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0,'trip order is authoritative and deterministic');
select ok(position($q$calendar_date>prior_date$q$ in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0,'second trip requires a later calendar date');
select ok(position('10*p_support>10*p_active+p_trips' in lower(pg_get_functiondef('rg01_private.calculate_blockers(bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint)'::regprocedure)))>0,'support threshold uses exact integer arithmetic');
select ok(position($q$claim_attempt$q$ in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0 and position($q$claim_approved$q$ in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0,'claim conversion inputs are reported separately from blockers');
select ok(position($q$p_decision='pass' and cardinality(r.blockers)>0$q$ in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))>0,'failed predicates cannot request a PASS challenge');
select ok(position('rg01_product_owner_grants' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))>0 and position('current_session_has_mfa' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text)'::regprocedure)))>0,'ProductOwner responsibility plus MFA and recent auth are required');
select ok(position('source_head_digest=rg01_private.source_head_digest()' in lower(pg_get_functiondef('rg01_private.receipt_is_current_pass(uuid)'::regprocedure)))>0,'later source changes invalidate a stale receipt');
select ok(position('rg01_receipt_supersessions' in lower(pg_get_functiondef('rg01_private.receipt_is_current_pass(uuid)'::regprocedure)))>0,'superseded receipts are never current');
select ok(position('receipt_is_current_pass' in lower(pg_get_functiondef('community_private.require_current_rg01(uuid)'::regprocedure)))>0,'Package 12 consumes only current authoritative PASS receipts');
select is(rg01_private.calculate_blockers(25,10,3,3,3,0,6,35),array[]::text[],'all exact minimums and the support boundary pass');
select is(rg01_private.calculate_blockers(24,10,3,3,3,0,6,35),array['first_trip_denominator_below_25']::text[],'first-trip denominator is exact');
select is(rg01_private.calculate_blockers(25,9,3,3,3,0,6,35),array['second_trip_shoppers_below_10']::text[],'second-trip target is exact');
select is(rg01_private.calculate_blockers(25,10,3,3,3,0,7,35),array['support_load_exceeded']::text[],'one support case beyond the exact integer boundary fails');

insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state,step_ordinal,signed_release_receipt)
values('32000000-0000-4000-8000-000000000001','topeka-ks','sha256:'||repeat('1',64),'sha256:'||repeat('2',64),'sha256:'||repeat('3',64),'active',9,'signed-release');
insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
values('32000000-0000-4000-8000-000000000001',true,true,true,true,true);

set local role release_executor;
select lives_ok($$select rg01_private.set_collection_capability(true,'32000000-0000-4000-8000-000000000001',1)$$,'active signed 10B may independently enable collection');
reset role;
select ok((select collection_enabled from rg01_private.rg01_capability where singleton_id=1),'capability enable persists');

set local role rg01_calculation_service;
select throws_ok($$select rg01_private.begin_run('32000000-0000-4000-8000-000000000101','2026-01-01T00:00:00Z','2026-07-01T00:00:00Z',null)$$,'22023','rg01_window_invalid','a window longer than 180 days denies');
select lives_ok($$select rg01_private.begin_run('32000000-0000-4000-8000-000000000102','2026-01-01T00:00:00Z','2026-06-30T00:00:00Z',null)$$,'an exact 180-day rolling window is accepted');
select lives_ok($$select rg01_private.freeze_run('32000000-0000-4000-8000-000000000102')$$,'trusted service deterministically freezes even a failing snapshot');
reset role;
select is((select state from rg01_private.rg01_runs where run_id='32000000-0000-4000-8000-000000000102'),'frozen','freeze is durable');
select ok((select blockers @> array['first_trip_denominator_below_25','second_trip_shoppers_below_10','listing_freshness_not_100_percent','flyer_locations_below_3']::text[] from rg01_private.rg01_runs where run_id='32000000-0000-4000-8000-000000000102'),'missing denominators and targets fail closed');

set local role community_evidence_service;
select throws_ok($$insert into community_private.community_evidence_receipts(receipt_id,receipt_kind,responsibility,decision,area_slug,signed_payload_digest,external_verified,predicates) values('32000000-0000-4000-8000-000000000201','rg01_pass','ProductOwner','pass','topeka',decode(repeat('1a',32),'hex'),true,'{"all_predicates_pass":true}')$$,'42501','community_rg01_authoritative_receipt_required','Package 12 rejects a self-asserted RG-01 receipt');
reset role;

select * from finish();
rollback;
