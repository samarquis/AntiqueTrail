begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

select has_table('partner_private','store_owner_intake_roots','claim and add starts share an applicant root');
select has_column('partner_private','store_owner_intake_roots','active_kind','the root records the active intake kind');
select has_table('partner_private','claim_free_activation_receipts','Free approval has an immutable receipt');
select has_table('partner_private','public_claim_consent_receipts','ordinary public applicants have an invitation-independent consent receipt');
select ok(
  exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='public_claim_consent_receipts' and column_name='actor_tombstone')
  and exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='claim_free_activation_receipts' and column_name='applicant_tombstone')
  and exists(select 1 from information_schema.columns where table_schema='partner_private' and table_name='claim_free_activation_receipts' and column_name='grantor_tombstone'),
  'retained claim receipts have content-free account deletion tombstones'
);
select ok(
  not has_table_privilege('authenticated','partner_private.store_owner_intake_roots','INSERT')
  and not has_table_privilege('authenticated','partner_private.claim_free_activation_receipts','INSERT'),
  'browser roles cannot write root or Free activation receipt rows directly'
);
select ok(
  not has_table_privilege('authenticated','partner_private.public_claim_consent_receipts','INSERT'),
  'browser roles cannot forge public claim consent receipts'
);
select has_function('app_public','public_listing_claim_command',array['text','jsonb']::text[],
  'public claim command exists behind the server release seam');
