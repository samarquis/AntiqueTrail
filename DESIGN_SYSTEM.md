# Antique Trail Design System and Screen Contract

Status: approved planning baseline, including the 2026-08-18 Midnight Archive visual-identity update. This file makes the accepted direction reproducible; it does not authorize unrelated application coding.

`DESIGN.md` controls behavior and journey intent. This file controls exact visual tokens, recurring component states, responsive behavior, navigation, and screen-level acceptance. `docs/design/ICON_PLACEMENT_SPEC.md` controls the approved placement of the Antique Trail icon family. Product, security, or retention policy never comes from a prototype.

## Concept evidence and implementation authority

- Concept-only repository reference: `docs/design/antique-trail-flow-lab.html`; it is not implementation traceability or acceptance evidence until reconciled
- Provenance: recovered from the accepted self-contained playable flow lab; source SHA-256 before reconciliation was `8A679CE616634B6BE19172FE51FED181C37F5941F023A9620834FF70D1CD38E1`
- The repository copy corrects two stale labels: Store Partner invitations expire after 30 minutes, not 24 hours; two-year privileged-audit retention is approved while D31 full UI/export remain unresolved.
- The prototype's role switcher, editable labels, fictional content, fake QR, and exploratory D31 screen are test-lab controls, not production features.
- Until the HTML is reconciled, documented intentional prototype divergences are: its role/user controls, permanent Go tab, profile-like Home start, global pace, hybrid 5A/5B route output, unqualified public/synthetic labels, non-operable Undo examples, undersized 13px essential freshness/provenance text, and exploratory D31 audit UI. None may be copied into implementation or used to pass a package. `DESIGN.md`, the route/screen contract below, and package browser evidence control.

## Visual tokens

### Color

| Token | Value | Use |
|---|---:|---|
| `ink` | `#202833` | Blue-black primary light-theme text and icon outline |
| `muted` | `#5D6876` | Slate supporting text and geography |
| `paper` | `#F6F4F0` | Soft stone app canvas |
| `card` | `#FFFDFC` | Lifted ivory card, field, and dialog surface |
| `line` | `#D8DCE2` | Cool-gray divider and neutral border |
| `teal` | `#4C628A` | Legacy token name: slate-blue primary action and active state |
| `teal-dark` | `#344A70` | Legacy token name: deep slate-blue hover and link color |
| `mint` | `#E2E7F0` | Legacy token name: pale slate selected and active background |
| `rust` | `#A75E4D` | Clay: destructive and important-new status |
| `gold` | `#B98B45` | Aged brass: warning and freshness attention |
| `olive` | `#68758A` | Legacy token name: slate context/eyebrow label |
| `focus-inner` | `#FFFDFC` | Two-pixel inner focus boundary on dark/color surfaces |
| `focus-outer` | `#202833` | Four-pixel outer focus boundary on light surfaces |
| `dark-paper` | `#121519` | Midnight Archive charcoal canvas |
| `dark-recess` | `#1A1F26` | Blue-black recessed navigation and inset surface |
| `dark-card` | `#252B33` | Charcoal-slate raised card, field, and dialog surface |
| `dark-line` | `#3B4552` | Dark-theme slate divider and border |
| `dark-ink` | `#F3EEE4` | Soft ivory primary text |
| `dark-muted` | `#B7B0A5` | Warm gray supporting text |
| `dark-teal` | `#8795B5` | Legacy token name: dusty-blue active control, route, and link accent |
| `dark-gold` | `#B99554` | Aged-brass warning and freshness attention |
| `dark-rust` | `#B56E5B` | Weathered-clay destructive and important-new state |

The visual direction is **Daylight Archive** in light theme and **Midnight Archive** in dark theme: a quiet stone-and-slate companion by day, charcoal and dusty blue by night, with aged brass and clay reserved for meaning. No teal, mint-glass, bottle-green, parchment, sepia, distressed type, barnwood, or decorative antique clutter. `docs/design/PALETTE_PROPOSAL.md` and `docs/design/palette-midnight-archive.svg` are the approved visual reference for these tokens.

Approved contrast pairs: ink/paper `13.53:1`; muted/paper `5.16:1`; white/slate-blue `6.14:1`; white/clay `4.83:1`; ink/brass `4.84:1`; dark-ink/dark-paper `15.83:1`; dark-muted/dark-paper `8.52:1`; dusty-blue/dark-paper `6.10:1`; aged-brass/dark-paper `6.53:1`; weathered-clay/dark-paper `4.66:1`. Automated contrast checks still gate implementation.

Never communicate status with color alone. Pair each status color with plain text and, when space permits, an icon.

**Semantic color reservation**: `rust`/clay is reserved exclusively for destructive actions, danger states, and important-new status indicators. Do not apply it to structural, geographic, or neutral labels such as area names, town labels, or category headings. Use `olive`/slate for eyebrow and section-label context, `muted` for secondary geographic or area text. `gold`/brass is reserved for warning and freshness-attention states; do not apply it to decorative dividers or general emphasis. `dark-paper`, `dark-recess`, `dark-card`, `dark-ink`, `dark-muted`, `dark-teal`, `dark-gold`, and `dark-rust` are production tokens for the Midnight Archive dark theme; they are activated in the application stylesheet under `:root[data-theme='dark']`, which `index.html` sets before first paint from the saved switcher choice or, when none, the system `prefers-color-scheme: dark`. The legacy CSS token identifiers (`teal`, `mint`, and `olive`) remain only for compatibility; their approved values are slate blue and slate, never teal or mint. They are not complete until verified against all approved contrast pairs in dark mode. Dark mode support is a mandatory acceptance check at every package boundary.

