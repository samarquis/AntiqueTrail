-- Production-facing bounded commands for Package 4 and synthetic Package 6.
-- Provider-backed email, token hashing, payload decryption, and media remain Edge-only.

grant identity_service to postgres;
grant create on schema app_public to identity_service;

create or replace function app_public.candidate_save_candidate(p_input jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id(); row candidate_private.candidate_links%rowtype;
  raw_url text:=nullif(btrim(p_input->>'url'),''); raw_note text:=coalesce(p_input->>'note','');
begin
  if actor is null or not app_private.current_session_is_active() then
    raise exception using errcode='42501',message='candidate_auth_required';
  end if;
  if jsonb_typeof(p_input)<>'object' or raw_url is null or raw_url !~* '^https?://[^[:space:]]+$'
    or char_length(raw_url)>2048 or nullif(btrim(p_input->>'title'),'') is null
    or char_length(p_input->>'title')>160 or char_length(raw_note)>2000 then
    raise exception using errcode='22023',message='candidate_input_invalid';
  end if;
  insert into candidate_private.candidate_links(
    owner_user_id,normalized_url,destination_host,title,note,provenance,extraction_state
  ) values (
    actor,raw_url,lower(split_part(regexp_replace(raw_url,'^https?://','','i'),'/',1)),
    btrim(p_input->>'title'),nullif(raw_note,''),
    jsonb_build_object('source','private_candidate','extraction',coalesce(p_input->'extraction','{}'::jsonb)),'saved'
  ) returning * into row;
  return jsonb_build_object('id',row.candidate_id,'ownerUserId',row.owner_user_id,
    'normalizedUrl',row.normalized_url,'destinationHost',row.destination_host,'title',row.title,
    'note',coalesce(row.note,''),'provenance','url','extractionState',row.extraction_state,'version',row.version);
end
$$;

create or replace function app_public.candidate_list_shares()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.share_id,'direction',case when s.sender_id=app_public.request_user_id() then 'sent' else 'received' end,
    'state',s.state,'title',c.title,'expiresAt',(extract(epoch from s.expires_at)*1000)::bigint
  ) order by s.created_at desc),'[]'::jsonb)
  from candidate_private.candidate_shares s join candidate_private.candidate_links c on c.candidate_id=s.candidate_id
  where app_private.current_session_is_active() and app_public.request_user_id() in (s.sender_id,s.recipient_id)
$$;

create or replace function app_public.candidate_get_share(p_share_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.share_id,
    'direction',case when s.sender_id=app_public.request_user_id() then 'sent' else 'received' end,
    'state',s.state,'title',c.title,'expiresAt',(extract(epoch from s.expires_at)*1000)::bigint)
  from candidate_private.candidate_shares s join candidate_private.candidate_links c on c.candidate_id=s.candidate_id
  where s.share_id=p_share_id and app_private.current_session_is_active()
    and app_public.request_user_id() in (s.sender_id,s.recipient_id)
$$;

create or replace function app_public.candidate_dismiss_share(p_share_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare row candidate_private.candidate_shares%rowtype;
begin
  update candidate_private.candidate_shares set state='closed',close_reason='dismissed',
    closed_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
  where share_id=p_share_id and recipient_id=app_public.request_user_id() and state='pending'
    and expires_at>statement_timestamp() and app_private.current_session_is_active()
  returning * into row;
  if not found then raise exception using errcode='55000',message='candidate_share_unavailable'; end if;
  return jsonb_build_object('accepted',false,'state','closed','message','Closed');
end
$$;

create or replace function app_public.candidate_list_trip_ideas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',idea_id,'ownerUserId',owner_user_id,
    'sourceShareId',source_share_id,'title',title,'urlNote',coalesce(url_note,''),'version',version)
    order by updated_at desc),'[]'::jsonb)
  from candidate_private.trip_ideas where owner_user_id=app_public.request_user_id() and app_private.current_session_is_active()
$$;

