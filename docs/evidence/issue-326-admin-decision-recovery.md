# Issue 326 — Administrator decision recovery diagnostic

This focused local-fixture diagnostic covers the three browser recovery states that UI-09 does not establish: stale version, repeated confirmation during an in-flight decision, and browser reload while a decision is in flight.

Run it on a clean checkout with:

```powershell
npx playwright test -c e2e/issue-326-playwright.config.ts
npx playwright test -c playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts
```

The isolated config uses loopback port `41826`, desktop and phone projects, and explicit `reviewAdminDecision` modes. Its state is local synthetic review composition only: no Administrator RPC, Auth provider, Edge Function, database mutation, or real administrative decision occurs. The interrupted mode persists only its synthetic settled-case marker in browser session storage so re-entry can read the fixture's outcome; it is not durability or backend-enforcement evidence.

The configured client retains only the safe `version conflict` classification needed to offer refresh/reapply; it continues to suppress server detail for every other failure.

| Acceptance | Executable proof |
| --- | --- |
| Stale decision is not reported as success | `rejects a stale decision…` verifies retained reason, stale recovery feedback, refresh, and a later version-bound success. |
| Repeated confirmation has one logical outcome | `coalesces repeated confirmation…` uses an actual double click while the synthetic client is pending and asserts the disabled in-flight control and one resolved outcome. |
| Reload does not fabricate success or duplicate the decision | `reload during a pending decision…` performs the actual confirmation click and browser reload, then reads the fixture's reconciled queue state. |
| Adjacent Administrator flow remains intact | UI-09 runs through queue, confirmation/cancel, moderation, Access & Safety, focus, and responsive assertions. |

The runner returns a nonzero status on an observed failure. Unsupported states must be recorded as `UNAVAILABLE`; they are never passed from fixture coverage. Real backend authorization and persistence remain outside this ticket's local-fixture evidence.
