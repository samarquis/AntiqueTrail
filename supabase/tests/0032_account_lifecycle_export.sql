begin;
select plan(35);

select has_role('account_lifecycle_service','constrained lifecycle worker role exists');
select has_table('app_private','account_export_download_handoffs','one-time download handoffs exist');
select has_table('shopper_private','private_memory_deletion_receipts','content-free memory deletion receipts exist');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='shopper_private' and c.relname='private_memory_deletion_receipts'),'memory deletion receipts force RLS');
select ok(not has_table_privilege('authenticated','shopper_private.private_memory_deletion_receipts','SELECT'),'browser cannot inspect cleanup receipts');
select ok(has_function_privilege('authenticated','app_public.account_lifecycle_status()','EXECUTE')
  and has_function_privilege('authenticated','app_public.request_account_export()','EXECUTE')
  and has_function_privilege('authenticated','app_public.get_account_export_status(uuid)','EXECUTE')
  and has_function_privilege('authenticated','app_public.issue_account_export_download(uuid)','EXECUTE')
  and has_function_privilege('authenticated','app_public.request_account_deletion()','EXECUTE')
  and has_function_privilege('authenticated','app_public.cancel_account_deletion()','EXECUTE'),'browser has only bounded own lifecycle commands');
select ok(not has_function_privilege('authenticated','app_public.claim_account_exports(timestamptz,integer)','EXECUTE'),'browser cannot claim export jobs');
select ok(has_function_privilege('account_lifecycle_service','app_public.claim_account_exports(timestamptz,integer)','EXECUTE'),'worker can claim bounded export jobs');
select ok(has_function_privilege('account_lifecycle_service','app_public.build_account_export(uuid,uuid)','EXECUTE'),'worker can build only a claimed archive');
select ok(has_function_privilege('account_lifecycle_service','app_public.claim_due_private_memory_purges(timestamptz,integer)','EXECUTE'),'worker can claim due private-memory purge jobs');
select ok(not has_function_privilege('anon','app_public.account_lifecycle_status()','EXECUTE'),'anonymous lifecycle status is denied');

set local role authenticated;
select throws_ok($$select app_public.account_lifecycle_status()$$,'42501','account_lifecycle_denied','a role without an active exact session fails closed');
reset role;

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public'
  and p.proname in ('account_lifecycle_status','request_account_export','get_account_export_status','issue_account_export_download','request_account_deletion','cancel_account_deletion')
  and 'user_id'=any(coalesce(p.proargnames,array[]::text[]))),'browser lifecycle commands never accept a caller-selected owner');
select ok(position("interval '7 days'" in pg_get_constraintdef((select oid from pg_constraint where conname='export_archive_shape')))>0,'ready archive lifetime is capped at seven days');
select ok(position("interval '15 minutes'" in pg_get_constraintdef((select oid from pg_constraint where conname='account_export_handoff_window')))>0,'download handoff is capped at fifteen minutes');
select ok(position("interval '24 hours'" in pg_get_constraintdef((select oid from pg_constraint where conname='private_memory_deletion_timing')))>0,'private-memory purge remains due within 24 hours');
select ok(position('rating is null' in pg_get_constraintdef((select oid from pg_constraint where conname='private_memory_purged_content_free')))>0
  and position('note is null' in pg_get_constraintdef((select oid from pg_constraint where conname='private_memory_purged_content_free')))>0,'purged memory tombstone cannot retain private content');

insert into auth.users(id) values
  ('32000000-0000-4000-8000-000000000001'),('32000000-0000-4000-8000-000000000002');
insert into app_private.profiles(user_id,verified_email_snapshot,public_display_name,age_18_attested_at,last_authenticated_at)
values
  ('32000000-0000-4000-8000-000000000001','owner@example.test','Archive Owner',statement_timestamp(),statement_timestamp()),
  ('32000000-0000-4000-8000-000000000002','other@example.test','Other User Secret',statement_timestamp(),statement_timestamp());
insert into shopper_private.saved_stores(user_id,store_id) values
  ('32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001'),
  ('32000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001002');
insert into shopper_private.private_store_memories(user_id,store_id,rating,note,last_visit_month) values
  ('32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001',5,'OWNER-MEMORY','2026-08-01'),
  ('32000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000001002',1,'OTHER-USER-SECRET','2026-08-01');
insert into shopper_private.private_memory_deletions(undo_token,user_id,store_id,rating,note,last_visit_month,source_version,created_at,undo_until,purge_due_at)
values('32000000-0000-4000-8000-000000000010','32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001003',2,'PURGED-CONTENT-SECRET','2026-07-01',1,
  '2026-08-01T00:00:00Z','2026-08-01T00:05:00Z','2026-08-02T00:00:00Z');
insert into shopper_private.catalog_last_seen(user_id,area_id,seen_at) values
  ('32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-08-01T00:00:00Z');
insert into shopper_private.catalog_new_dismissals(user_id,store_id,dismissed_at) values
  ('32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001004','2026-06-01T00:00:00Z'),
  ('32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001005','2026-07-20T00:00:00Z');
