# Issue #505 catalog availability diagnosis

## Candidate

- Issue: [#505](https://github.com/samarquis/AntiqueTrail/issues/505)
- Owner: `samarquis`
- Risk: low. Documentation only; no runtime or provider changes.
- Ticket baseline: `81703453ee5e445ee3bdb1c38ef2cf8f81a362ee`
- Source SHA tested: `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`
- Target: `main`
- Branch: `codex/issue-505-catalog-availability`
- Initial source/test evidence captured: 2026-10-03 13:11 America/Chicago; this timestamp applies only to that evidence.
- Browser tab-creation attempt: after 2026-10-03 18:52:46 UTC; exact attempt time was not captured. The result was recorded in [issue comment #5972532978](https://github.com/samarquis/AntiqueTrail/issues/505#issuecomment-5972532978) at 2026-10-03 19:05:32 UTC; comment time is not the attempt time.
- Report head: record the exact commit that adds this file in the PR and issue handoff. Behavioral evidence applies to the source SHA above.

The ticket baseline is an ancestor of current `main`. The four owned source and test files have no changes between the ticket baseline and the tested source SHA.

Reproduce the source-only diff fingerprint with:

```powershell
git diff --binary --full-index 81703453ee5e445ee3bdb1c38ef2cf8f81a362ee..68751a42c9a05d1ffd7c129d8f1f409dccd1775a -- src/features/catalog/supabaseClient.ts supabase/functions/_shared/public-catalog.ts src/features/shopper/publicTestCatalog.test.ts src/features/catalog/internalCatalogEdge.test.ts | git hash-object --stdin
```

The command hashes the raw binary diff for those four paths, with `--binary` and `--full-index`. Result: `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`, the SHA-1 object ID for an empty diff.

## Scope

Classify the existing public catalog path and its denials. No handler, transport, origin or IP check, configuration, scope, retry, provider, or deployment changes were made.

Ownership check before claim found #505 open, unassigned, without comments, matching branches, or an open PR. #496 was closed through merged PR #497. The live #505 assignment and claim comment are recorded on the issue.

## Acceptance

| Criterion | Result | Evidence |
| --- | --- | --- |
| Valid canonical browser observation | **Not executed.** One leased call supplied `visible: true`, which this Chrome entry rejected before tab creation with `Capability is not available: visibility`. This establishes only that the option is unsupported here; no canonical HTTP request ran, and status, timestamp, safe correlation ID, and request source binding remain unknown. A success will be a point observation, not continuous health. | No tab or network request was created. The coordinator now has #503 on the shared lane; #505 waits for its cleanup and a fresh grant. Unit tests below use synthetic `Request` objects. |
| Deliberate request denial | **Confirmed in source and focused tests.** | The Edge handler returns `503 GATEWAY_UNAVAILABLE` for a non-OPTIONS request with missing or mismatched Origin, required gateway configuration missing, unavailable runtime remote address, or an invalid public-test backend/origin binding. Tests cover a wrong Origin, a mismatched backend URL, and a missing runtime address even when the caller supplies `x-forwarded-for`. |
| Preflight behavior | **Confirmed in source.** | `OPTIONS` with a wrong Origin returns `403`; do not report that preflight response as the POST gateway's `503`. |
| Expired or revoked scope | **Confirmed in source and focused test.** | A `public_test_catalog_gateway_request` error maps to `503 CATALOG_UNAVAILABLE`. The test uses `public_test_unavailable` and proves the handler makes one RPC call without falling back to an older stage. |
| Rate limit | **Confirmed in source and focused test.** | Rate rejection remains `429 RATE_LIMITED` with `Retry-After: 300`. This is not a gateway `503`; no retry behavior was added or changed. |
| Network and parse ambiguity | **Confirmed in client source; no live failure observed.** | `configuredCatalogClient` catches both `fetch` failures and `response.json()` failures and returns `GATEWAY_UNAVAILABLE`. For a parseable non-2xx response, it preserves `payload.error` or uses the same generic code when the payload has no error. A client-mapped code alone cannot establish whether the browser received an HTTP response. |
| Relevant hosted logs | **Conditional; not triggered.** | No valid request failure was reproduced, so hosted-log correlation is not required or claimed. If a valid request fails, use only existing read-only access; if that access is unavailable, record it as unavailable and leave the cause unresolved. |
| Safety | **Preserved.** | Tests retain wrong-Origin, invalid-binding, missing-address, expired/revoked-scope, map-scope, and rate-limit denials. No tokens, headers, response bodies, private configuration, or provider data were recorded. |

The handler's configuration guard is in `supabase/functions/_shared/public-catalog.ts:43-71`. Public-test scope and RPC error handling are in lines 98-118. Client status and exception mapping are in `src/features/catalog/supabaseClient.ts:28-45`.

Do not treat a `401` from the Supabase REST root as evidence that the `public-catalog` Edge Function failed. That request does not exercise this function path.

## Hypothesis classification

| Hypothesis | Status | Basis |
| --- | --- | --- |
| A wrong or missing Origin, missing gateway configuration, unavailable runtime address, or invalid public-test binding can deliberately produce `503 GATEWAY_UNAVAILABLE`. | **Confirmed as a code path.** | Source guard and focused negative tests. This does not establish the cause of any unobserved live 503. |
| An expired or revoked public-test scope can produce `503 CATALOG_UNAVAILABLE`. | **Confirmed as a code path; current scope status unresolved.** | The handler maps the gateway error to 503 and the focused test verifies no fallback. No current hosted request or scope state was read. |
| A valid canonical list/details request currently fails. | **Unresolved.** | No canonical browser request was made. |
| A network or JSON parse failure can appear to the client as `GATEWAY_UNAVAILABLE`. | **Confirmed as a client mapping; no live failure observed.** | The client catches both exceptions at the same boundary. |
| A REST-root `401` proves the Edge Function crashed. | **Rejected.** | A REST-root request does not exercise the Edge Function path. |

## Verification

| Layer | Command or flow | Result | Applies to |
| --- | --- | --- | --- |
| Focused unit tests | `npx vitest run src/features/shopper/publicTestCatalog.test.ts src/features/catalog/internalCatalogEdge.test.ts` | Passed: 2 files, 8 tests. | Source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; Node 24.11.1; Vitest 4.1.10. |
| Database | None | Not run. The two tests use in-memory mocks and need no database setup. | No database claim. |
| Browser | None | Not run. | No browser or canonical route claim. |
| Hosted/provider | None | No provider reads or writes. | No hosted claim. |
| Canonical production | None | Not probed. | No production claim. |
| Human | None | Not performed. | No human acceptance claim. |

Dependencies were installed from the lockfile in this isolated worktree with a task-specific npm cache. The test run started at 13:11:31 America/Chicago and passed without retries.

## Hosted log guidance

If a valid canonical list/details request fails after confirming the actual allowed Origin and request path, and existing read-only Supabase access is available, use Studio Logs to filter Edge Function events by the `public-catalog` path, `POST`, status, and observed time window. Check invocation status, duration, and safe deployment/config identity when exposed. Record only the operation, status, timestamp, request source binding, and safe correlation ID if one exists. Do not publish invocation headers or bodies. A successful list/details observation needs no hosted-log read; record its sanitized status, time, route, source binding, and safe correlation ID instead. If existing log access is unavailable after a reproduced failure, mark that evidence unavailable and keep the cause unresolved; request no new provider rights.

Supabase's current [Logs in Studio guide](https://supabase.com/docs/guides/observability/logs) documents filters for log type, status, method, and pathname. It also warns that an empty result does not prove no activity. The [Edge Function logging guide](https://supabase.com/docs/guides/functions/logging) distinguishes invocation request/response data from platform and function logs. Supabase removed Management API `logs.all` on 2026-09-23; use the current Studio Logs view or the current ClickHouse-backed `logs` endpoint instead of that retired endpoint, as documented in the [Supabase changelog](https://supabase.com/changelog?types=breaking-change).

## Reflection preflight

- `L-20260930-01` is supported. Applied by omitting machine paths and defining the exact source-only fingerprint command, inputs, path scope, and flags above. Effect on this ticket remains unknown until independent review.
- `L-20260927-02` is supported. The pending browser pass must wait for the actual list/details response and rendered destination, not a timer. No browser timing claim is made.
- `L-20261003-02` is provisional. It concerns persisted theme selection during multi-route visual checks, so it does not apply to this API diagnosis.
- `L-20261002-01` is provisional. Applied as a gate: record exact-head Standards and Spec verdicts before the integration owner merges.

## Unverified and next action

This report confirms deliberate denial paths and the client's generic mapping. It does not show whether a valid canonical browser request currently succeeds or fails, or establish the deployment/configuration identity serving it. The first Chrome tab-creation attempt was rejected because `visible` is unsupported for this Chrome entry. No valid-request failure has been reproduced, so matching hosted-log correlation is not currently an acceptance requirement or finding.

After #503 releases the shared lane, request a fresh read-only browser lease for this bounded observation:

- **Command, after #503 cleanup and a fresh lane grant:** Open a new Chrome tab with `await cua.createBrowserTab("chrome", "https://antique-trail.vercel.app/stores", { sessionName: "🔎 Issue 505" })`. Omit unsupported `visible`; do not switch browser paths. Wait for the real list response, open the first rendered store's Details route, and capture sanitized operation, HTTP status, timestamp, canonical request source binding, safe deployment/source identity if exposed, safe correlation ID, and console/network failure classification. Do not capture headers or bodies. A success is a point observation. If tab creation fails again, record the exact result and stop.
- **Source and fixture:** The canonical `https://antique-trail.vercel.app/stores` page and the anonymous catalog it returns at run time, using its actual canonical Origin. Use only list and details requests. Do not seed, spoof request headers, or mutate data.
- **Ports:** No local app or Supabase server. Leave 4173 and 4174 unused.
- **Logs:** Only if a valid request fails, inspect existing Supabase Studio Edge Function logs for its exact time window and endpoint when current read-only access is available. If access is unavailable, record that limitation and leave cause unresolved; do not request new provider rights. A successful observation does not require logs. Do not use retired `logs.all`.
- **Cleanup receipt:** The tab-creation call failed before creating a context, so none exists to close. This attempt started no local server or owned process/listener. The coordinator's pre-grant listener check found ports 4173 and 4174 absent at 2026-10-03 18:52:46 UTC.

No alternate browser path was attempted after the unsupported-option rejection. The shared lane is currently held by #503; wait for its cleanup and a fresh #505 grant before retrying the same Chrome call without `visible`. Keep valid-browser status and source binding unavailable until then. Treat log correlation as conditional on a reproduced valid-request failure. Do not add retries or relax request guards.
