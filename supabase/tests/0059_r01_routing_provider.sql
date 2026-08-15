begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

select has_schema('routing_private','R-01 has a private operational schema');
select has_table('routing_private','provider_config','provider configuration facts are durable');
select has_table('routing_private','quota_latch','quota latch is durable');
select has_table('routing_private','operations','content-free operations are durable');
select has_table('routing_private','audit_events','content-free audit is durable');
select is((select state from routing_private.provider_config where singleton),'blocked','provider capability defaults blocked');
select is((select state from routing_private.quota_latch where singleton),'blocked','quota latch defaults blocked');
select ok((select count(*)=4 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='routing_private' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),'every routing table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='routing_private' and grantee in ('anon','authenticated','service_role')),'browser and generic service roles have no direct routing-table access');
select ok(not exists(select 1 from information_schema.columns where table_schema='routing_private' and table_name='operations' and column_name ~ '(account|actor|cohort|note|store|trip|email|coordinate|payload|request_body|response_body|matrix|candidate|text)'),'operations persist no request, response, account, or business content');
select ok(not exists(select 1 from information_schema.columns where table_schema='routing_private' and table_name='audit_events' and column_name ~ '(account|actor|cohort|note|store|trip|email|coordinate|payload|request|response|matrix|candidate|text)'),'routing audit is content-free');

select has_function('app_public','routing_get_capability',array[]::text[],'capability RPC exists');
select has_function('app_public','routing_reserve_operation',array['text','uuid','boolean','integer','jsonb','integer'],'reservation RPC exists');
select has_function('app_public','routing_begin_operation',array['uuid','uuid'],'provider begin RPC exists');
select has_function('app_public','routing_settle_operation',array['uuid','uuid','text','text','text','text','integer','numeric'],'provider settlement RPC exists');
select has_function('app_public','routing_accept_provider_config',array['uuid','uuid','text','integer','text','integer','numeric','numeric','integer','text','text'],'deployment acceptance RPC exists');
select has_function('app_public','routing_revoke_provider',array['text'],'revocation RPC exists');
select has_function('app_public','routing_purge_operations',array['timestamp with time zone','integer'],'bounded retention RPC exists');
select ok(has_function_privilege('anon','app_public.routing_get_capability()','EXECUTE') and has_function_privilege('authenticated','app_public.routing_get_capability()','EXECUTE'),'capability can be read without disclosing configuration');
select ok(has_function_privilege('authenticated','app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)','EXECUTE') and not has_function_privilege('anon','app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)','EXECUTE'),'only authenticated sessions reserve calls');
select ok(has_function_privilege('routing_provider_service','app_public.routing_begin_operation(uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','app_public.routing_begin_operation(uuid,uuid)','EXECUTE'),'only provider service begins calls');
select ok(has_function_privilege('routing_provider_service','app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric)','EXECUTE') and not has_function_privilege('authenticated','app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric)','EXECUTE'),'only provider service settles calls');
select ok(has_function_privilege('routing_deployment_service','app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text)','EXECUTE') and not has_function_privilege('authenticated','app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text)','EXECUTE'),'only deployment service accepts evidence');
select ok(has_function_privilege('routing_deployment_service','app_public.routing_revoke_provider(text)','EXECUTE') and not has_function_privilege('authenticated','app_public.routing_revoke_provider(text)','EXECUTE'),'only deployment service revokes provider');
select ok(has_function_privilege('routing_monitor_service','app_public.routing_purge_operations(timestamp with time zone,integer)','EXECUTE') and not has_function_privilege('authenticated','app_public.routing_purge_operations(timestamp with time zone,integer)','EXECUTE'),'only monitor service purges operational receipts');

select ok(position($q$g.gate_kind='provider_r'$q$ in replace(lower(pg_get_functiondef('routing_private.capability_open()'::regprocedure)),' ',''))>0 and position('g.external_verified' in lower(pg_get_functiondef('routing_private.capability_open()'::regprocedure)))>0,'capability requires real externally verified Provider R evidence');
select ok(position($q$capabilities->>'routing_geocoding'$q$ in lower(pg_get_functiondef('routing_private.capability_open()'::regprocedure)))>0 and position($q$q.state='open'$q$ in replace(lower(pg_get_functiondef('routing_private.capability_open()'::regprocedure)),' ',''))>0,'capability requires explicit environment flag and open latch');
select ok(position('not p_explicit' in lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)))>0,'provider access requires explicit user action');
select ok(position('p_point_count not between 2 and 10' in lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)))>0,'matrix payload is bounded to two through ten points');
select ok(position($q$c<>jsonb_strip_nulls(jsonb_build_object('latitude',c->'latitude','longitude',c->'longitude'))$q$ in replace(lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)),' ',''))>0,'coordinate objects use an exact two-field allowlist');
select ok(position('from app_public.stores s' in lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)))>0 and position($q$s.publication_state='active'$q$ in replace(lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)),' ',''))>0,'intermediate coordinates must match approved active stores without sending store IDs');
select ok(position('0.75' in regexp_replace(lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)),'[[:space:]]','','g'))>0
  and position($q$setstate='paused',pause_reason='quota'$q$ in regexp_replace(lower(pg_get_functiondef('app_public.routing_reserve_operation(text,uuid,boolean,integer,jsonb,integer)'::regprocedure)),'[[:space:]]','','g'))>0,'safe quota latch pauses at seventy-five percent');
