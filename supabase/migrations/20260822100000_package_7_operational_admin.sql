-- Package 7 operational Administrator boundary.
-- Every browser command is one exact case, scope, or merge proposal. No
-- shopper-private relation is granted to or queried by this boundary.

grant identity_service to postgres;
grant create on schema app_public,admin_private to identity_service;

alter table admin_private.admin_merge_ledgers drop constraint admin_merge_ledgers_reference_kind_check;
alter table admin_private.admin_merge_ledgers add constraint admin_merge_ledgers_reference_kind_check
  check(reference_kind in ('store','saved_store','private_memory','trip_stop','review','claim','grant','store_update','support_ticket','official_media'));
alter table admin_private.admin_merge_ledgers drop constraint admin_merge_ledgers_collision_kind_check;
alter table admin_private.admin_merge_ledgers add constraint admin_merge_ledgers_collision_kind_check
  check(collision_kind in ('none','duplicate_save','memory_conflict','trip_stop','review_conflict','claim_quarantine','grant_quarantine','update_conflict','support_conflict','media_conflict'));
alter table admin_private.admin_scope_actions drop constraint admin_scope_actions_action_check;
alter table admin_private.admin_scope_actions add constraint admin_scope_actions_action_check check(action in ('grant','revoke','regrant'));
alter table admin_private.admin_scope_actions drop constraint admin_scope_actions_expected_grant_version_check;
alter table admin_private.admin_scope_actions add constraint admin_scope_actions_expected_grant_version_check
  check(expected_grant_version>=0 and (action='grant')=(expected_grant_version=0));
alter table admin_private.admin_scope_actions drop constraint admin_scope_regrant_prerequisite;
alter table admin_private.admin_scope_actions add constraint admin_scope_regrant_prerequisite check(
  (action='regrant' and prior_grant_id is not null) or (action in ('grant','revoke') and prior_grant_id is null));

