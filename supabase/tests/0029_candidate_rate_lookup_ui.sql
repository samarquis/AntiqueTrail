begin;
select plan(38);

select has_table('candidate_private','candidate_rate_events','Candidate sliding-window events exist');
select has_table('candidate_private','candidate_concurrency_leases','Candidate extraction leases exist');
select has_function('app_public','candidate_reserve_operation',array['text','bytea','bytea'],'atomic Candidate reservation exists');
select has_function('app_public','candidate_release_operation',array['uuid'],'Candidate lease release exists');
select has_function('candidate_private','exact_verified_auth_user_by_email',array['text'],'private exact Auth lookup exists');
select has_function('app_public','candidate_edge_exact_recipient',array['text','bytea'],'service recipient lookup RPC exists');
select has_function('app_public','candidate_list_blocked_senders',array[]::text[],'blocked sender list exists');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='candidate_private' and c.relname='candidate_rate_events'),'rate events force RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='candidate_private' and c.relname='candidate_concurrency_leases'),'leases force RLS');
select ok(not has_table_privilege('authenticated','candidate_private.candidate_rate_events','SELECT'),'browser cannot read rate events');
select ok(not has_table_privilege('authenticated','candidate_private.candidate_concurrency_leases','SELECT'),'browser cannot read leases');
select ok(exists(select 1 from pg_constraint where conname='candidate_rate_retention'
  and pg_get_constraintdef(oid) like '%90 days%'),'rate events have a 90-day maximum');
select ok(exists(select 1 from pg_constraint where conname='candidate_lease_retention'
  and pg_get_constraintdef(oid) like '%90 days%'),'leases have a 90-day maximum');
select ok(exists(select 1 from pg_constraint where conname='candidate_lease_bound'
  and pg_get_constraintdef(oid) like '%00:00:30%'),'extraction leases are short bounded operations');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure))>0,'reservation atomically locks opaque keys');
select ok(position('array[10,30,5]' in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'extraction account IP and host limits are exact');
select ok(position('array[10,5,30]' in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'share account recipient and IP limits are exact');
select ok(position($q$interval'1hour'$q$ in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'extraction uses one-hour sliding windows');
select ok(position($q$interval '1 day'$q$ in pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure))>0,'share send uses one-day sliding windows');
select ok(position('occurred_at>now_at-windows[index_value]' in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'counts use event-time sliding windows');
select ok(position('event_count>=limits[index_value]' in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'limit boundary denies before limit plus one');
select ok(position(')>=2' in replace(pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure),' ',''))>0,'only two account extraction leases may be active');
select ok(position('device_session_digest' in pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure))>0,'device session contributes opaque rate evidence');
select ok(position($q$'retryAfter'$q$ in pg_get_functiondef('app_public.candidate_reserve_operation(text,bytea,bytea)'::regprocedure))>0,'denials return bounded retry guidance');
select ok(position('released_at=statement_timestamp()' in replace(pg_get_functiondef('app_public.candidate_release_operation(uuid)'::regprocedure),' ',''))>0,'release closes the exact lease');
select ok(position('actor_user_id=actor' in replace(pg_get_functiondef('app_public.candidate_release_operation(uuid)'::regprocedure),' ',''))>0,'lease release is actor bound');
select is((select r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_roles r on r.oid=p.proowner where n.nspname='candidate_private'
  and p.proname='exact_verified_auth_user_by_email'),'postgres','private Auth helper is postgres-owned');
select ok(position('from auth.users' in lower(pg_get_functiondef('candidate_private.exact_verified_auth_user_by_email(text)'::regprocedure)))>0,'helper reads authoritative Auth users');
select ok(position('u.email=p_normalized_email' in replace(pg_get_functiondef('candidate_private.exact_verified_auth_user_by_email(text)'::regprocedure),' ',''))>0,'helper uses static exact email equality');
select ok(position('like' in lower(pg_get_functiondef('candidate_private.exact_verified_auth_user_by_email(text)'::regprocedure)))=0,'helper has no partial email lookup');
select ok(position('email_confirmed_at is not null' in lower(pg_get_functiondef('candidate_private.exact_verified_auth_user_by_email(text)'::regprocedure)))>0,'only verified provider emails match');
select ok(not has_function_privilege('authenticated','app_public.candidate_edge_exact_recipient(text,bytea)','EXECUTE'),'browser cannot invoke exact provider lookup');
select ok(has_function_privilege('service_role','app_public.candidate_edge_exact_recipient(text,bytea)','EXECUTE'),'only server service role may invoke recipient lookup');
select ok(not has_function_privilege('identity_service','candidate_private.exact_verified_auth_user_by_email(text)','EXECUTE'),'custom runtime role cannot query Auth helper');
select ok(position('recipientId' in pg_get_functiondef('app_public.candidate_edge_exact_recipient(text,bytea)'::regprocedure))>0
  and position('recipientDigest' in pg_get_functiondef('app_public.candidate_edge_exact_recipient(text,bytea)'::regprocedure))>0,'lookup returns only needed UUID and digest');
select ok(position('p_recipient_id is null' in pg_get_functiondef('app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text)'::regprocedure))>0,'unmatched recipient returns generic pending without payload');
select ok(position('candidate_blocks' in pg_get_functiondef('app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text)'::regprocedure))>0,'blocked recipient returns the same generic path');
select ok(position('blocker_id=app_public.request_user_id()' in replace(pg_get_functiondef('app_public.candidate_list_blocked_senders()'::regprocedure),' ',''))>0,'blocked sender list is owner bound');

select * from finish();
rollback;
