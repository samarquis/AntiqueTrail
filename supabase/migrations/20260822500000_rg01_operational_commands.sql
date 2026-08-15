-- Package 11 / RG-01 operational surface. This exposes no metric inputs,
-- exclusions, subject linkage, signature material, or geography activation.

grant rg01_automation to postgres;
grant identity_service to postgres;
grant create on schema app_public to rg01_automation;
grant create on schema rg01_private to rg01_automation;

alter table rg01_private.rg01_signing_challenges
  add column idempotency_key uuid unique,
  add column request_digest bytea check(request_digest is null or octet_length(request_digest)=32);

create table rg01_private.rg01_command_receipts(
  command_id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  operation text not null check(operation in ('begin','freeze','consume_decision','purge_linkage')),
  target_id uuid not null,
  input_digest bytea not null check(octet_length(input_digest)=32),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default statement_timestamp(),
  constraint rg01_command_result_content_free check(
    not (result ?| array['subjects','subjectId','userId','tripContents','notes','reviews','supportContent','claimEvidence','defectText','signature'])
  )
);

create table rg01_private.rg01_lifecycle_receipts(
  lifecycle_receipt_id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references rg01_private.rg01_runs(run_id) on delete restrict,
  observed_on date not null,
  outcome text not null check(outcome in ('current','purge_due','purge_overdue')),
  due_at timestamptz,
  outcome_digest bytea not null check(octet_length(outcome_digest)=32),
  observed_at timestamptz not null default statement_timestamp(),
  unique(run_id,observed_on)
);

alter table rg01_private.rg01_command_receipts enable row level security;
alter table rg01_private.rg01_command_receipts force row level security;
alter table rg01_private.rg01_lifecycle_receipts enable row level security;
alter table rg01_private.rg01_lifecycle_receipts force row level security;
revoke all on rg01_private.rg01_command_receipts,rg01_private.rg01_lifecycle_receipts from public,anon,authenticated;
grant select,insert on rg01_private.rg01_command_receipts,rg01_private.rg01_lifecycle_receipts to rg01_automation;
create policy rg01_automation_command_receipts on rg01_private.rg01_command_receipts for all to rg01_automation using(true) with check(true);
create policy rg01_automation_lifecycle_receipts on rg01_private.rg01_lifecycle_receipts for all to rg01_automation using(true) with check(true);
create trigger rg01_command_receipts_immutable before update or delete on rg01_private.rg01_command_receipts for each row execute function rg01_private.deny_mutation();
create trigger rg01_lifecycle_receipts_immutable before update or delete on rg01_private.rg01_lifecycle_receipts for each row execute function rg01_private.deny_mutation();

