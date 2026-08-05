-- Package 9 lifecycle completion is owned by the existing constrained account
-- lifecycle worker. Browser and ordinary authenticated roles cannot run purges.

grant review_automation to postgres;

create or replace function app_public.run_due_review_lifecycle(
  p_now timestamptz,
  p_limit integer default 100
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
  finalized integer;
  restrictions integer;
  review_appeals integer;
  restriction_appeals integer;
begin
  if p_now is null or p_limit not between 1 and 100 then
    raise exception using errcode='22023',message='review_lifecycle_input_invalid';
  end if;

  finalized:=review_private.finalize_review_deletions(p_now,p_limit);

  with due as (
    select restriction_id from review_private.review_restrictions
    where state='active' and expires_at is not null and expires_at<=p_now
    order by expires_at for update skip locked limit p_limit
  )
  update review_private.review_restrictions r
    set state='expired',ended_at=p_now,version=version+1
    from due where r.restriction_id=due.restriction_id;
  get diagnostics restrictions=row_count;

  with due as (
    select appeal_id from review_private.review_appeals
    where state in ('submitted','assigned') and deadline_at<=p_now
    order by deadline_at for update skip locked limit p_limit
  )
  update review_private.review_appeals a
    set state='expired',decided_at=p_now
    from due where a.appeal_id=due.appeal_id;
  get diagnostics review_appeals=row_count;

  with due as (
    select appeal_id from review_private.restriction_appeals
    where state in ('submitted','assigned') and deadline_at<=p_now
    order by deadline_at for update skip locked limit p_limit
  )
  update review_private.restriction_appeals a
    set state='expired',decided_at=p_now
    from due where a.appeal_id=due.appeal_id;
  get diagnostics restriction_appeals=row_count;

  if finalized+restrictions+review_appeals+restriction_appeals>0 then
    perform review_private.append_audit(
      'review_lifecycle_sweep',null,null,null,'expired',
      jsonb_build_object(
        'reviewsFinalized',finalized,
        'restrictionsExpired',restrictions,
        'appealsExpired',review_appeals+restriction_appeals
      )
    );
  end if;

  return jsonb_build_object(
    'reviewsFinalized',finalized,
    'restrictionsExpired',restrictions,
    'appealsExpired',review_appeals+restriction_appeals
  );
end $$;

alter function app_public.run_due_review_lifecycle(timestamptz,integer) owner to review_automation;
revoke all on function app_public.run_due_review_lifecycle(timestamptz,integer)
  from public,anon,authenticated;
grant execute on function app_public.run_due_review_lifecycle(timestamptz,integer)
  to account_lifecycle_service;
revoke review_automation from postgres;