select ok(position('routing_private.capability_open()' in lower(pg_get_functiondef('app_public.routing_begin_operation(uuid,uuid)'::regprocedure)))>0,'capability is rechecked immediately before provider invocation');
select ok(position($q$p_outcome='unknown'$q$ in replace(lower(pg_get_functiondef('app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric)'::regprocedure)),' ',''))>0 and position($q$'reconciliation_required'$q$ in lower(pg_get_functiondef('app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric)'::regprocedure)))>0,'lost responses latch reconciliation instead of retrying blindly');
select ok(position($q$'timeout','quota','revoked','outage','temporary_market','no_route','unknown'$q$ in replace(lower(pg_get_functiondef('app_public.routing_settle_operation(uuid,uuid,text,text,text,text,integer,numeric)'::regprocedure)),' ',''))>0,'timeout quota revocation outage temporary market and no-route are typed');
select ok(position($q$g.gate_kind='provider_r'$q$ in replace(lower(pg_get_functiondef('app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text)'::regprocedure)),' ',''))>0 and position('g.external_verified' in lower(pg_get_functiondef('app_public.routing_accept_provider_config(uuid,uuid,text,integer,text,integer,numeric,numeric,integer,text,text)'::regprocedure)))>0,'acceptance cannot fabricate provider or legal evidence');
select ok(not exists(
  select 1 from information_schema.columns
  where table_schema='trip_private' and table_name='check_my_day_route_runs'
    and column_name in ('matrix','matrix_hash')
),'legacy raw matrix persistence is removed');
select has_column('trip_private','check_my_day_route_runs','response_digest','legacy route runs retain only a response digest');
select ok(position('trip_command_json' in lower(pg_get_functiondef('app_public.request_check_my_day(text)'::regprocedure)))=0 and position('routing_private.capability_open()' in lower(pg_get_functiondef('app_public.request_check_my_day(text)'::regprocedure)))>0,'Check My Day persists minimized facts and remains behind R-01');
select ok(position('response_digest' in lower(pg_get_functiondef('trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamp with time zone,uuid[],jsonb)'::regprocedure)))>0 and position('matrix,matrix_hash' in replace(lower(pg_get_functiondef('trip_private.record_check_my_day_suggestion(uuid,text,text,integer,numeric,jsonb,timestamp with time zone,uuid[],jsonb)'::regprocedure)),' ','') )=0,'provider result is digested rather than persisted');
select ok(position('previous_hash' in lower(pg_get_functiondef('routing_private.append_audit(uuid,text,text)'::regprocedure)))>0 and position('pg_advisory_xact_lock' in lower(pg_get_functiondef('routing_private.append_audit(uuid,text,text)'::regprocedure)))>0,'audit is serialized and hash chained');
select ok(not has_function_privilege('authenticated','routing_private.append_audit(uuid,text,text)','EXECUTE'),'browser cannot forge audit evidence');
select ok((select gate_receipt_id is null and contract_receipt_id is null and processing_region is null and provider_version is null from routing_private.provider_config where singleton),'migration invents no provider, region, retention, attribution, quota, cost, or legal facts');
select ok(exists(select 1 from pg_constraint where conrelid='routing_private.operations'::regclass and contype='u' and pg_get_constraintdef(oid) ilike '%idempotency_key%'),'idempotency keys are unique');

select * from finish();
rollback;
