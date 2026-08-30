# Issue #142 color inventory

Date: 2026-08-30

Base: `e1899659fbfdcd0647b4fdced50c901fa71f2cf4`

Candidate implementation SHA: recorded in `verification.md` after the implementation commit
Source: `src/app/styles.css`, scanned by the static contract in `src/app/styles.test.ts`.

## Classification rules

The approved Daylight Archive and Midnight Archive values are the root theme tokens in `DESIGN_SYSTEM.md — Visual tokens / Color`. Every reusable component consumes either those tokens or a `--surface-*`, `--control-*`, `--shadow-*`, or `--danger-*` alias derived only from them. The test rejects a raw hex/rgb literal outside the two theme roots unless it is one of the art treatments listed below; it also rejects a missing approved light/dark token pair and a CSS system color outside a `forced-colors: active` rule.

| Class | Location / values | Approved source or rationale |
| --- | --- | --- |
| Approved root palette | `:root` and `:root[data-theme='dark']`: `ink`, `muted`, `paper`, `card`, `line`, `teal`, `teal-dark`, `mint`, `rust`, `gold`, `olive`, `focus-inner`, `focus-outer` | `DESIGN_SYSTEM.md — Color` exact table; light/dark pairs are enforced. |
| Fixed media boundary | `--media-overlay-surface`, `--media-overlay-text`, and `--on-action` | The first two are the separately-owned #143 opaque media contract; white-on-slate/clay is an approved contrast pair in `DESIGN_SYSTEM.md — Color`. |
| Derived reusable aliases | `--control-*`, `--surface-*`, `--danger-hover`, `--shadow-*`, and `--canvas-backdrop` | Every color-bearing expression references only approved variables. These cover shell, controls, status/error surfaces, action feedback, shadows, and canvas treatment. |
| Intentional art: light placeholders/map | `.shopper-store-card__placeholder`, `.catalog-map-panel` and `::before`, `.catalog-card__placeholder` and descendants, `main > article > [role='img']`, `.accessible-map__plot` | Clearly non-data photo/map/illustrative treatments; their exact literal/gradient/alpha declarations remain local rather than becoming reusable UI semantics. |
| Intentional art: dark equivalents | The matching `[data-theme='dark']` placeholder, map-panel, catalog-card placeholder, image placeholder, and map-plot rules | Theme-specific illustration treatment only; it does not set shell, control, link, status, or form meaning. |
| System override | The two `@media (forced-colors: active)` blocks | Platform `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, and `Highlight` values are required forced-colors overrides, not brand palette values. |

## Complete exception registry

The regression test permits raw literals only for these selector/property pairs; each row covers every literal, gradient, and alpha inside that declaration.

| Theme | Selector/property | Purpose |
| --- | --- | --- |
| Light | `.shopper-store-card__placeholder` / `background` | Synthetic photo placeholder art |
| Light | `.catalog-map-panel` / `border`, `background`; `::before` / `border` | Faux map panel art |
| Light | `.catalog-card__placeholder` / `background`; pseudo-elements / `border`; child `span` / `border`, `background`; child `small` / `color` | Missing-photo illustration art |
| Light | `main > article > img, main > article > [role='img']` / `background` | Generic image-placeholder art |
| Light | `.accessible-map__plot` / `background` | Non-geographic review-map texture |
| Dark | `[data-theme='dark']` versions of every light placeholder/map selector above | Matching Midnight Archive illustration art |
| Forced colors | System-color declarations only inside `@media (forced-colors: active)` | User-agent high-contrast compatibility |

No art exception may be reused for shell, buttons, links, navigation, cards, forms, errors, statuses, or media overlays. Adding another raw reusable color fails `semanticColorViolations` until it has an approved source and an explicit inventory entry.
