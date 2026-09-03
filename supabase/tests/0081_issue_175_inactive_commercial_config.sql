-- Issue #175: immutable inactive commercial configuration and private research proof.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

select has_table('partner_private','photo_tier_commercial_configs','commercial configs are durable');
select has_table('partner_private','commercial_research_authorizations','signed research authorizations are durable');
select has_table('partner_private','commercial_research_participants','eligible participants are exact-scoped');
select has_table('partner_private','commercial_research_attempts','minimized outcomes are durable');
select has_table('partner_private','commercial_research_signature_challenges','signature challenges are exact and single-use');
select has_table('partner_private','commercial_research_signature_receipts','trusted signature receipts are durable');
select ok((select count(*) = 6 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'partner_private' and c.relname in (
    'photo_tier_commercial_configs','commercial_research_authorizations',
    'commercial_research_participants','commercial_research_attempts',
    'commercial_research_signature_challenges','commercial_research_signature_receipts'
  ) and c.relrowsecurity and c.relforcerowsecurity),'every commercial research table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants
  where table_schema = 'partner_private' and table_name in (
    'photo_tier_commercial_configs','commercial_research_authorizations',
    'commercial_research_participants','commercial_research_attempts'
  ) and grantee in ('anon','authenticated','service_role')),'browser and generic service roles cannot enumerate commercial data');

select has_function('partner_private','approve_photo_tier_commercial_config',array['bigint','uuid'],'approval command exists');
select has_function('partner_private','issue_commercial_research_signature_challenge',array['bigint','bytea','uuid','uuid[]','timestamp with time zone'],'trusted exact-config challenge command exists');
select has_function('partner_private','commercial_config_is_activation_candidate',array['bigint','bytea'],'exact activation-candidate check exists');
select has_function('app_public','billing_get_commercial_research_config',array['uuid'],'private presentation RPC exists');
select has_function('app_public','billing_record_commercial_research_attempt',array['uuid','bigint','text','text','text','text','text','text'],'bound outcome RPC exists');
select ok(has_function_privilege('authenticated','app_public.billing_get_commercial_research_config(uuid)','EXECUTE')
  and not has_function_privilege('anon','app_public.billing_get_commercial_research_config(uuid)','EXECUTE'),'only authenticated exact-cohort callers may request a config');
select ok(not has_function_privilege('authenticated','partner_private.approve_photo_tier_commercial_config(bigint,uuid)','EXECUTE'),'browser roles cannot approve configurations');

-- Production revokes this owner-role membership. The test runner borrows it only
-- inside this transaction so direct service-boundary fixtures exercise FORCE RLS.
grant billing_automation to postgres;
set local role billing_automation;
insert into partner_private.photo_tier_commercial_configs(version,state) values (1,'draft');
select throws_ok(
  $$select partner_private.approve_photo_tier_commercial_config(1,'17500000-0000-4000-8000-000000000001')$$,
  '55000','commercial_research_authorization_invalid','self-described approval without a trusted receipt is denied');

insert into partner_private.photo_tier_commercial_configs(
  version,state,gallery_price_cents,full_gallery_price_cents,currency,tax_mode,
  first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,
  upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,
  refund_policy_version,support_policy_version,
  terms_version,privacy_version,full_gallery_limits_version,full_gallery_limits
) values (
  2,'draft',1200,1900,'USD','Tax is calculated at Checkout.',
  'First charge follows Checkout confirmation.','Renews monthly until canceled.',
  'Cancel anytime through the self-serve customer portal.',
  'Request a full refund within 48 hours of a charge; no other refunds.',
  'Upgrades take effect immediately with prorated charges.',
  'Downgrades take effect at renewal with no partial refund; the last scheduled downgrade wins.',
  'Failed payment has a 14-day grace period, then automatically downgrades to Free.',
  'Photos over the Free limit hide at downgrade and delete after a 30-day grace period.',
  'refund-v1','support-v1','terms-v1','privacy-v1','limits-v1',
  jsonb_build_object(
    'acceptedFileTypes',jsonb_build_array('image/jpeg','image/png'),
    'maxFileBytes',10000000,'maxWidthPixels',6000,'maxHeightPixels',6000,
    'uploadRateRule','Up to 20 uploads per hour.',
    'quotaOutageRule','Uploads pause during quota or provider outages.',
    'moderationAbuseRule','Every photo remains subject to moderation and abuse controls.',
    'reasonRecoveryAppealRule','A reason, recovery step, and appeal path are provided.',
    'paidServiceRemedy','Service failures receive the published remedy.'
  )
);

