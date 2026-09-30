-- #422: isolated synthetic primary Owner authority; existing Representative flows stay intact.
alter table app_private.role_grants drop constraint role_grants_store_scope;
alter table app_private.role_grants add constraint role_grants_store_scope check (
 (role in ('shopper','administrator') and store_id is null)
 or (role in ('representative','store_owner') and store_id is not null));
alter table partner_private.store_partner_grants drop constraint store_partner_grants_role_check;
alter table partner_private.store_partner_grants add constraint store_partner_grants_role_check
 check (role in ('representative','store_owner'));

-- Bind conversion to a new, exact approval command; legacy approval replay cannot upgrade a grant.
create table partner_private.owner_claim_approvals (
 claim_id uuid primary key references partner_private.listing_claims(claim_id) on delete cascade,
 store_id uuid not null references app_public.stores(id) on delete restrict,
 approved_by uuid not null references auth.users(id) on delete restrict,
 expected_version bigint not null check (expected_version>0),
 idempotency_key text not null unique,
 approved_at timestamptz not null default statement_timestamp());
alter table partner_private.owner_claim_approvals enable row level security;
alter table partner_private.owner_claim_approvals force row level security;
revoke all on partner_private.owner_claim_approvals from public,anon,authenticated,service_role;
grant select,insert on partner_private.owner_claim_approvals to identity_service;
create policy identity_owner_approvals on partner_private.owner_claim_approvals to identity_service
 using(true) with check(true);

grant identity_service to postgres;
grant usage,create on schema app_private,app_public,partner_private,portal_private to identity_service;
set role identity_service;

create or replace function app_private.guard_privileged_role_activation()
returns trigger language plpgsql security definer set search_path='' as $$
declare privileged boolean; activating boolean;
begin
 privileged:=case tg_table_schema||'.'||tg_table_name
  when 'app_private.role_grants' then new.role in ('representative','store_owner','administrator')
  when 'partner_private.store_partner_grants' then new.role in ('representative','store_owner')
  else false end;
 activating:=new.state='active' and (tg_op='INSERT' or old.state<>'active' or new.role is distinct from old.role);
 if privileged and activating and not app_private.privileged_anchor_is_current() then
  raise exception using errcode='42501',message='privileged_anchor_stale';
 end if;
 return new;
end $$;

create or replace function partner_private.revoke_exact_claim_scope(p_claim_id uuid,p_actor uuid,p_reason text,p_key text) returns void
language plpgsql volatile security definer set search_path='' as $$
declare c partner_private.listing_claims%rowtype; g partner_private.store_partner_grants%rowtype;
begin
 select * into c from partner_private.listing_claims where claim_id=p_claim_id for update;
 if c.state<>'approved' then raise exception using errcode='55000',message='partner_claim_not_approved'; end if;
 perform 1 from partner_private.store_partner_grants where store_id=c.store_id and state='active' for update;
 update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),revoked_by=p_actor,version=version+1
 where store_id=c.store_id and auth_user_id=c.claimant_id and state='active' returning * into g;
 if found then
  insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,revoked_by,idempotency_key)
  values(g.grant_id,g.auth_user_id,g.store_id,case when p_reason='scope_transfer' then 'scope_transfer' else 'administrator_revoked' end,p_actor,p_key);
 end if;
 update app_private.role_grants set state='revoked',revoked_by=p_actor,revoked_at=statement_timestamp(),revocation_reason=p_reason,version=version+1
 where subject_user_id=c.claimant_id and role in ('representative','store_owner') and store_id=c.store_id and state='active';
 update partner_private.store_partnerships set state='revoked',ended_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
 where auth_user_id=c.claimant_id and store_id=c.store_id and state='active';
 update partner_private.listing_claims set state='revoked',revoked_at=statement_timestamp() where claim_id=c.claim_id;
end $$;

create function app_public.owner_admin_approve_claim(p_claim_id uuid,p_store_id uuid,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); c partner_private.listing_claims%rowtype;
 prior partner_private.owner_claim_approvals%rowtype;
