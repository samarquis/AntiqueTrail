begin;
select plan(29);

select ok(exists(
  select 1 from pg_trigger
  where tgname='candidate_shares_state_guard'
    and tgrelid='candidate_private.candidate_shares'::regclass
),'candidate share state trigger remains installed');
select ok(position('candidate_share_parties_immutable' in pg_get_functiondef('candidate_private.enforce_share_state()'::regprocedure))>0,
  'candidate share trigger rejects client retargeting');
select ok(position('candidate_share_lifecycle_immutable' in pg_get_functiondef('candidate_private.enforce_share_state()'::regprocedure))>0,
  'candidate share trigger protects lifecycle metadata');
select ok(position('candidate_share_lifecycle_server_owned' in pg_get_functiondef('candidate_private.enforce_share_state()'::regprocedure))>0,
  'candidate share lifecycle timestamps are server-owned');
select ok(position('candidate_share_self_recipient' in pg_get_functiondef('candidate_private.enforce_share_state()'::regprocedure))>0,
  'candidate share trigger rejects sender as recipient');
select ok(exists(
  select 1 from pg_policies
  where schemaname='candidate_private' and tablename='candidate_shares'
    and policyname='candidate_share_sender_update'
    and coalesce(with_check,'') like '%state%closed%'
    and coalesce(with_check,'') like '%close_reason%revoked%'
),'sender updates are limited to revocation');
select ok(exists(
  select 1 from pg_policies
  where schemaname='candidate_private' and tablename='candidate_shares'
    and policyname='candidate_share_recipient_update'
    and coalesce(with_check,'') like '%accepted%closed%'
    and coalesce(with_check,'') like '%dismissed%'
),'recipient updates are limited to accept/dismiss/block/report');
select ok(not exists(
  select 1 from information_schema.role_table_grants
  where table_schema='candidate_private' and table_name='candidate_shares'
    and grantee in ('anon','authenticated')
),'candidate shares have no direct table grants');

select ok(exists(
  select 1 from information_schema.columns
  where table_schema='partner_private' and table_name='pilot_store_drafts' and column_name='assigned_admin_id'
),'pilot drafts carry an assigned administrator');
select ok(exists(
  select 1 from pg_trigger
  where tgname='pilot_store_drafts_write_guard'
    and tgrelid='partner_private.pilot_store_drafts'::regclass
),'pilot draft write guard is installed');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='partner_private' and p.proname='pilot_draft_belongs_to_user'),'owner lookup is a narrowly scoped security-definer helper');
select ok(position('p_user_id=auth.uid()' in pg_get_functiondef('partner_private.pilot_draft_belongs_to_user(uuid,uuid)'::regprocedure))>0,
  'owner lookup cannot query an arbitrary user binding');
select ok(position('pilot_draft_review_fields_owner_forbidden' in pg_get_functiondef('partner_private.enforce_pilot_store_draft_write()'::regprocedure))>0,
  'partner cannot mutate reviewer evidence');
select ok(position('new.provenance is distinct from old.provenance' in pg_get_functiondef('partner_private.enforce_pilot_store_draft_write()'::regprocedure))>0,
  'partner cannot mutate server provenance/metadata');
select ok(position('pilot_draft_owner_fields_admin_forbidden' in pg_get_functiondef('partner_private.enforce_pilot_store_draft_write()'::regprocedure))>0,
  'administrator cannot mutate partner draft content');
select ok(position('pilot_draft_admin_state_forbidden' in pg_get_functiondef('partner_private.enforce_pilot_store_draft_write()'::regprocedure))>0,
  'draft state transitions are actor constrained');
select ok(position('old.statein(''submitted'',''resubmitted'')' in replace(pg_get_functiondef('partner_private.enforce_pilot_store_draft_write()'::regprocedure),' ',''))>0,
  'administrator decisions require a submitted or resubmitted draft');
select ok(exists(
  select 1 from pg_policies
  where schemaname='partner_private' and tablename='pilot_store_drafts'
    and policyname='pilot_draft_bound_owner_update'
    and coalesce(with_check,'') like '%draft%submitted%resubmitted%withdrawn%'
),'owner update policy excludes approval states');
select ok((select count(*)=3 from pg_policies where schemaname='partner_private' and tablename='pilot_store_drafts' and policyname in ('pilot_draft_bound_owner','pilot_draft_bound_owner_insert','pilot_draft_bound_owner_update') and (coalesce(qual,'') || coalesce(with_check,'')) like '%pilot_draft_belongs_to_user%'),
  'partner owner policies use the definer ownership helper');
select ok(exists(
  select 1 from pg_policies
  where schemaname='partner_private' and tablename='pilot_store_drafts'
    and policyname='pilot_draft_assigned_admin_update'
    and coalesce(qual,'') like '%current_user_has_role%'
    and coalesce(qual,'') like '%current_session_has_mfa%'
    and coalesce(qual,'') like '%current_session_recent_auth%'
),'assigned administrator update requires role/MFA/recent auth');
select ok(exists(
  select 1 from pg_policies
  where schemaname='partner_private' and tablename='pilot_store_drafts'
    and policyname='pilot_draft_assigned_admin_update'
    and coalesce(with_check,'') like '%changes_requested%approved%rejected%'
    and coalesce(with_check,'') like '%reviewed_by%auth.uid%'
),'administrator update policy requires review state and actor');
select ok(not exists(
  select 1 from information_schema.role_table_grants
  where table_schema='partner_private' and table_name='pilot_store_drafts'
    and grantee in ('anon','authenticated')
),'pilot drafts have no direct table grants');

select ok(exists(
  select 1 from pg_constraint
  where conrelid='shopper_private.store_correction_reports'::regclass
    and conname='store_correction_reports_correction_type_check'
),'Package 3 correction type contract remains constrained');
select ok(position('identity' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='shopper_private.store_correction_reports'::regclass and conname='store_correction_reports_correction_type_check')
))>0,'correction contract includes identity');
select ok(position('contact' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='shopper_private.store_correction_reports'::regclass and conname='store_correction_reports_correction_type_check')
))>0,'correction contract includes contact');
select ok(position('hours' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='shopper_private.store_correction_reports'::regclass and conname='store_correction_reports_correction_type_check')
))>0,'correction contract includes hours');
select ok(position('categories' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='shopper_private.store_correction_reports'::regclass and conname='store_correction_reports_correction_type_check')
))>0,'correction contract includes categories');
select ok(position('other' in pg_get_constraintdef(
  (select oid from pg_constraint where conrelid='shopper_private.store_correction_reports'::regclass and conname='store_correction_reports_correction_type_check')
))>0,'correction contract includes other');
select ok(exists(
  select 1 from pg_trigger
  where tgname='correction_case_events_no_update'
    and tgrelid='shopper_private.correction_case_events'::regclass
),'Package 3 correction events remain append-only');

select * from finish();
rollback;
