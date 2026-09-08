begin;

select plan(22);

select has_table('review_private','appeal_reviewer_capabilities','appeal capability table exists');
select has_table('review_private','appeal_reviewer_challenges','appeal challenge table exists');
select has_table('review_private','appeal_reviewer_assertion_receipts','appeal assertion table exists');
select has_table('review_private','appeal_reviewer_decisions','appeal decision table exists');
select has_function('app_public','reviews_request_independent_appeal_assertion',array['text','uuid'],'appeal assertion request exists');
select has_function('app_public','reviews_complete_independent_appeal_assertion',array['uuid','bytea','bytea','text','text','bigint'],'appeal assertion completion exists');
select has_function('app_public','reviews_get_independent_appeal_packet',array['text','uuid'],'packet read requires capability and assertion');
select has_function('app_public','reviews_submit_independent_appeal',array['text','uuid','bytea','text','text','uuid'],'atomic appeal decision exists');
select has_function('review_private','issue_appeal_reviewer_capability',array['uuid','uuid','bytea','uuid'],'trusted capability issuance exists');
select has_function('review_private','revoke_appeal_reviewer_capability',array['uuid'],'immediate capability revocation exists');
select ok(has_function_privilege('anon','app_public.reviews_get_independent_appeal_packet(text,uuid)','EXECUTE'),'packet read is an opaque capability boundary');
select ok(not has_function_privilege('authenticated','app_public.reviews_get_independent_appeal_packet(text,uuid)','EXECUTE'),'ordinary authenticated sessions cannot read packets');
select ok(has_function_privilege('anon','app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)','EXECUTE'),'decision transport has no normal session dependency');
select ok(not has_function_privilege('authenticated','app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)','EXECUTE'),'ordinary authenticated sessions cannot decide');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='review_private.appeal_reviewer_capabilities'::regclass),'capabilities force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='review_private.appeal_reviewer_decisions'::regclass),'decisions force RLS');
select ok((select pg_get_constraintdef(oid) ilike '%octet_length(token_hash)=32%' from pg_constraint where conrelid='review_private.appeal_reviewer_capabilities'::regclass and contype='c'),'only token hashes persist');
select ok(position('i.user_id=c.original_moderator_id' in lower(pg_get_functiondef('app_public.reviews_get_independent_appeal_packet(text,uuid)'::regprocedure)))>0,'original moderator is denied');
select ok(position('packet_hash<>p_packet_hash' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision binds the frozen packet hash');
select ok(position('state=''consumed''' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision consumes the capability');
select ok(position('rebuild_rating_aggregate' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'aggregate mutation is in the decision transaction');
select ok(position('append_audit' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision appends audit in the transaction');

select * from finish();
rollback;
