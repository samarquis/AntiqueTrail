-- Issue #261: expose only the current shopper's own RG-01 consent projection.

create function app_public.rg01_get_own_consent()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := app_public.request_user_id();
  collection_active boolean := coalesce(
    (select c.collection_enabled and rg01_private.release_is_active(c.release_id)
       from rg01_private.rg01_capability c
      where c.singleton_id=1),
    false
  );
  consent rg01_private.rg01_subject_consents%rowtype;
begin
  if not collection_active
     or uid is null
     or not app_private.current_session_is_active()
     or not app_private.current_user_has_role('shopper'::app_private.app_role,null)
     or not exists (
       select 1 from app_private.profiles p
        where p.user_id=uid
          and p.status='active'
          and p.age_18_attested_at is not null
     )
     or exists (
       select 1 from app_private.role_grants g
        where g.subject_user_id=uid
          and g.state='active'
          and g.role<>'shopper'
     )
  then
    return jsonb_build_object('status','unavailable','collectionActive',collection_active);
  end if;

  select * into consent
    from rg01_private.rg01_subject_consents
   where user_id=uid;

  return jsonb_build_object(
    'status','available',
    'collectionActive',true,
    'consentState',case
      when consent.subject_id is null then 'not_consented'
      when consent.withdrawn_at is null then 'consented'
      else 'withdrawn'
    end,
    'consentedAt',consent.consented_at,
    'withdrawnAt',consent.withdrawn_at
  );
end
$$;

alter function app_public.rg01_get_own_consent() owner to identity_service;
revoke all on function app_public.rg01_get_own_consent() from public,anon,authenticated;
grant execute on function app_public.rg01_get_own_consent() to authenticated;

create or replace function app_public.rg01_set_own_consent(p_consent boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := app_public.request_user_id();
begin
  if not coalesce((select c.collection_enabled and rg01_private.release_is_active(c.release_id)
                     from rg01_private.rg01_capability c
                    where c.singleton_id=1),false)
  then
    raise exception using errcode='55000',message='rg01_collection_disabled';
  end if;
  if p_consent is null
     or uid is null
     or not app_private.current_session_is_active()
     or not app_private.current_user_has_role('shopper'::app_private.app_role,null)
     or not exists (
       select 1 from app_private.profiles p
        where p.user_id=uid
          and p.status='active'
          and p.age_18_attested_at is not null
     )
     or exists (
       select 1 from app_private.role_grants g
        where g.subject_user_id=uid
          and g.state='active'
          and g.role<>'shopper'
     )
  then
    raise exception using errcode='42501',message='rg01_shopper_required';
  end if;
  if p_consent then
    insert into rg01_private.rg01_subject_consents as existing(
      user_id,consented_at,age_18_verified,nonprivileged_shopper
    ) values (uid,statement_timestamp(),true,true)
    on conflict(user_id) do update set
      consented_at=statement_timestamp(),
      withdrawn_at=null,
      age_18_verified=true,
      nonprivileged_shopper=true,
      exclusion_code=case
        when existing.exclusion_code='consent_withdrawn' then null
        else existing.exclusion_code
      end;
  else
    update rg01_private.rg01_subject_consents
       set withdrawn_at=statement_timestamp(),
           exclusion_code=coalesce(exclusion_code,'consent_withdrawn')
     where user_id=uid;
  end if;
end
$$;

alter function app_public.rg01_set_own_consent(boolean) owner to identity_service;
revoke all on function app_public.rg01_set_own_consent(boolean) from public,anon;
grant execute on function app_public.rg01_set_own_consent(boolean) to authenticated;

notify pgrst, 'reload schema';
