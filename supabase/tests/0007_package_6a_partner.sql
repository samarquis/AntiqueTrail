begin;
select plan(54);

select has_schema('partner_private','partner-private schema exists');
select has_table('partner_private','partner_invitations','partner invitations table exists');
select has_table('partner_private','pending_partner_identities','pending identities table exists');
select has_table('partner_private','provisional_partner_consents','provisional consent table exists');
select has_table('partner_private','pilot_consent_receipts','immutable consent receipts table exists');
select has_table('partner_private','pilot_store_drafts','pilot drafts table exists');
select has_table('partner_private','partner_authority_checks','partner authority checks table exists');
select has_table('partner_private','store_partnerships','partnerships table exists');
select has_table('partner_private','listing_claims','listing claims table exists');
select has_table('partner_private','claim_authority_signals','claim signals table exists');
select has_table('partner_private','claim_conflicts','claim conflicts table exists');
select has_table('partner_private','store_partner_grants','exact store grants table exists');
select has_table('partner_private','partner_access_revocations','access revocations table exists');
select has_table('partner_private','claim_events','claim events table exists');

select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='partner_private' and c.relkind='r' and (not c.relrowsecurity or not c.relforcerowsecurity)),'all Package 6A tables FORCE RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='partner_private' and grantee in ('anon','authenticated')),'no anonymous/authenticated direct table grants');
select ok(not exists(select 1 from pg_policies where schemaname='partner_private' and roles && array['anon'::name,'public'::name] and cmd in ('INSERT','UPDATE','DELETE')),'no anonymous/public partner write policies');

select ok(exists(select 1 from pg_constraint where conname='partner_invitation_token_hash_size'),'invitation stores 32-byte token hashes');
select ok(exists(select 1 from pg_constraint where conname='partner_invitation_expiry_bound'),'invitation expiry is bounded to 30 minutes');
select ok(exists(select 1 from pg_constraint where conname='partner_invitation_state_shape'),'invitation is single-use state shaped');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='partner_invitation_live_token_idx' and i.indisunique),'active invitation token is unique');
select ok(exists(select 1 from pg_constraint where conname='pending_identity_expiry_bound'),'pending identity expiry is bounded to 30 days');
select ok(exists(select 1 from pg_constraint where conname='pending_identity_state_shape'),'pending identity bind state is constrained');
select ok(exists(select 1 from pg_constraint where conname='provisional_consent_acknowledgements'),'all provisional consent acknowledgements are required');
select ok(exists(select 1 from pg_trigger where tgname='provisional_consent_append_only'),'provisional consent is immutable');
select ok(exists(select 1 from pg_trigger where tgname='consent_receipt_append_only'),'final consent receipt is immutable');
select ok(exists(select 1 from pg_constraint where conname='authority_verified_shape'),'authority verification status is timestamp/actor shaped');
select ok(exists(select 1 from pg_constraint where conname='claim_signal_verified_shape'),'claim signal status is timestamp/actor shaped');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='listing_claim_active_claimant_store_idx' and i.indisunique),'one active claim per claimant/store');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='listing_claim_approved_store_idx' and i.indisunique),'one approved claim per store');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='store_partnership_live_store_idx' and i.indisunique),'one live partnership per store');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='partner_grant_live_store_idx' and i.indisunique),'one live grant per store');
select ok(exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid where c.relname='partner_grant_live_user_store_idx' and i.indisunique),'one live grant per user/store');
select ok(exists(select 1 from pg_trigger where tgname='partner_access_revocation_append_only'),'revocations are append-only');
select ok(exists(select 1 from pg_trigger where tgname='claim_events_append_only'),'claim events are append-only');

select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='pending_identity_bound_read' and replace(coalesce(qual,''),' ','') like '%auth_user_id=app_public.request_user_id()%'),'pending identity read is bound-user scoped');
select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='pilot_draft_bound_owner' and (coalesce(qual,'') like '%pending_partner_identities%' or coalesce(qual,'') like '%pilot_draft_belongs_to_user%') and coalesce(qual,'') like '%request_user_id%'),'draft read/write is pending-identity scoped');
select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='listing_claim_claimant_read' and replace(coalesce(qual,''),' ','') like '%claimant_id=app_public.request_user_id()%'),'claim read is claimant scoped');
select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='claim_signal_claimant_read' and coalesce(qual,'') like '%listing_claims%' and replace(coalesce(qual,''),' ','') like '%claimant_id=app_public.request_user_id()%'),'claim signals are sibling-row scoped');
select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='partner_grant_exact_owner_read' and replace(coalesce(qual,''),' ','') like '%auth_user_id=app_public.request_user_id()%' and coalesce(qual,'') like '%current_session_is_active%'),'grant read is exact-user scoped');
select ok(exists(select 1 from pg_policies where schemaname='partner_private' and policyname='consent_receipt_bound_read' and replace(coalesce(qual,''),' ','') like '%auth_user_id=app_public.request_user_id()%'),'consent receipt read is bound-user scoped');

select ok(exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='partner_invitations' and column_name='token_hash'),'no raw invitation token column is present');
select ok(not exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='partner_invitations' and column_name in ('raw_token','token','password','mfa_secret')),'invitation has no raw credential columns');
select ok(not exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='claim_authority_signals' and column_name in ('evidence','evidence_text','document_bytes')),'claim signals have no raw evidence payload');
select ok(exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='store_partner_grants' and column_name='scope_kind'),'grant has explicit scope field');
select ok(exists(select 1 from pg_constraint where conname='store_partner_grants_role_check'),'grant role is fixed to representative');
select ok(exists(select 1 from pg_constraint where conname='store_partner_grants_scope_kind_check'),'grant scope is fixed to one store');

set local role anon;
select throws_ok($$select * from partner_private.partner_invitations$$,'42501',null,'anonymous invitation read denied');
select throws_ok($$insert into partner_private.partner_invitations(token_hash,recipient_email_hmac,created_by) values (repeat(E'\\001',32)::bytea,repeat(E'\\002',32)::bytea,'00000000-0000-0000-0000-000000000001')$$,'42501',null,'anonymous invitation write denied');
select throws_ok($$select * from partner_private.listing_claims$$,'42501',null,'anonymous claim read denied');
reset role;
set local role authenticated;
select throws_ok($$select * from partner_private.pending_partner_identities$$,'42501',null,'authenticated pending-identity direct read denied');
select throws_ok($$select * from partner_private.pilot_store_drafts$$,'42501',null,'authenticated draft direct read denied');
select throws_ok($$insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-4000-8000-000000001001')$$,'42501',null,'authenticated grant write denied');
select throws_ok($$select * from partner_private.partner_access_revocations$$,'42501',null,'authenticated revocation read denied');
reset role;

select * from finish();
rollback;