reset role;
insert into community_private.community_evidence_receipts(
  receipt_id,receipt_kind,responsibility,decision,area_slug,signed_payload_digest,
  external_verified,mfa_verified,recent_authentication,predicates,signed_at
) values
  ('17500000-0000-4000-8000-000000000021','community_gate','PrimaryInternalTester','pass','community-one',decode(repeat('51',32),'hex'),true,true,true,'{"all_predicates_pass":true}',statement_timestamp()),
  ('17500000-0000-4000-8000-000000000022','community_gate','PrimaryInternalTester','pass','community-two',decode(repeat('52',32),'hex'),true,true,true,'{"all_predicates_pass":true}',statement_timestamp()),
  ('17500000-0000-4000-8000-000000000023','community_gate','PrimaryInternalTester','pass','community-three',decode(repeat('53',32),'hex'),true,true,true,'{"all_predicates_pass":true}',statement_timestamp());

set local role billing_automation;
select throws_ok($$select partner_private.issue_commercial_research_signature_challenge(
  2,decode(repeat('22',32),'hex'),'17500000-0000-4000-8000-000000000002',
  array['17500000-0000-4000-8000-000000000021'::uuid,'17500000-0000-4000-8000-000000000022'::uuid],
  statement_timestamp()+interval '1 day')$$,'42501','commercial_research_challenge_denied',
  'all three passing community review receipts are required');
with issued as materialized (
  select partner_private.issue_commercial_research_signature_challenge(
    2,decode(repeat('22',32),'hex'),'17500000-0000-4000-8000-000000000002',
    array['17500000-0000-4000-8000-000000000021'::uuid,'17500000-0000-4000-8000-000000000022'::uuid,'17500000-0000-4000-8000-000000000023'::uuid],
    statement_timestamp()+interval '1 day') result
)
select ok(issued.result->>'configDigest' ~ '^[0-9a-f]{64}$',
  'challenge binds the exact canonical config and protocol after required reviews') from issued;
reset role;

grant commercial_research_signature_service to postgres;
set local role commercial_research_signature_service;
insert into partner_private.commercial_research_signature_receipts(
  receipt_id,challenge_id,config_version,config_digest,protocol_digest,signer_user_id,
  signer_responsibility,signed_payload_digest,provider_verification_id,signed_at,verified_at
) select
  '17500000-0000-4000-8000-000000000030',challenge_id,config_version,config_digest,protocol_digest,
  signer_user_id,'ProductOwner',signed_payload_digest,'trusted-signature-175',statement_timestamp(),statement_timestamp()
from partner_private.commercial_research_signature_challenges where config_version=2;
reset role;

select ok(not has_table_privilege('billing_automation','partner_private.commercial_research_signature_receipts','INSERT'),
  'billing owner cannot self-issue a trusted signature receipt');
set local role billing_automation;
select is(partner_private.approve_photo_tier_commercial_config(2,'17500000-0000-4000-8000-000000000030')->>'state','approved_inactive','trusted fresh single-use signature receipt freezes one inactive config');
select ok((select canonical_bytes is not null and digest = extensions.digest(convert_to(canonical_bytes,'UTF8'),'sha256')
  from partner_private.photo_tier_commercial_configs where version = 2),'stored canonical bytes and digest agree deterministically');
select ok((select approved_by = '17500000-0000-4000-8000-000000000002' and approved_at is not null
  from partner_private.photo_tier_commercial_configs where version = 2),'approval identity and time are frozen');
select throws_ok($$update partner_private.photo_tier_commercial_configs set gallery_price_cents = 1300 where version = 2$$,
  '42501','commercial_config_immutable','approved commercial fields cannot change');
select throws_ok($$update partner_private.photo_tier_commercial_configs set full_gallery_limits = '{}' where version = 2$$,
  '42501','commercial_config_immutable','approved Full Gallery limits cannot change');
