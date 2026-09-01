# Gates: Issue #174 repair — retire billing tier vocabulary from live source

Scope: In-scope repository repair required by the Codex retrospective production review on issue #174 (PR #186 merged, issue OPEN). Rename the billing configuration contract and all live references from Featured/Unlimited to Gallery/Full Gallery, add regression coverage that no retired vocabulary remains in live source, provision/document the renamed configuration, and re-pass targeted pgTAP plus hosted checks.

Base SHA: e6827a4d6e40f619005aff2e4eecc653f2038f54 (origin/main)

- [x] R1: Live-source inventory proves the only retired-tier occurrences are the documented exceptions (immutable migrations, 0077 compatibility boundary, StorePhotosPage layout Set) and zero live billing occurrences
  CHECK: repo-wide search for `featured`/`unlimited` in `.ts`/`.tsx` under `src/`, `supabase/functions/`, `e2e/` plus a full-tree sweep for `STRIPE_PRICE_`
  EXPECT: matches only the three documented exceptions
  EVIDENCE: `featured|unlimited` caseless in every `.ts`/`.tsx` in the working tree returns exactly the 3 StorePhotosPage layout-Set lines (73/76/80); full-tree `STRIPE_PRICE|priceFeatured|priceUnlimited` before the edit returned only the 3 billing files (billing-provider.ts:5-6,15-16, checkout:91-92, webhook:33-34) plus the gates file's own text. No docs, workflows, config.toml, or .env file references the old price env names.

- [x] R2: Configuration contract renamed in the single server authority `billing-provider.ts` to `priceGallery`/`priceFullGallery` backed by `STRIPE_PRICE_GALLERY`/`STRIPE_PRICE_FULL_GALLERY`, and both caller seams (`store-billing-checkout`, `store-billing-webhook`) consume only the renamed fields
  CHECK: `git grep -n "priceFeatured\|priceUnlimited\|STRIPE_PRICE_FEATURED\|STRIPE_PRICE_UNLIMITED"` over the working tree
  EXPECT: zero hits in live `.ts` files; renamed fields appear in all three files
  EVIDENCE: working-tree sweep of the four legacy names returns zero matches anywhere; `priceGallery`/`priceFullGallery`/`STRIPE_PRICE_GALLERY`/`STRIPE_PRICE_FULL_GALLERY` present in billing-provider.ts interface + loader (lines 5-6, 15-16), checkout caller (91-92), and webhook `tierForPrice` (33-34). Both return values remain canonical `'gallery'`/`'full_gallery'`.

- [x] R3: Retired-vocabulary regression check added to `scripts/security-contract.mjs` scanning live seams, with `security-contract.test.mjs` cases proving it flags legacy names and allows the documented exceptions
  CHECK: `node --test scripts/security-contract.test.mjs` then `npm run security:contract`
  EXPECT: pass; the new check is part of `security:contract` -> `test:release` -> `check`
  EVIDENCE: `findRetiredTierVocabularyFindings` scans `src/`, `supabase/functions/`, `e2e/`, excludes StorePhotosPage + non-live files, flags any `featured|unlimited` occurrence. 8/8 `node --test` pass (4 new cases: flags price/STRIPE names; allows documented exceptions; accepts canonical names; live-tree regression fixture asserts `runSecurityContract()` returns zero findings). `npm run security:contract` passes on the renamed tree, so `test:release` -> `check` and CI step `ci.yml` both enforce the guard.

- [x] R4: Renamed configuration documented and left unset (`.env.example` billing section lists `STRIPE_PRICE_GALLERY`/`STRIPE_PRICE_FULL_GALLERY` as unset placeholders; no legacy price var names anywhere)
  CHECK: read `.env.example`; full-tree search for legacy price names in any file type
  EXPECT: documented rename contract, nothing set, no legacy names
  EVIDENCE: `.env.example` gained a Stripe billing section documenting `STRIPE_PRICE_GALLERY`/`STRIPE_PRICE_FULL_GALLERY` as the deployment configuration contract with values empty, `BILLING_PROVIDER_GATE_ACCEPTED=false`, and an explicit note that Featured/Unlimited names must not be reintroduced and nothing is authorized until the commercial-research gate. Legacy price names appear nowhere in the tree.

