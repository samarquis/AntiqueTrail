begin;
select plan(13);

select has_function('app_private','current_jwt_has_recent_amr',array['text[]','interval'],'authoritative AMR helper exists');
select ok(not has_function_privilege('authenticated','app_private.current_jwt_has_recent_amr(text[],interval)','EXECUTE'),'browser cannot call AMR helper');
select ok(position("array['password']" in pg_get_functiondef('app_private.current_session_recent_auth(interval)'::regprocedure))>0,'recent auth requires password AMR');
select ok(position('last_authenticated_at' in pg_get_functiondef('app_private.current_session_recent_auth(interval)'::regprocedure))=0,'mutable registry timestamp cannot authorize recent auth');
select ok(position('provider_user_has_verified_mfa' in pg_get_functiondef('app_private.current_session_has_mfa()'::regprocedure))>0,'MFA checks provider-owned enrollment');
select ok(position("claims->>'aal'='aal2'" in pg_get_functiondef('app_private.current_session_has_mfa()'::regprocedure))>0,'MFA requires provider AAL2');
select ok(position("'totp','recovery_code'" in pg_get_functiondef('app_private.current_session_has_mfa()'::regprocedure))>0,'MFA proof accepts enrolled TOTP or recovery fallback');
select ok(position('last_authenticated_at=statement_timestamp()' in replace(pg_get_functiondef('app_public.register_current_session(bigint)'::regprocedure),' ',''))=0,'registration cannot refresh authentication freshness');
select ok(position('mfa_verified_at' in pg_get_functiondef('app_public.register_current_session(bigint)'::regprocedure))=0,'registration cannot mint MFA proof');
select ok(position('access_token_expires_at=excluded.access_token_expires_at' in replace(pg_get_functiondef('app_public.register_current_session(bigint)'::regprocedure),' ',''))>0,'repeat registration updates expiry bookkeeping only');

select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object(
  'method','password','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
select ok(app_private.current_jwt_has_recent_amr(array['password'],interval '10 minutes'),'fresh signed password AMR is accepted');
select set_config('request.jwt.claims','{"amr":[{"method":"password","timestamp":"not-a-time"}]}',true);
select is(app_private.current_jwt_has_recent_amr(array['password'],interval '10 minutes'),false,'malformed AMR fails closed');
select set_config('request.jwt.claims',jsonb_build_object('amr',jsonb_build_array(jsonb_build_object(
  'method','password','timestamp',(extract(epoch from statement_timestamp())+120)::bigint)))::text,true);
select is(app_private.current_jwt_has_recent_amr(array['password'],interval '10 minutes'),false,'future-dated AMR fails closed');

select * from finish();
rollback;