select ok(partner_private.commercial_config_is_activation_candidate(2,(select digest from partner_private.photo_tier_commercial_configs where version=2)),'exact approved inactive digest is an activation candidate');
select ok(not partner_private.commercial_config_is_activation_candidate(2,decode(repeat('ff',32),'hex')),'stale or mismatched digest is not an activation candidate');
select throws_ok($$select partner_private.approve_photo_tier_commercial_config(2,'17500000-0000-4000-8000-000000000030')$$,
  '55000','commercial_research_authorization_invalid','consumed signature challenges cannot replay');

insert into partner_private.photo_tier_commercial_configs(
  version,state,gallery_price_cents,full_gallery_price_cents,currency,tax_mode,
  first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,
  upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,
  refund_policy_version,support_policy_version,terms_version,privacy_version,
  full_gallery_limits_version,full_gallery_limits
) select 3,'draft',gallery_price_cents,full_gallery_price_cents,currency,tax_mode,
  first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,
  upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,
  refund_policy_version,support_policy_version,terms_version,privacy_version,
  full_gallery_limits_version,jsonb_set(full_gallery_limits,'{maxFileBytes}','1.5')
from partner_private.photo_tier_commercial_configs where version=2;
update partner_private.photo_tier_commercial_configs
set full_gallery_limits = jsonb_set(full_gallery_limits,'{uploadRateRule}','123') where version=3;
select ok(not partner_private.commercial_config_is_complete(config),
  'numeric Full Gallery disclosure is incomplete')
from partner_private.photo_tier_commercial_configs config where version=3;
update partner_private.photo_tier_commercial_configs
set full_gallery_limits = jsonb_set(full_gallery_limits,'{uploadRateRule}','{"unexpected":"object"}') where version=3;
select ok(not partner_private.commercial_config_is_complete(config),
  'object Full Gallery disclosure is incomplete')
from partner_private.photo_tier_commercial_configs config where version=3;
update partner_private.photo_tier_commercial_configs
set full_gallery_limits = jsonb_set(full_gallery_limits,'{uploadRateRule}','["unexpected"]') where version=3;
select ok(not partner_private.commercial_config_is_complete(config),
  'array Full Gallery disclosure is incomplete')
from partner_private.photo_tier_commercial_configs config where version=3;
update partner_private.photo_tier_commercial_configs
set full_gallery_limits = jsonb_set(full_gallery_limits,'{uploadRateRule}','true') where version=3;
select ok(not partner_private.commercial_config_is_complete(config),
  'boolean Full Gallery disclosure is incomplete')
from partner_private.photo_tier_commercial_configs config where version=3;
update partner_private.photo_tier_commercial_configs
set full_gallery_limits = jsonb_set(full_gallery_limits,'{uploadRateRule}','null') where version=3;
select ok(not partner_private.commercial_config_is_complete(config),
  'null Full Gallery disclosure is incomplete')
from partner_private.photo_tier_commercial_configs config where version=3;
select throws_ok($$select partner_private.issue_commercial_research_signature_challenge(
  3,decode(repeat('23',32),'hex'),'17500000-0000-4000-8000-000000000002',
  array['17500000-0000-4000-8000-000000000021'::uuid,'17500000-0000-4000-8000-000000000022'::uuid,'17500000-0000-4000-8000-000000000023'::uuid],
  statement_timestamp()+interval '1 day')$$,'42501','commercial_research_challenge_denied',
  'fractional or wrong-type limit values cannot enter an approved packet');

insert into partner_private.photo_tier_commercial_configs(
  version,state,gallery_price_cents,full_gallery_price_cents,currency,tax_mode,
  first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,
  upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,
  refund_policy_version,support_policy_version,terms_version,privacy_version,
  full_gallery_limits_version,full_gallery_limits
) select candidate_version,'draft',gallery_price_cents,full_gallery_price_cents,currency,tax_mode,
  first_charge_rule,renewal_rule,cancel_anytime_rule,refund_window_rule,
  upgrade_proration_rule,downgrade_rule,failed_payment_grace_rule,hidden_photo_deletion_rule,
  refund_policy_version,support_policy_version,terms_version,privacy_version,
  full_gallery_limits_version,full_gallery_limits
from partner_private.photo_tier_commercial_configs
cross join (values (4::bigint),(5::bigint),(6::bigint)) candidate(candidate_version)
where version=2;
select partner_private.issue_commercial_research_signature_challenge(
  candidate_version,decode(repeat('24',32),'hex'),'17500000-0000-4000-8000-000000000002',
  array['17500000-0000-4000-8000-000000000021'::uuid,'17500000-0000-4000-8000-000000000022'::uuid,'17500000-0000-4000-8000-000000000023'::uuid],
  statement_timestamp()+interval '1 day')
