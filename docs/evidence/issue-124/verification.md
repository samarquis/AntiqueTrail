# Issue #124 verification

Date: 2026-09-05. Base: `8228cb123156c14409a68fdec00a47aec07dc5bc`.
PR: https://github.com/samarquis/AntiqueTrail/pull/214.

## Acceptance mapping

| Criterion | Executable evidence |
| --- | --- |
| Real functions, grants, owners, fixed search paths, FORCE RLS | `0083_issue_124_media_authorization.sql`: public calls run as browser roles; deployed catalog assertions check RPC and table ownership, search paths, and FORCE RLS; bulk direct reads/writes and private helper calls deny. |
| Exact-store allow and anonymous, cross-store, revoked, stale, sibling, bulk deny | `0083`: exact Representative reservation/history, identical foreign/guessed/sibling denial, 25 foreign-ID attempts, expired session, revoked grant, anonymous execute denial; `0076` additionally covers a second authorized store actor and multiple grants; `0078` covers no-grant and malformed inputs. |
| Current tiers, races, immutability, new row, replay, rollback | `0078`, `0083`, and `0084_issue_124_media_current_tier.sql`: real Free/Gallery/Full Gallery reservation/capacity and both approval overloads, downgrade rederivation, unchanged rejection, one new row/replayed receipt; rollback requires an actual reserved row with queued purge work before proving removal. `scripts/issue-124-media-race.mjs` covers all four approval-overload pairings and concurrent same-key resubmission. |
| Minimized history | `0083` checks exactly six keys on every returned row and exact-store count; `0076` checks forbidden storage/signing/metadata fields and another authorized store's projection. |
| Clean reset and deliberate break | Required hosted `database` job resets Supabase and executes all pgTAP files; local mutation results below prove the new contract detects broken cap and scope enforcement. |

## Local results and limits

- Full database suite: **85 files, 2,460 assertions, PASS** after the final test corrections.
- Race harness: **PASS** for 2/4, 4/2, 2/2, and 4/4 argument approval combinations: one winner, one `23505 media_unavailable`, exactly five approved images. Concurrent same-key resubmission returned the same upload ID, one fresh receipt, one replay, and exactly one persisted row.
- Governance contract: **10 tests PASS**; security contract **PASS**.
- This is synthetic local evidence. The local database was isolated by restoring the existing local schema/data snapshot into a separate `issue124_*` database and applying missing committed migrations; it is **not** clean-reset evidence. The restore reported an unrelated missing `graphql_public.graphql` ACL target; the complete application database suite subsequently passed. Hosted CI supplies clean-reset proof.
- No provider call, deployment, paid activation, or real media processing occurred.

## Reproduce the concurrency check

Use a disposable local database named `issue124_*`, with the complete candidate schema, CI pgTAP setup, and no prior media fixture actor. Do not use the shared application database: this harness commits its synthetic fixture so two real sessions can see it.

```powershell
node scripts/issue-124-media-race.mjs issue124_verify
```

The harness calls actual RPCs in two PostgreSQL sessions. A test-only trigger pauses the first approval **after** its count check and **before** its row update; the competing RPC must wait for the shared store lock and reject after the winner commits. The trigger is removed after success; the fixture stays in the disposable database. Fresh database fixture state is required for a repeat.

## Deliberate-break proof

Both mutations ran only inside an outer transaction in the isolated local database, wrapping the named pgTAP file; rollback/connection exit restored the accepted function. Fixture includes were resolved to their copied absolute container paths. Production files were never weakened.

1. In the new two-argument approval definition, replace `if not coalesce((cap_result->>'allowed')::boolean,false) then` with `if false then`; execute `0084`. It reports **not ok 5 - two-argument approval denies Free sixth image**, followed by the unchanged-state and count failures caused by the unauthorized sixth approval. The unmodified definition passes all 16 assertions.
2. In `portal_list_media_uploads()`, replace `where mu.store_id = v_store_id` with `where true`; execute `0083`. It reports **not ok 16 - history includes only exact-store rows**. The accepted definition passes all 34 assertions.

## Root-cause correction

The service moderation overload `media_approve_upload(uuid,text)` previously updated an awaiting row without any current-tier check. Migration `20260905124107_issue_124_moderation_current_tier.sql` adds the same store advisory lock and server cap resolver used by four-argument moderation. Existing grants, function ownership, authorization, reason validation, and audit behavior are preserved. Pending reservations do not consume the approved-image cap; approval serialization enforces that cap at the final transition.

Exact candidate review and hosted check results are maintained on PR #214; this document does not substitute for a passing review or live GitHub closure.
