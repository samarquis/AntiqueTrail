begin;
select plan(17);

select has_function('app_public','rg01_get_operational_status',array['uuid'],'bounded RG-01 operational projection exists');
select has_function('app_public','rg01_authorize_operational_command',array['text'],'operational command authorization exists');
select ok(has_function_privilege('authenticated','app_public.rg01_get_operational_status(uuid)','EXECUTE'),
  'authenticated may request only the server projection');
select ok(has_function_privilege('authenticated','app_public.rg01_authorize_operational_command(text)','EXECUTE'),
  'authenticated reaches the server command gate');
select ok(not has_function_privilege('anon','app_public.rg01_get_operational_status(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_public.rg01_authorize_operational_command(text)','EXECUTE'),
  'anonymous callers cannot reach RG-01 evidence commands');

select ok(position('has_current_evidence_responsibility' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0
  and position('operations' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0
  and position('productowner' in lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)))>0,
  'status requires an exact retained Operations or ProductOwner responsibility');
select ok(position('current_session_is_active' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0
  and position('current_user_has_role' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0
  and position('administrator' in lower(pg_get_functiondef('rg01_private.has_current_evidence_responsibility(text)'::regprocedure)))>0,
  'revoked sessions and wrong application roles fail closed');
select ok(position('bound_release_id' in lower(pg_get_functiondef('rg01_private.has_live_operations_authority()'::regprocedure)))>0
  and position('release_id' in lower(pg_get_functiondef('rg01_private.has_live_operations_authority()'::regprocedure)))>0,
  'prepare and freeze require the active exact release');
select ok(position('p_operationin(''begin'',''freeze'')' in replace(lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)),' ',''))>0
  and position('consume_decision' in lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)))>0,
  'prepare/freeze and provider consumption have separate server gates');

select ok(position('limit25' in replace(lower(pg_get_functiondef('app_public.rg01_get_operational_status(uuid)'::regprocedure)),' ',''))>0,
  'run list is bounded');
select ok(position('first_trip_shoppers' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0
  and position('claim_abusive' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0,
  'projection exposes only named aggregate metric codes');
select ok(position('subject_id' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))>0
  and position('dedup_hmac' in lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)))=0,
  'projection uses subject linkage only to derive purge status and never returns it');
select ok(position('manifestdigest' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0
  and position('supersessionstatus' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0
  and position('purgestatus' in replace(lower(pg_get_functiondef('rg01_private.operational_run_projection(uuid)'::regprocedure)),' ',''))>0,
  'projection returns digest, supersession, and purge status without private payloads');

select ok(position('rg01_execute_calculation' in lower(pg_get_functiondef('app_public.rg01_authorize_operational_command(text)'::regprocedure)))=0,
  'the authorization RPC does not perform a client-controlled calculation');
select ok(position('rg01_authorize_operational_command' in lower(pg_get_functiondef('app_public.rg01_request_decision_challenge(uuid,text,uuid)'::regprocedure)))=0,
  'Product Owner challenge issuance remains its own exact RPC contract');
select ok(position('rg01_authorize_operational_command' in lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)))=0
  and position('gate_signing_capabilities' in lower(pg_get_functiondef('rg01_private.consume_decision_challenge(uuid,bytea,bytea,text,text)'::regprocedure)))>0,
  'provider consumption still relies on the one-use server capability');
select ok(not has_function_privilege('authenticated','rg01_private.operational_run_projection(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','rg01_private.has_live_operations_authority()','EXECUTE'),
  'private projection and authority helpers are not direct browser APIs');
select * from finish();
rollback;
