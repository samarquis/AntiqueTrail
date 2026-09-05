-- Issue #140 follow-up: make moderation effects exact for the review's live state.

grant review_automation to postgres;
grant usage,create on schema app_public to review_automation;
grant usage on schema app_private,partner_private to review_automation;
grant select on app_private.profiles,app_private.account_deletion_requests,app_private.role_grants to review_automation;
grant select on partner_private.store_partner_grants to review_automation;
set role review_automation;

create or replace function app_public.reviews_moderate(
  p_case_id uuid,p_action text,p_reason text,p_expected_version bigint,p_idempotency_key text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  actor uuid:=review_private.require_review_admin();
  c review_private.moderation_cases%rowtype;
  r review_private.public_reviews%rowtype;
  prior review_private.moderation_command_receipts%rowtype;
  next_case text; next_review text; digest bytea; response jsonb;
begin
  if p_action not in ('hold','remove','restore','dismiss_report')
    or nullif(btrim(p_reason),'') is null or char_length(p_reason)>1000
    or p_expected_version<1
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception using errcode='22023',message='review_moderation_input_invalid';
  end if;
  digest:=extensions.digest(convert_to(concat_ws('|',actor,p_case_id,p_action,btrim(p_reason),p_expected_version),'utf8'),'sha256');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
  select * into prior from review_private.moderation_command_receipts where idempotency_key=p_idempotency_key;
  if found then
    if prior.actor_user_id<>actor or prior.case_id<>p_case_id or prior.input_digest<>digest then
      raise exception using errcode='22023',message='review_moderation_idempotency_reused';
    end if;
    return prior.result;
  end if;
  select * into c from review_private.moderation_cases where case_id=p_case_id for update;
  if not found or c.assigned_admin_id<>actor or c.version<>p_expected_version
    or c.state not in ('open','held','removed') then
    raise exception using errcode='42501',message='review_moderation_denied';
  end if;
  select * into r from review_private.public_reviews where review_id=c.review_id for update;
  if not found
    or (p_action='hold' and r.state<>'published')
    or (p_action='remove' and r.state not in ('published','held'))
    or (p_action='restore' and r.state not in ('held','removed')) then
    raise exception using errcode='42501',message='review_moderation_denied';
  end if;
  if p_action='restore' and (
    r.author_id is null
    or not review_private.review_stage_allowed(r.store_id)
    or not exists(select 1 from app_private.profiles p where p.user_id=r.author_id and p.status='active'
      and p.verified_email_snapshot is not null and p.age_18_attested_at is not null)
    or exists(select 1 from app_private.account_deletion_requests d where d.user_id=r.author_id and d.state='scheduled')
    or exists(select 1 from app_private.role_grants g where g.subject_user_id=r.author_id and g.role='representative'
      and g.store_id=r.store_id and g.state='active')
    or exists(select 1 from partner_private.store_partner_grants g where g.auth_user_id=r.author_id
      and g.store_id=r.store_id and g.state='active')
    or exists(select 1 from review_private.review_restrictions x where x.subject_user_id=r.author_id
      and x.store_id=r.store_id and x.state='active' and x.level<>'notice_only'
      and (x.expires_at is null or x.expires_at>statement_timestamp()))
  ) then
    raise exception using errcode='42501',message='review_restore_ineligible';
  end if;
  if p_action='hold' then next_case:='held'; next_review:='held';
  elsif p_action='remove' then next_case:='removed'; next_review:='removed';
  elsif p_action='restore' then next_case:='restored'; next_review:='published';
  else next_case:='dismissed'; next_review:=r.state; end if;
  if p_action<>'dismiss_report' then
    update review_private.public_reviews set state=next_review,updated_at=statement_timestamp(),version=version+1
      where review_id=r.review_id returning * into r;
  end if;
  update review_private.moderation_cases set state=next_case,original_moderator_id=coalesce(original_moderator_id,actor),
    decided_at=statement_timestamp(),closed_at=case when next_case in ('restored','dismissed') then statement_timestamp() end,
    updated_at=statement_timestamp(),version=version+1 where case_id=c.case_id returning * into c;
  insert into review_private.moderation_case_evidence(case_id,evidence_kind,evidence_value,source_digest)
    values(c.case_id,'prior_decision',p_action,extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'));
  if p_action<>'dismiss_report' then
    perform review_private.rebuild_rating_aggregate(r.store_id);
    perform review_private.sync_public_projection(r.review_id);
  end if;
  perform review_private.append_audit('review_moderated',actor,r.review_id,c.case_id,'allowed',jsonb_build_object('action',p_action,'reasonDigest',encode(extensions.digest(convert_to(btrim(p_reason),'utf8'),'sha256'),'hex')));
  response:=jsonb_build_object('id',c.case_id,'version',c.version,'reviewId',c.review_id,'storeId',c.store_id,'state',c.state,'reasonCode',c.reason_code,
    'evidence','[]'::jsonb,'openedAt',c.opened_at,'updatedAt',c.updated_at);
  insert into review_private.moderation_command_receipts(idempotency_key,actor_user_id,case_id,input_digest,result)
    values(p_idempotency_key,actor,c.case_id,digest,response);
  return response;
end $$;

reset role;
revoke create on schema app_public from review_automation;
revoke review_automation from postgres;
