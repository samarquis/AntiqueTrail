begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_function(
  'app_public','partner_admin_signal_command',
  array['text','uuid','uuid','bigint','text','text'],
  'Administrator signal command exists'
);
select ok(
  has_function_privilege('authenticated','app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)','EXECUTE'),
  'authenticated sessions reach the server-side Administrator guard'
);
select ok(
  not has_function_privilege('anon','app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)','EXECUTE'),
  'anonymous callers cannot reach signal verification'
);
select ok(
  position('require_claim_admin' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'the command requires the authoritative Administrator session guard'
);
select ok(
  position('p_expected_version' in pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure))>0
    and position('for update' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'verification locks and version-checks the exact claim and signal'
);
select ok(
  position($q$s.status <> 'submitted'$q$ in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'only submitted signals can be consumed'
);
select ok(
  position('c.claimant_id = actor' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'claimant self-verification is denied'
);
select ok(
  position('verify_synthetic_claim_signal' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'the public command delegates to the existing narrow verifier'
);
select ok(
  position('evidence_ref_hmac' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'the server resolves the evidence object reference internally'
);
select ok(
  position('bytea' in pg_get_function_arguments('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure))=0,
  'clients cannot submit authority evidence or object digests'
);
select ok(
  position($q$'pendingSignals'$q$ in pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure))>0,
  'the exact-case projection exposes submitted signal metadata'
);
select ok(
  position($q$'signalId'$q$ in pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure))>0
    and position($q$'channelClass'$q$ in pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure))>0,
  'pending signal projection includes only actionable identifiers and channel metadata'
);
select ok(
  position($q$'evidenceRefHmac'$q$ in pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure))=0
    and position($q$'authorityObjectHmac'$q$ in pg_get_functiondef('app_public.partner_admin_claim_case(uuid)'::regprocedure))=0,
  'the Administrator client projection contains no evidence digests'
);
select ok(
  position($q$'signal_rejected'$q$ in lower(pg_get_constraintdef((select oid from pg_constraint where conname='claim_events_event_kind_check'))))>0,
  'rejected signals receive a distinct append-only event kind'
);
select ok(
  position('privileged_audit_events' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0
    and position('claim_command_receipts' in lower(pg_get_functiondef('app_public.partner_admin_signal_command(text,uuid,uuid,bigint,text,text)'::regprocedure)))>0,
  'verification writes privileged audit and idempotency receipts'
);

select * from finish();
rollback;
