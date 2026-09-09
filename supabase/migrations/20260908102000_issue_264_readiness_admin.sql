-- Issue 264: exact-cohort regional readiness operations and frozen evidence.
-- Operations and ProductOwner responsibilities are evidence grants, not app roles.

grant readiness_automation to postgres;
grant create on schema readiness_private to readiness_automation;
grant create on schema app_public to readiness_automation;
grant usage on schema app_private,app_public to readiness_automation;

create table readiness_private.readiness_cohorts (
  cohort_id uuid primary key default extensions.gen_random_uuid(),
  area_slug text not null default 'topeka-ks' check (area_slug='topeka-ks'),
  state text not null default 'active' check (state in ('active','revoked','expired')),
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp()
);

create table readiness_private.readiness_admin_responsibility_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  run_id uuid references readiness_private.readiness_runs(run_id) on delete restrict,
  responsibility text not null check (responsibility in ('Operations','ProductOwner')),
  state text not null default 'active' check (state in ('active','revoked','expired')),
  source_receipt_id uuid,
  version bigint not null default 1 check (version>0),
  granted_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  constraint evidence_responsibility_scope_shape check (
    (responsibility='Operations' and run_id is null)
    or (responsibility='ProductOwner' and run_id is not null)
  ),
  constraint evidence_responsibility_state_shape check (
    (state='active' and revoked_at is null) or (state in ('revoked','expired') and revoked_at is not null)
  )
);
create unique index readiness_one_active_operations_grant
  on readiness_private.readiness_admin_responsibility_grants(user_id,cohort_id,responsibility)
  where state='active' and responsibility='Operations';
create unique index readiness_one_active_product_owner_grant
  on readiness_private.readiness_admin_responsibility_grants(user_id,run_id,responsibility)
  where state='active' and responsibility='ProductOwner';

create table readiness_private.readiness_subjects (
  subject_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  email_hmac bytea not null check (octet_length(email_hmac)=32),
  state text not null default 'active' check (state in ('active','excluded','expired')),
  age_band text check (age_band in ('55-69','70+')),
  adaptation boolean,
  started_at timestamptz,
  exclusion_reason text check (exclusion_reason is null or exclusion_reason ~ '^[a-z0-9_]{1,80}$'),
  excluded_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint readiness_subject_state_shape check (
    (state='active' and exclusion_reason is null and excluded_at is null)
    or (state='excluded' and exclusion_reason is not null and excluded_at is not null)
    or (state='expired' and exclusion_reason is null and excluded_at is not null)
  )
);
create unique index readiness_one_subject_per_cohort_email
  on readiness_private.readiness_subjects(cohort_id,email_hmac);
create unique index readiness_one_subject_per_cohort_user
  on readiness_private.readiness_subjects(cohort_id,user_id)
  where user_id is not null;

