# UI-03 Synthetic Store image provenance

## Rights and source declaration

All images in this set were generated specifically for Antique Trail on 2026-08-05 with
Codex's built-in OpenAI image generation tool. No reference images, real-store photographs,
website screenshots, social-media images, trademarks, or third-party artwork were supplied.
The assets depict fictional stores and are approved only as Internal Alpha fixtures until the
Product Owner completes the visual-approval gate. Their use remains subject to the applicable
OpenAI service terms; this record does not make a representation about copyright status.

Every generated source was re-encoded locally as metadata-free WebP. The application serves
the 1280-pixel variant; matching 480- and 800-pixel variants are maintained beside it for
responsive delivery. All variants preserve the generated 3:2 composition.

## Prompt contract

The complete set used the `photorealistic-natural` image-generation mode and this shared
prompt contract:

- Asset: responsive cover or gallery photograph for an entirely fictional Synthetic Store.
- Style: believable, unstaged editorial architectural/interior photography in natural color.
- Composition: landscape 3:2 with a safe center crop for card and detail layouts.
- Direction: a contemporary Midwestern field-notebook aesthetic using warm brick, cream,
  deep teal, restrained rust/gold, honest wood, ceramic, glass, and brass textures.
- Required exclusions: no people, readable shop names, logos, brands, watermarks, legible text,
  real artwork reproductions, distressed sepia, theatrical antique-shop costume, or copied
  source material.

The unique scene request for every final asset is recorded below.

| Asset | Unique scene request | Application alternative text |
| --- | --- | --- |
| `blue-finch-curios-cover` | Blue-painted brick storefront with lamps, ceramics, and walnut chests | Blue-painted brick storefront with antique lamps, ceramics, and small chests in the windows. |
| `cedar-and-brass-cover` | Cedar-clad brick storefront with brass candlesticks and walnut cabinet | Cedar-clad storefront displaying a walnut cabinet and brass candlesticks. |
| `elm-street-finds-cover` | Cream storefront shaded by an elm, with ceramics and framed art | Cream brick storefront shaded by an elm tree, with pottery and framed art in the windows. |
| `juniper-house-cover` | Juniper-green craftsman bungalow shop with native plantings | Deep green craftsman storefront with porch displays and native flowers. |
| `maple-lantern-cover` | Stone corner store with maple-red trim and glowing lantern | Stone corner storefront with red trim, a glowing lantern, and antique furniture. |
| `north-star-relics-cover` | Cream masonry and navy trim with trunks, maps, and oak chairs | Navy-trimmed storefront displaying travel trunks, maps, and wooden chairs. |
| `prairie-cabinet-cover` | Buff brick store with prairie-style cabinets and woven rugs | Buff brick storefront with oak cabinets and woven rugs behind broad windows. |
| `redbud-market-cover` | Rose-red brick storefront beneath blooming redbud | Rose-red storefront beneath a blooming redbud tree, with quilts in the windows. |
| `sunflower-salvage-cover` | White industrial brick, mustard door, sunflowers, salvage fixtures | White brick storefront with a mustard door, sunflower planters, and salvaged furniture. |
| `tallgrass-treasures-cover` | Tan brick and native-grass planters with quilts and pottery | Tan brick storefront framed by tall grasses, with pottery and quilts on display. |
| `union-station-vintage-cover` | Reused railway brick arches with trunks, clocks, and vintage chairs | Arched brick storefront with teal doors, travel trunks, clocks, and vintage chairs. |
| `willow-and-wren-cover` | Willow-green creekside storefront with baskets and botanical art | Willow-green storefront beside a creek, displaying baskets, botanical art, and chairs. |
| `blue-finch-curios-gallery-aisle` | Brick aisle with blue shelving, ceramic lamps, and walnut furniture | Narrow brick-walled shop aisle lined with blue shelves, ceramic lamps, and walnut furniture. |
| `blue-finch-curios-gallery-vignette` | Blue-and-white lamp and ceramics with brass on carved walnut | Blue-and-white ceramic lamp with brass candlesticks on a carved walnut table. |
| `blue-finch-curios-gallery-cabinet` | Oak library cabinet, blue chair, glassware, and brick | Oak glass-front cabinet, blue upholstered chair, and glassware against a brick wall. |

## Derivative inventory

Each slug above exists in all three directories:

- `public/images/synthetic-stores/480w/` — 480 × 320, WebP quality 76.
- `public/images/synthetic-stores/800w/` — 800 × 533, WebP quality 80.
- `public/images/synthetic-stores/1280w/` — 1280 × 853, WebP quality 84.

The committed 1280-pixel files are the maintainable source set.
`build_derivatives.py` reproducibly derives the smaller variants and contact sheet from those
masters, strips metadata during every re-encode, and fails if a named master is missing. Runtime
assets have no dependency on the tool's local generation directory.
