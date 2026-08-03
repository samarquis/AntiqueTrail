-- Package 3 authenticated RPC boundary.
-- Every shopper identity is derived from auth.uid(); callers cannot select an owner.

grant identity_service to postgres;
grant create on schema app_public to identity_service;
grant create on schema shopper_private to identity_service;
grant usage on schema app_public to identity_service;
grant select on app_public.catalog_areas, app_public.stores to identity_service;

create policy identity_service_catalog_areas on app_public.catalog_areas
  for select to identity_service using (true);
create policy identity_service_catalog_stores on app_public.stores
  for select to identity_service
  using (synthetic and audience='synthetic' and publication_state='active');

grant update, delete on shopper_private.saved_stores to identity_service;
grant update, delete on shopper_private.private_store_memories to identity_service;
grant update, delete on shopper_private.catalog_last_seen to identity_service;
grant update, delete on shopper_private.catalog_new_dismissals to identity_service;

create table shopper_private.private_memory_deletions (
  undo_token uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references app_public.stores(id) on delete restrict,
  rating smallint,
  note text,
  last_visit_month date,
  source_version bigint not null,
  state text not null default 'pending' check (state in ('pending','restored','purged')),
  created_at timestamptz not null default statement_timestamp(),
  undo_until timestamptz not null default statement_timestamp() + interval '5 minutes',
  purge_due_at timestamptz not null default statement_timestamp() + interval '24 hours',
  restored_at timestamptz,
  constraint private_memory_deletion_timing check (
    undo_until > created_at and purge_due_at >= undo_until and purge_due_at <= created_at + interval '24 hours'
  ),
  constraint private_memory_deletion_restore_shape check (
    (state='restored' and restored_at is not null) or (state<>'restored' and restored_at is null)
  )
);
create unique index one_pending_private_memory_deletion
  on shopper_private.private_memory_deletions(user_id,store_id) where state='pending';
alter table shopper_private.private_memory_deletions enable row level security;
alter table shopper_private.private_memory_deletions force row level security;
revoke all on shopper_private.private_memory_deletions from public, anon, authenticated;
grant select, insert, update, delete on shopper_private.private_memory_deletions to identity_service;
create policy identity_service_private_memory_deletions
  on shopper_private.private_memory_deletions for all to identity_service
  using (true) with check (true);

create or replace function shopper_private.current_user_can_use_shopper_private()
returns boolean language sql stable security definer
set search_path = '' as $$
  select app_private.current_session_is_active()
    and app_private.current_user_has_role('shopper'::app_private.app_role,null);
$$;
alter function shopper_private.current_user_can_use_shopper_private() owner to identity_service;
revoke all on function shopper_private.current_user_can_use_shopper_private() from public, anon, authenticated;

create or replace function app_public.shopper_list_saved()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'storeId',s.id,'slug',s.slug,'name',s.name,'savedAt',ss.created_at
    ) order by ss.created_at desc,s.name,s.id)
    from shopper_private.saved_stores ss
    join app_public.stores s on s.id=ss.store_id
    where ss.user_id=auth.uid()
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ),'[]'::jsonb);
end; $$;

