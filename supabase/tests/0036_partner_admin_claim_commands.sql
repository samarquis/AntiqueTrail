begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

select has_column('partner_private','partner_invitations','synthetic','invitations distinguish the bounded Synthetic path');
select has_column('partner_private','partner_invitations','issuance_idempotency_key','invitation issuance is one-use keyed');
select has_column('partner_private','partner_invitations','raw_returned_at','raw handoff is recorded without retaining the secret');
select has_table('partner_private','claim_command_receipts','claim commands have a durable idempotency ledger');
select ok((select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='partner_private' and c.relname='claim_command_receipts'),'command receipts force RLS');
select ok(exists(select 1 from pg_trigger where tgname='claim_command_receipts_append_only' and not tgisinternal),'command receipts are append-only');

select has_function('app_public','issue_synthetic_partner_invitation',array['bytea','smallint','text'],'bounded invitation issuer exists');
select has_function('partner_private','record_synthetic_claim_signal',array['uuid','text','text','bytea'],'operations can submit a Synthetic signal');
select has_function('partner_private','verify_synthetic_claim_signal',array['uuid','uuid','bytea','uuid','text'],'operations can verify a Synthetic signal separately');
select has_function('app_public','partner_start_claim',array['uuid','text','text','text'],'claimant start command exists');
select has_function('app_public','partner_claimant_claim_command',array['text','uuid','bigint','text'],'claimant lifecycle command exists');
select has_function('app_public','partner_claim_status',array['uuid'],'reason-neutral claimant projection exists');
select has_function('app_public','partner_admin_claim_case',array['uuid'],'exact-case Administrator projection exists');
select has_function('app_public','partner_admin_claim_command',array['text','uuid','bigint','text','text','uuid'],'Administrator lifecycle command exists');

select ok(not has_function_privilege('anon','app_public.issue_synthetic_partner_invitation(bytea,smallint,text)','EXECUTE'),'anonymous users cannot issue invitations');
select ok(has_function_privilege('authenticated','app_public.issue_synthetic_partner_invitation(bytea,smallint,text)','EXECUTE'),'authenticated sessions reach the internal Administrator checks');
select ok(not has_function_privilege('authenticated','partner_private.record_synthetic_claim_signal(uuid,text,text,bytea)','EXECUTE'),'claimants cannot insert operational authority signals');
select ok(not has_function_privilege('authenticated','partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)','EXECUTE'),'claimants cannot mark authority verified');
select ok(not has_function_privilege('partner_authority_service','partner_private.record_synthetic_claim_signal(uuid,text,text,bytea)','EXECUTE'),'the operations verifier cannot submit a claimant signal');
select ok(has_function_privilege('partner_authority_service','partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)','EXECUTE'),'the narrow operations service can verify submitted signals');
select ok(not has_table_privilege('authenticated','partner_private.listing_claims','SELECT') and not has_table_privilege('authenticated','partner_private.claim_authority_signals','SELECT'),'clients cannot bypass reason-neutral projections or read evidence rows');

select ok(position('current_user_has_role' in pg_get_functiondef('partner_private.require_claim_admin()'::regprocedure))>0,'Administrator role is required');
select ok(position('current_session_has_mfa' in pg_get_functiondef('partner_private.require_claim_admin()'::regprocedure))>0,'Administrator MFA is required');
select ok(position('current_session_recent_auth' in pg_get_functiondef('partner_private.require_claim_admin()'::regprocedure))>0,'Administrator recent authentication is required');
select ok(position('gen_random_bytes(32)' in pg_get_functiondef('app_public.issue_synthetic_partner_invitation(bytea,smallint,text)'::regprocedure))>0,'invitation raw token has 256 bits of server entropy');
select ok(position($q$statement_timestamp() + '00:30:00'::interval$q$ in pg_get_functiondef('app_public.issue_synthetic_partner_invitation(bytea,smallint,text)'::regprocedure))>0,'invitation expiry is exactly thirty minutes');
select ok(position('store_id' in pg_get_function_arguments('app_public.issue_synthetic_partner_invitation(bytea,smallint,text)'::regprocedure))=0,'invitation issuance grants no store scope');
select ok(position('partner_invitation_raw_secret_not_replayable' in pg_get_functiondef('app_public.issue_synthetic_partner_invitation(bytea,smallint,text)'::regprocedure))>0,'raw invitation material cannot be replayed');