create table admin_private.admin_command_receipts(
  idempotency_key text primary key check(idempotency_key~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  actor_user_id uuid references auth.users(id) on delete set null,
  command_kind text not null check(command_kind~'^[a-z][a-z0-9_]{1,63}$'),
  resource_id uuid not null,
  input_digest bytea not null check(octet_length(input_digest)=32),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default statement_timestamp()
);

create table admin_private.admin_break_glass_gate(
  id smallint primary key default 1 check(id=1),
  required_gate text not null check(required_gate='D30_access_safety'),
  enabled boolean not null default false,
  enabled_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  expires_at timestamptz,
  version bigint not null default 1 check(version>0),
  check((not enabled and enabled_by is null and enabled_at is null and expires_at is null)
    or (enabled and enabled_by is not null and enabled_at is not null and expires_at>enabled_at and expires_at<=enabled_at+interval '30 minutes'))
);
insert into admin_private.admin_break_glass_gate(id,required_gate,enabled) values(1,'D30_access_safety',false);

alter table admin_private.admin_command_receipts enable row level security;
alter table admin_private.admin_command_receipts force row level security;
alter table admin_private.admin_break_glass_gate enable row level security;
alter table admin_private.admin_break_glass_gate force row level security;
revoke all on admin_private.admin_command_receipts,admin_private.admin_break_glass_gate from public,anon,authenticated;
grant select,insert on admin_private.admin_command_receipts to identity_service;
grant select on admin_private.admin_break_glass_gate to identity_service;
create policy identity_service_admin_command_receipts on admin_private.admin_command_receipts for all to identity_service using(true) with check(true);
create policy identity_service_admin_break_glass on admin_private.admin_break_glass_gate for select to identity_service using(true);

-- Existing catalog and M-01 authority stays behind forced RLS. These grants
-- are service-only; authenticated and anonymous roles still have none.
grant select on app_public.store_categories to identity_service;
grant select,insert,delete on app_public.store_category_assignments to identity_service;
create policy identity_service_admin_categories on app_public.store_categories for select to identity_service using(true);
create policy identity_service_admin_store_categories on app_public.store_category_assignments for all to identity_service using(true) with check(true);
grant select,update on media_private.media_uploads to identity_service;
grant insert on media_private.media_purge_jobs to identity_service;
create policy identity_service_admin_media_uploads on media_private.media_uploads for select to identity_service using(true);
create policy identity_service_admin_media_upload_update on media_private.media_uploads for update to identity_service using(true) with check(true);
create policy identity_service_admin_media_purge on media_private.media_purge_jobs for insert to identity_service with check(true);
grant execute on function app_public.media_approve_upload(uuid,integer,bigint,text),app_public.media_withdraw_upload(uuid,text) to identity_service;

create unique index one_live_admin_review_target on admin_private.admin_review_cases(case_type,target_id)
  where state in ('open','claimed','changes_requested');

create or replace function admin_private.enqueue_typed_review()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare kind text; target_kind text; target uuid; target_store uuid; digest bytea; case_id uuid;
begin
  if tg_table_schema='media_private' and tg_table_name='media_uploads' then
    if new.state<>'awaiting_review' or (tg_op='UPDATE' and old.state='awaiting_review') then return new; end if;
    kind:='image_review'; target_kind:='official_media'; target:=new.upload_id; target_store:=new.store_id;
  elsif tg_table_schema='partner_private' and tg_table_name='pilot_store_drafts' then
    if new.state not in ('submitted','resubmitted') or (tg_op='UPDATE' and old.state=new.state) then return new; end if;
    kind:='partner_onboarding'; target_kind:='pilot_store_draft'; target:=new.draft_id; target_store:=null;
  elsif tg_table_schema='partner_private' and tg_table_name='listing_claims' then
    if new.state not in ('submitted','verification_pending') or (tg_op='UPDATE' and old.state=new.state) then return new; end if;
    kind:='listing_claim'; target_kind:='listing_claim'; target:=new.claim_id; target_store:=new.store_id;
  else return new; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',kind,target,target_store,to_jsonb(new)::text),'utf8'),'sha256');
  insert into admin_private.admin_review_cases(case_type,target_kind,target_id,store_id,snapshot_hash)
    values(kind,target_kind,target,target_store,digest) on conflict do nothing returning admin_private.admin_review_cases.case_id into case_id;
  if case_id is not null then
    insert into admin_private.admin_case_events(case_id,event_kind,to_state,snapshot_hash,idempotency_key)
      values(case_id,'created','open',digest,'enqueue-'||target);
  end if;
  return new;
end $$;
alter function admin_private.enqueue_typed_review() owner to identity_service;
create trigger enqueue_m01_admin_review after insert or update on media_private.media_uploads for each row execute function admin_private.enqueue_typed_review();
create trigger enqueue_pilot_admin_review after insert or update on partner_private.pilot_store_drafts for each row execute function admin_private.enqueue_typed_review();
create trigger enqueue_claim_admin_review after insert or update on partner_private.listing_claims for each row execute function admin_private.enqueue_typed_review();

create or replace function admin_private.require_operational_admin()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or not app_private.current_session_is_active()
    or not app_private.current_user_has_role('administrator'::app_private.app_role,null)
    or not app_private.current_session_has_mfa()
    or not app_private.current_session_recent_auth(interval '10 minutes')
    or exists(select 1 from admin_private.admin_break_glass_gate where id=1 and enabled)
  then raise exception using errcode='42501',message='admin_unavailable'; end if;
  return actor;
end $$;
alter function admin_private.require_operational_admin() owner to identity_service;

create or replace function admin_private.record_operational_admin_event(kind text,actor uuid,resource uuid,digest bytea,outcome text)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  insert into app_private.privileged_audit_events(actor_user_id,actor_role,action,outcome,resource_kind,resource_id,payload_hash,event_hash)
    values(actor,'administrator','admin_'||kind,outcome,'administrator_workspace',resource,digest,decode(repeat('00',32),'hex'));
end $$;
alter function admin_private.record_operational_admin_event(text,uuid,uuid,bytea,text) owner to identity_service;

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
    select jsonb_build_object('name',d.name,'address',d.address,'phone',d.phone,'website',d.website,'description',d.description,'categoryTags',d.category_tags,'state',d.state)
      into context from partner_private.pilot_store_drafts d where d.draft_id=c.target_id;
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

create or replace function admin_private.merge_plan_json(target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('proposalId',p.proposal_id,'canonicalStoreId',p.canonical_store_id,'duplicateStoreId',p.duplicate_store_id,
    'canonicalLabel',c.name,'duplicateLabel',d.name,'safeReferences',coalesce((p.collision_summary->>'safeReferences')::integer,0),
    'quarantinedConflicts',coalesce((p.collision_summary->>'quarantinedConflicts')::integer,0),'authorityReparented',false,
    'state',p.state,'version',p.version)
  from admin_private.admin_duplicate_merge_proposals p join app_public.stores c on c.id=p.canonical_store_id join app_public.stores d on d.id=p.duplicate_store_id
  where p.proposal_id=target;
$$;
alter function admin_private.merge_plan_json(uuid) owner to identity_service;

create or replace function app_public.admin_list_review_cases()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.case_id,'caseType',c.case_type,'targetKind',c.target_kind,
      'storeLabel',coalesce(s.name,'Exact store'),'state',c.state,'version',c.version,'createdAt',c.created_at) order by c.created_at)
    from admin_private.admin_review_cases c left join app_public.stores s on s.id=c.store_id
    where c.state in ('open','claimed','changes_requested') and (c.assigned_admin_id is null or c.assigned_admin_id=actor)),'[]'::jsonb);
