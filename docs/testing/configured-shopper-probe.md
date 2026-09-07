# Configured shopper probe

This is a local-only transport diagnostic. It exercises the configured HTTP/RPC path against a disposable loopback Supabase instance; it is not hosted, provider, human, browser-fixture, or release evidence. The probe refuses remote and HTTPS targets, keeps setup credentials out of reports, uses run-owned output directories, and records pass, fail, or unavailable independently for each command.

## Run

From a clean checkout, create a disposable Supabase project directory outside all worktrees, copy the inspected migrations/functions/config into it, assign a unique project id and unused loopback ports (starting at 42040 for the browser server), and start only that directory with the pinned Supabase CLI. Create two fictional `.invalid` users through local GoTrue Admin, obtain real password-grant sessions, and set `ANTIQUE_TRAIL_LOCAL_URL` to the local HTTP origin.

Then run:

    node scripts/configured-shopper-probe.mjs --local --output artifacts/configured-shopper-probe

The command prints a redacted report and writes a run-owned `report.json`. A missing local service is recorded as `unavailable`; a failed product assertion is recorded as `failed` and exits nonzero. Never point this command at `supabase_db_antique-trail`, a deployed Supabase URL, a remote gateway, or another run's directory.

The current baseline is intentionally diagnostic: this repository does not claim an all-pass configured run until a disposable local Supabase service is available. Use the report's source SHA, schema identity, endpoint class, per-command status, sanitized error, and cleanup status when evaluating a repair ticket. The fixture SQL is a boundary note only; the runner must not bypass GoTrue or RLS with SQL claims.
