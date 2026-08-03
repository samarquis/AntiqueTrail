begin;
select plan(17);

select has_schema('app_private', 'private identity schema exists');
select has_table('app_private', 'profiles', 'server-owned profiles table exists');
select has_table('app_private', 'active_sessions', 'application session registry exists');
select has_table('app_private', 'role_grants', 'server-owned role grants exist');
select has_table('app_private', 'privileged_audit_events', 'privileged audit table exists');
select has_table('app_private', 'audit_chain_roots', 'audit root table exists');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='profiles'), 'profiles FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='active_sessions'), 'sessions FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='role_grants'), 'role grants FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname='privileged_audit_events'), 'audit FORCE RLS enabled');

set local role anon;
select is(app_private.current_session_is_active(), false, 'anonymous session is never active');
select throws_ok($$select * from app_private.profiles$$, '42501', 'anonymous direct profile read denied');
select throws_ok($$insert into app_private.session_security_events(event_kind,outcome) values ('login','denied')$$, '42501', 'anonymous security-event write denied');
select throws_ok($$select app_private.current_user_has_role('administrator'::app_private.app_role)$$, '42501', 'anonymous role check denied');
select set_config('request.jwt.claims','{"session_id":"not-a-uuid"}',true);
select is(app_private.current_session_is_active(), false, 'malformed session claim fails closed');

reset role;
set local role identity_service;
insert into app_private.privileged_audit_events(action,outcome,resource_kind,event_hash)
values ('session_revoke','completed','session',extensions.digest('fixture','sha256'));
select ok((select event_hash is not null and octet_length(event_hash)=32 from app_private.privileged_audit_events limit 1), 'audit hash trigger writes a 32-byte event hash');
select throws_ok($$update app_private.privileged_audit_events set action='tampered'$$, '42501', 'audit updates are denied');

reset role;
select * from finish();
rollback;
