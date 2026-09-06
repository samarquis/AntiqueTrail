begin;
set local search_path=public,extensions;
select no_plan();
select is(app_public.billing_get_capability()->>'enabled','false','production starts off without evidence');
\ir fixtures/paid_servicing.inc
reset role;
alter table partner_private.photo_tier_commercial_configs disable trigger photo_tier_commercial_config_guard;
update partner_private.photo_tier_commercial_configs set state='approved_inactive' where version=178;
alter table partner_private.photo_tier_commercial_configs enable trigger photo_tier_commercial_config_guard;
update partner_private.photo_tier_sales_control set state='off_prelaunch',commercial_config_version=null,activation_receipt_id=null;
create temp table ids(kind text primary key,id uuid);
insert into ids select 'activation',receipt_id from partner_private.photo_tier_activation_receipts;
insert into ids values('command',gen_random_uuid());
create function pg_temp.evidence_ids() returns uuid[] language sql as $$ select array_agg(receipt_id order by kind) from (select distinct on(kind) * from partner_private.photo_tier_activation_evidence order by kind,revision desc) e $$;
create function pg_temp.revise(k text,patch jsonb) returns uuid language plpgsql as $$ declare e partner_private.photo_tier_activation_evidence; begin
  select * into e from partner_private.photo_tier_activation_evidence where kind=k order by revision desc limit 1;
  e.receipt_id:=gen_random_uuid(); e.revision:=e.revision+1; e.provider_verification_id:=gen_random_uuid()::text;
  select * into e from jsonb_populate_record(e,patch);
  insert into partner_private.photo_tier_activation_evidence select e.*;
  return e.receipt_id;
end $$;
create function pg_temp.resume_auth(aid uuid,roles text[] default array['Operations','ProductOwner']) returns uuid language plpgsql as $$ declare rid uuid:=gen_random_uuid(); begin
  insert into partner_private.photo_tier_transition_authorizations(receipt_id,action,expected_sales_version,reason,expires_at,activation_receipt_id)
    values(rid,'resume',(select version from partner_private.photo_tier_sales_control),'synthetic_resume',statement_timestamp()+interval '10 minutes',aid);
  insert into partner_private.photo_tier_transition_signatures(receipt_id,responsibility,signer_id,payload_digest,provider_verification_id)
    select rid,r,gen_random_uuid(),partner_private.billing_transition_payload(rid),gen_random_uuid()::text from unnest(roles) r;
  return rid;
end $$;
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in ('partner_private.photo_tier_activation_evidence'::regclass,'partner_private.photo_tier_activation_receipts'::regclass,'partner_private.photo_tier_activation_commands'::regclass)),'all activation tables FORCE RLS');
select ok(not has_table_privilege('billing_transition_service','partner_private.photo_tier_activation_evidence','INSERT'),'deployment cannot manufacture prerequisite attestations');
select ok(not has_table_privilege('billing_mirror_service','partner_private.photo_tier_activation_evidence','INSERT'),'provider workers cannot manufacture prerequisites');
select ok(not has_function_privilege('billing_activation_evidence_service','app_public.promote_photo_tier_capability(uuid,bigint,uuid)','EXECUTE'),'evidence verifier cannot deploy');
select ok(not has_function_privilege(r,'app_public.promote_photo_tier_capability(uuid,bigint,uuid)','EXECUTE') and not has_function_privilege(r,'app_public.resume_photo_tier_sales(uuid,uuid,bigint,uuid)','EXECUTE'),'unscoped role denied: '||r) from unnest(array['anon','authenticated','service_role','billing_mirror_service']) r;
select throws_ok($$select app_public.prepare_photo_tier_activation(gen_random_uuid(),178,array[]::uuid[])$$,'55000','billing_composite_incomplete','missing prerequisites deny preparation');
select throws_ok($$select app_public.promote_photo_tier_capability((select id from ids where kind='activation'),99,gen_random_uuid())$$,'40001','billing_sales_version_stale','stale sales CAS denies');
select is(app_public.billing_get_capability()->>'enabled','false','approved inactive has no paid capability');
select is(app_public.billing_get_sales_offer(),null::jsonb,'off exposes no public price');
select is(app_public.billing_get_purchase_context(),null::jsonb,'off exposes no plans selection');
-- Each prerequisite has independent current-version/failure enforcement.
do $$ declare k text; begin
  for k in select distinct kind from partner_private.photo_tier_activation_evidence loop
    begin
      perform pg_temp.revise(k,'{"decision":"fail"}');
      begin
        perform app_public.prepare_photo_tier_activation(gen_random_uuid(),178,pg_temp.evidence_ids());
        raise exception 'unexpected_activation';
      exception when sqlstate '55000' then null; end;
      raise exception using errcode='Z0180',message='rollback_case';
    exception when sqlstate 'Z0180' then null; end;
  end loop;