**Regression guard**: geographic and area labels (for example a store card's town label) use `muted`; link hover uses `teal-dark` in light theme and `dark-teal` in dark theme. `rust`/clay must never be introduced for neutral or geographic text, and dark mode must never use a clay-derived literal for those roles — the dark-mode token overrides are the only place dark colors are defined.

### Icon and app identity

`public/app-icon.svg` is the canonical Antique Trail install/fav icon: the approved V3 storefront mark with a keyed ivory cornice, slate-blue three-scallop awning, and ivory arched doorway on blue-black. Its identical PNG derivatives (`app-icon-192.png`, `app-icon-512.png`, and `apple-touch-icon.png`) are the manifest and Apple touch assets. The same mark is the compact header brand mark; do not substitute the former lettermark or a detailed feature icon.

The approved apparel/advertising companion is `docs/design/antique-trail-storefront-shirt-lockup.svg`. It uses the same storefront geometry above the `ANTIQUE TRAIL` wordmark. Keep the phone icon text-free; use the lockup when the brand name is needed.

The detailed icon family lives in `public/icons/`. `docs/design/ICON_PLACEMENT_SPEC.md` is normative for its placement: `app-icon.svg` is the compact header brand mark, `antique-store.svg` is the detailed Browse/navigation cue, `trail-map.svg` is the continuing My Trip cue, and the remaining icons are contextual to their named shopper-flow action. Icons orient and reinforce; required navigation, primary actions, statuses, and safety information always retain visible plain-language labels.

### Typography

`src/app/styles.css` owns the semantic typography API below. Token names describe content roles,
never a component or a current pixel value. Routes may select a role appropriate to their content,
but must not create a route-local family, size, leading, tracking, or weight. The scale is fixed at
all supported widths unless a token itself is documented as fluid.

| Role               | Tokens                                                        | Rendered value                               | Intended use                                                                                    | Responsive floor             |
| ------------------ | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------- |
| UI family          | `--font-ui`                                                   | Atkinson Hyperlegible, system UI, sans-serif | Body copy, controls, labels, facts, status and metadata                                         | Same stack at every width    |
| Display family     | `--font-display`                                              | Newsreader, Georgia, Times New Roman, serif  | H1–H3 and short editorial/image titles                                                          | Same stack at every width    |
| Caption            | `--type-size-caption`, `--type-leading-supporting`            | `13px/1.4`                                   | Nonessential timestamps, rights lines and decorative context only                               | `13px`; never essential copy |
| Supporting         | `--type-size-supporting`, `--type-leading-supporting`         | `15px/1.4`                                   | Secondary descriptions and compact facts that remain readable without carrying the primary task | `15px`                       |
| Label              | `--type-size-label`, `--type-leading-compact`                 | `16px/1.25`                                  | Buttons, form labels, navigation, status and uppercase metadata                                 | `16px`                       |
| Body               | `--type-size-body`, `--type-leading-body`                     | `18px/1.5`                                   | Primary application copy and task instructions                                                  | `18px`                       |
| Lede               | `--type-size-lede`, `--type-leading-body`                     | `20px/1.5`                                   | Introductory copy and emphasized supporting statements                                          | `20px`                       |
| Heading 3          | `--type-size-heading-3`, `--type-leading-display-relaxed`     | `23px/1.15`                                  | Card and subsection titles                                                                      | `23px`                       |
| Heading 2          | `--type-size-heading-2`, `--type-leading-display`             | `29px/1.08`                                  | Page sections                                                                                   | `29px`; 1.26× Heading 3      |
| Heading 1          | `--type-size-heading-1`, `--type-leading-display-tight`       | `42px/1.04`                                  | One page title                                                                                  | `42px`; 1.45× Heading 2      |
| Regular weight     | `--type-weight-regular`                                       | `400`                                        | Default UI copy                                                                                 | Unchanged                    |
| Strong weight      | `--type-weight-strong`                                        | `700`                                        | All emphasis and every display-family use                                                       | Unchanged                    |
| Display tracking   | `--type-tracking-display`, `--type-tracking-display-subtle`   | `-0.025em`, `-0.015em`                       | Headings and the compact brand wordmark                                                         | Unchanged                    |
| Uppercase tracking | `--type-tracking-uppercase`, `--type-tracking-uppercase-wide` | `0.08em`, `0.13em`                           | Short uppercase labels; wide is reserved for eyebrows                                           | Unchanged                    |

The normal H1/H2/H3 hierarchy is 42/29/23px, so each adjacent step exceeds 1.25×.
An HTML heading used as a card title takes the Heading 3 role; heading semantics do not force a
larger visual role. Image-art-direction text may remain fluid only beside an adjacent
`typography-exception` explanation. Decorative placeholder and navigation glyphs are not readable
copy and are the only other raw-size exceptions accepted by the stylesheet guard.

Body text must not fall below 16px on desktop or 14px on mobile for core content; primary application body copy remains 18px/1.5. Freshness, provenance, hours, warnings, privacy/publishing consequences, and recovery instructions are core content. Eyebrow/section labels identify page sections and sub-contexts (e.g., "Plan your stop", "What you'll find", "Antique Trail") and are core content; their minimum rendered size is 15px. Caption text may use 13px only for nonessential timestamps, rights lines, or decorative context. User text resizing to 200% must preserve function and reading order.

Production self-hosts licensed WOFF2 subsets for Newsreader and Atkinson Hyperlegible with `font-display: swap`; no Google Fonts request is allowed. Georgia and system-ui fallbacks preserve the hierarchy offline. The flow lab may use local/system fallbacks but is not production evidence.

**Font weight implementation constraint**: Atkinson Hyperlegible is a static font with exactly two available weights: Regular (`400`) and Bold (`700`). Do not specify intermediate values such as 500, 600, 650, 750, or 800 — the browser will silently round to the nearest available weight and the intended visual differentiation will be lost. Newsreader Bold (`700`) is the only licensed weight in production; do not specify 400, 600, or italic for Newsreader unless those weights are added to the licensed subset. Intermediate or variable weights are only valid when a confirmed WOFF2 variable font with a `wght` axis is loaded and explicitly scoped to that element.

### Space, shape, and elevation

- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48` pixels.
- Minimum target: `48x48` CSS pixels; prototype reference uses `50px` for primary controls.
- Field/button radius: `13px`; chip radius: `999px`; card/panel radius: `18–22px`; outer preview shell radius is not an application token.
- Standard card border: `1px solid line`; important-new card: `2px solid gold`.
- Standard card shadow: `0 5px 18px rgba(23,49,45,.06)`; dialogs/elevated shell: `0 16px 45px rgba(23,49,45,.12)`.
- Focus: dual boundary `0 0 0 2px focus-inner, 0 0 0 6px focus-outer`; on a card-colored field the inner boundary may be dark and outer light. At least one boundary must maintain 3:1 against every adjacent color in light, dark, forced-color, teal, rust, and gold states. Never remove focus without an equivalent tested replacement.
- Motion: short `150–200ms` transitions only for state feedback. Respect `prefers-reduced-motion` by removing animation and smooth scrolling.

## Component contract

| Component | Required anatomy | Required states |
|---|---|---|
| Primary button | Text label; optional leading icon; one dominant action per section | default, hover, focus, pressed, disabled with reason, loading without width shift, error recovery |
| Secondary/destructive button | Explicit label; destructive intent never icon-only | default, hover, focus, pressed, disabled, destructive confirmation |
| Search/filter | Search field, labeled submit/clear, filter chips, result count/status | idle, focused, active filter, loading, zero match, request error, cleared |
| Store card | Image/placeholder, name, area, category, hours/open text, freshness/provenance, Save/Add/View actions as allowed | default, keyboard focus within, saved, new, stale/warning, image failure, action pending |
| Status badge | Plain-language state plus non-color indicator | success/current, warning/stale, danger/closed/denied, pending/review |
| Form field | Visible label, optional help, input, associated error | untouched, focus, valid, invalid, disabled with explanation, server error with value retained |
| Dialog | H2 title, focused first meaningful control, body, cancel, explicit action | open, validation error, submitting, success/close; return focus to opener |
| Bottom navigation | Three role-appropriate destinations with text labels | default, current page, focus, unavailable with explanation |
| Toast/live message | Short result message in polite live region | success, neutral, error; never sole record of important state |
| Stop list | Number, store, area, hours/state, provenance, explicit actions | ready, warning, removed with Undo, reorder keyboard controls, empty |
| Review/queue item | Type, scope/store, age/status, next action | new, pending, changes requested, approved, denied, revoked |

**Public media caption contract**: `MediaCaption` owns a figure's optional public caption and rights attribution on the shared opaque media surface. Its anatomy is caption then attribution; states are caption-only, attribution-only, both, or absent. It renders a semantic `figcaption`, has no keyboard/focus behavior, and renders nothing when metadata is absent; the calling figure owns image-failure recovery.

**Public media tile-overlay contract**: `MediaTileOverlay` persistently shows an optional caption and required “View Photo” action on the same opaque media surface. It is a visual duplicate hidden from accessibility APIs; the parent tile button owns pointer/keyboard/touch activation, visible focus, and an accessible name containing photo position, useful alt-equivalent text, and optional caption. Missing captions retain the action; failed images are replaced by the caller's named unavailable state.

**Public media position contract**: `MediaPosition` contains the current one-based photo index and total count on the shared opaque surface. Its normal and navigation-updated states use an atomic polite status; it has no direct pointer, keyboard, or focus behavior, and the modal's labeled controls own changes. Callers provide a valid index/count and own empty-media or failed-image recovery, including removing the status when no modal media remains.

Every new component must document anatomy, states, semantics, keyboard behavior, focus behavior, and failure recovery before its slice is ready.

**Status badge implementation rule**: When a status badge includes a decorative character or icon (e.g., `✓`, `●`, `?`, `→`, or an SVG), that character or element must be wrapped in `aria-hidden="true"`. The plain-language text label (e.g., "Open now", "Closed", "Stale listing") must stand alone as the complete accessible name without the symbol. Never rely on a Unicode character to carry meaning that is not also present in visible plain text alongside it.

**Decorative characters in links and buttons**: Directional or symbolic characters used in link and button labels (e.g., `←`, `→`, `↗`, `✕`) are decorative. Wrap them in `<span aria-hidden="true">` so screen readers receive only the plain text label. This applies to back links, external link indicators, and close/dismiss controls throughout the application.

**Dialog focus trap and inert background**: When a dialog is open, background content must be made inert using the `inert` attribute on a container wrapping non-dialog content, or an equivalent programmatic focus-trap mechanism. `aria-modal="true"` alone is insufficient — NVDA and some mobile screen readers still reach background content without `inert`. On close, remove `inert` before returning focus to the element that triggered the dialog. Keyboard Tab while a dialog is open must not reach background content.

## Responsive layout contract

| Effective CSS viewport | Layout |
|---|---|
| `320–800px` | Single column, full-width app surface, fixed/safe-area-aware bottom navigation, 16px side padding, sticky primary trip/detail actions only when they do not cover content |
| `801–1023px` | Centered app surface up to 720px, single-column task flow, sticky bottom navigation inside the surface, dialogs no wider than 560px |
| `1024px+` | Content shell up to 1100px; Store Browser may use two equal card columns; Store Details, trip, Store Portal, and Admin task flows remain a readable 720px maximum unless a reviewed table requires more width |

At 200% browser zoom, use the narrow/single-column layout based on the resulting CSS viewport. No horizontal scrolling for primary content. Reading and focus order remain identical across breakpoints. The current accepted baseline does not authorize a desktop-only left rail or dense dashboard.

## Production navigation and routes

The prototype role switcher exists only for testing. Production users authenticate into separate accounts/sessions; role availability is server-derived and never changed by a client-only switch.

| Audience | Route/screen | Primary navigation |
|---|---|---|
| Anonymous/shopper | `/stores` Store Browser | Browse |
| Anonymous/shopper | `/stores/:slug` Store Details | Back returns to preserved Browse state |
| Shopper | `/auth/sign-in`, `/auth/register`, `/auth/verify`, `/auth/mfa`, `/auth/recovery` | Just-in-time modal/route; return to safe interrupted action |
| Authentication | `/auth/register#receipt=<opaque>` (receipt-only stages), `/auth/callback#token_hash=<opaque>` | Copy the fragment secret to memory and scrub it before render/network; no third party, service-worker cache, referrer, log, telemetry, or browser storage; exchange once, then safe return or generic terminal failure |
| Shopper | `/more` stable secondary menu | Saved, Capture, Shares, Trip Ideas, Account & Privacy, Install, Help; stage-visible Research participation only when RG-01 is active; server-derived privileged links only |
| Shopper | `/saved` Saved Stores | Browse area secondary destination |
| Shopper | `/capture` Candidate Link capture | Browse secondary action |
| Shopper | `/shares`, `/shares/:shareId` Candidate Share inbox/outbox | Browse secondary destination; closed states reveal no reason |
| Shopper | `/trip-ideas` received/accepted ideas | Browse area secondary destination |
| Shopper | `/account/history` private visit/trip history | More; Back returns to preserved prior context |
| Shopper | `/trips` current trip and trip list | My Trip |
| Shopper | `/trips/new` trip creation and `/trips/:tripId/invite` one-partner invitation | My Trip |
| Invited shopper | `/trip-invitations#token=<opaque-token>` | Exchange/scrub fragment, authenticate matching verified email, disclose exact shared fields, then accept or show expired/revoked/consumed/wrong-account terminal state |
| Shopper | `/trips/:tripId/plan` Package 5A Review Hours / Package 5B Check My Day | My Trip |
| Shopper/Navigator | `/trips/:tripId/go` active trip | Persistent Resume Go/View Progress banner; never a permanent tab |
| Shopper | `/trips/:tripId/summary` private visit summary/history entry | My Trip |
| Eligible shopper | `/stores/:slug/review`, `/reviews/:reviewId/edit` | Store Details / visit summary; absent while stage capability is off |
| Shopper/Store Representative | `/reviews/:reviewId/appeal` | Review status/report history; exact scoped eligibility |
| Anonymous/shopper | `/stores/:slug/updates` all approved Store Updates | Store Details `See all`; Back restores the exact store scroll/focus |
| Anonymous/authenticated shopper | `/stores/:slug/correction`, `/corrections/:correctionId` | Draft may be anonymous; JIT-auth submit; own status only |
| Shopper | `/install` | Optional install/instructions; no token; never blocks Browse |
| Shopper | `/account/privacy`, `/account/export`, `/account/delete`, `/account/delete/cancel` | Signed-in profile; cancellation-only mode after deletion request |
| Shopper | `/account/restrictions` | Own feature-scoped restriction/reason/end/appeal only; no fraud/reporter detail |
| Store Representative | `/store-portal` home | Store |
| Pending Partner | `/partner/join#token=<opaque-token>` → `/partner/join` → `/partner/verify` → `/partner/draft` → `/partner/status` → normal `/auth/sign-in` with MFA → `/partner/activate` | Exchange/scrub before any third-party request; one phone task/screen; activation requires authenticated exact grant; activation tasks 4–5 precede Store Portal |
| Claimant | `/stores/:slug/claim`, `/claims`, `/claims/:claimId` | Absent until Package 10B; verified-email/MFA; own reason-neutral status; no document upload |
| Store Representative | `/store-portal/hours`, `/updates`, `/changes`, `/media`, `/social`, `/support` | Store subnavigation |
| Store Representative | `/store-portal/support/:caseId`, `/store-portal/preview` | Own exact support case / server-authorized public-listing preview; Back restores portal task |
| Store Representative | `/store-portal/promotion` | Exact-store flyer/channel consent and withdrawal; More; Back restores portal task |
| Administrator | `/admin` home | Review |
| Administrator | `/admin/review`, `/admin/review/:caseId`, `/admin/access`, `/admin/support`, `/admin/support/:caseId` | Exact typed case, Review / Access / More; Back restores queue/filter/claimed-lock state |
| Administrator | `/admin/moderation`, `/admin/moderation/:caseId` | Public-stage reason-coded moderation; absent before enablement |
| Independent appeal reviewer | `/appeal-review#token=<opaque-token>` | One-case MFA exchange; fragment scrubbed; expires at decision or 24 hours |
| Independent break-glass reviewer | `/break-glass-review#token=<opaque-token>` | One-case WebAuthn exchange; fragment scrubbed; exact redacted packet; submit within 24 hours; never normal navigation |
| Independent reviewer setup/recovery | `/reviewer/setup#token=<opaque-token>`, `/reviewer/credentials#token=<opaque-token>`, `/reviewer/recover#token=<opaque-token>` | Product-Owner-receipt-bound one-use setup; two non-discoverable WebAuthn credentials; separately identity-verified ten-minute management capability supplies exact `allowCredentials` before fresh list/revoke assertion; repeated identity proof before one-use all-credential recovery; never normal sign-in |
| Administrator | `/admin/audit` | Narrow D30 View Audit only; full D31 UI remains deferred |
| Readiness invitee | `/readiness/join#token=<opaque-token>`, `/readiness/status` | Exchange/scrub; matching verified email; own consent/grant/run/withdrawal only |
| Administrator/Operations | `/admin/readiness` | Exact cohort/case operational view; no participant-to-participant or private trip/location disclosure |
| Eligible shopper | `/account/research/rg-01` | Own consent/withdraw only from More while RG-01 is active; never totals; Back returns to More |
| Operations/Product Owner evidence holder | `/admin/evidence/rg-01`, `/admin/evidence/rg-01/:runId`, `/admin/evidence/rg-01/:runId/sign` | More → Evidence; Operations prepares/freezes, exact ProductOwner responsibility signs/rejects frozen digest; Back restores run list/filter |
| Operations/Product Owner evidence holder | `/admin/communities`, `/admin/communities/:runId` | More → Communities only after RG-01 and selected area; prepare/freeze/cancel/status, exact ProductOwner responsibility signs readiness; activation/rollback/reactivation are protected deployment actions |
| Primary Internal Tester evidence holder | `/admin/communities/:runId/gate` | Communities → current-area gate only after evidence freeze; exact PrimaryInternalTester responsibility passes/rejects; Back returns to community detail |

Protected deep links preserve the requested destination through authentication. Wrong-role or revoked access returns a generic access-denied screen without revealing hidden resource existence. Browser Back returns to the previous usable context and preserves non-sensitive query/form state.

Route contracts use the page H1 as entry focus, provide an explicit visible Back/Cancel route, retain only non-sensitive draft/query state, and end in one named terminal state. Candidate capture ends in saved private Trip Idea or preserved manual draft; Candidate Share ends Pending/Accepted/reason-neutral Closed; trip invitation ends accepted/expired/revoked; onboarding ends pending/changes-requested/approved/rejected/withdrawn; support ends resolved/reopened; admin review ends approved/changes-requested/rejected. Every failure preserves safe user-entered data and names Retry, Back, or contact support. Wrong-role/not-found states never disclose resource existence.

Stage action rule: Package 1 Browse/Details hides Save, Add to Trip, private rating/note, and Report Correction because no backing authorization/write contract exists. It may show valid Website, Call, and external-map-address links. Later packages add each action only when its full loading, auth-return, write, failure, Undo/deletion, and authorization states are executable.

### Shopper navigation and staged Browse filters

The only shopper bottom navigation is `Browse | My Trip | More`. No required destination is gesture-only or icon-only. Browser Back preserves server query/filter state; route change focuses H1. An active-trip banner never covers focused content at 200% zoom.

Search and filters execute server-side and always preserve a readable list. Package 1 provides only name/town/category search and manual area over its bounded 12-store fixture. Package 3 adds Saved and Visited. Package 5B adds approximate selected-area-centroid distance and synchronized secondary map. Package 10A adds Open Today, Open Now, freshness, release-scale indexing, and revision-bound pagination only when regional size or measurements require them; Browse never requests device location and labels distance `From [area] center`. Mobile provides Search plus labeled Filters opening full-width 48px controls with Apply/Clear; removable chips are a summary, never the only path. `Open Now` excludes incomplete/overdue hours. Zero/error preserves filters and offers Clear/Retry. Map failure leaves list/filter state intact.

### Fragment-token routes

`/auth/register#receipt`, `/auth/callback`, trip/partner/readiness/appeal invitation routes, `/reviewer/setup`, `/reviewer/credentials`, `/reviewer/recover`, and `/break-glass-review` share one rule: raw token exists only in the URL fragment and memory long enough for one exchange; replace history immediately before any render, font/image/analytics/provider request; send `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, and a no-third-party CSP; exclude from service worker/cache/log/error telemetry; show the same focusable generic terminal failure for invalid/expired/revoked/consumed/wrong-account states. Browser Back cannot redisplay the fragment or token-bearing document.

### Privileged navigation

Store Representative phone/tablet bottom navigation is exactly `Store | Updates | More`. `Store` opens portal home and groups Hours plus public Preview; `Updates` opens native Store Updates; `More` lists Changes, Media, Social links, Support, Promotion consent when enabled, Pilot consent/status, and Sign out. Administrator phone/tablet bottom navigation is exactly `Review | Access | More`. `Review` contains typed review/moderation queues, `Access` contains grants/invitations/revocation, and `More` contains Support, Readiness, narrow D30 Audit, Evidence and Communities when server-authorized, system status, and Sign out. ProductOwner evidence responsibility changes only exact frozen evidence links, never the navigation shell or application role. Desktop uses the same labels/order as a horizontal subnavigation; no new rail or destination appears. Current page uses `aria-current=page`; a hidden/stage-disabled destination is absent, while temporarily unavailable work remains labeled with a reason. Route change focuses H1; Back restores queue/filter/scroll without restoring a revoked case lock.

Privileged accounts may open `/stores` only through a labeled `View public directory` link that uses the anonymous/public projection. It does not create shopper saves/trips/reviews or change role. To perform private shopper work, sign out and use the separate shopper account; no client-side role switch exists.

### Partner onboarding progress

The owner completes five numbered tasks: 1 `Review invitation & consent` at `/partner/join`; 2 `Create/verify account & MFA` at `/partner/verify`; 3 `Submit store draft` at `/partner/draft`; then an unnumbered `/partner/status` wait/changes-requested/rejected screen while Antique Trail verifies authority; 4 `Review approved listing and scope` and 5 `Finish setup/install` at `/partner/activate` after approval. Only participant-controlled screens show `Step n of 5`; Status never pretends progress the owner can advance. Activation cannot load before the exact grant exists. Back never reopens a consumed token or skips the review wait. Task 3 draft is a one-field-per-screen sub-flow (`docs/specs/owner-onboarding.md`): field-level progress is a plain `Question n of 9` indicator, never a second `Step n of 5`; typed fields auto-save on advance and preserve on Back/failure. The activation checklist adds an optional, M-01-gated `Add a storefront photo` item (neutral placeholder before the media gate; Store Change Request with photo attachment after) that never blocks checklist completion.

### Store Share

Package 10A adds one Store Details action, `Share this store`. It shares the canonical public store URL through Web Share when supported and otherwise shows `Copy link`; cancel records nothing, success announces in a polite live region, and failure retains focus with Retry/Copy. Optional `src` is an allowlisted opaque campaign code, never identity or authority. One aggregate Share event is counted only after one explicit successful native-share invocation or clipboard copy; no recipient/app/account/device data is stored.

## Authentication screen flow

1. Private action records a safe return target and opens sign-in without performing the write.
2. Sign-in, registration, email verification, MFA enrollment/challenge, recent-auth, recovery, rate-limit, and revoked-session states use generic account-enumeration-resistant errors.
3. Successful authentication returns to the original context and asks the user to confirm the original private action when required.
4. Cancel/failure returns without the private write and preserves safe entered data.
5. Administrator and Store Representative routes require MFA; privileged mutations may add recent-auth confirmation.
6. Access token stays in memory; refresh-session persistence uses only the dedicated IndexedDB adapter. Logout/account switch clears it. Next-request session/grant revocation routes to generic signed-out/access-lost recovery without displaying cached private content.
7. Cancellation-only account state exposes only deletion cancellation, recovery, and sign-out. No visual route or stale service worker may reach another private action.

If the registration quarantine latch is `draining|blocked`, `/auth/register`, only an admission-bound signup-verification `/auth/callback` with UI type `verify`, `/partner/verify`, and any readiness registration step render one terminal state after fragment scrubbing/provider-token exchange: H1 `Account setup paused`; body `We couldn't finish this account setup. For your security, this attempt can't continue.` A callback with UI type `recovery` is existing-account password recovery, does not consult the registration latch, and follows the ordinary recovery flow. The paused-state primary action `Back to store list` goes to `/stores`, clears the interrupted return target, and cannot reopen authentication. Receipt-only partner/readiness variants add `Contact the person who invited you for a new invitation after account setup reopens.` Public mode adds the approved S-01 `Contact Antique Trail` channel. There is no Retry, registration resend, or reuse-old-link action. Purge email, password, receipt/token, and other registration fields from browser memory; retain no draft. Focus the H1, announce the state once, keep it readable at 320px/200%, and expose no incident, account-existence, provider, subject, or timing detail.

Each authentication slice must provide exact field constraints and error copy in its bounded execution contract before implementation.

## Shared asynchronous-state matrix

| Workflow | Loading/pending | Empty/blocked | Failure/recovery | Success/terminal |
|---|---|---|---|---|
| Account registration | Checking admission/provider confirmation | `Account setup paused` for any non-open quarantine latch | No Retry/resend; purge registration fields; Back to `/stores`; inviter or approved S-01 contact only | Pending verification or active only while latch remains open through completion |
| Catalog | Skeleton layout matching the expected result structure (shimmer card grid at ≥Package 3; at minimum a shimmer placeholder for each expected card). Plain text loading status is acceptable only within a Package 1 bounded internal review; it is not acceptable after External Testing Readiness. Skeleton must respect `prefers-reduced-motion` by removing the shimmer animation while preserving the placeholder layout. | No stores / zero matches with clear next action | Inline error plus Retry; keep query; `catalog_too_large` blocks bounded Package 1 rather than truncating | Results and count; Package 10A adds continuation only when measured regional size requires it |
| Candidate Share | Reason-neutral sending state | Closed without disclosure | Generic failure; retry only when safe/idempotent | Pending, Accepted, or reason-neutral Closed |
| Trip collaboration | Invitation pending or draft sync pending | Expired/revoked/wrong role | Stale-write conflict explains reload/reapply | Participant/role state confirmed server-side |
| Go/offline | Offline banner and queued-action count | Authorization lost or old device invalidated | Reject incompatible actions plainly; retain recoverable local work only as authorized | Ordered replay acknowledged; snapshot purged at lifecycle boundary |
| Store change | Draft/submitted/in review | Changes requested/revoked | Preserve draft and show reason/retry path | Approved snapshot and publication result |
| Administrator review | Queue loading/item locked | No work / access revoked | Failed mutation remains unresolved and auditable | Exact result, affected scope, and next item |
| Listing claim | Draft/signal verification/submitted | Stage off, wrong account, conflict | Preserve safe draft; own reason-neutral changes/support path | Approved exact grant, rejected, withdrawn, or revoked |
| Readiness | Invitation/consent/run pending | Expired/revoked/wrong account | Generic unavailable; preserve no raw token | Own active/withdrawn/expired status |
| Promotion | Private preview/removal requested | Capability off/consent withdrawn/quota stop | Plain failure plus do-not-distribute/removal task | Package 10B public artifact with canonical URL |

## Accessibility interaction contract

- One page H1; headings do not skip levels for visual sizing.
- Header, main, navigation, and footer/status regions use landmarks.
- Focus moves to the new page H1/main region after route changes, to dialog content after open, and back to the opener after close.
- Validation errors link to fields with `aria-describedby`; submit focuses the error summary then permits direct field navigation.
- Dynamic result counts, save/remove results, offline state, and background completion use appropriate polite live regions. Urgent security/session loss may use assertive announcement once.
- Reorder provides Up/Down controls and announces the new position; drag is optional enhancement only.
- Icons never replace required text labels. Images require meaningful alternative text or empty alt text when decorative.
- Reduced motion, dark theme, forced colors, keyboard-only operation, screen reader labels, 200% zoom, and text-spacing overrides are mandatory acceptance checks.

## Package screen contracts

These rows are the complete screen boundary. Field schemas/limits come from the named package and `SECURITY_AND_TRUST.md`; no screen may add a field, destination, authority, or public state. All routes use one H1, visible labels, error summary, 48px controls, retained safe values, phone-first single column, the responsive contract above, route-change H1 focus, dialog focus return, and Back to preserved non-sensitive state. Shared exact failure copy is: required `"[Field] is required."`; invalid `"Check [field] and try again."`; hidden/denied `"This item isn't available."`; conflict `"This changed elsewhere. Review the latest version before trying again."`; rate limit `"Too many attempts. Try again [time]."`; provider failure `"That service is unavailable. Your work is saved. Try again."`; stage off `"This feature isn't available yet."`; internal failure `"Something went wrong. Your work is saved. Try again."` Enumeration-sensitive flows use only their approved generic message.

| Package | Routes and entry hierarchy | Exact controls in task order | Required states/terminal | Authorization, navigation, and executable proof |
|---|---|---|---|---|
| 1 | `/stores`, `/stores/:slug`; H1 then query/area/category then cards/details | Search, Area, Category, Apply/Clear; card View; Details Website/Call/Map only | loading, 12-store results, zero, request error, not found, image/hours unavailable | anonymous Synthetic read only; Browse nav/Back state; phone/tablet/desktop, keyboard, 200%, RLS/browser proof |
| 2 | `/auth/register#receipt=<opaque>` in receipt-only stages, ordinary `/auth/register` only in public mode, remaining Auth routes, `/account/privacy|export|delete|delete/cancel|restrictions`; H1 then status/form | fragment exchange/scrub before UI; Email, age attestation, password, `Create account`; verify/recovery; MFA only when required/enrolled; sessions revoke; Export; deletion preview/confirm/cancel | checking admission, ready, generic unavailable for missing/malformed/wrong-email/expired/revoked/replayed; exact terminal `Account setup paused` with Back/inviter-or-S-01 contact and no retained draft/Retry; pending verification, active, cancellation-only, revoked; export queued/building/ready/failed/expired; deletion scheduled/cancelled/deleted | receipt token remains memory-only and is bound to `begin_account_registration`; public mode accepts no token; non-open latch never creates a profile; own account only, privileged MFA; More/return target; fragment/referrer/log/cache proof, direct-provider token redemption during drain/block, field purge, focus/320px/200%, epoch/revocation, lifecycle/accessibility proof |
| 9 reviewer | `/reviewer/setup#token` H1/explanation → credential 1 → credential 2 → Finish; `/reviewer/credentials#token` H1/fresh assertion → list; `/reviewer/recover#token` H1/warning → credential 1 → credential 2 → Finish; `/appeal-review#token` or `/break-glass-review#token` exact case | Add first/backup security key, Try again, Cancel, Finish; management capability then fresh Verify identity, list/Revoke; case packet then `Restore/Uphold` or `Compliant/Exception` plus plain reason | checking, ready, first-added/resumable, active; generic unsupported/cancelled/expired/replayed/revoked; assertion failed/expired; case submitted/late/disabled | setup/recovery after signed identity receipt; management capability supplies exact non-discoverable `allowCredentials`; case capability after fresh assertion; no normal account/session; exact allowlisted packet. H1/error-summary/focus return/live region, 320px/200%/keyboard/screen-reader plus management/origin/RP/replay/revoke/recovery/packet/expiry tests |
| 3 | `/saved`, `/account/history`, correction routes, augmented Details | Save; rating 1–5, visit month, private note, Delete; New Since dismiss; correction type/description/source/submit | JIT auth/cancel, saved/updated/delete-pending/Undo/deleted; correction submitted/triaged/resolved/closed | own-only private data; correction own status; Browse/More/Back; A/B isolation, Undo, empty/error proof |
| 4 | `/capture`, `/shares`, `/shares/:id`, `/trip-ideas` | URL/manual title/note, Extract/Save; recipient email/Send/Revoke; Accept/Dismiss/Block/Report; Trip Idea Edit/Delete | draft/extracting/needs review/saved; Pending/Accepted/reason-neutral Closed; edit conflict/delete confirmed | sender/named recipient/owner only; Add to Trip absent; enumeration/timing/SSRF/lifecycle/accessibility proof |
| 5A | trip list/new/invite/plan/go/summary routes | Name and date required at creation; start/departure/return optional in draft; Add/Remove/Reorder, priority/dwell, Review Hours; invite/accept/leave/Navigator; Start, Navigate, Arrived, Done/Closed/Skip/Restore; private memory | draft/ready/active/completed/cancelled; warnings without travel claim; offline queued/conflict/expired; Summary | Creator/Partner exact trip, Navigator device Go, author-only memory; My Trip/Resume banner; transition/offline/cross-account/keyboard proof |
| 5B | augmented Browse/Plan | Map toggle/list, Search this area; start/departure/return/limits; geocode candidates/confirm; Check My Day; Use suggested/Keep my order | ambiguous/no-result/provider unavailable; calculating; feasible/warning/no valid order | exact trip users; minimized provider call; list survives; payload/fallback/wrong-place/attribution/accessibility proof |
| 6 | partner join/verify/draft/status/activate, claim routes, Store Portal routes | exact five-step onboarding; hours/update/change/media/social/support forms; claim exact store/signals/submit/withdraw | token unavailable; pending/changes requested/approved/rejected/withdrawn; direct publish vs review status; claim stage off/conflict | receipt/Access plus verified email/MFA/exact store; Store/Updates/More; scope, file-gate, claim-cardinality, phone flow proof |
| 7 | `/admin`, typed review/detail, access, support detail, audit | queue filter/open/lock; preview; Approve/Changes/Reject with reason; grant revoke/regrant; duplicate preview/execute/rollback; narrow View Audit | loading/empty/locked/stale/decision success/error/revoked | MFA/recent-auth/exact case field allowlist; Review/Access/More; sibling/bulk/private denial and audit/focus proof |
| 8/8B | test/readiness evidence views plus existing routes; no public UI | reset/run checklist, evidence link/hash, sign/block; private cohort/store admission/withdraw | not started/running/passed/blocked; store ordinal 1–3; first-owner continue/withdraw | named internal/owner cohort only; no public nav/index; recovery/incident/older-adult/owner-value and isolation proof |
| 9 | review compose/edit/delete/appeal; admin moderation detail; independent one-case review | rating/text/display name/visit attestation/conflict disclosure; Publish/Edit/Delete/Undo/Report/Appeal; Hold/Remove/Restore/Dismiss; reviewer Restore/Uphold | stage absent; pending/published/held/removed/delete-pending/deleted; appeal pending/upheld/restored | author/exact-store/case reviewer only; 60-second Undo; aggregate, restriction, appeal, case-scope, responsive/accessibility proof |
| 10A | readiness join/status/admin plus private promotion preview | consent, Start/steps/return intent/withdraw; admin invite/exclude/freeze/sign; Store Share/flyer/QR/consent preview | invited/active/withdrawn/expired; run not-started/in-progress/completed/blocked; receipt draft/frozen/signed/rejected; Do Not Distribute | exact cohort/operations/Product Owner; no anonymous/public action; older-adult, catalog, artifact, privacy and CAT-01 proof |
| 10B | production smoke/release operations; public Store routes gain claims/reviews/share | exact frozen catalog preview, artifact/recovery/brand/security checklists, Promote/Rollback; public capability status | candidate/blocked/promoting/live/rolled back; channel continue/change/stop | deployment service plus signed evidence roles/Product Owner; exact catalog transaction; digest, anonymous/auth/claim/review/share/recovery/rollback proof |
| 11 | Shopper `/account/research/rg-01`; Representative `/store-portal/promotion`; Operations `/admin/evidence/rg-01`, `/admin/evidence/rg-01/:runId`; ProductOwner evidence holder `/admin/evidence/rg-01/:runId/sign` | shopper own consent/withdraw; exact-store flyer consent/withdraw; Operations Prepare/Recalculate/Freeze; evidence holder Review frozen digest/Sign/Reject with MFA/recent-auth and one-use capability | consent active/withdrawn; run draft/calculating/blocked/frozen/signed/rejected/superseded; failed derivation preserves prior frozen result and exposes Retry | shopper sees own consent only and never totals; Representative exact store only; Operations/Administrator without exact responsibility cannot sign; signer cannot alter derived fields; deterministic replay, linkage purge, role/focus/error recovery proof |
| 12 | Operations/ProductOwner evidence holder `/admin/communities`, `/admin/communities/:runId`; PrimaryInternalTester evidence holder `/admin/communities/:runId/gate`; public result is canonical `/stores?area=<approved-slug>` only after activation | Prepare exact area/selection; Freeze Catalog; ProductOwner Review/Sign readiness or signed Cancel with reason; read-only activation/rollback/reactivation status. Gate screen shows frozen checklist/failed-check codes and offers `Pass Gate` only when all pass or `Reject Gate` with required reason | prepared, readiness signed, cancelled, activating, live, activation failed/no public change, withdrawn, reactivating; gate calculating/frozen/pass-ready/failed/signed/rejected/conflict; expired capability offers Verify again, source change requires superseding freeze, stale version offers Review latest | protected workflow alone invokes Promote/Rollback/Reactivate. Operations/Administrator/ProductOwner cannot decide the postactivation gate; exact PrimaryInternalTester cannot alter evidence/audience. Prove focus/error recovery, failed-pass denial, authenticated rejection, stale/expired recovery, cancellation, same/different-area retry, crash-safe visibility, rollback/repair/reactivation |

## Screen traceability and slice readiness

| Journey | Required screens/states | Visual reference | Executable proof before acceptance |
|---|---|---|---|
| Browse to details | Browser, filters, new-store card, store card, details, errors/empty/not-found | This file/`DESIGN.md`; flow lab is concept-only | Component, keyboard, accessibility, phone/tablet/desktop browser tests |
| Build/check trip | Add, trip creation, Plan, stop list, setup, Check My Day, readiness | This file/`DESIGN.md`; flow lab is concept-only | State transition, warning/order, Back, shared-draft conflict tests |
| Navigate/review | Go, handoff, arrival, private rating/note, summary, offline/reconnect | This file/`DESIGN.md`; flow lab is concept-only | Navigator authorization, offline replay/conflict, privacy tests |
| Store Representative | Home, hours, updates, changes, media/social, support | This file/`DESIGN.md`; flow lab is concept-only | Store-scope denial, form/state, publication/Undo, accessibility tests |
| Administrator | Home, typed review, Access & Safety, narrow audit | This file/`DESIGN.md`; flow-lab D31 is excluded | Role/MFA/recent-auth, deny paths, audit result, accessibility tests |
| Public review | eligibility/attestation, compose, pending/published/removed, report, edit/delete, appeal | Package 9 row above plus `DESIGN.md`; flow lab is not authoritative | Stage-off denial, aggregate transaction, privacy, moderation/appeal, accessibility tests |

A slice is not ready to code until its execution contract names every required screen, field, state, responsive variant, authorization rule, failure route, and executable acceptance check. Later slices may refine this system but cannot silently diverge from it.
