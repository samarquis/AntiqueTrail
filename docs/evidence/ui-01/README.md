# UI-01 acceptance evidence

Review URL: `http://127.0.0.1:4173/stores`

## Review order

1. At desktop width (1024 px or wider), confirm `Browse | My Trip | More`, the two-column store grid, the 42 px page heading, 18 px body text, and today's hours/open state on every card.
2. At tablet width (801–1023 px), confirm the centered single-column task surface and fixed three-item bottom navigation.
3. At phone width (320–800 px), confirm Search remains visible, secondary filters are collapsed behind the keyboard-operable `Filters` button, cards use one column, and the bottom navigation does not obscure content.
4. Use only the keyboard: focus the skip link, activate it, follow the primary navigation, open Filters, search, clear the results, and open a store.
5. Set browser zoom to 200%. Confirm the resulting 320 px-equivalent layout has no horizontal scrolling and preserves the same reading/focus order.
6. Review `/stores?q=does-not-exist`, `/stores/not-a-real-store`, and the map-unavailable message for explicit empty, not-found, and blocked states.

## Automated evidence

- Playwright: 14/14 contract checks passed across Desktop Chrome and Pixel 5.
- Unit/component: shell and catalog behavior covered by App, catalog component, and query tests.
- Contract assertions cover navigation paths, H1 route focus, skip link and landmark count, exact typography, same-origin self-hosted fonts, 48 px targets, staged responsive filters, current-day hours/open state, neutral image fallback, keyboard behavior, state variants, and 320 px reflow.

## Screenshots

- `browse-desktop.png` — 1440 × 1000 viewport
- `browse-tablet.png` — 900 × 1100 viewport
- `browse-mobile.png` — 390 × 844 viewport

## Scoped follow-up

- Approved Synthetic Store photography is intentionally tracked by #33. UI-01 uses the design-system-authorized neutral placeholder with store-specific initials and category.
- Loading and request-error rendering have deterministic component tests; the current demo route has no deterministic runtime toggle for capturing those transient states.