end $$;
alter function app_public.admin_list_review_cases() owner to identity_service;

create or replace function app_public.admin_get_review_case(p_case_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; c admin_private.admin_review_cases%rowtype; digest bytea;
begin
  begin id:=p_case_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  perform pg_advisory_xact_lock(hashtextextended('admin-case:'||id,0));
  select * into c from admin_private.admin_review_cases where case_id=id and state in ('open','claimed','changes_requested') for update;
  if not found or (c.assigned_admin_id is not null and c.assigned_admin_id<>actor) then raise exception using errcode='55000',message='admin_unavailable'; end if;
  if c.assigned_admin_id is null then
    update admin_private.admin_review_cases set assigned_admin_id=actor,state='claimed',version=version+1,updated_at=statement_timestamp() where case_id=id returning * into c;
    insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,snapshot_hash,idempotency_key)
      values(id,actor,'claimed','open','claimed',c.snapshot_hash,'claim-'||actor) on conflict do nothing;
    digest:=extensions.digest(convert_to('claim|'||id||'|'||actor,'utf8'),'sha256');
    perform admin_private.record_operational_admin_event('case_claimed',actor,id,digest,'completed');
  end if;
  return admin_private.review_case_json(id);
end $$;
alter function app_public.admin_get_review_case(text) owner to identity_service;

