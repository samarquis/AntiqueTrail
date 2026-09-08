begin;

select plan(34);

insert into auth.users(id,email,created_at,updated_at)
values
  ('25900000-0000-4000-8000-000000000001','appeal-reviewer@example.test',statement_timestamp(),statement_timestamp()),
  ('25900000-0000-4000-8000-000000000002','appeal-moderator@example.test',statement_timestamp(),statement_timestamp()),
  ('25900000-0000-4000-8000-000000000003','appeal-author@example.test',statement_timestamp(),statement_timestamp())
on conflict (id) do nothing;
update review_private.reviewer_verifier_config
set state='accepted',rp_id='appeal-review.test',expected_origin='https://appeal-review.test',provider_key_id='appeal-provider-key',evidence_digest=decode(repeat('ab',32),'hex'),accepted_at=statement_timestamp(),revoked_at=null,version=version+1
where singleton;
insert into review_private.reviewer_identities(reviewer_identity_id,user_id,state,qualification_receipt_digest,active_credential_count)
values('25900000-0000-4000-8000-000000000011','25900000-0000-4000-8000-000000000001','active',decode(repeat('cd',32),'hex'),2);
alter table review_private.reviewer_credentials disable trigger reviewer_registration_consume_capability;
insert into review_private.reviewer_credentials(reviewer_identity_id,credential_id_digest,public_key_digest,provider_credential_id,provider_verification_id,discoverable,sign_count)
values
  ('25900000-0000-4000-8000-000000000011',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'appeal-credential-1','appeal-registration-1',false,3),
  ('25900000-0000-4000-8000-000000000011',decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),'appeal-credential-2','appeal-registration-2',false,7);
alter table review_private.reviewer_credentials enable trigger reviewer_registration_consume_capability;
insert into review_private.public_reviews(review_id,author_id,store_id,rating,review_text,display_name,visit_month,visit_year,eligibility_kind,conflict_kind,state)
values('25900000-0000-4000-8000-000000000021','25900000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000001001',1,'Allowed challenged review text','EXCLUDED_DISPLAY_NAME',7,2024,'manual_attestation','none','removed');
insert into review_private.moderation_cases(case_id,review_id,store_id,state,reason_code,assigned_admin_id,original_moderator_id)
values('25900000-0000-4000-8000-000000000022','25900000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000001001','appealed','spam','25900000-0000-4000-8000-000000000002','25900000-0000-4000-8000-000000000002');
insert into review_private.review_appeals(case_id,review_id,submitted_by_user_id,submitted_by_kind,original_action,original_moderator_id,assigned_reviewer_identity_id,state,appeal_reason)
values('25900000-0000-4000-8000-000000000022','25900000-0000-4000-8000-000000000021','25900000-0000-4000-8000-000000000003','author','remove','25900000-0000-4000-8000-000000000002','25900000-0000-4000-8000-000000000011','assigned','Appeal text is allowed');
insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
values
  ('25900000-0000-4000-8000-000000000022','report_reason','spam',decode(repeat('11',32),'hex')),
  ('25900000-0000-4000-8000-000000000022','prior_decision','remove',decode(repeat('12',32),'hex')),
  ('25900000-0000-4000-8000-000000000022','appeal_text','Appeal text is allowed',decode(repeat('13',32),'hex')),
  ('25900000-0000-4000-8000-000000000022','review_text','EXCLUDED_EVIDENCE_REVIEW_TEXT',decode(repeat('14',32),'hex'));
select diag(format('fixture rows review=%s case=%s appeal=%s store=%s area=%s',
  (select count(*) from review_private.public_reviews where review_id='25900000-0000-4000-8000-000000000021'),
  (select count(*) from review_private.moderation_cases where case_id='25900000-0000-4000-8000-000000000022'),
  (select count(*) from review_private.review_appeals where case_id='25900000-0000-4000-8000-000000000022'),
  (select count(*) from app_public.stores where id='00000000-0000-4000-8000-000000001001'),
  (select count(*) from app_public.catalog_areas where id='00000000-0000-4000-8000-000000000001')));

