begin;
select plan(41);

select has_table('app_private','password_recovery_operations','dedicated recovery operation ledger exists');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='app_private' and c.relname='password_recovery_operations'),'recovery ledger FORCE RLS enabled');
select ok(not exists(select 1 from information_schema.columns where table_schema='app_private'
  and table_name='password_recovery_operations'
  and column_name in ('password','token','access_token','refresh_token','bearer')),
  'recovery ledger stores no credential material');
select ok(not has_table_privilege('service_role','app_private.password_recovery_operations','SELECT'),
  'service role cannot read the recovery ledger directly');
select has_function('app_public','password_recovery_status',array['uuid'],'content-free recovery status exists');
select has_function('app_public','begin_password_recovery',array['uuid','uuid','uuid'],'recovery fence operation exists');
select has_function('app_public','complete_password_recovery',array['uuid'],'recovery completion operation exists');
select has_function('app_public','mark_password_recovery_uncertain',array['uuid'],'uncertain recovery disposition exists');
select has_function('app_public','mark_password_recovery_provider_pending',array['uuid'],'provider retry disposition exists');
select has_function('app_public','complete_provider_revocation',array['text'],'provider outbox completion exists');
select has_function('app_public','complete_provider_revocations_for_user',array['uuid'],'user scoped provider retry helper exists');
select ok(has_function_privilege('service_role','app_public.password_recovery_status(uuid)','EXECUTE'),
  'only the server boundary can read recovery disposition');
select ok(has_function_privilege('service_role','app_public.begin_password_recovery(uuid,uuid,uuid)','EXECUTE'),
  'only the server boundary can begin recovery');
select ok(not has_function_privilege('authenticated','app_public.begin_password_recovery(uuid,uuid,uuid)','EXECUTE'),
  'ordinary authenticated callers cannot begin recovery');
select ok(not has_function_privilege('anon','app_public.complete_password_recovery(uuid)','EXECUTE'),
  'anonymous callers cannot complete recovery');
select ok(position('update app_private.active_sessions' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'begin operation revokes application sessions');
select ok(position('session_epoch=session_epoch+1' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'begin operation advances the application session epoch');
select ok(position('sessions_revoked_before' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'begin operation advances the revocation boundary');
select ok(position('provider_revocation_outbox' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'begin operation enqueues provider revocation');
select ok(position('on conflict (idempotency_key)' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'provider revocation enqueue is idempotent');
select ok(position('provider_session_created_at' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))>0,
  'begin operation validates the provider session boundary');
select ok(position('auth.users' in lower(pg_get_functiondef(
  'app_public.begin_password_recovery(uuid,uuid,uuid)'::regprocedure)))=0,
  'begin operation does not query managed Auth tables directly');

set local role service_role;
select is(app_public.password_recovery_status('00000000-0000-4000-8000-000000000001'),'unknown',
  'unknown request has no revealing disposition');
select throws_ok($$select app_public.begin_password_recovery(
  '00000000-0000-4000-8000-000000000001',
  '25200000-0000-4000-8000-000000000001',
  '25200000-0000-4000-8000-000000000002')$$,
  '42501','password_recovery_unavailable','wrong or absent provider session is denied');
reset role;

select ok(not exists(select 1 from app_private.password_recovery_operations),
  'failed provider-session validation creates no recovery operation');
select ok(not exists(select 1 from app_private.provider_revocation_outbox
  where idempotency_key='00000000-0000-4000-8000-000000000001:provider-revoke'),
  'failed provider-session validation creates no revocation work');

insert into auth.users(id) values ('25200000-0000-4000-8000-000000000001');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  ('25200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',
   statement_timestamp()-interval '1 minute',statement_timestamp()-interval '1 minute');
set local role identity_service;
insert into app_private.profiles(user_id,verified_email_snapshot)
  values ('25200000-0000-4000-8000-000000000001','recovery-252@example.test')
  on conflict (user_id) do update set verified_email_snapshot=excluded.verified_email_snapshot;
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at
) values (
  '25200000-0000-4000-8000-000000000002','25200000-0000-4000-8000-000000000001',
  statement_timestamp()-interval '1 minute',1,statement_timestamp(),statement_timestamp()+interval '1 hour'
);
reset role;

set local role service_role;
select is((app_public.begin_password_recovery(
  '25200000-0000-4000-8000-000000000003',
  '25200000-0000-4000-8000-000000000001',
  '25200000-0000-4000-8000-000000000002'
))->>'state','ready','valid recovery fences the real local application session');
reset role;
select is((select state::text from app_private.active_sessions
  where session_id='25200000-0000-4000-8000-000000000002'),'revoked',
  'valid recovery revokes the real local application session');
select is((select session_epoch from app_private.profiles
  where user_id='25200000-0000-4000-8000-000000000001'),2::bigint,
  'valid recovery advances the real local session epoch');
select ok((select sessions_revoked_before is not null from app_private.profiles
  where user_id='25200000-0000-4000-8000-000000000001'),
  'valid recovery records the real local revocation boundary');
select is((select state from app_private.password_recovery_operations
  where idempotency_key='25200000-0000-4000-8000-000000000003'),'invalidated',
  'valid recovery records an invalidated content-free operation');
select is((select state from app_private.provider_revocation_outbox
  where idempotency_key='25200000-0000-4000-8000-000000000003:provider-revoke'),'pending',
  'valid recovery records pending provider revocation work');

set local role service_role;
select is((app_public.begin_password_recovery(
  '25200000-0000-4000-8000-000000000003',
  '25200000-0000-4000-8000-000000000001',
  '25200000-0000-4000-8000-000000000002'
))->>'state','retry_required','same recovery request is not applied twice');
reset role;
select is((select session_epoch from app_private.profiles
  where user_id='25200000-0000-4000-8000-000000000001'),2::bigint,
  'recovery retry does not advance the application epoch twice');
set local role service_role;
select ok(app_public.complete_provider_revocation(
  '25200000-0000-4000-8000-000000000003:provider-revoke'),
  'provider revocation completion settles the outbox item');
reset role;
select is((select state from app_private.provider_revocation_outbox
  where idempotency_key='25200000-0000-4000-8000-000000000003:provider-revoke'),'sent',
  'provider revocation completion records sent state');
set local role service_role;
select is((app_public.complete_password_recovery(
  '25200000-0000-4000-8000-000000000003'
  ))->>'state','completed','recovery completion records the terminal disposition');
reset role;
select is((select state from app_private.password_recovery_operations
  where idempotency_key='25200000-0000-4000-8000-000000000003'),'completed',
  'completed recovery remains content-free and terminal');
select ok(position('state=''completed''' in lower(pg_get_functiondef(
  'app_public.complete_password_recovery(uuid)'::regprocedure)))>0,
  'completion is a separate terminal disposition');
select ok(position('state=''uncertain''' in lower(pg_get_functiondef(
  'app_public.mark_password_recovery_uncertain(uuid)'::regprocedure)))>0,
  'provider uncertainty is content-free and terminal for this request');
select ok(position('state=''provider_pending''' in lower(pg_get_functiondef(
  'app_public.mark_password_recovery_provider_pending(uuid)'::regprocedure)))>0,
  'provider failure is a content-free retry disposition');
select * from finish();
rollback;
