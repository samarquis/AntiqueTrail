# Antique Trail token review index

- **Status:** Proposed
- **Owner:** Product Owner
- **Last reviewed:** 2026-08-29
- **Approval mechanism:** A Product Owner or explicitly delegated design decision-maker records `approved` in the dated [brand-reference review note](../evidence/issue-146/brand-reference-review-2026-08-29.md) after completing the [review checklist](BRAND_REFERENCE_REVIEW_CHECKLIST.md).
- **Authority and precedence:** The root [source precedence](../../README.md#source-precedence) controls. [DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) owns exact visual values and component rules; [styles.css](../../src/app/styles.css) is the implementation seam. This file is an index, not a second token implementation. Conflicts stop dependent work until the controlling source and implementation are reconciled.
- **Cross-references:** [Mood](mood.md), [voice](voice.md), [palette reference](PALETTE_PROPOSAL.md), and [brand checklist](BRAND_REFERENCE_REVIEW_CHECKLIST.md).

## Token ownership and naming

Name reusable tokens by semantic role, not by a route, component, or newly invented hue. Existing hue-named aliases are compatibility details documented by the controlling design system; they are not an API for new work. Components consume the shared semantic contract and do not create route-local visual scales.

## Review index

| Category                       | Exact authority                                                                                                                                                            | Implementation and verification seam                                                   | Review requirement                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Color and contrast             | [Visual tokens: Color](../../DESIGN_SYSTEM.md#color)                                                                                                                       | [styles.css](../../src/app/styles.css), [styles.test.ts](../../src/app/styles.test.ts) | Check semantic role, approved contrast threshold, status-not-color-alone, and both themes.                     |
| Typography                     | [Visual tokens: Typography](../../DESIGN_SYSTEM.md#typography)                                                                                                             | [styles.css](../../src/app/styles.css), [styles.test.ts](../../src/app/styles.test.ts) | Check family, role, weight, leading, tracking, mobile floor, and text resizing without inventing local values. |
| Spacing, radius, and elevation | [Space, shape, and elevation](../../DESIGN_SYSTEM.md#space-shape-and-elevation)                                                                                            | [styles.css](../../src/app/styles.css)                                                 | Check use of the shared scale, component shape, and elevation by meaning rather than decoration.               |
| Focus                          | [Space, shape, and elevation](../../DESIGN_SYSTEM.md#space-shape-and-elevation) and [Accessibility interaction](../../DESIGN_SYSTEM.md#accessibility-interaction-contract) | [styles.css](../../src/app/styles.css), browser accessibility tests                    | Check a visible dual boundary or tested equivalent against every adjacent surface.                             |
| Motion                         | [Space, shape, and elevation](../../DESIGN_SYSTEM.md#space-shape-and-elevation)                                                                                            | [styles.css](../../src/app/styles.css)                                                 | Check short state feedback and reduced-motion behavior; motion never carries required meaning alone.           |
| Target size                    | [Space, shape, and elevation](../../DESIGN_SYSTEM.md#space-shape-and-elevation)                                                                                            | [styles.css](../../src/app/styles.css), browser target measurements                    | Check the governed minimum for every interactive control, including mobile and reflow.                         |
| Responsive behavior            | [Responsive layout contract](../../DESIGN_SYSTEM.md#responsive-layout-contract)                                                                                            | [styles.css](../../src/app/styles.css), phone/tablet/desktop browser evidence          | Check reflow, reading order, text spacing, zoom, fixed navigation, and no horizontal page scroll.              |
| Components and states          | [Component contract](../../DESIGN_SYSTEM.md#component-contract) and [Shared asynchronous-state matrix](../../DESIGN_SYSTEM.md#shared-asynchronous-state-matrix)            | React components and browser evidence                                                  | Check anatomy, loading, empty, error, focus, action, and recovery without route-local tokens.                  |
| Dark theme                     | [Visual tokens: Color](../../DESIGN_SYSTEM.md#color)                                                                                                                       | Root theme tokens in [styles.css](../../src/app/styles.css)                            | Check role parity with light theme; dark mode is not a separate brand.                                         |
| Forced colors                  | [Accessibility interaction contract](../../DESIGN_SYSTEM.md#accessibility-interaction-contract)                                                                            | forced-colors rules in [styles.css](../../src/app/styles.css) and browser evidence     | Check system-color legibility, borders/focus, and status without relying on authored color.                    |

## Semantic color coordination

[Issue #142](https://github.com/samarquis/AntiqueTrail/issues/142) owns the semantic-color-token migration and its documented intentional literal exceptions. It is coordination work, not a dependency of this reference, and this document does not claim that migration has landed. Once #142 lands, component rules must not introduce direct reusable semantic color literals; image treatment, alpha composition, and art-direction exceptions remain only where #142 explicitly documents ownership.

[Issue #141](https://github.com/samarquis/AntiqueTrail/issues/141) owns the landed shared form-control contrast contract. Review form borders, placeholders, disabled/invalid states, focus, light/dark parity, and forced-colors behavior against [styles.test.ts](../../src/app/styles.test.ts) and the current implementation—not copied values here.

## Color reservations and contrast

Use the exact contrast pairs and thresholds in [DESIGN_SYSTEM color](../../DESIGN_SYSTEM.md#color). Clay/rust is reserved for destructive, danger, and important-new meaning. Brass/gold is reserved for warning and freshness attention. Neither is general decoration, geographic text, or neutral emphasis. Status always includes plain language or another non-color indicator.

## Theme and accessibility expectations

Every token review covers light, dark, and forced-colors modes. It also checks keyboard focus, reduced motion, user text spacing, responsive reflow, and the target-size contract. A literal or visually similar result does not pass if it bypasses semantic ownership or loses meaning when authored colors are suppressed.

## Token Compliance critique decision rule

A Token Compliance review passes only when every index row is evaluated against its linked authority and current implementation/test seam, exceptions cite their owner, #141/#142 status is described accurately, and no value is invented from screenshots or this index.
