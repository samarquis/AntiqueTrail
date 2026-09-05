# Issue 178 downgrade mechanism proposal

Status: proposal only; no plan authorization or implementation acceptance.
Base: `5b03ff79328ae07a2b3586b1e4ea549fb87463f9`.

## Verified contract and provider behavior

`PRODUCT_DECISIONS.md`, `Photo-tier memberships: onboarding, pilot grandfathering, and tier changes`, `Mid-cycle tier changes` explicitly names `stripe.subscriptions.update` for cycle-end downgrades.
The same decision requires cycle-end effect, last-scheduled-wins, no downgrade proration, and one subscription/invoice stream.
`PACKAGE_CONTRACTS.md`, Package 13, carries those acceptance requirements.

Stripe documents [Subscription Schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules) as the mechanism for automatic future subscription changes, including schedules attached to existing subscriptions, automatic phase transitions at `end_date`, and `proration_behavior=none` on transitions.
Its [subscription update API](https://docs.stripe.com/api/subscriptions/update) changes subscription items when the request executes; a local update worker at renewal has no demonstrated atomic ordering against Stripe's renewal invoice creation.

Independent read-only review confirmed that schedules preserve the intended billing policy but cannot be certified against the literal API clause without clarification or amendment.
This is an implementation-mechanism ambiguity, not a claim that cycle-end downgrades are impossible.

## Proposed exact amendment

Replace only the downgrade-mechanism sentence under `Mid-cycle tier changes` with:

> Downgrades take effect at the current billing-cycle boundary through a Stripe Subscription Schedule attached to the exact existing subscription, preserving one subscription and invoice stream. The active phase preserves the current price through that boundary; the next phase applies the last accepted scheduled target with no proration. Rescheduling updates the same schedule with durable idempotency and version checks; cancellation, upgrades, pause, and replay must reconcile that schedule without creating another subscription. Only verified provider events apply the corresponding local entitlement change. Excess photos above the new limit hide at downgrade and are preserved for a 30-day grace period before deletion.

Reconcile the same mechanism in `PACKAGE_CONTRACTS.md` Package 13, `docs/specs/store-membership-spec.md` USP-03, and any affected security/interaction clauses, then append the authorization to `PLAN_CHANGELOG.md` in a dedicated independently reviewed plan PR before dependent implementation lands.
This proposal changes no prices, tier capacities, refund windows, or activation gates.

Requested Product Owner directive: `update plan: allow Stripe Subscription Schedules on the existing subscription for cycle-end, last-scheduled-wins downgrades, with no proration and one invoice stream, as proposed for issue 178`.

## Draft checkpoint and limits

The issue is claimed on `codex/issue-178-servicing` in its existing isolated worktree.
The local draft includes consent/change/refund tables, servicing RPCs, partial provider code, and partial media/lifecycle work; it is incomplete and must not be deployed or merged.
The compensation helper deliberately cannot report financial compensation complete; exact charge/proration attribution and successful compensation remain unfinished.
The provider request binding, webhook routing, portal servicing-only configuration, lifecycle/media recovery, concurrency tests, and full acceptance proof still require work.

A fresh isolated Supabase container `supabase_db_issue178-servicing` was started with the repository migrations at that point in the draft.
The then-current 24 focused SQL checks passed after correcting worker-function grant ordering; later provider/media/lifecycle edits have not received complete migration or behavioral verification.
There is no implementation review PASS, hosted-CI proof, merged PR, or issue-closure claim.
Separate exploratory databases `issue178_servicing`, `issue178_verify`, and `issue178_test2` in the existing local container are disposable; they are not acceptance evidence and no shared database was reset.