select ok(position($q$values (p_claim_id, p_channel_class, p_signal_type, 'submitted'$q$ in lower(pg_get_functiondef('partner_private.record_synthetic_claim_signal(uuid,text,text,bytea)'::regprocedure)))>0,'signal submission can only create submitted state');
select ok(position('c.claimant_id <> actor' in lower(pg_get_functiondef('partner_private.record_synthetic_claim_signal(uuid,text,text,bytea)'::regprocedure)))>0,'signal submission denies sibling claim identifiers');
select ok(position($q$s.status <> 'submitted'$q$ in lower(pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure)))>0,'verification consumes only a submitted signal');
select ok(position('p_verifier_user_id = c.claimant_id' in lower(pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure)))>0,'claimant self-verification is denied');
select ok(position($q$role = 'administrator'$q$ in lower(pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure)))>0,'signal verifier must be an active Administrator');
select ok(position('authority_object_hmac' in pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure))>0 and position('verification_event_id' in pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure))>0,'verification binds independent object and event identifiers');
select ok(position('record_synthetic_claim_signal' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'the existing Synthetic client path records a submitted operational signal');
select ok(position('evidencereference' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))=0 and position('evidenceref_hmac' in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'database command receives only the evidence HMAC');
select ok(position($q$partner_claimant_claim_command('recheck'$q$ in lower(pg_get_functiondef('app_public.partner_synthetic_command(text,jsonb)'::regprocedure)))>0,'Synthetic recheck uses the durable claimant command');

select ok(position($q$channel_class = 'published_business_contact'$q$ in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'approval requires the business-domain or published-contact class');
select ok(position('count(distinct channel_class)' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'approval requires two channel classes');
select ok(position('count(distinct authority_object_hmac)' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'approval requires two authority objects');
select ok(position('count(distinct verification_event_id)' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'approval requires two verification events');
select ok(position('c.claimant_id = p_actor' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'Administrator self-approval is denied');
select ok(position('insert into partner_private.store_partner_grants' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0 and position('insert into app_private.role_grants' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,'approval creates both durable and runtime exact-store grants');

select ok(position($q$pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'$q$ in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)))>0,'Administrator mutation locks the exact store');
select ok(position('from partner_private.listing_claims' in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)))>0 and position('store_id = c.store_id' in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)))>0 and position('for update' in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)))>0,'Administrator mutation locks every competing exact-store claim');
select ok(position('revoke_exact_claim_scope(old.claim_id' in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)))<position('approve_exact_claim(c.claim_id' in lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure))),'transfer revokes old exact scope before approving new scope');
select ok(position($q$state = 'revoked'$q$ in lower(pg_get_functiondef('partner_private.revoke_exact_claim_scope(uuid,uuid,text,text)'::regprocedure)))>0 and position('app_private.role_grants' in lower(pg_get_functiondef('partner_private.revoke_exact_claim_scope(uuid,uuid,text,text)'::regprocedure)))>0,'revoke removes both claim grant and runtime Representative role');

select ok(position($q$'conflict'$q$ in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))>0 and position($q$'in_review'$q$ in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))>0 and position($q$'rejected'$q$ in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))>0 and position($q$'closed'$q$ in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))>0,'claimant status conflates internal conflict and closure reasons');
select ok(position('assigned_admin_id' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))=0 and position('evidence_ref_hmac' in lower(pg_get_functiondef('app_public.partner_claim_status(uuid)'::regprocedure)))=0,'claimant status exposes no Administrator or evidence identity');
select ok(position('assigned_admin_id is null' in lower(pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure)))>0 and position('assigned_admin_id = actor' in lower(pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure)))>0,'Administrator reads only one assigned or unassigned exact case');
select ok(position('claim_id = c.claim_id' in lower(pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure)))>0,'Administrator signal projection is exact-claim scoped');

select ok(position('s.synthetic' in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0 and position($q$'synthetic_alpha'$q$ in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0,'Synthetic claims are limited to Synthetic Alpha');
select ok(position('not s.synthetic' in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0 and position('public_capability_enabled' in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0 and position($q$'claims'$q$ in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0,'real claims stay disabled until the real Package 10B capability');

select * from finish();
rollback;
