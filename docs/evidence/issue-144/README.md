# Issue 144 rendered typography evidence

Captured 2026-08-29 with the deterministic local review harness via
`CAPTURE_ISSUE_144_EVIDENCE=1 npm run test:e2e:review -- e2e/issue-144-typography.spec.ts --project=desktop`.

The 24 PNG files in this directory cover these six surfaces:

- public Store Browser;
- shopper Saved stores;
- shopper Trips;
- Store Representative portal;
- Administrator review queue; and
- public Store Photos.

Each surface is captured at 393×852 and 1280×900 in both light and dark themes. The same focused
Playwright contract also checks 390px, 768px, and 320px/200%-reflow equivalents, forced-colors,
non-vacuous computed type roles and rendered heading ratios, document overflow, readable-text bounds
and clipping (including overflow ancestors), and serious/critical axe violations. These screenshots
prove rendered fixture behavior only; they do not substitute for production RPC, authorization,
provider, or release evidence.
