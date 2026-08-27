begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select has_table('review_private','reviewer_credential_reuse_keys','environment reuse keys are isolated');
select has_table('review_private','reviewer_credential_reuse_markers','credential reuse markers are isolated');
select has_column('review_private','reviewer_management_capabilities','registration_target_count','setup capabilities have an exact registration target');
select has_column('review_private','reviewer_management_capabilities','registration_completed_count','setup capabilities track verified completions');
select ok((select count(*)=2 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='review_private' and c.relname in ('reviewer_credential_reuse_keys','reviewer_credential_reuse_markers') and c.relrowsecurity and c.relforcerowsecurity),'reuse tables force RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='review_private' and table_name in ('reviewer_credential_reuse_keys','reviewer_credential_reuse_markers') and grantee in ('anon','authenticated','service_role')),'reuse keys and markers are never browser-readable');
select ok((select pg_get_constraintdef(oid) like '%registration_target_count = 2%' from pg_constraint where conrelid='review_private.reviewer_management_capabilities'::regclass and conname='reviewer_capability_registration_progress'),'setup and recovery target exactly two verified registrations');
select ok(exists(select 1 from pg_indexes where schemaname='review_private' and indexname='one_live_reviewer_setup_capability' and indexdef like '%enrollment%recovery%'),'only one live setup or recovery capability exists per reviewer');

select has_function('review_private','configure_reviewer_credential_reuse_key',array['text','bigint','bytea','bytea'],'reuse-key configuration is explicit');
select has_function('review_private','retire_reviewer_credential',array['uuid','timestamp with time zone'],'credential authority retirement is centralized');
select ok(has_function_privilege('review_credential_configurator','review_private.configure_reviewer_credential_reuse_key(text,bigint,bytea,bytea)','EXECUTE') and not has_function_privilege('authenticated','review_private.configure_reviewer_credential_reuse_key(text,bigint,bytea,bytea)','EXECUTE'),'only the evidence configurator installs an environment key');
select ok(position('extensions.hmac' in lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)))>0 and position($q$k.environment||'|'$q$ in replace(lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)),' ',''))>0,'reuse marker is environment-keyed HMAC rather than a plain digest');
select ok(position($q$interval '90 days'$q$ in lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)))>0,'reuse marker retention is bounded to ninety days');
select ok(position('credential_record_id=null' in replace(lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)),' ',''))>0 and position($q$result=jsonb_build_object('state','expired')$q$ in replace(lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)),' ',''))>0 and position('delete from review_private.reviewer_credentials' in lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)))>0,'retirement unlinks and scrubs receipts then deletes credential authority and reviewer FK');
select ok(position('public_key_digest' in lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)))=0 and position('provider_credential_id' in lower(pg_get_functiondef('review_private.retire_reviewer_credential(uuid,timestamp with time zone)'::regprocedure)))=0,'retirement retains none of the public-key or provider authority material');
select ok(exists(select 1 from pg_trigger where tgname='reviewer_credentials_guarded_delete' and not tgisinternal),'credential rows cannot delete without a retained keyed marker');

select ok(position($q$p_scope='management' and p_expires_at>statement_timestamp()+interval '10 minutes'$q$ in lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)))>0,'management capability is limited to ten minutes');
select ok(position($q$p_scope='enrollment'$q$ in lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)))>0 and position('reviewer_credentials' in lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)))>0,'a partial enrollment cannot restart under a different capability');
select ok(position($q$p_scope='recovery'$q$ in lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)))>0 and position('retire_reviewer_credential' in lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)))>0,'recovery retires all old credential authority before replacement');
select ok(position($q$state='revoked'$q$ in replace(lower(pg_get_functiondef('review_private.issue_reviewer_management_capability(uuid,text,uuid,bytea,text,timestamp with time zone,uuid)'::regprocedure)),' ',''))>0,'recovery revokes every old live capability');

