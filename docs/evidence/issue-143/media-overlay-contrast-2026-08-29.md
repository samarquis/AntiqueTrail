# Issue #143 media overlay contrast evidence — 2026-08-29

## Result

The deterministic review harness passed 31/31 Chromium cases. It captured 31 PNGs (12,277,687 bytes): 24 combinations of 320×900, coarse-pointer 768×1024, and 1440×1000; light and dark themes; and near-white, high-detail, near-black, and unavailable media, plus one forced-colors capture and one opened-lightbox capture per viewport and one opened 320px text-spacing lightbox. A separate computed forced-colors unavailable lane passed. `2026-08-29/SHA256SUMS.txt` authenticates every image.

The assertions measure computed opaque backgrounds, WCAG text/control contrast, text-node ranges against their surface and actual clipping ancestors, viewport containment for fixed dialogs, actual horizontal-scroll reachability, center hit-testing, fixed-navigation separation, 48px control geometry, inert background isolation, focus restoration, keyboard order, touch activation, reduced motion, delayed image decode, unavailable media, long wrapping captions, and serious/critical Axe findings within Store Photos. A focused Store Details forced-colors case proves the adjacent shared consumer, and the 768 lane creates a real coarse-pointer touch context rather than relying on width alone.

## Reproduction

- Runtime: Node 24.11.1; Playwright 1.62.1; Vite 6.4.3; Chromium bundled by Playwright.
- Command: `$env:CAPTURE_ISSUE_143_EVIDENCE='1'; npx playwright test --config playwright.review.config.ts e2e/issue-143-media-overlay.spec.ts --project=desktop`
- Result: 31 passed in 2.7 minutes.
- Artifact inventory: 31 PNG files, 12,277,687 bytes; manifest SHA-256 `1d29bd8f32b7fe51d3719dfb55e06cb9ec6aba7c4fbdc4ee21e27fe877b77cb7`.
- Focused Vitest: 53/53 passed across the style, catalog mapper, and catalog component contracts.
- Full Vitest: 586/586 passed across 88 files; release tests: 58/58 passed.
- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed.

## Frozen candidate identity

- Base and HEAD: `d83574be50f15521034f717e02c9bc739345b960`.
- Tracked binary-diff Git object: `43c38829b23becfa1ef84bcc077523abfa07458f`.
- Full 44-path SHA-256 fingerprint: `5ff8341e8160a3db4ce8baa3a20ccf80790357f735afc7984860e8dd7dd0ed06`.
- Full-fingerprint algorithm: take `git status --porcelain=v1 --untracked-files=all`, exclude this self-referential evidence note, strip each status prefix, normalize separators to `/`, ordinal-sort, emit lowercase file SHA-256 plus two spaces plus path (or `DELETED  path`), join with LF plus a final LF, then SHA-256 the UTF-8 bytes without a BOM.

## Artifact inventory

