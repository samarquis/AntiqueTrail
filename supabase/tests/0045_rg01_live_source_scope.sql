begin;
select plan(12);

select has_table('rg01_private','rg01_release_defect_events',
  'post-release critical defects have an authoritative event source');
select col_is_unique('rg01_private','rg01_release_defect_events',array['release_id','defect_id','version'],
  'defect history is release-bound and versioned');
select ok(exists(select 1 from pg_trigger where tgrelid='rg01_private.rg01_release_defect_events'::regclass
  and tgname='rg01_release_defect_append_only' and not tgisinternal),
  'post-release defect events are append-only');
select ok(position('pg_advisory_xact_lock' in lower(pg_get_functiondef(
  'rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea)'::regprocedure)))>0
  and position('bound_release_id' in lower(pg_get_functiondef(
  'rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea)'::regprocedure)))>0,
  'defect recording serializes versions and requires the exact active release');
select ok(has_function_privilege('rg01_source_service',
  'rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea)','EXECUTE')
  and not has_function_privilege('authenticated',
  'rg01_private.record_release_defect_event(uuid,uuid,bigint,text,text,timestamptz,bytea)','EXECUTE'),
  'only the authoritative source service records live defect state');

select has_function('rg01_private','support_case_in_scope',array['uuid','uuid'],
  'support scope is derived server-side');
select ok(position('release_frozen_stores' in lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)))>0
  and position('topeka-ks' in lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)))>0,
  'support scope is bound to exact frozen Topeka stores');
select ok(position('target_kind=''trip''' in replace(lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),' ',''))>0
  and position('target_kind=''account''' in replace(lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)),' ',''))=0,
  'support cases require an exact release-scoped trip rather than broad account ownership');
select ok(position('regional_release' in lower(pg_get_functiondef(
  'rg01_private.support_case_in_scope(uuid,uuid)'::regprocedure)))>0,
  'general support requires an explicit current-release target');

select ok(position('rg01_release_defect_events' in lower(pg_get_functiondef(
  'rg01_private.authoritative_source_ids()'::regprocedure)))>0
  and position('d.state=''open''' in replace(lower(pg_get_functiondef(
  'rg01_private.authoritative_source_ids()'::regprocedure)),' ',''))>0,
  'RG-01 includes every current open post-release critical defect');
select ok(position('support_case_in_scope' in lower(pg_get_functiondef(
  'rg01_private.authoritative_source_ids()'::regprocedure)))>0,
  'RG-01 includes all and only support cases in the exact release scope');
select ok(position('derive_source_fact_before_live_scope' in lower(pg_get_functiondef(
  'rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0
  and position('rg01_release_defect_events' in lower(pg_get_functiondef(
  'rg01_private.derive_source_fact(text,uuid)'::regprocedure)))>0,
  'live source derivation preserves prior authoritative formulas and adds release defects');

select * from finish();
rollback;
