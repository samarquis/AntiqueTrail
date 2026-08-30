# Gates: issue 143 media overlay contrast

Scope: Guarantee shared readable Store Photos, gallery-tile, and lightbox captions/controls over arbitrary approved imagery without changing upload, storage, moderation, crop behavior, or broad semantic-color ownership.

- [x] G1: One shared caption/overlay contract covers feature gallery, tiles, and lightbox captions/controls.
      CHECK: npx vitest run src/app/styles.test.ts src/features/catalog/components.test.tsx src/features/catalog/catalogApi.test.ts
      EVIDENCE: 53/53 passed; `mediaOverlay.tsx` is consumed by Store Photos and legacy Store Details for captions, unavailable states, accessible action names, and controls.

- [x] G2: Deterministic tests prove normal text >=4.5:1 and controls/icons >=3:1 over near-white, high-detail, dark, and unavailable fixtures.
      CHECK: npx playwright test --config playwright.review.config.ts e2e/issue-143-media-overlay.spec.ts --project=desktop
      EVIDENCE: 31/31 passed; static token math and every rendered computed surface/control are measured independently of image pixels, including forced-colors unavailable media and the Store Details shared consumer.

- [x] G3: Hover, focus, touch, screen-reader, reduced-motion, and forced-colors behavior expose equivalent readable information and visible focus.
      CHECK: npx playwright test --config playwright.review.config.ts e2e/issue-143-media-overlay.spec.ts --project=desktop
      EVIDENCE: persistent visual caption/action plus equivalent accessible action name; keyboard/focus-return, real touch contexts, reduced motion, delayed decode, forced-colors unavailable media, and full Store Details forced-color/control/position-update assertions passed.

- [x] G4: Rendered 320px mobile, tablet, and desktop evidence proves captions/controls do not clip, overlap, create horizontal overflow, or collide with fixed navigation.
      EVIDENCE: 31 SHA-256-authenticated PNGs (12,277,687 bytes) in `docs/evidence/issue-143/2026-08-29`; opened lightboxes exist at 320/768/1440 and 320 text spacing. Text Range/actual clipping-ancestor geometry, viewport containment, center hit-testing, fixed-navigation separation for every modal caption/status/control, and an actual `scrollTo(left: 99999)` reachability probe passed.

- [x] G5: Media metadata remains limited to approved public fields; tests reject private object keys, signed URLs, reviewer-only details, and unsupported provenance.
      CHECK: npx vitest run src/features/catalog/catalogApi.test.ts src/features/catalog/components.test.tsx
      EVIDENCE: mapper equality proves the `src`/`alt`/`kind` allowlist and render canaries prove extra fixture fields never enter text or accessible names; production mapper code is unchanged.

- [x] G6: Focused component/accessibility and repository regression checks pass.
      EVIDENCE: focused Vitest 53/53; full Vitest 586/586 across 88 files; release 58/58; format, lint, typecheck, build, and `git diff --check` passed.

- [x] G7: Dated artifacts and `REVIEW_VERDICTS.md` reconcile issue-143 implementation evidence and limitations.
      EVIDENCE: `docs/evidence/issue-143/media-overlay-contrast-2026-08-29.md`, image manifest, and dated `REVIEW_VERDICTS.md` entry distinguish deterministic presentation proof from production/hosted authority.

- [x] G8: Diff scope stays within shared media presentation/tests/evidence; no upload, storage, moderation, crop, or broad #142 migration.
      EVIDENCE: final name/diff audit changes only media presentation, catalog tests, review Playwright configuration/spec, evidence, verdict, and this gate; two narrow media color tokens explicitly preserve #142 ownership.

- [x] G9: Four unlazy inspect/fix passes complete with no remaining in-scope defect.
      EVIDENCE: A21 pass 1 reconciled A20 against A19 and rejected only adjudicated overreach; pass 2 added nav clearance, MediaPosition's six-part contract, and complete forced-color consumers; pass 3 used rendered failures to repair both mobile bottom-nav and desktop sticky-header collisions; pass 4 rechecked both consumers, all 31 artifacts, manifest, privacy boundary, formatting, regressions, scope, and hashes.

- [ ] G10: Hosted PR checks, merge evidence, and live-issue closure evidence exist.
      ABANDON: implementation task is not authorized to commit, push, open/merge a PR, or mutate GitHub; leave these closure steps pending for the parent workflow.