create function app_public.rg01_get_operational_status(p_run_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r rg01_private.rg01_runs%rowtype; cap rg01_private.rg01_capability%rowtype; metrics jsonb; purge_due timestamptz;
begin
  if app_public.request_user_id() is null or not exists(select 1 from rg01_private.rg01_product_owner_grants g where g.user_id=app_public.request_user_id() and g.state='active') then
    raise exception using errcode='42501',message='rg01_product_owner_required';
  end if;
  select * into cap from rg01_private.rg01_capability where singleton_id=1;
  if p_run_id is null then select * into r from rg01_private.rg01_runs order by created_at desc limit 1;
  else select * into r from rg01_private.rg01_runs where run_id=p_run_id; end if;
  if r.run_id is not null then
    select coalesce(jsonb_object_agg(metric_code,metric_value),'{}'::jsonb) into metrics from rg01_private.rg01_metrics where run_id=r.run_id;
    select min(s.linkage_purge_due_at) into purge_due from rg01_private.rg01_subject_consents s
      where s.linkage_purged_at is null and s.linkage_purge_due_at is not null
        and exists(select 1 from rg01_private.rg01_run_subjects rs where rs.run_id=r.run_id and rs.subject_id=s.subject_id);
  end if;
  return jsonb_build_object(
    'collectionEnabled',cap.collection_enabled and rg01_private.release_is_active(cap.release_id),
    'run',case when r.run_id is null then null else jsonb_build_object(
      'runId',r.run_id,'state',r.state,'windowStart',r.window_start,'windowEnd',r.window_end,
      'sourceCutoff',r.source_cutoff,'currentSource',r.source_head_digest is not null and r.source_head_digest=rg01_private.source_head_digest(),
      'manifestDigest',case when r.manifest_digest is null then null else encode(r.manifest_digest,'hex') end,
      'blockers',coalesce(r.blockers,array[]::text[]),'metrics',coalesce(metrics,'{}'::jsonb),
      'receiptId',r.receipt_id,'supersedesReceiptId',r.supersedes_receipt_id,
      'linkagePurgeDueAt',purge_due,'linkagePurged',exists(select 1 from rg01_private.rg01_purge_receipts p where p.run_id=r.run_id)
    ) end
  );
end $$;
alter function app_public.rg01_get_operational_status(uuid) owner to postgres;
revoke all on function app_public.rg01_get_operational_status(uuid) from public,anon;
grant execute on function app_public.rg01_get_operational_status(uuid) to authenticated;

create function app_public.rg01_execute_calculation(p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[]; key uuid; target uuid; digest bytea; prior rg01_private.rg01_command_receipts%rowtype; result jsonb;
begin
  allowed:=case p_operation when 'begin' then array['runId','idempotencyKey','windowStart','windowEnd','supersedesReceiptId']
    when 'freeze' then array['runId','idempotencyKey'] else array[]::text[] end;
  if p_operation not in ('begin','freeze') or jsonb_typeof(p_payload)<>'object'
    or exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed))
    or not (p_payload ? 'runId' and p_payload ? 'idempotencyKey')
    or exists(select 1 from unnest(array['totals','denominator','exclusions','signature','failedCodes']) forbidden where p_payload ? forbidden) then
    raise exception using errcode='22023',message='rg01_command_shape_invalid';
  end if;
  begin key:=(p_payload->>'idempotencyKey')::uuid; target:=(p_payload->>'runId')::uuid; exception when others then raise exception using errcode='22023',message='rg01_command_shape_invalid'; end;
  digest:=extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'payload',p_payload)::text,'utf8'),'sha256');
  select * into prior from rg01_private.rg01_command_receipts where idempotency_key=key;
  if found then
    if prior.operation<>p_operation or prior.target_id<>target or prior.input_digest<>digest then raise exception using errcode='22023',message='rg01_idempotency_key_reused'; end if;
    return prior.result;
  end if;
  if p_operation='begin' then
    if not (p_payload ? 'windowStart' and p_payload ? 'windowEnd') then raise exception using errcode='22023',message='rg01_command_shape_invalid'; end if;
    perform rg01_private.begin_run(target,(p_payload->>'windowStart')::timestamptz,(p_payload->>'windowEnd')::timestamptz,case when p_payload ? 'supersedesReceiptId' then (p_payload->>'supersedesReceiptId')::uuid else null end);
    result:=jsonb_build_object('runId',target,'state','collecting');
  else
    result:=rg01_private.freeze_run(target);
  end if;
  insert into rg01_private.rg01_command_receipts(idempotency_key,operation,target_id,input_digest,result) values(key,p_operation,target,digest,result);
  return result;
end $$;
alter function app_public.rg01_execute_calculation(text,jsonb) owner to postgres;
revoke all on function app_public.rg01_execute_calculation(text,jsonb) from public,anon,authenticated;
grant execute on function app_public.rg01_execute_calculation(text,jsonb) to rg01_calculation_service;

