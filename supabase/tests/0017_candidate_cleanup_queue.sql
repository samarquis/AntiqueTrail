begin;
select plan(27);

select has_table('candidate_private','candidate_share_storage_objects','private Storage object registry exists');
select has_table('candidate_private','candidate_cleanup_jobs','durable cleanup queue exists');
select has_table('candidate_private','candidate_storage_deletion_receipts','durable Storage deletion receipts exist');
select has_function('candidate_private','claim_candidate_cleanup',array['timestamp with time zone','integer'],'cleanup claim function exists');
select has_function('candidate_private','complete_candidate_cleanup',array['uuid','uuid','uuid','text','bytea','timestamp with time zone'],'cleanup completion function exists');
select ok(exists(select 1 from pg_trigger where tgname='candidate_share_cleanup_enqueue'),'terminal transition enqueues cleanup');
select ok(exists(select 1 from pg_trigger where tgname='candidate_storage_object_binding_guard'),'Storage keys are bound to their share');
select ok(exists(select 1 from pg_trigger where tgname='candidate_storage_receipts_append_only'),'Storage receipts are append-only');
select ok(exists(select 1 from pg_constraint where conname='candidate_cleanup_deadline'),'terminal cleanup has a database deadline constraint');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_cleanup_jobs'),'cleanup queue forces RLS');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_storage_deletion_receipts'),'deletion receipts force RLS');
select ok(not has_table_privilege('candidate_cleanup_service','candidate_private.candidate_cleanup_jobs','SELECT'),'cleanup service has no direct queue access');
select ok(not has_table_privilege('authenticated','candidate_private.candidate_storage_deletion_receipts','SELECT'),'browser users cannot read deletion receipts');
select ok(has_function_privilege('candidate_cleanup_service','candidate_private.claim_candidate_cleanup(timestamp with time zone,integer)','EXECUTE'),'cleanup service can claim');
select ok(has_function_privilege('candidate_cleanup_service','candidate_private.complete_candidate_cleanup(uuid,uuid,uuid,text,bytea,timestamp with time zone)','EXECUTE'),'cleanup service can complete');
select ok(exists(select 1 from pg_trigger where tgname='community_evidence_canonical_route_guard'),'community evidence has canonical route guard');
select ok(not has_schema_privilege('community_automation','community_private','CREATE'),'community automation cannot create private objects after route guard replacement');

insert into auth.users(id) values ('17000000-0000-4000-8000-000000000001');
insert into candidate_private.candidate_links(candidate_id,owner_user_id,title)
values ('17000000-0000-4000-8000-000000000010','17000000-0000-4000-8000-000000000001','Cleanup candidate');
insert into candidate_private.candidate_shares(
  share_id,candidate_id,sender_id,recipient_email_hmac,expires_at
) values (
  '17000000-0000-4000-8000-000000000100','17000000-0000-4000-8000-000000000010',
  '17000000-0000-4000-8000-000000000001',decode(repeat('01',32),'hex'),'2026-08-01T00:00:00Z'
);
insert into candidate_private.candidate_share_payloads(share_id,encrypted_payload)
values ('17000000-0000-4000-8000-000000000100',decode('01','hex'));
insert into candidate_private.candidate_share_storage_objects(share_id,object_key)
values ('17000000-0000-4000-8000-000000000100','candidate/17000000-0000-4000-8000-000000000100/preview.html');
set local role candidate_cleanup_service;
create temporary table expired_share_result as
  select candidate_private.expire_candidate_shares('2026-08-03T00:00:00Z',1) expired_count;
reset role;

select is((select state from candidate_private.candidate_cleanup_jobs where share_id='17000000-0000-4000-8000-000000000100'),'pending','revocation creates pending durable work');
select ok((select cleanup_due_at<=terminal_at+interval '24 hours' from candidate_private.candidate_cleanup_jobs where share_id='17000000-0000-4000-8000-000000000100'),'cleanup is due within 24 hours of terminal state');
select ok(exists(select 1 from candidate_private.candidate_share_payloads where share_id='17000000-0000-4000-8000-000000000100'),'encrypted payload remains until Storage receipt');
select is((select count(*)::integer from candidate_private.claim_candidate_cleanup(statement_timestamp(),1)),1,'worker atomically claims one due job');
select is((select state from candidate_private.candidate_cleanup_jobs where share_id='17000000-0000-4000-8000-000000000100'),'claimed','claim state is durable');

select lives_ok(
  $$select candidate_private.complete_candidate_cleanup(
    '17000000-0000-4000-8000-000000000100',
    (select claim_token from candidate_private.candidate_cleanup_jobs where share_id='17000000-0000-4000-8000-000000000100'),
    '17000000-0000-4000-8000-000000000200','provider-delete-170',
    extensions.digest(convert_to('candidate/17000000-0000-4000-8000-000000000100/preview.html','UTF8'),'sha256'),
    statement_timestamp())$$,
  'bound Storage receipt completes DB cleanup'
);
select ok(exists(select 1 from candidate_private.candidate_storage_deletion_receipts where share_id='17000000-0000-4000-8000-000000000100'),'service receipt is durable');
select ok(not exists(select 1 from candidate_private.candidate_share_payloads where share_id='17000000-0000-4000-8000-000000000100'),'payload deletion follows Storage receipt');
select is((select state from candidate_private.candidate_cleanup_jobs where share_id='17000000-0000-4000-8000-000000000100'),'completed','queue records completion');

select throws_ok(
  $$insert into community_private.community_evidence_receipts(
    receipt_id,receipt_kind,responsibility,decision,area_slug,bound_run_id,
    artifact_binding_digest,store_set_digest,signed_payload_digest,external_verified,predicates
  ) values (
    '17000000-0000-4000-8000-000000000300','catalog_freeze','ProductOwner','pass','osage-city',null,
    decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),decode(repeat('05',32),'hex'),true,
    '{"canonical_route":"/areas/osage-city"}'::jsonb
  )$$,
  '23514','community_canonical_route_invalid','legacy area route is rejected'
);

select * from finish();
rollback;
