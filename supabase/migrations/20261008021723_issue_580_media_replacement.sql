-- #580: reserve an exact approved media slot and publish with version CAS.
alter table app_public.store_media
  add column version bigint not null default 1 check(version>0);

alter table media_private.media_uploads
  add column target_media_id uuid,
  add column expected_media_version bigint,
  add constraint media_upload_replacement_shape check(
    (target_media_id is null and expected_media_version is null)
    or (target_media_id is not null and expected_media_version is not null
      and expected_media_version>0 and source_digest is not null
      and octet_length(source_digest)=32)
  );
create index media_upload_replacement_target_idx
  on media_private.media_uploads(target_media_id,expected_media_version)
  where target_media_id is not null;

grant media_automation to postgres;
grant create on schema app_public,media_private,partner_private to media_automation;
grant usage on schema auth to media_automation;
set role media_automation;

create or replace function partner_private.check_store_media_cap(
  p_store_id uuid,p_kind text,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cap integer;
  v_approved_count bigint;
  v_is_cover boolean;
  v_tier text;
  v_upgrade_tier text;
  v_upgrade_cap integer;
  v_message text;
begin
  if p_store_id is null or p_kind is null or p_kind not in ('cover','gallery') or p_idempotency_key is null then
    raise exception using errcode='22023',message='media_intake_invalid_input';
  end if;
  if auth.uid() is not null and exists(
    select 1 from media_private.media_uploads u
    where u.actor_user_id=auth.uid() and u.store_id=p_store_id
      and u.kind=p_kind and u.idempotency_key=p_idempotency_key
  ) then
    return jsonb_build_object('allowed',true,'remaining',0,'replayed',true);
  end if;

  v_is_cover := p_kind='cover';
  v_cap := partner_private.resolve_store_photo_cap(p_store_id);
  if v_is_cover then
    select
      (select count(*) from app_public.store_media sm
        where sm.store_id=p_store_id and sm.kind='cover')
      + (select count(*) from media_private.media_uploads u
        where u.store_id=p_store_id and u.kind='cover' and u.target_media_id is null
          and u.idempotency_key<>p_idempotency_key
          and u.state in ('reserved','staged','awaiting_review','approved_pending_publish'))
    into v_approved_count;
    if v_approved_count>0 then
      return jsonb_build_object('allowed',false,'error','media_replacement_required',
        'message','Select the current cover to replace it.','approvedCount',v_approved_count,'cap',1);
    end if;
    return jsonb_build_object('allowed',true,'remaining',1);
  end if;

  select
    (select count(*) from app_public.store_media sm
      where sm.store_id=p_store_id and sm.kind='gallery')
    + (select count(*) from media_private.media_uploads u
      where u.store_id=p_store_id and u.kind='gallery' and u.target_media_id is null
        and u.state='approved_pending_publish')
  into v_approved_count;
  if v_cap is null then
    return jsonb_build_object('allowed',true,'remaining',-1);
  end if;
  if v_approved_count>=v_cap then
    v_tier:=case v_cap when 5 then 'free' when 15 then 'gallery' else 'full_gallery' end;
    if v_tier='free' then
      v_upgrade_tier:='gallery'; v_upgrade_cap:=15;
      v_message:='Your Free tier (cover + 5 gallery images) is at capacity. Upgrade to Gallery (15 gallery images) or Full Gallery to continue uploading.';
    elsif v_tier='gallery' then
      v_upgrade_tier:='full_gallery'; v_upgrade_cap:=null;
      v_message:='Your Gallery tier (15 gallery images) is at capacity. Upgrade to Full Gallery for no plan-count cap.';
    else
      v_upgrade_tier:='full_gallery'; v_upgrade_cap:=null;
      v_message:='Upload limit reached. Contact support.';
    end if;
    return jsonb_build_object('allowed',false,'error','media_cap_exceeded','message',v_message,
      'currentTier',v_tier,'upgradeTier',v_upgrade_tier,'upgradeCap',v_upgrade_cap,
      'approvedCount',v_approved_count,'cap',v_cap);
  end if;
  return jsonb_build_object('allowed',true,'remaining',v_cap-v_approved_count);
end $$;

create or replace function app_public.media_reserve_upload(
  p_store_id uuid,p_kind text,p_alt_text text,p_idempotency_key uuid,p_rights_confirmed boolean,
  p_source_mime text,p_source_bytes bigint,p_source_width integer,p_source_height integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  existing media_private.media_uploads%rowtype;
  upload_id uuid:=extensions.gen_random_uuid();
  daily_count integer;
  concurrent_count integer;
  cap_result jsonb;
begin
  if actor is null or not app_private.current_session_is_active() then
    perform portal_private.log_owner_access_denial('media_reserve_session',p_store_id);
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  perform portal_private.require_owner_media_scope(p_store_id);
  if p_idempotency_key is null then
    raise exception using errcode='22023',message='media_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_idempotency_key::text,1));
  select * into existing from media_private.media_uploads
    where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if p_rights_confirmed is distinct from true
      or existing.store_id is distinct from p_store_id or existing.kind is distinct from p_kind
      or existing.alt_text is distinct from p_alt_text or existing.source_mime is distinct from p_source_mime
      or existing.source_bytes is distinct from p_source_bytes or existing.source_width is distinct from p_source_width
      or existing.source_height is distinct from p_source_height then
      raise exception using errcode='22023',message='media_unavailable';
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'originalObjectKey',existing.original_object_key,
      'derivativeObjectKey',existing.private_derivative_object_key,'state',existing.state,'replayed',true);
  end if;
  if not media_private.capability_enabled() or p_rights_confirmed is distinct from true
    or p_idempotency_key is null or p_kind is null or p_kind not in ('cover','gallery')
    or p_alt_text is null or p_source_mime is null or p_source_bytes is null
    or p_source_width is null or p_source_height is null or p_alt_text<>btrim(p_alt_text)
    or char_length(p_alt_text) not between 1 and 240 or p_alt_text~'[[:cntrl:]]'
    or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608 or p_source_width not between 1 and 8192
    or p_source_height not between 1 and 8192 or p_source_width::bigint*p_source_height::bigint>40000000
    or not exists(select 1 from partner_private.store_partner_grants g
      where g.auth_user_id=actor and g.store_id=p_store_id and g.state='active') then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'denied');
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text,0));
  cap_result:=partner_private.check_store_media_cap(p_store_id,p_kind,p_idempotency_key);
  if not coalesce((cap_result->>'allowed')::boolean,false) then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'blocked');
    raise exception using errcode='23505',message='media_unavailable';
  end if;
  select count(*) into daily_count from media_private.media_uploads
    where store_id=p_store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads
    where store_id=p_store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_reservation',actor,p_store_id,null,'blocked');
    raise exception using errcode='54000',message='media_unavailable';
  end if;
  insert into media_private.media_uploads(upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,
    idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,
    private_derivative_object_key,purge_due_at)
  values(upload_id,actor,p_store_id,p_kind,p_alt_text,statement_timestamp(),p_idempotency_key,
    p_source_mime,p_source_bytes,p_source_width,p_source_height,'quarantine/'||upload_id::text||'/original',
    'quarantine/'||upload_id::text||'/derivative.webp',statement_timestamp()+interval '24 hours');
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at)
    values(upload_id,'abandoned',statement_timestamp()+interval '24 hours');
  perform media_private.append_audit('media_reserved',actor,p_store_id,upload_id,'allowed');
  return jsonb_build_object('uploadId',upload_id,'originalObjectKey','quarantine/'||upload_id::text||'/original',
    'derivativeObjectKey','quarantine/'||upload_id::text||'/derivative.webp','state','reserved','replayed',false);
