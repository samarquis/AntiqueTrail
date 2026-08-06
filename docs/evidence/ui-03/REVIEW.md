# UI-03 Product Owner visual review

Status: **Awaiting Product Owner approval.** Do not close issue #33 until that approval is
recorded on the issue.

## Review URL and order

From the repository root, start a persistent human-review server:

```console
npm run dev -- --host 127.0.0.1 --port 4173
```

The server remains available until you stop it with `Ctrl+C`. Review in this order:

1. Open `http://127.0.0.1:4173/stores` at a desktop width (1440 × 1000). Confirm all twelve
   cards use distinct, plausible fictional storefronts and no generic placeholder repeats.
2. Repeat `/stores` at tablet (768 × 1024) and phone (390 × 844). Confirm crops retain the
   storefront subject and image loading does not obscure the store name or actions.
3. Open `http://127.0.0.1:4173/stores/blue-finch-curios`. Enlarge the cover and each of the three
   gallery images in order. Confirm they are visually coherent but genuinely different
   photographs.
4. With a screen reader or accessibility inspector, confirm each image announcement matches
   the useful visual content and does not merely repeat the store name or caption.
5. Temporarily block one request under `/images/synthetic-stores/` in browser developer tools,
   reload, and confirm the image-failure treatment remains meaningful and the listing stays
   usable.
6. Compare the rendered set with `DESIGN.md` Browse and Store Details sections and
   `DESIGN_SYSTEM.md` Store card / Browse-to-details contracts.
7. Inspect `synthetic-store-contact-sheet.webp` for set-level consistency and reply to issue #33
   with either explicit approval or asset-specific revision requests.

## Mechanical evidence

- 12 unique cover source identities; Blue Finch has 1 cover plus 3 distinct gallery images.
- 45 responsive WebP derivatives validated non-empty and decodable with Pillow.
- Derivatives contain no EXIF or source metadata from generation.
- Unit contract verifies unique local cover paths, meaningful alt text, generated-rights labels,
  and the Blue Finch gallery count/uniqueness.
- Contact sheet: `docs/evidence/ui-03/synthetic-store-contact-sheet.webp`.

## Reproduce the rendered evidence

From the repository root, after dependencies and the Playwright Chromium browser are installed,
run:

```console
node scripts/capture-ui03-evidence.mjs
```

The script starts an isolated Vite server on an available loopback port and stops only the server
it created. Before writing a screenshot it scrolls every lazy-loaded cover into view, checks that
all expected images decoded with non-zero natural width and height, confirms twelve distinct Browse
cover URLs, and exercises all four Blue Finch gallery choices. A missing, blank, duplicate, or
unselectable expected image fails the command.

The August 6, 2026 evidence run produced:

| Evidence | Capture viewport | PNG dimensions |
| --- | --- | --- |
| `browse-desktop.png` | 1440 × 1000 | 1440 × 6002 |
| `browse-tablet.png` | 768 × 1024 | 768 × 11635 |
| `browse-mobile.png` | 390 × 844 | 390 × 9692 |
| `blue-finch-gallery-desktop.png` | 1440 × 1000 | 1440 × 3971 |

Visual inspection of that run found all twelve storefronts present with no blank cards at each
Browse viewport. The covers remain landscape, fill the card width, and retain a recognizable
storefront subject. Blue Finch renders its cover and three distinct gallery thumbnails without a
missing-image treatment.

The broader UI-03 definition-of-done checks (keyboard, 200% reflow, action target size, route
focus, and loading/error states) are shared application-shell/gallery behaviors. Their final
Playwright screenshots belong with the integrated UI-01/UI-02 acceptance run; this image-set
evidence does not claim those checks by itself.

