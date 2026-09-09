# Configured shopper probe

This local diagnostic exercises actual GoTrue password grants, application session registration, the public-catalog Edge envelope, and private shopper/trip RPCs. It is separate from browser/persona fixtures, hosted acceptance, provider testing, and human feedback.

## Run

Prerequisites are Node matching `.nvmrc`, npm, Docker with a local Unix socket or Windows named pipe, and enough capacity for a disposable Supabase stack. The runner obtains the same Supabase CLI version as CI, `2.115.0`.

```sh
node scripts/configured-shopper-probe.mjs --local --output artifacts/configured-shopper-probe
```

The command creates a uniquely named temporary project outside the checkout, copies the current migrations/functions and approved fictional catalog seed, allocates unused ports, and starts run-owned services. A private Docker socket adapter binds published ports to `127.0.0.1` before container startup; it does not alter the Docker daemon or another project's configuration. The runner checks the actual bindings before provisioning identities.

Two run-specific `.invalid` identities are created through local GoTrue Admin, then sign in with actual password grants and register application sessions through the authenticated RPC. SQL supplies local-only admission/stage fixtures and independent per-command records using the CI test role/grants. No shopper JWT is fabricated, RLS is retained, and no review client or intercepted application response participates. The separate catalog gateway service credential stays in the temporary server environment.

Each of 13 command groups runs independently. Catalog uses the real Edge `operation`/`args` envelope with an authenticated local shopper because Synthetic Alpha requires it. Saves cover save, readback, sibling isolation, unsave, and list readback; trips cover creation, read, rename, schedule, add, remove, priority, dwell, and reorder. Independent trip fixtures prevent a broken create command from hiding subsequent mutation results. This is not an anonymous public-release catalog claim.

## Reports and cleanup

Each run writes a uniquely owned `report.json` with the actual source SHA, dirty-source flag, migration/function/config/fixture digests, endpoint and role/evidence classes, individual outcomes, and cleanup disposition. Only all successful, well-formed checks yield `passed`; product failures exit 1 and unavailable setup exits 2. A truthful failing product run can satisfy this diagnostic-tool ticket without accepting the affected product behavior.

Passwords and user tokens remain in process memory; setup keys and raw responses are not written to reports. Normal completion and Ctrl-C/SIGTERM invoke scoped teardown. The temporary marker, exact project ID, local path, and Docker resource labels are checked before stopping/removing resources. If Docker cleanup fails, the report names the retained project/directory, the credential file is removed, and the run remains failed. Forced process termination or machine failure can prevent automatic cleanup; never use `supabase stop --all`, global pruning, shared `supabase/config.toml`, or `supabase_db_antique-trail` to recover a probe.

## Runner verification

```sh
node --test scripts/configured-shopper-probe.test.mjs
npm run security:contract
```

The contract tests cover unavailable/malformed results, independent continuation, incorrect readback, setup and cleanup failure, interruption, redaction, remote targets and redirects, ownership mismatches, loopback container bindings, and streaming Docker response headers. They run without a Docker dependency; actual disposable runs provide the separate service evidence.

For interrupted runs that retained a temporary project, use its absolute path from the report:

```sh
node scripts/configured-shopper-probe.mjs --local --cleanup <absolute-temporary-project-path>
```

Recovery revalidates the marker, project configuration, local Docker resource labels, and directory before removing only that run. If Docker is unavailable, restore Docker and retry the same scoped command.
