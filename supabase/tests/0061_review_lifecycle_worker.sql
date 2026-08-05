begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_function('app_public','run_due_review_lifecycle',array['timestamp with time zone','integer'],'bounded review lifecycle sweep exists');
select function_owner_is('app_public','run_due_review_lifecycle',array['timestamp with time zone','integer'],'review_automation','review automation owns the sweep');
select ok(has_function_privilege('account_lifecycle_service','app_public.run_due_review_lifecycle(timestamptz,integer)','EXECUTE'),'only the lifecycle service can execute the sweep');
select ok(not has_function_privilege('anon','app_public.run_due_review_lifecycle(timestamptz,integer)','EXECUTE'),'anonymous callers cannot purge reviews');
select ok(not has_function_privilege('authenticated','app_public.run_due_review_lifecycle(timestamptz,integer)','EXECUTE'),'browser sessions cannot purge reviews');
select throws_ok($$select app_public.run_due_review_lifecycle(null,100)$$,'22023','review_lifecycle_input_invalid','missing authoritative time denies');
select throws_ok($$select app_public.run_due_review_lifecycle(statement_timestamp(),101)$$,'22023','review_lifecycle_input_invalid','unbounded sweeps deny');
select ok(position('for update skip locked limit p_limit' in lower(pg_get_functiondef('app_public.run_due_review_lifecycle(timestamptz,integer)'::regprocedure)))>0,'concurrent sweeps use bounded skip-locked claims');

select * from finish();
rollback;
