# Antique Trail — Deep Spec-vs-App Review

**Reviewer**: Product Owner (browser-verified via the review harness + Playwright)
**Date**: 2026-08-16
**Harness**: `npm run dev:review` on `http://127.0.0.1:4175`; identities via `?reviewAs=<id>&reviewState=success`
**Scope**: Full production app vs `PRD.md`, `DESIGN.md`, `DESIGN_SYSTEM.md`, `PRODUCT_DECISIONS.md`. Complements the ticket review in `REVIEW_VERDICTS.md`.

## Verdict scale

| Verdict | Meaning |
|---|---|
| ✅ Spec match | Browser-verified; meets the controlling document's requirement |
| ⚠️ Deviation | Works, but differs from an explicit spec line; fix or consciously accept |
| 🔴 Gap | Mandatory acceptance check missing or broken; not ready without a decision |

---

## Spec-matching behavior (browser-verified ✅)

### First arrival — anonymous Browse (`DESIGN.md:44`, `DESIGN_SYSTEM.md:117`)
`/stores` loads anonymously with no location permission request and no sign-in gate; results are immediate; area selector and search-by-name/town/category present. Exactly per the Store Browser contract.

### Store Browser card anatomy (`DESIGN.md:60`, `DESIGN_SYSTEM.md:80`)
Card shows cover image + alt, store name (H2 link), town, category summary, description, today's hours + open state, freshness ("Verified for Synthetic testing"), Save action. ⚠️ One card deviation: no `Add to Trip` on the card (see Deviations).

### Visual tokens (`DESIGN_SYSTEM.md:24-62`)
- Body: Atkinson Hyperlegible `18px/27px` (1.5), ink `#172421`, paper `#F7F3E9` — matches tokens.
- H1: Newsreader 700 `42px/1.04` — matches Display/H1.
- Card surface: `#FFFDF7`, 1px `#D7D5C9`, radius 20px (spec 18–22), shadow `0 5px 18px rgba(23,36,33,.06)` — exact match.
- Primary button: teal `#0B7168`, radius 13px, min-height 48px — matches.
- "Open now" uses teal-dark `#07554F` 700 with text, not color alone — matches status rule.

### Responsive contract (`DESIGN_SYSTEM.md:102-104`)
- 320px: single column, 16px side padding, fixed safe-area bottom nav, no horizontal scroll (scrollWidth 305 ≤ 320). ✅
- 801px: centered 720px surface (main left 33/right 753), single column, fixed bottom nav — exact breakpoint behavior. ✅
- 1024px: two-column cards (479px each, left 16/515), static nav, no horizontal scroll. ✅

### Store Details anatomy (`DESIGN.md:80`, `DESIGN_SYSTEM.md:118`)
Cover + gallery with enlarge buttons, per-image rights/provenance captions ("OpenAI-generated fictional image · Internal Alpha only"), Navigate in Maps external link (↗ correctly wrapped in `aria-hidden` span), Add to Trip, Save store, private memory, Suggest a correction, hours table + special-hours exceptions (Labor Day), contact/location (tel/mailto/website), accessibility info with verification date, Latest updates, follow Instagram/Facebook, Source & freshness (listing source, source updated, details verified). Stage fail-closed behavior is correct: no public-reviews section and no Claim listing rendered (both correctly absent until later gates).

### JIT authentication (`DESIGN.md:53`, `DESIGN.md:26`)
`Add to Trip` → `/trips/new?addStoreId=…` → guarded route redirects to `/auth/sign-in?returnTo=…` with explicit status: "After sign-in, you'll return to the action you were working on. Review and confirm the private action there before it is saved." Cancel returns without saving. Exactly the JIT pattern.

### New-trip setup (`DESIGN.md:125-130`)
Trip name (required, maxLength 80) + Date (`type="date"`, required); start location/departure/return deferred to Plan. Matches.

### Focus (`DESIGN_SYSTEM.md:71`, `DESIGN.md:27`)
`:focus-visible` uses the exact dual boundary `0 0 0 2px var(--focus-inner), 0 0 0 6px var(--focus-outer)`; forced-colors fallback `outline: 3px solid Highlight`; route-change focus target on H1 (`tabIndex={-1}`). Matches.

### Bottom navigation (`DESIGN.md:29`)
Stable `Browse | My Trip | More`; Go is not a permanent tab. Matches.

---

## Deviations (⚠️)

### 1. Dark mode entirely missing — 🔴 Gap (`DESIGN.md:28`, `DESIGN_SYSTEM.md:43`, `DESIGN_SYSTEM.md:225`)
No `@media (prefers-color-scheme: dark)` block exists anywhere in `src/app/styles.css` (grep: zero matches). The dark tokens `dark-paper #17211F`, `dark-card #1F2C29`, `dark-ink #EDF4F0`, `dark-muted #AEBDB7` are defined in `DESIGN_SYSTEM.md:34-37` but are **not activated** in the application stylesheet, and no dark-theme contrast pair has been verified. `DESIGN.md:28` and `DESIGN_SYSTEM.md:43` both call dark mode a **mandatory acceptance check at every package boundary**. This is the single biggest gap in the design-spec surface.

