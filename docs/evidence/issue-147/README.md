# Issue 147 rendered catalog-metadata evidence

Captured 2026-08-29 from the deterministic local review harness with:

`CAPTURE_ISSUE_147_EVIDENCE=1 npm run test:e2e:review -- e2e/issue-147-catalog-metadata.spec.ts --project=desktop`

The dated JPEGs cover all twelve repeated public catalog cards at 320, 393, 768, and 1280 CSS-px
widths in light and dark themes. Separate captures cover loading, empty, and error at 393px/light;
the 320 CSS-px reflow area that a 640px viewport exposes at 200% browser zoom in both themes; WCAG
text spacing at 320px in both themes; and a real Windows Chrome session set through Chrome's UI to
200% in light and dark. The executable suite checks every state and text-spacing case at all four
widths and both themes; screenshots are a compact visual record, not a substitute for assertions.

The failed-cover capture measures the meaningful category/photo-status placeholder at 15px without
clipping. `2026-08-29-phone-393-light-card-measurements.json` persists computed type and geometry for
every meaningful field in all twelve cards, including both available category variants and every
summary, hours, freshness, location, and action instance.

Playwright cannot itself emulate desktop browser zoom with layout reflow, so its test records the
standards-equivalent calculation `640 / (200 / 100) = 320`. The separate Chrome evidence closes
that limitation: Chrome's own control reported 200%, while the live page reported a 404px inner
width, 397px visual/document width, 822px outer width, and device pixel ratio 4. In both themes all
12 named cards reported zero clipped fields, zero overflowing cards, zero undersized controls, and
zero horizontal document overflow; meaningful fields remained at least 15px.

The focused test records computed sizes and geometry for every repeated area, category, freshness,
hours, location/description, and title node; card/text clipping, scan order, document overflow,
action separation, mobile filter visibility, every card action against fixed navigation, and 48px
interactive targets are asserted rather than inferred from screenshots.

This is synthetic review-harness evidence only. It does not substitute for production RPC,
authorization, provider, release, pull-request, or merged-main evidence.
