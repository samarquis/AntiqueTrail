# AT monogram quality contract

Status: active design exploration; no concept is approved or production-ready until this contract is met.

## Work item

- **Source:** direct user request, 2026-08-18
- **Outcome:** an original, overlapping `AT` app mark for Antique Trail that is immediately recognizable on a phone and strong enough for a one-color shirt print.
- **Risk:** low. This is a reversible design-artifact exploration; production app assets remain unchanged until an explicit approval.
- **Review base:** `c5b71d9013b4fb40e2fef3036378594564c8b5b9`. Existing unrelated working-tree changes are out of scope and must be preserved.
- **Candidate V1 fingerprint:** `E002D07B04316280D8C1A8A5E055ACED54FB4E8834FDA7756CDBC8B6AE59FBAD`.

## Rework record

- **V1 — rejected:** separate letter systems, occluded T, and no viable one-color silhouette.
- **V2 — rejected:** another layered construction; it did not resolve the T or one-color failure.
- **V3 — rejected:** generated visual reference only, never production artwork. Two fresh reviews found the T secondary/fragmented at 24–32px, incompatible serif/slab systems, non-ownable collegiate feel, raster artifacts, and no valid one-color weave.
- **V4 direction:** clean SVG only; A and T use one squared geometric stroke system. The T cap makes one foreground pass over the A's right diagonal; the T stem ends before the A crossbar. This candidate must pass monochrome small-scale inspection before styling or approval.
- **V4 — rejected:** exact fingerprint `BE191094EE88D72861B889441C4812654D70C04555229D02697D0770B3AEF0A1`. Although cleaner and conditionally legible in color, both independent critiques found an overlay rather than one clear weave; the one-color mark collapsed to an A with an ornamental bar. No approval.
- **V5 direction:** use a one-ink mark only. Move the T entirely to the A's right-side zone, give it a longer exposed stem, cross a single right diagonal, and preserve a tile-color underpass. The T must still read at 24/32px before any second color is considered.
- **V5 — rejected in internal inspection:** despite the one-ink test, the T stem visually fused with the A's lower right leg, so the mark did not provide two independent letterforms. This is not sent to review or approval.
- **V6 direction:** keep the single right-diagonal overpass but move the T farther right, away from the A's lower leg; optimize first for independent `A` and `T` recognition, then for the interlock.
- **V6 — rejected in internal inspection:** it makes both letterforms more separable, but the construction becomes a generic A with a sidecar T and loses the compact, ownable monogram silhouette. It is not sent to review or approval.
- **Generated reference after V6 — rejected:** the model again produced familiar serif/collegiate letter anatomy plus raster artifacts. It confirms that generic generated lettering is not a viable production source; final artwork must be intentionally drawn as SVG.

## In scope

- One custom `AT` monogram with a clear foreground/background weave.
- A simple app-tile colorway and a one-color print test.
- Rendered evaluation at 24px, 32px, 64px, and 512px.

## Out of scope

- Storefronts, awnings, roads, antique-object illustrations, decorative frames, and type specimens.
- Replacing the live PWA icon or editing canonical design specs before explicit user approval.
- Copying the specific construction, proportions, colors, or trade dress of any existing sports-team or commercial mark.

## Acceptance criteria

1. A first-time viewer recognizes both `A` and `T` without labels at 32px.
2. The composition uses no more than two mark colors plus the tile background.
3. The mark has one dominant silhouette and remains legible in a one-color print treatment.
4. The interlock is structurally clear: each letter reads independently and the overlap looks intentional, not accidental.
5. No other symbol competes with the monogram.
6. The mark is original; named app/sports icons are quality references only, never templates.
7. An independent visual critique has no P0/P1 finding before a WOWED verdict.

## Evidence required

- Pixel-scale contact sheet (24/32/64/512px) for the final candidate.
- One-color print test.
- Design critique and detector evidence against the exact candidate revision.
