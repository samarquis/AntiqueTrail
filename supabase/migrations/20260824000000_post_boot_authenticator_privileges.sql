-- PostgREST entry privileges for the catalog hot path (issue #99). Local init
-- never granted the authenticator role USAGE on schema app_public nor
-- membership of catalog_reader, so every app_public RPC failed PGRST202 on a
-- fresh boot until someone ran ad hoc grants that lived only in the docker
-- volume. Committing the grants here makes db reset locally and any hosted
-- push converge on the same state by design instead of by drift; redundant
-- grants are no-ops. scripts/stress/post-boot.sql applies the same repair to
-- an already-running drifted volume without a destructive reset.
grant usage on schema app_public to authenticator;
grant catalog_reader to authenticator;
notify pgrst, 'reload schema';