from (values (4::bigint),(5::bigint),(6::bigint)) candidate(candidate_version);
update partner_private.photo_tier_commercial_configs set gallery_price_cents=1300 where version=4;
reset role;

set local role commercial_research_signature_service;
insert into partner_private.commercial_research_signature_receipts(
  receipt_id,challenge_id,config_version,config_digest,protocol_digest,signer_user_id,
  signer_responsibility,signed_payload_digest,provider_verification_id,signed_at,verified_at
) select
  case config_version when 4 then '17500000-0000-4000-8000-000000000034'::uuid else '17500000-0000-4000-8000-000000000035'::uuid end,
  challenge_id,config_version,config_digest,protocol_digest,signer_user_id,'ProductOwner',
  signed_payload_digest,'trusted-signature-'||config_version,
  case when config_version=5 then statement_timestamp()+interval '1 minute' else statement_timestamp() end,
  case when config_version=5 then statement_timestamp()+interval '1 minute' else statement_timestamp() end
from partner_private.commercial_research_signature_challenges where config_version in (4,5);
select throws_ok($$insert into partner_private.commercial_research_signature_receipts(
  receipt_id,challenge_id,config_version,config_digest,protocol_digest,signer_user_id,
  signer_responsibility,signed_payload_digest,provider_verification_id,signed_at,verified_at
) select
  '17500000-0000-4000-8000-000000000036',challenge_id,config_version,config_digest,protocol_digest,
  signer_user_id,'ProductOwner',signed_payload_digest,'trusted-signature-4',statement_timestamp(),statement_timestamp()
from partner_private.commercial_research_signature_challenges where config_version=6$$,
'23505',null,'one external provider proof cannot back receipts for different challenges');
reset role;
set local role billing_automation;
select throws_ok($$select partner_private.approve_photo_tier_commercial_config(4,'17500000-0000-4000-8000-000000000034')$$,
  '55000','commercial_research_authorization_invalid','draft mutation after challenge makes the trusted receipt stale');
select throws_ok($$select partner_private.approve_photo_tier_commercial_config(5,'17500000-0000-4000-8000-000000000035')$$,
  '55000','commercial_research_authorization_invalid','future-dated trusted signature receipt is denied');
reset role;

insert into auth.users(id) values ('17500000-0000-4000-8000-000000000010');
set local role identity_service;
insert into app_private.active_sessions(
  session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,
  mfa_verified_at,access_token_expires_at
) values (
  '17500000-0000-4000-8000-000000000011','17500000-0000-4000-8000-000000000010',
  statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'
);
reset role;
set local role billing_automation;
insert into partner_private.commercial_research_participants(
  authorization_id,user_id,eligible,consent_digest,artifact_digest,question_version,
  expires_at,linkage_purge_due_at
) values (
  (select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2),
  '17500000-0000-4000-8000-000000000010',true,
  decode(repeat('33',32),'hex'),decode(repeat('44',32),'hex'),'questions-v1',
  statement_timestamp()+interval '30 minutes',statement_timestamp()+interval '30 days'
);
reset role;
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','17500000-0000-4000-8000-000000000010',
  'session_id','17500000-0000-4000-8000-000000000011'
)::text,true);

select is(app_public.billing_get_commercial_research_config((select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2))->>'state','approved_inactive','eligible participant reads only the exact inactive version');
select is(app_public.billing_get_commercial_research_config((select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2))->>'galleryPriceCents','1200','private response contains the frozen Gallery price');
select ok((app_public.billing_get_commercial_research_config((select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2))->'fullGalleryLimits') ?& array[
  'acceptedFileTypes','maxFileBytes','maxWidthPixels','maxHeightPixels','uploadRateRule',
  'quotaOutageRule','moderationAbuseRule','reasonRecoveryAppealRule','paidServiceRemedy'
],'private response contains every Full Gallery non-count disclosure');
select ok(app_public.billing_get_commercial_research_config((select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2)) ?& array[
  'cancelAnytimeRule','refundWindowRule','upgradeProrationRule','downgradeRule',
  'failedPaymentGraceRule','hiddenPhotoDeletionRule'
],'private response contains every exact paid lifecycle consequence');
select throws_ok($$select app_public.billing_get_commercial_research_config('17500000-0000-4000-8000-000000000099')$$,
  '42501','commercial_research_unavailable','wrong authorization denies generically');

