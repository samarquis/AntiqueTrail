-- Issue #123: forward-only rejected-media resubmission lifecycle.
--
-- A Store Portal representative resubmits a corrected image referencing the
-- rejected original upload. The store and kind are derived server-side from
-- that original; the browser never supplies store authority. The rejected
-- original row is immutable here: a distinct new row is created and linked
-- via resubmission_of. Cap authority routes exclusively through the current
-- server-owned resolve_store_photo_cap resolver.

-- 1. New nullable linkage column (forward-only; original immutability is
--    preserved because no statement in this file writes to the original row).
alter table media_private.media_uploads
  add column if not exists source_digest bytea
    check (source_digest is null or octet_length(source_digest)=32),
  add column if not exists resubmission_of uuid
    references media_private.media_uploads(upload_id) on delete set null;

-- 2. Create the resubmission reserve RPC under the media owner while the
--    migration runner has SET ROLE. It mirrors media_reserve_upload's quota,
--    idempotency, and return shape but derives store/kind from the rejected
--    original and performs the tier cap check against the current resolver.
grant media_automation to postgres;
grant create on schema app_public to media_automation;
grant usage on schema portal_private to media_automation;
set role identity_service;
grant execute on function portal_private.require_portal_scope() to media_automation;
reset role;
set role media_automation;

drop function if exists app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer);
create or replace function app_public.media_reserve_resubmission(
  p_original_upload_id uuid,
  p_alt_text text,
  p_idempotency_key uuid,
  p_rights_confirmed boolean,
  p_source_mime text,
  p_source_bytes bigint,
  p_source_width integer,
  p_source_height integer,
  p_source_digest text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id();
  original media_private.media_uploads%rowtype;
  existing media_private.media_uploads%rowtype;
  new_upload_id uuid:=extensions.gen_random_uuid();
  scoped_store_id uuid;
  v_store_id uuid;
  v_kind text;
  v_source_digest bytea;
  cap_result jsonb;
  daily_count integer;
  concurrent_count integer;
begin
  scoped_store_id:=portal_private.require_portal_scope();

  -- Lock and validate the rejected original. Any missing, purged, non-rejected,
  -- or foreign original denies without leaking existence or mutating it.
  select * into original from media_private.media_uploads where upload_id=p_original_upload_id for update;
  if not found or original.state<>'rejected' or original.purge_due_at is not null then
    perform media_private.append_audit('media_resubmission',actor,null,null,'denied');
    raise exception using errcode='42501',message='media_unavailable';
  end if;
  v_store_id:=original.store_id;
  v_kind:=original.kind;

  -- The Portal helper proves current consent, MFA, recent auth, one active,
  -- unrevoked grant, and the allowed store audience before this function sees
  -- the original. The original must belong to that exact resolved scope.
  if scoped_store_id is distinct from v_store_id
    or not media_private.capability_enabled() or not p_rights_confirmed then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    raise exception using errcode='42501',message='media_unavailable';
  end if;

  if p_source_digest is null or p_source_digest !~ '^[0-9a-f]{64}$' then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    raise exception using errcode='22023',message='media_unavailable';
  end if;
  v_source_digest:=decode(p_source_digest,'hex');

  -- Idempotency: same key/same original returns the prior receipt; reuse of a
  -- key against a different original or different input fails.
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
      raise exception using errcode='22023',message='media_unavailable';
    end if;
    return jsonb_build_object('uploadId',existing.upload_id,'state',existing.state,'replayed',true);
  end if;

  -- Input shape validation (mirrors media_reserve_upload). No file bytes cross
  -- the SQL boundary; only the inspected summary.
  if v_kind not in ('cover','gallery') or p_alt_text<>btrim(p_alt_text)
    or char_length(p_alt_text) not between 1 and 240 or p_alt_text~'[[:cntrl:]]'
    or p_source_mime not in ('image/jpeg','image/png','image/webp')
    or p_source_bytes not between 20 and 8388608
    or p_source_width not between 1 and 8192 or p_source_height not between 1 and 8192
    or p_source_width::bigint*p_source_height::bigint>40000000 then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'denied');
    raise exception using errcode='22023',message='media_unavailable';
  end if;

  -- Cap authority through the current server resolver; never a client tier,
  -- count, or upgrade target. On denial return the structured 409 payload with
  -- no row, provider, or outbox mutation.
  cap_result := partner_private.check_store_media_cap(v_store_id,v_kind,p_idempotency_key);
  if not coalesce((cap_result->>'allowed')::boolean,false) then
    perform media_private.append_audit('media_resubmission_capped',actor,v_store_id,p_original_upload_id,'denied');
    return jsonb_build_object('error','media_cap_exceeded',
      'message',cap_result->>'message',
      'currentTier',cap_result->>'currentTier',
      'upgradeTier',cap_result->>'upgradeTier',
      'upgradeCap',cap_result->>'upgradeCap',
      'approvedCount',cap_result->>'approvedCount',
      'cap',cap_result->>'cap');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_store_id::text,0));
  select count(*) into daily_count from media_private.media_uploads
    where store_id=v_store_id and created_at>=statement_timestamp()-interval '1 day';
  select count(*) into concurrent_count from media_private.media_uploads
    where store_id=v_store_id and state in ('reserved','staged','awaiting_review','approved_pending_publish');
  if daily_count>=20 or concurrent_count>=5 then
    perform media_private.append_audit('media_resubmission',actor,v_store_id,p_original_upload_id,'blocked');
    raise exception using errcode='54000',message='media_unavailable';
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

-- 3. Ownership and grants consistent with the other media automation RPCs.
alter function app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text) owner to media_automation;
comment on function app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text) is
  'Server-authoritative rejection resubmission: requires the current Portal scope, derives store/kind from the locked rejected original, checks the current-server cap and content-exact idempotency, then creates one distinct new reserved row linked via resubmission_of. Returns only an opaque upload receipt; never trusts browser scope data or mutates the original.';
revoke all on function app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function app_public.media_reserve_resubmission(uuid,text,uuid,boolean,text,bigint,integer,integer,text)
  to authenticated,media_automation;
reset role;
revoke create on schema app_public from media_automation;
revoke media_automation from postgres;