end $$;
select pass('all fourteen independently failed prerequisite kinds deny preparation');
savepoint stale;
select pg_temp.revise('provider','{}');
select throws_ok($$select app_public.promote_photo_tier_capability((select id from ids where kind='activation'),1,gen_random_uuid())$$,'55000','billing_composite_evidence_invalid','superseded receipt denies promotion');
select is((select state from partner_private.photo_tier_commercial_configs where version=178),'approved_inactive','failure leaves commercial state inactive');
select is((select state from partner_private.photo_tier_sales_control),'off_prelaunch','failure leaves sales off');
rollback to stale;
savepoint mismatch;
select pg_temp.revise('provider',jsonb_build_object('artifact_digest','\x'||repeat('ff',32)));
select throws_ok($$select app_public.prepare_photo_tier_activation(gen_random_uuid(),178,pg_temp.evidence_ids())$$,'55000','billing_composite_evidence_invalid','artifact mismatch denies');
rollback to mismatch;
savepoint expired;
select pg_temp.revise('security',jsonb_build_object('signed_at',now()-interval '2 hours','verified_at',now()-interval '2 hours','expires_at',now()-interval '1 hour'));
select throws_ok($$select app_public.prepare_photo_tier_activation(gen_random_uuid(),178,pg_temp.evidence_ids())$$,'55000','billing_composite_evidence_invalid','expired security denies');
rollback to expired;
savepoint wrong_community;
select pg_temp.revise('community_1',jsonb_build_object('source_id',(select source_id from partner_private.photo_tier_activation_evidence where kind='community_2')));
select throws_ok($$select app_public.prepare_photo_tier_activation(gen_random_uuid(),178,pg_temp.evidence_ids())$$,'55000','billing_composite_community_invalid','wrong ordinal/community denies');
rollback to wrong_community;
savepoint revoked;
update partner_private.commercial_research_authorizations set state='revoked';
select throws_ok($$select app_public.promote_photo_tier_capability((select id from ids where kind='activation'),1,gen_random_uuid())$$,'55000','billing_composite_research_invalid','revoked research denies promotion');
rollback to revoked;
grant select on ids to billing_transition_service;
set local role billing_transition_service;
select is(app_public.promote_photo_tier_capability((select id from ids where kind='activation'),1,(select id from ids where kind='command'))->>'state','sales_open','scoped promotion succeeds');
reset role;
select is((select state from partner_private.photo_tier_commercial_configs where version=178),'active','promotion atomically activates exact config');
select is(app_public.billing_get_capability()->>'enabled','true','only complete active composite exposes paid capability');
select is(app_public.billing_get_sales_offer()->>'galleryPriceCents','1200','open exposes the exact approved public price');
select ok(not (app_public.billing_get_sales_offer() ?| array['sources','evidence','research_authorization_id']),'public offer omits private evidence');
select is(app_public.billing_get_purchase_context()->>'storeId','17800000-0000-4000-8000-000000000001','eligible Free scope receives plans context');
select is((select sales_generation from partner_private.photo_tier_sales_control),2::bigint,'promotion fences generation');
select is(app_public.promote_photo_tier_capability((select id from ids where kind='activation'),1,(select id from ids where kind='command'))->>'version','2','exact response-loss replay is idempotent');
select throws_ok($$select app_public.promote_photo_tier_capability((select id from ids where kind='activation'),1,gen_random_uuid())$$,'22023','billing_idempotency_mismatch','receipt cannot be replayed with another key');
-- Pause through #179 before exercising #180 resume.
insert into ids values('pause',gen_random_uuid());
insert into partner_private.photo_tier_transition_authorizations(receipt_id,action,expected_sales_version,reason,expires_at,product_owner_notified_at)
  values((select id from ids where kind='pause'),'pause',2,'synthetic_pause',now()+interval '10 minutes',now());
