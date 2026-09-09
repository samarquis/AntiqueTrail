-- Package 6: ordinary-account add-store intake. Public execution remains off.
grant identity_service to postgres;
grant create on schema partner_private,app_public to identity_service;

create table partner_private.store_application_capability (
  id boolean primary key default true check(id),
  public_store_applications_enabled boolean not null default false
);
insert into partner_private.store_application_capability default values;
create table partner_private.store_add_applications (
  application_id uuid primary key default extensions.gen_random_uuid(),
  applicant_id uuid references auth.users(id) on delete set null,
  state text not null default 'draft' check(state in ('draft','submitted','verification_pending','changes_requested','duplicate_review','approved','rejected','withdrawn')),
  synthetic boolean not null,
  area_id uuid not null references app_public.catalog_areas(id),
  normalized_identity_digest bytea not null check(octet_length(normalized_identity_digest)=32),
  draft jsonb not null,
  matched_store_id uuid references app_public.stores(id),
  approved_store_id uuid references app_public.stores(id),
  converted_claim_id uuid references partner_private.listing_claims(claim_id),
  assigned_admin_id uuid references auth.users(id) on delete set null,
  verified_version bigint,
  provenance_digest bytea check(provenance_digest is null or octet_length(provenance_digest)=32),
  verified_at timestamptz,
  version bigint not null default 1 check(version>0),
  last_activity_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp()
);
create unique index store_application_one_identity on partner_private.store_add_applications(normalized_identity_digest)
  where state not in ('approved','rejected','withdrawn');
