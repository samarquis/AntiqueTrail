# Issue #137 — Administrator navigation evidence

## Scope

Candidate branch `codex/issue-137-admin-navigation` implements the `DESIGN_SYSTEM.md`
privileged-navigation contract: the only Administrator primary parents are `Review | Access | More`.
The rebased candidate uses base `1ff9a63566159325537a94248c15acc769aac966`; its feature
implementation begins at `a94240b`; senior-review registry repair is `17c6625`.

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

1. Implementation: one pure `ADMIN_ROUTES` registry now drives every mounted `/admin` route and
   maps each route to Review, Access, or More; no child route becomes a primary item.
2. Domain re-read: More labels only Support/System status as links and truthfully marks readiness,
   narrow D30 audit, evidence, and communities unavailable until a server-authorized exact scope.
3. Defect hunt: focused app and registry tests pass (23/23 and 10/10). On 2026-09-02 the exact
   required UI-09/UI-10 command passed 48 tests with six opt-in captures skipped, and the exact
   repository floor passed under declared Node 20.19.0: 89 files/612 tests and 69 release tests.
4. Polish: visual inspection of `mobile-admin-more.png` confirms the fixed bottom bar has exactly
   Review, Access, and More with More current; the Sign out control clears the bar.

Implementation and local acceptance evidence are ready. Independent exact-head review, hosted
checks, merge, and post-merge verification remain intentionally pending for the next session.