end $$;

create or replace function app_public.media_reserve_replacement(
  p_target_media_id uuid,p_expected_media_version bigint,p_alt_text text,p_idempotency_key uuid,
  p_rights_confirmed boolean,p_source_mime text,p_source_bytes bigint,p_source_width integer,
  p_source_height integer,p_source_digest bytea
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target_store uuid;
  existing media_private.media_uploads%rowtype;
  target app_public.store_media%rowtype;
  upload_id uuid:=extensions.gen_random_uuid();
  daily_count integer;
  concurrent_count integer;
begin
  if actor is null or not app_private.current_session_is_active() then
    perform portal_private.log_owner_access_denial('media_replace_session',null);
    return jsonb_build_object('error','media_unavailable');
  end if;
  if p_target_media_id is null or p_expected_media_version is null or p_expected_media_version<=0
    or p_idempotency_key is null or p_rights_confirmed is distinct from true
    or p_alt_text is null or p_source_mime is null or p_source_bytes is null
    or p_source_width is null or p_source_height is null or p_alt_text<>btrim(p_alt_text)
    or char_length(p_alt_text) not between 1 and 240 or p_alt_text~'[[:cntrl:]]'
    or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608 or p_source_width not between 1 and 8192
    or p_source_height not between 1 and 8192 or p_source_width::bigint*p_source_height::bigint>40000000
    or p_source_digest is null or octet_length(p_source_digest)<>32
    or not media_private.capability_enabled() then
    perform media_private.append_audit('media_reservation',actor,null,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_idempotency_key::text,1));
  select * into existing from media_private.media_uploads
    where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    -- require_owner_media_scope can fall through without a header or Owner role.
    begin
      perform portal_private.require_owner_media_scope(existing.store_id);
      if not exists(select 1 from portal_private.owner_stores() s where s.store_id=existing.store_id) then
        raise exception using errcode='42501',message='media_unavailable';
      end if;
    exception when insufficient_privilege then
      perform portal_private.log_owner_access_denial('owner_media_replacement_scope',existing.store_id);
      perform media_private.append_audit('media_reservation',actor,existing.store_id,existing.upload_id,'denied');
      return jsonb_build_object('error','media_unavailable');
    end;
    if existing.target_media_id is distinct from p_target_media_id
      or existing.expected_media_version is distinct from p_expected_media_version
      or existing.alt_text<>p_alt_text or existing.source_mime<>p_source_mime
      or existing.source_bytes<>p_source_bytes or existing.source_width<>p_source_width
      or existing.source_height<>p_source_height or existing.source_digest<>p_source_digest
      or existing.rights_confirmed_at is null
      or existing.state not in ('reserved','staged','awaiting_review') then
      return jsonb_build_object('error','media_unavailable');
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'state',existing.state,'replayed',true,
      'targetMediaId',existing.target_media_id,'originalObjectKey',existing.original_object_key,
      'derivativeObjectKey',existing.private_derivative_object_key);
  end if;
  select * into target from app_public.store_media where id=p_target_media_id;
  if not found then
    perform media_private.append_audit('media_reservation',actor,null,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;
  target_store:=target.store_id;
  begin
    perform portal_private.require_owner_media_scope(target_store);
    if not exists(select 1 from portal_private.owner_stores() s where s.store_id=target_store) then
      raise exception using errcode='42501',message='media_unavailable';
    end if;
  exception when insufficient_privilege then
    perform portal_private.log_owner_access_denial('owner_media_replacement_scope',target_store);
    perform media_private.append_audit('media_reservation',actor,target_store,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end;
  perform pg_advisory_xact_lock(hashtextextended(target_store::text,0));
  select * into target from app_public.store_media
    where id=p_target_media_id and store_id=target_store for update;
  if not found or target.version<>p_expected_media_version then
    perform media_private.append_audit('media_reservation',actor,target.store_id,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;
  select count(*) into daily_count from media_private.media_uploads
    where store_id=target.store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads
    where store_id=target.store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_reservation',actor,target.store_id,null,'blocked');
    return jsonb_build_object('error','media_unavailable');
  end if;
  insert into media_private.media_uploads(upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,
    idempotency_key,source_mime,source_bytes,source_width,source_height,source_digest,target_media_id,
    expected_media_version,original_object_key,private_derivative_object_key,display_order,purge_due_at)
  values(upload_id,actor,target.store_id,target.kind::text,p_alt_text,statement_timestamp(),p_idempotency_key,
    p_source_mime,p_source_bytes,p_source_width,p_source_height,p_source_digest,target.id,target.version,
    'quarantine/'||upload_id::text||'/original','quarantine/'||upload_id::text||'/derivative.webp',
    target.display_order,statement_timestamp()+interval '24 hours');
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at)
    values(upload_id,'abandoned',statement_timestamp()+interval '24 hours');
  perform media_private.append_audit('media_reserved',actor,target.store_id,upload_id,'allowed');
  return jsonb_build_object('uploadId',upload_id,'state','reserved','replayed',false,
    'targetMediaId',target.id,'originalObjectKey','quarantine/'||upload_id::text||'/original',
    'derivativeObjectKey','quarantine/'||upload_id::text||'/derivative.webp');
end $$;

reset role;
alter function partner_private.check_store_media_cap(uuid,text,uuid) owner to media_automation;
revoke all on function app_public.media_reserve_replacement(uuid,bigint,text,uuid,boolean,text,bigint,integer,integer,bytea)
  from public,anon,service_role;
grant execute on function app_public.media_reserve_replacement(uuid,bigint,text,uuid,boolean,text,bigint,integer,integer,bytea)
  to authenticated;
revoke all on function partner_private.check_store_media_cap(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function partner_private.check_store_media_cap(uuid,text,uuid) to media_automation,postgres;
revoke create on schema app_public,media_private,partner_private from media_automation;
revoke media_automation from postgres;

grant media_automation to postgres;
grant create on schema app_public,media_private to media_automation;
set role media_automation;

create or replace function app_public.media_list_awaiting_review(
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=app_public.request_user_id();
  v_result jsonb;
begin
  if not (pg_has_role(session_user,'media_moderation','member')
    or app_private.current_user_has_role('administrator',v_actor)) then
    raise exception using errcode='42501',message='moderation_access_denied';
  end if;
  if p_limit<1 or p_limit>200 or p_offset<0 then
    raise exception using errcode='22023',message='moderation_invalid_pagination';
  end if;
  select jsonb_agg(to_jsonb(r) order by r.created_at desc) into v_result from (
    select mu.upload_id,mu.store_id,s.name as store_name,s.address as store_address,mu.kind,mu.alt_text,
      mu.original_object_key,mu.private_derivative_object_key,mu.source_bytes as original_bytes,
      mu.derivative_bytes,mu.source_width,mu.source_height,mu.state,mu.created_at,mu.updated_at,
      case when mu.target_media_id is null then null else jsonb_build_object(
        'kind',target.kind,'altText',target.alt_text,'displayOrder',target.display_order,
        'expectedVersion',mu.expected_media_version,'currentVersion',target.version,
        'isCurrent',target.id is not null and target.version=mu.expected_media_version
          and target.kind::text=mu.kind
      ) end as replacement_target
    from media_private.media_uploads mu
    join app_public.stores s on s.id=mu.store_id
    left join app_public.store_media target
      on target.id=mu.target_media_id and target.store_id=mu.store_id
    where mu.state='awaiting_review'
    order by mu.created_at desc
    limit p_limit offset p_offset
  ) r;
  return coalesce(v_result,'[]'::jsonb);
end $$;

create or replace function app_public.media_approve_upload(
  p_upload_id uuid,p_display_order integer,p_expected_version bigint,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  target_store uuid;
  u media_private.media_uploads%rowtype;
  target app_public.store_media%rowtype;
  cap_result jsonb;
  approved_order integer;
begin
  if actor is null or not app_private.current_session_is_active()
    or not app_private.current_user_has_role('administrator'::app_private.app_role)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_expected_version is null or p_reason is null or p_reason!~'^[a-z][a-z0-9_]{1,63}$'
    or p_display_order is null or p_display_order<0 then
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  select store_id into target_store from media_private.media_uploads where upload_id=p_upload_id;
  if target_store is null then raise exception using errcode='40001',message='media_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_store::text,0));
  select * into u from media_private.media_uploads where upload_id=p_upload_id for update;
  if not found or u.state<>'awaiting_review' or u.version<>p_expected_version then
    raise exception using errcode='40001',message='media_unavailable';
  end if;
  if u.target_media_id is not null then
    select * into target from app_public.store_media
      where id=u.target_media_id and store_id=u.store_id for update;
    if not found or target.version<>u.expected_media_version
      or target.kind::text<>u.kind then
      raise exception using errcode='40001',message='media_unavailable';
    end if;
    approved_order:=target.display_order;
  else
    cap_result:=partner_private.check_store_media_cap(u.store_id,u.kind,u.idempotency_key);
    if not coalesce((cap_result->>'allowed')::boolean,false) then
      raise exception using errcode='23505',message='media_unavailable';
    end if;
    approved_order:=p_display_order;
  end if;
  update media_private.media_uploads set state='approved_pending_publish',approved_by=actor,
    approved_at=statement_timestamp(),approval_reason=p_reason,display_order=approved_order,
    public_derivative_object_key='official/'||u.store_id::text||'/v'||u.version::text||'/'
      ||substr(encode(u.derivative_digest,'hex'),1,32)||replace(u.upload_id::text,'-','')||'.webp',
    updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  perform media_private.append_audit('media_approved',actor,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('uploadId',u.upload_id,'state',u.state,'jobId',u.upload_id,'version',u.version);
end $$;

create or replace function media_private.complete_publish_job(
  p_job_id uuid,p_upload_id uuid,p_public_key text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  u media_private.media_uploads%rowtype;
  target_store uuid;
  target app_public.store_media%rowtype;
  media_id uuid:=extensions.gen_random_uuid();
  old_upload uuid;
  next_order integer;
begin
  select store_id into target_store from media_private.media_uploads
    where upload_id=p_upload_id and upload_id=p_job_id;
  if target_store is null then raise exception using errcode='55000',message='media_worker_unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_store::text,0));
  select * into u from media_private.media_uploads
    where upload_id=p_upload_id and upload_id=p_job_id for update;
  if not found or u.state<>'approved_pending_publish' or u.public_derivative_object_key is null
    or p_public_key is null or u.public_derivative_object_key<>p_public_key
    or u.publish_claimed_at is null then
    raise exception using errcode='55000',message='media_worker_unavailable';
  end if;

  if u.target_media_id is not null then
    select * into target from app_public.store_media
      where id=u.target_media_id and store_id=u.store_id for update;
    if not found or target.version<>u.expected_media_version or target.kind::text<>u.kind then
      update media_private.media_uploads set state='purge_pending',catalog_media_id=null,
        purge_due_at=statement_timestamp(),publish_claimed_at=null,
        updated_at=statement_timestamp(),version=version+1 where upload_id=u.upload_id returning * into u;
      insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
        values(u.upload_id,'replacement',true,true,statement_timestamp()) on conflict do nothing;
      perform media_private.append_audit('media_publish_conflict',null,u.store_id,u.upload_id,'blocked');
      return jsonb_build_object('state','conflict');
    end if;

    update app_public.store_media set asset_path='/media/'||p_public_key,alt_text=u.alt_text,
      version=version+1
      where id=u.target_media_id and store_id=u.store_id and version=u.expected_media_version;
    if not found then
      update media_private.media_uploads set state='purge_pending',catalog_media_id=null,
        purge_due_at=statement_timestamp(),publish_claimed_at=null,
        updated_at=statement_timestamp(),version=version+1 where upload_id=u.upload_id returning * into u;
      insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
        values(u.upload_id,'replacement',true,true,statement_timestamp()) on conflict do nothing;
      perform media_private.append_audit('media_publish_conflict',null,u.store_id,u.upload_id,'blocked');
      return jsonb_build_object('state','conflict');
    end if;
    for old_upload in
      select mu.upload_id from media_private.media_uploads mu
      where mu.catalog_media_id=target.id and mu.store_id=u.store_id and mu.state='published'
      for update
    loop
      update media_private.media_uploads set state='purge_pending',catalog_media_id=null,
        purge_due_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1
        where upload_id=old_upload;
      insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
        values(old_upload,'replacement',true,true,statement_timestamp()) on conflict do nothing;
    end loop;
    update media_private.media_uploads set state='published',display_order=target.display_order,
      catalog_media_id=target.id,published_at=statement_timestamp(),publish_claimed_at=null,
      updated_at=statement_timestamp(),version=version+1
      where upload_id=u.upload_id returning * into u;
  else
    if u.kind='cover' and exists(select 1 from app_public.store_media sm
      where sm.store_id=u.store_id and sm.kind='cover') then
      update media_private.media_uploads set state='purge_pending',catalog_media_id=null,
        purge_due_at=statement_timestamp(),publish_claimed_at=null,
        updated_at=statement_timestamp(),version=version+1 where upload_id=u.upload_id returning * into u;
      insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
        values(u.upload_id,'replacement',true,true,statement_timestamp()) on conflict do nothing;
      perform media_private.append_audit('media_publish_conflict',null,u.store_id,u.upload_id,'blocked');
      return jsonb_build_object('state','conflict');
    end if;
    next_order:=u.display_order;
    if next_order is null or exists(select 1 from app_public.store_media
      where store_id=u.store_id and display_order=next_order) then
      select coalesce(max(display_order)+1,0) into next_order
        from app_public.store_media where store_id=u.store_id;
    end if;
    insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order)
      values(media_id,u.store_id,'/media/'||p_public_key,u.kind::app_public.media_kind,u.alt_text,next_order);
    update media_private.media_uploads set state='published',display_order=next_order,
      catalog_media_id=media_id,published_at=statement_timestamp(),publish_claimed_at=null,
      updated_at=statement_timestamp(),version=version+1
      where upload_id=u.upload_id returning * into u;
  end if;

  insert into media_private.media_purge_jobs(upload_id,reason_code,include_private,include_public,due_at)
    values(u.upload_id,'private_after_publish',true,false,statement_timestamp()+interval '24 hours')
    on conflict do nothing;
  perform media_private.append_audit('media_published',null,u.store_id,u.upload_id,'completed');
  perform media_private.reconcile_tier_photos(u.store_id,statement_timestamp());
  return jsonb_build_object('state','published');
end $$;

reset role;
revoke create on schema app_public,media_private from media_automation;
revoke media_automation from postgres;

grant identity_service to postgres;
grant create on schema app_public to identity_service;
grant select on app_public.store_media to identity_service;
set role identity_service;

create or replace function app_public.portal_preview_public_listing()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  target uuid:=portal_private.require_portal_scope();
  s app_public.stores%rowtype;
  p portal_private.store_profiles%rowtype;
  freshness text;
  verified timestamptz;
begin
  insert into portal_private.store_profiles(store_id) values(target) on conflict do nothing;
  select * into s from app_public.stores where id=target;
  select * into p from portal_private.store_profiles where store_id=target;
  select f.freshness_state,f.oldest_verified_at into freshness,verified
    from app_public.catalog_freshness(target,statement_timestamp()) f;
  return jsonb_build_object(
    'storeName',s.name,'listingState',p.listing_state,
    'liveFields',jsonb_strip_nulls(jsonb_build_object('phone',s.phone,'website',s.website,'description',s.description)),
    'pendingChanges',coalesce((select jsonb_agg(portal_private.controlled_change_json(c.change_id) order by c.submitted_at)
      from portal_private.controlled_changes c where c.store_id=target and c.state in ('pending','changes_requested')),'[]'::jsonb),
    'freshness',jsonb_strip_nulls(jsonb_build_object(
      'state',case freshness when 'current' then 'verified' when 'overdue' then 'overdue' when 'stale' then 'stale' else 'unknown' end,
      'label',case freshness when 'current' then 'Verified' when 'overdue' then 'Verification overdue'
        when 'stale' then 'Verification required' else 'Verification date unavailable' end,'verifiedAt',verified)),
    'media',coalesce((select jsonb_agg(jsonb_build_object(
        'id',sm.id,'kind',sm.kind,'altText',sm.alt_text,'displayOrder',sm.display_order,'version',sm.version)
      order by case sm.kind when 'cover' then 0 else 1 end,sm.display_order,sm.id)
      from app_public.store_media sm where sm.store_id=target),'[]'::jsonb));
end $$;
alter function app_public.portal_preview_public_listing() owner to identity_service;

create or replace function app_public.admin_get_review_case(p_case_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=admin_private.require_operational_admin();
  id uuid;
  c admin_private.admin_review_cases%rowtype;
  digest bytea;
  result jsonb;
  upload media_private.media_uploads%rowtype;
  replacement app_public.store_media%rowtype;
begin
  begin id:=p_case_id::uuid;
  exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  perform admin_private.enforce_operational_admin_rate(actor,id);
  perform pg_advisory_xact_lock(hashtextextended('admin-case:'||id,0));
  select * into c from admin_private.admin_review_cases
    where case_id=id and state in ('open','claimed','changes_requested') for update;
  if not found or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then
    raise exception using errcode='55000',message='admin_unavailable';
  end if;
  if c.assigned_admin_id is null then
    update admin_private.admin_review_cases set assigned_admin_id=actor,state='claimed',
      version=version+1,updated_at=statement_timestamp() where case_id=id returning * into c;
    insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,snapshot_hash,idempotency_key)
      values(id,actor,'claimed','open','claimed',c.snapshot_hash,'claim-'||actor) on conflict do nothing;
    digest:=extensions.digest(convert_to('claim|'||id||'|'||actor,'utf8'),'sha256');
    perform admin_private.record_operational_admin_event('case_claimed',actor,id,digest,'completed');
  end if;
  result:=admin_private.review_case_json(id);
  if c.case_type='image_review' then
    select * into upload from media_private.media_uploads
      where upload_id=c.target_id and store_id=c.store_id;
    if found then
      if upload.target_media_id is not null then
        select * into replacement from app_public.store_media
          where id=upload.target_media_id and store_id=upload.store_id;
      end if;
      result:=jsonb_set(result,'{context}',coalesce(result->'context','{}'::jsonb)||jsonb_build_object(
        'replacementTargetId',upload.target_media_id,
        'replacementExpectedVersion',upload.expected_media_version,
        'replacementKind',replacement.kind,
        'replacementAltText',replacement.alt_text,
        'replacementDisplayOrder',replacement.display_order,
        'replacementCurrentVersion',replacement.version,
        'replacementTargetCurrent',coalesce(upload.target_media_id is not null
          and replacement.id is not null and replacement.version=upload.expected_media_version
          and replacement.kind::text=upload.kind,false)),true);
    end if;
  end if;
  return result;
end $$;
alter function app_public.admin_get_review_case(text) owner to identity_service;

reset role;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
