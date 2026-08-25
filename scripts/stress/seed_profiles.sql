-- Seeder: insert auth.users + matching app_private.profiles rows
-- Mirrors the style of scripts/stress/post-boot.sql
-- Run: psql "$DB_URL" -f scripts/stress/seed_profiles.sql

-- Get the list of users without profiles and insert matching profiles
do $$
declare
    v_user_uuid uuid;
begin
    -- Insert profiles for all users who don't have one yet
    for v_user_uuid in
        select u.id from auth.users u
        left join app_private.profiles p on u.id = p.user_id
        where p.user_id is null
    loop
        insert into app_private.profiles (user_id, status, created_at, updated_at)
            values (v_user_uuid, 'active', now(), now());
    end loop;
end
$$;