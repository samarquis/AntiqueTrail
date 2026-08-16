begin;
select plan(20);

select has_function('app_public','candidate_save_candidate',array['jsonb'],'candidate save command exists');
select has_function('app_public','candidate_list_shares',array[]::text[],'candidate share list exists');
select has_function('app_public','candidate_get_share',array['uuid'],'candidate share detail exists');
select has_function('app_public','candidate_dismiss_share',array['uuid'],'candidate dismiss command exists');
select has_function('app_public','candidate_list_trip_ideas',array[]::text[],'candidate idea list exists');
select has_function('app_public','candidate_delete_trip_idea',array['uuid'],'candidate idea delete exists');
select has_function('app_public','partner_safe_command',array['text','jsonb'],'partner safe command exists');
select ok(has_function_privilege('authenticated','app_public.candidate_save_candidate(jsonb)','EXECUTE'),'authenticated may save private candidates');
select ok(has_function_privilege('authenticated','app_public.partner_safe_command(text,jsonb)','EXECUTE'),'authenticated may use safe synthetic partner commands');
select ok(not has_function_privilege('anon','app_public.candidate_save_candidate(jsonb)','EXECUTE'),'anonymous candidate save denied');
select ok(not has_function_privilege('anon','app_public.partner_safe_command(text,jsonb)','EXECUTE'),'anonymous partner command denied');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public' and p.proname='candidate_save_candidate'),'candidate save is security definer');
select ok((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public' and p.proname='partner_safe_command'),'partner command is security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public' and p.proname='candidate_save_candidate'),'candidate command fixes search path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public' and p.proname='partner_safe_command'),'partner command fixes search path');
select ok(position('app_public.request_user_id()' in pg_get_functiondef('app_public.candidate_save_candidate(jsonb)'::regprocedure))>0,'candidate actor is session derived');
select ok(position('app_public.request_user_id()' in pg_get_functiondef('app_public.partner_safe_command(text,jsonb)'::regprocedure))>0,'partner actor is session derived');
select ok(position('submit_authority_signal' in pg_get_functiondef('app_public.partner_safe_command(text,jsonb)'::regprocedure))=0,'provider authority signals are excluded from safe RPC');
select ok(position('exchange_invitation' in pg_get_functiondef('app_public.partner_safe_command(text,jsonb)'::regprocedure))=0,'raw invitation exchange is excluded from safe RPC');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema in ('candidate_private','partner_private') and grantee='authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')),'safe RPCs add no private-table browser writes');

select * from finish();
rollback;
