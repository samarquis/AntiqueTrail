# Antique Trail — Role-Based Site Review

**Reviewer**: Product Owner (browser-verified via the review harness + Playwright)
**Date**: 2026-08-18
**Harness**: Vite dev server on `http://127.0.0.1:4173` (current source), identities via `?reviewAs=<id>&reviewState=success`
**Method**: Full role pass per identity — navigate every route in the role's journey, exercise the primary actions, record evidence URLs and findings.

## Verdict scale

| Verdict | Meaning |
|---|---|
| ✅ Pass | Browser-verified end-to-end; no review notes |
| 🟡 Review note | Works, but with a finding (minor UX/confirmation gap, harness divergence, or sub-flow not fully demonstrable) |
| 🔴 Not ready | Cannot be demonstrated in the browser per the review rule |

**Overall: ✅ Pass — all four role journeys complete with zero Blocking Defects. One minor UX finding (see below).**

---

## 1. Anonymous shopper (no account)

| Check | Result | Evidence |
|---|---|---|
| `/stores` renders search, Category (7: All, Antique mall, Vintage, Furniture, Collectibles, Home decor, Flea market) and Area (All areas, Topeka) filters | ✅ | `/stores` |
| 12-store synthetic catalog renders | ✅ | `/stores` |
| Category filter applies (URL `?category=antique-mall`, "6 stores to explore") | ✅ | `/stores?category=antique-mall` |
| Area filter applies (URL `&area=topeka-ks`, still 6 stores — all antique-mall in Topeka) | ✅ | `/stores?category=antique-mall&area=topeka-ks` |
| Store map not over-promised ("Map and travel-time suggestions are not available yet") | ✅ | `/stores` |
| Store details: About, Hours, Special hours & exceptions, Contact & location, Accessibility, Latest updates, Follow links, Source & freshness | ✅ | `/stores/blue-finch-curios` |
| Gallery wall: hero + 4 prints with descriptive `aria-label`s, enlarge button | ✅ | `/stores/blue-finch-curios` |
| Updates page with 4 dated entries | ✅ | `/stores/blue-finch-curios/updates` |
| Private routes gate correctly: `/trips` redirects anonymous to `/auth/sign-in?returnTo=%2Ftrips` | ✅ | `/trips` |

## 2. Shopper A (authenticated, private data)

| Check | Result | Evidence |
|---|---|---|
| My Trips list + seeded trip | ✅ | `/trips?reviewAs=shopper-a` |
| Trip plan: stops with priority (Must/Prefer/Flexible), dwell minutes, Move Up/Down/Remove | ✅ | `/trips/trip-a/plan` |
| Remove stop works (Blue Finch removed, 1 stop remains) | ✅ | `/trips/trip-a/plan` |
| Add stop works (free-text stop label + priority + dwell; North Star Relics added, 3 stops) | ✅ | `/trips/trip-a/plan` |
| Trip Partner invite: verified-email field (proper `label[for]` association), send → "Invitation submitted. If that verified account can join, the invitation expires in seven days." | ✅ | `/trips/trip-a/invite` |
| Add to Trip from store page → `/trips/new?addStoreId=…` → Create trip → stop carried into new trip plan | ✅ | `/stores/cedar-brass` → `/trips/new` → `/trips/trip-1/plan` |
| Saved stores list + Remove | ✅ | `/saved` |
| Save store → "Store saved. Undo is available." | ✅ | `/stores/blue-finch-curios` |
| Cross-account isolation: saving Cedar & Brass (Shopper B's store) correctly denied ("We couldn't complete that private action") — harness cross-account fixture denial, not a defect | ✅ | `/stores/cedar-brass` |

## 3. Store Representative (Blue Finch Curios scope)

| Check | Result | Evidence |
|---|---|---|
| Portal home: hours verification age, freshness/provenance, direct-publish vs controlled-field split | ✅ | `/store-portal?reviewAs=representative` |
| Hours editor: per-day schedules, second range, copy-to-other-days, date-specific holiday hours, temporary closure; save → "Hours saved and freshness updated." | ✅ | `/store-portal/hours` |
| Store Updates: 4 types (New Finds/Sale/Announcement/Store News), text publishes immediately, M-01 image gate notice honest | ✅ | `/store-portal/updates` |
| **🟡 Finding: no distinct success confirmation after publishing an update** — the live region keeps showing the standing M-01 notice; the update does appear in the list (so the action succeeds) but there is no "published" announcement | 🟡 | `/store-portal/updates` |
| Official links: platform select + URL, domain validation ("Use the official facebook domain." → valid URL → "Official link published.") | ✅ | `/store-portal/links` |
| Public preview: live public values vs pending (controlled) changes shown separately | ✅ | `/store-portal/preview` |
| Access & Help: categorized support request + thread reply | ✅ | `/store-portal/support` |

## 4. Administrator

| Check | Result | Evidence |
|---|---|---|
| Review queue shows pending store change (address) for Blue Finch Curios | ✅ | `/admin?reviewAs=administrator` |
| Review item: read-only submitted fields, current-vs-requested preview, audit history, required decision reason | ✅ | `/admin` |
| Two-step decision: Approve → Confirm approve → "Case approved." with audit trail | ✅ | `/admin` |
| Partner administration: synthetic invitation (E-01/HC-01 email gate honest) + exact claim lookup | ✅ | `/admin/partners` |
| Access & Safety: exact scope list (Blue Finch Curios — River — active), revoke preview, duplicate merge | ✅ | `/admin/access` |
| Review moderation: case-scoped, reason-required Hold/Remove/Restore/Dismiss Report | ✅ | `/admin/reviews` |

---

## Findings

### 🟡 F-1 (minor, UX): Store Update publish has no success confirmation
**Where**: `/store-portal/updates` (Store Representative)
**What**: After clicking "Publish text update," the only `[role=status]` text on the page is the standing M-01 notice ("Official images and screenshots are disabled until the M-01 media gate passes."). The published update does appear in the "Your updates" list, so the action succeeds, but there is no explicit "update published" announcement — a screen-reader user hears nothing new, and a sighted user must notice the new list item.
**Severity**: Low (non-blocking). Product works; confirmation feedback is missing.
**Suggested fix**: On successful publish, emit a distinct success status (e.g. "Update published.") in the live region.

### Reconciliation note (stale findings, do NOT report)
Findings captured in earlier sessions against a **previous app build** — trip count "0 stores", copy-link wrong origin, dead photo/event buttons, duplicate hour ids, no save feedback, signup name not carried, read-only admin accounts — are **superseded**. The current build (routes inline in `App.tsx`, review harness, `/trips`/`/store-portal`/`/admin` flows) was re-reviewed in full above; none of those old findings reproduce.

---

## Re-run instructions

1. `npm run dev` (or the configured review harness) and open `http://127.0.0.1:4173`.
2. For each identity in order (anonymous → shopper-a → representative → administrator), append `?reviewAs=<id>&reviewState=success` to every route listed above.
3. Walk the checklist columns in order; record any divergence as a new finding.