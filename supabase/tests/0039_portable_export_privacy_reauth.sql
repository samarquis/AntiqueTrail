begin;
select plan(20);

select has_function('app_private','provider_user_has_verified_mfa',array['uuid'],'provider MFA enrollment helper exists');
select has_function('app_private','current_session_has_privacy_reauth',array[]::text[],'privacy reauthentication gate exists');
select ok(not has_function_privilege('authenticated','app_private.provider_user_has_verified_mfa(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','app_private.current_session_has_privacy_reauth()','EXECUTE'),'browser cannot call provider proof helpers');
select ok(position('auth.mfa_factors' in pg_get_functiondef('app_private.provider_user_has_verified_mfa(uuid)'::regprocedure))>0,'enrollment is read from provider-owned factors');
select ok(position("entry->>'method'='password'" in pg_get_functiondef('app_private.current_session_has_privacy_reauth()'::regprocedure))>0,'fresh password AMR is mandatory');
select ok(position("claims->>'aal'='aal2'" in pg_get_functiondef('app_private.current_session_has_privacy_reauth()'::regprocedure))>0
  and position("'recovery_code'" in pg_get_functiondef('app_private.current_session_has_privacy_reauth()'::regprocedure))>0,'enrolled MFA accepts authoritative TOTP or approved recovery fallback');
select ok(position('current_session_has_privacy_reauth' in pg_get_functiondef('app_public.request_account_export()'::regprocedure))>0,'export request uses provider proof');
select ok(position('current_session_has_privacy_reauth' in pg_get_functiondef('app_public.issue_account_export_download(uuid)'::regprocedure))>0,'download regeneration uses provider proof');
select ok(position('current_session_has_privacy_reauth' in pg_get_functiondef('app_public.request_account_deletion()'::regprocedure))>0,'deletion uses provider proof');
select ok(position('current_session_recent_auth' in pg_get_functiondef('app_public.request_account_export()'::regprocedure))=0,'mutable session timestamp cannot authorize export');
select ok(position('.zip' in pg_get_functiondef('app_public.claim_account_exports(timestamptz,integer)'::regprocedure))>0,'worker claims an exact ZIP object key');
select ok(position('candidate_share_storage_objects' in pg_get_functiondef('app_public.build_account_export(uuid,uuid)'::regprocedure))>0,'allowed user-owned media is included');
select ok(position("s.sender_id=job.user_id" in pg_get_functiondef('app_public.build_account_export(uuid,uuid)'::regprocedure))>0,'media ownership is requester-bound');
select ok(position("s.state in ('pending','accepted')" in pg_get_functiondef('app_public.build_account_export(uuid,uuid)'::regprocedure))>0,'terminal or purged media is excluded');
select ok(position('media_count>100' in replace(pg_get_functiondef('app_public.build_account_export(uuid,uuid)'::regprocedure),' ',''))>0,'portable exports reject unbounded media sets before aggregation');
select ok(position("encode(job.archive_checksum,'hex')" in pg_get_functiondef('app_public.get_account_export_status(uuid)'::regprocedure))>0,'ready status exposes exact SHA-256');
select ok(position("'generatedAt'" in pg_get_functiondef('app_public.get_account_export_status(uuid)'::regprocedure))>0
  and position("'fileSizeBytes'" in pg_get_functiondef('app_public.get_account_export_status(uuid)'::regprocedure))>0,'ready status exposes generation time and byte size');
select ok(position("interval '15 minutes'" in pg_get_functiondef('app_public.issue_account_export_download(uuid)'::regprocedure))=0
  and position('account_export_download_handoffs' in pg_get_functiondef('app_public.issue_account_export_download(uuid)'::regprocedure))>0,'download continues through the one-time handoff table');
select ok(position("'\\.zip$'" in pg_get_functiondef('app_public.complete_account_export(uuid,uuid,text,bytea,bigint,timestamptz)'::regprocedure))>0,'completion accepts only exact ZIP keys');
select ok(position('revoked_at=null' in replace(pg_get_functiondef('app_public.cancel_account_deletion()'::regprocedure),' ',''))>0,'cancellation restores the exact current session without violating active-session shape');

select * from finish();
rollback;
