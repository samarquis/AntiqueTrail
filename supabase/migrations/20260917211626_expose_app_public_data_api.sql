-- Expose app_public on the Data API (PostgREST db-schemas) so /rest/v1 can
-- resolve the app's private RPCs (list_trips, trip/shopper commands, etc.),
-- which the browser and Edge clients target with db.schema='app_public'
-- (Content-Profile: app_public). Exposure is not an authorization grant:
-- anon/authenticated keep only their existing USAGE and explicit grants, and
-- app_public tables stay FORCE ROW LEVEL SECURITY.
--
-- Note: this role setting is authoritative for PostgREST. The dashboard's
-- "Exposed schemas" control stops managing the value while it is set; edit
-- it here and NOTIFY instead. Reset to dashboard-managed with:
--   alter role authenticator reset pgrst.db_schemas;
alter role authenticator set pgrst.db_schemas = 'public, app_public';
notify pgrst, 'reload config';