select ok(
  position('partner_private.claim_stage_allowed(target_store_id)' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('not synthetic' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'public start checks server stage and rejects Synthetic/route-selected authority'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('for update' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0
  and position('active_kind=''claim''' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'start locks and reserves exactly one applicant root'
);
select ok(
  position('role=''representative''' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'an existing Representative grant denies another intake'
);
select ok(
  position('listing_claim_unavailable' in lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)))>0,
  'stage-off and invalid public starts use one generic denial'
);
select ok(
  position('whereid=p_store_idandsynthetic' in regexp_replace(lower(pg_get_functiondef('app_public.partner_start_claim(uuid,text,text,text)'::regprocedure)),'[[:space:]]','','g'))>0,
  'legacy authenticated start RPC is Synthetic-only and cannot bypass the public command'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('app_public.partner_start_claim(uuid,text,text,text)'::regprocedure)))>0,
  'Synthetic claim starts use the same root for future add-versus-claim locking'
);
select ok(
  position('store_owner_intake_roots' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
    < position('claim_authority_signals' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
  and position('claim_authority_signals' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))
    < position('listing_claims where claim_id=p_claim_id for update' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure))),
  'approval locks applicant root then authority signals then exact claim'
);
select ok(
  position('store_partner_grants' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('store_photo_tier_state' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('claim_free_activation_receipts' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,
  'approval creates grant, Free tier, and receipt in its transaction'
);
select ok(
  position('root.active_kind<>''claim''' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0
  and position('root.active_id<>c.claim_id' in lower(pg_get_functiondef('partner_private.approve_exact_claim(uuid,uuid)'::regprocedure)))>0,
  'approval compares the exact claim root before granting scope'
);
select ok(exists(select 1 from pg_trigger where tgname='listing_claim_clear_matching_intake_root' and not tgisinternal),
  'terminal claim transitions clear only their matching applicant root');
select ok(
  position('active_kind=''claim''andactive_id=new.claim_id' in regexp_replace(lower(pg_get_functiondef('partner_private.clear_matching_claim_intake_root()'::regprocedure)),'[[:space:]]','','g'))>0,
  'root cleanup is claim-ID exact rather than broad applicant cleanup'
);
select ok(
  has_function_privilege('authenticated','app_public.public_listing_claim_command(text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','app_public.public_listing_claim_command(text,jsonb)','EXECUTE'),
  'only authenticated sessions may call the bounded public command'
);
select ok(
  position('public_capability_enabled(''claims'')' in lower(pg_get_functiondef('partner_private.claim_stage_allowed(uuid)'::regprocedure)))>0,
  'the claim capability remains server-owned and staged off by default'
);
select ok(
  position('public_claim_consent_receipts' in lower(pg_get_functiondef('app_public.build_account_export_canonical_json(uuid,uuid)'::regprocedure)))>0
  and position('claim_free_activation_receipts' in lower(pg_get_functiondef('app_public.build_account_export_canonical_json(uuid,uuid)'::regprocedure)))>0,
  'portable account export includes the applicant claim receipts before deletion'
);

select ok(
  position('grant_row.store_id=target_store_id' in regexp_replace(lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0
  and position('store_id=store_id' in regexp_replace(lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))=0,
  'public start scopes the active-grant check to the exact selected store'
);
select ok(
  position($q$values(actor,target_store_id,relationship,statement)$q$ in regexp_replace(lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0
  and position($q$setstate='submitted',version=version+1$q$ in regexp_replace(lower(pg_get_functiondef('app_public.public_listing_claim_command(text,jsonb)'::regprocedure)),'[[:space:]]','','g'))>0,
  'the production command follows the guarded draft-to-submitted transition'
);
select ok(
  position('ifnotfoundorc.version<>p_expected_version' in regexp_replace(lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)),'[[:space:]]','','g'))
    < position('perform1frompartner_private.store_partner_grants' in regexp_replace(lower(pg_get_functiondef('app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid)'::regprocedure)),'[[:space:]]','','g')),
  'claim existence and version are checked before a grant-lock PERFORM can overwrite FOUND'
);
select ok(
  position('notsynthetic' in regexp_replace(lower(pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure)),'[[:space:]]','','g'))>0
  and position('claim_stage_allowed(c.store_id)' in lower(pg_get_functiondef('partner_private.verify_synthetic_claim_signal(uuid,uuid,bytea,uuid,text)'::regprocedure)))>0,
  'the verifier admits public stores only through the server-owned claim release gate'
);

insert into auth.users(id) values
  ('17000000-0000-4000-8000-000000000001'),
  ('17000000-0000-4000-8000-000000000002');
insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience,publication_state)
values('17000000-0000-4000-8000-000000000010','issue-170-public-store','Issue 170 Public Store','Topeka','KS','170 Test Street','00000000-0000-4000-8000-000000000001','Runtime claim fixture','Runtime claim fixture',false,'public','active');
insert into app_private.role_grants(subject_user_id,role,state)
values('17000000-0000-4000-8000-000000000002','administrator','active');
update app_private.profiles set verified_email_snapshot='owner@example.test',
  age_18_attested_at=statement_timestamp(),last_authenticated_at=statement_timestamp()
where user_id='17000000-0000-4000-8000-000000000001';
grant identity_service to postgres;
grant usage,create on schema partner_private to identity_service;
grant usage,create on schema app_private to identity_service;
set role identity_service;
create or replace function partner_private.require_claim_admin() returns uuid
language sql stable security definer set search_path='' as $$
  select '17000000-0000-4000-8000-000000000002'::uuid
$$;
create or replace function app_private.current_session_is_active()
returns boolean language sql stable security definer set search_path='' as $$
  select true
$$;
create or replace function app_private.current_session_has_mfa()
returns boolean language sql stable security definer set search_path='' as $$
  select true
$$;
create or replace function app_private.current_session_recent_auth(p_window interval default interval '15 minutes')
returns boolean language sql stable security definer set search_path='' as $$
  select p_window>interval '0 seconds'
$$;
reset role;
set local "request.jwt.claims"='{"sub":"17000000-0000-4000-8000-000000000001"}';

select is(
  app_public.partner_consent_command('get_consent_status','{}'::jsonb)->>'reconsentRequired',
  'true',
  'an ordinary verified applicant can read the material-consent gate without a pilot identity'
);
select lives_ok(
  $$select app_public.partner_consent_command(
    'accept_material_terms',
    jsonb_build_object(
      'policyVersion',(select policy_version from partner_private.partner_material_terms where is_current),
      'idempotencyKey','issue-170-public-consent',
      'acknowledgements',jsonb_build_object('reviewed',true,'voluntary',true)
    )
  )$$,
  'an ordinary verified MFA applicant can accept current material terms'
);
select results_eq(
  $$select count(*) from partner_private.public_claim_consent_receipts
    where auth_user_id='17000000-0000-4000-8000-000000000001'$$,
  array[1::bigint],
  'public consent creates one durable invitation-independent receipt'
);

select throws_ok(
  $$select app_public.public_listing_claim_command('start','{"storeId":"17000000-0000-4000-8000-000000000010","relationship":"Owner","authorityStatement":"Authorized owner","idempotencyKey":"issue-170-start"}'::jsonb)$$,
  '42501'::character(5),'listing_claim_unavailable',
  'the public start remains side-effect-free while Package 10B claims are disabled'
);

grant release_automation to postgres;
grant usage,create on schema release_private to release_automation;
set role release_automation;
create or replace function release_private.public_capability_enabled(p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
  select p_capability='claims'
$$;
reset role;

select is(
  app_public.public_listing_claim_command('start','{"storeId":"17000000-0000-4000-8000-000000000010","relationship":"Owner","authorityStatement":"Authorized owner","idempotencyKey":"issue-170-start"}'::jsonb)->>'state',
  'submitted','active-stage start reaches the signal-eligible submitted state'
);
select is(
  (select count(*)::integer from partner_private.listing_claims where claimant_id='17000000-0000-4000-8000-000000000001'),
  1,'idempotent public start creates exactly one claim'
);
select lives_ok(
  $$select app_public.public_listing_claim_signal_command(
    (select claim_id from partner_private.listing_claims where claimant_id='17000000-0000-4000-8000-000000000001'),
    'published_business_contact',decode(repeat('11',32),'hex'),'issue-170-signal-one'
  )$$,
  'the first exact signal command succeeds'
);
select throws_ok(
  $$select app_public.public_listing_claim_signal_command(
    (select claim_id from partner_private.listing_claims where claimant_id='17000000-0000-4000-8000-000000000001'),
    'callback',decode(repeat('33',32),'hex'),'issue-170-signal-one'
  )$$,
  '42501','listing_claim_unavailable',
  'a signal retry key cannot falsely accept a different channel or evidence digest'
);
select lives_ok($$
do $runtime$
declare target_claim_id uuid; signal_one uuid; signal_two uuid; claim_version bigint;
begin
  select c.claim_id into target_claim_id from partner_private.listing_claims c where c.claimant_id='17000000-0000-4000-8000-000000000001';
  perform app_public.public_listing_claim_command('start','{"storeId":"17000000-0000-4000-8000-000000000010","relationship":"Owner","authorityStatement":"Authorized owner","idempotencyKey":"issue-170-start"}'::jsonb);
  perform app_public.public_listing_claim_signal_command(target_claim_id,'published_business_contact',decode(repeat('11',32),'hex'),'issue-170-signal-one');
  perform app_public.public_listing_claim_signal_command(target_claim_id,'callback',decode(repeat('22',32),'hex'),'issue-170-signal-two');
  select s.signal_id into signal_one from partner_private.claim_authority_signals s where s.claim_id=target_claim_id and s.channel_class='published_business_contact';
  select s.signal_id into signal_two from partner_private.claim_authority_signals s where s.claim_id=target_claim_id and s.channel_class='callback';
  select c.version into claim_version from partner_private.listing_claims c where c.claim_id=target_claim_id;
  perform app_public.partner_admin_signal_command('verify',target_claim_id,signal_one,claim_version,'issue-170-verify-one','authority_confirmed');
  select c.version into claim_version from partner_private.listing_claims c where c.claim_id=target_claim_id;
  perform app_public.partner_admin_signal_command('verify',target_claim_id,signal_two,claim_version,'issue-170-verify-two','authority_confirmed');
  select c.version into claim_version from partner_private.listing_claims c where c.claim_id=target_claim_id;
  perform app_public.partner_admin_claim_command('approve',target_claim_id,claim_version,'issue-170-approve','authority_confirmed',null);
end
$runtime$;
$$,'the active-stage public claim executes start, retry, two-signal verification, and approval');
select ok(
  exists(select 1 from partner_private.listing_claims where claimant_id='17000000-0000-4000-8000-000000000001' and state='approved')
  and exists(select 1 from app_private.role_grants where subject_user_id='17000000-0000-4000-8000-000000000001' and role='representative' and store_id='17000000-0000-4000-8000-000000000010' and state='active')
  and exists(select 1 from partner_private.store_photo_tier_state where store_id='17000000-0000-4000-8000-000000000010' and tier='free')
  and exists(select 1 from partner_private.claim_free_activation_receipts where applicant_id='17000000-0000-4000-8000-000000000001' and store_id='17000000-0000-4000-8000-000000000010')
  and exists(select 1 from partner_private.store_owner_intake_roots where applicant_id='17000000-0000-4000-8000-000000000001' and active_kind='none' and active_id is null),
  'approval atomically creates one exact Representative grant, Free tier, receipt, and clears the matching root'
);

insert into app_private.account_export_jobs(
  export_job_id,user_id,state,claim_token,claimed_at,lease_expires_at,attempt_count
) values (
  '17000000-0000-4000-8000-000000000070','17000000-0000-4000-8000-000000000001','building',
  '17000000-0000-4000-8000-000000000071',statement_timestamp(),statement_timestamp()+interval '5 minutes',1
);
create temporary table issue_170_export as
select app_public.build_account_export(
  '17000000-0000-4000-8000-000000000070','17000000-0000-4000-8000-000000000071'
)::jsonb as archive;
select ok(
  (select archive#>>'{canonical,partnerClaims,consentReceipts,0,policyVersion}' from issue_170_export)
    =(select policy_version from partner_private.partner_material_terms where is_current)
  and (select archive#>>'{canonical,partnerClaims,freeActivations,0,tier}' from issue_170_export)='free',
  'portable export returns the exact consent and Free activation receipts before deletion'
);

select lives_ok(
  $$select app_private.purge_account_application_data('17000000-0000-4000-8000-000000000001')$$,
  'the established application-data purge de-identifies public claim receipts'
);
select ok(
  exists(select 1 from partner_private.public_claim_consent_receipts where auth_user_id is null and actor_tombstone is not null)
  and exists(select 1 from partner_private.claim_free_activation_receipts where applicant_id is null and applicant_tombstone is not null),
  'claim receipts retain audit facts but no applicant account identifier after purge'
);
select lives_ok(
  $$delete from auth.users where id='17000000-0000-4000-8000-000000000001'$$,
  'retained claim receipts do not block provider account deletion'
);
select lives_ok(
  $$select app_private.purge_account_application_data('17000000-0000-4000-8000-000000000002')$$,
  'administrator deletion de-identifies the grantor side of retained activation receipts'
);
select ok(
  exists(select 1 from partner_private.claim_free_activation_receipts where granted_by is null and grantor_tombstone is not null),
  'Free activation receipts retain no grantor account identifier after purge'
);
select throws_ok(
  $$update partner_private.public_claim_consent_receipts set accepted_at=accepted_at+interval '1 second'$$,
  '55000','public_claim_consent_receipt_append_only',
  'consent receipt audit facts remain append-only after de-identification'
);
select throws_ok(
  $$update partner_private.claim_free_activation_receipts set created_at=created_at+interval '1 second'$$,
  '55000','claim_free_activation_receipt_append_only',
  'Free activation audit facts remain append-only after de-identification'
);

select * from finish();
rollback;
