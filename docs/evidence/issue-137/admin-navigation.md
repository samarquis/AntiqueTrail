# Issue #137 — Administrator navigation evidence

## Scope

Candidate branch `codex/issue-137-admin-navigation` implements the `DESIGN_SYSTEM.md`
privileged-navigation contract: the only Administrator primary parents are `Review | Access | More`.

## Route-parent map

| Parent | Mounted authorized routes |
| --- | --- |
| Review | `/admin`, `/admin/partners`, `/admin/reviews` |
| Access | `/admin/access` |
| More | `/admin/more`, `/admin/readiness/:runId`, `/admin/beta/:cohortId` |

`/admin/more` truthfully labels Support and System status, and marks Readiness, narrow D30 View
Audit, Evidence, and Communities unavailable until their server-authorized exact scope exists. It
does not introduce an Audit History/export or break-glass destination.

## Verification commands

Run these commands from the candidate worktree after the final commit:

```powershell
npm test -- --run src/app/App.test.tsx src/features/admin/navigation.test.tsx
npx playwright test --config playwright.review.config.ts e2e/ui09-admin-moderation.spec.ts
npm run security:contract
npm run check
git diff --check
```

The UI-09 coverage verifies desktop/mobile labels and order, direct-link active-parent assignment,
browser Back preservation, the More destination contents, and a non-Administrator denial.

When `CAPTURE_UI09_EVIDENCE=true`, the same browser test records the desktop, tablet, and mobile
Administrator More parent in this directory. Those captures are review-harness evidence only; they
do not prove production provider, RPC, RLS, or Storage authorization.

## Four-pass result

1. Implementation: one `ADMIN_ROUTE_PARENTS` registry now maps every mounted `/admin` route to
   Review, Access, or More; no child route becomes a primary item.
2. Domain re-read: More labels only Support/System status as links and truthfully marks readiness,
   narrow D30 audit, evidence, and communities unavailable until a server-authorized exact scope.
3. Defect hunt: focused app and registry tests pass (23/23 and 10/10); UI-09 passes 39 checks plus
   three opt-in screenshots. A full adjusted-timeout unit run passes 89 files/612 tests.
4. Polish: visual inspection of `mobile-admin-more.png` confirms the fixed bottom bar has exactly
   Review, Access, and More with More current; the Sign out control clears the bar.

The candidate is not closure-ready: the exact UI-10/full-check commands in the gate ledger are
blocked by unrelated cold-start/time-limit failures. See `gates/issue-137.md` for the precise
commands, observed failures, and environment constraint.
