# Issue #141 shared form-control contrast evidence — 2026-08-28

- Light semantic values: placeholder `#596b64` on card `#fffdfc` is 5.58:1; control boundary `#63756d` on card is 4.82:1.
- Dark semantic values: placeholder `#c4ccd7` on card `#252b33` is 8.81:1; control boundary `#8795b5` on card is 4.75:1.
- `src/app/styles.test.ts` computes and guards placeholder, default, disabled, invalid, and two-layer focus-ring contrast in both themes.
- `e2e/theme.spec.ts` verifies the browse search control in desktop and mobile projects for 48px size, light and dark semantic values, keyboard focus, and Windows forced-colors border/focus behavior.
- The shared selector covers native text inputs, selects, and textareas; sign-in regression coverage confirms `aria-invalid` and its error-summary `aria-describedby` relationship remain present.