create table partner_private.store_application_searches (
  search_id uuid primary key default extensions.gen_random_uuid(),
  applicant_id uuid not null references auth.users(id) on delete cascade,
  identity_digest bytea not null,
  synthetic boolean not null,
  created_at timestamptz not null default statement_timestamp()
);
create table partner_private.store_application_signals (
  application_id uuid not null references partner_private.store_add_applications(application_id) on delete cascade,
  channel_class text not null check(channel_class in ('published_business_contact','callback','mailed_code','filing_lookup','in_person')),
  evidence_hmac bytea not null check(octet_length(evidence_hmac)=32),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  verification_event_id uuid,
  primary key(application_id,channel_class),
  unique(application_id,evidence_hmac),
  unique(application_id,verification_event_id)
);
create table partner_private.store_application_events (
  event_id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null,
  event_kind text not null,
  created_at timestamptz not null default statement_timestamp()
);
create table partner_private.store_application_approval_receipts (
  application_id uuid primary key references partner_private.store_add_applications(application_id),
  store_id uuid not null references app_public.stores(id),
  release_id uuid references release_private.regional_releases(release_id),
  idempotency_key text not null unique,
  input_digest bytea not null,
  created_at timestamptz not null default statement_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['store_application_capability','store_add_applications','store_application_searches','store_application_signals','store_application_events','store_application_approval_receipts'] loop
    execute format('alter table partner_private.%I enable row level security',t);
    execute format('alter table partner_private.%I force row level security',t);
    execute format('revoke all on partner_private.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update,delete on partner_private.%I to identity_service',t);
    execute format('create policy identity_service_access on partner_private.%I for all to identity_service using(true) with check(true)',t);
  end loop;
end $$;
-- Application callers cannot change the activation latch, even through a generic command.
revoke insert,update,delete on partner_private.store_application_capability from identity_service;

create function partner_private.store_application_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select public_store_applications_enabled and release_private.public_capability_enabled('claims')
    from partner_private.store_application_capability where id
$$;

create function partner_private.normalize_store_identity(value text) returns text
language sql immutable set search_path='' as $$
  select regexp_replace(lower(btrim(coalesce(value,''))),'[^a-z0-9]','','g')
$$;
create function partner_private.store_application_identity(draft jsonb) returns bytea
language sql immutable set search_path='' as $$
  select extensions.digest(partner_private.normalize_store_identity(draft->>'name')||'|'||partner_private.normalize_store_identity(draft->>'address'),'sha256')
$$;

create function partner_private.validate_store_application_draft(d jsonb, complete boolean default true) returns void
language plpgsql stable set search_path='' as $$
declare h jsonb; weekdays integer[]:='{}'; day integer;
begin
  if jsonb_typeof(d) is distinct from 'object'
    or (select array_agg(key order by key) from jsonb_object_keys(d) key) is distinct from
       array['address','areaId','categoryId','description','hours','name','ownerConfirmed','phone','summary','website']
    or jsonb_typeof(d->'ownerConfirmed') is distinct from 'boolean'
    or not exists(select 1 from app_public.catalog_areas where id=(d->>'areaId')::uuid and slug='topeka-ks')
    or (complete and not exists(select 1 from app_public.store_categories where id=(d->>'categoryId')::uuid))
  then raise exception using errcode='22023',message='store_application_unavailable'; end if;
  if jsonb_typeof(d->'name') is distinct from 'string' or char_length(btrim(d->>'name')) not between 1 and 120
    or jsonb_typeof(d->'address') is distinct from 'string' or char_length(btrim(d->>'address')) not between 1 and 240
    or jsonb_typeof(d->'summary') is distinct from 'string' or char_length(btrim(d->>'summary')) not between (case when complete then 1 else 0 end) and 280
    or jsonb_typeof(d->'description') is distinct from 'string' or char_length(btrim(d->>'description')) not between (case when complete then 1 else 0 end) and 4000
    or jsonb_typeof(d->'phone') is distinct from 'string' or char_length(d->>'phone')>40
    or jsonb_typeof(d->'website') is distinct from 'string' or char_length(d->>'website')>500
    or (d->>'website'<>'' and d->>'website' !~ '^https://[A-Za-z0-9.-]+(/[^[:space:]]*)?$')
    or jsonb_typeof(d->'hours') is distinct from 'array' or jsonb_array_length(d->'hours')<>7
  then raise exception using errcode='22023',message='store_application_unavailable'; end if;
  for h in select value from jsonb_array_elements(d->'hours') loop
    day:=(h->>'day')::integer;
    if day is null or day not between 1 and 7 or day=any(weekdays)
      or jsonb_typeof(h->'closed') is distinct from 'boolean'
      or (not (h->>'closed')::boolean and ((h->>'opens')::time >= (h->>'closes')::time or h->>'opens' is null or h->>'closes' is null))
    then raise exception using errcode='22023',message='store_application_unavailable'; end if;
    weekdays:=array_append(weekdays,day);
  end loop;
  if complete and not exists(select 1 from jsonb_array_elements(d->'hours') hour_row where hour_row->>'closed'='false') then
    raise exception using errcode='22023',message='store_application_unavailable'; end if;
end $$;

create function partner_private.store_application_matches(d jsonb, is_synthetic boolean) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('storeId',id,'name',name,'address',address) order by name),'[]')
    from app_public.stores s where s.synthetic=is_synthetic and s.publication_state='active'
    and (is_synthetic or release_private.public_store_visible(s.id))
    and (partner_private.normalize_store_identity(s.name)=partner_private.normalize_store_identity(d->>'name')
      or partner_private.normalize_store_identity(s.address)=partner_private.normalize_store_identity(d->>'address')
      or (nullif(d->>'phone','') is not null and partner_private.normalize_store_identity(s.phone)=partner_private.normalize_store_identity(d->>'phone'))
      or (nullif(d->>'website','') is not null and lower(split_part(regexp_replace(s.website,'^https?://',''), '/',1))=lower(split_part(regexp_replace(d->>'website','^https?://',''), '/',1))))
$$;

create function partner_private.store_application_snapshot(a partner_private.store_add_applications) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('applicationId',a.application_id,'state',a.state,'version',a.version,
    'draft',case when a.state in ('approved','rejected','withdrawn') then null else a.draft end,
    'matches',case when a.state='duplicate_review' then partner_private.store_application_matches(a.draft,a.synthetic) else '[]'::jsonb end,
    'categoryLabel',(select label from app_public.store_categories where id::text=a.draft->>'categoryId'),
    'matchedStoreId',a.matched_store_id,'storeId',a.approved_store_id,'claimId',a.converted_claim_id)
