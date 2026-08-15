begin;
select plan(25);

select has_table('app_private','account_lifecycle_operations_cases','exhausted lifecycle work opens an operations case');
select has_function('app_public','claim_due_account_deletions',array['timestamptz','integer'],'day-8 deletion claim exists');
select has_function('app_public','prepare_account_deletion',array['uuid','uuid','timestamptz'],'claimed deletion can purge application data');
select has_function('app_public','complete_account_deletion',array['uuid','uuid','timestamptz'],'provider-confirmed deletion can finalize');
select has_function('app_public','fail_account_deletion',array['uuid','uuid','timestamptz','text'],'failed deletion remains retryable');
select ok(has_function_privilege('account_lifecycle_service','app_public.claim_due_account_deletions(timestamptz,integer)','EXECUTE')
  and not has_function_privilege('authenticated','app_public.claim_due_account_deletions(timestamptz,integer)','EXECUTE'),'only lifecycle worker can claim deletion');
select ok(position('pg_try_advisory_xact_lock' in pg_get_functiondef('app_public.claim_due_account_deletions(timestamptz,integer)'::regprocedure))>0,'claim uses advisory singleton lock');
select ok(position('statement_timestamp()' in pg_get_functiondef('app_public.claim_due_account_deletions(timestamptz,integer)'::regprocedure))>0,'claim uses database time');
select ok(position('statement_timestamp()' in pg_get_functiondef('app_public.complete_account_deletion(uuid,uuid,timestamptz)'::regprocedure))>0,'completion uses database time');
select ok(position('statement_timestamp()' in pg_get_functiondef('app_public.fail_account_deletion(uuid,uuid,timestamptz,text)'::regprocedure))>0,'retry scheduling uses database time');

insert into auth.users(id) values
 ('37000000-0000-4000-8000-000000000001'),('37000000-0000-4000-8000-000000000002');
insert into app_private.profiles(user_id,verified_email_snapshot,public_display_name,age_18_attested_at,last_authenticated_at,status,deletion_due_at)
values('37000000-0000-4000-8000-000000000001','delete@example.test','DELETE-ME',statement_timestamp(),statement_timestamp(),'deletion_scheduled','2026-08-01T00:00:00Z'),
 ('37000000-0000-4000-8000-000000000002','sibling@example.test','KEEP-ME',statement_timestamp(),statement_timestamp(),'active',null);
insert into shopper_private.private_store_memories(user_id,store_id,note)
values('37000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','DELETE-PRIVATE');
insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date)
values('37000000-0000-4000-8000-000000000010','37000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Sibling trip','2026-08-04');
insert into trip_private.trip_participants(trip_id,user_id,participant_role)
values('37000000-0000-4000-8000-000000000010','37000000-0000-4000-8000-000000000002','creator'),
 ('37000000-0000-4000-8000-000000000010','37000000-0000-4000-8000-000000000001','partner');
insert into app_private.account_export_jobs(export_job_id,user_id,state,completed_at,expires_at,archive_object_key,archive_checksum,archive_bytes)
values('37000000-0000-4000-8000-000000000020','37000000-0000-4000-8000-000000000001','ready','2026-07-31','2026-08-07','account-exports/37000000-0000-4000-8000-000000000001/archive.json',decode(repeat('ab',32),'hex'),100);
insert into candidate_private.candidate_links(candidate_id,owner_user_id,title,extraction_state)
values('37000000-0000-4000-8000-000000000040','37000000-0000-4000-8000-000000000001','TERMINAL-RECEIVED-SECRET','saved');
insert into candidate_private.candidate_shares(share_id,candidate_id,sender_id,recipient_id,recipient_email_hmac,state,close_reason,closed_at)
values('37000000-0000-4000-8000-000000000041','37000000-0000-4000-8000-000000000040','37000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000002',decode(repeat('cd',32),'hex'),'closed','dismissed',statement_timestamp());
insert into app_private.account_export_jobs(export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at,attempt_count)
values('37000000-0000-4000-8000-000000000042','37000000-0000-4000-8000-000000000002','building','37000000-0000-4000-8000-000000000043',statement_timestamp(),statement_timestamp()+interval '5 minutes',1);
insert into app_private.account_deletion_requests(deletion_request_id,user_id,requested_at,due_at)
values('37000000-0000-4000-8000-000000000030','37000000-0000-4000-8000-000000000001','2026-07-25T00:00:00Z','2026-08-01T00:00:00Z');

set local role account_lifecycle_service;
select ok(position('TERMINAL-RECEIVED-SECRET' in app_public.build_account_export('37000000-0000-4000-8000-000000000042','37000000-0000-4000-8000-000000000043'))=0,'received terminal Candidate shares export no title or payload');
create temporary table claimed_deletion as select * from app_public.claim_due_account_deletions('1999-01-01',10);
reset role;
select is((select count(*)::integer from claimed_deletion),1,'due request is claimed even when caller supplies stale time');
select is((select storage_objects->0->>'bucket_id' from claimed_deletion),'account-exports','claim freezes account archive Storage cleanup');
select lives_ok($$select app_public.prepare_account_deletion('37000000-0000-4000-8000-000000000030',(select claim_token from claimed_deletion),'1999-01-01')$$,'exact claim prepares deletion');
select is((select count(*)::integer from shopper_private.private_store_memories where user_id='37000000-0000-4000-8000-000000000001'),0,'account-owned shopper data is purged');
select is((select count(*)::integer from trip_private.trips where trip_id='37000000-0000-4000-8000-000000000010'),1,'shared sibling trip survives');
select is((select count(*)::integer from trip_private.trip_participants where trip_id='37000000-0000-4000-8000-000000000010' and user_id='37000000-0000-4000-8000-000000000001'),0,'deleting participant linkage is purged');
select is((select count(*)::integer from app_private.profiles where user_id='37000000-0000-4000-8000-000000000001'),0,'public display/profile is purged before provider deletion');
select lives_ok($$select app_public.prepare_account_deletion('37000000-0000-4000-8000-000000000030',(select claim_token from claimed_deletion),'1999-01-01')$$,'prepare is idempotent');
select lives_ok($$select app_public.complete_account_deletion('37000000-0000-4000-8000-000000000030',(select claim_token from claimed_deletion),'1999-01-01')$$,'provider-confirmed claim finalizes');
select is((select state from app_private.account_deletion_requests where deletion_request_id='37000000-0000-4000-8000-000000000030'),'completed','request becomes completed');
select is((select count(*)::integer from app_private.deletion_receipts where deletion_request_id='37000000-0000-4000-8000-000000000030'),1,'one content-free receipt is retained');
select ok((select user_id is null and subject_tombstone is not null from app_private.account_deletion_requests where deletion_request_id='37000000-0000-4000-8000-000000000030'),'receipt linkage is replaced with an opaque random tombstone');
select lives_ok($$select app_public.complete_account_deletion('37000000-0000-4000-8000-000000000030',(select claim_token from claimed_deletion),'1999-01-01')$$,'completion replay is idempotent');

select * from finish();
rollback;
