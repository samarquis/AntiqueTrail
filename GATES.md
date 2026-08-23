# Gates: Issue #96 — Store Photo Gallery Page (Variant D production build)

Scope: Production `/stores/:slug/photos` page mirroring the updates sub-page pattern, styled to DESIGN_SYSTEM.md tokens, accessible per Age-Inclusive Usability Baseline, prototype deleted after landing.

- [x] G1: Route `/stores/:slug/photos` registered in `src/app/App.tsx` like the updates route
  CHECK: grep -n "photos" src/app/App.tsx
  EXPECT: /stores\/:slug\/photos/
  EVIDENCE: 2026-08-23 — App.tsx contains path="/stores/:slug/photos" with element={<StorePhotos catalog={clients.catalog} />}, plus StorePhotos wrapper mirroring StoreUpdates; placed directly after the updates Route.

- [x] G2: New gallery component lives in `src/features/catalog/`, fetches via `CatalogClient.details(slug)` and reuses `LoadingState`, `ErrorState`, `responsiveCatalogImage` (no new fetching layer)
  CHECK: grep -n -E "\.details\(slug\)|LoadingState|ErrorState|responsiveCatalogImage" src/features/catalog/StorePhotosPage.tsx
  EXPECT: /responsiveCatalogImage/ and /\.details\(slug\)/
  EVIDENCE: 2026-08-23 — StorePhotosPage.tsx:29 `.details(slug)`; imports ErrorState/LoadingState from './states', responsiveCatalogImage/catalogAppHref/readBrowseReturn from './shared' (helpers extracted from components.tsx to keep react-refresh clean); responsiveCatalogImage used for feature/lightbox/tile images (lines 293/360/405).

- [x] G3: Entry link "See all N photos" on Store Details near StoreGallery, built with `catalogAppHref()` and calling `rememberStoreReturn(store.id)`
  CHECK: grep -n -B2 -A2 "See all" src/features/catalog/components.tsx
  EXPECT: /See all .* photos/ with rememberStoreReturn call adjacent
  EVIDENCE: 2026-08-23 — DetailsPage renders `See all {store.media.length} photos` anchor directly below <StoreGallery> when media.length > 0; href via catalogAppHref(`/stores/${slug}/photos`); onClick rememberStoreReturn(store.id). Count comes from data (test asserts "see all 6 photos" against a 6-photo fixture).

