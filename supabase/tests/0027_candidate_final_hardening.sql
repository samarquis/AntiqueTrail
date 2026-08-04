begin;
select plan(30);

select has_function('app_public','candidate_edge_context',array[]::text[],'Edge session context exists');
select has_function('app_public','candidate_update_trip_idea',array['uuid','text','text','bigint'],'Trip Idea update exists');
select has_function('app_public','unblock_candidate_sender',array['uuid','boolean'],'confirmed unblock exists');
select has_function('app_public','revoke_candidate_share',array['uuid','text'],'sender revoke exists');
select ok(has_function_privilege('authenticated','app_public.candidate_edge_context()','EXECUTE'),'authenticated Edge caller can verify context');
select ok(not has_function_privilege('anon','app_public.candidate_edge_context()','EXECUTE'),'anonymous Edge context is denied');
select ok(not has_function_privilege('anon','app_public.candidate_update_trip_idea(uuid,text,text,bigint)','EXECUTE'),'anonymous update is denied');
select ok(not has_function_privilege('anon','app_public.unblock_candidate_sender(uuid,boolean)','EXECUTE'),'anonymous unblock is denied');
select ok(not has_function_privilege('anon','app_public.revoke_candidate_share(uuid,text)','EXECUTE'),'anonymous revoke is denied');
select ok(position('current_session_is_active' in pg_get_functiondef('app_public.candidate_edge_context()'::regprocedure))>0,'Edge context verifies active application session');
select ok(position('app_metadata' in pg_get_functiondef('app_public.candidate_edge_context()'::regprocedure))>0,'Edge context returns trusted application role');
select ok(position("'shopper'" in lower(pg_get_functiondef('app_public.candidate_edge_context()'::regprocedure)))>0,'Shopper is an allowed Candidate role');
select ok(position("'representative'" in lower(pg_get_functiondef('app_public.candidate_edge_context()'::regprocedure)))>0,'Representative is an allowed Candidate role');
select ok(position("'administrator'" in lower(pg_get_functiondef('app_public.candidate_edge_context()'::regprocedure)))>0,'Administrator is an allowed Candidate role');
select ok(position('current_session_is_active' in pg_get_functiondef('app_public.candidate_update_trip_idea(uuid,text,text,bigint)'::regprocedure))>0,'update verifies active application session');
select ok(position('owner_user_id=actor' in replace(pg_get_functiondef('app_public.candidate_update_trip_idea(uuid,text,text,bigint)'::regprocedure),' ',''))>0,'update is owner bound');
select ok(position('version=p_expected_version' in replace(pg_get_functiondef('app_public.candidate_update_trip_idea(uuid,text,text,bigint)'::regprocedure),' ',''))>0,'update uses optimistic version control');
select ok(position('version=(version+1)' in replace(pg_get_functiondef('app_public.candidate_update_trip_idea(uuid,text,text,bigint)'::regprocedure),' ',''))>0,'update advances version');
select ok(position('candidate_lifecycle_receipts' in pg_get_functiondef('app_public.candidate_update_trip_idea(uuid,text,text,bigint)'::regprocedure))>0,'update writes content-free receipt');
select ok(position('p_confirmed is not true' in lower(pg_get_functiondef('app_public.unblock_candidate_sender(uuid,boolean)'::regprocedure)))>0,'unblock requires explicit confirmation');
select ok(position('current_session_is_active' in pg_get_functiondef('app_public.unblock_candidate_sender(uuid,boolean)'::regprocedure))>0,'unblock verifies active application session');
select ok(position('blocker_id=actor' in replace(pg_get_functiondef('app_public.unblock_candidate_sender(uuid,boolean)'::regprocedure),' ',''))>0,'unblock is blocker bound');
select ok(position('candidate_lifecycle_receipts' in pg_get_functiondef('app_public.unblock_candidate_sender(uuid,boolean)'::regprocedure))>0,'unblock writes content-free receipt');
select ok(position('current_session_is_active' in pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure))>0,'revoke verifies active application session');
select ok(position('share_row.sender_idisdistinctfromactor' in replace(pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure),' ',''))>0,'revoke is sender bound');
select ok(position("share_row.state<>'pending'" in replace(pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure),' ',''))>0,'only pending shares may be revoked');
select ok(position("action='revoke'" in replace(pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure),' ',''))>0,'revoke supports idempotent replay');
select ok(position("close_reason='revoked'" in replace(pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure),' ',''))>0,'revoke uses the canonical terminal reason');
select ok(position('candidate_lifecycle_receipts' in pg_get_functiondef('app_public.revoke_candidate_share(uuid,text)'::regprocedure))>0,'revoke writes content-free receipt');
select ok(exists(select 1 from pg_constraint where conname='candidate_lifecycle_receipts_subject_kind_check'
  and pg_get_constraintdef(oid) like '%candidate_block%' and pg_get_constraintdef(oid) like '%candidate_share%'),
  'receipt subjects cover update, unblock, and revoke lifecycles');

select * from finish();
rollback;