create or replace function app_public.rg01_request_decision_challenge(p_run_id uuid,p_decision text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r rg01_private.rg01_runs%rowtype; c rg01_private.rg01_signing_challenges%rowtype;
  g readiness_private.evidence_responsibility_grants%rowtype;
  uid uuid:=app_public.request_user_id(); exp timestamptz:=statement_timestamp()+interval '30 minutes';
  n bytea:=extensions.gen_random_bytes(32); request_hash bytea;
begin
  if uid is null or p_decision not in ('pass','reject') or p_idempotency_key is null
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
  then raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  select * into g from readiness_private.evidence_responsibility_grants
    where user_id=uid and responsibility='ProductOwner' and state='active';
  if not found then raise exception using errcode='42501',message='rg01_product_owner_required'; end if;
  request_hash:=extensions.digest(convert_to(concat_ws('|',p_run_id,uid,p_decision),'utf8'),'sha256');
  select * into c from rg01_private.rg01_signing_challenges where idempotency_key=p_idempotency_key;
  if found then
    if c.run_id<>p_run_id or c.signer_user_id<>uid or c.decision<>p_decision or c.request_digest<>request_hash then raise exception using errcode='22023',message='rg01_idempotency_key_reused'; end if;
    return jsonb_build_object('challengeId',c.challenge_id,'payloadDigest',encode(c.payload_digest,'hex'),'expiresAt',c.expires_at,'state',case when c.consumed_at is null then 'pending' else 'consumed' end);
  end if;
  select * into r from rg01_private.rg01_runs where run_id=p_run_id for update;
  if not found or r.state<>'frozen' or r.release_id<>g.release_id
    or r.source_head_digest<>rg01_private.source_head_digest()
    or (p_decision='pass' and cardinality(r.blockers)>0) then
    raise exception using errcode='55000',message='rg01_decision_blocked'; end if;
  update readiness_private.gate_signing_capabilities set state='expired'
    where user_id=uid and gate_kind='rg01' and state='issued' and expires_at<=statement_timestamp();
  update rg01_private.rg01_signing_challenges set consumed_at=statement_timestamp()
    where run_id=p_run_id and signer_user_id=uid and consumed_at is null and expires_at<=statement_timestamp();
  insert into rg01_private.rg01_signing_challenges(run_id,signer_user_id,frozen_digest,decision,failed_codes,nonce,payload_digest,expires_at,idempotency_key,request_digest)
    values(p_run_id,uid,r.manifest_digest,p_decision,r.blockers,n,extensions.digest(convert_to(concat_ws('|',p_run_id,encode(r.manifest_digest,'hex'),uid,p_decision,array_to_string(r.blockers,','),encode(n,'hex'),exp),'utf8'),'sha256'),exp,p_idempotency_key,request_hash) returning * into c;
  insert into readiness_private.gate_signing_capabilities(token_hash,challenge_id,user_id,responsibility,gate_kind,frozen_digest,grant_id,grant_version,expires_at)
    values(extensions.digest(convert_to(c.challenge_id::text||'|'||encode(n,'hex'),'utf8'),'sha256'),c.challenge_id,uid,'ProductOwner','rg01',r.manifest_digest,g.grant_id,g.version,exp);
  return jsonb_build_object('challengeId',c.challenge_id,'payloadDigest',encode(c.payload_digest,'hex'),'expiresAt',c.expires_at,'state','pending');
end $$;
alter function app_public.rg01_request_decision_challenge(uuid,text,uuid) owner to identity_service;
revoke all on function app_public.rg01_request_decision_challenge(uuid,text) from public,anon,authenticated,service_role;
revoke all on function app_public.rg01_request_decision_challenge(uuid,text,uuid) from public,anon;
grant execute on function app_public.rg01_request_decision_challenge(uuid,text,uuid) to authenticated;

create function app_public.rg01_consume_verified_decision(
  p_challenge_id uuid,p_payload_digest bytea,p_signature_digest bytea,p_provider_key_id text,p_provider_verification_id text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare digest bytea; prior rg01_private.rg01_command_receipts%rowtype; rid uuid; result jsonb;
begin
  if p_idempotency_key is null or octet_length(p_payload_digest)<>32 or octet_length(p_signature_digest)<>32 then raise exception using errcode='22023',message='rg01_verified_decision_invalid'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_challenge_id,encode(p_payload_digest,'hex'),encode(p_signature_digest,'hex'),p_provider_key_id,p_provider_verification_id),'utf8'),'sha256');
  select * into prior from rg01_private.rg01_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.operation<>'consume_decision' or prior.target_id<>p_challenge_id or prior.input_digest<>digest then raise exception using errcode='22023',message='rg01_idempotency_key_reused'; end if;
    return prior.result;
  end if;
  rid:=rg01_private.consume_decision_challenge(p_challenge_id,p_payload_digest,p_signature_digest,p_provider_key_id,p_provider_verification_id);
  result:=jsonb_build_object('receiptId',rid,'state','settled');
  insert into rg01_private.rg01_command_receipts(idempotency_key,operation,target_id,input_digest,result) values(p_idempotency_key,'consume_decision',p_challenge_id,digest,result);
  return result;