create or replace function app_public.admin_decide_review_case(p_case_id text,p_action text,p_reason text,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; c admin_private.admin_review_cases%rowtype; change portal_private.controlled_changes%rowtype;
  ticket portal_private.support_tickets%rowtype; media media_private.media_uploads%rowtype; draft partner_private.pilot_store_drafts%rowtype;
  claim partner_private.listing_claims%rowtype; prior admin_private.admin_command_receipts%rowtype; digest bytea; next_state text;
  value_json jsonb; result jsonb; category_slugs text[]; prior_case_state text; prior_ticket_state text;
begin
  begin id:=p_case_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
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
    update partner_private.pilot_store_drafts set state=case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end,
      reviewed_by=actor,reviewed_at=statement_timestamp(),updated_at=statement_timestamp(),version=version+1 where draft_id=draft.draft_id;
  elsif c.case_type='listing_claim' then
    select * into claim from partner_private.listing_claims where claim_id=c.target_id and store_id=c.store_id;
    if not found or claim.claimant_id=actor then raise exception using errcode='42501',message='admin_unavailable'; end if;
    perform app_public.partner_admin_claim_command(case p_action when 'approve' then 'approve' when 'return' then 'changes' else 'reject' end,
      claim.claim_id,claim.version,p_idempotency_key||'-claim','administrator_decision',null);
  else raise exception using errcode='55000',message='admin_unavailable'; end if;

  update admin_private.admin_review_cases set state=next_state,version=version+1,updated_at=statement_timestamp(),lock_owner_id=null,lock_acquired_at=null,lock_expires_at=null where case_id=id returning * into c;
  insert into admin_private.admin_case_events(case_id,actor_user_id,event_kind,from_state,to_state,reason_code,snapshot_hash,idempotency_key)
    values(id,actor,case p_action when 'approve' then 'approved' when 'return' then 'changes_requested' else 'rejected' end,prior_case_state,next_state,'administrator_decision',digest,p_idempotency_key);
  result:=jsonb_build_object('id',id,'state',next_state,'version',c.version);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result) values(p_idempotency_key,actor,'review_decision',id,digest,result);
  perform admin_private.record_operational_admin_event('review_'||p_action,actor,id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_decide_review_case(text,text,text,bigint,text) owner to identity_service;

create or replace function app_public.admin_list_store_scopes()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('grantId',g.grant_id,'subjectUserId',g.auth_user_id,
      'subjectLabel','Store representative','storeId',g.store_id,'storeLabel',s.name,'state',g.state,'version',g.version)
      order by s.name,g.granted_at desc)
    from partner_private.store_partner_grants g join app_public.stores s on s.id=g.store_id
    where g.grant_id=(select x.grant_id from partner_private.store_partner_grants x where x.auth_user_id=g.auth_user_id and x.store_id=g.store_id order by x.granted_at desc,x.grant_id desc limit 1)),'[]'::jsonb);
end $$;
alter function app_public.admin_list_store_scopes() owner to identity_service;

create or replace function app_public.admin_change_store_scope(p_operation text,p_subject_user_id text,p_store_id text,p_expected_version bigint,p_reason_code text,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); subject uuid; target_store uuid; g partner_private.store_partner_grants%rowtype;
  app_grant app_private.role_grants%rowtype; partnership partner_private.store_partnerships%rowtype; prior admin_private.admin_command_receipts%rowtype;
  digest bytea; result jsonb; prior_app_grant uuid;