$$;

-- Only the function owner can invoke the synthetic path. Normal RPCs hard-code false.
create function partner_private.store_application_command(op text,p jsonb,is_synthetic boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claimant(); a partner_private.store_add_applications%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; d jsonb:=p->'draft'; matches jsonb;
  search_id uuid; target uuid; new_claim_id uuid; draft_digest bytea; sig record;
begin
  if not is_synthetic and not partner_private.store_application_enabled() then
    if op='status' then return null; end if;
    raise exception using errcode='42501',message='store_application_stage_disabled';
  end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception using errcode='22023',message='store_application_unavailable'; end if;
  if op='options' then
    return jsonb_build_object('areas',(select jsonb_agg(jsonb_build_object('id',id,'label',label)) from app_public.catalog_areas where slug='topeka-ks'),
      'categories',(select jsonb_agg(jsonb_build_object('id',id,'label',label) order by label) from app_public.store_categories));
  end if;
  if op='search' then
    perform partner_private.validate_store_application_draft(d,false);
    insert into partner_private.store_application_searches(applicant_id,identity_digest,synthetic)
      values(actor,partner_private.store_application_identity(d),is_synthetic) returning store_application_searches.search_id into search_id;
    return jsonb_build_object('searchId',search_id,'matches',partner_private.store_application_matches(d,is_synthetic));
  end if;
  if op='status' then
    select * into a from partner_private.store_add_applications where applicant_id=actor and synthetic=is_synthetic
      and (p->>'applicationId' is null or application_id=(p->>'applicationId')::uuid)
      order by created_at desc limit 1;
    if not found then return null; end if;
    return partner_private.store_application_snapshot(a);
  end if;
  if op='convert' and p->>'confirmed'='true' then
    select * into a from partner_private.store_add_applications where application_id=(p->>'applicationId')::uuid
      and applicant_id=actor and synthetic=is_synthetic;
    if found and a.converted_claim_id is not null and a.matched_store_id=(p->>'storeId')::uuid and a.version=(p->>'version')::bigint+1 then
      return partner_private.store_application_snapshot(a);
    end if;
  end if;
  insert into partner_private.store_owner_intake_roots(applicant_id) values(actor) on conflict do nothing;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=actor for update;
  if exists(select 1 from app_private.role_grants where subject_user_id=actor and role='representative' and state='active') then
    raise exception using errcode='42501',message='store_application_unavailable'; end if;
  if op='start' then
    perform partner_private.validate_store_application_draft(d,false);
    draft_digest:=partner_private.store_application_identity(d);
    if not exists(select 1 from partner_private.store_application_searches s where s.search_id=(p->>'searchId')::uuid
      and applicant_id=actor and synthetic=is_synthetic and s.identity_digest=draft_digest
      and created_at>statement_timestamp()-interval '30 days') then
      raise exception using errcode='42501',message='store_application_unavailable'; end if;
    if root.active_kind='add' then
      select * into a from partner_private.store_add_applications where application_id=root.active_id and applicant_id=actor;
      if found and a.synthetic=is_synthetic then return partner_private.store_application_snapshot(a); end if;
    end if;
    if root.active_kind<>'none' then raise exception using errcode='42501',message='store_application_unavailable'; end if;
    insert into partner_private.store_add_applications(applicant_id,synthetic,area_id,normalized_identity_digest,draft)
      values(actor,is_synthetic,(d->>'areaId')::uuid,draft_digest,d) returning * into a;
    update partner_private.store_owner_intake_roots set active_kind='add',active_id=a.application_id,version=version+1 where applicant_id=actor;
  else
    select * into a from partner_private.store_add_applications where application_id=(p->>'applicationId')::uuid
      and applicant_id=actor and synthetic=is_synthetic for update;
    if found and op='convert' and p->>'confirmed'='true' and a.converted_claim_id is not null
      and a.matched_store_id=(p->>'storeId')::uuid and a.version=(p->>'version')::bigint+1 then
      return partner_private.store_application_snapshot(a);
    end if;
    if not found or root.active_kind<>'add' or root.active_id<>a.application_id
      or a.version is distinct from (p->>'version')::bigint then
      raise exception using errcode='40001',message='store_application_unavailable'; end if;
    if op='signal' and a.state in ('draft','submitted','changes_requested') then
      if p->>'channelClass' is null or p->>'evidenceHmac' is null or p->>'evidenceHmac' !~ '^[0-9a-f]{64}$' then
        raise exception using errcode='42501',message='store_application_unavailable'; end if;
      insert into partner_private.store_application_signals(application_id,channel_class,evidence_hmac)
        values(a.application_id,p->>'channelClass',decode(p->>'evidenceHmac','hex'))
        on conflict(application_id,channel_class) do update set evidence_hmac=excluded.evidence_hmac,verified_by=null,verified_at=null;
      update partner_private.store_add_applications set verified_version=null where application_id=a.application_id;
    elsif op='save' and a.state in ('draft','changes_requested') then
      perform partner_private.validate_store_application_draft(d,false);
      if (d->>'areaId')::uuid<>a.area_id then raise exception using errcode='42501',message='store_application_unavailable'; end if;
      update partner_private.store_add_applications set draft=d,normalized_identity_digest=partner_private.store_application_identity(d),
        verified_version=null,verified_at=null,provenance_digest=null where application_id=a.application_id;
      update partner_private.store_application_signals set verified_by=null,verified_at=null,verification_event_id=null where application_id=a.application_id;
    elsif op='submit' and a.state in ('draft','changes_requested') then
      perform partner_private.validate_store_application_draft(a.draft);
      if a.draft->>'ownerConfirmed' is distinct from 'true' then raise exception using errcode='42501',message='store_application_unavailable'; end if;
      matches:=partner_private.store_application_matches(a.draft,is_synthetic);
      update partner_private.store_add_applications set state=case when jsonb_array_length(matches)>0 then 'duplicate_review' else 'submitted' end,
        matched_store_id=(matches->0->>'storeId')::uuid where application_id=a.application_id;
    elsif op='withdraw' and a.state not in ('approved','rejected','withdrawn') then
      update partner_private.store_add_applications set state='withdrawn' where application_id=a.application_id;
      update partner_private.store_owner_intake_roots set active_kind='none',active_id=null,version=version+1
        where applicant_id=actor and active_kind='add' and active_id=a.application_id;
    elsif op='convert' and a.state='duplicate_review' and p->>'confirmed'='true' then
      target:=(p->>'storeId')::uuid;
      if not exists(select 1 from jsonb_array_elements(partner_private.store_application_matches(a.draft,is_synthetic)) m where m->>'storeId'=target::text) then
        raise exception using errcode='42501',message='store_application_unavailable'; end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-store:'||target,0));
      insert into partner_private.listing_claims(claimant_id,store_id,relationship,authority_statement)
        values(actor,target,'Owner or manager','Applicant confirmed duplicate conversion') returning listing_claims.claim_id into new_claim_id;
      update partner_private.listing_claims set state='submitted' where listing_claims.claim_id=new_claim_id;
      -- Reverification is conservative: carry only content-free references, never transferable approval.
      for sig in select * from partner_private.store_application_signals where application_id=a.application_id loop
        insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,evidence_ref_hmac)
          values(new_claim_id,sig.channel_class,case sig.channel_class when 'published_business_contact' then 'domain_response' when 'in_person' then 'in_person_inspection' else sig.channel_class end,sig.evidence_hmac);
      end loop;
      update partner_private.store_add_applications set state='withdrawn',draft='{}',converted_claim_id=new_claim_id,matched_store_id=target where application_id=a.application_id;
      update partner_private.store_owner_intake_roots set active_kind='claim',active_id=new_claim_id,version=version+1
        where applicant_id=actor and active_kind='add' and active_id=a.application_id;
    else raise exception using errcode='42501',message='store_application_unavailable';
    end if;
    update partner_private.store_add_applications set version=version+1,last_activity_at=statement_timestamp()
      where application_id=a.application_id returning * into a;
  end if;
  insert into partner_private.store_application_events(application_id,event_kind) values(a.application_id,op);
  return partner_private.store_application_snapshot(a);
