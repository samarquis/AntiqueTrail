# Store-first scope and delivery review

September 11, 2026. Evidence baseline: `origin/main` at `f182871d9de0d5db2a30ad0de9ac8dc72467648b`. This is a review and proposed reset, not an adopted requirement or release approval. See [proposed PRD](PROPOSED_PRD.md) and [work queue](WORK_QUEUE.md).

## Finding

The immediate problem is a mismatch between the business the owner wants to test and the product the plan requires, compounded by broad diagnostic tickets and unreliable execution handoffs. More model time does not resolve those problems by itself. The owner wants antique stores to display their details and photos, maintain a listing, and optionally pay for a larger gallery. The current plan makes a complete shopping-day planner and a staged regional expansion program prerequisites to that business.

There is substantial reusable implementation. This is a prioritization and completion problem, not evidence that the application must be rewritten.

## Current GitHub and preserved work

At this review's initial live read there were **five open issues and three PRs**, not six unfinished coding features. Seven recent engineering issues were already closed through merged PRs: #319/#330, #320/#331, #322/#336, #326/#335, #327/#332, #337/#339 and #338/#340. #341 was closed NOT_PLANNED after its alleged mobile defect was disproved; it is not a delivered fix.

| Open issue | Actual remaining work | Disposition |
| --- | --- | --- |
| [#321](https://github.com/samarquis/AntiqueTrail/issues/321) | Configured two-account trip diagnostic; stable acceptance failure has no established server cause; accepted-partner removal is absent from the inspected client/UI contract | Preserve PR #334. Separate diagnosis and missing functionality. Recommend deferring trip work from the store showcase after plan amendment. |
| [#323](https://github.com/samarquis/AntiqueTrail/issues/323) | Admin diagnostic; isolation repair already committed locally, but no valid completed run on that commit | Preserve PR #333 and finish its bounded remaining work; do not recreate the suite. |
| [#324](https://github.com/samarquis/AntiqueTrail/issues/324) | Owner's actual computer/phone evaluation and decision | Human gate; cannot be closed by simulated personas. Existing preparation is #251. |
| [#325](https://github.com/samarquis/AntiqueTrail/issues/325) | Actual human device/assistive-technology observations | Human gate. Give the already-written worksheet in PR #329 a separate documentation closure. |
| [#328](https://github.com/samarquis/AntiqueTrail/issues/328) | Findings map and final reconciliation | Tracking only; not a coding assignment or a reason to serialize independent work. |

PR #334 head `f47420dc070f4ecc291d535f9adc506cc3c92d01` and PR #333 head `665ec480b8251ae66f53274c48c9e5cbcb61a50b` were both CONFLICTING/DIRTY. Only governance and a skipped Supabase preview were attached to those heads in the initial snapshot; missing web/database checks are not successes. PR #329 head `abb71b0cf4f297664dde137cf7ab5470d595b7df` was mergeable but behind, with successful web/database and a later successful governance run after an earlier governance failure. It contains one 122-line worksheet and no application change.

Original #323 worktree: `C:/Users/samar/.codex/worktrees/fc1f/AntiqueTrail`, clean at unpublished `9009adbc01fe55dcb08f217c82b7cf423014a554`. That commit adds separate desktop/phone Administrator identities and related fixture/readback corrections. Its fresh run was stopped during startup. It has no valid full result. Preserve and review it instead of implementing the same repair again.

Original #321 worktree: `C:/Users/samar/.codex/worktrees/d7de/AntiqueTrail`, at the published PR head with a staged Docker-runner edit, five unrelated modified source files, untracked artifacts and a quarantined dependency directory. Do not blanket-stage, reset, stash, delete, or publish those leftovers. Latest completed diagnostic reported generic correct-recipient acceptance failure on desktop and phone with cleanup `removed`; cause remains unknown. The owner stopped these workers and their supervision loop. This review does not restart them.

The user's main checkout was clean but behind, at `394adc4fda278ad93848e68e44fc4cf6194f61e0`. Review artifacts use a separate worktree from fetched main. Existing checkouts were not modified.

## Why the work took so long

1. **Five checkboxes concealed many tasks.** #321 includes service provisioning, Auth identities, browser login, invitation acceptance, three privacy denials, revocation, two viewports, cleanup, negative controls and result accounting. #323 similarly bundles MFA, fixture grants, cancel/revoke/regrant, replay denial, audit readback and viewport isolation. Limiting the number of bullets did not limit the work.
2. **Test setup failed before the intended behavior could be judged.** Desktop consumed nine of ten allowed admin operations; phone consumed the tenth and was then denied. #341 incorrectly treated the next denial as a mobile product bug. Another run began before a source change and later consumed the new test input contract, producing `No Administrator fixture for desktop`. Use one frozen candidate and per-run/per-variant state.
3. **Conflicts were mistaken for mysterious missing CI.** Both remaining engineering PRs conflict with main. Repeatedly rerunning or resuming before resolving the actual conflict is ineffective. Main protection currently requires strict `web`, `database`, and `plan-governance`; keep those checks.
4. **The published PR did not describe the newest work.** The admin fix exists only in its worktree. PR prose still reported earlier Docker unavailability while later comments recorded actual runs. A new worker has to reconstruct which statement applies to which SHA.
5. **A diagnostic found unfinished functionality.** `TripClient` has pending-invitation revoke and self-leave but no creator-removes-accepted-partner operation; the collaboration UI only offers revoke for pending invitations. The PR's spec waits for a missing `Remove partner` button. That is separate from diagnosing why valid acceptance currently fails.
6. **The plan itself creates a long path to revenue.** PRD `Regional Public MVP` includes Candidate Share, public reviews, trip collaboration, hours-aware ordering, Go and offline trip use. `Stage dependencies` then places paid activation after regional release, RG-01, and three individually approved community expansions. These are selected product/research policies, not Stripe integration requirements.
7. **Everything looks like one queue.** A human gate, tracking issue, diagnostic, product defect and documentation PR have different owners and definitions of done. Treating them all as unclosed coding work leads to repeated agent wakeups.

The six primary contracts total approximately 63,793 whitespace-delimited words; PRD alone is 1,255 lines. This measures reading burden, not defect count. Specialist controls need not disappear, but a routine worker should receive exact headings and a bounded outcome rather than reconstruct the whole program.

## What already exists

| Business capability | Current source evidence | Remaining uncertainty |
| --- | --- | --- |
| Anonymous store browsing, details and photos | `src/features/catalog`, `src/app`, README's local fictional catalog | This review did not run a new browser demonstration or verify a hosted client URL. |
| Account sign-in and recovery | `@supabase/supabase-js` in package.json; auth feature and configured composition | Real provider configuration, email delivery and actual deployed journeys require their own evidence. |
| Store updates, hours, photos and approval | Portal, media, partners and admin features; #322 merged real-local hours coverage | Full store onboarding-to-approved-photo journey is not newly accepted here. |
| Owner acquisition page | #172 and #253 closed; acquisition behavior is gated by current source/plan | Public availability is not proved by closed tickets. |
| Paid gallery | Billing feature; Checkout, portal, webhook, expiry and servicing Edge functions; #177/#178/#179 closed | Existing code is staged capability, not live sales/provider acceptance. PROJECT_STATE includes older implementation statements that need a dated refresh. |

We already use the relevant providers. [Supabase Auth](https://supabase.com/docs/guides/auth) supplies identity and integrates with database authorization; it does not decide which store a representative owns. [Stripe Checkout and its sample integration](https://github.com/stripe-samples/checkout-single-subscription), [customer portal](https://docs.stripe.com/customer-management), and [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) provide standard payment flows. The application's store entitlement and verified-event handling remain necessary. Replacing providers now would add migration work without evidence that they caused these ticket failures.

## Recommended scope decision

Make the next milestone a store showcase the owner can use and evaluate: browse, open a shop, examine photos and details, then see how a representative maintains that shop and how an admin approves it. Keep existing favorites as an optional supporting action. Preserve trip code and its unresolved findings, but remove trip completion, public reviews, routing, offline navigation and community expansion from this milestone's critical path.

The owner explicitly selected **larger photo galleries first; featured placement later**. Recommend Free plus one initially offered paid Gallery tier, using the existing cover+5 and cover+15 boundaries. Preserve Full Gallery code/spec history but do not make custom paid-to-paid scheduling a first-offer requirement. Do not change current subscribers or live billing based on an assumption that none exist; verify actual provider state before any later migration.

Separate three outcomes: an internal fictional demonstration, a small permitted real-store pilot, and a paid pilot. The first is not proof of the other two. Replace geography/research prerequisites to the first sale with evidence for the actual offer, actual owner consent, provider setup, secure entitlements and operating readiness. Exact scope is in the proposed PRD; existing gates remain authoritative until that amendment merges.

## Adversarial review of this recommendation

- A smaller ticket count or more closed issues is not customer value. The stopping point must be a verified usable journey and the owner's observations.
- Twenty tickets would be worse if they each rediscovered the environment or modified the same files. Create work only for a reproduced gap; use review checkpoints inside an existing nearly finished PR.
- A directory may have less differentiation than the original trip vision. Test whether stores and shoppers value its photographs and trustworthy details before funding additional features. Do not invent market validation.
- Defer features by stage; do not silently remove security from still-reachable features. Hiding navigation is not server-side disabling. Preserve privacy, MFA for privileged roles, exact-store scope, photo rights/moderation and payment verification.
- A screenshot or fixture showcase is not a functioning client pilot. A client-facing link needs a verified deployment and permitted content; no live link is claimed by this review.
- No benchmark here proves a particular model will finish reliably. Low-effort Terra is a reasonable assignment for a precise, low-risk, preflighted task; ambiguous Auth/SQL/payment diagnosis and final boundary review remain higher-judgment work.
- Do not replace this reset with another broad architecture rewrite, new workflow framework, large generated fixture library, or speculative backlog. Keep the existing stack and visual identity.

## Decision and adoption boundary

All application changes, public hosting, outreach and paid activation are outside this review. The protected plan is unchanged. Under `PLAN_GOVERNANCE.md` → `Authorized plan-change process`, adoption requires the owner's explicit `update plan` directive, consistent specialist amendments, an append-only changelog receipt, independent review, required checks and merge. The companion proposed PRD specifies the decision to approve; the work queue specifies the source migration and bounded execution.