insert into shopper_private.store_correction_reports(report_id,reporter_user_id,store_id,correction_type,description,public_source_url,assigned_admin_id,state)
values('32000000-0000-4000-8000-000000000020','32000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000001001','hours','OWNER-CORRECTION','https://example.test/source','32000000-0000-4000-8000-000000000002','triaged');
insert into candidate_private.candidate_links(candidate_id,owner_user_id,normalized_url,destination_host,title,note,provenance,extraction_state) values
  ('32000000-0000-4000-8000-000000000030','32000000-0000-4000-8000-000000000001','https://example.test/owner','example.test','OWNER-CANDIDATE','OWNER-NOTE','{}','saved'),
  ('32000000-0000-4000-8000-000000000031','32000000-0000-4000-8000-000000000002','https://example.test/other','example.test','OTHER-USER-SECRET','OTHER-NOTE','{}','saved');
insert into candidate_private.candidate_shares(share_id,candidate_id,sender_id,recipient_id,recipient_email_hmac,state,expires_at)
values('32000000-0000-4000-8000-000000000040','32000000-0000-4000-8000-000000000030','32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002',decode(repeat('ab',32),'hex'),'pending',statement_timestamp()+interval '20 days');
insert into candidate_private.candidate_share_payloads(share_id,encrypted_payload) values
  ('32000000-0000-4000-8000-000000000040',convert_to('ENCRYPTED-PAYLOAD-SECRET','utf8'));
insert into candidate_private.candidate_abuse_cases(reporter_subject_hmac,reported_subject_hmac,reason,reported_text)
values(decode(repeat('cd',32),'hex'),decode(repeat('ef',32),'hex'),'other','INTERNAL-MODERATION-SECRET');
insert into candidate_private.trip_ideas(idea_id,owner_user_id,title,url_note)
values('32000000-0000-4000-8000-000000000050','32000000-0000-4000-8000-000000000001','OWNER-IDEA','https://example.test/idea');
insert into app_private.account_export_jobs(export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at,attempt_count)
values('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000001','building','32000000-0000-4000-8000-000000000061',statement_timestamp(),statement_timestamp()+interval '5 minutes',1);

set local role account_lifecycle_service;
select like(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%Clockwork Cabinet%','archive contains the owner saved store');
select like(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%OWNER-MEMORY%','archive contains active owner memory');
select like(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%OWNER-CORRECTION%','archive contains the safe own correction projection');
select like(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%OWNER-CANDIDATE%','archive contains owned Candidate content');
select like(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%"direction": "sent"%','archive includes a direction-safe share projection');
select unlike(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%OTHER-USER-SECRET%','archive excludes other-user records');
select unlike(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061'),'%PURGED-CONTENT-SECRET%','archive excludes pending-deletion private content');
select ok(app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061') not like '%ENCRYPTED-PAYLOAD-SECRET%'
  and app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061') not like '%INTERNAL-MODERATION-SECRET%'
  and app_public.build_account_export('32000000-0000-4000-8000-000000000060','32000000-0000-4000-8000-000000000061') not like '%32000000-0000-4000-8000-000000000002%',
  'archive excludes ciphertext, moderation evidence, recipient and assigned-admin identity');

select is((select count(*)::integer from app_public.claim_due_private_memory_purges('2026-08-03T00:00:00Z',10)),1,'worker claims one due private-memory purge');
reset role;
select lives_ok($$select app_public.complete_private_memory_purge('32000000-0000-4000-8000-000000000010',
  (select claim_token from shopper_private.private_memory_deletions where undo_token='32000000-0000-4000-8000-000000000010'),'2026-08-03T00:00:01Z')$$,'worker completes the exact claimed purge');
select is((select state from shopper_private.private_memory_deletions where undo_token='32000000-0000-4000-8000-000000000010'),'purged','memory deletion becomes purged');
select ok((select rating is null and note is null and last_visit_month is null from shopper_private.private_memory_deletions where undo_token='32000000-0000-4000-8000-000000000010'),'purged tombstone contains no memory content');
select is((select count(*)::integer from shopper_private.private_memory_deletion_receipts),1,'one content-free purge receipt is durable');
select is(app_public.purge_due_catalog_dismissals('2026-08-04T00:00:00Z',100),1,'30-day cleanup removes one old New Since dismissal');
select is((select count(*)::integer from shopper_private.catalog_new_dismissals where store_id='00000000-0000-4000-8000-000000001004'),0,'old dismissal marker is gone');
select is((select count(*)::integer from shopper_private.catalog_new_dismissals where store_id='00000000-0000-4000-8000-000000001005'),1,'newer dismissal marker remains');

select ok(not has_table_privilege('authenticated','app_private.account_export_jobs','SELECT')
  and not has_table_privilege('authenticated','app_private.account_export_download_handoffs','SELECT'),'browser cannot inspect archive or handoff internals directly');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_public'
  and p.proname in ('claim_account_exports','build_account_export','complete_account_export','fail_account_export','expire_account_exports',
    'complete_account_export_expiry','consume_account_export_handoff','claim_due_private_memory_purges','complete_private_memory_purge','fail_private_memory_purge','purge_due_catalog_dismissals')
  and (not p.prosecdef or pg_get_userbyid(p.proowner)<>'identity_service')),'all worker commands use the constrained identity-service owner');

select * from finish();
rollback;