create or replace function app_public.shopper_toggle_save(p_store_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare now_saved boolean;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  delete from shopper_private.saved_stores
    where user_id=auth.uid() and store_id=p_store_id;
  if found then
    now_saved := false;
  else
    insert into shopper_private.saved_stores(user_id,store_id) values(auth.uid(),p_store_id);
    now_saved := true;
  end if;
  return jsonb_build_object('saved',now_saved);
end; $$;

create or replace function app_public.shopper_get_memory(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  select jsonb_build_object(
    'storeId',m.store_id,'rating',m.rating,'note',m.note,
    'lastVisitMonth',case when m.last_visit_month is null then null else to_char(m.last_visit_month,'YYYY-MM') end,
    'version',m.version
  ) into result
  from shopper_private.private_store_memories m
  where m.user_id=auth.uid() and m.store_id=p_store_id;
  return result;
end; $$;

create or replace function app_public.shopper_upsert_memory(
  p_store_id uuid,
  p_rating smallint default null,
  p_note text default null,
  p_last_visit_month date default null,
  p_expected_version bigint default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare current_version bigint; result shopper_private.private_store_memories%rowtype;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  select m.version into current_version
    from shopper_private.private_store_memories m
    where m.user_id=auth.uid() and m.store_id=p_store_id for update;
  if current_version is null then
    if p_expected_version is not null and p_expected_version<>0 then
      raise exception using errcode='40001', message='private_memory_version_conflict';
    end if;
    insert into shopper_private.private_store_memories(
      user_id,store_id,rating,note,last_visit_month,version
    ) values(
      auth.uid(),p_store_id,p_rating,nullif(btrim(p_note),''),p_last_visit_month,1
    ) returning * into result;
  else
    if p_expected_version is null or p_expected_version<>current_version then
      raise exception using errcode='40001', message='private_memory_version_conflict';
    end if;
    update shopper_private.private_store_memories set
      rating=p_rating,note=nullif(btrim(p_note),''),last_visit_month=p_last_visit_month,
      version=version+1,updated_at=statement_timestamp()
      where user_id=auth.uid() and store_id=p_store_id
      returning * into result;
  end if;
  return jsonb_build_object(
    'storeId',result.store_id,'rating',result.rating,'note',result.note,
    'lastVisitMonth',case when result.last_visit_month is null then null else to_char(result.last_visit_month,'YYYY-MM') end,
    'version',result.version
  );
end; $$;

create or replace function app_public.shopper_delete_memory(p_store_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare memory shopper_private.private_store_memories%rowtype;
declare deletion shopper_private.private_memory_deletions%rowtype;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  select * into deletion from shopper_private.private_memory_deletions
    where user_id=auth.uid() and store_id=p_store_id and state='pending' for update;
  if found then
    return jsonb_build_object('undoToken',deletion.undo_token,'undoUntil',deletion.undo_until);
  end if;
  select * into memory from shopper_private.private_store_memories
    where user_id=auth.uid() and store_id=p_store_id for update;
  if not found then raise exception using errcode='P0002', message='private_memory_not_found'; end if;
  insert into shopper_private.private_memory_deletions(
    user_id,store_id,rating,note,last_visit_month,source_version
  ) values(
    auth.uid(),p_store_id,memory.rating,memory.note,memory.last_visit_month,memory.version
  ) returning * into deletion;
  delete from shopper_private.private_store_memories
    where user_id=auth.uid() and store_id=p_store_id;
  return jsonb_build_object('undoToken',deletion.undo_token,'undoUntil',deletion.undo_until);
end; $$;

create or replace function app_public.shopper_undo_delete_memory(p_store_id uuid,p_undo_token uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare deletion shopper_private.private_memory_deletions%rowtype;
declare memory shopper_private.private_store_memories%rowtype;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  select * into deletion from shopper_private.private_memory_deletions
    where undo_token=p_undo_token and user_id=auth.uid() and store_id=p_store_id for update;
  if not found then raise exception using errcode='P0002', message='private_memory_undo_not_found'; end if;
  if deletion.state='restored' then
    select * into memory from shopper_private.private_store_memories
      where user_id=auth.uid() and store_id=p_store_id;
  elsif deletion.state<>'pending' or deletion.undo_until<=statement_timestamp() then
    raise exception using errcode='22023', message='private_memory_undo_expired';
  else
    if exists(select 1 from shopper_private.private_store_memories m where m.user_id=auth.uid() and m.store_id=p_store_id) then
      raise exception using errcode='40001', message='private_memory_version_conflict';
    end if;
    insert into shopper_private.private_store_memories(
      user_id,store_id,rating,note,last_visit_month,version
    ) values(
      auth.uid(),p_store_id,deletion.rating,deletion.note,deletion.last_visit_month,deletion.source_version+1
    ) returning * into memory;
    update shopper_private.private_memory_deletions
      set state='restored',restored_at=statement_timestamp() where undo_token=p_undo_token;
  end if;
  return jsonb_build_object(
    'storeId',memory.store_id,'rating',memory.rating,'note',memory.note,
    'lastVisitMonth',case when memory.last_visit_month is null then null else to_char(memory.last_visit_month,'YYYY-MM') end,
    'version',memory.version
  );
end; $$;

create or replace function app_public.shopper_list_catalog_areas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id',a.id,'slug',a.slug,'label',a.label) order by a.sort_order,a.label,a.id)
    from app_public.catalog_areas a
    where exists(select 1 from app_public.stores s where s.area_id=a.id and s.synthetic and s.audience='synthetic' and s.publication_state='active')
  ),'[]'::jsonb);
end; $$;

create or replace function app_public.shopper_get_new_since(p_area_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare area_row app_public.catalog_areas%rowtype; last_seen_at timestamptz; stores jsonb;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  select * into area_row from app_public.catalog_areas a where a.id=p_area_id;
  if not found then raise exception using errcode='22023', message='catalog_area_not_found'; end if;
  select l.seen_at into last_seen_at from shopper_private.catalog_last_seen l
    where l.user_id=auth.uid() and l.area_id=p_area_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'storeId',s.id,'slug',s.slug,'name',s.name,'addedAt',s.created_at
  ) order by s.created_at desc,s.name,s.id),'[]'::jsonb) into stores
  from app_public.stores s
  where s.area_id=p_area_id and s.synthetic and s.audience='synthetic' and s.publication_state='active'
    and s.created_at>coalesce(last_seen_at,statement_timestamp()-interval '30 days')
    and not exists(
      select 1 from shopper_private.catalog_new_dismissals d
      where d.user_id=auth.uid() and d.store_id=s.id
        and d.dismissed_at>statement_timestamp()-interval '30 days'
    );
  return jsonb_build_object(
    'area',jsonb_build_object('id',area_row.id,'slug',area_row.slug,'label',area_row.label),
    'lastSeenAt',last_seen_at,'stores',stores
  );
end; $$;

create or replace function app_public.shopper_mark_catalog_seen(p_area_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare seen timestamptz := statement_timestamp();
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(select 1 from app_public.catalog_areas a where a.id=p_area_id) then
    raise exception using errcode='22023', message='catalog_area_not_found';
  end if;
  insert into shopper_private.catalog_last_seen(user_id,area_id,seen_at)
    values(auth.uid(),p_area_id,seen)
    on conflict(user_id,area_id) do update set seen_at=excluded.seen_at;
  return jsonb_build_object('seenAt',seen);
end; $$;

create or replace function app_public.shopper_dismiss_new_store(p_store_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  insert into shopper_private.catalog_new_dismissals(user_id,store_id,dismissed_at)
    values(auth.uid(),p_store_id,statement_timestamp())
    on conflict(user_id,store_id) do update set dismissed_at=excluded.dismissed_at;
end; $$;

create or replace function app_public.shopper_submit_correction(
  p_store_id uuid,p_type text,p_description text,p_public_source_url text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare report shopper_private.store_correction_reports%rowtype;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  if not exists(
    select 1 from app_public.stores s where s.id=p_store_id
      and s.synthetic and s.audience='synthetic' and s.publication_state='active'
  ) then raise exception using errcode='22023', message='store_not_available'; end if;
  insert into shopper_private.store_correction_reports(
    reporter_user_id,store_id,correction_type,description,public_source_url
  ) values(
    auth.uid(),p_store_id,p_type,btrim(p_description),nullif(btrim(p_public_source_url),'')
  ) returning * into report;
  return jsonb_build_object('id',report.report_id,'state',report.state);
end; $$;

create or replace function app_public.shopper_get_correction(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not shopper_private.current_user_can_use_shopper_private() then
    raise exception using errcode='42501', message='shopper_private_access_denied';
  end if;
  select jsonb_build_object('id',r.report_id,'state',r.state) into result
    from shopper_private.store_correction_reports r
    where r.report_id=p_report_id and r.reporter_user_id=auth.uid();
  return result;
end; $$;

alter function app_public.shopper_list_saved() owner to identity_service;
alter function app_public.shopper_toggle_save(uuid) owner to identity_service;
alter function app_public.shopper_get_memory(uuid) owner to identity_service;
alter function app_public.shopper_upsert_memory(uuid,smallint,text,date,bigint) owner to identity_service;
alter function app_public.shopper_delete_memory(uuid) owner to identity_service;
alter function app_public.shopper_undo_delete_memory(uuid,uuid) owner to identity_service;
alter function app_public.shopper_list_catalog_areas() owner to identity_service;
alter function app_public.shopper_get_new_since(uuid) owner to identity_service;
alter function app_public.shopper_mark_catalog_seen(uuid) owner to identity_service;
alter function app_public.shopper_dismiss_new_store(uuid) owner to identity_service;
alter function app_public.shopper_submit_correction(uuid,text,text,text) owner to identity_service;
alter function app_public.shopper_get_correction(uuid) owner to identity_service;

revoke all on function app_public.shopper_list_saved() from public, anon;
revoke all on function app_public.shopper_toggle_save(uuid) from public, anon;
revoke all on function app_public.shopper_get_memory(uuid) from public, anon;
revoke all on function app_public.shopper_upsert_memory(uuid,smallint,text,date,bigint) from public, anon;
revoke all on function app_public.shopper_delete_memory(uuid) from public, anon;
revoke all on function app_public.shopper_undo_delete_memory(uuid,uuid) from public, anon;
revoke all on function app_public.shopper_list_catalog_areas() from public, anon;
revoke all on function app_public.shopper_get_new_since(uuid) from public, anon;
revoke all on function app_public.shopper_mark_catalog_seen(uuid) from public, anon;
revoke all on function app_public.shopper_dismiss_new_store(uuid) from public, anon;
revoke all on function app_public.shopper_submit_correction(uuid,text,text,text) from public, anon;
revoke all on function app_public.shopper_get_correction(uuid) from public, anon;

grant execute on function app_public.shopper_list_saved() to authenticated;
grant execute on function app_public.shopper_toggle_save(uuid) to authenticated;
grant execute on function app_public.shopper_get_memory(uuid) to authenticated;
grant execute on function app_public.shopper_upsert_memory(uuid,smallint,text,date,bigint) to authenticated;
grant execute on function app_public.shopper_delete_memory(uuid) to authenticated;
grant execute on function app_public.shopper_undo_delete_memory(uuid,uuid) to authenticated;
grant execute on function app_public.shopper_list_catalog_areas() to authenticated;
grant execute on function app_public.shopper_get_new_since(uuid) to authenticated;
grant execute on function app_public.shopper_mark_catalog_seen(uuid) to authenticated;
grant execute on function app_public.shopper_dismiss_new_store(uuid) to authenticated;
grant execute on function app_public.shopper_submit_correction(uuid,text,text,text) to authenticated;
grant execute on function app_public.shopper_get_correction(uuid) to authenticated;

revoke create on schema app_public from identity_service;
revoke create on schema shopper_private from identity_service;
revoke identity_service from postgres;
