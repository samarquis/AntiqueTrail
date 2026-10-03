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
- Browser tab-creation attempts: the first, after 2026-10-03 18:52:46 UTC, supplied unsupported `visible: true`; its exact attempt time was not captured and its result is recorded in [issue comment #5972532978](https://github.com/samarquis/AntiqueTrail/issues/505#issuecomment-5972532978). A fresh tab was later created successfully after the 2026-10-03 19:28:37 UTC lane grant. The list rendered before the details click at 19:33:27.460 UTC; the exact list snapshot time was not captured. The details route was observed rendered at 19:33:53.760 UTC.
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
| Valid canonical browser observation | **Rendered page flow; request-level result unavailable.** On 2026-10-03, canonical `/stores` rendered 12 fictional listings. The first rendered store, Clockwork Cabinet, opened at `/stores/clockwork-cabinet`; its details, hours, photos, and source/freshness sections rendered. The list was visible before the details-link click at 19:33:27.460 UTC; the details page was observed at 19:33:53.760 UTC. | The browser exposed no HTTP status or network-event API. Its tab capabilities listed only `pageAssets`; read-only page evaluation did not expose browser performance entries. No request method, backend operation, source binding, deployment identity, or correlation ID was available. The details observation's console query returned zero captured entries. This is a point observation of rendered routes only; it does not establish an HTTP status, Edge Function health, or continuous health. |
| Deliberate request denial | **Confirmed in source and focused tests.** | The Edge handler returns `503 GATEWAY_UNAVAILABLE` for a non-OPTIONS request with missing or mismatched Origin, required gateway configuration missing, unavailable runtime remote address, or an invalid public-test backend/origin binding. Tests cover a wrong Origin, a mismatched backend URL, and a missing runtime address even when the caller supplies `x-forwarded-for`. |
| Preflight behavior | **Confirmed in source.** | `OPTIONS` with a wrong Origin returns `403`; do not report that preflight response as the POST gateway's `503`. |
| Expired or revoked scope | **Confirmed in source and focused test.** | A `public_test_catalog_gateway_request` error maps to `503 CATALOG_UNAVAILABLE`. The test uses `public_test_unavailable` and proves the handler makes one RPC call without falling back to an older stage. |
| Rate limit | **Confirmed in source and focused test.** | Rate rejection remains `429 RATE_LIMITED` with `Retry-After: 300`. This is not a gateway `503`; no retry behavior was added or changed. |
| Network and parse ambiguity | **Confirmed in client source; no live failure observed.** | `configuredCatalogClient` catches both `fetch` failures and `response.json()` failures and returns `GATEWAY_UNAVAILABLE`. For a parseable non-2xx response, it preserves `payload.error` or uses the same generic code when the payload has no error. A client-mapped code alone cannot establish whether the browser received an HTTP response. |
| Relevant hosted logs | **Conditional; not queried.** | The list and details pages rendered without a visible failure, and no valid-request failure was reproduced. The browser did not expose request status, so no backend result is claimed. Hosted-log correlation was not triggered. If a valid request failure is later reproduced, use only existing read-only access; if unavailable, record it as unavailable and leave the cause unresolved. |
| Safety | **Preserved.** | Tests retain wrong-Origin, invalid-binding, missing-address, expired/revoked-scope, map-scope, and rate-limit denials. The browser probe used only the canonical list and first rendered details route. No tokens, headers, response bodies, private configuration, or provider data were recorded. The owned Chrome tab was closed at 2026-10-03 19:35:47.143 UTC and was absent from the subsequent tab inventory; no local server or process was started. |

The handler's configuration guard is in `supabase/functions/_shared/public-catalog.ts:43-71`. Public-test scope and RPC error handling are in lines 98-118. Client status and exception mapping are in `src/features/catalog/supabaseClient.ts:28-45`.

Do not treat a `401` from the Supabase REST root as evidence that the `public-catalog` Edge Function failed. That request does not exercise this function path.

## Hypothesis classification

| Hypothesis | Status | Basis |
| --- | --- | --- |
| A wrong or missing Origin, missing gateway configuration, unavailable runtime address, or invalid public-test binding can deliberately produce `503 GATEWAY_UNAVAILABLE`. | **Confirmed as a code path.** | Source guard and focused negative tests. This does not establish the cause of any unobserved live 503. |
| An expired or revoked public-test scope can produce `503 CATALOG_UNAVAILABLE`. | **Confirmed as a code path; current scope status unresolved.** | The handler maps the gateway error to 503 and the focused test verifies no fallback. No current hosted request or scope state was read. |
| A valid canonical list/details request currently fails. | **No visible route failure; request-level outcome unresolved.** | The canonical list and first store details page rendered once. HTTP status, network events, backend operation, and deployment/source binding were unavailable in the supported browser interface. |
| A network or JSON parse failure can appear to the client as `GATEWAY_UNAVAILABLE`. | **Confirmed as a client mapping; no live failure observed.** | The client catches both exceptions at the same boundary. |
| A REST-root `401` proves the Edge Function crashed. | **Rejected.** | A REST-root request does not exercise the Edge Function path. |

## Verification

| Layer | Command or flow | Result | Applies to |
| --- | --- | --- | --- |
| Focused unit tests | `npx vitest run src/features/shopper/publicTestCatalog.test.ts src/features/catalog/internalCatalogEdge.test.ts` | Passed: 2 files, 8 tests. | Source SHA `68751a42c9a05d1ffd7c129d8f1f409dccd1775a`; Node 24.11.1; Vitest 4.1.10. |
| Database | None | Not run. The two tests use in-memory mocks and need no database setup. | No database claim. |
| Browser | Canonical `https://antique-trail.vercel.app/stores`, then first rendered store `/stores/clockwork-cabinet` | Read-only rendered-route observation. The list showed 12 fictional stores before 19:33:27.460 UTC; details were observed at 19:33:53.760 UTC. Console query returned zero captured entries. HTTP status, request, and deployment identity were not exposed. | One point observation of the canonical rendered routes only; no request-level or continuous-health claim. |
| Hosted/provider | No log, deployment, or configuration read | No visible route failure; no provider mutation. | No backend or deployment identity claim. |
| Canonical production | Same browser observation above | Both routes rendered at the canonical site; no HTTP status or deployment/source receipt was exposed. | Point-in-time UI only. |
| Human | None | Not performed. | No human acceptance claim. |

Dependencies were installed from the lockfile in this isolated worktree with a task-specific npm cache. The test run started at 13:11:31 America/Chicago and passed without retries.

## Hosted log guidance

If a valid canonical list/details request fails after confirming the actual allowed Origin and request path, and existing read-only Supabase access is available, use Studio Logs to filter Edge Function events by the `public-catalog` path, `POST`, status, and observed time window. Check invocation status, duration, and safe deployment/config identity when exposed. Record only the operation, status, timestamp, request source binding, and safe correlation ID if one exists. Do not publish invocation headers or bodies. A successful observation needs no hosted-log read; record status, route, source binding, and safe correlation ID only when exposed. A rendered route alone does not establish HTTP status or backend identity. If existing log access is unavailable after a reproduced failure, mark that evidence unavailable and keep the cause unresolved; request no new provider rights.

Supabase's current [Logs in Studio guide](https://supabase.com/docs/guides/observability/logs) documents filters for log type, status, method, and pathname. It also warns that an empty result does not prove no activity. The [Edge Function logging guide](https://supabase.com/docs/guides/functions/logging) distinguishes invocation request/response data from platform and function logs. Supabase removed Management API `logs.all` on 2026-09-23; use the current Studio Logs view or the current ClickHouse-backed `logs` endpoint instead of that retired endpoint, as documented in the [Supabase changelog](https://supabase.com/changelog?types=breaking-change).

## Reflection preflight

- `L-20260930-01` is supported. Applied by omitting machine paths and defining the exact source-only fingerprint command, inputs, path scope, and flags above. Effect on this ticket remains unknown until independent review.
- `L-20260927-02` is supported. Applied by waiting for the rendered list and details state rather than relying on a timer; the list's exact snapshot time was not captured, and the details page observation time was recorded.
- `L-20261003-02` is provisional. It concerns persisted theme selection during multi-route visual checks, so it does not apply to this API diagnosis.
- `L-20261002-01` is provisional. Applied as a gate: record exact-head Standards and Spec verdicts before the integration owner merges.

## Unverified and handoff

This report confirms deliberate denial paths and the client's generic mapping. One canonical browser session rendered the catalog list and first store's details route. It does not establish HTTP response status, backend operation, source/deployment binding, safe correlation ID, or continuous health because the supported browser surface exposes no network events and no such identity appeared in the rendered UI. No request failure or user-visible route failure was observed, so hosted logs were not queried.

The initial Chrome call's `visible: true` failure remains classified as an unsupported Chrome option, not a site or policy failure. The corrected call created one fresh Chrome tab at `https://antique-trail.vercel.app/stores`. The list showed 12 fictional stores; the first was Clockwork Cabinet. The details link was clicked at 2026-10-03T19:33:27.460Z. `/stores/clockwork-cabinet` was visibly rendered at 2026-10-03T19:33:53.760Z, with the fictional address, hours, photo collection, and source/freshness section. At that observation, the browser console query returned zero captured entries. The exact list snapshot timestamp was not captured; the list was visible before the details-link click. The owned tab was closed at 2026-10-03T19:35:47.143Z and no longer appeared in the browser inventory. No local server or owned process was started; the coordinator's pre-grant listener check found ports 4173 and 4174 absent at 2026-10-03 19:28:37 UTC.

Keep request-level status and deployment identity unresolved. If a valid list/details request failure is independently reproduced later, use only existing read-only Supabase Studio Logs for its observed time window and operation; if access is unavailable, leave cause unresolved. A rendered page does not substitute for a network response receipt. Do not use retired `logs.all`, add retries, or relax request guards.
