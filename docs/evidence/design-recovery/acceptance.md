# Published Browse design recovery

## Candidate and authority

- Request: recover the latest design after the published site lost its larger hero.
- Owner: this recovery chat; `C:/Users/samar/.codex/worktrees/51cf/AntiqueTrail`.
- Branch: `codex/recover-published-design`.
- Risk: standard visible UI; no authorization or provider changes.
- Baseline: `b3016653b79eddeef18c7bca6fa71d8df3f13c43`, also live GitHub main at review time.
- Source candidate: `a6cac29b9b2c41b582f469250d94730d55b81093`.
- Baseline-to-source diff fingerprint: `3b917c34ac36bd2c30c27f5c9b07a3900b859b04`.
- Captured: October 2, 2026, America/Chicago.
- Authority used: local recovery, tests, commits, and review. Push, merge, and publication remain separate release steps.

## Recovery contract

Restore the photo hero, headline, supporting copy, and editorial composition preserved in
`237e3a89` / `d5f67ce1`, on current main. Retain newer catalog data, search/filter behavior,
card geometry, freshness, private-action boundaries, navigation, and theme accessibility.

The preserved dark palette already exists in the baseline. The older reversed card colors
and variable card ratios are deliberately not restored. The hero is full width; results retain
the current 1100px cap so long-card actions still fit the verified viewport contract.

The contextual eyebrow remains `Antique Trail`: the production build explicitly excludes the
older `A field guide to curious places` marker along with the review-only prototype. That
exclusion gate is preserved. This work does not expose the prototype or change public branding.

Active worktrees and open PRs were checked. The dirty primary checkout was inspected only;
no unknown files were copied. Recovery began in this clean, isolated worktree.

## Acceptance and evidence

| Criterion | Evidence | Result |
| --- | --- | --- |
| Restored photo and copy use the supplied catalog client | `liveEditorial.test.tsx`; original test failed before restoration | Pass in final full unit run |
| Hero occupies the restored large first-screen composition | Final focused browser run: desktop/mobile, light/dark | Pass |
| Search, expanded filters, contrast, and keyboard controls survive | `issue-410-browse-controls.spec.ts`, desktop/mobile, both themes | Pass |
| Existing consistent rows and usable card actions survive | `issue-416-card-density.spec.ts`, both browser projects | Pass; long-card Save bottom 797.92px in 800px desktop viewport |
| Tablet expanded filters form one column | Manual browser at 768px: panel below trigger, 687px panel, no overflow | Pass |
| Narrow layout has no horizontal overflow | Manual 320px light/dark plus catalog reflow checks | Pass |
| Empty/error/image-failure states and theme accessibility survive | Earlier broad catalog/theme run: 82 tests passed; only new geometry assertion failed from subpixel rounding | Supplemental; final focused recovery checks supersede geometry failure |
| Repository type/lint/format/unit/release/build/media checks | Type/lint in `recovery-check-final.log`; remaining stages in `recovery-verification-final.log` | Pass: 164 unit files passed, 1 skipped; 1087 tests passed, 1 skipped; 164 release tests passed; build and media checks passed |

The first final browser run had one cold-transform heading timeout; the warmed isolated
rerun passed both projects (`recovery-warm-browser.log`). No timeout was enlarged. A full
unit run under simultaneous browser load was stopped after unrelated timeout failures;
the final run caps Vitest at two workers and follows browser completion.

Final focused browser run passed 13 cases and had that one cold-transform timeout;
the isolated warm rerun passed both projects, covering all 14 targeted cases. A separate
capture on the existing local review server passed the complete hero scenario, including
desktop/mobile and light/dark, and saved the desktop and mobile previews.

The complete local gate is equivalent to `npm run check`, with its unit stage explicitly
run as `npm run test -- --maxWorkers=2`. Node was `v24.11.1`, npm `11.13.0`, with a locked
`npm ci` installation. Lint reported 16 existing warnings and zero errors. One unchanged
unit file/test is skipped; no new skip was introduced. Seed-media verification returned
`errors: []`. Browser proof uses deterministic review fixtures, not hosted catalog or
account-lifecycle acceptance. No changes to verification timeouts or dependencies.

## Independent review

- Standards reviewer: `/root/standards_review`; final source candidate passes with no actionable findings.
- Spec reviewer: `/root/spec_review`; final source candidate passes with no blocking scope findings.
- Local recovery verdict: `WOWED`; publication/CI remain separate, unexecuted release gates.
- Repaired findings: expanded tablet filter layout and contextual eyebrow color.
- Rendered photo-text contrast strengthened on narrow screens; no animation added.

## Unverified and invalidation

- Database/provider lifecycle: not exercised; no database, account, or provider behavior changed.
- Hosted and canonical production: recovered candidate not published; local fixtures are not hosted proof.
- Hosted CI: not run; source branch is local and has not been pushed or merged.
- Evidence applies to the source candidate and named local fixture environment. Re-run affected
  proof after source, configuration, fixture, or integration changes.
