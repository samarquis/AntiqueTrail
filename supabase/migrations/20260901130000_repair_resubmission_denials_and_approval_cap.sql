-- Issue #123 forward repair: denial audits must survive expected denials, and
-- moderation must use the current server-owned tier resolver rather than a
-- retired hard-coded gallery count. Historical migrations remain immutable.

-- Package 8C added the stage-aware constraint but left this earlier synthetic-
-- only constraint in force, making every real private-beta Portal store
-- impossible to persist. The current stage-aware constraint remains intact.
alter table app_public.stores drop constraint if exists stores_audience_synthetic;

grant media_automation to postgres;
grant create on schema app_public to media_automation;
set role media_automation;

create or replace function app_public.media_reserve_resubmission(
  p_original_upload_id uuid,p_alt_text text,p_idempotency_key uuid,p_rights_confirmed boolean,
  p_source_mime text,p_source_bytes bigint,p_source_width integer,p_source_height integer,p_source_digest text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  scoped_store_id uuid;
  original media_private.media_uploads%rowtype;
  existing media_private.media_uploads%rowtype;
  v_store_id uuid;
  v_kind text;
  v_source_digest bytea;
  cap_result jsonb;
  new_upload_id uuid:=extensions.gen_random_uuid();
  daily_count integer;
  concurrent_count integer;
begin
  -- The Portal helper deliberately raises for unauthenticated/no-grant callers.
  -- Catch only to write the allowed generic denial audit, then return an opaque
  -- result so that audit is not rolled back with an RPC exception.
  begin
    scoped_store_id:=portal_private.require_portal_scope();
  exception when others then
    perform media_private.append_audit('media_resubmission',actor,null,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end;

  select * into original from media_private.media_uploads where upload_id=p_original_upload_id for update;
  if not found or original.state<>'rejected' or original.purge_due_at is not null then
    perform media_private.append_audit('media_resubmission',actor,null,null,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;
  v_store_id:=original.store_id;
  v_kind:=original.kind;

  if scoped_store_id is distinct from v_store_id
    or not media_private.capability_enabled() or p_rights_confirmed is not true then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;

  if p_idempotency_key is null or p_alt_text is null or p_source_mime is null
    or p_source_bytes is null or p_source_width is null or p_source_height is null
    or p_source_digest is null or p_source_digest !~ '^[0-9a-f]{64}$' then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;
  v_source_digest:=decode(p_source_digest,'hex');

  select * into existing from media_private.media_uploads
    where actor_user_id=actor and idempotency_key=p_idempotency_key;
  if found then
    if existing.resubmission_of is distinct from p_original_upload_id
      or existing.store_id<>v_store_id or existing.kind<>v_kind
      or existing.alt_text<>p_alt_text or existing.source_mime<>p_source_mime
      or existing.source_bytes<>p_source_bytes or existing.source_width<>p_source_width
      or existing.source_height<>p_source_height
      or existing.source_digest is distinct from v_source_digest then
      perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
      return jsonb_build_object('error','media_unavailable');
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'state',existing.state,'replayed',true);
  end if;

  if v_kind not in ('cover','gallery') or p_alt_text<>btrim(p_alt_text)
    or char_length(p_alt_text) not between 1 and 240 or p_alt_text~'[[:cntrl:]]'
    or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608
    or p_source_width not between 1 and 8192 or p_source_height not between 1 and 8192
    or p_source_width::bigint*p_source_height::bigint>40000000 then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    return jsonb_build_object('error','media_unavailable');
  end if;

  cap_result:=partner_private.check_store_media_cap(v_store_id,v_kind,p_idempotency_key);
  if not coalesce((cap_result->>'allowed')::boolean,false) then
    perform media_private.append_audit('media_resubmission_capped',actor,v_store_id,p_original_upload_id,'denied');
    return jsonb_build_object('error','media_cap_exceeded',
      'message',cap_result->>'message','currentTier',cap_result->>'currentTier',
      'upgradeTier',cap_result->>'upgradeTier','upgradeCap',cap_result->>'upgradeCap',
      'approvedCount',cap_result->>'approvedCount','cap',cap_result->>'cap');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_store_id::text,0));
  select count(*) into daily_count from media_private.media_uploads
    where store_id=v_store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads
    where store_id=v_store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'blocked');
    return jsonb_build_object('error','media_unavailable');
  end if;

  insert into media_private.media_uploads(
    upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,
    source_mime,source_bytes,source_width,source_height,source_digest,original_object_key,
    private_derivative_object_key,purge_due_at,resubmission_of)
  values(
    new_upload_id,actor,v_store_id,v_kind,p_alt_text,statement_timestamp(),p_idempotency_key,
    p_source_mime,p_source_bytes,p_source_width,p_source_height,v_source_digest,
    'quarantine/'||new_upload_id::text||'/original',
    'quarantine/'||new_upload_id::text||'/derivative.webp',
    statement_timestamp()+interval '24 hours',p_original_upload_id);
  insert into media_private.media_purge_jobs(upload_id,reason_code,due_at)
    values(new_upload_id,'abandoned',statement_timestamp()+interval '24 hours');
  perform media_private.append_audit('media_resubmitted',actor,v_store_id,new_upload_id,'allowed');
  return jsonb_build_object('uploadId',new_upload_id,'state','reserved','replayed',false);
end $$;

-- The four-argument queue path is still live. Its count gate must share the
-- server resolver used by intake/resubmission; Full Gallery has no count cap.
create or replace function app_public.media_approve_upload(
  p_upload_id uuid,p_display_order integer,p_expected_version bigint,p_reason text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  u media_private.media_uploads%rowtype;
  cap_result jsonb;
begin
  if actor is null or not app_private.current_session_is_active() or not app_private.current_user_has_role('administrator'::app_private.app_role)
    or not app_private.current_session_has_mfa() or not app_private.current_session_recent_auth(interval '15 minutes')
    or p_reason!~'^[a-z][a-z0-9_]{1,63}$' or p_display_order not between 0 and 5 then
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  select * into u from media_private.media_uploads where upload_id=p_upload_id for update;
  if not found or u.state<>'awaiting_review' or u.version<>p_expected_version then
    raise exception using errcode='40001',message='media_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(u.store_id::text,0));
  cap_result:=partner_private.check_store_media_cap(u.store_id,u.kind,u.idempotency_key);
  if not coalesce((cap_result->>'allowed')::boolean,false) then
    raise exception using errcode='23505',message='media_unavailable';
  end if;
  update media_private.media_uploads set state='approved_pending_publish',approved_by=actor,approved_at=statement_timestamp(),approval_reason=p_reason,
    display_order=p_display_order,public_derivative_object_key='official/'||u.store_id::text||'/v'||u.version::text||'/'||substr(encode(u.derivative_digest,'hex'),1,32)||'.webp',updated_at=statement_timestamp(),version=version+1
    where upload_id=u.upload_id returning * into u;
  perform media_private.append_audit('media_approved',actor,u.store_id,u.upload_id,'allowed');
  return jsonb_build_object('uploadId',u.upload_id,'state',u.state,'jobId',u.upload_id,'version',u.version);
end $$;

reset role;
revoke create on schema app_public from media_automation;
revoke media_automation from postgres;
