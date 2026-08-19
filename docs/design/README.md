# Design artifacts

`antique-trail-flow-lab.html` is a repository-contained, self-contained archival concept recovered from the accepted 2026-07-30 playable prototype. It is not an implementation source, supporting authority, or package acceptance artifact until reconciled with the current contracts. Open it directly in a browser only to inspect concept provenance; it requires no build and uses only Google-hosted font files when network access is available.

Authority order:

1. `PRODUCT_DECISIONS.md`, `PRD.md`, and `SECURITY_AND_TRUST.md` control product and trust policy.
2. `DESIGN.md` controls journeys and interaction intent.
3. `DESIGN_SYSTEM.md` controls reproducible tokens, component states, responsive behavior, and screen acceptance.
4. `PALETTE_PROPOSAL.md` and `palette-midnight-archive.svg` are the approved visual reference for the Daylight Archive light theme and Midnight Archive dark theme; their values are canonical only through `DESIGN_SYSTEM.md`. `palette-proposal-field-and-brass.svg` is superseded and must not guide new work.
5. `ICON_PLACEMENT_SPEC.md` is the approved placement authority for the icon family in `public/icons/` and the dedicated install mark in `public/app-icon.svg`.
6. The HTML flow lab is archival concept provenance only. It does not participate in implementation or acceptance.

The flow lab contains fictional stores, test identities, a role switcher, editable labels, a fake QR, and an exploratory D31 screen. Those are prototype controls, not production features. Until a later HTML reconciliation, known intentional divergences are its permanent Go tab, profile-like Home start, global pace, hybrid Package 5A/5B route claims, non-operable Undo examples, unqualified public/synthetic labels, and D31 explorer. Implementation must not copy them. `DESIGN.md` and `DESIGN_SYSTEM.md` define Browse/My Trip/More, manual starting place, per-stop duration, Review Hours versus Check My Day, observed-closed/Summary, and narrow D30 audit.

Google-hosted fonts are prototype-only. Production self-hosts the approved licensed WOFF2 subsets and sends no Google Fonts request.

Do not use an external screenshot or temporary local prototype as the sole source for implementation acceptance. New approved visual evidence belongs in this folder and must be listed in `manifest.json`.

## Approved current visual identity

- **Light theme — Daylight Archive:** stone canvas, ivory cards, blue-black ink, slate-blue actions, slate context, brass attention, and clay destructive states.
- **Dark theme — Midnight Archive:** charcoal canvas, blue-black recesses, charcoal-slate cards, soft ivory text, dusty-blue actions, aged brass, and weathered clay. No teal or mint-glass.
- **App install icon:** approved V3 storefront mark. Use `public/app-icon.svg` and its rendered 192px, 512px, and Apple-touch PNGs for the phone icon, favicon, and install surfaces. The compact storefront mark may also sit beside the Antique Trail wordmark in the global header.
- **Shirt/advertising lockup:** use `docs/design/antique-trail-storefront-shirt-lockup.svg`; it repeats the phone mark above the `ANTIQUE TRAIL` wordmark. Convert the wordmark to outlined paths before commercial printing.
- **Feature icons:** follow `ICON_PLACEMENT_SPEC.md`; they clarify the shopper journey and never replace required visible labels.
