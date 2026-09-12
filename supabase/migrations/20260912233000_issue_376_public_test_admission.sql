-- #376: one operator-owned test scope; no activation or human fixture accounts.
create schema public_test_private;
revoke all on schema public_test_private from public,anon,authenticated,service_role;

create table public_test_private.runtime (
 id smallint primary key check(id=1),
 backend_ref text not null check(backend_ref='uaupykgpegbseboklubv'),
 exact_origin text not null check(exact_origin='https://antique-trail.vercel.app'),
 first_started_at timestamptz,
 active_binding_id uuid,
 version bigint not null default 1 check(version>0)
);
insert into public_test_private.runtime(id,backend_ref,exact_origin)
 values(1,'uaupykgpegbseboklubv','https://antique-trail.vercel.app');
create table public_test_private.bindings (
 binding_id uuid primary key default extensions.gen_random_uuid(),
 source_sha text not null check(source_sha~'^[0-9a-f]{40}$'),
 artifact_digest text not null check(artifact_digest~'^[0-9a-f]{64}$'),
 configuration_digest text not null check(configuration_digest~'^[0-9a-f]{64}$'),
 schema_digest text not null check(schema_digest~'^[0-9a-f]{64}$'),
 evidence_digest text not null check(evidence_digest~'^[0-9a-f]{64}$'),
 decision_ref text not null check(length(decision_ref) between 1 and 500),
 review_ref text not null check(review_ref~'^https://github.com/samarquis/AntiqueTrail/pull/[0-9]+$'),
 operator_ref text not null check(length(operator_ref) between 1 and 100),
 stop_owner text not null check(length(stop_owner) between 1 and 100),
 capabilities text[] not null check(array['catalog','registration','saved']::text[] @> capabilities),
 store_ids uuid[] not null check(cardinality(store_ids) between 1 and 12),
 prepared_at timestamptz not null default statement_timestamp(),
 starts_at timestamptz not null,
 expires_at timestamptz not null,
 activated_at timestamptz,
 revoked_at timestamptz,
 state text not null default 'prepared' check(state in ('prepared','active','revoked')),
 expected_runtime_version bigint not null,
 request_id uuid not null unique,
 spec_digest bytea not null,
 check(expires_at>starts_at and expires_at<=starts_at+interval '30 days')
);
alter table public_test_private.runtime add foreign key(active_binding_id) references public_test_private.bindings(binding_id);
create table public_test_private.testers (
 binding_id uuid not null references public_test_private.bindings(binding_id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 320 and email!~'[[:cntrl:]]'),
 email_hmac bytea not null check(octet_length(email_hmac)=32),
 auth_user_id uuid references auth.users(id),
 admission_id uuid references app_private.account_admission_receipts(admission_id),
 admitted_at timestamptz,
 primary key(binding_id,email_hmac),
 unique(binding_id,email),
 unique(binding_id,auth_user_id)
);

alter table public_test_private.runtime enable row level security;
alter table public_test_private.runtime force row level security;
alter table public_test_private.bindings enable row level security;
alter table public_test_private.bindings force row level security;
alter table public_test_private.testers enable row level security;
alter table public_test_private.testers force row level security;
create policy operator_runtime on public_test_private.runtime to postgres using(true) with check(true);
create policy operator_binding on public_test_private.bindings to postgres using(true) with check(true);
create policy operator_testers on public_test_private.testers to postgres using(true) with check(true);
revoke all on all tables in schema public_test_private from public,anon,authenticated,service_role;