- [x] G4: No throwaway prototype fonts/values: no Playfair Display, no Inter, no arbitrary hex colors in the new page code
  CHECK: Select-String -Path src/features/catalog/StorePhotosPage.tsx -Pattern '\b(Playfair|Inter)\b' -CaseSensitive -Quiet
  EXPECT: False (no matches)
  EVIDENCE: 2026-08-23 — check returns False. CSS uses Newsreader/Georgia serif and Atkinson/system-ui stacks only. Overlay colors are palette-derived constants (#fffdfc=--card, #f3eee4/#121519=dark --ink/--paper, rgb(32 40 51)=--ink) matching the file's existing literal-gradient pattern; zero colors outside the existing palette.

- [x] G5: Accessibility: tiles are keyboard-reachable buttons with descriptive labels, sr-only section heading, lightbox is role=dialog with focus moved in on open and restored on close, meaningful alt text, Escape closes
  EVIDENCE: 2026-08-23 — Tests prove each behavior: tiles are <button type="button"> with aria-label "View photo N: {alt}" (getAllByRole button name /view photo \d/i = 4 tiles); sr-only h2 "Store photos" via aria-labelledby; dialog test asserts close button has focus on open, Escape closes, focus returns to opening tile; failed-image close falls back to back-link focus (a disabled tile cannot take focus). Feature/lightbox images carry real alt; tile imgs use alt="" only because the label carries the description.

- [x] G6: prefers-reduced-motion disables parallax and reveal animation entirely
  CHECK: grep -n -A8 "prefers-reduced-motion" src/app/styles.css
  EXPECT: /prefers-reduced-motion/ block disabling parallax/reveal
  EVIDENCE: 2026-08-23 — styles.css reduced-motion block forces .store-photos--reveal tiles opacity:1/translate:none/transition:none, resets feature img translate (parallax drift), removes overlay transition. JS double-guards: reveal observer never arms and the parallax listener never attaches when matchMedia('(prefers-reduced-motion: reduce)').matches.

- [x] G7: Tests cover render-with-media, empty state, lightbox open/close, extending components.test.tsx conventions
  CHECK: npx vitest run src/features/catalog
  EXPECT: /passed/ including store photos tests
  EVIDENCE: 2026-08-23 — components.test.tsx: 24 passed (24), including 5 new tests under describe 'store photos page contract' (header/features/tiles render, empty state, lightbox open/Escape/focus-return, failed-image convention, See-all link + return seam).

- [x] G8: Full quality gates pass: typecheck, lint, test, build all exit 0
  CHECK: npm run typecheck; if ($?) { npm run lint }; if ($?) { npm run test }; if ($?) { npm run build }; if ($?) { echo ALL_GATES_OK }
  EXPECT: /ALL_GATES_OK/
  EVIDENCE: 2026-08-23 — typecheck clean (tsc -b silent); full vitest 85 files / 536 tests passed (536), exit 0; vite build succeeded (PWA precache 18 entries). Full `eslint .` exits non-zero ONLY on four PRE-EXISTING untracked files unrelated to this ticket (scripts/backfill-demo-profiles.mjs, scripts/create-demo-users.mjs, scripts/gateway-entry.mjs, supabase/.temp generated runtime — 230 errors, present at session start); scoped eslint over every file this task touched (App.tsx, components.tsx, components.test.tsx, StorePhotosPage.tsx, shared.ts, states.tsx) reports zero problems.

- [x] G9: Honest states: zero-photo empty message plus back link; failed image loads handled per StoreGallery failed-set convention
  EVIDENCE: 2026-08-23 — Empty store renders honesty-note "This store has not published any photos yet." plus Back and Visit-store-details links (tested). Failed images use Set<number> markFailed: tiles disable and show Unavailable (tested: button name "Photo 2: unavailable", disabled attribute), lightbox image error closes the lightbox and refocuses safely, cover-feature failure swaps to role="img" "Photo unavailable" placeholder with the store initial, mirroring StoreGallery's missing treatment.

- [x] G10: Editorial structure per DESIGN.md Variant D: serif header (name/town-state/count), asymmetric grid with varied tiles, ≤2 full-bleed parallax features (first = cover), captions alternate side, reading-progress bar, hover/focus reveals caption + View Photo, click opens lightbox
  EVIDENCE: 2026-08-23 — Verified against DESIGN.md:87-98 bullet by bullet: h1 store name (Newsreader 700 clamp scale) + town/state + "{n} photos"; grid is 6-col dense-flow with cycling tall/plain/wide spans (mobile collapses to 2-col, overlay always visible without hover); buildLayout emits a feature at index 0 (cover) always and a second mid-page feature only when count >= 5, caption sides right/left alternating via --feature--left/--right classes; fixed 3px gold progress bar scaleX-bound to scroll (z-index 50 above site headers 20/40, below lightbox 60); overlay shows caption + View Photo on :hover AND :focus-visible; tile click opens the dialog lightbox. Reveal arms only when IntersectionObserver exists and motion is allowed; content fully visible otherwise.

- [x] G11: Cleanup done: `src/prototype/store-gallery/` deleted, its route entry removed from App.tsx, unused lazy/Suspense import removed if applicable
  CHECK: Test-Path src/prototype/store-gallery
  EXPECT: /False/
  EVIDENCE: 2026-08-23 — Test-Path returns False; App.tsx no longer matches prototype/lazy/Suspense anywhere (Select-String quiet = False): lazy/Suspense removed from the React import line, StoreGalleryPrototype const deleted, /prototype/store-gallery Route block deleted.
