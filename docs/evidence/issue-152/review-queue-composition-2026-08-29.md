# Issue #152 — administrator review-queue composition evidence

Date: 2026-08-29

## Scope

This evidence covers the responsive composition of the Administrator review queue: its bounded workspace, assigned-case/category summary, one Review path per case, loading, empty, error/retry, resolved-state focus return, and mobile reflow. It does not claim to verify a new decision model, RPC, permission, or database authorization boundary; those surfaces were intentionally unchanged.

## Independently rerunnable checks

| Check                                                                                                                                                | Result                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npx vitest run src/features/admin/components.test.tsx --reporter=verbose`                                                                           | 11 passed / 0 failed                                                |
| `npm run typecheck`                                                                                                                                  | passed                                                              |
| `npm run lint`                                                                                                                                       | passed                                                              |
| `npx prettier --check src/features/admin/components.tsx src/features/admin/components.test.tsx src/app/styles.css e2e/ui09-admin-moderation.spec.ts` | passed                                                              |
| `git diff --check`                                                                                                                                   | passed                                                              |
| `npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts --reporter=line`                                         | 36 passed / 0 failed / 3 skipped across desktop, tablet, and mobile |

The three skipped browser tests are opt-in viewport-evidence capture tests; they are not product-test failures.

## What the browser run demonstrates

The direct queue assertions exercise the bounded workspace in successful, loading, empty, and error/retry states; the list exposes one named Review action per assigned case; a completed decision returns focus to the queue heading; and the 320 CSS-px assertions check action targets and horizontal overflow. The review harness is synthetic: its Administrator client uses fixtures and local mutations. Therefore this browser evidence validates queue presentation and interaction against the harness, not production RPC/RLS enforcement, authoritative database state, or hosted CI.
