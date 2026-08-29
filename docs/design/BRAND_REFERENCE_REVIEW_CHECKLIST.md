# Brand reference review checklist

Use this checklist for a human Mood, Voice, and Token Compliance decision. Automated structure checks prove presence and links; they do not approve design judgment.

## Candidate and governance

- [ ] Record candidate HEAD, self-excluding diff fingerprint, date/time zone, reviewer name, and reviewer role in the dated issue-146 note.
- [ ] Confirm `mood.md`, `voice.md`, and `tokens.md` each have one H1 and non-empty Status, Owner, Last reviewed, Approval mechanism, Authority and precedence, and Cross-references fields.
- [ ] Confirm status is `Proposed` or `Changes requested` until a Product Owner or explicit design delegate records `Approved`.
- [ ] Resolve every conflict using root source precedence; do not select the easier rule.
- [ ] Confirm palette terminology matches the current Daylight Archive and Midnight Archive authority without reviving superseded names.
- [ ] Confirm bidirectional discoverability from `docs/design/README.md`, `DESIGN_SYSTEM.md`, and `manifest.json`.

## Mood critique

- [ ] Cite the approved quiet, trustworthy, legible, locally curious, archival-without-clutter rule.
- [ ] Check Daylight Archive, Midnight Archive, and forced-colors behavior without reviving Field-and-Brass, teal, mint-glass, bottle-green, parchment, sepia, distressed type, barnwood, decorative antique clutter, or antique-shop costume.
- [ ] Check practical imagery, synthetic/fictional disclosure, provenance/no false endorsement, generic-collage prohibition, and image-unavailable treatment.
- [ ] Confirm icon/brand-mark findings cite `ICON_PLACEMENT_SPEC.md` and do not reopen V3.

## Voice critique

- [ ] Check navigation, buttons, loading, empty, error/recovery, status/freshness, privacy/safety, Store Portal, and Administrator rules with cited examples.
- [ ] Distinguish verified, reported, pending, unavailable, fictional, and synthetic.
- [ ] Reject unproved endorsement, ranking, live capability, travel-time promise, publication, authority, and private-data visibility.
- [ ] Confirm review-harness disclosure and production copy remain separate.
- [ ] Cover public, authenticated-shopper, Store Representative, and Administrator contexts.

## Token Compliance critique

- [ ] Check color, typography, spacing, radius, elevation, focus, motion, target size, responsive behavior, components/states, dark theme, and forced colors against linked authority.
- [ ] Confirm `tokens.md` contains no copied visual-value table or hexadecimal color literal.
- [ ] Verify contrast thresholds and clay/rust plus brass/gold reservations through the controlling design-system links.
- [ ] Verify #141 is described as landed form-control ownership and #142 as open semantic-color coordination; inspect live issue state before approval.
- [ ] Require a documented owner for every intentional literal exception.

## Representative route matrix

- [ ] Public Browse: `/stores`, populated/loading/empty/error/image-unavailable, light/dark/forced-colors.
- [ ] Public Store Details: `/stores/blue-finch-curios`, trust, imagery, actions, unavailable states.
- [ ] Shopper: `/saved` and `/trips`, private ownership, empty/error, light/dark/reflow.
- [ ] Store Representative: `/store-portal`, live/pending/review-controlled language and next action.
- [ ] Administrator: `/admin`, neutral case language, density, denial/unavailable behavior.
- [ ] At phone, tablet, desktop, text spacing, and supported zoom, record no clipping, overlap, obscured action, or horizontal page scroll.

## Decision and evidence

- [ ] Run `npm run docs:brand:check`, focused Prettier, `npm run test:release`, and repository checks; paste exact outcomes.
- [ ] Record `Approved` or `Changes requested`, the deciding reviewer, cited failures, and intentionally deferred questions. Write `None` when no questions are deferred.
- [ ] For approval, record reviewer role exactly as `Product Owner` or `Delegated design decision-maker; delegated by <Product Owner name/handle>` so decision authority is explicit and auditable.
- [ ] Do not treat automated keyword matches, the review harness, an AI agent, or an implementation author as Product Owner approval.
