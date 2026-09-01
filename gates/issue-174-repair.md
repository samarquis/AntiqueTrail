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
  EVIDENCE: `findRetiredTierVocabularyFindings` scans `src/`, `supabase/functions/`, `e2e/`, excludes StorePhotosPage + non-live files, flags any `featured|unlimited` occurrence. 7/7 `node --test` pass (3 new cases: flags price/STRIPE names; allows documented exceptions; accepts canonical names). `npm run security:contract` passes on the renamed tree.

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

- [ ] R7: Independent review by a separate agent (fresh context) covering standards and specification lanes, recorded at `docs/evidence/issue-174/independent-review.md` with reviewed base/head SHAs and no open findings
  CHECK: reviewer receipt file with explicit no-open-findings statement
  EXPECT: no open findings
  EVIDENCE: pending

- [ ] R8: Draft PR whose final diff includes `OPEN_TICKET_TODO.md` row 03 -> `[x] COMPLETE IN PR #<new>`, and hosted `database`, `web`, `plan-governance` checks green on the exact head SHA
  CHECK: `gh pr checks`
  EXPECT: all required checks green on the reviewed head
  EVIDENCE: pending

- [ ] R9: Merge through the PR, post-merge verification rerun, and issue #174 closed with criterion-level evidence (PR URL, SHAs, check results, reviewer receipt, limitations)
  CHECK: `gh issue view 174 --json state`; TODO row on the default branch
  EXPECT: issue CLOSED and row 03 `[x]` on `main`
  EVIDENCE: pending