end $$;

create function app_public.store_application_command(p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if not partner_private.store_application_enabled() then
    if p_operation='status' then return null; end if;
    raise exception using errcode='42501',message='store_application_stage_disabled';
  end if;
  begin return partner_private.store_application_command(p_operation,p_payload,false);
  exception when others then raise exception using errcode='42501',message='store_application_unavailable'; end;
end
$$;

create function partner_private.store_application_admin_command(op text,p jsonb,is_synthetic boolean) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=partner_private.require_claim_admin(); a partner_private.store_add_applications%rowtype;
  root partner_private.store_owner_intake_roots%rowtype; release_row release_private.regional_releases%rowtype;
  prior partner_private.store_application_approval_receipts%rowtype; matches jsonb; input_digest bytea;
  store_id uuid; partnership_id uuid; h jsonb; group_name app_public.verification_group;
begin
  if not is_synthetic and not partner_private.store_application_enabled() then
    raise exception using errcode='42501',message='store_application_stage_disabled'; end if;
  select * into a from partner_private.store_add_applications where application_id=(p->>'applicationId')::uuid and synthetic=is_synthetic;
  if not found or a.applicant_id=actor or a.applicant_id is null
    or (a.assigned_admin_id is not null and a.assigned_admin_id<>actor) then
    raise exception using errcode='42501',message='store_application_unavailable'; end if;
  if op='read' then
    update partner_private.store_add_applications set assigned_admin_id=actor
      where application_id=a.application_id and (assigned_admin_id is null or assigned_admin_id=actor)
      returning * into a;
    if not found then raise exception using errcode='42501',message='store_application_unavailable'; end if;
    return partner_private.store_application_snapshot(a);
  end if;
  if p->>'reasonCode' is null or p->>'reasonCode' !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode='42501',message='store_application_unavailable'; end if;
  if op='approve' then
    if p->>'idempotencyKey' is null or p->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
      raise exception using errcode='42501',message='store_application_unavailable'; end if;
    input_digest:=extensions.digest(p::text||actor::text,'sha256');
    select * into prior from partner_private.store_application_approval_receipts where idempotency_key=p->>'idempotencyKey';
    if found then
      if prior.input_digest<>input_digest or prior.application_id<>a.application_id then raise exception using errcode='42501',message='store_application_unavailable'; end if;
      return partner_private.store_application_snapshot(a);
    end if;
    -- Shared projection lock serializes publication and duplicate rechecks.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('store-application-projection',0));
    select * into prior from partner_private.store_application_approval_receipts where idempotency_key=p->>'idempotencyKey';
    if found then
      if prior.input_digest<>input_digest or prior.application_id<>a.application_id then raise exception using errcode='42501',message='store_application_unavailable'; end if;
      select * into a from partner_private.store_add_applications where application_id=prior.application_id;
      return partner_private.store_application_snapshot(a);
    end if;
    if not is_synthetic then
      select * into release_row from release_private.regional_releases where release_id=(p->>'releaseReceiptId')::uuid for update;
      if not found or release_row.state<>'active' or release_row.region_key<>'topeka-ks' or release_row.signed_release_receipt is null
        or not partner_private.store_application_enabled() then raise exception using errcode='42501',message='store_application_unavailable'; end if;
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(encode(a.normalized_identity_digest,'hex'),0));
  end if;
  select * into root from partner_private.store_owner_intake_roots where applicant_id=a.applicant_id for update;
  select * into a from partner_private.store_add_applications where application_id=a.application_id for update;
  if a.applicant_id is null or a.applicant_id=actor or (a.assigned_admin_id is not null and a.assigned_admin_id<>actor) then
    raise exception using errcode='42501',message='store_application_unavailable'; end if;
  if root.active_kind is distinct from 'add' or root.active_id is distinct from a.application_id
    or a.version is distinct from (p->>'version')::bigint then raise exception using errcode='40001',message='store_application_unavailable'; end if;
  if op='verify' and a.state in ('submitted','verification_pending') then
    if p->>'exactTopekaEligible' is distinct from 'true' or p->>'noClosureOrHold' is distinct from 'true'
      or p->>'factsConfirmed' is distinct from 'true' then
      raise exception using errcode='42501',message='store_application_unavailable'; end if;
    perform partner_private.validate_store_application_draft(a.draft);
    update partner_private.store_add_applications set state='verification_pending',assigned_admin_id=actor,
      verified_version=version+1,provenance_digest=extensions.digest(a.draft::text||actor::text,'sha256'),verified_at=statement_timestamp()
      where application_id=a.application_id;
  elsif op='verify_signal' and a.state in ('submitted','verification_pending') then
    if p->>'channelClass' is null or p->>'evidenceHmac' is null or p->>'evidenceHmac' !~ '^[0-9a-f]{64}$' or p->>'verificationEventId' is null then
      raise exception using errcode='42501',message='store_application_unavailable'; end if;
    insert into partner_private.store_application_signals(application_id,channel_class,evidence_hmac,verified_by,verified_at,verification_event_id)
      values(a.application_id,p->>'channelClass',decode(p->>'evidenceHmac','hex'),actor,statement_timestamp(),(p->>'verificationEventId')::uuid)
      on conflict(application_id,channel_class) do update set evidence_hmac=excluded.evidence_hmac,verified_by=actor,verified_at=statement_timestamp(),verification_event_id=excluded.verification_event_id;
    update partner_private.store_add_applications set assigned_admin_id=actor,verified_version=null where application_id=a.application_id;
  elsif op in ('changes','reject') and a.state not in ('approved','rejected','withdrawn') then
    update partner_private.store_add_applications set state=case op when 'changes' then 'changes_requested' else 'rejected' end,
      assigned_admin_id=actor,verified_version=null,verified_at=null where application_id=a.application_id;
    if op='reject' then update partner_private.store_owner_intake_roots set active_kind='none',active_id=null,version=version+1 where applicant_id=a.applicant_id; end if;
  elsif op='approve' and a.state='verification_pending' then
    perform partner_private.validate_store_application_draft(a.draft);
    if a.verified_version is distinct from a.version or a.verified_at<statement_timestamp()-interval '30 days'
      or a.provenance_digest is null or a.draft->>'ownerConfirmed' is distinct from 'true'
      or not partner_private.partner_consent_is_current(a.applicant_id)
      or not app_private.provider_user_has_verified_mfa(a.applicant_id)
      or not exists(select 1 from app_private.profiles where user_id=a.applicant_id and status='active' and verified_email_snapshot is not null)
      or exists(select 1 from app_private.role_grants where subject_user_id=a.applicant_id and role='representative' and state='active')
      or (select count(distinct evidence_hmac) from partner_private.store_application_signals where application_id=a.application_id
        and verified_by=actor and verified_at>statement_timestamp()-interval '30 days')<2
      or (select count(distinct verification_event_id) from partner_private.store_application_signals where application_id=a.application_id
        and verified_by=actor and verified_at>statement_timestamp()-interval '30 days')<2
      or not exists(select 1 from partner_private.store_application_signals where application_id=a.application_id and channel_class='published_business_contact'
        and verified_by=actor and verified_at>statement_timestamp()-interval '30 days')
    then raise exception using errcode='42501',message='store_application_unavailable'; end if;
    matches:=partner_private.store_application_matches(a.draft,is_synthetic);
    if jsonb_array_length(matches)>0 then
      update partner_private.store_add_applications set state='duplicate_review',matched_store_id=(matches->0->>'storeId')::uuid,
        verified_version=null where application_id=a.application_id;
    else
      store_id:=extensions.gen_random_uuid();
      insert into app_public.stores(id,synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,summary,description,phone,website)
        values(store_id,is_synthetic,case when is_synthetic then 'synthetic' else 'public' end,'active','store-'||store_id,
          btrim(a.draft->>'name'),'Topeka','KS',btrim(a.draft->>'address'),a.area_id,btrim(a.draft->>'summary'),btrim(a.draft->>'description'),nullif(a.draft->>'phone',''),nullif(a.draft->>'website',''));
      insert into app_public.store_category_assignments(store_id,category_id) values(store_id,(a.draft->>'categoryId')::uuid);
      for h in select value from jsonb_array_elements(a.draft->'hours') loop
        insert into app_public.store_weekly_hours(store_id,iso_weekday,interval_index,is_closed,opens_at,closes_at)
          values(store_id,(h->>'day')::smallint,1,(h->>'closed')::boolean,
            case when h->>'closed'='false' then (h->>'opens')::time end,case when h->>'closed'='false' then (h->>'closes')::time end);
      end loop;
      foreach group_name in array array['identity_location','contact','hours','categories_attributes']::app_public.verification_group[] loop
        insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label,verifier_kind)
          values(store_id,group_name,statement_timestamp(),'Owner confirmed; independently reviewed',case when is_synthetic then 'synthetic_fixture' else 'store_partner' end);
      end loop;
      insert into partner_private.store_partnerships(auth_user_id,store_id,intake_kind,state,started_at)
        values(a.applicant_id,store_id,'public_add','active',statement_timestamp()) returning store_partnerships.partnership_id into partnership_id;
      insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id) values(partnership_id,a.applicant_id,store_id);
      insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by) values(a.applicant_id,'representative',store_id,'active',actor);
      insert into partner_private.store_photo_tier_state(store_id,tier,source) values(store_id,'free','default');
      insert into partner_private.store_application_approval_receipts(application_id,store_id,release_id,idempotency_key,input_digest)
        values(a.application_id,store_id,release_row.release_id,p->>'idempotencyKey',input_digest);
      update partner_private.store_add_applications set state='approved',approved_store_id=store_id where application_id=a.application_id;
      update partner_private.store_owner_intake_roots set active_kind='none',active_id=null,version=version+1 where applicant_id=a.applicant_id;
    end if;
  else raise exception using errcode='42501',message='store_application_unavailable'; end if;
  update partner_private.store_add_applications set version=version+1,last_activity_at=statement_timestamp()
    where application_id=a.application_id returning * into a;
  insert into partner_private.store_application_events(application_id,event_kind) values(a.application_id,op);
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,reason_code,payload_hash,event_hash)
    values(actor,'administrator','store_application_'||op,'completed','store_application',a.application_id,p->>'reasonCode',
      extensions.digest(op||a.application_id::text||a.version::text,'sha256'),decode(repeat('00',32),'hex'));
  return partner_private.store_application_snapshot(a);