select ok(has_function_privilege('anon','app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)','EXECUTE') and not has_function_privilege('authenticated','app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)','EXECUTE'),'setup challenge exchange uses capability authority without sign-in');
select ok(has_function_privilege('anon','app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','app_public.reviews_manage_reviewer_credentials(text,text,uuid,uuid)','EXECUTE'),'management uses capability authority without sign-in');
select ok(position('app_public.request_user_id()' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))=0 and position('current_session' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))=0,'challenge exchange has no account-session seam');
select ok(position('select * into c from review_private.reviewer_credential_challenges where idempotency_key=p_idempotency_key' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))<position($q$cap.state<>'active'$q$ in replace(lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)),' ','')),'lost challenge responses replay after exact capability consumption');
select ok(position('for update' in lower(pg_get_functiondef('review_private.consume_registration_capability()'::regprocedure)))>0 and position('registration_completed_count+1' in replace(lower(pg_get_functiondef('review_private.consume_registration_capability()'::regprocedure)),' ',''))>0,'concurrent registration completions serialize and increment server state');
select ok(position('next_count=registration_target_count' in replace(lower(pg_get_functiondef('review_private.consume_registration_capability()'::regprocedure)),' ',''))>0,'setup capability consumes only on the exact second completion');
select ok(position('registration_completed_count>=cap.registration_target_count' in replace(lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)),' ',''))>0,'a consumed two-registration capability cannot issue an extra challenge');
select ok(position('reviewer_credential_reuse_markers' in lower(pg_get_functiondef('review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint)'::regprocedure)))>0 and position('extensions.hmac' in lower(pg_get_functiondef('review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,boolean,bigint)'::regprocedure)))>0,'registration rejects retained credential reuse across key versions');

select ok(position('retire_reviewer_credential' in lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)))>0 and position('relationship_ended_at' in lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)))>0,'relationship-end lifecycle deletes credential authority');
select ok(position('for update of c skip locked' in lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)))>0 and position('for update skip locked' in lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)))>0,'credential and marker lifecycle claims serialize safely');
select ok(position('delete from review_private.reviewer_credential_reuse_markers' in lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)))>0 and position('purge_after<=p_now' in replace(lower(pg_get_functiondef('review_private.purge_reviewer_management_capabilities(timestamp with time zone,integer)'::regprocedure)),' ',''))>0,'ninety-day reuse markers are deleted when due');

-- Root cause (#121): review_private functions execute only for their owner
-- (review_automation) or the named capability roles, so the postgres do-block
-- died with 42501 on configure_reviewer_credential_reuse_key after 31 of 36
-- planned tests. Assume the owner role for this transaction only (rolled back
-- below).
grant review_automation to postgres;
do $$
declare marker bytea;
begin
  perform review_private.configure_reviewer_credential_reuse_key('test',9001,decode(repeat('aa',32),'hex'),decode(repeat('bb',32),'hex'));
  perform review_private.configure_reviewer_verifier('reviewer.test','https://reviewer.test','provider-key',decode(repeat('cc',32),'hex'),1);
  insert into review_private.reviewer_identities(reviewer_identity_id,qualification_receipt_digest)
    values('71000000-0000-4000-8000-000000000001',decode(repeat('dd',32),'hex'));
  insert into review_private.reviewer_management_capabilities(capability_id,reviewer_identity_id,scope,token_hash,delivery_verification_id,issuance_idempotency_key,expires_at)
    values('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','enrollment',decode(repeat('ee',32),'hex'),'test-delivery','71000000-0000-4000-8000-000000000003',statement_timestamp()+interval '20 minutes');
  insert into review_private.reviewer_credential_challenges(challenge_id,reviewer_identity_id,ceremony,idempotency_key,request_digest,challenge_nonce,challenge_digest,rp_id,expected_origin,expires_at,capability_id)
    values('71000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','registration','71000000-0000-4000-8000-000000000005',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),decode(repeat('03',32),'hex'),'reviewer.test','https://reviewer.test',statement_timestamp()+interval '5 minutes','71000000-0000-4000-8000-000000000002');
  marker:=extensions.hmac(convert_to('test|'||repeat('04',32),'utf8'),decode(repeat('aa',32),'hex'),'sha256');
  insert into review_private.reviewer_credential_reuse_markers(reuse_hmac,key_version,created_at,purge_after)
    values(marker,9001,statement_timestamp()-interval '91 days',statement_timestamp()-interval '1 day');
end $$;

select lives_ok($$select review_private.complete_reviewer_registration('71000000-0000-4000-8000-000000000004',decode(repeat('04',32),'hex'),decode(repeat('05',32),'hex'),'provider-credential-reused','provider-verification-reused','provider-key',false,0)$$,'an expired marker is atomically removed before credential re-registration');
select is((select count(*) from review_private.reviewer_credential_reuse_markers where key_version=9001),0::bigint,'re-registration removed the exact expired reuse marker');
select lives_ok($$select review_private.retire_reviewer_credential((select credential_record_id from review_private.reviewer_credentials where credential_id_digest=decode(repeat('04',32),'hex')),statement_timestamp())$$,'the re-registered credential can later retire and unlink successfully');
select is((select count(*) from review_private.reviewer_credentials where credential_id_digest=decode(repeat('04',32),'hex')),0::bigint,'retirement deleted the re-registered credential authority row');
select ok((select purge_after>created_at and purge_after<=created_at+interval '90 days' from review_private.reviewer_credential_reuse_markers where key_version=9001),'replacement reuse marker restarts one bounded ninety-day window');

select * from finish();
rollback;
