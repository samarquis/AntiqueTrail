-- Commit the enum value before the following migration uses it.
alter type app_private.app_role add value if not exists 'store_owner';