begin
  begin subject:=p_subject_user_id::uuid; target_store:=p_store_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if p_operation not in ('grant','revoke','regrant') or subject=actor or p_expected_version<0 or (p_operation='grant')<>(p_expected_version=0) or p_reason_code!~'^[a-z][a-z0-9_]{1,63}$'
    or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='admin_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|',p_operation,subject,target_store,p_expected_version,p_reason_code,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.command_kind<>'scope_change' or prior.input_digest<>digest then raise exception using errcode='22023',message='admin_unavailable'; end if; return prior.result; end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-scope:'||subject||':'||target_store,0));
  select * into g from partner_private.store_partner_grants where auth_user_id=subject and store_id=target_store order by granted_at desc,grant_id desc limit 1 for update;
  if p_operation='grant' then
    if found and g.state in ('active','reconsent_required') then raise exception using errcode='40001',message='admin_unavailable'; end if;
    if not partner_private.partner_consent_is_current(subject) then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select * into partnership from partner_private.store_partnerships where auth_user_id=subject and store_id=target_store and state='active' for update;
    if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
    insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id,consent_policy_version)
      values(partnership.partnership_id,subject,target_store,partnership.consent_policy_version) returning * into g;
    insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by) values(subject,'representative',target_store,'active',actor) returning * into app_grant;
  else
    if not found or g.version<>p_expected_version then raise exception using errcode='40001',message='admin_unavailable'; end if;
  end if;
  if p_operation='revoke' then
    if g.state not in ('active','reconsent_required') then raise exception using errcode='55000',message='admin_unavailable'; end if;
    select * into app_grant from app_private.role_grants where subject_user_id=subject and role='representative' and store_id=target_store and state='active' for update;
    if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
    update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),revoked_by=actor,version=version+1 where grant_id=g.grant_id returning * into g;
    insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,revoked_by,idempotency_key)
      values(g.grant_id,subject,target_store,'administrator_revoked',actor,p_idempotency_key||'-partner');
    update app_private.role_grants set state='revoked',revoked_by=actor,revoked_at=statement_timestamp(),revocation_reason=p_reason_code,version=version+1
      where grant_id=app_grant.grant_id returning * into app_grant;
    prior_app_grant:=app_grant.grant_id;
  elsif p_operation='regrant' then
    if g.state<>'revoked' or not partner_private.partner_consent_is_current(subject) then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select * into partnership from partner_private.store_partnerships where partnership_id=g.partnership_id and auth_user_id=subject and store_id=target_store and state='active' for update;
    if not found then raise exception using errcode='42501',message='admin_unavailable'; end if;
    select grant_id into prior_app_grant from app_private.role_grants where subject_user_id=subject and role='representative' and store_id=target_store order by granted_at desc limit 1;
    insert into partner_private.store_partner_grants(partnership_id,auth_user_id,store_id,consent_policy_version)
      values(partnership.partnership_id,subject,target_store,partnership.consent_policy_version) returning * into g;
    insert into app_private.role_grants(subject_user_id,role,store_id,state,granted_by) values(subject,'representative',target_store,'active',actor) returning * into app_grant;
  end if;
  if p_operation='revoke' then select * into app_grant from app_private.role_grants where grant_id=prior_app_grant; end if;
  insert into admin_private.admin_scope_actions(grant_id,subject_user_id,role,store_id,action,prior_grant_id,expected_grant_version,scope_preview_hash,reason_code,recent_auth_at,mfa_verified_at,decided_by,outcome,idempotency_key)
    values(app_grant.grant_id,subject,'representative',target_store,p_operation,case when p_operation='regrant' then prior_app_grant else null end,p_expected_version,digest,p_reason_code,statement_timestamp(),statement_timestamp(),actor,'completed',p_idempotency_key);
  result:=jsonb_build_object('grantId',g.grant_id,'state',g.state,'version',g.version);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result)
    values(p_idempotency_key,actor,'scope_change',g.grant_id,digest,result);
  perform admin_private.record_operational_admin_event('scope_'||p_operation,actor,g.grant_id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_change_store_scope(text,text,text,bigint,text,text) owner to identity_service;

create or replace function app_public.admin_preview_duplicate_merge(p_canonical_store_id text,p_duplicate_store_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); canonical uuid; duplicate uuid; p admin_private.admin_duplicate_merge_proposals%rowtype;
  digest bytea; safe_count integer; conflict_count integer;
begin
  begin canonical:=p_canonical_store_id::uuid; duplicate:=p_duplicate_store_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if canonical=duplicate then raise exception using errcode='22023',message='admin_unavailable'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin-merge:'||canonical,0),hashtextextended('admin-merge:'||duplicate,0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin-merge:'||canonical,0),hashtextextended('admin-merge:'||duplicate,0)));
  perform 1 from app_public.stores where id in (canonical,duplicate) for update;
  if (select count(*) from app_public.stores where id in (canonical,duplicate))<>2 or exists(select 1 from admin_private.store_tombstones where merged_store_id in (canonical,duplicate) and state='active') then raise exception using errcode='55000',message='admin_unavailable'; end if;
  select * into p from admin_private.admin_duplicate_merge_proposals where canonical_store_id=canonical and duplicate_store_id=duplicate and state='previewed' order by created_at desc limit 1;
  if found then return admin_private.merge_plan_json(p.proposal_id); end if;
  safe_count:=(select count(*) from portal_private.store_updates u where u.store_id=duplicate and not exists(select 1 from portal_private.store_updates x where x.store_id=canonical and x.content_digest=u.content_digest and x.state='live'))
    +(select count(*) from portal_private.support_tickets t where t.store_id=duplicate and not exists(select 1 from portal_private.support_tickets x where x.store_id=canonical and x.opened_by=t.opened_by and x.request_digest=t.request_digest and x.state<>'resolved'));
  conflict_count:=(select count(*) from partner_private.store_partner_grants where store_id=duplicate and state in ('active','reconsent_required'))
    +(select count(*) from partner_private.listing_claims where store_id=duplicate and state='approved')
    +(select count(*) from portal_private.store_updates u where u.store_id=duplicate and exists(select 1 from portal_private.store_updates x where x.store_id=canonical and x.content_digest=u.content_digest and x.state='live'))
    +(select count(*) from portal_private.support_tickets t where t.store_id=duplicate and exists(select 1 from portal_private.support_tickets x where x.store_id=canonical and x.opened_by=t.opened_by and x.request_digest=t.request_digest and x.state<>'resolved'));
  digest:=extensions.digest(convert_to(concat_ws('|',canonical,duplicate,safe_count,conflict_count),'utf8'),'sha256');
  insert into admin_private.admin_duplicate_merge_proposals(canonical_store_id,duplicate_store_id,preview_hash,collision_summary,requested_by,expected_canonical_version,expected_duplicate_version)
    values(canonical,duplicate,digest,jsonb_build_object('safeReferences',safe_count,'quarantinedConflicts',conflict_count),actor,1,1) returning * into p;
  perform admin_private.record_operational_admin_event('merge_previewed',actor,p.proposal_id,digest,'completed');
  return admin_private.merge_plan_json(p.proposal_id);
