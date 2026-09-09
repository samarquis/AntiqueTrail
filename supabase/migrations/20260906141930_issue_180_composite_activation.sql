-- #180: independent verified evidence, frozen composite, atomic deployment-only sales opening.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='billing_activation_evidence_service') then
    create role billing_activation_evidence_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema partner_private to billing_activation_evidence_service;
grant billing_automation,rg01_automation,release_automation,community_automation to postgres;
grant create on schema rg01_private to rg01_automation;
grant create on schema release_private to release_automation;
grant create on schema community_private to community_automation;
grant create on schema partner_private,app_public to billing_automation;
grant usage on schema community_private,release_private,rg01_private to billing_automation;
grant execute on function rg01_private.receipt_is_current_pass(uuid) to billing_automation;
grant select on community_private.community_activation_runs,community_private.community_expansion_root,release_private.regional_releases,release_private.release_evidence_receipts,release_private.release_capabilities to billing_automation;
create policy billing_activation_runs on community_private.community_activation_runs for select to billing_automation using(true);
create policy billing_activation_root on community_private.community_expansion_root for select to billing_automation using(true);
create policy billing_activation_release on release_private.regional_releases for select to billing_automation using(true);
create policy billing_activation_release_receipts on release_private.release_evidence_receipts for select to billing_automation using(true);
-- Narrow locking helpers keep source mutation privileges with their original owner.
create function release_private.lock_paid_activation_sources() returns void language plpgsql security definer set search_path='' as $$ begin
  lock table release_private.regional_releases,release_private.release_capabilities in share mode;
end $$;
alter function release_private.lock_paid_activation_sources() owner to release_automation;
create function community_private.lock_paid_activation_sources() returns void language plpgsql security definer set search_path='' as $$ begin
  lock table community_private.community_activation_runs,community_private.community_evidence_receipts in share mode;
end $$;
alter function community_private.lock_paid_activation_sources() owner to community_automation;
create function rg01_private.lock_paid_activation_sources() returns void language plpgsql security definer set search_path='' as $$ begin
  lock table rg01_private.rg01_receipts,rg01_private.rg01_receipt_supersessions,rg01_private.rg01_source_facts,rg01_private.rg01_subject_consents,rg01_private.rg01_flyer_consents in share mode;
end $$;
alter function rg01_private.lock_paid_activation_sources() owner to rg01_automation;
revoke all on function release_private.lock_paid_activation_sources(),community_private.lock_paid_activation_sources(),rg01_private.lock_paid_activation_sources() from public,anon,authenticated,service_role;
grant execute on function release_private.lock_paid_activation_sources(),community_private.lock_paid_activation_sources(),rg01_private.lock_paid_activation_sources() to billing_automation;
set role billing_automation;

-- The evidence verifier authenticates the external signer and current deployment.
-- Neither the deployment caller nor any application/provider worker can attest evidence.
-- A new revision supersedes the previous receipt, including a rejection/revocation.
create table partner_private.photo_tier_activation_evidence (
  receipt_id uuid primary key,
  kind text not null check(kind in ('package_10b','rg01','community_1','community_2','community_3','research_authorization','paid_value','monetization_decision','package_13','media','security','provider','hosted_ci','deployment')),
  revision bigint not null check(revision>0),
  decision text not null check(decision in ('pass','fail','revoked')),
  source_id uuid,
  config_version bigint not null references partner_private.photo_tier_commercial_configs(version),
  commercial_digest bytea not null check(octet_length(commercial_digest)=32),
  artifact_digest bytea not null check(octet_length(artifact_digest)=32),
  schema_digest bytea not null check(octet_length(schema_digest)=32),
  deployment_config_digest bytea not null check(octet_length(deployment_config_digest)=32),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  signed_by_roles text[] not null check(cardinality(signed_by_roles)>0),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  signed_at timestamptz not null,
  verified_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  unique(kind,revision),
  check(isfinite(signed_at) and isfinite(verified_at) and isfinite(expires_at) and signed_at<=verified_at and expires_at>verified_at),
  check(kind not in ('package_10b','rg01','community_1','community_2','community_3','research_authorization') or source_id is not null)
);
create table partner_private.photo_tier_activation_receipts (
  receipt_id uuid primary key,
  config_version bigint not null references partner_private.photo_tier_commercial_configs(version),
  evidence_ids uuid[] not null check(cardinality(evidence_ids)=14),
  snapshot jsonb not null,
  snapshot_digest bytea not null check(octet_length(snapshot_digest)=32),
  prepared_at timestamptz not null default statement_timestamp()
);
create table partner_private.photo_tier_activation_commands (
  idempotency_key uuid primary key,
  activation_receipt_id uuid not null unique references partner_private.photo_tier_activation_receipts(receipt_id),
  expected_sales_version bigint not null,
  result jsonb not null
);
alter table partner_private.photo_tier_sales_control add column activation_receipt_id uuid references partner_private.photo_tier_activation_receipts(receipt_id);
alter table partner_private.photo_tier_transition_authorizations drop constraint photo_tier_transition_authorizations_action_check;
alter table partner_private.photo_tier_transition_authorizations add constraint photo_tier_transition_authorizations_action_check check(action in ('pause','close','reopen_obligation','resume'));
alter table partner_private.photo_tier_transition_authorizations add column activation_receipt_id uuid references partner_private.photo_tier_activation_receipts(receipt_id);
alter table partner_private.photo_tier_transition_authorizations add check((action='resume')=(activation_receipt_id is not null));
alter table partner_private.photo_tier_sales_transition_receipts add column activation_receipt_id uuid references partner_private.photo_tier_activation_receipts(receipt_id);

