-- Package 3 correction: Save is an idempotent desired-state command, and
-- history is sourced from memories rather than the unrelated saved-store set.

grant identity_service to postgres;
grant create on schema app_public,shopper_private to identity_service;

create or replace function shopper_private.store_is_shopper_visible(p_store_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from app_public.stores s
    where s.id=p_store_id and s.publication_state='active' and (
      (s.synthetic and s.audience='synthetic')
      or (not s.synthetic and s.audience='public'
        and release_private.public_capability_enabled('catalog'))
    )
  );
$$;
alter function shopper_private.store_is_shopper_visible(uuid) owner to identity_service;
revoke all on function shopper_private.store_is_shopper_visible(uuid) from public,anon,authenticated;

create or replace function app_public.shopper_save_state(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501',message='shopper_private_access_denied';
  end if;
  if not shopper_private.store_is_shopper_visible(p_store_id) then
    raise exception using errcode='22023',message='store_not_available';
  end if;
  return jsonb_build_object('saved',exists(
    select 1 from shopper_private.saved_stores
    where user_id=auth.uid() and store_id=p_store_id
  ));
end $$;
alter function app_public.shopper_save_state(uuid) owner to identity_service;

create or replace function app_public.shopper_set_save(p_store_id uuid,p_saved boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501',message='shopper_private_access_denied';
  end if;
  if p_saved is null or not shopper_private.store_is_shopper_visible(p_store_id) then
    raise exception using errcode='22023',message='store_not_available';
  end if;
  if p_saved then
    insert into shopper_private.saved_stores(user_id,store_id)
      values(auth.uid(),p_store_id) on conflict(user_id,store_id) do nothing;
  else
    delete from shopper_private.saved_stores
      where user_id=auth.uid() and store_id=p_store_id;
  end if;
  return jsonb_build_object('saved',p_saved);
end $$;
alter function app_public.shopper_set_save(uuid,boolean) owner to identity_service;

create or replace function app_public.shopper_list_saved()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501',message='shopper_private_access_denied';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'storeId',s.id,'slug',s.slug,'name',s.name,'savedAt',ss.created_at
    ) order by ss.created_at desc,s.name,s.id)
    from shopper_private.saved_stores ss
    join app_public.stores s on s.id=ss.store_id
    where ss.user_id=auth.uid()
      and shopper_private.store_is_shopper_visible(s.id)
  ),'[]'::jsonb);
end $$;

create or replace function app_public.shopper_list_memories()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501',message='shopper_private_access_denied';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'storeId',m.store_id,'rating',m.rating,'note',m.note,
      'lastVisitMonth',case when m.last_visit_month is null then null
        else to_char(m.last_visit_month,'YYYY-MM') end,
      'version',m.version
    ) order by coalesce(m.last_visit_month,date '0001-01-01') desc,m.updated_at desc,m.store_id)
    from shopper_private.private_store_memories m
    where m.user_id=auth.uid()
  ),'[]'::jsonb);
end $$;
alter function app_public.shopper_list_memories() owner to identity_service;

revoke all on function app_public.shopper_save_state(uuid),
  app_public.shopper_set_save(uuid,boolean),app_public.shopper_list_memories()
  from public,anon;
grant execute on function app_public.shopper_save_state(uuid),
  app_public.shopper_set_save(uuid,boolean),app_public.shopper_list_memories()
  to authenticated;

revoke create on schema app_public,shopper_private from identity_service;
revoke identity_service from postgres;