begin
 if p_claim_id is null or p_store_id is null or p_expected_version is null or p_expected_version<1
  or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
  raise exception using errcode='22023',message='owner_command_invalid';
 end if;
 -- Serialize replay before looking at either receipt ledger.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-approval:'||p_idempotency_key,0));
 select * into c from partner_private.listing_claims where claim_id=p_claim_id;
 if not found or c.store_id<>p_store_id or c.claimant_id=actor
  or not exists(select 1 from app_public.stores s cross join app_private.environment_stage e
   where s.id=c.store_id and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
  or not exists(select 1 from app_private.profiles where user_id=c.claimant_id and status='active' and verified_email_snapshot is not null)
  or not app_private.provider_user_has_verified_mfa(c.claimant_id) then
  raise exception using errcode='42501',message='owner_access_unavailable';
 end if;
 if not exists(select 1 from partner_private.pending_partner_identities p
  join partner_private.partner_invitations i on i.invitation_id=p.invitation_id and i.synthetic
  where p.auth_user_id=c.claimant_id and p.state='bound') then
  raise exception using errcode='42501',message='owner_access_unavailable';
 end if;
 if not app_private.provider_user_is_confirmed(c.claimant_id) then
  raise exception using errcode='42501',message='owner_access_unavailable';
 end if;
 select * into prior from partner_private.owner_claim_approvals where idempotency_key=p_idempotency_key;
 if found then
  if prior.claim_id<>p_claim_id or prior.store_id<>p_store_id or prior.approved_by<>actor or prior.expected_version<>p_expected_version then
   raise exception using errcode='22023',message='owner_idempotency_mismatch';
  end if;
  if c.state<>'approved' then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
 else
  if exists(select 1 from partner_private.claim_command_receipts where idempotency_key=p_idempotency_key) then
   raise exception using errcode='22023',message='owner_idempotency_mismatch';
  end if;
  perform app_public.partner_admin_claim_command('approve',p_claim_id,p_expected_version,p_idempotency_key,'owner_boundary_confirmed');
  update app_private.role_grants set role='store_owner',version=version+1
   where subject_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active';
  if not found then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
  update partner_private.store_partner_grants set role='store_owner',version=version+1
   where auth_user_id=c.claimant_id and store_id=c.store_id and role='representative' and state='active';
  if not found then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
  insert into partner_private.owner_claim_approvals(claim_id,store_id,approved_by,expected_version,idempotency_key)
   values(p_claim_id,p_store_id,actor,p_expected_version,p_idempotency_key);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
   values(actor,'administrator','owner_claim_approved','completed','listing_claim',p_claim_id,'owner_boundary_confirmed',
    extensions.digest(convert_to(p_claim_id::text||'|'||p_store_id::text,'utf8'),'sha256'),decode(repeat('00',32),'hex'));
 end if;
 return jsonb_build_object('role','Store Owner','storeId',p_store_id,'claimId',p_claim_id);
end $$;

-- One authoritative set, shared by list, selection, and every selected Portal request.
create function portal_private.owner_stores()
returns table(store_id uuid,store_name text) language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id();
begin
 if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
  or not app_private.current_session_recent_auth(interval '10 minutes') or not app_private.privileged_anchor_is_current()
  or not partner_private.partner_consent_is_current(actor)
  or not app_private.provider_user_is_confirmed(actor)
  or not exists(select 1 from app_private.profiles where user_id=actor and status='active' and verified_email_snapshot is not null) then
  raise exception using errcode='42501',message='owner_access_unavailable';
 end if;
 return query select s.id,s.name from partner_private.store_partner_grants g
  join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
  join app_private.role_grants r on r.subject_user_id=actor and r.store_id=g.store_id and r.role='store_owner' and r.state='active'
  join partner_private.listing_claims c on c.claimant_id=actor and c.store_id=g.store_id and c.state='approved'
  join partner_private.owner_claim_approvals a on a.claim_id=c.claim_id and a.store_id=c.store_id
  join app_public.stores s on s.id=g.store_id
  join partner_private.pending_partner_identities pi on pi.pending_identity_id=p.pending_identity_id and pi.auth_user_id=actor and pi.state='bound'
  join partner_private.partner_invitations i on i.invitation_id=pi.invitation_id and i.synthetic
  cross join app_private.environment_stage e
  where g.auth_user_id=actor and g.role='store_owner' and g.state='active'
   and not exists(select 1 from partner_private.partner_access_revocations v where v.grant_id=g.grant_id)
   and s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha';
end $$;

create function app_public.owner_list_stores() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare stores jsonb;
begin
 select jsonb_agg(jsonb_build_object('storeId',s.store_id,'name',s.store_name) order by s.store_name,s.store_id)
  into stores from portal_private.owner_stores() s;
 if stores is null then raise exception using errcode='42501',message='owner_access_unavailable'; end if;
 return jsonb_build_object('role','Store Owner','stores',stores);
end $$;

create function app_public.owner_current_role() returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from portal_private.owner_stores()) then return 'Store Owner'; end if;
 return null;