end $$;

create function app_public.store_application_admin_command(p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
begin
  if not partner_private.store_application_enabled() then raise exception using errcode='42501',message='store_application_stage_disabled'; end if;
  begin return partner_private.store_application_admin_command(p_operation,p_payload,false);
  exception when others then raise exception using errcode='42501',message='store_application_unavailable'; end;
end
$$;

create function app_public.store_application_retention() returns integer
language plpgsql volatile security definer set search_path='' as $$
declare a partner_private.store_add_applications%rowtype; purged integer:=0;
begin
  for a in select * from partner_private.store_add_applications where draft<>'{}' and
    (applicant_id is null or last_activity_at<statement_timestamp()-interval '30 days') order by applicant_id,application_id loop
    perform 1 from partner_private.store_owner_intake_roots where applicant_id=a.applicant_id for update;
    perform 1 from partner_private.store_add_applications where application_id=a.application_id for update;
    update partner_private.store_add_applications set draft='{}',
      state=case when state in ('draft','changes_requested') or (applicant_id is null and state not in ('approved','rejected','withdrawn')) then 'withdrawn' else state end
      where application_id=a.application_id and (applicant_id is null or last_activity_at<statement_timestamp()-interval '30 days')
      and (applicant_id is null or state in ('draft','changes_requested','approved','rejected','withdrawn'));
    if found then
      update partner_private.store_owner_intake_roots set active_kind='none',active_id=null,version=version+1
        where applicant_id=a.applicant_id and active_kind='add' and active_id=a.application_id;
      purged:=purged+1;
    end if;
  end loop;
  delete from partner_private.store_application_searches where created_at<statement_timestamp()-interval '30 days';
  delete from partner_private.store_application_events where created_at<statement_timestamp()-interval '3 years';
  return purged;
end $$;

alter function app_public.build_account_export_canonical_json(uuid,uuid) rename to build_account_export_before_store_applications;
revoke all on function app_public.build_account_export_before_store_applications(uuid,uuid) from public,anon,authenticated;
create function app_public.build_account_export_canonical_json(p_job_id uuid,p_claim_token uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare job app_private.account_export_jobs%rowtype; canonical jsonb;
begin
  select * into job from app_private.account_export_jobs where export_job_id=p_job_id and state='building'
    and claim_token=p_claim_token and lease_expires_at>statement_timestamp();
  if not found then raise exception using errcode='42501',message='account_export_claim_invalid'; end if;
  canonical:=app_public.build_account_export_before_store_applications(p_job_id,p_claim_token)::jsonb;
  return (canonical||jsonb_build_object('storeApplications',(select coalesce(jsonb_agg(jsonb_build_object(
    'applicationId',a.application_id,'state',a.state,'draft',a.draft,'createdAt',a.created_at,
    'storeId',a.approved_store_id,'claimId',a.converted_claim_id) order by a.created_at),'[]'::jsonb)
    from partner_private.store_add_applications a where a.applicant_id=job.user_id)))::text;
end $$;
alter function app_public.build_account_export_canonical_json(uuid,uuid) owner to identity_service;
revoke all on function app_public.build_account_export_canonical_json(uuid,uuid) from public,anon,authenticated;

create function partner_private.store_application_profile_deleted() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update partner_private.store_add_applications set applicant_id=null,draft='{}',
    state=case when state in ('approved','rejected','withdrawn') then state else 'withdrawn' end
    where applicant_id=old.user_id;
  return old;
end $$;
create trigger profile_deidentify_store_applications before delete on app_private.profiles
  for each row execute function partner_private.store_application_profile_deleted();

alter table partner_private.store_partnerships drop constraint store_partnership_public_identity_shape;
alter table partner_private.store_partnerships add constraint store_partnership_public_identity_shape check (
 (intake_kind='pilot' and pending_identity_id is not null and consent_receipt_id is not null)
 or (intake_kind in ('public_claim','public_add') and pending_identity_id is null and consent_receipt_id is null)
);

-- Explicit grants and policies keep publication rights on the narrow function owner.
grant insert on app_public.stores,app_public.store_category_assignments,app_public.store_weekly_hours,app_public.store_fact_verifications to identity_service;
do $$ declare t text; begin
 foreach t in array array['stores','store_category_assignments','store_weekly_hours','store_fact_verifications'] loop
   execute format('create policy identity_service_store_application_insert on app_public.%I for insert to identity_service with check(true)',t);
 end loop;
end $$;
grant usage on schema release_private to identity_service;
grant select on release_private.regional_releases to identity_service;
create policy identity_service_store_application_release on release_private.regional_releases for select to identity_service using(true);
grant execute on function release_private.public_capability_enabled(text),release_private.public_store_visible(uuid) to identity_service;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('partner_private','app_public') and (p.proname like 'store_application_%' or p.proname in ('normalize_store_identity','validate_store_application_draft')) loop
   execute format('alter function %s owner to identity_service',f.signature);
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function app_public.store_application_command(text,jsonb),app_public.store_application_admin_command(text,jsonb) to authenticated;
grant execute on function app_public.store_application_retention() to account_lifecycle_service;
revoke create on schema partner_private,app_public from identity_service;
revoke identity_service from postgres;
