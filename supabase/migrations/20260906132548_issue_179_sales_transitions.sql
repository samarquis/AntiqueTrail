-- #179: signed deployment transitions; no activation or live provider configuration.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='billing_transition_service') then
    create role billing_transition_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='billing_signature_service') then
    create role billing_signature_service nologin noinherit nosuperuser nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='billing_finality_service') then
    create role billing_finality_service nologin noinherit nosuperuser nobypassrls;
  end if;
end $$;
grant usage on schema app_public,partner_private to billing_transition_service,billing_signature_service,billing_finality_service;
grant billing_automation to postgres;
grant create on schema partner_private,app_public to billing_automation;
set role billing_automation;

create table partner_private.photo_tier_transition_authorizations (
  receipt_id uuid primary key,
  action text not null check(action in ('pause','close','reopen_obligation')),
  expected_sales_version bigint not null check(expected_sales_version>0),
  reason text not null check(reason ~ '^[a-z][a-z0-9_]{2,63}$'),
  finality_id uuid,
  event_id text,
  falsified_receipt_id uuid,
  product_owner_notified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check(expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  check((action='close')=(finality_id is not null)),
  check((action='reopen_obligation')=(event_id is not null and falsified_receipt_id is not null)),
  check(action<>'pause' or product_owner_notified_at is not null)
);
create table partner_private.photo_tier_transition_signatures (
  receipt_id uuid not null references partner_private.photo_tier_transition_authorizations(receipt_id),
  responsibility text not null check(responsibility in ('Operations','Security','ProductOwner')),
  signer_id uuid not null,
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  provider_verification_id text not null unique check(provider_verification_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  verified_at timestamptz not null default statement_timestamp(),
  primary key(receipt_id,responsibility), unique(receipt_id,signer_id)
);
-- Only the isolated signature verifier attests signer identity, responsibility and
-- provider verification. Deployment and billing workers cannot manufacture signatures.
create table partner_private.photo_tier_provider_finality (
  finality_id uuid primary key,
  expected_sales_version bigint not null,
  inventory_digest bytea not null check(octet_length(inventory_digest)=32),
  observed_at timestamptz not null,
  evidence jsonb not null check(jsonb_typeof(evidence)='object'),
  created_at timestamptz not null default statement_timestamp()
);
create table partner_private.photo_tier_webhook_journal (
  event_id text primary key check(event_id ~ '^evt_[A-Za-z0-9]{8,120}$'),
  event_kind text not null check(event_kind ~ '^[a-z][a-z0-9_.]{2,99}$'),
  payload_digest bytea not null check(octet_length(payload_digest)=32),
  captured_at timestamptz not null default statement_timestamp(),
  captured_sales_version bigint not null,
  quarantine boolean not null,
  resolved_at timestamptz,
  resolution_digest bytea check(resolution_digest is null or octet_length(resolution_digest)=32),
  check((resolved_at is null)=(resolution_digest is null))
);
create function partner_private.billing_journal_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='billing_append_only'; end if;
  if (to_jsonb(new)-array['resolved_at','resolution_digest'])<>(to_jsonb(old)-array['resolved_at','resolution_digest'])
    or (old.resolved_at is not null and new is distinct from old) then
    raise exception using errcode='42501',message='billing_append_only'; end if;
  return new;
end $$;
create trigger journal_identity_immutable before update or delete on partner_private.photo_tier_webhook_journal
  for each row execute function partner_private.billing_journal_immutable();
revoke all on function partner_private.billing_journal_immutable() from public,anon,authenticated,service_role;
-- Every authorized provider invocation has its own durable closure fence.
create table partner_private.photo_tier_provider_work (
  attempt_id uuid primary key,
  sales_version bigint not null,
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  reconciliation_evidence jsonb
);
create function partner_private.billing_work_immutable() returns trigger
language plpgsql set search_path='' as $$ begin
  if tg_op='DELETE' then raise exception using errcode='42501',message='billing_append_only'; end if;
  if new.attempt_id<>old.attempt_id or new.sales_version<>old.sales_version or new.started_at<>old.started_at
    or (old.completed_at is not null and new is distinct from old) then
    raise exception using errcode='42501',message='billing_append_only'; end if;
  return new;
end $$;
create trigger provider_work_immutable before update or delete on partner_private.photo_tier_provider_work
  for each row execute function partner_private.billing_work_immutable();
revoke all on function partner_private.billing_work_immutable() from public,anon,authenticated,service_role;
create table partner_private.photo_tier_sales_transition_receipts (
  receipt_id uuid primary key references partner_private.photo_tier_transition_authorizations(receipt_id),
  action text not null,
  from_state text not null,
  to_state text not null,
  reason text not null,
  expected_sales_version bigint not null,
  commercial_config_version bigint not null,
  sales_version bigint not null,
  sales_generation bigint not null,
  idempotency_key uuid not null unique,
  inventory jsonb not null,
  open_checkout_count bigint generated always as (jsonb_array_length(inventory->'open_checkout_ids')) stored,
  pending_paid_change_count bigint generated always as (jsonb_array_length(inventory->'pending_change_ids')) stored,
  live_subscription_count bigint generated always as ((inventory->>'live_subscription_count')::bigint) stored,
  checkout_digest text generated always as (inventory->'photo_tier_checkout_sessions'->>'digest') stored,
  mirror_digest text generated always as (inventory->'store_subscriptions'->>'digest') stored,
  finality_id uuid references partner_private.photo_tier_provider_finality(finality_id),
  signed_by_roles text[] not null,
  created_at timestamptz not null default statement_timestamp()
);
alter table partner_private.photo_tier_sales_control add column last_transition_receipt_id uuid
  references partner_private.photo_tier_sales_transition_receipts(receipt_id);
alter table partner_private.photo_tier_transition_authorizations add foreign key(finality_id)
  references partner_private.photo_tier_provider_finality(finality_id);
alter table partner_private.photo_tier_transition_authorizations add foreign key(event_id)
  references partner_private.photo_tier_webhook_journal(event_id);
alter table partner_private.photo_tier_transition_authorizations add foreign key(falsified_receipt_id)
  references partner_private.photo_tier_sales_transition_receipts(receipt_id);

do $$ declare t text; begin
  foreach t in array array['photo_tier_transition_authorizations','photo_tier_transition_signatures','photo_tier_provider_finality','photo_tier_webhook_journal','photo_tier_sales_transition_receipts','photo_tier_provider_work'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated,service_role',t);
    execute format('create policy billing_owner on partner_private.%I for all to billing_automation using(true) with check(true)',t);
    if t not in ('photo_tier_webhook_journal','photo_tier_provider_work') then
      execute format('create trigger immutable_receipt before update or delete on partner_private.%I for each row execute function partner_private.reject_append_only_mutation()',t);
    end if;
  end loop;
end $$;
grant select on partner_private.photo_tier_provider_work to billing_finality_service;
create policy finality_work_inventory on partner_private.photo_tier_provider_work for select to billing_finality_service using(true);
grant select,insert on partner_private.photo_tier_transition_authorizations to billing_transition_service;
create policy transition_authorizations on partner_private.photo_tier_transition_authorizations for all to billing_transition_service using(true) with check(true);
grant select on partner_private.photo_tier_transition_authorizations to billing_signature_service;
create policy signature_authorizations on partner_private.photo_tier_transition_authorizations for select to billing_signature_service using(true);
grant insert,select on partner_private.photo_tier_transition_signatures to billing_signature_service;
create policy verified_signatures on partner_private.photo_tier_transition_signatures for all to billing_signature_service using(true) with check(true);
grant insert,select on partner_private.photo_tier_provider_finality to billing_finality_service;
create policy verified_finality on partner_private.photo_tier_provider_finality for all to billing_finality_service using(true) with check(true);

create function partner_private.billing_transition_payload(p_receipt_id uuid) returns bytea
language sql stable security definer set search_path='' as $$
  select extensions.digest(convert_to(to_jsonb(a)::text,'utf8'),'sha256')
  from partner_private.photo_tier_transition_authorizations a where receipt_id=p_receipt_id
$$;

-- Called only with the singleton lock held. Deterministic row order follows the
-- purchase/paid-change paths: control, config, Checkout, consent, subscription, change.
create function partner_private.billing_transition_inventory() returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb:='{}'; t text; rows jsonb;
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton for update;
  perform 1 from partner_private.photo_tier_commercial_configs order by version for update;
  perform 1 from partner_private.photo_tier_checkout_sessions order by session_id for update;
  perform 1 from partner_private.photo_tier_change_consents order by consent_id for share;
  perform 1 from partner_private.store_subscriptions order by store_id for update;
  perform 1 from partner_private.photo_tier_subscription_changes order by change_id for update;
  perform 1 from partner_private.photo_tier_charge_refunds order by refund_request_id for update;
  perform 1 from partner_private.photo_tier_refund_reconciliations order by reconciliation_id for update;
  perform 1 from partner_private.store_webhook_events order by event_id for share;
  perform 1 from partner_private.photo_tier_webhook_journal order by event_id for update;
  perform 1 from partner_private.store_billing_outbox order by outbox_id for update;
  perform 1 from partner_private.photo_tier_provider_work order by attempt_id for update;
  foreach t in array array['photo_tier_checkout_sessions','store_subscriptions','photo_tier_subscription_changes','photo_tier_charge_refunds','photo_tier_refund_reconciliations','store_webhook_events','photo_tier_webhook_journal','store_billing_outbox','photo_tier_provider_work'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from partner_private.%I r',t) into rows;
    result:=result||jsonb_build_object(t,jsonb_build_object('count',jsonb_array_length(rows),'digest',encode(extensions.digest(convert_to(rows::text,'utf8'),'sha256'),'hex')));
  end loop;
  return result||jsonb_build_object(
    'open_checkout_ids',(select coalesce(jsonb_agg(session_id order by session_id),'[]') from partner_private.photo_tier_checkout_sessions where state in ('open','expire_pending','refund_pending')),
    'pending_change_ids',(select coalesce(jsonb_agg(change_id order by change_id),'[]') from partner_private.photo_tier_subscription_changes where state in ('pending','scheduled','compensation_pending')),
    'live_subscription_count',(select count(*) from partner_private.store_subscriptions where state in ('active','past_due','grace')));
end $$;

create function app_public.billing_get_transition_inventory() returns jsonb
language sql volatile security definer set search_path='' as $$
  select partner_private.billing_transition_inventory()
$$;

create function partner_private.billing_assert_finality(p_finality_id uuid,p_version bigint,p_inventory jsonb) returns void
language plpgsql stable security definer set search_path='' as $$
declare f partner_private.photo_tier_provider_finality%rowtype; k text; horizon timestamptz;
begin
  select * into f from partner_private.photo_tier_provider_finality where finality_id=p_finality_id;
  if not found or f.expected_sales_version<>p_version
    or f.inventory_digest<>extensions.digest(convert_to(p_inventory::text,'utf8'),'sha256')
    or not isfinite(f.observed_at) or f.observed_at>statement_timestamp() or f.observed_at<statement_timestamp()-interval '1 minute'
    or f.evidence->>'history_complete' is distinct from 'true'
    or f.evidence->>'balance_settled' is distinct from 'true'
    or coalesce(f.evidence->>'provider_account_digest','') !~ '^[0-9a-f]{64}$'
    or coalesce(f.evidence->>'finality_digest','') !~ '^[0-9a-f]{64}$'
    or coalesce(f.evidence->>'horizon_policy_version','') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or f.evidence->>'historical_charge_digest' is distinct from p_inventory->'photo_tier_charge_refunds'->>'digest'
    or f.evidence->>'historical_charge_count' is distinct from p_inventory->'photo_tier_charge_refunds'->>'count'
  then raise exception using errcode='55000',message='billing_finality_unproved'; end if;
  foreach k in array array['open_checkout','live_subscription','refund','dispute','invoice','payment','webhook','outbox','reconciliation','unknown'] loop
    if f.evidence->'obligations'->>k is distinct from '0' then raise exception using errcode='55000',message='billing_finality_unproved'; end if;
  end loop;
  foreach k in array array['dispute','reversal','adjustment','settlement'] loop
    horizon:=(f.evidence->'horizon_ends_at'->>k)::timestamptz;
    if horizon is null or not isfinite(horizon) or horizon>f.observed_at then
      raise exception using errcode='55000',message='billing_finality_unproved'; end if;
  end loop;
  if exists(select 1 from partner_private.photo_tier_checkout_sessions where state in ('open','expire_pending','refund_pending'))
    or exists(select 1 from partner_private.store_subscriptions where state not in ('none','canceled'))
    or exists(select 1 from partner_private.photo_tier_subscription_changes where state in ('pending','scheduled','compensation_pending'))
    or exists(select 1 from partner_private.photo_tier_charge_refunds where state in ('pending','failed') or charged_at+interval '48 hours'>f.observed_at)
    or exists(select 1 from partner_private.photo_tier_refund_reconciliations where state<>'provider_confirmed')
    or exists(select 1 from partner_private.photo_tier_webhook_journal where resolved_at is null)
    or exists(select 1 from partner_private.store_billing_outbox where state<>'consumed')
    or exists(select 1 from partner_private.photo_tier_provider_work where completed_at is null)
  then raise exception using errcode='55000',message='billing_obligations_open'; end if;
end $$;

create function partner_private.billing_transition(p_action text,p_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare c partner_private.photo_tier_sales_control%rowtype; a partner_private.photo_tier_transition_authorizations%rowtype;
  prior partner_private.photo_tier_sales_transition_receipts%rowtype; inventory jsonb; required_roles text[]; next_state text;
begin
  if p_receipt_id is null or p_idempotency_key is null or p_expected_sales_version is null then
    raise exception using errcode='22023',message='billing_transition_invalid'; end if;
  select * into c from partner_private.photo_tier_sales_control where singleton for update;
  select * into prior from partner_private.photo_tier_sales_transition_receipts where idempotency_key=p_idempotency_key or receipt_id=p_receipt_id;
  if found then
    if prior.receipt_id<>p_receipt_id or prior.idempotency_key<>p_idempotency_key or prior.action<>p_action or prior.expected_sales_version<>p_expected_sales_version then
      raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return jsonb_build_object('state',prior.to_state,'version',prior.sales_version,'salesGeneration',prior.sales_generation,'receiptId',prior.receipt_id);
  end if;
  if c.version<>p_expected_sales_version then raise exception using errcode='40001',message='billing_sales_version_stale'; end if;
  if (p_action='pause' and c.state<>'sales_open') or (p_action='close' and c.state<>'servicing_only')
    or (p_action='reopen_obligation' and c.state<>'off_prelaunch') or p_action not in ('pause','close','reopen_obligation') then
    raise exception using errcode='55000',message='billing_transition_denied'; end if;
  -- The inventory locks precede the immutable authorization/transition receipt.
  inventory:=partner_private.billing_transition_inventory();
  select * into a from partner_private.photo_tier_transition_authorizations where receipt_id=p_receipt_id for share;
  if not found or a.action<>p_action or a.expected_sales_version<>c.version or a.expires_at<=statement_timestamp()
    or a.created_at>statement_timestamp() or (p_action='pause' and a.product_owner_notified_at>statement_timestamp()) then
    raise exception using errcode='42501',message='billing_transition_authorization_denied'; end if;
  required_roles:=case when p_action='close' then array['ProductOwner','Operations'] else array['Operations','Security'] end;
  if (select count(*) from partner_private.photo_tier_transition_signatures s where s.receipt_id=a.receipt_id
      and s.responsibility=any(required_roles) and s.payload_digest=partner_private.billing_transition_payload(a.receipt_id)
      and s.verified_at between a.created_at and statement_timestamp())<>2 then
    raise exception using errcode='42501',message='billing_transition_signatures_required'; end if;
  if p_action='close' then
    perform partner_private.billing_assert_finality(a.finality_id,c.version,inventory);
  elsif p_action='reopen_obligation' then
    if a.falsified_receipt_id is distinct from c.last_transition_receipt_id
      or not exists(select 1 from partner_private.photo_tier_sales_transition_receipts where receipt_id=a.falsified_receipt_id and action='close')
      or not exists(select 1 from partner_private.photo_tier_webhook_journal where event_id=a.event_id and quarantine and resolved_at is null and captured_sales_version=c.version) then
      raise exception using errcode='42501',message='billing_reopen_obligation_denied'; end if;
  end if;
  next_state:=case when p_action='close' then 'off_prelaunch' else 'servicing_only' end;
  insert into partner_private.photo_tier_sales_transition_receipts(receipt_id,action,from_state,to_state,reason,expected_sales_version,commercial_config_version,sales_version,sales_generation,idempotency_key,inventory,finality_id,signed_by_roles)
  values(a.receipt_id,p_action,c.state,next_state,a.reason,c.version,coalesce(c.commercial_config_version,(select commercial_config_version from partner_private.photo_tier_sales_transition_receipts where receipt_id=a.falsified_receipt_id)),c.version+1,c.sales_generation+case when p_action='pause' then 1 else 0 end,p_idempotency_key,inventory,a.finality_id,required_roles);
  if p_action='pause' then
    update partner_private.photo_tier_checkout_sessions set state='expire_pending',version=version+1,updated_at=statement_timestamp() where state='open';
  end if;
  update partner_private.photo_tier_sales_control set state=next_state,version=version+1,
    sales_generation=sales_generation+case when p_action='pause' then 1 else 0 end,
    commercial_config_version=case when p_action='close' then null when p_action='reopen_obligation' then
      (select commercial_config_version from partner_private.photo_tier_sales_transition_receipts where receipt_id=a.falsified_receipt_id) else commercial_config_version end,
    last_transition_receipt_id=a.receipt_id,updated_at=statement_timestamp() where singleton;
  return jsonb_build_object('state',next_state,'version',c.version+1,'salesGeneration',c.sales_generation+case when p_action='pause' then 1 else 0 end,'receiptId',a.receipt_id);
end $$;

create function app_public.pause_photo_tier_sales(p_pause_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select partner_private.billing_transition('pause',p_pause_receipt_id,p_expected_sales_version,p_idempotency_key) $$;
create function app_public.close_photo_tier_servicing(p_closure_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select partner_private.billing_transition('close',p_closure_receipt_id,p_expected_sales_version,p_idempotency_key) $$;
create function app_public.reopen_photo_tier_servicing_for_obligation(p_reopen_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language sql volatile security definer set search_path='' as $$ select partner_private.billing_transition('reopen_obligation',p_reopen_receipt_id,p_expected_sales_version,p_idempotency_key) $$;
create function app_public.resume_photo_tier_sales(p_resume_receipt_id uuid,p_activation_receipt_id uuid,p_expected_sales_version bigint,p_idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$ begin raise exception using errcode='55000',message='billing_resume_not_implemented'; end $$;

create function app_public.billing_capture_verified_event(p_event_id text,p_event_kind text,p_payload_digest text) returns text
language plpgsql volatile security definer set search_path='' as $$
declare c partner_private.photo_tier_sales_control%rowtype; e partner_private.photo_tier_webhook_journal%rowtype;
begin
  select * into c from partner_private.photo_tier_sales_control where singleton for update;
  if p_payload_digest is null or p_payload_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='billing_event_invalid'; end if;
  insert into partner_private.photo_tier_webhook_journal(event_id,event_kind,payload_digest,captured_sales_version,quarantine)
    values(p_event_id,p_event_kind,decode(p_payload_digest,'hex'),c.version,c.state='off_prelaunch') on conflict(event_id) do nothing;
  select * into e from partner_private.photo_tier_webhook_journal where event_id=p_event_id;
  if e.event_kind is distinct from p_event_kind or e.payload_digest<>decode(p_payload_digest,'hex') then
    raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
  if c.state='off_prelaunch' then return 'quarantined'; end if;
  if e.resolved_at is not null then return 'resolved'; end if;
  return c.state;
end $$;
create function app_public.billing_resolve_verified_event(p_event_id text,p_payload_digest text,p_resolution_digest text) returns text
language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  if p_resolution_digest is null or p_resolution_digest !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='billing_event_invalid'; end if;
  update partner_private.photo_tier_webhook_journal set resolved_at=coalesce(resolved_at,statement_timestamp()),
    resolution_digest=coalesce(resolution_digest,decode(p_resolution_digest,'hex'))
    where event_id=p_event_id and payload_digest=decode(p_payload_digest,'hex');
  if not found then raise exception using errcode='42501',message='billing_event_unbound'; end if;
  return 'resolved';
end $$;

create function app_public.billing_begin_provider_work(p_attempt_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare v bigint; begin
  select version into v from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  insert into partner_private.photo_tier_provider_work(attempt_id,sales_version) values(p_attempt_id,v);
  return true;
end $$;
create function app_public.billing_finish_provider_work(p_attempt_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$ begin
  perform 1 from partner_private.photo_tier_sales_control where singleton for update;
  update partner_private.photo_tier_provider_work set completed_at=coalesce(completed_at,statement_timestamp()) where attempt_id=p_attempt_id;
  if not found then raise exception using errcode='42501',message='billing_work_unbound'; end if;
  return true;
end $$;
create function app_public.billing_reconcile_provider_work(p_attempt_id uuid,p_evidence jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare w partner_private.photo_tier_provider_work%rowtype; observed timestamptz; begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
  select * into w from partner_private.photo_tier_provider_work where attempt_id=p_attempt_id for update;
  if not found then raise exception using errcode='42501',message='billing_work_unbound'; end if;
  if w.completed_at is not null then
    if w.reconciliation_evidence is distinct from p_evidence then raise exception using errcode='22023',message='billing_idempotency_mismatch'; end if;
    return true;
  end if;
  observed:=(p_evidence->>'observed_at')::timestamptz;
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence-array['invocation_terminated','provider_reconciled','attempt_id','evidence_digest','observed_at']<>'{}'::jsonb
    or p_evidence->>'invocation_terminated' is distinct from 'true'
    or p_evidence->>'provider_reconciled' is distinct from 'true'
    or p_evidence->>'attempt_id' is distinct from p_attempt_id::text
    or coalesce(p_evidence->>'evidence_digest','') !~ '^[0-9a-f]{64}$'
    or observed is null or not isfinite(observed) or observed<w.started_at or observed>statement_timestamp()
    or observed<statement_timestamp()-interval '1 minute' then
    raise exception using errcode='55000',message='billing_work_unresolved'; end if;
  update partner_private.photo_tier_provider_work set completed_at=statement_timestamp(),reconciliation_evidence=p_evidence where attempt_id=p_attempt_id;
  return true;
end $$;
revoke all on function app_public.billing_begin_provider_work(uuid),app_public.billing_finish_provider_work(uuid),app_public.billing_reconcile_provider_work(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_public.billing_begin_provider_work(uuid),app_public.billing_finish_provider_work(uuid) to billing_mirror_service;
grant execute on function app_public.billing_reconcile_provider_work(uuid,jsonb) to billing_finality_service;

-- Fence legacy worker RPCs at entry, before they take any row locks. Preserve
-- their existing validation and idempotency logic verbatim.
create function partner_private.billing_require_servicing() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
  perform 1 from partner_private.photo_tier_sales_control where singleton and state<>'off_prelaunch' for update;
  if not found then raise exception using errcode='55000',message='billing_stage_disabled'; end if;
end $$;
do $fence$ declare signature text; definition text; begin
  foreach signature in array array[
    'partner_private.billing_record_checkout_payment_failure(text,text,integer)',
    'partner_private.billing_bind_checkout_provider(uuid,text,integer,text)',
    'partner_private.billing_record_checkout_refund_state(text,text,integer,text,text,text,integer)',
    'app_public.billing_record_checkout_expired(text,integer)',
    'app_public.billing_reserve_refund_attempt(text,integer)',
    'app_public.billing_record_checkout_create_rejected(uuid)',
    'app_public.billing_due_checkout_expiry()'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    definition:=regexp_replace(definition,'(?i)begin',E'begin\n  perform partner_private.billing_require_servicing();');
    execute definition;
  end loop;
end $fence$;
-- Paused reservations which never reached a provider request expire locally too.
do $expiry$ declare definition text; begin
  definition:=pg_get_functiondef('app_public.billing_due_checkout_expiry()'::regprocedure);
  definition:=replace(definition,'where state=''open'' and provider_request is null and expires_at<=statement_timestamp()',
    'where state in (''open'',''expire_pending'') and provider_request is null and (state=''expire_pending'' or expires_at<=statement_timestamp())');
  execute definition;
end $expiry$;

revoke all on function partner_private.billing_transition_payload(uuid),partner_private.billing_transition_inventory(),partner_private.billing_assert_finality(uuid,bigint,jsonb),partner_private.billing_transition(text,uuid,bigint,uuid),partner_private.billing_require_servicing() from public,anon,authenticated,service_role;
revoke all on function app_public.billing_get_transition_inventory(),app_public.pause_photo_tier_sales(uuid,bigint,uuid),app_public.close_photo_tier_servicing(uuid,bigint,uuid),app_public.reopen_photo_tier_servicing_for_obligation(uuid,bigint,uuid),app_public.resume_photo_tier_sales(uuid,uuid,bigint,uuid),app_public.billing_capture_verified_event(text,text,text),app_public.billing_resolve_verified_event(text,text,text) from public,anon,authenticated,service_role;
grant execute on function app_public.billing_get_transition_inventory() to billing_finality_service,billing_transition_service;
grant execute on function partner_private.billing_transition_payload(uuid) to billing_signature_service;
grant execute on function app_public.pause_photo_tier_sales(uuid,bigint,uuid),app_public.close_photo_tier_servicing(uuid,bigint,uuid),app_public.reopen_photo_tier_servicing_for_obligation(uuid,bigint,uuid),app_public.resume_photo_tier_sales(uuid,uuid,bigint,uuid) to billing_transition_service;
grant execute on function app_public.billing_capture_verified_event(text,text,text),app_public.billing_resolve_verified_event(text,text,text) to billing_mirror_service;
reset role;
revoke create on schema partner_private,app_public from billing_automation;
