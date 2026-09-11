# ADR 0009 — Store-first stage applicability

- Status: Accepted by the Product Owner's 2026-09-11 directive; effective on reviewed merge of #346. No implementation or activation receipt.
- Authorization: `update plan to the proposed store-first PRD`.
- Scope: internal store showcase, controlled real-store pilot and paid Gallery pilot described in [PRD.md](../../PRD.md).
- Supersedes: earlier product/package prerequisite sequencing only for these bounded stages, including ADR0006's blanket Packages 1–10B prerequisite. Provider topology, eligibility, funding, security and recovery controls remain. ADR0007/0008's particular assessment authority is neither extended nor renewed.

## Decision

The current product is a store showcase with optional paid photo capacity. Trips, route planning, Navigator/Go/offline, public reviews, regional release, RG-01 and three community expansions are not prerequisites to the internal showcase or controlled store/Gallery pilot. Those prior programs are retained history/deferred options, not the current delivery queue. The first offer is Free/Gallery; new Full Gallery sales and new paid-to-paid features are deferred. Existing code, data and provider obligations remain protected.

The PRD owns stage progression. [Security applicability](../../SECURITY_AND_TRUST.md#store-first-stage-applicability) owns necessary controls for the selected exposure. [Pilot activation](../../PACKAGE_CONTRACTS.md#store-first-pilot-activation-contract) binds the candidate, data, accounts/stores, explicit capability allowlist, authentic current approvals/evidence, expiry/stop and rollback. It cannot grant a capability not named and accepted. Public discovery, public registration/intake, promotion and live billing never follow automatically from a showcase or a controlled pilot.

## Preserved architecture and authority

Retain the React PWA, Supabase Auth/PostgreSQL, Stripe-hosted Checkout/customer portal and verified webhooks, Vercel/Supabase topology and approved visual identity. Existing shared-hosting eligibility/protection, real-data consent, exact-store role enforcement, privileged assurance/audit, media rights/moderation, retention/recovery, human support, legal/security/accessibility and public-release controls apply to their exposed boundary. R-01 and other deferred-feature provider requirements do not apply while those features remain unexposed.

ADR0005's funded hosting/media transition is separate from a Gallery membership. Selling Gallery neither authorizes paid infrastructure or R2/S3 migration nor changes source-image retention, quotas or photo-count entitlements. Existing provider-state and incumbent-servicing evidence must precede any later migration.

The default showcase is local/synthetic. A hosted review needs fresh applicable authorization and protection; the September 6 task/backend/expiry/participant bounds in ADR0007/0008 do not become generic permission. This decision grants no external contact, deployment, provider call, new participant, real data, spending, public promotion, live charge or receipt renewal.

## Implementation and acceptance consequences

This amendment changes requirements only. Existing runtime predicates remain fail-closed until separately admitted/reviewed implementation supports the selected pilot scope. Do not fabricate Regional/RG-01/community receipts to satisfy old code. Any necessary gate adaptation is a separate small ticket with direct allow/deny and rollback proof.

Acceptance must distinguish internal fixture use, actual local services, hosted CI, real provider operations and firsthand observations. A safe scoped owner demonstration need not wait for unrelated deferred features. A privacy, authorization, data-loss or payment defect cannot pass its selected path. Disabled routes require direct-server denial; retained private data and subscriber obligations keep their lifecycle/servicing protections.

## Alternatives and tradeoff

Completing the entire former trip/regional program before testing store value would retain the reviewed delay. Rebuilding auth, payments or the application would discard useful implementation without evidence of need. The selected approach preserves that work, shortens the current business experiment and accepts that later trip differentiation and expansion remain unproved.

## References

- [Approved proposal and findings](../research/scope-review-2026-09-11/REVIEW.md).
- [PRD stage dependencies](../../PRD.md#stage-dependencies).
- [Membership mechanics](../specs/store-membership-spec.md).
- [Plan governance](../../PLAN_GOVERNANCE.md#authorized-plan-change-process).
