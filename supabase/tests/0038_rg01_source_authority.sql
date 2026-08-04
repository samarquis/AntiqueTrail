begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_function('rg01_private','derive_source_fact',array['text','uuid'],'RG-01 derives facts from authoritative domain rows');
select has_function('rg01_private','source_fact_matches_authority',array['uuid'],'stored facts can be rechecked against authority');
select has_function('rg01_private','sync_authoritative_source_facts',array[]::text[],'freeze has a complete-source synchronization seam');
select has_function('rg01_private','authoritative_source_head_digest',array[]::text[],'live authoritative source head is digest-bound');

select ok(position('trip_private.trips' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,'trip facts derive from server trips and stops');
select ok(position('app_public.stores' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0 and position('catalog_freshness' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,'listing facts derive from the live public catalog and freshness');
select ok(position('readiness_private.readiness_fact_events' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,'defect facts bind the authoritative defect record');
select ok(position('admin_private.admin_review_cases' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,'support facts bind the authoritative support case');
select ok(position('partner_private.listing_claims' in lower(pg_get_functiondef('rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,'claim facts bind the authoritative claim record');

select ok(position('derive_source_fact' in lower(pg_get_functiondef('rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamp with time zone,date,integer,integer,boolean,text)'::regprocedure)))>0,'source ingestion derives rather than trusts assertions');
select ok(position('rg01_source_assertion_mismatch' in lower(pg_get_functiondef('rg01_private.record_source_fact(text,uuid,bigint,bytea,uuid,uuid,timestamp with time zone,date,integer,integer,boolean,text)'::regprocedure)))>0,'mismatched caller assertions fail closed');
select ok(position('sync_authoritative_source_facts' in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0 and position('source_fact_matches_authority' in lower(pg_get_functiondef('rg01_private.freeze_run(uuid)'::regprocedure)))>0,'freeze synchronizes and rechecks the authoritative source set');
select ok(position('authoritative_source_head_digest' in lower(pg_get_functiondef('rg01_private.source_head_digest()'::regprocedure)))>0,'receipt currency changes when a domain source changes');

select ok(position('rg01_capability' in lower(pg_get_functiondef('app_public.rg01_set_own_consent(boolean)'::regprocedure)))>0,'shopper RG consent checks the server capability');
select ok(position('rg01_collection_disabled' in lower(pg_get_functiondef('app_public.rg01_set_own_consent(boolean)'::regprocedure)))>0,'shopper consent fails closed while collection is disabled');
select ok(position('rg01_capability' in lower(pg_get_functiondef('app_public.rg01_set_flyer_consent(uuid,boolean,bytea)'::regprocedure)))>0,'flyer consent checks the server capability');
select ok(position('rg01_collection_disabled' in lower(pg_get_functiondef('app_public.rg01_set_flyer_consent(uuid,boolean,bytea)'::regprocedure)))>0,'flyer consent fails closed while collection is disabled');

select throws_ok($$select app_public.rg01_set_own_consent(true)$$,'55000','rg01_collection_disabled','disabled RG collection rejects shopper consent before identity evaluation');
select throws_ok($$select app_public.rg01_set_flyer_consent('37000000-0000-4000-8000-000000000001',true,decode(repeat('11',32),'hex'))$$,'55000','rg01_collection_disabled','disabled RG collection rejects flyer consent before store authority evaluation');
select ok(not has_function_privilege('rg01_source_service','rg01_private.sync_authoritative_source_facts()','EXECUTE') and not has_function_privilege('authenticated','rg01_private.derive_source_fact(text,uuid)','EXECUTE'),'derivation and full-source sync are not callable by ingestion or browser roles');

select * from finish();
rollback;
