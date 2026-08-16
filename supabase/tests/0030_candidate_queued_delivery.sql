begin;
select plan(35);

select has_table('candidate_private','candidate_share_delivery_jobs','durable Candidate delivery queue exists');
select has_table('candidate_private','candidate_share_delivery_receipts','delivery attempt receipts exist');
select has_function('app_public','candidate_enqueue_share_delivery',array['uuid','uuid','bytea','bytea','text'],'service enqueue exists');
select has_function('app_public','candidate_claim_share_delivery',array['uuid'],'worker claim exists');
select has_function('app_public','candidate_complete_share_delivery',array['uuid','uuid','uuid','bytea'],'worker completion exists');
select has_function('app_public','candidate_fail_share_delivery',array['uuid','uuid'],'worker retry exists');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='candidate_private' and c.relname='candidate_share_delivery_jobs'),'delivery queue forces RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='candidate_private' and c.relname='candidate_share_delivery_receipts'),'delivery receipts force RLS');
select ok(not has_table_privilege('authenticated','candidate_private.candidate_share_delivery_jobs','SELECT'),'browser cannot read delivery queue');
select ok(not has_table_privilege('service_role','candidate_private.candidate_share_delivery_jobs','SELECT'),'service role uses only bounded worker RPCs');
select ok(not exists(select 1 from information_schema.columns where table_schema='candidate_private'
  and table_name='candidate_share_delivery_jobs' and column_name in ('recipient_email','email','raw_recipient')),'queue has no raw recipient column');
select has_column('candidate_private','candidate_share_delivery_jobs','encrypted_recipient','recipient is encrypted at rest');
select ok(exists(select 1 from pg_constraint where conname='candidate_delivery_job_retention'
  and pg_get_constraintdef(oid) like '%7 days%'),'protected recipient envelope has a seven-day maximum');
select ok(exists(select 1 from pg_constraint where conname='candidate_delivery_job_state_shape'),'queue lifecycle shape is constrained');
select ok(exists(select 1 from pg_constraint where conname='candidate_delivery_job_lease_bound'),'worker lease is bounded');
select ok(exists(select 1 from pg_trigger where tgname='candidate_delivery_receipts_append_only'),'delivery receipts are append-only');
select ok(not has_function_privilege('authenticated','app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text)','EXECUTE'),'browser cannot bypass Edge admission');
select ok(has_function_privilege('service_role','app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text)','EXECUTE'),'server may enqueue admitted send');
select ok(not has_function_privilege('authenticated','app_public.candidate_claim_share_delivery(uuid)','EXECUTE'),'browser cannot claim worker jobs');
select ok(has_function_privilege('service_role','app_public.candidate_claim_share_delivery(uuid)','EXECUTE'),'authenticated server worker may claim');
select ok(position('owner_user_id=p_sender_user_id' in replace(pg_get_functiondef('app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text)'::regprocedure),' ',''))>0,'enqueue is bound to candidate owner');
select ok(position($q$'queued'$q$ in pg_get_functiondef('app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text)'::regprocedure))>0,'enqueue records durable queued receipt');
select ok(position('exact_verified_auth_user_by_email' in pg_get_functiondef('app_public.candidate_enqueue_share_delivery(uuid,uuid,bytea,bytea,text)'::regprocedure))=0,'request enqueue performs no recipient resolution');
select ok(position('for update skip locked' in lower(pg_get_functiondef('app_public.candidate_claim_share_delivery(uuid)'::regprocedure)))>0,'workers claim jobs atomically');
select ok(position('attempts=attempts+1' in replace(pg_get_functiondef('app_public.candidate_claim_share_delivery(uuid)'::regprocedure),' ',''))>0,'claim increments durable attempt count');
select ok(position($q$state='processing'$q$ in replace(pg_get_functiondef('app_public.candidate_claim_share_delivery(uuid)'::regprocedure),' ',''))>0,'claim creates processing lease');
select ok(position('candidate_blocks' in pg_get_functiondef('app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea)'::regprocedure))>0,'completion rechecks recipient block');
select ok(position($q$result:='delivered'$q$ in replace(pg_get_functiondef('app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea)'::regprocedure),' ',''))>0,'matched eligible delivery is recorded');
select ok(position($q$resulttext:='no_delivery'$q$ in replace(pg_get_functiondef('app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea)'::regprocedure),' ',''))>0,'unmatched unverified or blocked delivery is reason-neutral');
select ok(position('encrypted_recipient=null' in replace(pg_get_functiondef('app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea)'::regprocedure),' ',''))>0,'terminal completion clears protected raw recipient');
select ok(position($q$next_state:=casewhendelivery.attempts>=5then'dead'else'retry'end$q$ in replace(pg_get_functiondef('app_public.candidate_fail_share_delivery(uuid,uuid)'::regprocedure),' ',''))>0,'failure retries up to five attempts');
select ok(position('power(2,delivery.attempts)' in replace(pg_get_functiondef('app_public.candidate_fail_share_delivery(uuid,uuid)'::regprocedure),' ',''))>0,'retry uses bounded exponential delay');
select ok(not has_function_privilege('authenticated','app_public.candidate_edge_send_share(uuid,uuid,bytea,bytea,text)','EXECUTE'),'legacy synchronous send mutation is revoked');
select ok(position('cron.schedule' in lower(pg_get_functiondef('app_public.candidate_claim_share_delivery(uuid)'::regprocedure)))=0,'worker boundary fabricates no scheduler evidence');
select ok(position('recipient_email_hmac' in pg_get_functiondef('app_public.candidate_complete_share_delivery(uuid,uuid,uuid,bytea)'::regprocedure))>0,'delivery uses only recipient UUID and opaque digest');

select * from finish();
rollback;