exception when insufficient_privilege then return null;
end $$;

create function app_public.owner_select_store(p_store_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
 if p_store_id is null or not exists(select 1 from portal_private.owner_stores() s where s.store_id=p_store_id) then
  raise exception using errcode='42501',message='owner_access_unavailable';
 end if;
 return jsonb_build_object('storeId',p_store_id);
end $$;

create or replace function portal_private.require_portal_scope()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=app_public.request_user_id(); target uuid; has_exactly_one_scope boolean; selected uuid;
begin
 if actor is null or not app_private.current_session_is_active() or not app_private.current_session_has_mfa()
  or not app_private.current_session_recent_auth(interval '10 minutes')
  or not partner_private.partner_consent_is_current(actor) then raise exception using errcode='42501',message='portal_unavailable'; end if;
 -- Each browser tab sends its own requested scope. It is never a session-global mutable target.
 begin
  selected:=nullif(nullif(current_setting('request.headers',true),'')::jsonb->>'x-owner-store-id','')::uuid;
 exception when invalid_text_representation then
  raise exception using errcode='42501',message='portal_unavailable';
 end;
 if selected is not null then
  begin
   if exists(select 1 from portal_private.owner_stores() s where s.store_id=selected) then return selected; end if;
  exception when insufficient_privilege then null;
  end;
  raise exception using errcode='42501',message='portal_unavailable';
 end if;
 select count(*)=1,(array_agg(g.store_id))[1] into has_exactly_one_scope,target
  from partner_private.store_partner_grants g
  join partner_private.store_partnerships p on p.partnership_id=g.partnership_id and p.auth_user_id=actor and p.store_id=g.store_id and p.state='active'
  join app_public.stores s on s.id=g.store_id
  cross join app_private.environment_stage e
  where g.auth_user_id=actor and g.role='representative' and g.state='active'
   and not exists(select 1 from partner_private.partner_access_revocations r where r.grant_id=g.grant_id)
   and ((s.synthetic and s.audience='synthetic' and e.id=1 and e.stage='synthetic_alpha')
    or (not s.synthetic and s.audience='regional_readiness' and e.id=1 and e.stage='private_beta')
    or (not s.synthetic and s.audience='public' and e.id=1 and e.stage='regional_public'));
 if not coalesce(has_exactly_one_scope,false) or target is null then raise exception using errcode='42501',message='portal_unavailable'; end if;
 return target;
end $$;

reset role;
revoke all on function portal_private.owner_stores() from public,anon,authenticated,service_role;
revoke all on function app_public.owner_admin_approve_claim(uuid,uuid,bigint,text),
 app_public.owner_list_stores(),app_public.owner_select_store(uuid),app_public.owner_current_role() from public,anon,service_role;
grant execute on function app_public.owner_admin_approve_claim(uuid,uuid,bigint,text),
 app_public.owner_list_stores(),app_public.owner_select_store(uuid),app_public.owner_current_role() to authenticated;
revoke create on schema app_private,app_public,partner_private,portal_private from identity_service;
revoke identity_service from postgres;