create table readiness_private.readiness_invitations (
  invitation_id uuid primary key default extensions.gen_random_uuid(),
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  recipient_email_hmac bytea not null check (octet_length(recipient_email_hmac)=32),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','registration_pending','accepted','revoked','expired')),
  subject_id uuid references readiness_private.readiness_subjects(subject_id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint readiness_invitation_expiry_bound check (
    expires_at>created_at and expires_at<=created_at+interval '7 days'
  ),
  constraint readiness_invitation_state_shape check (
    (state in ('pending','registration_pending') and subject_id is null and accepted_at is null and revoked_at is null)
    or (state='accepted' and subject_id is not null and accepted_at is not null and revoked_at is null)
    or (state='revoked' and revoked_at is not null)
    or (state='expired' and expires_at<=created_at + interval '7 days')
  )
);
create unique index readiness_one_live_invitation_per_email
  on readiness_private.readiness_invitations(cohort_id,recipient_email_hmac)
  where state in ('pending','registration_pending','accepted');
create unique index readiness_one_invitation_idempotency
  on readiness_private.readiness_invitations(cohort_id,idempotency_key);

create table readiness_private.readiness_visibility_grants (
  grant_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  state text not null default 'active' check (state in ('active','revoked','expired')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  version bigint not null default 1 check (version>0),
  created_at timestamptz not null default statement_timestamp(),
  constraint readiness_visibility_grant_window check (expires_at>created_at and expires_at<=created_at+interval '30 days'),
  constraint readiness_visibility_grant_state_shape check (
    (state='active' and revoked_at is null) or (state in ('revoked','expired') and revoked_at is not null)
  ),
  unique(user_id,cohort_id)
);

create table readiness_private.readiness_admin_runs (
  run_id uuid primary key,
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'),
  state text not null default 'not_started' check (state in ('not_started','in_progress','completed','blocked')),
  version bigint not null default 1 check (version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  unique(cohort_id,idempotency_key)
);

create table readiness_private.readiness_admin_signing_capabilities (
  capability_id uuid primary key default extensions.gen_random_uuid(),
  token_hash bytea not null unique check (octet_length(token_hash)=32),
  user_id uuid not null references auth.users(id) on delete restrict,
  cohort_id uuid not null references readiness_private.readiness_cohorts(cohort_id) on delete restrict,
  run_id uuid not null references readiness_private.readiness_runs(run_id) on delete restrict,
  responsibility text not null check (responsibility='ProductOwner'),
  frozen_digest bytea not null check (octet_length(frozen_digest)=32),
  expires_at timestamptz not null,
  state text not null default 'active' check (state in ('active','used','expired','revoked')),
  request_digest bytea check (request_digest is null or octet_length(request_digest)=32),
  receipt_id uuid references readiness_private.readiness_receipts(receipt_id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  used_at timestamptz,
  constraint readiness_capability_window check (expires_at>created_at and expires_at<=created_at+interval '30 minutes'),
  constraint readiness_capability_state_shape check (
    (state='active' and used_at is null and receipt_id is null)
    or (state='used' and used_at is not null and receipt_id is not null)
    or (state in ('expired','revoked') and used_at is null)
  )
);

create or replace function readiness_private.guard_capability_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.capability_id<>old.capability_id or new.token_hash<>old.token_hash
    or new.user_id<>old.user_id or new.cohort_id<>old.cohort_id or new.run_id<>old.run_id
    or new.responsibility<>old.responsibility or new.frozen_digest<>old.frozen_digest
    or new.expires_at<>old.expires_at or old.state<>'active'
    or new.state not in ('used','expired','revoked') then
    raise exception using errcode='23514',message='readiness_capability_transition_invalid';
  end if;
  return new;
end
$$;
create trigger readiness_admin_capability_no_update before update
  on readiness_private.readiness_admin_signing_capabilities for each row
  execute function readiness_private.guard_capability_mutation();
create trigger readiness_admin_capability_no_delete before delete
  on readiness_private.readiness_admin_signing_capabilities for each row
  execute function readiness_private.reject_append_only_mutation();

create or replace function readiness_private.workspace_access(
  p_cohort_id uuid,p_run_id uuid,p_responsibility text
)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.current_user_has_role('administrator'::app_private.app_role,null)
    and app_private.current_session_has_mfa()
    and app_private.current_session_recent_auth(interval '15 minutes')
    and exists(
      select 1 from readiness_private.readiness_admin_responsibility_grants g
      where g.user_id=app_public.request_user_id()
        and g.cohort_id=p_cohort_id and g.responsibility=p_responsibility and g.state='active'
        and (p_responsibility='Operations' or g.run_id=p_run_id)
    );
$$;

create or replace function app_public.readiness_admin_workspace(
  p_cohort_id uuid default null,p_run_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare selected_cohort uuid:=p_cohort_id;
declare selected_run uuid:=p_run_id;
declare is_operations boolean;
declare is_product_owner boolean;
begin
  if selected_cohort is null then
    select g.cohort_id into selected_cohort from readiness_private.readiness_admin_responsibility_grants g
    where g.user_id=app_public.request_user_id() and g.responsibility='Operations' and g.state='active'
    order by g.granted_at,g.cohort_id limit 1;
  end if;
  if selected_run is null then
    select r.run_id into selected_run from readiness_private.readiness_admin_runs r
    where r.cohort_id=selected_cohort order by r.created_at desc,r.run_id desc limit 1;
  end if;
  is_operations:=readiness_private.workspace_access(selected_cohort,selected_run,'Operations');
  is_product_owner:=readiness_private.workspace_access(selected_cohort,selected_run,'ProductOwner');
  if not (is_operations or is_product_owner) then
    raise exception using errcode='42501',message='readiness_admin_access_denied';
  end if;
  if not exists(select 1 from readiness_private.readiness_cohorts where cohort_id=selected_cohort) then
    raise exception using errcode='P0002',message='readiness_cohort_not_found';
  end if;
  return jsonb_build_object(
    'cohort',(
      select jsonb_build_object('cohortId',c.cohort_id,'areaSlug',c.area_slug,'state',c.state,'version',c.version)
      from readiness_private.readiness_cohorts c where c.cohort_id=selected_cohort
    ),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object(
      'invitationId',i.invitation_id,'state',case when i.state in ('pending','registration_pending') and i.expires_at<=statement_timestamp() then 'expired' else i.state end,
      'expiresAt',i.expires_at,'subjectId',i.subject_id,'version',i.version
    ) order by i.created_at,i.invitation_id) from readiness_private.readiness_invitations i where i.cohort_id=selected_cohort),'[]'::jsonb),
    'subjects',case when is_operations then coalesce((select jsonb_agg(jsonb_build_object(
      'subjectId',s.subject_id,'state',s.state,'ageBand',s.age_band,'adaptation',s.adaptation,
      'startedAt',s.started_at,'exclusionReason',s.exclusion_reason,'version',s.version
    ) order by s.created_at,s.subject_id) from readiness_private.readiness_subjects s where s.cohort_id=selected_cohort),'[]'::jsonb) else '[]'::jsonb end,
    'run',(
      select jsonb_build_object('runId',r.run_id,'state',r.state,'version',r.version,
        'frozenDigest',case when rr.source_digest is null then null else encode(rr.source_digest,'hex') end,
        'blockers',rr.blockers,'receiptId',rr.receipt_id,'calculatedAt',rr.calculated_at,
        'factCollectionState',fc.state)
      from readiness_private.readiness_admin_runs r
      left join readiness_private.readiness_runs rr on rr.run_id=r.run_id
      left join readiness_private.readiness_fact_collections fc on fc.run_id=r.run_id
      where r.run_id=selected_run
    ),
    'capabilities',jsonb_build_object('listingsPrivate',true,'noindex',true,'anonymousRealStoreAccess',false,'publicReviews',false,'publicPromotion',false)
  );
end
$$;

create or replace function app_public.readiness_admin_create_invitation(
  p_cohort_id uuid,p_recipient_email_hmac text,p_idempotency_key text,p_ttl_hours integer default 168
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex');
declare invitation readiness_private.readiness_invitations%rowtype;
declare digest bytea;
begin
  if not readiness_private.workspace_access(p_cohort_id,null,'Operations') then
    raise exception using errcode='42501',message='readiness_admin_access_denied';
  end if;
  if p_recipient_email_hmac is null or p_recipient_email_hmac !~* '^[0-9a-f]{64}$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
    or p_ttl_hours is null or p_ttl_hours<1 or p_ttl_hours>168 then
    raise exception using errcode='22023',message='readiness_invitation_input_invalid';
  end if;
  update readiness_private.readiness_invitations set state='expired',version=version+1
    where cohort_id=p_cohort_id and state in ('pending','registration_pending') and expires_at<=statement_timestamp();
  if not exists(select 1 from readiness_private.readiness_cohorts where cohort_id=p_cohort_id)
    or (select state from readiness_private.readiness_cohorts where cohort_id=p_cohort_id)<>'active' then
    raise exception using errcode='55000',message='readiness_cohort_unavailable';
  end if;
  if (select count(*) from readiness_private.readiness_subjects where cohort_id=p_cohort_id and started_at is not null)>=8 then
    raise exception using errcode='55000',message='readiness_enrollment_closed';
  end if;
  select * into invitation from readiness_private.readiness_invitations
    where cohort_id=p_cohort_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('invitationId',invitation.invitation_id,'state',invitation.state,'expiresAt',invitation.expires_at,'token',null,'replayed',true);
  end if;
  if (select count(*) from readiness_private.readiness_invitations where cohort_id=p_cohort_id and state not in ('revoked','expired'))>=20 then
    raise exception using errcode='55000',message='readiness_invitation_cap_reached';
  end if;
  if exists(select 1 from readiness_private.readiness_invitations where cohort_id=p_cohort_id
      and recipient_email_hmac=decode(lower(p_recipient_email_hmac),'hex') and state in ('pending','registration_pending','accepted')) then
    raise exception using errcode='23505',message='readiness_invitation_email_already_bound';
  end if;
  digest:=extensions.digest(convert_to(token,'UTF8'),'sha256');
  insert into readiness_private.readiness_invitations(
    cohort_id,token_hash,recipient_email_hmac,idempotency_key,expires_at,created_by
  ) values(
    p_cohort_id,digest,decode(lower(p_recipient_email_hmac),'hex'),p_idempotency_key,
    statement_timestamp()+make_interval(hours=>p_ttl_hours),app_public.request_user_id()
  ) returning * into invitation;
  return jsonb_build_object('invitationId',invitation.invitation_id,'state',invitation.state,
    'expiresAt',invitation.expires_at,'token',token,'replayed',false);
end
$$;

create or replace function app_public.readiness_accept_invitation(
  p_invitation_id uuid,p_email_hmac text,p_age_band text,p_adaptation boolean,p_consent boolean,p_one_person_attested boolean
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare invitation readiness_private.readiness_invitations%rowtype;
declare subject readiness_private.readiness_subjects%rowtype;
begin
  if not app_private.current_session_is_active() or app_public.request_user_id() is null
    or p_email_hmac is null or p_email_hmac !~* '^[0-9a-f]{64}$'
    or p_age_band not in ('55-69','70+') or p_adaptation is null or p_consent is not true
    or p_one_person_attested is not true then
    raise exception using errcode='42501',message='readiness_invitation_accept_denied';
  end if;
  select * into invitation from readiness_private.readiness_invitations where invitation_id=p_invitation_id for update;
  if not found or invitation.state not in ('pending','registration_pending')
    or invitation.expires_at<=statement_timestamp()
    or invitation.recipient_email_hmac<>decode(lower(p_email_hmac),'hex') then
    raise exception using errcode='42501',message='readiness_invitation_accept_denied';
  end if;
  if (select count(*) from readiness_private.readiness_subjects where cohort_id=invitation.cohort_id and started_at is not null)>=8 then
    raise exception using errcode='55000',message='readiness_enrollment_closed';
  end if;
  insert into readiness_private.readiness_subjects(cohort_id,user_id,email_hmac,age_band,adaptation)
    values(invitation.cohort_id,app_public.request_user_id(),invitation.recipient_email_hmac,p_age_band,p_adaptation)
    on conflict(cohort_id,user_id) do update set version=readiness_private.readiness_subjects.version;
  select * into subject from readiness_private.readiness_subjects
    where cohort_id=invitation.cohort_id and user_id=app_public.request_user_id();
  update readiness_private.readiness_invitations set state='accepted',subject_id=subject.subject_id,
    accepted_at=statement_timestamp(),version=version+1 where invitation_id=invitation.invitation_id;
  insert into readiness_private.readiness_visibility_grants(user_id,cohort_id,expires_at)
    values(app_public.request_user_id(),invitation.cohort_id,statement_timestamp()+interval '30 days')
    on conflict(user_id,cohort_id) do update set state='active',expires_at=excluded.expires_at,revoked_at=null,version=readiness_private.readiness_visibility_grants.version+1;
  return jsonb_build_object('invitationId',invitation.invitation_id,'subjectId',subject.subject_id,
    'cohortId',invitation.cohort_id,'grantState','active','grantExpiresAt',statement_timestamp()+interval '30 days');
exception when unique_violation then
  raise exception using errcode='42501',message='readiness_invitation_accept_denied';
end
$$;

create or replace function app_public.readiness_admin_revoke_invitation(
  p_invitation_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare invitation readiness_private.readiness_invitations%rowtype;
begin
  select * into invitation from readiness_private.readiness_invitations where invitation_id=p_invitation_id for update;
  if not found or not readiness_private.workspace_access(invitation.cohort_id,null,'Operations')
    or p_expected_version is null or invitation.version<>p_expected_version then
    raise exception using errcode='42501',message='readiness_invitation_revoke_denied';
  end if;
  if invitation.state in ('revoked','expired') then
    return jsonb_build_object('invitationId',invitation.invitation_id,'state',invitation.state,'version',invitation.version);
  end if;
  update readiness_private.readiness_invitations set state='revoked',revoked_at=statement_timestamp(),version=version+1
    where invitation_id=invitation.invitation_id;
  return jsonb_build_object('invitationId',invitation.invitation_id,'state','revoked','version',invitation.version+1);
end
$$;

create or replace function app_public.readiness_admin_mark_started(
  p_subject_id uuid,p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare subject readiness_private.readiness_subjects%rowtype;
begin
  select * into subject from readiness_private.readiness_subjects where subject_id=p_subject_id for update;
  if not found or not readiness_private.workspace_access(subject.cohort_id,null,'Operations')
    or p_expected_version is null or subject.version<>p_expected_version then
    raise exception using errcode='42501',message='readiness_subject_start_denied';
  end if;
  if subject.state<>'active' then raise exception using errcode='55000',message='readiness_subject_unavailable'; end if;
  if subject.started_at is null and (select count(*) from readiness_private.readiness_subjects where cohort_id=subject.cohort_id and started_at is not null)>=8 then
    raise exception using errcode='55000',message='readiness_enrollment_closed';
  end if;
  update readiness_private.readiness_subjects set started_at=coalesce(started_at,statement_timestamp()),version=version+1 where subject_id=subject.subject_id;
  return jsonb_build_object('subjectId',subject.subject_id,'startedAt',coalesce(subject.started_at,statement_timestamp()),'version',subject.version+1);
end
$$;

create or replace function app_public.readiness_admin_exclude_subject(
  p_subject_id uuid,p_reason text,p_expected_version bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare subject readiness_private.readiness_subjects%rowtype;
begin
  select * into subject from readiness_private.readiness_subjects where subject_id=p_subject_id for update;
  if not found or not readiness_private.workspace_access(subject.cohort_id,null,'Operations')
    or p_expected_version is null or subject.version<>p_expected_version
    or p_reason is null or p_reason !~ '^[a-z0-9_]{1,80}$' then
    raise exception using errcode='42501',message='readiness_subject_exclusion_denied';
  end if;
  if subject.state='excluded' then
    return jsonb_build_object('subjectId',subject.subject_id,'state',subject.state,'version',subject.version,'reason',subject.exclusion_reason);
  end if;
  update readiness_private.readiness_subjects set state='excluded',exclusion_reason=p_reason,excluded_at=statement_timestamp(),version=version+1
    where subject_id=subject.subject_id;
  update readiness_private.readiness_visibility_grants set state='revoked',revoked_at=statement_timestamp(),version=version+1
    where user_id=subject.user_id and cohort_id=subject.cohort_id and state='active';
  return jsonb_build_object('subjectId',subject.subject_id,'state','excluded','version',subject.version+1,'reason',p_reason);
end
$$;

create or replace function app_public.readiness_admin_begin_run(
  p_cohort_id uuid,p_run_id uuid,p_idempotency_key text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare run_row readiness_private.readiness_admin_runs%rowtype;
begin
  if not readiness_private.workspace_access(p_cohort_id,null,'Operations') or p_run_id is null
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
    raise exception using errcode='42501',message='readiness_run_begin_denied';
  end if;
  insert into readiness_private.readiness_admin_runs(run_id,cohort_id,idempotency_key,state,created_by)
    values(p_run_id,p_cohort_id,p_idempotency_key,'in_progress',app_public.request_user_id())
    on conflict(cohort_id,idempotency_key) do nothing;
  select * into run_row from readiness_private.readiness_admin_runs where cohort_id=p_cohort_id and idempotency_key=p_idempotency_key;
  perform readiness_private.begin_fact_collection(run_row.run_id);
  return jsonb_build_object('runId',run_row.run_id,'cohortId',run_row.cohort_id,'state',run_row.state,'version',run_row.version);
exception when unique_violation then
  raise exception using errcode='23505',message='readiness_run_idempotency_mismatch';
end
$$;

create or replace function app_public.readiness_admin_calculate_gate(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare run_row readiness_private.readiness_admin_runs%rowtype;
declare blockers text[];
begin
  select * into run_row from readiness_private.readiness_admin_runs where run_id=p_run_id;
  if not found or not readiness_private.workspace_access(run_row.cohort_id,p_run_id,'Operations') then
    raise exception using errcode='42501',message='readiness_calculation_denied';
  end if;
  select rr.blockers into blockers from readiness_private.readiness_runs rr where rr.run_id=p_run_id;
  if blockers is null then blockers:=readiness_private.calculate_authoritative_blockers(p_run_id); end if;
  return jsonb_build_object('runId',p_run_id,'blockers',to_jsonb(blockers),'canPass',cardinality(blockers)=0,
    'source','server_authoritative_facts');
end
$$;

create or replace function app_public.readiness_admin_freeze_receipt(p_run_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare run_row readiness_private.readiness_admin_runs%rowtype;
declare frozen jsonb;
declare blockers text[];
begin
  select * into run_row from readiness_private.readiness_admin_runs where run_id=p_run_id for update;
  if not found or not readiness_private.workspace_access(run_row.cohort_id,p_run_id,'Operations') then
    raise exception using errcode='42501',message='readiness_freeze_denied';
  end if;
  frozen:=readiness_private.freeze_authoritative_facts(p_run_id);
  blockers:=array(select jsonb_array_elements_text(frozen->'blockers'));
  update readiness_private.readiness_admin_runs set state=case when cardinality(blockers)=0 then 'completed' else 'blocked' end,version=version+1
    where run_id=p_run_id;
  return frozen || jsonb_build_object('adminRunState',case when cardinality(blockers)=0 then 'completed' else 'blocked' end);
end
$$;

create or replace function app_public.readiness_admin_request_signing_capability(
  p_run_id uuid,p_expected_digest text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare run_row readiness_private.readiness_admin_runs%rowtype;
declare frozen readiness_private.readiness_runs%rowtype;
declare token text:=encode(extensions.gen_random_bytes(32),'hex');
declare cap readiness_private.readiness_admin_signing_capabilities%rowtype;
begin
  select * into run_row from readiness_private.readiness_admin_runs where run_id=p_run_id;
  if not found or not readiness_private.workspace_access(run_row.cohort_id,p_run_id,'ProductOwner')
    or p_expected_digest is null or p_expected_digest !~* '^[0-9a-f]{64}$' then
    raise exception using errcode='42501',message='readiness_signing_denied';
  end if;
  select * into frozen from readiness_private.readiness_runs where run_id=p_run_id;
  if not found or frozen.state<>'frozen' or encode(frozen.source_digest,'hex')<>lower(p_expected_digest) then
    raise exception using errcode='55000',message='readiness_digest_stale';
  end if;
  update readiness_private.readiness_admin_signing_capabilities set state='expired'
    where run_id=p_run_id and user_id=app_public.request_user_id() and state='active' and expires_at<=statement_timestamp();
  insert into readiness_private.readiness_admin_signing_capabilities(
    token_hash,user_id,cohort_id,run_id,frozen_digest,expires_at
  ) values(
    extensions.digest(convert_to(token,'UTF8'),'sha256'),app_public.request_user_id(),run_row.cohort_id,p_run_id,
    frozen.source_digest,statement_timestamp()+interval '30 minutes'
  ) returning * into cap;
  return jsonb_build_object('capabilityId',cap.capability_id,'capabilityToken',token,
    'frozenDigest',encode(cap.frozen_digest,'hex'),'expiresAt',cap.expires_at,'blockers',to_jsonb(frozen.blockers));
end
$$;

create or replace function app_public.readiness_admin_decide_receipt(
  p_capability_token text,p_decision text,p_signed_payload_digest text,p_signature_digest text,
  p_provider_key_id text,p_provider_verification_id text,p_reason text default null
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cap readiness_private.readiness_admin_signing_capabilities%rowtype;
declare run_row readiness_private.readiness_admin_runs%rowtype;
declare frozen readiness_private.readiness_runs%rowtype;
declare receipt readiness_private.readiness_receipts%rowtype;
declare command_digest bytea;
declare challenge_id uuid;
begin
  if p_capability_token is null or p_capability_token !~* '^[0-9a-f]{64}$'
    or p_decision not in ('pass','reject') or p_signed_payload_digest is null or p_signed_payload_digest !~* '^[0-9a-f]{64}$'
    or p_signature_digest is null or p_signature_digest !~* '^[0-9a-f]{64}$'
    or nullif(btrim(p_provider_key_id),'') is null or nullif(btrim(p_provider_verification_id),'') is null
    or not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes') then
    raise exception using errcode='42501',message='readiness_decision_denied';
  end if;
  select * into cap from readiness_private.readiness_admin_signing_capabilities
    where token_hash=extensions.digest(convert_to(lower(p_capability_token),'UTF8'),'sha256') for update;
  if not found or cap.user_id<>app_public.request_user_id() or cap.responsibility<>'ProductOwner'
    or not readiness_private.workspace_access(cap.cohort_id,cap.run_id,'ProductOwner') then
    raise exception using errcode='42501',message='readiness_decision_denied';
  end if;
  command_digest:=extensions.digest(convert_to(concat_ws('|',cap.run_id::text,p_decision,lower(p_signed_payload_digest),lower(p_signature_digest),btrim(p_provider_key_id),btrim(p_provider_verification_id),coalesce(p_reason,'')),'UTF8'),'sha256');
  if cap.state='used' then
    if cap.request_digest=command_digest then
      select * into receipt from readiness_private.readiness_receipts where receipt_id=cap.receipt_id;
      return jsonb_build_object('receiptId',receipt.receipt_id,'runId',receipt.run_id,'state',case when receipt.decision='pass' then 'signed' else 'rejected' end,'decision',receipt.decision,'replayed',true);
    end if;
    raise exception using errcode='55000',message='readiness_capability_replay_mismatch';
  end if;
  if cap.state<>'active' or cap.expires_at<=statement_timestamp() then
    raise exception using errcode='42501',message='readiness_capability_expired';
  end if;
  select * into run_row from readiness_private.readiness_admin_runs where run_id=cap.run_id for update;
  select * into frozen from readiness_private.readiness_runs where run_id=cap.run_id for update;
  if not found or frozen.state<>'frozen' or frozen.source_digest<>cap.frozen_digest
    or p_decision='pass' and cardinality(frozen.blockers)>0 then
    raise exception using errcode='55000',message='readiness_decision_blocked';
  end if;
  if p_decision='reject' and nullif(btrim(p_reason),'') is null then
    raise exception using errcode='22023',message='readiness_rejection_reason_required';
  end if;
  challenge_id:=extensions.gen_random_uuid();
  insert into readiness_private.readiness_signing_challenges(
    challenge_id,run_id,signer_user_id,nonce,frozen_digest,payload_digest,expires_at
  ) values(
    challenge_id,cap.run_id,app_public.request_user_id(),extensions.gen_random_bytes(32),cap.frozen_digest,
    decode(lower(p_signed_payload_digest),'hex'),least(cap.expires_at,statement_timestamp()+interval '5 minutes')
  );
  insert into readiness_private.readiness_receipts(
    run_id,challenge_id,signer_user_id,responsibility,decision,frozen_digest,signed_payload_digest,
    signature_digest,provider_key_id,provider_verification_id
  ) values(
    cap.run_id,challenge_id,app_public.request_user_id(),'ProductOwner',p_decision,cap.frozen_digest,
    decode(lower(p_signed_payload_digest),'hex'),decode(lower(p_signature_digest),'hex'),btrim(p_provider_key_id),btrim(p_provider_verification_id)
  ) returning * into receipt;
  update readiness_private.readiness_runs set state=case when p_decision='pass' then 'signed' else 'rejected' end,receipt_id=receipt.receipt_id where run_id=cap.run_id;
  update readiness_private.readiness_admin_signing_capabilities set state='used',used_at=statement_timestamp(),request_digest=command_digest,receipt_id=receipt.receipt_id where capability_id=cap.capability_id;
  update readiness_private.readiness_admin_runs set state=case when p_decision='pass' then 'completed' else 'blocked' end,version=version+1 where run_id=cap.run_id;
  return jsonb_build_object('receiptId',receipt.receipt_id,'runId',receipt.run_id,'state',case when receipt.decision='pass' then 'signed' else 'rejected' end,'decision',receipt.decision,'replayed',false);
end
$$;

-- The legacy challenge RPC is superseded by the capability-bound admin flow;
-- remove the authenticated surface so it cannot remain a generic-admin path.
revoke execute on function app_public.readiness_request_signing_challenge(uuid)
  from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['readiness_cohorts','readiness_admin_responsibility_grants','readiness_subjects','readiness_invitations','readiness_visibility_grants','readiness_admin_runs','readiness_admin_signing_capabilities'] loop
    execute format('alter table readiness_private.%I enable row level security',t);
    execute format('alter table readiness_private.%I force row level security',t);
    execute format('revoke all on readiness_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on readiness_private.%I to readiness_automation',t);
    execute format('create policy readiness_admin_service_%I on readiness_private.%I for all to readiness_automation using(true) with check(true)',t,t);
  end loop;
end $$;

alter function readiness_private.workspace_access(uuid,uuid,text) owner to readiness_automation;
alter function readiness_private.guard_capability_mutation() owner to readiness_automation;
alter function app_public.readiness_admin_workspace(uuid,uuid) owner to readiness_automation;
alter function app_public.readiness_admin_create_invitation(uuid,text,text,integer) owner to readiness_automation;
alter function app_public.readiness_accept_invitation(uuid,text,text,boolean,boolean,boolean) owner to readiness_automation;
alter function app_public.readiness_admin_revoke_invitation(uuid,bigint) owner to readiness_automation;
alter function app_public.readiness_admin_mark_started(uuid,bigint) owner to readiness_automation;
alter function app_public.readiness_admin_exclude_subject(uuid,text,bigint) owner to readiness_automation;
alter function app_public.readiness_admin_begin_run(uuid,uuid,text) owner to readiness_automation;
alter function app_public.readiness_admin_calculate_gate(uuid) owner to readiness_automation;
alter function app_public.readiness_admin_freeze_receipt(uuid) owner to readiness_automation;
alter function app_public.readiness_admin_request_signing_capability(uuid,text) owner to readiness_automation;
alter function app_public.readiness_admin_decide_receipt(text,text,text,text,text,text,text) owner to readiness_automation;

revoke all on function readiness_private.workspace_access(uuid,uuid,text) from public,anon,authenticated;
revoke all on function app_public.readiness_admin_workspace(uuid,uuid),
  app_public.readiness_admin_create_invitation(uuid,text,text,integer),
  app_public.readiness_accept_invitation(uuid,text,text,boolean,boolean,boolean),
  app_public.readiness_admin_revoke_invitation(uuid,bigint),
  app_public.readiness_admin_mark_started(uuid,bigint),
  app_public.readiness_admin_exclude_subject(uuid,text,bigint),
  app_public.readiness_admin_begin_run(uuid,uuid,text),
  app_public.readiness_admin_calculate_gate(uuid),
  app_public.readiness_admin_freeze_receipt(uuid),
  app_public.readiness_admin_request_signing_capability(uuid,text),
  app_public.readiness_admin_decide_receipt(text,text,text,text,text,text,text)
  from public,anon;
grant execute on function app_public.readiness_admin_workspace(uuid,uuid),
  app_public.readiness_admin_create_invitation(uuid,text,text,integer),
  app_public.readiness_accept_invitation(uuid,text,text,boolean,boolean,boolean),
  app_public.readiness_admin_revoke_invitation(uuid,bigint),
  app_public.readiness_admin_mark_started(uuid,bigint),
  app_public.readiness_admin_exclude_subject(uuid,text,bigint),
  app_public.readiness_admin_begin_run(uuid,uuid,text),
  app_public.readiness_admin_calculate_gate(uuid),
  app_public.readiness_admin_freeze_receipt(uuid),
  app_public.readiness_admin_request_signing_capability(uuid,text),
  app_public.readiness_admin_decide_receipt(text,text,text,text,text,text,text)
  to authenticated;
grant execute on function readiness_private.workspace_access(uuid,uuid,text) to readiness_automation;

revoke create on schema readiness_private from readiness_automation;
revoke readiness_automation from postgres;