create function public_test_private.prepare(p_spec jsonb,p_request_id uuid,p_expected_version bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_runtime public_test_private.runtime%rowtype; v_existing public_test_private.bindings%rowtype;
 v_id uuid; v_digest bytea; v_stores uuid[]; v_caps text[]; v_testers jsonb;
begin
 select * into v_runtime from public_test_private.runtime where id=1 for update;
 if p_spec is null or jsonb_typeof(p_spec)<>'object' or p_request_id is null
   or p_spec->>'backendRef' is distinct from v_runtime.backend_ref
   or p_spec->>'origin' is distinct from v_runtime.exact_origin
   or p_spec-array['backendRef','origin','sourceSha','artifactDigest','configurationDigest','schemaDigest','evidenceDigest',
     'decisionRef','reviewRef','operatorRef','stopOwner','capabilities','storeIds','startsAt','expiresAt','testers']<>'{}'::jsonb then
  raise exception 'public_test_target_invalid' using errcode='42501';
 end if;
 v_digest:=extensions.digest(convert_to(p_spec::text,'UTF8'),'sha256');
 select * into v_existing from public_test_private.bindings where request_id=p_request_id;
 if found then
  if v_existing.spec_digest<>v_digest or v_existing.expected_runtime_version<>p_expected_version then
   raise exception 'public_test_replay_mismatch' using errcode='42501';
  end if;
  return v_existing.binding_id;
 end if;
 if v_runtime.version is distinct from p_expected_version then raise exception 'public_test_stale_version' using errcode='42501';end if;
 select array_agg(value::uuid order by value) into v_stores from jsonb_array_elements_text(p_spec->'storeIds');
 select array_agg(value order by value) into v_caps from jsonb_array_elements_text(p_spec->'capabilities');
 v_testers:=p_spec->'testers';
 if v_stores is null or cardinality(v_stores) not between 1 and 12
   or (select count(distinct value) from unnest(v_stores) value)<>cardinality(v_stores)
   or exists(select 1 from unnest(v_stores) value where not exists(select 1 from app_public.stores s where s.id=value and s.synthetic and s.audience='synthetic' and s.publication_state='active'))
   or v_caps is null or cardinality(v_caps)=0 or not array['catalog','registration','saved']::text[] @> v_caps
   or (select count(distinct value) from unnest(v_caps) value)<>cardinality(v_caps)
   or jsonb_typeof(v_testers) is distinct from 'array' or jsonb_array_length(v_testers)>2
   or exists(select 1 from jsonb_array_elements(v_testers) item
    where jsonb_typeof(item)<>'object' or item-array['email','emailHmac']<>'{}'::jsonb)
   or ('registration'=any(v_caps) and jsonb_array_length(v_testers)=0)
 then raise exception 'public_test_scope_invalid' using errcode='42501';end if;
 insert into public_test_private.bindings(source_sha,artifact_digest,configuration_digest,schema_digest,evidence_digest,
  decision_ref,review_ref,operator_ref,stop_owner,capabilities,store_ids,starts_at,expires_at,expected_runtime_version,request_id,spec_digest)
 values(p_spec->>'sourceSha',p_spec->>'artifactDigest',p_spec->>'configurationDigest',p_spec->>'schemaDigest',p_spec->>'evidenceDigest',
  p_spec->>'decisionRef',p_spec->>'reviewRef',p_spec->>'operatorRef',p_spec->>'stopOwner',v_caps,v_stores,
  (p_spec->>'startsAt')::timestamptz,(p_spec->>'expiresAt')::timestamptz,p_expected_version,p_request_id,v_digest)
 returning binding_id into v_id;
 insert into public_test_private.testers(binding_id,email,email_hmac)
 select v_id,item->>'email',decode(item->>'emailHmac','hex') from jsonb_array_elements(v_testers) item;
 return v_id;
end $$;

create function public_test_private.active_binding(p_capability text,p_require_origin boolean default true)
returns uuid language sql stable security definer set search_path='' as $$
 select b.binding_id from public_test_private.runtime r join public_test_private.bindings b on b.binding_id=r.active_binding_id
 where r.id=1 and b.state='active' and b.revoked_at is null and b.activated_at is not null
  and statement_timestamp()>=b.starts_at and statement_timestamp()<b.expires_at
  and r.first_started_at is not null and statement_timestamp()<r.first_started_at+interval '30 days'
  and p_capability=any(b.capabilities)
  and (not p_require_origin or
    coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'origin'=r.exact_origin);
$$;

create function public_test_private.activate(p_binding_id uuid,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare r public_test_private.runtime%rowtype; b public_test_private.bindings%rowtype;
begin
 select * into r from public_test_private.runtime where id=1 for update;
 select * into b from public_test_private.bindings where binding_id=p_binding_id for update;
 if b.state='active' and r.active_binding_id=b.binding_id and b.expected_runtime_version=p_expected_version
   and r.version=p_expected_version+1 and b.revoked_at is null and b.expires_at>statement_timestamp() then return r.version;end if;
 if b.binding_id is null or r.version is distinct from p_expected_version
   or b.expected_runtime_version is distinct from p_expected_version or r.active_binding_id is not null
   or b.state<>'prepared' or b.revoked_at is not null or statement_timestamp()<b.starts_at or statement_timestamp()>=b.expires_at
   or (r.first_started_at is not null and b.expires_at>r.first_started_at+interval '30 days') then
  raise exception 'public_test_activation_denied' using errcode='42501';
 end if;
 if 'registration'=any(b.capabilities) then
  perform 1 from app_private.account_registration_config where id=1 for update;
  perform 1 from app_private.registration_quarantine_latch where id=1 for update;
  if not exists(select 1 from app_private.registration_quarantine_latch where id=1 and state='open')
    or exists(select 1 from app_private.registration_cleanup_tickets where state<>'completed_absent')
    or exists(select 1 from app_private.registration_provider_operations where state in ('reserved','calling','reconciliation_required')) then
   raise exception 'public_test_registration_not_ready' using errcode='42501';
  end if;
  -- The enrollment wrapper below admits only these named emails. This setting
  -- is never sufficient to grant admission or enable direct provider signup.
  update app_private.account_registration_config set mode='public',version=version+1 where id=1;
 end if;
 update public_test_private.bindings set state='active',activated_at=statement_timestamp() where binding_id=b.binding_id;
 update public_test_private.runtime set active_binding_id=b.binding_id,
  first_started_at=coalesce(first_started_at,statement_timestamp()),version=version+1 where id=1 returning version into r.version;
 return r.version;
end $$;

create function public_test_private.revoke(p_binding_id uuid,p_expected_version bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare r public_test_private.runtime%rowtype; b public_test_private.bindings%rowtype;
begin
 select * into r from public_test_private.runtime where id=1 for update;
 select * into b from public_test_private.bindings where binding_id=p_binding_id for update;
 if b.state='revoked' and r.active_binding_id is null and r.version=p_expected_version+1 then return r.version;end if;
 if b.binding_id is null or r.version is distinct from p_expected_version or r.active_binding_id is distinct from b.binding_id then
  raise exception 'public_test_revocation_denied' using errcode='42501';
 end if;
 update public_test_private.bindings set state='revoked',revoked_at=statement_timestamp() where binding_id=b.binding_id;
 update public_test_private.runtime set active_binding_id=null,version=version+1 where id=1 returning version into r.version;
 update app_private.account_registration_config set mode='closed',version=version+1 where id=1;
 update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),revocation_reason='public_test_stopped',version=version+1
 where state='active' and user_id in(select auth_user_id from public_test_private.testers where binding_id=b.binding_id);
 return r.version;
end $$;

create function app_public.public_test_catalog_gateway_request(p_key_hash text,p_operation text,p_args jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare binding uuid:=public_test_private.active_binding('catalog'); stores uuid[]; v_window timestamptz; amount integer; rate_limit integer;
begin
 if binding is null then raise exception 'public_test_unavailable' using errcode='42501';end if;
 if p_key_hash is null or p_key_hash!~'^[0-9a-f]{64}$' or p_operation not in ('list','details')
  or p_operation is null or jsonb_typeof(p_args) is distinct from 'object'
  or (p_operation='list' and p_args-array['p_q','p_category','p_area']<>'{}'::jsonb)
  or (p_operation='details' and p_args-array['p_slug']<>'{}'::jsonb) then
  raise exception 'gateway_request_invalid' using errcode='22023';
 end if;
 select store_ids into stores from public_test_private.bindings where binding_id=binding;
 v_window:=to_timestamp(floor(extract(epoch from statement_timestamp())/300)*300);
 rate_limit:=case p_operation when 'details' then 120 else 60 end;
 perform pg_advisory_xact_lock(hashtextextended(p_key_hash||p_operation||v_window::text,0));
 insert into release_private.public_catalog_rate_windows(key_hash,operation,window_start,request_count)
 values(decode(p_key_hash,'hex'),p_operation,v_window,1)
 on conflict(key_hash,operation,window_start) do update set request_count=release_private.public_catalog_rate_windows.request_count+1
 returning request_count into amount;
 if amount>rate_limit then raise exception 'catalog_rate_limited';end if;
 if p_operation='list' then
  return coalesce((select jsonb_agg(x) from app_public.catalog_list(p_args->>'p_q',p_args->>'p_category',p_args->>'p_area') x where x.id=any(stores)),'[]'::jsonb);
 end if;
 return coalesce((select jsonb_agg(x) from app_public.catalog_details(p_args->>'p_slug') x where x.id=any(stores)),'[]'::jsonb);
end $$;
revoke all on function app_public.public_test_catalog_gateway_request(text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function app_public.public_test_catalog_gateway_request(text,text,jsonb) to public_catalog_gateway;
grant synthetic_catalog_automation to postgres;
grant create on schema app_public to synthetic_catalog_automation;
alter function app_public.public_test_catalog_gateway_request(text,text,jsonb) owner to synthetic_catalog_automation;
grant usage on schema public_test_private to synthetic_catalog_automation;
grant select(binding_id,store_ids) on public_test_private.bindings to synthetic_catalog_automation;
create policy gateway_store_scope on public_test_private.bindings for select to synthetic_catalog_automation using(true);
revoke create on schema app_public from synthetic_catalog_automation;
revoke synthetic_catalog_automation from postgres;

revoke all on all functions in schema public_test_private from public,anon,authenticated,service_role;
grant execute on function public_test_private.active_binding(text,boolean) to synthetic_catalog_automation;
-- Preserve function OIDs (including references already compiled into RLS),
-- owners and original authorization. The private copies are not RPC endpoints.
do $copies$
declare item record; definition text; original_owner text;
begin
 for item in select * from (values
  ('internal_review_private.session_allowed(uuid)','session_allowed_base'),
  ('app_public.internal_review_pre_request()','pre_request_base'),
  ('shopper_private.store_is_shopper_visible(uuid)','store_visible_base'),
  ('app_public.begin_account_registration(bytea,boolean,text)','begin_registration_base'),
  ('app_public.begin_account_registration_operation(uuid,uuid,text,text)','begin_operation_base'),
  ('app_public.complete_account_registration_callback(uuid,uuid)','complete_callback_base')
 ) x(signature,copy_name) loop
  select pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner) into definition,original_owner
   from pg_proc p where p.oid=item.signature::regprocedure;
  definition:=regexp_replace(definition,'FUNCTION [^(]+\(',
    'FUNCTION public_test_private.'||item.copy_name||'(');
  execute definition;
  if original_owner<>'postgres' then execute format('grant %I to postgres',original_owner);end if;
  execute format('grant usage,create on schema public_test_private to %I',original_owner);
  execute format('alter function public_test_private.%I(%s) owner to %I',item.copy_name,
    pg_get_function_identity_arguments(item.signature::regprocedure),original_owner);
  if original_owner<>'postgres' then execute format('revoke create on schema public_test_private from %I',original_owner);end if;
 end loop;
end $copies$;

create function public_test_private.store_allowed(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public_test_private.testers where auth_user_id=app_public.request_user_id())
 or exists(select 1 from public_test_private.bindings b
  where b.binding_id=public_test_private.active_binding('saved') and p_store_id=any(b.store_ids));
$$;
grant create on schema shopper_private to identity_service;
set local role identity_service;
create or replace function shopper_private.store_is_shopper_visible(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public_test_private.store_visible_base(p_store_id) and public_test_private.store_allowed(p_store_id);
$$;
reset role;
revoke create on schema shopper_private from identity_service;

create function public_test_private.actor_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case when not exists(select 1 from public_test_private.testers where auth_user_id=p_user_id)
 then true else
  current_setting('request.method',true)='POST' and exists(
   select 1 from public_test_private.runtime r where r.id=1 and r.exact_origin=
    coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'origin'
  ) and (
   ltrim(coalesce(current_setting('request.path',true),''),'/') in (
    'rpc/revoke_current_session','rpc/account_lifecycle_status','rpc/request_account_export',
    'rpc/get_account_export_status','rpc/request_account_deletion','rpc/cancel_account_deletion')
   or (exists(select 1 from public_test_private.testers t
      where t.auth_user_id=p_user_id and t.binding_id=public_test_private.active_binding('saved')
       and t.admission_id is not null and t.admitted_at is not null)
    and ltrim(coalesce(current_setting('request.path',true),''),'/') in (
      'rpc/register_current_session','rpc/current_session_is_active',
      'rpc/shopper_list_saved','rpc/shopper_save_state','rpc/shopper_set_save'))
  ) end;
$$;

-- A session helper is also consulted by direct/private row policies, so the
-- transport allowlist cannot be bypassed by selecting a different RPC/table.
grant create on schema internal_review_private,app_public to internal_review_guard;
set local role internal_review_guard;
create or replace function internal_review_private.session_allowed(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public_test_private.session_allowed_base(p_user_id)
  and public_test_private.actor_allowed(p_user_id);
$$;
create or replace function app_public.internal_review_pre_request()
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public_test_private.pre_request_base();
 if not coalesce(public_test_private.actor_allowed(app_public.request_user_id()),false) then
  raise exception 'public_test_request_denied' using errcode='42501';
 end if;
end $$;
reset role;
revoke create on schema internal_review_private,app_public from internal_review_guard;

create function public_test_private.begin_registration(p_email_hmac bytea,p_age_18_attestation boolean,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare binding uuid; result jsonb;
begin
 -- Serialize with activation/revocation so a stopped scope cannot reserve a
 -- new provider operation concurrently with the operator's stop transaction.
 perform 1 from public_test_private.runtime where id=1 for share;
 if exists(select 1 from public_test_private.runtime where id=1 and first_started_at is null) then
  return public_test_private.begin_registration_base(p_email_hmac,p_age_18_attestation,p_idempotency_key);
 end if;
 binding:=public_test_private.active_binding('registration',false);
 if binding is null or p_age_18_attestation is distinct from true or not exists(select 1 from public_test_private.testers
   where binding_id=binding and email_hmac=p_email_hmac and auth_user_id is null) then
  return jsonb_build_object('state','blocked');
 end if;
 result:=public_test_private.begin_registration_base(p_email_hmac,p_age_18_attestation,p_idempotency_key);
 if result->>'state'='reserved' then
  update public_test_private.testers set admission_id=(result->>'admissionId')::uuid
   where binding_id=binding and email_hmac=p_email_hmac
    and (admission_id is null or admission_id=(result->>'admissionId')::uuid);
  if not found then raise exception 'public_test_admission_conflict' using errcode='42501';end if;
 end if;
 return result;
end $$;

create function public_test_private.complete_callback(p_admission_id uuid,p_provider_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare binding uuid; accepted boolean;
begin
 perform 1 from public_test_private.runtime where id=1 for share;
 if exists(select 1 from public_test_private.runtime where id=1 and first_started_at is null) then
  return public_test_private.complete_callback_base(p_admission_id,p_provider_user_id);
 end if;
 binding:=public_test_private.active_binding('registration',false);
 if binding is null or not exists(
  select 1 from public_test_private.testers t
  join app_private.account_admission_receipts a on a.admission_id=t.admission_id and a.email_hmac=t.email_hmac
  join auth.users u on u.id=a.provider_user_id
  where t.binding_id=binding and a.admission_id=p_admission_id and a.provider_user_id=p_provider_user_id
   and (t.auth_user_id is null or t.auth_user_id=u.id)
   and u.email_confirmed_at is not null and lower(btrim(u.email))=t.email
   and a.purpose='shopper' and a.state in ('verification_pending','active')
 ) then return false;end if;
 accepted:=public_test_private.complete_callback_base(p_admission_id,p_provider_user_id);
 if not accepted then return false;end if;
 update public_test_private.testers set auth_user_id=p_provider_user_id,admitted_at=coalesce(admitted_at,statement_timestamp())
 where binding_id=binding and admission_id=p_admission_id;
 insert into app_private.role_grants(subject_user_id,role,store_id)
 values(p_provider_user_id,'shopper',null)
 on conflict(subject_user_id) where role='shopper' and state='active' do nothing;
 return true;
end $$;

create function public_test_private.begin_operation(p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public_test_private.runtime where id=1 for share;
 if exists(select 1 from public_test_private.runtime where id=1 and first_started_at is not null)
  and not exists(select 1 from public_test_private.testers
    where admission_id=p_admission_id and binding_id=public_test_private.active_binding('registration',false)) then
  return jsonb_build_object('state','blocked');
 end if;
 return public_test_private.begin_operation_base(p_operation_id,p_admission_id,p_idempotency_key,p_kind);
end $$;

-- Replace under each original owner, retaining the service-only ACL. The
-- private wrappers never grant authority based on caller-editable metadata.
do $registration_wrappers$
declare item record; owner_name text;
begin
 for item in select * from (values
  ('app_public.begin_account_registration(bytea,boolean,text)',
   'create or replace function app_public.begin_account_registration(p_email_hmac bytea,p_age_18_attestation boolean,p_idempotency_key text) returns jsonb language sql security definer set search_path='''' as ''select public_test_private.begin_registration(p_email_hmac,p_age_18_attestation,p_idempotency_key)'''),
  ('app_public.begin_account_registration_operation(uuid,uuid,text,text)',
   'create or replace function app_public.begin_account_registration_operation(p_operation_id uuid,p_admission_id uuid,p_idempotency_key text,p_kind text) returns jsonb language sql security definer set search_path='''' as ''select public_test_private.begin_operation(p_operation_id,p_admission_id,p_idempotency_key,p_kind)'''),
  ('app_public.complete_account_registration_callback(uuid,uuid)',
   'create or replace function app_public.complete_account_registration_callback(p_admission_id uuid,p_provider_user_id uuid) returns boolean language sql security definer set search_path='''' as ''select public_test_private.complete_callback(p_admission_id,p_provider_user_id)''')
 ) x(signature,definition) loop
  select pg_get_userbyid(proowner) into owner_name from pg_proc where oid=item.signature::regprocedure;
  execute format('grant create on schema app_public to %I',owner_name);
  perform set_config('role',owner_name,true);
  execute item.definition;
  perform set_config('role','none',true);
  if owner_name<>'postgres' then execute format('revoke create on schema app_public from %I',owner_name);end if;
 end loop;
end $registration_wrappers$;

-- Callback lookup uses the already bound provider UUID. Metadata may locate a
-- receipt in legacy flows, but never constitutes an admission credential.
create function app_public.complete_public_test_registration_callback(p_provider_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare admission uuid;
begin
 select a.admission_id into admission from app_private.account_admission_receipts a
 join public_test_private.testers t on t.admission_id=a.admission_id
 where a.provider_user_id=p_provider_user_id and t.binding_id=public_test_private.active_binding('registration',false);
 if admission is null then return false;end if;
 return public_test_private.complete_callback(admission,p_provider_user_id);
end $$;
revoke all on function app_public.complete_public_test_registration_callback(uuid) from public,anon,authenticated;
grant execute on function app_public.complete_public_test_registration_callback(uuid) to service_role;
revoke all on all functions in schema public_test_private from public,anon,authenticated,service_role;
grant execute on function public_test_private.active_binding(text,boolean) to synthetic_catalog_automation;
grant execute on function public_test_private.actor_allowed(uuid) to internal_review_guard;
grant execute on function public_test_private.store_allowed(uuid) to identity_service;
-- Private base functions keep their original owners; wrapper owners require
-- only these two narrow delegates, not operator prepare/activate/revoke.
do $delegates$
declare owner_name text;
begin
 select pg_get_userbyid(proowner) into owner_name from pg_proc where oid='app_public.begin_account_registration(bytea,boolean,text)'::regprocedure;
 execute format('grant execute on function public_test_private.begin_registration(bytea,boolean,text) to %I',owner_name);
 select pg_get_userbyid(proowner) into owner_name from pg_proc where oid='app_public.begin_account_registration_operation(uuid,uuid,text,text)'::regprocedure;
 execute format('grant execute on function public_test_private.begin_operation(uuid,uuid,text,text) to %I',owner_name);
 select pg_get_userbyid(proowner) into owner_name from pg_proc where oid='app_public.complete_account_registration_callback(uuid,uuid)'::regprocedure;
 execute format('grant execute on function public_test_private.complete_callback(uuid,uuid) to %I',owner_name);
end $delegates$;
revoke internal_review_guard from postgres;
