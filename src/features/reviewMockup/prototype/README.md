# Full-site interactive mockup

Open [full-site.html](full-site.html) to explore the target shopper, owner and administrator journeys with fictional data. This standalone prototype preserves the supplied Browse composition and incumbent Midnight Archive/Daylight Archive visual language.

Keep the repaired artifact on `codex/mockup-workflow-fixes`, separate from main. It is a review artifact, not authorization to implement, merge, publish, activate billing or deploy. Screen coverage is not product acceptance or proof that production services implement these flows.

## Run and explore

Double-click `full-site.html`; its CSS, JavaScript, fonts and images are embedded. No package installation or application build is needed. Alternatively, from the repository root, if Python is available:

```powershell
python -m http.server 4187 --bind 127.0.0.1 --directory src/features/reviewMockup/prototype
```

Open [the local mockup](http://localhost:4187/full-site.html). Stop the server with Ctrl+C. If a preview server already owns port 4187, use its existing link instead of starting another.

- **All flows** opens a directory of 78 screens, grouped by audience. Directory links stage the appropriate fictional role and prerequisite state; they are shortcuts, not evidence of earned access.
- Start one of five guided journeys: **Visitor → favorite → trip**, **Store application → approval**, **Invited owner setup**, **Owner → paid plan**, or **Admin review & revoke**. Continue through the site's actions to explore connected behavior.
- **View as** switches among anonymous visitor, returning shopper Mara, other shopper Alex, owner Evelyn and administrator June. Owner and administrator are separate demo identities.
- **State** previews normal, loading, empty, failed-request, offline, expired and denied presentations. Relevant screens also offer specific failure actions.
- Use the theme control to compare light and dark. **Reset all demo data** in All flows restores the fixture. Reloading also resets fictional state; unsent drafts exist only in this page session.

Invited owner setup includes eight progressive store-data questions inside `#owner-facts`, followed by the ninth review screen at `#owner-review`. These substeps are additional presentations, not nine additional directory routes.

## Coverage map

Route names below are prototype hash fragments, not production URLs. Source documents remain the owners of requirements; this table records mockup reachability and actions without creating a new specification or backlog. [PRODUCT.md](../../../../PRODUCT.md) delegates to the PRD and named source owners.

| Source owner and sections | Mock routes | Key actions represented |
| --- | --- | --- |
| [DESIGN: Shopper entry, browsing; Store Details](../../../../DESIGN.md#shopper-entry-browsing-authentication); [Capabilities: Public store directory](../../../../docs/specs/product-capabilities.md#public-store-directory) | `browse`, `results`, `nearby`, `map`, `store`, `gallery`, `updates`, `correction` | Search/filter fictional stores, location/radius preview, open details/photos/news, submit a correction for simulated review. |
| [DESIGN: Authentication; Account and privacy controls](../../../../DESIGN.md#account-and-privacy-controls); [Security: Authentication; Privacy by default](../../../../SECURITY_AND_TRUST.md#authentication) | `signin`, `signup`, `verify`, `forgot`, `reset-password`, `mfa`, `mfa-setup`, `account`, `profile`, `security`, `export`, `delete-account`, `deletion-status` | Just-in-time account flow, verification/MFA previews, profile/security edits, export and deletion states. No real account or data lifecycle occurs. |
| [DESIGN: Favorites and sharing; Add to Trip; Plan mode](../../../../DESIGN.md#favorites-and-sharing); [Capabilities: Today's Trip](../../../../docs/specs/product-capabilities.md#todays-trip-requirements) | `saved`, `trip-chooser`, `new-trip`, `plan`, `private-stop`, `suggestion`, `review-hours`, `ready` | Favorite/share a public store, choose/create a dated trip, add private stop, reorder/remove stops, adjust duration, review hours, accept or keep an illustrative route order and acknowledge readiness. |
| [DESIGN: Go mode](../../../../DESIGN.md#go-mode); [Capabilities: Rating model; Private content lifetime](../../../../docs/specs/product-capabilities.md#private-content-lifetime) | `go`, `visit`, `summary`, `history`, `memories`, `memory`, `store-memory` | User-requested navigation preview, explicit arrival, done/skip/early finish, optional private review, read-only completed outing, repeat as a new draft, edit/delete separate memories and store summary. |
| [Owner onboarding: Journey map; Tasks 1–5](../../../../docs/specs/owner-onboarding.md#1-journey-map); [Owner authority: Eligible claims; Roles and authority](../../../../docs/specs/store-owner-authority.md#eligible-claims) | `for-stores`, `owner-invite`, `owner-search`, `owner-consent`, `owner-facts`, `owner-hours`, `owner-evidence`, `owner-review`, `owner-status`, `owner-activate` | Find/claim a store, expired invitation, consent summary, progressive draft, weekly hours/exceptions, authority evidence, submission/waiting/review outcome and exact-store Free activation. |
| [DESIGN: Store Owner workspace; Store Representative portal](../../../../DESIGN.md#store-owner-workspace); [Capabilities: Store Representative portal](../../../../docs/specs/product-capabilities.md#store-representative-portal) | `portal`, `listing`, `hours`, `photos`, `photo-upload`, `store-updates`, `update-edit`, `social`, `pending`, `closure`, `owner-help` | Edit direct-publish facts/hours/links, preview updates, stage a photo for moderation, preserve approved values while controlled changes await review, request closure and seek access help. |
| [Membership: Tier model; Paid activation decisions; Payment flow summary; Existing servicing obligations](../../../../docs/specs/store-membership-spec.md) | `plans`, `offer`, `checkout`, `billing`, `billing-portal` | Optional photo-capacity offer, simulated success/failure/abandonment, read-only billing summary and cancellation preview. Paid prices and capacities remain unresolved. |
| [DESIGN: Administrator experience](../../../../DESIGN.md#administrator-experience); [Owner authority: Revocation and enforcement](../../../../docs/specs/store-owner-authority.md#revocation-and-enforcement) | `admin`, `admin-claim`, `admin-change`, `admin-photo`, `admin-support`, `admin-access`, `admin-revoke`, `admin-audit` | Review authority, requested/current listing values and photos; approve/reject; reply to support; preview exact-store revocation and fictional audit entries. |
| [DESIGN: Support](../../../../DESIGN.md#support); [Security: Authorization](../../../../SECURITY_AND_TRUST.md#authorization); [PRD: Core features](../../../../PRD.md#core-features) | `help`, `request`, `support-detail`, `more`, `install`, `denied`, `privacy`, `terms` | Help/request/reply/resolution previews, role navigation, optional install guidance, denied access and privacy/terms previews. |

## Simulation and evidence limits

All stores, people, invitations, accounts, requests, grants, audit entries and transactions are fictional. Data changes affect in-memory JavaScript only. The prototype does not connect to production authentication, a database, email, media processing, support delivery, routing or payment services. Forms must use sample data, not real credentials, payment details or private records.

Route suggestions use a disclosed demo rule and fictional travel minutes. Hours checks use the saved fictional schedule and selected date; they do not verify real business hours or driving times. Map, location, navigation, sharing, upload/moderation, export/deletion, MFA, install and payment presentations do not prove those integrations. Client-side role switching is a storytelling aid, not a security boundary. Offline mode is an induced UI state; it does not implement durable offline writes or synchronization. Consent, terms and prices are not an approved legal or commercial offer.

The current [verification receipt](verification.json), [portable replay evidence](verification-replay.json) and [workflow repair review](workflow-review.md) bind the repaired HTML to 78 rendered pages, 390 direct presentations across five role fixtures, 19 connected observations and 33 passing assertions. Two independent reviewers cleared the final HTML source. Mobile planner widths 390/320 and application-review width 390 had no horizontal overflow. Original verification at base commit `2ccaebde` remains historical and does not apply to this changed HTML.

Each store now keeps its own application, grant, drafts, media reviews and billing preview through the **Store workspace** selector. Starting another application preserves existing approved access and begins a fresh Free/unpaid context. Visit completion does not depend on saving optional notes; final-stop Undo removes its stale history entry. News, approved facts, effective dates and review feedback connect to the intended store or outing.

Earlier exploratory records under `.codex/mockup-fixes/` include superseded attempts and stale helper metadata. Only the final hash-bound evidence in the portable receipt is used for final counts.

These records describe the local mockup run that produced them. They do not establish complete accessibility, older-adult usability, live authorization/privacy, provider, hosted or canonical-production acceptance. An affected artifact change invalidates prior evidence until rechecked. No database, backend or production-service change is part of this artifact.

## Deferred and excluded

Follow [PRD deferred implementation boundary and non-goals](../../../../PRD.md#deferred-implementation-boundary). No pretend production flows are added for AI item research, consumer subscriptions, public reviews/replies, shared-trip editing, Navigator transfer, mutable offline synchronization, owner teams, advanced analytics/promotions, regional programs, custom billing schedules or paid-to-paid transitions, weekend grouping, native Android packaging, taste profiles, collections, automated external-site extraction or in-app recipient sharing. Advertising, paid ranking, marketplace transactions, turn-by-turn navigation and background tracking remain outside scope.

Existing production records, permissions, subscriptions and retained-data obligations are unaffected. Demonstrating future paid flows does not activate or settle them.

## Visual continuity and asset provenance

The supplied Browse composition is retained: charcoal/cream surfaces, slate-blue controls, centered pill navigation, full-width antique interior, framed serif headline and adjacent search controls. Light mode uses the incumbent related palette. Newsreader headings, Atkinson body text, visible focus outlines and generous form controls carry through the other screens. Root `DESIGN.md` and `.impeccable/design.json` are preserved; this README creates no new global visual rules.

All embedded raster images and font files are existing repository assets copied unchanged into data URLs; no new asset generation or external image fetch is required:

- `public/fonts/Newsreader-Bold.woff2`, `AtkinsonHyperlegible-Regular.woff2`, `AtkinsonHyperlegible-Bold.woff2`.
- `public/images/synthetic-stores/800w/blue-finch-curios-cover.webp`, `blue-finch-curios-gallery-aisle.webp`, `blue-finch-curios-gallery-cabinet.webp`, `cedar-and-brass-cover.webp`, `juniper-house-cover.webp`, `prairie-cabinet-cover.webp`.
- Browse hero: `public/images/synthetic-stores/1280w/blue-finch-curios-gallery-aisle.webp`.

The store imagery is synthetic, not documentary photography of real businesses. Existing asset provenance and licenses remain authoritative. Interface icons are inline SVG paths.