end $$;
alter function app_public.admin_preview_duplicate_merge(text,text) owner to identity_service;

create or replace function app_public.admin_execute_duplicate_merge(p_proposal_id text,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; p admin_private.admin_duplicate_merge_proposals%rowtype; prior admin_private.admin_command_receipts%rowtype;
  digest bytea; result jsonb; u portal_private.store_updates%rowtype; t portal_private.support_tickets%rowtype; g partner_private.store_partner_grants%rowtype; cl partner_private.listing_claims%rowtype; original_publication text;
begin
  begin id:=p_proposal_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if p_expected_version<1 or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='admin_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|','execute',id,p_expected_version,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.command_kind<>'merge_execute' or prior.resource_id<>id or prior.input_digest<>digest then raise exception using errcode='22023',message='admin_unavailable'; end if; return prior.result; end if;
  select * into p from admin_private.admin_duplicate_merge_proposals where proposal_id=id;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin-merge:'||p.canonical_store_id,0),hashtextextended('admin-merge:'||p.duplicate_store_id,0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin-merge:'||p.canonical_store_id,0),hashtextextended('admin-merge:'||p.duplicate_store_id,0)));
  select * into p from admin_private.admin_duplicate_merge_proposals where proposal_id=id for update;
  perform 1 from app_public.stores where id in (p.canonical_store_id,p.duplicate_store_id) for update;
  if p.state<>'previewed' or p.version<>p_expected_version then raise exception using errcode='40001',message='admin_unavailable'; end if;
  select publication_state::text into original_publication from app_public.stores where id=p.duplicate_store_id;
  insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state,aggregate_delta)
    values(p.proposal_id,'store',p.duplicate_store_id,p.duplicate_store_id,p.canonical_store_id,'none','preserved',jsonb_build_object('publicationState',original_publication));
  for u in select * from portal_private.store_updates where store_id=p.duplicate_store_id for update loop
    if exists(select 1 from portal_private.store_updates x where x.store_id=p.canonical_store_id and x.content_digest=u.content_digest and x.state='live') then
      insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
        values(p.proposal_id,'store_update',u.update_id,p.duplicate_store_id,p.canonical_store_id,'update_conflict','quarantined');
    else
      update portal_private.store_updates set store_id=p.canonical_store_id,version=version+1,updated_at=statement_timestamp() where update_id=u.update_id;
      insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
        values(p.proposal_id,'store_update',u.update_id,p.duplicate_store_id,p.canonical_store_id,'none','reparented');
    end if;
  end loop;
  for t in select * from portal_private.support_tickets where store_id=p.duplicate_store_id for update loop
    if exists(select 1 from portal_private.support_tickets x where x.store_id=p.canonical_store_id and x.opened_by=t.opened_by and x.request_digest=t.request_digest and x.state<>'resolved') then
      insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
        values(p.proposal_id,'support_ticket',t.ticket_id,p.duplicate_store_id,p.canonical_store_id,'support_conflict','quarantined');
    else
      update portal_private.support_tickets set store_id=p.canonical_store_id,version=version+1,updated_at=statement_timestamp() where ticket_id=t.ticket_id;
      insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
        values(p.proposal_id,'support_ticket',t.ticket_id,p.duplicate_store_id,p.canonical_store_id,'none','reparented');
    end if;
  end loop;
  for g in select * from partner_private.store_partner_grants where store_id=p.duplicate_store_id and state in ('active','reconsent_required') for update loop
    update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),revoked_by=actor,version=version+1 where grant_id=g.grant_id;
    insert into partner_private.partner_access_revocations(grant_id,auth_user_id,store_id,reason_code,revoked_by,idempotency_key)
      values(g.grant_id,g.auth_user_id,g.store_id,'scope_transfer',actor,p_idempotency_key||'-grant-'||g.grant_id);
    update app_private.role_grants set state='revoked',revoked_at=statement_timestamp(),revoked_by=actor,revocation_reason='duplicate_merge',version=version+1 where subject_user_id=g.auth_user_id and role='representative' and store_id=g.store_id and state='active';
    insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
      values(p.proposal_id,'grant',g.grant_id,p.duplicate_store_id,p.canonical_store_id,'grant_quarantine','quarantined');
  end loop;
  for cl in select * from partner_private.listing_claims where store_id=p.duplicate_store_id and state='approved' for update loop
    update partner_private.listing_claims set state='revoked',revoked_at=statement_timestamp() where claim_id=cl.claim_id;
    insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state)
      values(p.proposal_id,'claim',cl.claim_id,p.duplicate_store_id,p.canonical_store_id,'claim_quarantine','quarantined');
  end loop;
  update app_public.stores set publication_state='draft',updated_at=statement_timestamp() where id=p.duplicate_store_id;
  insert into admin_private.store_tombstones(proposal_id,merged_store_id,canonical_store_id) values(p.proposal_id,p.duplicate_store_id,p.canonical_store_id);
  update admin_private.admin_duplicate_merge_proposals set state='executed',reviewed_by=actor,executed_at=statement_timestamp(),version=version+1 where proposal_id=id returning * into p;
  result:=admin_private.merge_plan_json(id);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result) values(p_idempotency_key,actor,'merge_execute',id,digest,result);
  perform admin_private.record_operational_admin_event('merge_executed',actor,id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_execute_duplicate_merge(text,bigint,text) owner to identity_service;

create or replace function app_public.admin_rollback_duplicate_merge(p_proposal_id text,p_expected_version bigint,p_idempotency_key text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=admin_private.require_operational_admin(); id uuid; p admin_private.admin_duplicate_merge_proposals%rowtype; prior admin_private.admin_command_receipts%rowtype;
  digest bytea; result jsonb; entry admin_private.admin_merge_ledgers%rowtype; original_publication app_public.publication_state;
begin
  begin id:=p_proposal_id::uuid; exception when others then raise exception using errcode='22023',message='admin_unavailable'; end;
  if p_expected_version<1 or p_idempotency_key!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then raise exception using errcode='22023',message='admin_unavailable'; end if;
  digest:=extensions.digest(convert_to(concat_ws('|','rollback',id,p_expected_version,actor),'utf8'),'sha256');
  select * into prior from admin_private.admin_command_receipts where idempotency_key=p_idempotency_key;
  if found then if prior.actor_user_id<>actor or prior.command_kind<>'merge_rollback' or prior.resource_id<>id or prior.input_digest<>digest then raise exception using errcode='22023',message='admin_unavailable'; end if; return prior.result; end if;
  select * into p from admin_private.admin_duplicate_merge_proposals where proposal_id=id;
  if not found then raise exception using errcode='55000',message='admin_unavailable'; end if;
  perform pg_advisory_xact_lock(least(hashtextextended('admin-merge:'||p.canonical_store_id,0),hashtextextended('admin-merge:'||p.duplicate_store_id,0)));
  perform pg_advisory_xact_lock(greatest(hashtextextended('admin-merge:'||p.canonical_store_id,0),hashtextextended('admin-merge:'||p.duplicate_store_id,0)));
  select * into p from admin_private.admin_duplicate_merge_proposals where proposal_id=id for update;
  if p.state<>'executed' or p.version<>p_expected_version then raise exception using errcode='40001',message='admin_unavailable'; end if;
  for entry in select * from admin_private.admin_merge_ledgers where proposal_id=id and resolution_state='reparented' order by created_at,ledger_entry_id loop
    if entry.reference_kind='store_update' then
      if exists(select 1 from portal_private.store_updates where update_id=entry.reference_id and store_id=p.canonical_store_id) then
        update portal_private.store_updates set store_id=p.duplicate_store_id,version=version+1,updated_at=statement_timestamp() where update_id=entry.reference_id;
      else raise exception using errcode='40001',message='admin_unavailable'; end if;
    elsif entry.reference_kind='support_ticket' then
      if exists(select 1 from portal_private.support_tickets where ticket_id=entry.reference_id and store_id=p.canonical_store_id) then
        update portal_private.support_tickets set store_id=p.duplicate_store_id,version=version+1,updated_at=statement_timestamp() where ticket_id=entry.reference_id;
      else raise exception using errcode='40001',message='admin_unavailable'; end if;
    end if;
    insert into admin_private.admin_merge_ledgers(proposal_id,reference_kind,reference_id,original_store_id,canonical_store_id,collision_kind,resolution_state,aggregate_delta)
      values(id,entry.reference_kind,entry.reference_id,entry.original_store_id,entry.canonical_store_id,entry.collision_kind,'rolled_back',entry.aggregate_delta);
  end loop;
  select (aggregate_delta->>'publicationState')::app_public.publication_state into original_publication from admin_private.admin_merge_ledgers where proposal_id=id and reference_kind='store' order by created_at limit 1;
  update app_public.stores set publication_state=original_publication,updated_at=statement_timestamp() where id=p.duplicate_store_id;
  update admin_private.store_tombstones set state='rolled_back',rolled_back_at=statement_timestamp() where proposal_id=id and state='active';
  -- Representative authority and approved claims intentionally remain revoked.
  update admin_private.admin_duplicate_merge_proposals set state='rolled_back',executed_at=null,rolled_back_at=statement_timestamp(),version=version+1 where proposal_id=id returning * into p;
  result:=admin_private.merge_plan_json(id);
  insert into admin_private.admin_command_receipts(idempotency_key,actor_user_id,command_kind,resource_id,input_digest,result) values(p_idempotency_key,actor,'merge_rollback',id,digest,result);
  perform admin_private.record_operational_admin_event('merge_rolled_back',actor,id,digest,'completed');
  return result;
end $$;
alter function app_public.admin_rollback_duplicate_merge(text,bigint,text) owner to identity_service;

grant execute on function app_public.partner_admin_claim_command(text,uuid,bigint,text,text,uuid) to identity_service;

revoke all on function admin_private.enqueue_typed_review(),admin_private.require_operational_admin(),admin_private.record_operational_admin_event(text,uuid,uuid,bytea,text),
  admin_private.review_case_json(uuid),admin_private.merge_plan_json(uuid) from public,anon,authenticated;
revoke all on function app_public.admin_list_review_cases(),app_public.admin_get_review_case(text),
  app_public.admin_decide_review_case(text,text,text,bigint,text),app_public.admin_list_store_scopes(),
  app_public.admin_change_store_scope(text,text,text,bigint,text,text),app_public.admin_preview_duplicate_merge(text,text),
  app_public.admin_execute_duplicate_merge(text,bigint,text),app_public.admin_rollback_duplicate_merge(text,bigint,text) from public,anon;
grant execute on function app_public.admin_list_review_cases(),app_public.admin_get_review_case(text),
  app_public.admin_decide_review_case(text,text,text,bigint,text),app_public.admin_list_store_scopes(),
  app_public.admin_change_store_scope(text,text,text,bigint,text,text),app_public.admin_preview_duplicate_merge(text,text),
  app_public.admin_execute_duplicate_merge(text,bigint,text),app_public.admin_rollback_duplicate_merge(text,bigint,text) to authenticated;

revoke create on schema app_public,admin_private from identity_service;
revoke identity_service from postgres;