do $$ declare t text; begin
  foreach t in array array['photo_tier_activation_evidence','photo_tier_activation_receipts','photo_tier_activation_commands'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',t);
    execute format('create policy billing_owner on partner_private.%I for all to billing_automation using(true) with check(true)',t);
    execute format('create trigger immutable_receipt before update or delete on partner_private.%I for each row execute function partner_private.reject_append_only_mutation()',t);
  end loop;
end $$;
grant select,insert on partner_private.photo_tier_activation_evidence to billing_activation_evidence_service;
create policy verified_activation_evidence on partner_private.photo_tier_activation_evidence for all to billing_activation_evidence_service using(true) with check(true);

create function partner_private.serialize_activation_evidence() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  perform 1 from partner_private.photo_tier_sales_control where singleton for update;
  if new.revision<>(select coalesce(max(revision),0)+1 from partner_private.photo_tier_activation_evidence where kind=new.kind)
    or new.verified_at>statement_timestamp() then
    raise exception using errcode='40001',message='billing_evidence_revision_stale'; end if;
  return new;
end $$;
create trigger activation_evidence_serial before insert on partner_private.photo_tier_activation_evidence
  for each row execute function partner_private.serialize_activation_evidence();

-- One deterministic snapshot is used by preparation, promotion, resume, and paid reads.
-- Existing source rows remain authoritative; external attestations cannot replace them.
create function partner_private.photo_tier_composite_snapshot(p_config_version bigint,p_evidence_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c partner_private.photo_tier_commercial_configs%rowtype; e partner_private.photo_tier_activation_evidence%rowtype;
  deployment partner_private.photo_tier_activation_evidence%rowtype; run community_private.community_activation_runs%rowtype;
  gate community_private.community_evidence_receipts%rowtype; activation community_private.community_evidence_receipts%rowtype;
  authz partner_private.commercial_research_authorizations%rowtype; challenge partner_private.commercial_research_signature_challenges%rowtype;
  sig partner_private.commercial_research_signature_receipts%rowtype; release release_private.regional_releases%rowtype;
  rr release_private.release_evidence_receipts%rowtype; rg community_private.community_evidence_receipts%rowtype;
  result jsonb; sources jsonb:='{}'; previous_gate uuid; gates uuid[]:='{}'; areas text[]:='{}'; n integer;
begin
  select * into c from partner_private.photo_tier_commercial_configs where version=p_config_version;
  if not found or c.state not in ('approved_inactive','active') or not partner_private.commercial_config_is_complete(c)
    or c.canonical_bytes is distinct from partner_private.commercial_config_canonical_bytes(c)
    or c.digest is distinct from extensions.digest(convert_to(c.canonical_bytes,'utf8'),'sha256') then
    raise exception using errcode='55000',message='billing_composite_config_invalid'; end if;
  if cardinality(p_evidence_ids) is distinct from 14 or (select count(distinct x) from unnest(p_evidence_ids) x)<>14
    or (select count(distinct kind) from partner_private.photo_tier_activation_evidence where receipt_id=any(p_evidence_ids))<>14 then
    raise exception using errcode='55000',message='billing_composite_incomplete'; end if;
  select * into deployment from partner_private.photo_tier_activation_evidence where receipt_id=any(p_evidence_ids) and kind='deployment';
  for e in select * from partner_private.photo_tier_activation_evidence where receipt_id=any(p_evidence_ids) order by kind loop
    if e.decision<>'pass' or e.expires_at<=statement_timestamp() or e.verified_at>statement_timestamp()
      or e.revision<>(select max(revision) from partner_private.photo_tier_activation_evidence where kind=e.kind)
      or e.config_version<>c.version or e.commercial_digest<>c.digest
      or e.artifact_digest<>deployment.artifact_digest or e.schema_digest<>deployment.schema_digest or e.deployment_config_digest<>deployment.deployment_config_digest
      or (e.kind in ('package_10b','rg01','research_authorization','paid_value','monetization_decision') and not ('ProductOwner'=any(e.signed_by_roles))) then
      raise exception using errcode='55000',message='billing_composite_evidence_invalid'; end if;
  end loop;
  select r.* into release from release_private.regional_releases r join partner_private.photo_tier_activation_evidence proof on proof.source_id=r.release_id
    where proof.receipt_id=any(p_evidence_ids) and proof.kind='package_10b';
  select * into rr from release_private.release_evidence_receipts where release_id=release.release_id and step='signed_release_receipt';
  if release.release_id is null or release.state<>'active' or release.signed_release_receipt is null or rr.receipt_id is null
    or not rr.external_verified or rr.artifact_digest<>release.artifact_digest or rr.catalog_digest<>release.catalog_digest
    or rr.prerequisite_receipt_digest<>release.prerequisite_receipt_digest
    or not exists(select 1 from release_private.release_capabilities where release_id=release.release_id
      and public_catalog and public_claims and public_reviews and public_registration and product_promotion) then
    raise exception using errcode='55000',message='billing_composite_release_invalid'; end if;
  sources:=sources||jsonb_build_object('release',to_jsonb(release),'release_receipt',to_jsonb(rr));
  select r.* into rg from community_private.community_evidence_receipts r join partner_private.photo_tier_activation_evidence proof on proof.source_id=r.receipt_id
    where proof.receipt_id=any(p_evidence_ids) and proof.kind='rg01';
  if rg.receipt_id is null or rg.receipt_kind<>'rg01_pass' or rg.responsibility<>'ProductOwner' or rg.decision<>'pass'
    or not rg.external_verified or rg.signed_at>statement_timestamp() or not rg01_private.receipt_is_current_pass(rg.rg01_authoritative_receipt_id) then
    raise exception using errcode='55000',message='billing_composite_community_invalid'; end if;
  sources:=sources||jsonb_build_object('rg01',to_jsonb(rg));
  for n in 1..3 loop
    select r.* into run from community_private.community_activation_runs r join partner_private.photo_tier_activation_evidence proof on proof.source_id=r.run_id
    where proof.receipt_id=any(p_evidence_ids) and proof.kind='community_'||n;
    select * into gate from community_private.community_evidence_receipts where receipt_id=run.gate_receipt_id;
    select * into activation from community_private.community_evidence_receipts where receipt_id=coalesce(run.reactivation_receipt_id,run.activation_receipt_id);
    if run.run_id is null or run.activation_ordinal<>n or run.target_ordinal<>n or run.state not in ('live','withdrawn')
      or run.area_slug=any(areas) or gate.receipt_id is null or activation.receipt_id is null
      or (n=1 and run.rg01_receipt_id is distinct from rg.receipt_id) or (n>1 and run.prior_gate_receipt_id is distinct from previous_gate)
      or gate.receipt_kind<>'community_gate' or gate.responsibility<>'PrimaryInternalTester' or gate.decision<>'pass'
      or not gate.external_verified or not gate.mfa_verified or not gate.recent_authentication or gate.signed_at>statement_timestamp()
      or gate.bound_run_id is distinct from run.run_id or gate.area_slug<>run.area_slug
      or gate.artifact_binding_digest is distinct from run.artifact_binding_digest or gate.store_set_digest is distinct from run.store_set_digest
      or activation.receipt_kind not in ('activation','reactivation') or activation.responsibility<>'ProductOwner' or activation.decision<>'pass'
      or not activation.external_verified or activation.signed_at>gate.signed_at or activation.bound_run_id is distinct from run.run_id
      or activation.area_slug<>run.area_slug or activation.artifact_binding_digest is distinct from run.artifact_binding_digest
      or activation.store_set_digest is distinct from run.store_set_digest
      or (run.rollback_receipt_id is not null and run.reactivation_receipt_id is null) then
      raise exception using errcode='55000',message='billing_composite_community_invalid'; end if;
    previous_gate:=gate.receipt_id; gates:=array_append(gates,gate.receipt_id); areas:=array_append(areas,run.area_slug);
    sources:=sources||jsonb_build_object('community_'||n,jsonb_build_object('run',to_jsonb(run),'gate',to_jsonb(gate),'activation',to_jsonb(activation)));
  end loop;
  select * into authz from partner_private.commercial_research_authorizations where authorization_id=c.research_authorization_id;
  select * into challenge from partner_private.commercial_research_signature_challenges where challenge_id=authz.signature_challenge_id;
  select * into sig from partner_private.commercial_research_signature_receipts where receipt_id=authz.signature_receipt_id;
  if authz.authorization_id is null or authz.state<>'active' or authz.expires_at<=statement_timestamp() or authz.config_version<>c.version
    or authz.signed_at>statement_timestamp() or challenge.challenge_id is null or sig.receipt_id is null
    or challenge.state<>'consumed' or challenge.config_digest<>c.digest or sig.config_digest<>c.digest
    or sig.signed_payload_digest<>challenge.signed_payload_digest or sig.signer_user_id<>authz.signed_by
    or not (challenge.community_gate_receipt_ids @> gates and challenge.community_gate_receipt_ids <@ gates)
    or not exists(select 1 from partner_private.photo_tier_activation_evidence where receipt_id=any(p_evidence_ids)
      and kind='research_authorization' and source_id=authz.authorization_id) then
    raise exception using errcode='55000',message='billing_composite_research_invalid'; end if;
  sources:=sources||jsonb_build_object('research',to_jsonb(authz),'research_challenge',to_jsonb(challenge),'research_signature',to_jsonb(sig));
  select jsonb_agg(to_jsonb(x) order by kind) into result from partner_private.photo_tier_activation_evidence x where receipt_id=any(p_evidence_ids);
  return jsonb_build_object('commercial_config',c.canonical_bytes,'commercial_digest',encode(c.digest,'hex'),'evidence',result,'sources',sources);
end $$;

create function partner_private.lock_photo_tier_composite_sources() returns void
language plpgsql volatile security definer set search_path='' as $$ begin
  -- Rare deployment command: table SHARE locks also fence new prerequisite rows.
  perform release_private.lock_paid_activation_sources();
  perform community_private.lock_paid_activation_sources();
  perform rg01_private.lock_paid_activation_sources();
  lock table partner_private.commercial_research_authorizations,partner_private.commercial_research_signature_challenges in share mode;
end $$;
create function app_public.prepare_photo_tier_activation(p_receipt_id uuid,p_config_version bigint,p_evidence_ids uuid[]) returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare snapshot jsonb; prior partner_private.photo_tier_activation_receipts%rowtype; ids uuid[];
begin
  if p_receipt_id is null then raise exception using errcode='22023',message='billing_activation_invalid'; end if;
  perform 1 from partner_private.photo_tier_sales_control where singleton for update;
  perform 1 from partner_private.photo_tier_commercial_configs where version=p_config_version for update;
  perform partner_private.lock_photo_tier_composite_sources();
  ids:=array(select x from unnest(p_evidence_ids) x order by x);
  snapshot:=partner_private.photo_tier_composite_snapshot(p_config_version,ids);
  select * into prior from partner_private.photo_tier_activation_receipts where receipt_id=p_receipt_id;
  if found then
    if prior.config_version is distinct from p_config_version or prior.evidence_ids is distinct from ids or prior.snapshot is distinct from snapshot then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return prior.receipt_id;
  end if;
  insert into partner_private.photo_tier_activation_receipts values(p_receipt_id,p_config_version,ids,snapshot,extensions.digest(convert_to(snapshot::text,'utf8'),'sha256'),statement_timestamp());
  return p_receipt_id;
end $$;

create function partner_private.assert_photo_tier_activation(p_receipt_id uuid) returns bigint
language plpgsql volatile security definer set search_path='' as $$
declare a partner_private.photo_tier_activation_receipts%rowtype; current_snapshot jsonb;
begin
  select * into a from partner_private.photo_tier_activation_receipts where receipt_id=p_receipt_id for share;
  if not found then raise exception using errcode='55000',message='billing_composite_incomplete'; end if;
  perform partner_private.lock_photo_tier_composite_sources();
  current_snapshot:=partner_private.photo_tier_composite_snapshot(a.config_version,a.evidence_ids);
  if a.snapshot<>current_snapshot or a.snapshot_digest<>extensions.digest(convert_to(current_snapshot::text,'utf8'),'sha256') then
    raise exception using errcode='55000',message='billing_composite_stale'; end if;
  return a.config_version;
end $$;
create function app_public.promote_photo_tier_capability(p_activation_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c partner_private.photo_tier_sales_control%rowtype; prior partner_private.photo_tier_activation_commands%rowtype; v bigint; result jsonb;
begin
  if p_activation_receipt_id is null or p_expected_sales_version is null or p_idempotency_key is null then
    raise exception using errcode='22023',message='billing_activation_invalid'; end if;
  select * into c from partner_private.photo_tier_sales_control where singleton for update;
  select * into prior from partner_private.photo_tier_activation_commands where idempotency_key=p_idempotency_key or activation_receipt_id=p_activation_receipt_id;
  if found then
    if prior.idempotency_key<>p_idempotency_key or prior.activation_receipt_id<>p_activation_receipt_id or prior.expected_sales_version<>p_expected_sales_version then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return prior.result;
  end if;
  if c.version<>p_expected_sales_version then raise exception using errcode='40001',message='billing_sales_version_stale'; end if;
  if c.state<>'off_prelaunch' then raise exception using errcode='55000',message='billing_transition_denied'; end if;
  select config_version into v from partner_private.photo_tier_activation_receipts where receipt_id=p_activation_receipt_id;
  perform 1 from partner_private.photo_tier_commercial_configs where version=v and state='approved_inactive' for update;
  if not found then raise exception using errcode='55000',message='billing_composite_config_invalid'; end if;
  perform partner_private.assert_photo_tier_activation(p_activation_receipt_id);
  update partner_private.photo_tier_commercial_configs set state='active' where version=v;
  update partner_private.photo_tier_sales_control set state='sales_open',commercial_config_version=v,activation_receipt_id=p_activation_receipt_id,
    version=version+1,sales_generation=sales_generation+1,updated_at=statement_timestamp() where singleton;
  result:=jsonb_build_object('state','sales_open','version',c.version+1,'salesGeneration',c.sales_generation+1,'receiptId',p_activation_receipt_id);
  insert into partner_private.photo_tier_activation_commands values(p_idempotency_key,p_activation_receipt_id,p_expected_sales_version,result);
  return result;
end $$;
create or replace function app_public.resume_photo_tier_sales(p_resume_receipt_id uuid,p_activation_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c partner_private.photo_tier_sales_control%rowtype; a partner_private.photo_tier_transition_authorizations%rowtype;
  prior partner_private.photo_tier_sales_transition_receipts%rowtype; v bigint; inventory jsonb;
begin
  if p_resume_receipt_id is null or p_activation_receipt_id is null or p_expected_sales_version is null or p_idempotency_key is null then
    raise exception using errcode='22023',message='billing_activation_invalid'; end if;
  select * into c from partner_private.photo_tier_sales_control where singleton for update;
  perform 1 from partner_private.photo_tier_commercial_configs where version=c.commercial_config_version for update;
  select * into prior from partner_private.photo_tier_sales_transition_receipts where receipt_id=p_resume_receipt_id or idempotency_key=p_idempotency_key;
  if found then
    if prior.receipt_id<>p_resume_receipt_id or prior.idempotency_key<>p_idempotency_key or prior.action<>'resume'
      or prior.activation_receipt_id is distinct from p_activation_receipt_id or prior.expected_sales_version<>p_expected_sales_version then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('state',prior.to_state,'version',prior.sales_version,'salesGeneration',prior.sales_generation,'receiptId',prior.receipt_id);
  end if;
  if c.version<>p_expected_sales_version then raise exception using errcode='40001',message='billing_sales_version_stale'; end if;
  if c.state<>'servicing_only' then raise exception using errcode='55000',message='billing_transition_denied'; end if;
  v:=partner_private.assert_photo_tier_activation(p_activation_receipt_id);
  if v is distinct from c.commercial_config_version or not exists(select 1 from partner_private.photo_tier_commercial_configs where version=v and state='active') then
    raise exception using errcode='55000',message='billing_composite_config_invalid'; end if;
  select * into a from partner_private.photo_tier_transition_authorizations where receipt_id=p_resume_receipt_id for share;
  if not found or a.action<>'resume' or a.expected_sales_version<>c.version or a.activation_receipt_id is distinct from p_activation_receipt_id
    or a.expires_at<=statement_timestamp() or a.created_at>statement_timestamp() then
    raise exception using errcode='42501',message='billing_transition_authorization_denied'; end if;
  if (select count(*) from partner_private.photo_tier_transition_signatures where receipt_id=a.receipt_id
    and responsibility in ('ProductOwner','Operations') and payload_digest=partner_private.billing_transition_payload(a.receipt_id)
    and verified_at between a.created_at and statement_timestamp())<>2 then
    raise exception using errcode='42501',message='billing_transition_signatures_required'; end if;
  perform 1 from partner_private.store_subscriptions order by store_id for update;
  inventory:=jsonb_build_object('open_checkout_ids',(select coalesce(jsonb_agg(session_id order by session_id),'[]') from partner_private.photo_tier_checkout_sessions where state in ('open','expire_pending','refund_pending')),
    'pending_change_ids',(select coalesce(jsonb_agg(change_id order by change_id),'[]') from partner_private.photo_tier_subscription_changes where state in ('pending','scheduled','compensation_pending')),
    'live_subscription_count',(select count(*) from partner_private.store_subscriptions where state in ('active','past_due','grace')));
  insert into partner_private.photo_tier_sales_transition_receipts(receipt_id,action,from_state,to_state,reason,expected_sales_version,commercial_config_version,sales_version,sales_generation,idempotency_key,inventory,signed_by_roles,activation_receipt_id)
    values(a.receipt_id,'resume','servicing_only','sales_open',a.reason,c.version,v,c.version+1,c.sales_generation+1,p_idempotency_key,inventory,array['ProductOwner','Operations'],p_activation_receipt_id);
  update partner_private.photo_tier_sales_control set state='sales_open',version=version+1,sales_generation=sales_generation+1,
    activation_receipt_id=p_activation_receipt_id,last_transition_receipt_id=a.receipt_id,updated_at=statement_timestamp() where singleton;
  return jsonb_build_object('state','sales_open','version',c.version+1,'salesGeneration',c.sales_generation+1,'receiptId',a.receipt_id);
end $$;

-- The historical Boolean no longer grants sales. Servicing remains possible when
-- a prerequisite expires, while every new paid surface/action fails closed.
create or replace function partner_private.photo_tier_billing_enabled() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a partner_private.photo_tier_activation_receipts%rowtype;
begin
  select r.* into a from partner_private.photo_tier_sales_control c join partner_private.photo_tier_activation_receipts r on r.receipt_id=c.activation_receipt_id
    join partner_private.photo_tier_commercial_configs config on config.version=c.commercial_config_version
    where c.singleton and c.state='sales_open' and config.state='active' and r.config_version=config.version;
  if not found then return false; end if;
  return a.snapshot=partner_private.photo_tier_composite_snapshot(a.config_version,a.evidence_ids);
exception when sqlstate '55000' then return false;
end $$;

revoke all on function partner_private.serialize_activation_evidence(),partner_private.photo_tier_composite_snapshot(bigint,uuid[]),partner_private.lock_photo_tier_composite_sources(),partner_private.assert_photo_tier_activation(uuid) from public,anon,authenticated,service_role;
revoke all on function app_public.prepare_photo_tier_activation(uuid,bigint,uuid[]),app_public.promote_photo_tier_capability(uuid,bigint,uuid),app_public.resume_photo_tier_sales(uuid,uuid,bigint,uuid) from public,anon,authenticated,service_role;
grant execute on function app_public.prepare_photo_tier_activation(uuid,bigint,uuid[]),app_public.promote_photo_tier_capability(uuid,bigint,uuid),app_public.resume_photo_tier_sales(uuid,uuid,bigint,uuid) to billing_transition_service;
-- Public payload contains only the approved commercial disclosure, never evidence.
create function app_public.billing_get_sales_offer() returns jsonb
language sql stable security definer set search_path='' as $$
  select c.canonical_bytes::jsonb||jsonb_build_object('state','active','digest',encode(c.digest,'hex'))
  from partner_private.photo_tier_sales_control s join partner_private.photo_tier_commercial_configs c on c.version=s.commercial_config_version
  where s.singleton and partner_private.photo_tier_billing_enabled()
$$;
create function app_public.billing_get_purchase_context() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare store uuid; offer jsonb; tier partner_private.store_photo_tier_state%rowtype;
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton for share;
  offer:=app_public.billing_get_sales_offer();
  if offer is null then return null; end if;
  select (array_agg(store_id))[1] into store from partner_private.store_partner_grants where auth_user_id=app_public.request_user_id() and state='active' having count(*)=1;
  perform partner_private.assert_servicing_actor(store);
  select * into tier from partner_private.store_photo_tier_state where store_id=store;
  if tier.tier is not null and tier.tier<>'free' then return null; end if;
  return jsonb_build_object('storeId',store,'storeVersion',coalesce(tier.version,0),'offer',offer);
end $$;
revoke all on function app_public.billing_get_sales_offer(),app_public.billing_get_purchase_context() from public,anon,authenticated,service_role;
grant execute on function app_public.billing_get_sales_offer() to anon,authenticated;
grant execute on function app_public.billing_get_purchase_context() to authenticated;
-- Stale prerequisites hide upgrade actions but never remove existing servicing.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('app_public.billing_get_servicing_context()'::regprocedure);
  definition:=replace(definition,'''salesOpen'',control.state=''sales_open''','''salesOpen'',control.state=''sales_open'' and partner_private.photo_tier_billing_enabled()');
  execute definition;
end $$;
-- Preserve the signed payload of authorizations prepared before this migration.
create or replace function partner_private.billing_transition_payload(p_receipt_id uuid) returns bytea
language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to((case when a.action='resume' then to_jsonb(a) else to_jsonb(a)-'activation_receipt_id' end)::text,'utf8'),'sha256')
  from partner_private.photo_tier_transition_authorizations a where receipt_id=p_receipt_id
$$;
-- A completion following composite revocation uses the existing cancel/refund or
-- incremental-charge compensation path; it must never grant a new paid tier.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('partner_private.billing_apply_checkout_event(text,timestamptz,text,integer,text,text,timestamptz)'::regprocedure);
  definition:=replace(definition,'checkout.state<>''open'' or control.state<>''sales_open''','checkout.state<>''open'' or control.state<>''sales_open'' or not partner_private.photo_tier_billing_enabled()');
  execute definition;
  definition:=pg_get_functiondef('app_public.billing_prepare_subscription_change(uuid)'::regprocedure);
  definition:=replace(definition,'valid:=valid and control.state=''sales_open''','valid:=valid and control.state=''sales_open'' and partner_private.photo_tier_billing_enabled()');
  execute definition;
end $$;
reset role;
revoke create on schema partner_private,app_public from billing_automation;






-- Legacy entry points cannot claim successful activation/rollback of an inert flag.
create or replace function release_private.promote_photo_tier_capability(p_command_id uuid,p_release_id uuid,p_receipt_ids uuid[])
returns text language plpgsql security definer set search_path='' as $$ begin
  raise exception using errcode='55000',message='billing_composite_activation_required';
end $$;
create or replace function release_private.rollback_photo_tier_capability(p_command_id uuid,p_release_id uuid,p_reason text)
returns text language plpgsql security definer set search_path='' as $$ begin
  raise exception using errcode='55000',message='billing_signed_pause_required';
end $$;

revoke create on schema rg01_private from rg01_automation;
revoke create on schema release_private from release_automation;
revoke create on schema community_private from community_automation;
revoke rg01_automation,release_automation,community_automation from postgres;
