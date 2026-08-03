begin;
select plan(21);

select has_table('app_private','account_registration_config','registration config exists');
select has_table('app_private','registration_quarantine_latch','quarantine latch exists');
select has_table('app_private','account_admission_receipts','admission receipts exist');
select has_table('app_private','registration_provider_operations','provider operation ledger exists');
select has_table('app_private','account_export_jobs','export jobs exist');
select has_table('app_private','account_deletion_requests','deletion requests exist');
select has_table('app_private','deletion_receipts','deletion receipts exist');
select has_table('app_private','job_runs','job run ledger exists');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='account_admission_receipts'),'admissions FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='account_deletion_requests'),'deletions FORCE RLS enabled');
select is((select mode from app_private.account_registration_config where id=1),'closed','registration is closed by default');
select is((select state from app_private.registration_quarantine_latch where id=1),'open','quarantine latch starts open');
select ok(not exists (select 1 from information_schema.columns where table_schema='app_private' and column_name in ('raw_token','password','access_token','refresh_token')),'no bearer/password columns are persisted');

set local role anon;
select throws_ok($$select * from app_private.account_admission_receipts$$,'42501','anonymous admission reads denied');
select throws_ok($$insert into app_private.account_registration_config(mode) values ('public')$$,'42501','anonymous registration config writes denied');
reset role;
set local role authenticated;
select is(app_private.current_session_is_cancellation_only(),false,'unauthenticated cancellation-only gate fails closed');
select throws_ok($$select * from app_private.account_deletion_requests$$,'42501','authenticated direct deletion reads denied');
select is(app_private.current_user_has_role('administrator'::app_private.app_role),false,'authenticated role cannot self-assign through direct gate');
reset role;

set local role identity_service;
select lives_ok($$insert into app_private.account_admission_receipts(token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,claim_expires_at) values (extensions.digest('token','sha256'), 'shopper', extensions.digest('email','sha256'), statement_timestamp(), 'valid-fixture', statement_timestamp() + interval '30 minutes')$$,'valid admission stores only hash/HMAC material');
select throws_ok($$update app_private.account_admission_receipts set state='claimed'$$,'42501','admission rows cannot be directly updated by runtime role');
select throws_ok($$insert into app_private.account_admission_receipts(token_hash,purpose,email_hmac,age_18_attested_at,idempotency_key,claim_expires_at) values (extensions.digest('short','sha256') || decode('00','hex'), 'shopper', extensions.digest('email','sha256'), statement_timestamp(), 'invalid', statement_timestamp())$$,'23514','invalid admission hash is rejected');
select * from finish();
rollback;