### 2. Forbidden intermediate font weights (`DESIGN_SYSTEM.md:62`)
`font-weight: 750` (lines 102, 316, 642, 926, 1002, 1104) and `font-weight: 800` (lines 381, 944) appear in `src/app/styles.css`. `DESIGN_SYSTEM.md:62` explicitly forbids specifying 500/600/650/750/800 because Atkinson Hyperlegible is a static 400/700 font and the browser silently rounds. The browser renders these as 700, so there is no visual break today, but the spec line is explicit: the intended differentiation is lost and the rule is violated in source.

### 3. Bare `←` in back link not aria-hidden (`DESIGN_SYSTEM.md:94`, `DESIGN.md:27`)
`<a class="store-detail__back" href="/stores">← Back to Browse</a>` (catalog `components.tsx:1028`) exposes the directional character to the accessible name. Spec requires wrapping decorative direction characters in `<span aria-hidden="true">`. Same pattern appears in external/alpha/routing components (`← Back`, `← Back to stores`). Note the admin components do it correctly (`<span aria-hidden="true">← </span>Back`), so the pattern is known but not applied consistently.

### 4. Bare `✓` in status badges not aria-hidden (`DESIGN_SYSTEM.md:92`)
Badges render `✓ Verified for Synthetic testing` and `✓ Open now` with the checkmark inline in the accessible name (catalog `components.tsx:924-925, 1038-1039`). Spec: the decorative character must be wrapped in `aria-hidden="true"` and the plain-language label must stand alone as the accessible name.

### 5. More menu missing auth-required signals (`DESIGN.md:29`)
For an anonymous user, `/more` shows Saved Stores, New Since, Private History, Add a Place from a Link, Shared with Me, Trip Ideas, Account & Privacy as plain links with **no lock icon, no `aria-label="Requires sign-in"`, and no parenthetical label**. `DESIGN.md:29` explicitly requires auth-required More items to signal their requirement to unauthenticated users before they tap. JIT auth still works on tap (redirect to sign-in with returnTo), but the required pre-tap signal is absent.

### 6. `/stores/:slug/updates` route linked but not registered — 🔴 Gap (`DESIGN_SYSTEM.md:132`)
`DESIGN_SYSTEM.md:132` defines `/stores/:slug/updates` ("all approved Store Updates; Store Details `See all`"). The Details page renders a `See all store updates` link when `store.updates.length > 3` (catalog `components.tsx:1180-1183`), but **no such route exists** in `App.tsx`'s route table (only `/stores`, `/stores/:slug`, `/stores/:slug/reviews`, `/stores/:slug/memory`, `/stores/:slug/correction`). Navigating to `/stores/union-station-vintage/updates` returns "Page not found". Latent today (fixtures have ≤2 updates) but the link becomes a 404 as soon as any store publishes a 4th update.

### 7. Card missing `Add to Trip` (`DESIGN.md:60`)
Card actions render Save + private memory + Suggest a correction, but not `Add to Trip`. `DESIGN.md:60` lists both `Save` and `Add to Trip` in the card anatomy. `DESIGN_SYSTEM.md:80` allows "actions as allowed", so this is a soft deviation — Add to Trip exists on Details — but the card anatomy line is explicit.

### 8. Heading sizes off the Section/H2 token (`DESIGN_SYSTEM.md:51-56`)
"12 stores to explore" renders at 40px (clamp 1.8–2.5rem) and "Store map" at 22.4px, both off the Section/H2 `29px/1.08` token. Card titles render 24.5px vs the Card-title/H3 24px token (rounding-equivalent). Minor typographic drift; the results heading arguably reads as a display heading.

---

## Already reconciled in the ticket review (`REVIEW_VERDICTS.md`)

- All 6 authoritative `test:e2e:review` failures are test defects, not app defects (stale assertions, breakpoint mismatch, broken zoom measurement). The correct WCAG 200%-zoom test passes (`review-harness.spec.ts:115`).
- Harness `reviewHours` throws where production RPC returns `hoursReview` — a harness/production divergence (#17) that should be reconciled, not app behavior.

---

## Bottom line

The app is a faithful, high-quality implementation of the shopper surface: first-arrival, card anatomy, details anatomy, JIT auth, trip setup, responsive contract, focus contract, and stage fail-closed behavior all match the controlling documents and were browser-verified. It is **not** a full spec match yet because of the six deviations above, of which **two are genuine gaps with a mandatory check attached: dark mode (missing entirely) and the `/stores/:slug/updates` route (linked but 404)**. The remaining four are concrete, small, fixable violations of explicit lines (font weights, aria-hidden wrapping ×2, More-menu auth signals) plus two minor visual/annotation deviations.

Recommendation: fix #1–#6 (or consciously accept each with a dated note), re-run the mandatory dark-mode/contrast and 200%-zoom acceptance checks, then this surface is release-review ready.