-- Reconstruct the exact pre-#180 row shape; its already-signed digest must survive.
select is(partner_private.billing_transition_payload(a.receipt_id),extensions.digest(convert_to((to_jsonb(a)-'activation_receipt_id')::text,'utf8'),'sha256'),'legacy pause signature payload retains the pre-migration row shape')
from partner_private.photo_tier_transition_authorizations a where receipt_id=(select id from ids where kind='pause');
insert into partner_private.photo_tier_transition_signatures(receipt_id,responsibility,signer_id,payload_digest,provider_verification_id)
  select a.receipt_id,r,gen_random_uuid(),extensions.digest(convert_to((to_jsonb(a)-'activation_receipt_id')::text,'utf8'),'sha256'),gen_random_uuid()::text
  from partner_private.photo_tier_transition_authorizations a cross join unnest(array['Operations','Security']) r where a.receipt_id=(select id from ids where kind='pause');
select is(app_public.pause_photo_tier_sales((select id from ids where kind='pause'),2,gen_random_uuid())->>'state','servicing_only','signed #179 pause integrates');
select is(app_public.billing_get_capability()->>'enabled','false','servicing removes paid acquisition');
select is(app_public.billing_get_sales_offer(),null::jsonb,'servicing removes all public price copy');
insert into ids values('bad_resume',pg_temp.resume_auth((select id from ids where kind='activation'),array['Operations','Security']));
select throws_ok($$select app_public.resume_photo_tier_sales((select id from ids where kind='bad_resume'),(select id from ids where kind='activation'),3,gen_random_uuid())$$,'42501','billing_transition_signatures_required','resume requires Product Owner, not Security substitution');
insert into ids values('resume',pg_temp.resume_auth((select id from ids where kind='activation')));

-- A signed receipt cannot resume a configuration that is no longer current.
savepoint stale_resume_config;
update partner_private.photo_tier_commercial_configs set state='superseded' where version=178;
select throws_ok($$select app_public.resume_photo_tier_sales((select id from ids where kind='resume'),(select id from ids where kind='activation'),3,gen_random_uuid())$$,'55000','billing_composite_config_invalid','superseded commercial config denies resume');
select is((select state from partner_private.photo_tier_sales_control),'servicing_only','stale config denial preserves servicing');
select is((select sales_generation from partner_private.photo_tier_sales_control),3::bigint,'stale config denial does not advance generation');
select is((select count(*)::integer from partner_private.photo_tier_sales_transition_receipts where action='resume'),0,'stale config denial leaves no partial resume receipt');
select is(app_public.billing_get_sales_offer(),null::jsonb,'stale config exposes no public price');
rollback to stale_resume_config;

savepoint stale_resume;
select pg_temp.revise('hosted_ci','{}');
select throws_ok($$select app_public.resume_photo_tier_sales((select id from ids where kind='resume'),(select id from ids where kind='activation'),3,gen_random_uuid())$$,'55000','billing_composite_evidence_invalid','changed prerequisite requires newly prepared composite');
select is((select state from partner_private.photo_tier_sales_control),'servicing_only','failed resume preserves servicing');
insert into ids values('fresh',app_public.prepare_photo_tier_activation(gen_random_uuid(),178,pg_temp.evidence_ids()));
insert into ids values('fresh_resume',pg_temp.resume_auth((select id from ids where kind='fresh')));
select is(app_public.resume_photo_tier_sales((select id from ids where kind='fresh_resume'),(select id from ids where kind='fresh'),3,gen_random_uuid())->>'state','sales_open','new current composite permits resume after prerequisite change');
rollback to stale_resume;
insert into ids values('resume_key',gen_random_uuid());
select is(app_public.resume_photo_tier_sales((select id from ids where kind='resume'),(select id from ids where kind='activation'),3,(select id from ids where kind='resume_key'))->>'state','sales_open','unchanged current composite resumes');
select is((select sales_generation from partner_private.photo_tier_sales_control),4::bigint,'pause and resume each advance generation');
select is(app_public.resume_photo_tier_sales((select id from ids where kind='resume'),(select id from ids where kind='activation'),3,(select id from ids where kind='resume_key'))->>'version','4','resume response-loss replay is idempotent');
select throws_ok($$select app_public.close_photo_tier_servicing(gen_random_uuid(),3,gen_random_uuid())$$,'40001','billing_sales_version_stale','losing close CAS cannot overwrite resumed sales');
savepoint public_stale;
select pg_temp.revise('media','{"decision":"revoked"}');
select is(app_public.billing_get_capability()->>'enabled','false','revoked prerequisite hides paid capability even while servicing continues');
rollback to public_stale;
select throws_ok($$update partner_private.photo_tier_activation_receipts set snapshot='{}'$$,'42501','billing_append_only','prepared receipt cannot be rewritten');
select * from finish();
rollback;
