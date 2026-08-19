# Storefront identity quality contract

Status: active design exploration. Production app assets remain unchanged until explicit approval.

## Work item

- **Source:** direct user request, 2026-08-18
- **Outcome:** one coherent Antique Trail identity with (1) a storefront-only phone icon and (2) a storefront plus `ANTIQUE TRAIL` shirt lockup.
- **Risk:** low. New, reversible design artifacts only; no live icon replacement.
- **Review base:** `c5b71d9013b4fb40e2fef3036378594564c8b5b9`.

## Acceptance

1. A first-time viewer recognizes a storefront at 24px and 32px without supporting text.
2. The icon has one dominant silhouette, no more than three flat mark colors, and no thin decorative detail.
3. The awning is the storefront signature; the doorway/trail cutout supports it without competing.
4. The icon avoids clip-art, illustration-scene, rustic-costume, and generic marketplace-pin treatments.
5. The storefront remains recognizable in a one-ink shirt treatment.
6. The shirt lockup uses the same storefront geometry and renders `ANTIQUE TRAIL` exactly once in a sturdy, unfussy wordmark.
7. Important geometry remains inside a 64px safe inset on the 512px app tile.
8. Independent design and scale/detector critiques report no P0/P1 finding before `WOWED`.

## Evidence required

- Exact SVG fingerprint.
- 24/32/64/128/512px icon contact sheet.
- One-color shirt-lockup render.
- Two isolated independent assessments against the exact candidate.

## Rework record

- **V1 — REWORK:** storefront recognition passed at 24/32px, but the brass knob created a fourth color and subpixel detail. The one-ink lockup merged the canopy into the facade, losing its signature scallops. The shirt composition was top-light, over-tracked, underlined, and font-dependent.
- **V2 direction:** remove the knob and underline; preserve an 18px negative-space gap between awning and facade; use a keyed cornice; enlarge the shirt mark; reduce tracking; load the repository's licensed Atkinson Hyperlegible Bold for deterministic project rendering. Final commercial art still requires outlined wordmark paths after approval.
- **V2 — REWORK:** deterministic and scale assessment passed with no P0/P1, but the independent design assessment found the small cornice details disappeared at 24px, leaving a polished but category-interchangeable shop pictogram. The shirt wordmark remained too broad and institutional.
- **V3 direction:** enlarge keyed cornice ends to 32×24 units; make the center scallop 25% deeper and align it with the door; preserve a clear facade top beam; enlarge the shirt mark to about 550 units wide; tighten tracking to 3px and close the mark-to-word gap.
- **V3 — REWORK:** deterministic scale/detector assessment passed with no P0/P1. The design assessment still found that the roof and scallop modifications collapse into a category-generic storefront at 24/32px. This is the second targeted specificity rework; no further detail-only iteration is allowed.
- **V4 root-cause direction:** fuse the product's two ideas. Keep the storefront and replace the standard arch with one large asymmetric negative-space trail that starts narrow inside the shop and widens toward the viewer. The feature must remain visible in the app icon and identical in the one-ink shirt mark.
- **V4 — rejected in coordinator inspection:** the asymmetric cutout survives at small size but reads more readily as a flame, leaf, or abstract slash than as a trail. It weakens storefront recognition and is not sent for approval. V3 remains the strongest candidate, but it retains the independent P1 specificity finding.

## Current verdict

`REWORK` — V3 passes deterministic, contrast, scale, one-ink, and detector checks. It does not clear the independent design-specificity gate. No production asset has been replaced.