end $$;
alter function app_public.rg01_consume_verified_decision(uuid,bytea,bytea,text,text,uuid) owner to postgres;
revoke all on function app_public.rg01_consume_verified_decision(uuid,bytea,bytea,text,text,uuid) from public,anon,authenticated;
grant execute on function app_public.rg01_consume_verified_decision(uuid,bytea,bytea,text,text,uuid) to rg01_signature_service;

create function app_public.rg01_complete_verified_purge(
  p_run_id uuid,p_key_version text,p_outcome_digest bytea,p_provider_verification_id text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare digest bytea; prior rg01_private.rg01_command_receipts%rowtype; prid uuid; result jsonb;
begin
  if p_idempotency_key is null or octet_length(p_outcome_digest)<>32 or p_provider_verification_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then raise exception using errcode='22023',message='rg01_verified_purge_invalid'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_run_id,p_key_version,encode(p_outcome_digest,'hex'),p_provider_verification_id),'utf8'),'sha256');
  select * into prior from rg01_private.rg01_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.operation<>'purge_linkage' or prior.target_id<>p_run_id or prior.input_digest<>digest then raise exception using errcode='22023',message='rg01_idempotency_key_reused'; end if;
    return prior.result;
  end if;
  prid:=rg01_private.purge_run_linkage(p_run_id,p_key_version,p_outcome_digest);
  result:=jsonb_build_object('purgeReceiptId',prid,'state','purged','providerVerificationId',p_provider_verification_id);
  insert into rg01_private.rg01_command_receipts(idempotency_key,operation,target_id,input_digest,result) values(p_idempotency_key,'purge_linkage',p_run_id,digest,result);
  return result;
end $$;
alter function app_public.rg01_complete_verified_purge(uuid,text,bytea,text,uuid) owner to postgres;
revoke all on function app_public.rg01_complete_verified_purge(uuid,text,bytea,text,uuid) from public,anon,authenticated;
grant execute on function app_public.rg01_complete_verified_purge(uuid,text,bytea,text,uuid) to rg01_lifecycle_service;

create function app_public.rg01_lifecycle_watchdog(p_now timestamptz default statement_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare due_count bigint; overdue_count bigint;
begin
  insert into rg01_private.rg01_lifecycle_receipts(run_id,observed_on,outcome,due_at,outcome_digest,observed_at)
    select r.run_id,p_now::date,case when d.due_at<p_now then 'purge_overdue' when d.due_at<=p_now+interval '7 days' then 'purge_due' else 'current' end,d.due_at,
      extensions.digest(convert_to(concat_ws('|',r.run_id,d.due_at::text,case when d.due_at<p_now then 'purge_overdue' when d.due_at<=p_now+interval '7 days' then 'purge_due' else 'current' end),'utf8'),'sha256'),p_now
    from rg01_private.rg01_runs r cross join lateral (select min(s.linkage_purge_due_at) due_at from rg01_private.rg01_subject_consents s where s.linkage_purged_at is null and s.linkage_purge_due_at is not null and exists(select 1 from rg01_private.rg01_run_subjects rs where rs.run_id=r.run_id and rs.subject_id=s.subject_id)) d
    where r.state in ('signed','rejected') and d.due_at is not null and not exists(select 1 from rg01_private.rg01_purge_receipts p where p.run_id=r.run_id)
    on conflict(run_id,observed_on) do nothing;
  select count(*) filter(where due_at>=p_now),count(*) filter(where due_at<p_now) into due_count,overdue_count
    from rg01_private.rg01_lifecycle_receipts where observed_on=p_now::date and outcome in ('purge_due','purge_overdue');
  return jsonb_build_object('status',case when overdue_count>0 then 'blocked' when due_count>0 then 'attention' else 'current' end,'due',due_count,'overdue',overdue_count);
end $$;
alter function app_public.rg01_lifecycle_watchdog(timestamptz) owner to postgres;
revoke all on function app_public.rg01_lifecycle_watchdog(timestamptz) from public,anon,authenticated;
grant execute on function app_public.rg01_lifecycle_watchdog(timestamptz) to rg01_lifecycle_service;

revoke create on schema app_public from rg01_automation;
revoke create on schema rg01_private from rg01_automation;
revoke rg01_automation,identity_service from postgres;
