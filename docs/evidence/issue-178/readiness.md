# Issue 178 readiness handoff

Plan amendment: PR #219, candidate `17c22cb57336ff58fc0d09f3919d63f21f637115`.
Base: `5b03ff79328ae07a2b3586b1e4ea549fb87463f9`.
Status: merged in PR #219 at `666985d6ca137ff3d00be3ad9e7b5d121a5cc801`; independent Standards and Spec PASS, with required web, database, and plan-governance checks passing. The amendment is merged into this implementation branch without rewriting the draft.

## Approved scope

The Product Owner supplied `update plan` after the explanation of same-subscription scheduled downgrades and authenticated application cancellation when Stripe's portal cannot cancel a scheduled subscription.
PR #219 reconciles eight documents and records that authorization in the append-only changelog.
The current phase retains paid entitlement through its cycle boundary; accepted future phases survive upgrades, compensation, pause, and replay unless explicitly replaced.
Free ends the paid subscription at that boundary rather than creating a zero-price recurring phase.
Payments and provider activation remain off.

## Preserved implementation

The incomplete implementation is on `codex/issue-178-servicing` at `e3f04333f1fc3399356e6c2a0887c2316d6da9a0`.
It must not be deployed, merged, or used as #179's stable interface yet.
The old `downgrade-mechanism-proposal.md` and unapplied proposed patch are historical preparation artifacts once PR #219 lands; merged controlling documents take precedence.

## Remaining work

- Replace the draft renewal-time downgrade dispatch with provider-controlled schedules; add the authenticated cancellation fallback and current/future phase reconciliation.
- Complete exact provider request binding, verified webhook routing, source/version/generation replay checks, and successful incremental-charge compensation; the draft compensation helper intentionally cannot claim financial completion.
- Finish 48-hour refund ingestion/processing, servicing-only portal configuration, grace-clock behavior, and bounded media cleanup/recovery without starvation.
- Reconcile hidden-media states with portal parsing, status, recovery, appeal, current-cap enforcement, and moderation concurrency.
- Run focused Edge/application tests, a fresh full migration reset and pgTAP, concurrency/allow-deny/restore-replay tests, security contracts, and an independent review of the final implementation SHA before hosted checks and closure.

## Evidence boundaries

Ten governance tests, actual committed PR-contract validation, and diff checks passed for the amendment; independent review passed on the exact candidate.
Twenty-four focused SQL checks passed on an earlier implementation draft; subsequent source edits have not received full acceptance verification.
The isolated development container is `supabase_db_issue178-servicing` (database port 54832), configured from a temporary copy at `C:/Users/samar/AppData/Local/Temp/antiquetrail-issue178-db`; synchronize final migrations before using that copy for a clean reset.
No shared database reset, hosted deployment, Stripe call, or paid activation was performed.
