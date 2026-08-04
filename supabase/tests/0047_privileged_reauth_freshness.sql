begin;
select plan(12);

select has_function('app_private','current_session_has_privileged_reauth',array['interval'],'authoritative privileged reauthentication helper exists');
select ok(not has_function_privilege('authenticated','app_private.current_session_has_privileged_reauth(interval)','EXECUTE'),'browser cannot call privileged proof helper');
select ok(position("array['password']" in pg_get_functiondef('app_private.current_session_has_privileged_reauth(interval)'::regprocedure))>0,'privileged proof requires fresh password AMR');
select ok(position("array['totp','recovery_code']" in pg_get_functiondef('app_private.current_session_has_privileged_reauth(interval)'::regprocedure))>0,'privileged proof requires fresh enrolled MFA AMR');
select ok(position("claims->>'aal'='aal2'" in pg_get_functiondef('app_private.current_session_has_privileged_reauth(interval)'::regprocedure))>0,'privileged MFA proof requires provider AAL2');
select ok(position('least(' in pg_get_functiondef('app_private.current_session_has_privileged_reauth(interval)'::regprocedure))>0
  and position("interval '10 minutes'" in pg_get_functiondef('app_private.current_session_has_privileged_reauth(interval)'::regprocedure))>0,'callers cannot widen the ten-minute ceiling');
select ok(position('current_session_has_privileged_reauth' in pg_get_functiondef('app_private.current_session_recent_auth(interval)'::regprocedure))>0,'recent-auth gate uses dual-factor authoritative proof');
select ok(position("interval '10 minutes'" in pg_get_functiondef('app_private.current_session_has_mfa()'::regprocedure))>0,'MFA gate rejects ancient AMR');
select ok(position('current_session_has_privileged_reauth' in pg_get_functiondef('app_private.current_session_has_privacy_reauth()'::regprocedure))>0,'privacy operations use the same bounded proof');

select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(
  jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
  jsonb_build_object('method','totp','timestamp',(extract(epoch from statement_timestamp())-601)::bigint)
),'aal','aal2')::text,true);
select is(app_private.current_jwt_has_recent_amr(array['totp'],interval '10 minutes'),false,'an MFA AMR older than ten minutes is rejected');
select is(app_private.current_jwt_has_recent_amr(array['password'],interval '10 minutes'),true,'a fresh password AMR remains independently valid');
select is(app_private.current_jwt_has_recent_amr(array['password'],interval '15 minutes'),true,'low-level helper remains bounded by its explicit caller window');

select * from finish();
rollback;
