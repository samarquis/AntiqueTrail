# Antique Trail Design System and Screen Contract

`DESIGN.md` controls behavior and journey intent. This file controls exact visual tokens, recurring component states, responsive behavior, and screen-level acceptance.

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

The visual direction is **Daylight Archive** in light theme and **Midnight Archive** in dark theme. No teal, mint-glass, bottle-green, parchment, sepia, distressed type, barnwood, or decorative antique clutter. `docs/design/PALETTE_PROPOSAL.md` and `docs/design/palette-midnight-archive.svg` are the approved visual reference.

Approved contrast pairs: ink/paper `13.53:1`; muted/paper `5.16:1`; white/slate-blue `6.14:1`; white/clay `4.83:1`; ink/brass `4.84:1`; dark-ink/dark-paper `15.83:1`; dark-muted/dark-paper `8.52:1`; dusty-blue/dark-paper `6.10:1`; aged-brass/dark-paper `6.53:1`; weathered-clay/dark-paper `4.66:1`.

Never communicate status with color alone. Pair each status color with plain text and, when space permits, an icon.

**Semantic color reservation**: `rust`/clay is reserved exclusively for destructive actions, danger states, and important-new status. Use `olive`/slate for eyebrow and section-label context, `muted` for secondary text. `gold`/brass is reserved for warning and freshness-attention states. Dark-mode tokens activate under `:root[data-theme='dark']`, set before first paint from the saved switcher choice or the system `prefers-color-scheme: dark`. Dark mode is a mandatory acceptance check at every package boundary.

### Icon and app identity

`public/app-icon.svg` is the canonical install/fav icon: the approved V3 storefront mark with a keyed ivory cornice, slate-blue three-scallop awning, and ivory arched doorway on blue-black. PNG derivatives (`app-icon-192.png`, `app-icon-512.png`, `apple-touch-icon.png`) are the manifest and Apple touch assets.

`docs/design/antique-trail-storefront-shirt-lockup.svg` is the approved apparel/advertising companion. Keep the phone icon text-free; use the lockup when the brand name is needed.

`docs/design/ICON_PLACEMENT_SPEC.md` is normative for icon placement. Icons orient and reinforce; required navigation, primary actions, statuses, and safety information always retain visible plain-language labels.

### Typography

`src/app/styles.css` owns the semantic typography API. Token names describe content roles, never a component or current pixel value. The scale is fixed at all supported widths unless a token is documented as fluid.

| Role | Tokens | Rendered value | Intended use |
|---|---|---|---|
| UI family | `--font-ui` | Atkinson Hyperlegible, system UI, sans-serif | Body copy, controls, labels, facts, status |
| Display family | `--font-display` | Newsreader, Georgia, Times New Roman, serif | H1-H3 and short editorial/image titles |
| Caption | `--type-size-caption`, `--type-leading-supporting` | `13px/1.4` | Nonessential timestamps, rights lines (never essential copy) |
| Supporting | `--type-size-supporting`, `--type-leading-supporting` | `15px/1.4` | Secondary descriptions and compact facts |
| Label | `--type-size-label`, `--type-leading-compact` | `16px/1.25` | Buttons, form labels, navigation, status |
| Body | `--type-size-body`, `--type-leading-body` | `18px/1.5` | Primary copy and task instructions |
| Lede | `--type-size-lede`, `--type-leading-body` | `20px/1.5` | Introductory and emphasized copy |
| Heading 3 | `--type-size-heading-3`, `--type-leading-display-relaxed` | `23px/1.15` | Card and subsection titles |
| Heading 2 | `--type-size-heading-2`, `--type-leading-display` | `29px/1.08` | Page sections |
| Heading 1 | `--type-size-heading-1`, `--type-leading-display-tight` | `42px/1.04` | One page title |
| Regular weight | `--type-weight-regular` | `400` | Default UI copy |
| Strong weight | `--type-weight-strong` | `700` | All emphasis and display-family use |
| Display tracking | `--type-tracking-display`, `--type-tracking-display-subtle` | `-0.025em`, `-0.015em` | Headings and compact brand wordmark |
| Uppercase tracking | `--type-tracking-uppercase`, `--type-tracking-uppercase-wide` | `0.08em`, `0.13em` | Short uppercase labels; wide for eyebrows |

Body text must not fall below 16px on desktop or 14px on mobile for core content. Freshness, provenance, hours, warnings, and privacy consequences are core content. Caption text may use 13px only for nonessential timestamps, rights lines, or decorative context.

Production self-hosts licensed WOFF2 subsets for Newsreader and Atkinson Hyperlegible with `font-display: swap`; no Google Fonts request.

Atkinson Hyperlegible has exactly two weights: Regular (`400`) and Bold (`700`). Do not specify 500/600/650/750/800. Newsreader Bold (`700`) is the only licensed weight; do not specify intermediate values or italics unless added to the licensed subset.

### Space, shape, and elevation

- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48` px.
- Minimum touch target: `48x48` CSS px.
- Field/button radius `13px`; chip radius `999px`; card radius `18-22px`.
- Standard card border `1px solid line`; important-new card `2px solid gold`.
- Standard shadow `0 5px 18px rgba(23,49,45,.06)`; dialog `0 16px 45px rgba(23,49,45,.12)`.
- Focus: dual boundary `0 0 0 2px focus-inner, 0 0 0 6px focus-outer`. At least one boundary maintains 3:1 against every adjacent color in light, dark, forced-color, teal, rust, and gold states.
- Motion: `150-200ms` transitions for state feedback only. Respect `prefers-reduced-motion`.

## Component contract

| Component | Required anatomy | Required states |
|---|---|---|
| Primary button | Text label, optional leading icon, one dominant action per section | default, hover, focus, pressed, disabled with reason, loading without width shift, error |
| Secondary/destructive button | Explicit label; destructive never icon-only | default, hover, focus, pressed, disabled, destructive confirmation |
| Search/filter | Search field, labeled submit/clear, filter chips, result count | idle, focused, active filter, loading, zero match, request error, cleared |
| Store card | Image/placeholder, name, area, category, hours/open text, freshness, Save/Add/View | default, focus, saved, new, stale/warning, image failure, action pending |
| Status badge | Plain-language state plus non-color indicator | success, warning/stale, danger/closed/denied, pending |
| Form field | Visible label, optional help, input, associated error | untouched, focus, valid, invalid, disabled with explanation, server error with value retained |
| Dialog | H2 title, focused first control, body, cancel, explicit action | open, validation error, submitting, success/close; return focus to opener |
| Bottom navigation | Three stage-correct destinations with text labels: public test uses `Browse`, `Saved stores`, `More`; selected trip stages replace `Saved stores` with `My Trip` | default, current page, focus, unavailable with explanation |
| Toast/live message | Short result in polite live region | success, neutral, error; never sole record of important state |
| Stop list | Number, store, area, hours/state, provenance, explicit actions | ready, warning, removed with Undo, reorder controls, empty |
| Review/queue item | Type, scope/store, age/status, next action | new, pending, changes requested, approved, denied, revoked |
| Store Details section | Named heading and related content/actions; reading order per DESIGN.md | ready, sparse/missing, unavailable/retry; no empty viewport-height spacer |

Status badges and decorative link/button icons (`←`, `→`, `↗`, `✕`, `✓`, `●`) must be wrapped in `aria-hidden="true"`. The accessible label must be complete without the symbol.

When a dialog is open, background content must be `inert` (or an equivalent programmatic focus trap). `aria-modal="true"` alone is insufficient. On close, remove `inert` and return focus to the opener.

## Responsive layout contract

| Viewport | Layout |
|---|---|
| `320-800px` | Single column, full-width surface, safe-area-aware bottom navigation, 16px side padding |
| `801-1023px` | Centered surface up to 720px, single-column task flow, dialogs no wider than 560px |
| `1024px+` | Store Details full-width; other routes up to 1100px; Store Browser may use two equal card columns; task flows stay readable at 720px max |

At 200% zoom, use the narrow layout based on the resulting CSS viewport. No horizontal scrolling for primary content. Reading and focus order remain identical across breakpoints.

## Accessibility contract

- One page H1; headings do not skip levels for visual sizing.
- Header, main, navigation, and footer use landmarks.
- Focus moves to the new page H1 after route change, to dialog content on open, back to the opener on close.
- Validation errors link to fields with `aria-describedby`; submit focuses the error summary.
- Result counts, save/remove results, offline state, and background completion use polite live regions.
- Reorder provides Up/Down controls and announces the new position; drag is optional enhancement only.
- Icons never replace required text labels. Images require meaningful alt text or empty alt when decorative.
- Reduced motion, dark theme, forced colors, keyboard-only, screen reader labels, 200% zoom, and text-spacing overrides are mandatory acceptance checks.

## Age-inclusive usability baseline

Design first for shoppers roughly 50-80 while remaining usable by all ages.

- Target WCAG 2.2 AA across the PWA.
- Default body text at least 18px with 1.5 line height; essential text never below 16px.
- Support 200% text resize, responsive reflow, and user text-spacing overrides.
- Touch targets at least 48x48px.
- Primary icons have text labels; status never depends on color alone.
- Support keyboard use, visible focus, screen readers, reduced motion, non-drag alternatives.
- Plain concrete labels; one primary action visually clear at a time.
- No auto-advance or time pressure on core tasks; preserve entered data after validation errors.
- Store images enlarge; meaningful alt text or captions; essential information never lives only inside an image.
- Browsing stays list-first; a map may assist but is never the only path.

## Selected visual direction

Keep the existing Daylight Archive light theme, Midnight Archive dark theme, and approved V3 storefront identity. The exact values in this file are selected; replacing the palette requires a new Product Owner decision.

## Product anti-references

Do not resemble a rustic antique-shop cliché. No parchment, distressed type, barnwood, sepia, or decorative antique clutter. Trust must come from accurate current information, clear state, and familiar product interaction. Avoid teal, mint-glass, bottle-green, public-star decoration in private workflows, dense dashboards, and unprovable route claims.

## Browser and device acceptance matrix

Test latest and previous major Chrome, Edge, Firefox, and Safari desktop; current and previous iOS Safari; current Chrome Android; widths 320px through 1280px+; keyboard; NVDA with Firefox/Chrome on Windows; VoiceOver with Safari on iOS/macOS. A public release requires zero Blocking Defects and no repeatable journey failure.