set local role review_credential_capability_service;
select lives_ok($$select review_private.issue_appeal_reviewer_capability('25900000-0000-4000-8000-000000000022','25900000-0000-4000-8000-000000000011',extensions.digest(convert_to(repeat('A',32),'utf8'),'sha256'),'25900000-0000-4000-8000-000000000031')$$,'trusted service issues one case capability');
reset role;
set local role anon;
select lives_ok($$select app_public.reviews_request_independent_appeal_assertion(repeat('A',32),'25900000-0000-4000-8000-000000000032')$$,'anonymous capability exchange creates a challenge');
reset role;
select set_config('test.appeal_challenge_id',(select challenge_id::text from review_private.appeal_reviewer_challenges where idempotency_key='25900000-0000-4000-8000-000000000032'),true);
set local role review_credential_verifier;
select lives_ok($$select review_private.complete_independent_appeal_assertion(current_setting('test.appeal_challenge_id')::uuid,decode(repeat('01',32),'hex'),decode(repeat('05',32),'hex'),'appeal-provider-verification','appeal-provider-key',4)$$,'verified assertion receipt is case bound');
reset role;
select set_config('test.appeal_receipt_id',(select assertion_receipt_id::text from review_private.appeal_reviewer_assertion_receipts where assertion_digest=decode(repeat('05',32),'hex')),true);
set local role anon;
select is((app_public.reviews_get_independent_appeal_packet(repeat('A',32),current_setting('test.appeal_receipt_id')::uuid)->>'state'),'ready','anonymous reviewer reads the frozen packet');
select ok((app_public.reviews_get_independent_appeal_packet(repeat('A',32),current_setting('test.appeal_receipt_id')::uuid)->>'state')='ready','packet is ready only after fresh assertion');
select ok(position('EXCLUDED_DISPLAY_NAME' in (app_public.reviews_get_independent_appeal_packet(repeat('A',32),current_setting('test.appeal_receipt_id')::uuid)::text))=0,'packet omits account presentation fields');
select lives_ok($$select app_public.reviews_submit_independent_appeal(repeat('A',32),current_setting('test.appeal_receipt_id')::uuid,(select decode(packet->>'packetHash','hex') from app_public.reviews_get_independent_appeal_packet(repeat('A',32),current_setting('test.appeal_receipt_id')::uuid) packet),'restore','Restore because the challenged review is compliant','25900000-0000-4000-8000-000000000033')$$,'anonymous reviewer decision is accepted atomically');
reset role;
select is((select state from review_private.public_reviews where review_id='25900000-0000-4000-8000-000000000021'),'published','restore publishes the challenged review');
select is((select state from review_private.moderation_cases where case_id='25900000-0000-4000-8000-000000000022'),'resolved','restore resolves the moderation case');
select is((select state from review_private.review_appeals where case_id='25900000-0000-4000-8000-000000000022'),'restored','restore persists the terminal appeal outcome');
select is((select state from review_private.appeal_reviewer_capabilities where case_id='25900000-0000-4000-8000-000000000022'),'consumed','decision consumes the one-case capability');
select ok(exists(select 1 from review_private.review_audit_events where case_id='25900000-0000-4000-8000-000000000022' and event_kind='independent_appeal_decided'),'decision writes an audit event in the same transaction');

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
select ok(exists(select 1 from pg_constraint where conrelid='review_private.appeal_reviewer_capabilities'::regclass and contype='c' and pg_get_constraintdef(oid) ~* 'octet_length\s*\(token_hash\)\s*=\s*32'),'only token hashes persist');
select ok(position('original_moderator_id' in lower(pg_get_functiondef('app_public.reviews_get_independent_appeal_packet(text,uuid)'::regprocedure)))>0 and position('<>' in pg_get_functiondef('app_public.reviews_get_independent_appeal_packet(text,uuid)'::regprocedure))>0,'original moderator is denied');
select ok(position('packet_hash<>p_packet_hash' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision binds the frozen packet hash');
select ok(position('state=''consumed''' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision consumes the capability');
select ok(position('rebuild_rating_aggregate' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'aggregate mutation is in the decision transaction');
select ok(position('append_audit' in lower(pg_get_functiondef('app_public.reviews_submit_independent_appeal(text,uuid,bytea,text,text,uuid)'::regprocedure)))>0,'decision appends audit in the transaction');

select * from finish();
rollback;
