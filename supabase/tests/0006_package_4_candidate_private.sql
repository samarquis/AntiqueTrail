begin;
select plan(42);

select has_schema('candidate_private','candidate-private schema exists');
select has_table('candidate_private','candidate_links','candidate links table exists');
select has_table('candidate_private','candidate_shares','candidate shares table exists');
select has_table('candidate_private','candidate_share_payloads','encrypted share payloads table exists');
select has_table('candidate_private','candidate_blocks','candidate blocks table exists');
select has_table('candidate_private','candidate_abuse_cases','abuse cases table exists');
select has_table('candidate_private','candidate_share_actions','share idempotency actions table exists');
select has_table('candidate_private','trip_ideas','trip ideas table exists');

select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_links'),'candidate links FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_shares'),'candidate shares FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_share_payloads'),'share payloads FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_blocks'),'candidate blocks FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_abuse_cases'),'abuse cases FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='candidate_share_actions'),'share actions FORCE RLS enabled');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='candidate_private' and c.relname='trip_ideas'),'trip ideas FORCE RLS enabled');

select ok(exists(select 1 from pg_policies where schemaname='candidate_private' and policyname='candidate_link_owner' and coalesce(qual,'') like '%owner_user_id=auth.uid()%' and coalesce(qual,'') like '%current_session_is_active%'),'candidate links are owner/session scoped');
select ok(exists(select 1 from pg_policies where schemaname='candidate_private' and policyname='candidate_share_party_read' and coalesce(qual,'') like '%sender_id=auth.uid()%' and coalesce(qual,'') like '%recipient_id=auth.uid()%'),'shares are sender/recipient scoped');
select ok(exists(select 1 from pg_policies where schemaname='candidate_private' and policyname='candidate_share_payload_recipient_read' and coalesce(qual,'') like '%current_share_recipient_can_read%'),'payloads require pending recipient gate');
select ok(exists(select 1 from pg_policies where schemaname='candidate_private' and policyname='candidate_block_owner' and coalesce(qual,'') like '%blocker_id=auth.uid()%'),'blocks are blocker scoped');
select ok(exists(select 1 from pg_policies where schemaname='candidate_private' and policyname='trip_idea_owner' and coalesce(qual,'') like '%owner_user_id=auth.uid()%'),'trip ideas are owner scoped');
select ok(not exists(select 1 from pg_policies where schemaname='candidate_private' and roles && array['anon'::name,'public'::name] and cmd in ('INSERT','UPDATE','DELETE')),'no anonymous/public candidate write policies');

select ok(exists(select 1 from information_schema.columns where table_schema='candidate_private' and table_name='candidate_shares' and column_name='recipient_id'),'shares retain server-resolved recipient only');
select ok(exists(select 1 from information_schema.columns where table_schema='candidate_private' and table_name='candidate_shares' and column_name='recipient_email_hmac'),'shares store recipient email HMAC');
select ok(exists(select 1 from information_schema.columns where table_schema='candidate_private' and table_name='candidate_shares' and column_name='sender_status' and is_generated='ALWAYS'),'sender status is conflate-only generated state');
select ok(exists(select 1 from pg_constraint where conname='candidate_share_expiry_bound'),'pending share expiry is bounded to 30 days');
select ok(exists(select 1 from pg_constraint where conname='candidate_share_state_shape'),'share accept/close state shape is constrained');
select ok(exists(select 1 from pg_constraint where conname='candidate_action_key_safe'),'idempotency keys are bounded');
select ok(exists(select 1 from pg_constraint where conname='candidate_payload_not_empty'),'encrypted payload cannot be empty');
select ok(exists(select 1 from pg_constraint where conname='trip_idea_source_share_key'),'trip idea source share is unique');

select ok(exists(select 1 from pg_trigger where tgname='candidate_shares_state_guard'),'share state transition trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='candidate_share_payload_pending_guard'),'payload pending-share trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='candidate_share_payload_terminal_cleanup'),'terminal payload cleanup trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='trip_ideas_source_guard'),'trip idea source ownership trigger exists');
select ok(exists(select 1 from pg_trigger where tgname='candidate_share_actions_append_only'),'share action append-only trigger exists');
select ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='candidate_private' and p.proname='current_share_recipient_can_read'),'recipient payload gate function exists');

select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='candidate_private' and grantee in ('anon','authenticated')),'no anonymous/authenticated direct table grants');

set local role anon;
select throws_ok($$select * from candidate_private.candidate_links$$,'42501','anonymous candidate read denied');
select throws_ok($$insert into candidate_private.candidate_links(owner_user_id,title) values ('00000000-0000-0000-0000-000000000001','x')$$,'42501','anonymous candidate write denied');
select throws_ok($$select * from candidate_private.candidate_share_payloads$$,'42501','anonymous payload read denied');
reset role;

set local role authenticated;
select throws_ok($$select * from candidate_private.candidate_shares$$,'42501','authenticated direct share read denied');
select throws_ok($$insert into candidate_private.trip_ideas(owner_user_id,title) values ('00000000-0000-0000-0000-000000000001','x')$$,'42501','authenticated direct trip-idea write denied');
select throws_ok($$select * from candidate_private.candidate_abuse_cases$$,'42501','authenticated abuse-case read denied');
reset role;

select * from finish();
rollback;
