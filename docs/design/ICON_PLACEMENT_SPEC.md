# Antique Trail Icon Placement Spec

Status: approved placement reference. This maps the existing icon assets to the approved shopper flow. `DESIGN_SYSTEM.md` references this document as the canonical icon-placement authority.

## Core rule

Icons orient and reinforce; they do not replace words. Antique Trail is designed first for shoppers roughly 50–80+, so every navigation item, primary action, and status retains a visible plain-language label. Do not create icon-only primary controls.

## Global navigation and header

### Header: `app-icon.svg`

Use the canonical `app-icon.svg` storefront mark in the global shopper header. It sits to the left of the `Antique Trail` wordmark at **28 px desktop / 26 px mobile**. This is the same identity users see on their phone, keeping the brand cue consistent across install, header, and apparel lockup.

It is a brand mark, not a tap target and not the Browse navigation icon. The wordmark remains the accessible product name. `antique-store.svg` remains the detailed Browse/navigation storefront cue.

### Bottom / compact navigation

| Destination | Icon | Label | Rule |
|---|---|---|---|
| Browse | `antique-store.svg` | `Browse` | May reuse the storefront at 22 px in compact navigation. The label remains visible. |
| My Trip | `trail-map.svg` | `My Trip` | The continuing journey cue. Use whether the user has a draft, active, or completed trip history. |
| More | none from this set | `More` | Use a simple three-line menu icon from the system icon library, not a semantically unrelated Antique Trail illustration. |

Do not put all ten icons in navigation. The rest are contextual wayfinding aids.

## Shopper flow placements

| Icon | Meaning | Correct placement | Do not use it for |
|---|---|---|---|
| `antique-store.svg` | Discover physical antique stores | Browse navigation; empty Browse state when no stores match a search | Header branding, paid/sponsored-store marking, generic commerce, or map pins |
| `trail-map.svg` | The planned route between stores | My Trip navigation; Trip page header; Plan/Review Hours page header; empty trip state | The `Navigate` action, which hands off to an external map |
| `treasure-find.svg` | Newly surfaced merchandise or a noteworthy store update | `New Finds` store-update type; `New Since Your Last Visit` section illustration; Browse empty state after a successful trip | A generic search icon, user achievements, or ratings |
| `saved-store.svg` | A private saved place | `Saved Stores` item in More; Saved Stores page header; post-save confirmation next to `Saved` | The heart/favorite action alone; retain the word `Save` or `Saved` |
| `store-hours.svg` | Hours have been reviewed | Store Details `Hours` section; `Review Hours` page header; hours warning/changed-hours callout with text | A current-open/closed state without its plain-language status |
| `shopping-trip.svg` | Start or build a shopping outing | `Start a New Trip` option in the Add to Trip chooser; empty Trip page; first-stop setup | My Trip navigation, trip sharing, or external navigation |
| `navigate.svg` | Leave Antique Trail for the current driving leg | `Navigate` on Store Details; `Open Maps`/current-leg handoff in Go mode; return-from-maps recovery cue | Planning, route optimization, a permanent bottom-nav item, or device-location permission |
| `shared-trip.svg` | One explicitly shared trip with one named partner | `Invite a Trip Partner`; accepted shared-trip banner; shared-trip detail header | Candidate Link sharing, social sharing, families/groups, or general account sharing |
| `private-notes.svg` | Shopper-private memory | `Private History` item in More; private note/rating section after a stop; history empty state | Public reviews, partner-visible trip information, or store-owner tools |
| `store-details.svg` | Examine one store's verified record | Store card secondary `Details` affordance when there is room; Store Details loading/empty state; correction-report entry context | Header branding, Browse navigation, or a search/filter control |

## Screen choreography

### 1. Browse

- Header uses `app-icon.svg` beside the wordmark.
- Bottom navigation uses storefront + `Browse`, map + `My Trip`, and a standard menu + `More`.
- A store card should lead with real store media, name, town, category, hours, and text actions. Do **not** decorate every card with an icon.
- `store-details.svg` may precede a secondary `Details` link only on wide cards; on mobile, the card itself opens details.
- `treasure-find.svg` appears only for a named `New Finds` or `New Since Your Last Visit` section.

### 2. Store Details

- The main header remains text-led: store name, town, and verification/freshness facts.
- Use `store-hours.svg` as a small section marker beside `Hours`.
- Use `navigate.svg` as the leading icon for the explicitly labeled `Navigate` action.
- Use `saved-store.svg` beside `Save`/`Saved` only after authentication state is known.
- Use `shopping-trip.svg` beside `Add to Trip` only when it is a secondary action; do not place two competing pictorial primary buttons.

### 3. Save, plan, and share

- `saved-store.svg`: Saved Stores page title and successful save result.
- `trail-map.svg`: My Trip, current plan, Review Hours, and trip status.
- `shopping-trip.svg`: Start a New Trip choice and a no-trip-yet state.
- `shared-trip.svg`: only after the user reaches the explicit invite/accept flow. It must never imply a shared household or expose private ratings/notes.

### 4. Go mode and finish

- `navigate.svg`: the external map handoff for the current leg. Keep `Navigate`/`Open Maps` visible in text.
- `private-notes.svg`: optional private memory, private rating, and note after `Done Here`, plus Private History.
- `treasure-find.svg`: may appear on a completed-trip summary only as a decorative finish marker, never as proof that a purchase occurred.

## Size, color, and behavior

| Context | Size | Treatment |
|---|---:|---|
| Header brand mark | 26–28 px | Full five-color treatment on a quiet surface |
| Bottom navigation | 22 px | Prefer blue-black/ivory + one accent; selected item may use slate blue |
| Page or section header | 28–32 px | Full color, paired with a visible title |
| Leading button icon | 18–20 px | Single-color when inside a filled button; never rely on the icon alone |
| Inline section/status icon | 16–18 px | Use semantic color sparingly and pair with words |
| Empty state illustration | 48–64 px | Full color, one per screen maximum |

All icons need an accessible text equivalent from their adjacent visible label. Decorative duplicates are `aria-hidden="true"`; a standalone non-decorative icon receives an exact accessible name. Do not recolor `clay` into a general decorative accent: it stays destructive/important-new. Do not use brass except for freshness and warning attention.

## Explicit exclusions

- No icon-only permanent navigation or primary button.
- No icon indicating paid placement, ranking, reviews, or store endorsement.
- No `shared-trip.svg` for Candidate Link share; that transfer is one private idea, not a joint trip.
- No `navigate.svg` before an explicit user-selected navigation handoff.
- No full-color decorative icon on every card, list row, or form field.
