# ADR 0011 — Market at Macvicar public listing

- Status: Product Owner authorized; source contract takes effect after independent review and merge. Not a catalog, media, hosting, recovery, or deployment acceptance receipt.
- Date: 2026-10-04.
- Scope: one real-store listing, The Market at Macvicar, as the first eligible Browse result in the existing public test.
- Supersedes: ADR0010/PRD's fictional-only listing restriction for this exact record after its technical admission passes. It does not renew internal-review admissions or waive other real-store/provider controls.

## Decision

The Product Owner confirmed The Market at Macvicar is the first real client and directed publication of the already reviewed local listing as the next required step. This replaces the draft's test/dev-only publication intent for this exact listing; no further general publication permission is required. The first-Browse presentation requirement comes from the same release request.

Reuse the approved [store record](../plans/market-at-macvicar/store-record.json), [gallery wall](../plans/market-at-macvicar/gallery-wall.json), [rights manifest](../plans/market-at-macvicar/source-rights-manifest.json), and [draft handoff](../plans/market-at-macvicar/implementation-handoff.md). Historical statements that public launch was deferred describe the prior request; they do not override this decision or establish technical acceptance.

The approved name is The Market at Macvicar; slug `the-market-at-macvicar`; address 2307 SW 10th Ave, Topeka, KS 66604. Preserve confirmed America/Chicago hours, dated fact provenance, and unverified accessibility status. Do not infer present inventory from gallery images. The separate cover is historical, dated October 21, 2017, and needs exact-store/current-address suitability review.

## Exact-store catalog boundary

Normal store admission supplies one stable UUID for this real record. Record the exact identity, authority, reviewed public-field projection, admitted backend/origin, source/configuration/migration identity, lifetime, and revocation/stop receipt. Do not identify the admitted record by mutable name, email, slug alone, fixture ID, or a browser-supplied UUID.

Keep the existing twelve fictional UUIDs inventoried and governed independently. Add this single reviewed real UUID through an explicit server-side admission; do not relabel it synthetic, replace a fictional record, relax the allowlist to arbitrary stores, or enable all real-store catalog reads. Preserve origin, RLS/RPC, expiry, and private-data denial. Missing, expired, revoked, or mismatched real-store admission fails closed without inventing a card.

Anonymous reads may expose only approved catalog fields and published approved derivatives for this record. Listing admission creates no account, claim, Owner/Representative role, private access, external promotion tool, or privileged write. Registration and other unadmitted capabilities retain their current release gates. This amendment does not activate saving, maps, trips, correction submission, billing, or account/provider operations.

## First eligible Browse result

Server-side search, area/category, freshness, admission, and other selected-stage filters remain authoritative. When Macvicar qualifies, place its exact admitted UUID once before the existing result order and before result limiting or pagination. Preserve every other result's relative order. A query or area that excludes it must not receive it.

This is the explicit one-store test presentation decision, not paid ranking, a new sponsored tier, or a complimentary-benefit entitlement. Preserve the established Filter Apply/Clear interaction, readable list, manual area selection, no device-location request, and complete error/empty/retry behavior. Macvicar's `Save` and `Add to Trip` actions remain hidden or unavailable because neither capability is admitted for this real record; an existing account or global card action does not grant that access. Use existing cards, Details, and Photos; do not ship a production mock, fixture promotion, frontend-only prepend, or DEV-guard bypass.

## Approved media and benefit boundary

The approved opening selection is one separate cover plus fifty ordered gallery images. Fifty is not a plan maximum or a new tier. Preserve exact selected identifiers, content hashes, meaningful alternative text, factual captions, and source/permission records. Keep failed, excluded, unselected, disputed third-party, or unapproved assets out.

For this fixed opening selection, authorize a separate Administrator-curated publication path. It consumes only the previously reviewed derivatives after exact asset-level permission, current cover suitability, private quarantine, format/size validation, malware scanning, re-encoding/metadata-removal, and independent security/content review are evidenced. Require a protected Administrator approval receipt for each of the fifty-one exact public derivatives, bound to its hash, reviewed metadata, permission reference, approver, and approval time; local processing or an AI-written statement is not that receipt. A protected manifest pins the real store UUID, each derivative hash, public immutable same-origin path, cover/gallery order, alternative text, factual caption, rights label, permission reference, source version, expiry, and withdrawal owner. All fifty-one entries must pass before activation; failed, unselected, original, private, or disputed assets cannot enter the public artifact. Local preparation proves only its measured controls, never an external provider receipt.

The release owner may package these admitted derivatives as immutable public build assets and reference them from the protected database catalog projection. Public source may contain only deliberately approved public derivatives and sanitized publication metadata; private originals, permission correspondence, private paths, contact identities, credentials, and embedded metadata remain outside GitHub and the release artifact. Verify actual deployed image bytes, content types, hashes, and metadata denial; a SPA HTML response at a photo path fails acceptance. Asset changes require a new reviewed manifest and artifact.

