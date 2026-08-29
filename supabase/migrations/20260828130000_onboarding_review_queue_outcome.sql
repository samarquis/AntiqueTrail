-- Issue #138: expose a narrow, server-authoritative onboarding decision view.
-- No evidence references, consent receipts, user IDs, or preview hashes cross this boundary.

create or replace function admin_private.review_case_json(target uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c admin_private.admin_review_cases%rowtype; context jsonb:='{}'::jsonb; actions jsonb:='["approve","return","reject"]'::jsonb; label text:='Exact store';
begin
  select * into c from admin_private.admin_review_cases where case_id=target;
  if not found then return null; end if;
  select name into label from app_public.stores where id=c.store_id;
  if c.case_type='store_change' then
    select jsonb_build_object('field',x.field,'requestedValue',x.requested_value,'reason',x.reason,'submittedAt',x.submitted_at),
      case when x.field='ownership' then '["return","reject"]'::jsonb else actions end into context,actions
    from portal_private.controlled_changes x where x.change_id=c.target_id and x.admin_case_id=c.case_id;
  elsif c.case_type='support' then
    select jsonb_build_object('category',t.category,'subject',t.subject,'body',t.body,'diagnostics',t.diagnostics,'state',t.state,'submittedAt',t.created_at)
      into context from portal_private.support_tickets t where t.ticket_id=c.target_id and t.admin_case_id=c.case_id;
  elsif c.case_type='image_review' then
    select jsonb_build_object('kind',m.kind,'altText',m.alt_text,'sourceMime',m.source_mime,'width',m.derivative_width,'height',m.derivative_height,'state',m.state)
      into context from media_private.media_uploads m where m.upload_id=c.target_id and m.store_id=c.store_id;
  elsif c.case_type='partner_onboarding' then
    select d.name,
      jsonb_build_object(
        'name',d.name,'address',d.address,'phone',d.phone,'website',d.website,
        'description',d.description,'categoryTags',d.category_tags,'state',d.state,
        'consentStatus',case when exists(
          select 1 from partner_private.pilot_consent_receipts r
          where r.pending_identity_id=d.pending_identity_id and r.auth_user_id=p.auth_user_id
        ) then 'current' else 'missing' end,
        'authorityStatus',case when (
          select count(distinct a.channel_class) from partner_private.partner_authority_checks a
          where a.draft_id=d.draft_id and a.status='verified'
        ) >= 2 and exists(
          select 1 from partner_private.partner_authority_checks a
          where a.draft_id=d.draft_id and a.status='verified' and a.channel_class='published_business_contact'
        ) then 'verified' else 'needs verification' end,
        'identityStatus',case when p.state='bound' and p.verified_email_at is not null and p.mfa_verified_at is not null
          then 'verified' else 'incomplete' end
      ) into label,context
    from partner_private.pilot_store_drafts d
    join partner_private.pending_partner_identities p on p.pending_identity_id=d.pending_identity_id
    where d.draft_id=c.target_id;
  elsif c.case_type='listing_claim' then
    select jsonb_build_object('relationship',l.relationship,'authorityStatement',l.authority_statement,'riskTier',l.risk_tier,'state',l.state)
      into context from partner_private.listing_claims l where l.claim_id=c.target_id and l.store_id=c.store_id;
  else
    actions:='["return","reject"]'::jsonb;
    context:=jsonb_build_object('targetKind',c.target_kind);
  end if;
  if context is null then raise exception using errcode='55000',message='admin_unavailable'; end if;
  return jsonb_build_object('id',c.case_id,'caseType',c.case_type,'targetKind',c.target_kind,'storeLabel',coalesce(label,'Exact store'),
    'state',c.state,'version',c.version,'createdAt',c.created_at,'immutableSubmission',true,'context',context,'allowedActions',actions,
    'audit',coalesce((select jsonb_agg(jsonb_build_object('action',e.event_kind,'outcome',coalesce(e.to_state,e.event_kind),'occurredAt',e.occurred_at) order by e.occurred_at,e.event_id)
      from admin_private.admin_case_events e where e.case_id=c.case_id),'[]'::jsonb));
end $$;
alter function admin_private.review_case_json(uuid) owner to identity_service;

create or replace function app_public.admin_list_review_cases()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((
    with assigned as (
      select c.*,s.name as store_label,
        case c.case_type
          when 'partner_onboarding' then 'onboarding'
          when 'store_change' then 'store_changes'
          when 'image_review' then 'images'
          when 'support' then 'support'
          when 'listing_claim' then 'listing_claims'
          else 'other'
        end as queue_category
      from admin_private.admin_review_cases c
      left join app_public.stores s on s.id=c.store_id
      where c.state in ('open','claimed','changes_requested') and (c.assigned_admin_id is null or c.assigned_admin_id=actor)
    ), category_counts as (
      select queue_category,count(*)::integer as assigned_count
      from assigned
      group by queue_category
    )
    select jsonb_agg(jsonb_build_object(
      'id',a.case_id,'caseType',a.case_type,'queueCategory',a.queue_category,
      'assignedCount',counts.assigned_count,'targetKind',a.target_kind,
      'storeLabel',coalesce(a.store_label,'Exact store'),'state',a.state,'version',a.version,'createdAt',a.created_at
    ) order by a.created_at)
    from assigned a join category_counts counts using(queue_category)
  ),'[]'::jsonb);
end $$;
alter function app_public.admin_list_review_cases() owner to identity_service;

create or replace function app_public.admin_decide_review_case(p_case_id text,p_action text,p_reason text,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; c admin_private.admin_review_cases%rowtype; change portal_private.controlled_changes%rowtype;
  ticket portal_private.support_tickets%rowtype; media media_private.media_uploads%rowtype; draft partner_private.pilot_store_drafts%rowtype;
  claim partner_private.listing_claims%rowtype; prior admin_private.admin_command_receipts%rowtype; digest bytea; next_state text;
  value_json jsonb; result jsonb; category_slugs text[]; prior_case_state text; prior_ticket_state text; approved_store_id uuid; onboarding_outcome jsonb;
begin
  begin id:=p_case_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  perform admin_private.enforce_operational_admin_rate(actor,id);
  if p_action not in ('approve','return','reject') or p_reason is null or p_reason<>btrim(p_reason) or char_length(p_reason) not between 1 and 1000
    or p_reason~'[[:cntrl:]]' or p_expected_version<1 or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception using errcode='22023',message='admin_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',id,p_action,p_reason,p_expected_version,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.command_kind<>'review_decision' or prior.resource_id<>id or prior.input_digest<>digest then raise exception using errcode='22023',message='admin_unavailable'; end if; return prior.result; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-case:'||id,0));
  select * into c from admin_private.admin_review_cases where case_id=id for update;
  if not found or c.assigned_admin_id<>actor or c.state not in ('claimed','changes_requested') or c.version<>p_expected_version then raise exception using errcode='40001',message='admin_unavailable'; end if;
  prior_case_state:=c.state;
  next_state:=case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end;

  if c.case_type='store_change' then
    select * into change from portal_private.controlled_changes where change_id=c.target_id and admin_case_id=c.case_id for update;
    if not found or change.requested_by=actor or change.state not in ('pending','changes_requested') then raise exception using errcode='42501',message='admin_unavailable'; end if;
    if p_action='approve' then
      if change.field='name' then update app_public.stores set name=change.requested_value,updated_at=statement_timestamp() where id=change.store_id;
      elsif change.field='address' then update app_public.stores set address=change.requested_value,updated_at=statement_timestamp() where id=change.store_id;
      elsif change.field='coordinates' then
        begin value_json:=change.requested_value::jsonb; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
        if jsonb_typeof(value_json)<>'object' or (value_json->>'latitude')::numeric not between -90 and 90 or (value_json->>'longitude')::numeric not between -180 and 180 then raise exception using errcode='22023',message='admin_unavailable'; end if;
        update app_public.stores set latitude=(value_json->>'latitude')::numeric,longitude=(value_json->>'longitude')::numeric,updated_at=statement_timestamp() where id=change.store_id;
      elsif change.field='permanent_closure' then
        if change.requested_value<>'permanently_closed' then raise exception using errcode='22023',message='admin_unavailable'; end if;
        insert into portal_private.store_profiles(store_id) values(change.store_id) on conflict do nothing;
        update portal_private.store_profiles set listing_state='permanently_closed',version=version+1,updated_at=statement_timestamp() where store_id=change.store_id;
      elsif change.field='categories' then
        begin value_json:=change.requested_value::jsonb; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
        if jsonb_typeof(value_json)<>'array' or jsonb_array_length(value_json) not between 1 and 20 then raise exception using errcode='22023',message='admin_unavailable'; end if;
        select array_agg(value order by value) into category_slugs from jsonb_array_elements_text(value_json);
        if exists(select 1 from unnest(category_slugs) x where x!~'^[a-z0-9]+(?:-[a-z0-9]+)*$') or (select count(*) from app_public.store_categories where slug=any(category_slugs))<>cardinality(category_slugs) then raise exception using errcode='22023',message='admin_unavailable'; end if;
        delete from app_public.store_category_assignments where store_id=change.store_id;
        insert into app_public.store_category_assignments(store_id,category_id) select change.store_id,category_id from app_public.store_categories where slug=any(category_slugs);
      else raise exception using errcode='55000',message='admin_unavailable'; end if;
    end if;
    update portal_private.controlled_changes set state=case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end,updated_at=statement_timestamp(),version=version+1 where change_id=change.change_id;
    update admin_private.admin_field_change_requests set state=case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end,
      reviewed_by=actor,reviewed_at=statement_timestamp(),reason_code='administrator_decision',version=version+1,updated_at=statement_timestamp() where case_id=c.case_id and target_id=change.change_id;
  elsif c.case_type='support' then
    select * into ticket from portal_private.support_tickets where ticket_id=c.target_id and admin_case_id=c.case_id for update;
    if not found or ticket.opened_by=actor or ticket.state='resolved' then raise exception using errcode='42501',message='admin_unavailable'; end if;
    prior_ticket_state:=ticket.state;
    insert into portal_private.support_replies(ticket_id,author_kind,author_user_id,body,body_digest)
      values(ticket.ticket_id,'support',actor,p_reason,extensions.digest(convert_to(p_reason,'utf8'),'sha256')) on conflict do nothing;
    update portal_private.support_tickets set state=case when p_action='return' then 'waiting_on_you' else 'resolved' end,
      resolution_note=case when p_action='return' then null else p_reason end,resolved_at=case when p_action='return' then null else statement_timestamp() end,
      updated_at=statement_timestamp(),version=version+1 where ticket_id=ticket.ticket_id returning * into ticket;
    insert into portal_private.support_events(ticket_id,actor_user_id,event_kind,from_state,to_state)
      values(ticket.ticket_id,actor,case when p_action='return' then 'waiting_on_owner' else 'resolved' end,prior_ticket_state,ticket.state);
  elsif c.case_type='image_review' then
    select * into media from media_private.media_uploads where upload_id=c.target_id and store_id=c.store_id for update;
    if not found or media.actor_user_id=actor then raise exception using errcode='42501',message='admin_unavailable'; end if;
    if p_action='approve' then perform app_public.media_approve_upload(media.upload_id,coalesce(media.display_order,0),media.version,'administrator_approved');
    elsif p_action='reject' then perform app_public.media_withdraw_upload(media.upload_id,'author_removed'); end if;
  elsif c.case_type='partner_onboarding' then
    select d.* into draft from partner_private.pilot_store_drafts d where d.draft_id=c.target_id for update;
    if not found or exists(select 1 from partner_private.pending_partner_identities p where p.pending_identity_id=draft.pending_identity_id and p.auth_user_id=actor) then raise exception using errcode='42501',message='admin_unavailable'; end if;
    if p_action='approve' then
      approved_store_id:=partner_private.approve_pilot_onboarding_exact(draft.draft_id,actor,c.snapshot_hash);
      select jsonb_build_object('pilotStoreRecordCreated',true,'storeLabel',s.name,'representativeScope',s.name||' only','unrelatedAuthorityChanged',false)
        into onboarding_outcome
      from app_public.stores s join partner_private.store_partner_grants g on g.store_id=s.id and g.state='active' and g.scope_kind='store' and g.role='representative'
      where s.id=approved_store_id;
      if onboarding_outcome is null then raise exception using errcode='55000',message='admin_unavailable'; end if;
    else
      update partner_private.pilot_store_drafts set state=case p_action when 'return' then 'changes_requested' else 'rejected' end,
        reviewed_by=actor,reviewed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where draft_id=draft.draft_id;
    end if;
  elsif c.case_type='listing_claim' then
    select * into claim from partner_private.listing_claims where claim_id=c.target_id and store_id=c.store_id;
    if not found or claim.claimant_id=actor then raise exception using errcode='42501',message='admin_unavailable'; end if;
    perform app_public.partner_admin_claim_command(case p_action when 'approve' then 'approve' when 'return' then 'changes' else 'reject' end,
      claim.claim_id,claim.version,p_idempotency_key||'-claim','administrator_decision',null);
  else raise exception using errcode='55000',message='admin_unavailable'; end if;

  update admin_private.admin_review_cases set state=next_state,version=version+1,updated_at=statement_timestamp(),lock_owner_id=null,lock_acquired_at=null,lock_expires_at=null where case_id=id returning * into c;
  insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,reason_code,snapshot_hash,idempotency_key)
    values(id,actor,case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end,prior_case_state,next_state,'administrator_decision',digest,p_idempotency_key);
  result:=jsonb_build_object('id',id,'state',next_state,'version',c.version)
    || case when onboarding_outcome is null then '{}'::jsonb else jsonb_build_object('onboardingOutcome',onboarding_outcome) end;
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result) values(p_idempotency_key,actor,'review_decision',id,digest,result);
  perform admin_private.record_operational_admin_event('review_'||p_action,actor,id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_decide_review_case(text,text,text,bigint,text) owner to identity_service;

revoke all on function admin_private.review_case_json(uuid) from public,anon,authenticated;
revoke all on function app_public.admin_list_review_cases(),app_public.admin_decide_review_case(text,text,text,bigint,text) from public,anon;
grant execute on function app_public.admin_list_review_cases(),app_public.admin_decide_review_case(text,text,text,bigint,text) to authenticated;
