# Gates: leaf-117 (#117 browser verification sweep Packages 9/10A/10B staged-off surfaces)

Scope: prove the staged-off surfaces of Packages 9 (public reviews), 10A, 10B are truly inert in the browser while flagged off; where harness scenarios exist for flag-on synthetic behavior, run them. EXECUTE ONLY THE PREP THIS PHASE — port 4174 is owned by leaf-116 until it finishes; your live sweep runs after.

Prep deliverables:
1. e2e/ui11-staged-off-inert.spec.ts (new file you own): Playwright spec asserting staged-off inertness per package: no reachable reviews/release surfaces (routes render not-available/redirect, no nav entries, direct URL denied) when capability flags are false; use review-harness identity/state parameters as for other specs.
2. docs/testing/draft-verdicts-117.md skeleton with one section per package and a surface inventory table (route/RPC/UI surface x expected flag-off behavior), derived from migrations 20260814101000/20260817100000/20260821000000 + src routing.
3. Identify which flag-on scenarios the harness can simulate (reviewState params); list them in the draft; do not run yet.

Live-phase gates (after port frees):
- [ ] G1: ui11 spec exists and compiles under playwright config testMatch (add match entry if needed)
  CHECK: Test-Path e2e\ui11-staged-off-inert.spec.ts
  EXPECT: True
  EVIDENCE: pending — spec file needs to be created per prep deliverable

- [ ] G2: surface inventory complete for 9/10A/10B
  EVIDENCE: pending — inventory derived from migrations + src routing; will be documented in draft-verdicts-117.md

- [ ] G3: LIVE: npx playwright test --config playwright.review.config.ts e2e/ui11-staged-off-inert.spec.ts passes (or every failure has a filed defect ticket)
  EVIDENCE: pending — live stack required; runs after port 4174 freed (post leaf-116)

- [ ] G4: dated verdict sections written in docs/testing/draft-verdicts-117.md; zero unfiled findings
  EVIDENCE: pending — written after live sweep; one section per package (9/10A/10B)