This exact-manifest path does not enable `official_media_upload`, Owner intake, an upload endpoint, or a provider command. The normal [official-media contract](../specs/product-capabilities.md#official-store-profile-photos) and [M-01 acceptance](../operations/M01_MEDIA_PROVIDER_RUNBOOK.md) continue to govern future uploads and provider operations. Do not invent `provider_m` acceptance or manually manufacture M-01 approved/published upload rows. Record curated derivative publication separately from M-01.

Before publication, prove scoped rights withdrawal: revoke the catalog asset reference, publish an artifact excluding the affected derivative, invalidate/remove owned serving copies and caches, and verify denial at canonical and owned deployment URLs, including retained artifacts. Retain safe placeholders and unrelated text listing where appropriate. A previous public artifact containing withdrawn assets is not a valid rollback. If the selected static hosting cannot provide the required owned-copy removal/denial, use a controlled public derivative store with demonstrated withdrawal instead; no further general upload capability is implied. Expiry and stop apply to the real listing and its owned public assets; retain restoration material privately. Do not promise removal of copies previously downloaded by third parties.

The previously approved store-scoped highest-tier complimentary benefit remains inactive until its separately authorized authoritative activation. The existing [benefit decision](../plans/market-at-macvicar/store-record.json) starts its minimum five-calendar-year guarantee at actual activation, follows released store-level benefits, never requires payment, and cannot be reduced by paid lifecycle events. This listing amendment creates no subscription, charge, anniversary downgrade, Stripe call, role, or benefit activation.

The protected, reviewed manifest supplies read-only catalog-display capacity for exactly one cover and fifty gallery entries for this real UUID. This capacity is independent of Free/Gallery/Full Gallery Owner-upload limits and the inactive complimentary benefit. It permits no additional or replacement image without fresh asset/rights review and a new admitted manifest. Do not use fixture-only capacity, fabricate a tier or activation date, bypass future intake limits, or silently reduce the approved selection. Record this curated capacity receipt separately before claiming the full gallery is admitted.

## Hosting, recovery, and publication

The real-client use needs current provider eligibility. The fictional-test scope alone does not establish Hobby eligibility for a commercial store showcase. Record an eligible exact hosting/resource decision under current provider terms and existing cost constraints; no upgrade, paid trial, spend, automatic overage, new processor, or credential exposure follows from this source amendment. An ineligible plan blocks that provider operation while source preparation continues.

Preserve ADR0010's matching encrypted recovery, protected credential custody, isolated restore, measured recovery bounds, and tested stop/retained-artifact rollback controls. Preserve admission lifetime unless the Product Owner separately changes it. This source decision is not an H-01 pass, M-01 pass, protected-credential approval, recovery exception, or fabricated gate receipt.

The existing release owner retains the sole catalog/media/provider/upload/alias/binding lane. Source writers exchange reviewed committed SHAs; no duplicate publisher or shared database reset. Source/configuration/migration/media changes require fresh affected reviews, required exact-head CI, and a new sealed artifact. The prior design-only sealed artifact excludes Macvicar and is not this listing's publication candidate.

## Acceptance

The real catalog must return the admitted UUID once at index zero whenever it is eligible, retain unrelated result order, exclude it under nonmatching queries/areas, and deny other or unadmitted real records. Direct Details/Photos and reload must return the same real UUID and exact approved entitled media. Wrong/expired/revoked admission, spoofed origin, private reads, and privileged writes remain denied.

After required exact-head web/database/configured-owner-billing checks and independent Standards/Spec/security review, verify the deployed artifact bytes and canonical alias. On the actual canonical site, verify signed-out Browse first card, Browse → Details → Photos → back, direct routes, reload, narrow/wide layouts, light/dark presentation, keyboard/focus behavior, lazy delivery and image failure, and relevant console/network health. Record source, media/configuration/backend/binding identities separately.

Apply the [Design System accessibility and supported-browser matrix](../../DESIGN_SYSTEM.md#accessibility-contract): screen-reader labels and assistive-technology coverage, reduced motion, forced colors, 200% zoom/reflow and text spacing, and the supported browser/device matrix. Require zero Blocking Defects and no repeatable journey failure. Record each criterion's actual method and result; unavailable assistive-technology or physical-device proof remains explicit. The Product Owner withdrew tickets that require their separate personal website review; record that human-review disposition without inventing a human accessibility pass or weakening executable accessibility checks.

A push, local preview, build, provider Ready state, or withdrawal of the user's separate website-review ticket does not complete this delivery. This governing-document leaf closes on its reviewed merge; the real listing/publication outcome and parent release acceptance remain open until their actual receipts pass.