- [x] R5: Targeted pgTAP tier-boundary contract still passes on the clean local stack
  CHECK: `npx supabase test db supabase/tests/0077_package_13_tier_boundaries.sql`
  EXPECT: pass (this repair touches no migration, so the #174 DB contract must be unchanged)
  EVIDENCE: `Files=1, Tests=29 ... Result: PASS` after "Connecting to local database..." on the running local stack; no migration touched, so the stored-state/resolver contract is byte-identical.

- [x] R6: Repository floor green
  CHECK: `npm run check`; `npm run security:contract`; `git diff --check`
  EXPECT: pass
  EVIDENCE: `npm run check` passes end to end (typecheck runs, eslint clean, prettier clean after reformat, full vitest suite, `test:release` 68/68, production vite build + PWA synthesize); `npm run security:contract` passes including the new tier-vocabulary check; `git diff --check` exit 0.

- [x] R7: Independent review by a separate agent (fresh context) covering standards and specification lanes, recorded at `docs/evidence/issue-174/independent-review.md` with reviewed base/head SHAs and no open findings
  CHECK: reviewer receipt file with explicit no-open-findings statement
  EXPECT: no open findings
  EVIDENCE: fresh-context subagent (general, no shared implementer thread) reviewed diff `e6827a4..1e15bf9` plus follow-up fix commit (see receipt for final head). Lane A PASS with 1 Minor + 2 Nits; Lane B PASS; FINAL VERDICT: APPROVE. Independent runs: tier-vocabulary scan of live `.ts`/`.tsx` finds only StorePhotosPage:73/76/80; `git grep` for the four legacy names -> zero live hits; `node --test scripts/security-contract.test.mjs`; `node scripts/security-contract.mjs` exit 0; pgTAP 0077 29/29 PASS; `git diff --check` exit 0; no plan-authority or plan-text edits. Minor finding (overstated wiring of the scan) fixed here by correcting docs AND adding the live-tree regression fixture, then re-passing tests at 8/8; the two hardening nits are accepted and documented (whole-file StorePhotosPage exception per G1/G8; substring regex is deliberate defense-in-depth). Receipt: docs/evidence/issue-174/independent-review.md.

- [x] R8: Draft PR whose final diff includes `OPEN_TICKET_TODO.md` row 03 -> `[x] COMPLETE IN PR #<new>`, and hosted `database`, `web`, `plan-governance` checks green on the exact head SHA
  CHECK: `gh pr checks`
  EXPECT: all required checks green on the reviewed head
  EVIDENCE: PR #193 (draft -> ready). Final head `79eb65008bbb972d0edcb2ef7b0723844752912f` includes row 03 -> `[x] COMPLETE IN PR #193` (required PR-body schema first failed plan-governance; body rewritten with the 7 required sections -> re-pass). Checks on head: database PASS (4m6s), web PASS (7m41s, includes npm run check + security contract + e2e), plan-governance PASS (9s). Supabase Preview skipped (no schema change) as expected for a config-contract-only change.

- [x] R9: Merge through the PR, post-merge verification rerun, and issue #174 closed with criterion-level evidence (PR URL, SHAs, check results, reviewer receipt, limitations)
  CHECK: `gh issue view 174 --json state`; TODO row on the default branch
  EXPECT: issue CLOSED and row 03 `[x]` on `main`
  EVIDENCE: PR #193 squash-merged 2026-09-01T21:58:18Z as merge commit `bc606d9a52fd57d61669b5b78bf06eb3385a279d` on `main` (default). Post-merge rerun on merged main: `node --test scripts/security-contract.test.mjs` 8/8 pass; `node scripts/security-contract.mjs` exit 0; `git grep -c` for `priceFeatured|priceUnlimited|STRIPE_PRICE_FEATURED|STRIPE_PRICE_UNLIMITED` over `*.ts` -> zero matches; live `.ts`/`.tsx` scan for `featured|unlimited` -> only StorePhotosPage:73/76/80 documented exception; `OPEN_TICKET_TODO.md` row 03 on main reads `[x] COMPLETE IN PR #193`. Issue #174 closed with evidence comment (criterion mapping, SHAs, check results, reviewer receipt, limitations).

## Ledger delivery note

The R8/R9 rows above became evidence-able only after PR #193 merged, so the completed ledger commit (`6606b85`) was carried to `main` through follow-up PR #194 to keep the acceptance record on the default branch. PR #193's required suite was green on its exact reviewed head (`database`, `web`, `plan-governance` all pass on `79eb650`); PR #194 is a doc-only delta over rows already proven, and re-passed `plan-governance` on head `6606b85` (run 33564908350).