create or replace function app_public.candidate_delete_trip_idea(p_idea_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  if not app_private.current_session_is_active() then raise exception using errcode='42501',message='candidate_auth_required'; end if;
  delete from candidate_private.trip_ideas where idea_id=p_idea_id and owner_user_id=app_public.request_user_id();
  if not found then raise exception using errcode='55000',message='candidate_idea_unavailable'; end if;
end
$$;

create or replace function app_public.partner_safe_command(p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=app_public.request_user_id(); identity_row partner_private.pending_partner_identities%rowtype;
  draft_row partner_private.pilot_store_drafts%rowtype; claim_row partner_private.listing_claims%rowtype;
  store_row app_public.stores%rowtype; draft jsonb; status jsonb;
begin
  if actor is null or not app_private.current_session_is_active() or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='42501',message='partner_auth_required';
  end if;
  if p_operation not in ('get_status','save_draft','submit_draft','withdraw','submit_claim','get_claim_status','withdraw_claim') then
    raise exception using errcode='22023',message='partner_operation_denied';
  end if;
  select * into identity_row from partner_private.pending_partner_identities
    where auth_user_id=actor and state='bound' order by bound_at desc limit 1;
  if not found then raise exception using errcode='55000',message='partner_identity_unavailable'; end if;
  select * into draft_row from partner_private.pilot_store_drafts
    where pending_identity_id=identity_row.pending_identity_id order by created_at desc limit 1;

  if p_operation='save_draft' then
    draft:=p_payload->'draft';
    if jsonb_typeof(draft)<>'object' or nullif(btrim(draft->>'storeName'),'') is null
      or nullif(btrim(draft->>'address'),'') is null then
      raise exception using errcode='22023',message='partner_draft_invalid';
    end if;
    if draft_row.draft_id is null then
      insert into partner_private.pilot_store_drafts(pending_identity_id,name,address,website,description,provenance)
      values(identity_row.pending_identity_id,btrim(draft->>'storeName'),btrim(draft->>'address'),
        nullif(btrim(draft->>'website'),''),nullif(draft->>'description',''),
        jsonb_build_object('hours',coalesce(draft->>'hours',''),'source','partner_text_only')) returning * into draft_row;
    elsif draft_row.state in ('draft','changes_requested') then
      update partner_private.pilot_store_drafts set name=btrim(draft->>'storeName'),address=btrim(draft->>'address'),
        website=nullif(btrim(draft->>'website'),''),description=nullif(draft->>'description',''),
        provenance=jsonb_build_object('hours',coalesce(draft->>'hours',''),'source','partner_text_only'),
        version=version+1,updated_at=statement_timestamp() where draft_id=draft_row.draft_id returning * into draft_row;
    else raise exception using errcode='55000',message='partner_draft_state_invalid'; end if;
  elsif p_operation='submit_draft' then
    if draft_row.draft_id is null or draft_row.state not in ('draft','changes_requested') then
      raise exception using errcode='55000',message='partner_draft_state_invalid';
    end if;
    update partner_private.pilot_store_drafts set state=case when state='changes_requested' then 'resubmitted' else 'submitted' end,
      submitted_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
      where draft_id=draft_row.draft_id returning * into draft_row;
  elsif p_operation='withdraw' then
    if draft_row.draft_id is null or draft_row.state not in ('draft','submitted','changes_requested','resubmitted') then
      raise exception using errcode='55000',message='partner_draft_state_invalid';
    end if;
    update partner_private.pilot_store_drafts set state='withdrawn',version=version+1,updated_at=statement_timestamp()
      where draft_id=draft_row.draft_id returning * into draft_row;
  elsif p_operation='submit_claim' then
    select * into store_row from app_public.stores where slug=btrim(p_payload->'draft'->>'storeReference') and synthetic;
    if not found then raise exception using errcode='55000',message='partner_store_unavailable'; end if;
    insert into partner_private.listing_claims(claimant_id,store_id,state,submitted_at)
      values(actor,store_row.id,'submitted',statement_timestamp()) returning * into claim_row;
  elsif p_operation in ('get_claim_status','withdraw_claim') then
    select * into claim_row from partner_private.listing_claims where claimant_id=actor
      and (p_operation='get_claim_status' or claim_id=(p_payload->>'claimId')::uuid)
      order by created_at desc limit 1;
    if p_operation='withdraw_claim' and found and claim_row.state in ('draft','submitted','verification_pending','changes_requested','conflict') then
      update partner_private.listing_claims set state='withdrawn',version=version+1,updated_at=statement_timestamp()
        where claim_id=claim_row.claim_id returning * into claim_row;
    end if;
    if p_operation='get_claim_status' and not found then return null; end if;
    if not found then raise exception using errcode='55000',message='partner_claim_unavailable'; end if;
  end if;

  if p_operation in ('submit_claim','get_claim_status','withdraw_claim') then
    return jsonb_build_object('claimId',claim_row.claim_id,'state',claim_row.state,'riskTier',claim_row.risk_tier,
      'verifiedSignalCount',(select count(*) from partner_private.claim_authority_signals where claim_id=claim_row.claim_id and status='verified'),
      'requiredSignalCount',2,'exactStoreScope',(select slug from app_public.stores where id=claim_row.store_id));
  end if;
  status:=jsonb_build_object('invitation',(select state from partner_private.partner_invitations where invitation_id=identity_row.invitation_id),
    'pendingIdentity',identity_row.state,'onboarding',coalesce(draft_row.state,'draft'));
  return status;
end
$$;

alter function app_public.candidate_save_candidate(jsonb) owner to identity_service;
alter function app_public.candidate_list_shares() owner to identity_service;
alter function app_public.candidate_get_share(uuid) owner to identity_service;
alter function app_public.candidate_dismiss_share(uuid) owner to identity_service;
alter function app_public.candidate_list_trip_ideas() owner to identity_service;
alter function app_public.candidate_delete_trip_idea(uuid) owner to identity_service;
alter function app_public.partner_safe_command(text,jsonb) owner to identity_service;
revoke all on function app_public.candidate_save_candidate(jsonb),app_public.candidate_list_shares(),
  app_public.candidate_get_share(uuid),app_public.candidate_dismiss_share(uuid),
  app_public.candidate_list_trip_ideas(),app_public.candidate_delete_trip_idea(uuid),
  app_public.partner_safe_command(text,jsonb) from public,anon;
grant execute on function app_public.candidate_save_candidate(jsonb),app_public.candidate_list_shares(),
  app_public.candidate_get_share(uuid),app_public.candidate_dismiss_share(uuid),
  app_public.candidate_list_trip_ideas(),app_public.candidate_delete_trip_idea(uuid),
  app_public.partner_safe_command(text,jsonb) to authenticated;
revoke create on schema app_public from identity_service;
revoke identity_service from postgres;