select is(app_public.billing_record_commercial_research_attempt(
  (select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2),2,(select encode(digest,'hex') from partner_private.photo_tier_commercial_configs where version=2),
  repeat('44',32),'questions-v1','gallery','photo_capacity','attempt-key-1'
)->>'configVersion','2','outcome binds exact participant, config, artifact, question, consent, and choice');
select is((select encode(consent_digest,'hex') from partner_private.commercial_research_attempts where participant_user_id='17500000-0000-4000-8000-000000000010'),repeat('33',32),'minimized outcome freezes the participant consent digest');
select is((select choice||':'||reason_code from partner_private.commercial_research_attempts where participant_user_id='17500000-0000-4000-8000-000000000010'),'gallery:photo_capacity','minimized outcome stores no free-form response');
select is(app_public.billing_record_commercial_research_attempt(
  (select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2),2,(select encode(digest,'hex') from partner_private.photo_tier_commercial_configs where version=2),
  repeat('44',32),'questions-v1','gallery','photo_capacity','attempt-key-1'
)->>'attemptId',(select attempt_id::text from partner_private.commercial_research_attempts where participant_user_id='17500000-0000-4000-8000-000000000010'),
  'ambiguous response-loss retry returns the same logical response receipt');
select is((select count(*)::text from partner_private.store_billing_outbox),'0','inactive research creates no provider outbox work');
select throws_ok($$update partner_private.commercial_research_attempts set choice='full_gallery' where participant_user_id='17500000-0000-4000-8000-000000000010'$$,
  '42501','billing_append_only','research outcomes are append-only');

select ok(position('forupdate' in replace(lower(pg_get_functiondef('app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text)'::regprocedure)),' ','')) > 0,
  'submission locks authorization before accepting or replaying an outcome');
set local role billing_automation;
update partner_private.commercial_research_authorizations
  set signed_at=statement_timestamp()-interval '1 day',expires_at=statement_timestamp()-interval '1 second'
  where authorization_id=(select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2);
reset role;
select throws_ok($$select app_public.billing_record_commercial_research_attempt(
  (select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2),2,(select encode(digest,'hex') from partner_private.photo_tier_commercial_configs where version=2),
  repeat('44',32),'questions-v1','gallery','photo_capacity','attempt-key-expired')$$,
  '42501','commercial_research_unavailable','authorization expiry between presentation and submit denies atomically');
set local role billing_automation;
update partner_private.commercial_research_authorizations set expires_at=statement_timestamp()+interval '1 day',state='revoked'
  where authorization_id=(select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2);
reset role;
select throws_ok($$select app_public.billing_record_commercial_research_attempt(
  (select research_authorization_id from partner_private.photo_tier_commercial_configs where version=2),2,(select encode(digest,'hex') from partner_private.photo_tier_commercial_configs where version=2),
  repeat('44',32),'questions-v1','gallery','photo_capacity','attempt-key-revoked')$$,
  '42501','commercial_research_unavailable','authorization revocation between presentation and submit denies atomically');

set local role anon;
select throws_ok($$select app_public.billing_get_commercial_research_config('17500000-0000-4000-8000-000000000003')$$,
  '42501',null,'anonymous callers receive no config or price');
reset role;
select set_config('request.jwt.claims','',true);
select throws_ok($$select app_public.billing_get_commercial_research_config('17500000-0000-4000-8000-000000000003')$$,
  '42501','commercial_research_unavailable','ordinary unauthenticated paths cannot enumerate configs');

select ok(position('stripe' in lower(pg_get_functiondef('app_public.billing_get_commercial_research_config(uuid)'::regprocedure))) = 0
  and position('store_billing_outbox' in lower(pg_get_functiondef('app_public.billing_get_commercial_research_config(uuid)'::regprocedure))) = 0
  and position('stripe' in lower(pg_get_functiondef('app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text)'::regprocedure))) = 0
  and position('store_billing_outbox' in lower(pg_get_functiondef('app_public.billing_record_commercial_research_attempt(uuid,bigint,text,text,text,text,text,text)'::regprocedure))) = 0,
  'research RPCs have no provider, webhook, job, or billing-outbox path');

select * from finish();
rollback;