| Artifact | Viewport/theme/state | SHA-256 |
|---|---|---|
| `desktop-1440-dark-high-detail.png` | 1440, dark, high-detail | `70e3de9234787af383f7fdc77e9a6e34a8d0816c6f587b031eb4bf98df1ed777` |
| `desktop-1440-dark-near-black.png` | 1440, dark, near-black | `c9662dbdca2ee6449b6fe8226a49f78be95117b5c90388d735354df00a2bb673` |
| `desktop-1440-dark-near-white.png` | 1440, dark, near-white | `a3a2c696f40bb5abaf15303cfc6ca13e1607dae8e55ffbc89e3f02de9fc753bd` |
| `desktop-1440-dark-unavailable.png` | 1440, dark, unavailable | `46b71eae8de3b0a1b58e151ffe8ac9124dc59b496195b420b776a5eb5e2036bc` |
| `desktop-1440-forced-colors.png` | 1440, forced colors, high-detail lightbox | `fd208e0ed8fea269c8917cdf16dc7f992972d4eae7dc8c055d16afbba1d181c9` |
| `desktop-1440-light-high-detail.png` | 1440, light, high-detail | `73e41baed332e35d67727736987d23a44aceb680aecf11d5eb1c57d28ad0369e` |
| `desktop-1440-light-near-black.png` | 1440, light, near-black | `979d034b174bc4cd5eb8221f6b5d1345a06943914829f91b422fdbac9489c4f6` |
| `desktop-1440-light-near-white.png` | 1440, light, near-white | `2644fca480684967c03d198fe670bf88b3b2e43822854764f54e342c5cf513f4` |
| `desktop-1440-light-unavailable.png` | 1440, light, unavailable | `731eae3c37ab6d9a67aa24270bbf0d6d49b6e660bd05c9541f4f17dcac5123e7` |
| `desktop-1440-lightbox.png` | 1440, light, opened high-detail photo 3 | `73dcf15966b7158486d40e8669b03bd77e1cb8a292d3ae4b289816dfa4ac1d25` |
| `mobile-320-dark-high-detail.png` | 320, dark, high-detail | `8e6d478c161bed317bb3493dc814fcca4bcfb118c61d05b9d77f9a88ea055545` |
| `mobile-320-dark-near-black.png` | 320, dark, near-black | `e1a6291781d7ff4fe601bd6799fb1a86f76ae56918ea7bc236e7b51203502f8e` |
| `mobile-320-dark-near-white.png` | 320, dark, near-white | `5a1496245536cfa3d68f502dc45e0af64a149ea85b70593f181fbd13ca07776c` |
| `mobile-320-dark-unavailable.png` | 320, dark, unavailable | `bf3d67360262cdb65c6b17c2493502c7ad5d3b01bff067bb476c0b86bdef9723` |
| `mobile-320-forced-colors.png` | 320, forced colors, high-detail lightbox | `143d49159548d3bca7d4d9f4f52a5cdb20a2d2fe76545629fdab9a40de725969` |
| `mobile-320-light-high-detail.png` | 320, light, high-detail | `f56a70edb5ac798f642db43d13f1b82196c85847c7a991df7cb2180509d17d21` |
| `mobile-320-light-near-black.png` | 320, light, near-black | `bb093762136669cb65acdd8c6dc748f6cd8d7428596c177336d40992742ebc41` |
| `mobile-320-light-near-white.png` | 320, light, near-white | `441d324283339d70d03eca4b523e033608abf1e2348be66513862f20911fc40d` |
| `mobile-320-light-unavailable.png` | 320, light, unavailable | `00de317be06666c859afe9afabbc63a9f0f7626c23a32114c970048c36d303be` |
| `mobile-320-lightbox.png` | 320, light, opened high-detail photo 3 | `1d8d7a7c9925260494bf0453fdeb58149d4dd38560177b1fab568381c5e5eb8c` |
| `mobile-320-text-spacing-lightbox.png` | 320, light, opened text-spacing lightbox | `0fe792b6798b676e4015a384a85cbdad9973351258b5b5fc583d6b9937a7ddb9` |
| `tablet-768-touch-dark-high-detail.png` | 768 touch, dark, high-detail | `d385d4e23b1b32b6759c1a0590d807fad0b70b811bc3dfa93c172b506a96e133` |
| `tablet-768-touch-dark-near-black.png` | 768 touch, dark, near-black | `9f84c1c90d8398dafc1b29ebaa2911d9453f2c7c0d1150837c3ddfdbbe645570` |
| `tablet-768-touch-dark-near-white.png` | 768 touch, dark, near-white | `f20f7609701afa0d4ea940097f8f2ce36e07c093e9b6162673ceaf725d30148b` |
| `tablet-768-touch-dark-unavailable.png` | 768 touch, dark, unavailable | `e6550640765c3aa12c76b2558ee3a13f2d11e0f2db069be2a7df6b9e5186916a` |
| `tablet-768-touch-forced-colors.png` | 768 touch, forced colors, high-detail lightbox | `b879e80ef0a807cddd5231a1fb21eaf87431ac8fa39aa44c50efa0a5281f214a` |
| `tablet-768-touch-light-high-detail.png` | 768 touch, light, high-detail | `dcffcd3745d8e80a9faf716e769643367c7cef3ffba224b43a088a92832e20ca` |
| `tablet-768-touch-light-near-black.png` | 768 touch, light, near-black | `2fa153ebcefaeb9785b2058245e2cc8321e22eaedaff220bd19b4dea007d353e` |
| `tablet-768-touch-light-near-white.png` | 768 touch, light, near-white | `7ee48b9b09940dba32f579e71efdbda4a8a1caaf7f977c575eca6dc99a00952e` |
| `tablet-768-touch-light-unavailable.png` | 768 touch, light, unavailable | `84124855f9101e3acc92025b38cd1cff557ad66195b29657bcce72d60f6ce6ca` |
| `tablet-768-touch-lightbox.png` | 768 touch, light, opened high-detail photo 3 | `258f219f49cccb4c85b21683457a6b1ac2e44b59532d81577a131bb9f21444dd` |

## Scope and limitations

The browser route is the repository's deterministic local review harness. Its privacy boundary proves private storage identifiers, signed parameters, reviewer-only facts, and unsupported provenance do not enter overlay visible text, accessible names/descriptions, user-visible attributes, console/errors, or committed evidence. Image transport `src`/`srcset` URLs are deliberately outside this overlay-metadata assertion and were not misrepresented as forbidden metadata. This is not production transport, authorization, persistence, upload, storage, content-review workflow, image-provider, or hosted-CI evidence. The production catalog mapper currently exposes only public `src`, `alt`, and `kind`; therefore caption and rights presentation is proven for the existing component input contract and fixtures, while production availability of those optional fields remains outside #143 and was not fabricated.
