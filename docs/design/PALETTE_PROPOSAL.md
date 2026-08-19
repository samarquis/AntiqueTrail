# Antique Trail Palette Proposal: Daylight & Midnight Archive

Status: approved visual reference. `DESIGN_SYSTEM.md` is the canonical token source.

## Direction

**A clear archive, not antique-shop costume.** The palette is calm and editorial: blue-black ink, stone and ivory surfaces, restrained slate-blue actions, aged brass for attention, and clay for consequence. It is deliberately free of teal, mint-glass, and bottle-green.

The light theme feels collected and open; the dark theme feels like a well-lit archive after hours. Neither depends on glossy glass effects or saturation for personality. Brass, clay, and slate-blue appear only where they help a shopper understand action, freshness, or risk.

## Light tokens: Daylight Archive

| Role | Token | Value | Use |
|---|---|---:|---|
| Main canvas | `canvas` | `#F6F4F0` | Soft stone page background |
| Raised surface | `surface` | `#FFFDFC` | Ivory cards, fields, dialogs |
| Primary ink | `ink` | `#202833` | Blue-black headings, body, icon outlines |
| Secondary ink | `muted` | `#5D6876` | Slate metadata and quiet supporting text |
| Primary action | `slate-blue` | `#4C628A` | Primary buttons, active route, selected controls |
| Action hover/link | `deep-slate-blue` | `#344A70` | Hover state and links on light surfaces |
| Selection fill | `pale-slate` | `#E2E7F0` | Selected rows and gentle active surfaces |
| Context label | `slate` | `#68758A` | Eyebrows and non-critical category context |
| Warning/freshness | `brass` | `#B98B45` | Freshness attention and cautions only |
| Destructive | `clay` | `#A75E4D` | Delete, error, closed/denied states only |
| Divider | `line` | `#D8DCE2` | Borders and separators |

## Dark tokens: Midnight Archive

| Role | Token | Value | Use |
|---|---|---:|---|
| Main canvas | `dark-canvas` | `#121519` | Charcoal-blue-black background |
| Recessed surface | `dark-recess` | `#1A1F26` | Navigation, inset fields, quiet regions |
| Raised surface | `dark-surface` | `#252B33` | Charcoal-slate cards, sheets, dialogs |
| Divider | `dark-line` | `#3B4552` | Subtle structural borders |
| Primary ink | `dark-ink` | `#F3EEE4` | Soft ivory reading text |
| Secondary ink | `dark-muted` | `#B7B0A5` | Warm gray supporting text |
| Primary action | `dusty-blue` | `#8795B5` | Active controls, routes, link accent |
| Warning/freshness | `dark-brass` | `#B99554` | Aged-brass freshness and warnings |
| Destructive | `dark-clay` | `#B56E5B` | Weathered-clay error and destructive feedback |

## Usage rules

1. Use stone/ivory or charcoal/slate surfaces for the majority of the interface. Do not add decorative teal, mint, glossy glass, or green accents.
2. Use slate-blue for primary action and current-state emphasis, not for large decorative fills.
3. Use brass only for freshness and warnings; pair it with clear text and an icon.
4. Use clay only for destructive or important-new states, never geography or normal metadata.
5. Keep icons in the blue-black/slate-blue/pale-slate/brass/clay family. A feature icon may be colorful, but never carries the only meaning.
6. Dark mode is composed from charcoal, slate, ivory, dusty blue, brass, and clay; it is not an inversion of the light mode.
7. Legacy implementation variables named `teal`, `mint`, and `olive` map to slate-blue and slate values only. New UI must use the approved semantic roles, not their old color names.
8. Although the palette feels quiet, required reading, controls, and focus states retain the existing WCAG AA commitment; low-contrast color is limited to decorative and nonessential surfaces.

## Verified key pairs

| Pair | Contrast |
|---|---:|
| Ink on canvas | 13.53:1 |
| Muted on canvas | 5.16:1 |
| White on slate-blue | 6.14:1 |
| White on clay | 4.83:1 |
| Ink on brass | 4.84:1 |
| Dark ink on charcoal | 15.83:1 |
| Dark muted on charcoal | 8.52:1 |
| Dusty blue on charcoal | 6.10:1 |
| Aged brass on charcoal | 6.53:1 |
| Weathered clay on charcoal | 4.66:1 |
