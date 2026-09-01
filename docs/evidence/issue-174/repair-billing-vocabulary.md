# Issue #174 repair — retire billing tier vocabulary from live source

Date: 2026-09-01. Base SHA: `e6827a4d6e40f619005aff2e4eecc653f2038f54` (origin/main). Candidate SHA: filled at commit time.

## Scope

In-scope repository repair required by the Codex retrospective production review (issue #174 comment 2026-08-31, quoted below in findings). PR #186 merged the database/tier migration but left active, non-compatibility billing code on the retired `featured|unlimited` vocabulary. This document records the repair; it does not re-run the original G1-G10 gates, which remain on record in `GATES` history and `gates/issue-174.md`.

## Findings addressed (verbatim from the retrospective review)

> Blocking P2: active, non-compatibility billing code still contains retired tier vocabulary: `priceFeatured`/`priceUnlimited` and `STRIPE_PRICE_FEATURED`/`STRIPE_PRICE_UNLIMITED` in `supabase/functions/_shared/billing-provider.ts`, `store-billing-checkout/index.ts`, and `store-billing-webhook/index.ts`. This contradicts the issue's acceptance criterion and G1/G8 evidence asserting zero live occurrences outside an explicitly tested compatibility boundary.
>
> Required repair: rename the configuration contract and all live references to Gallery/Full Gallery names, provision/document the new configuration safely, add regression coverage proving no retired vocabulary remains in live source, rerun targeted pgTAP plus the required hosted checks, and request a fresh independent exact-diff/database review.

## Before

Eight live occurrences across three files:

| File | Before |
|---|---|
| `supabase/functions/_shared/billing-provider.ts:5-6` | `priceFeatured?: string` / `priceUnlimited?: string` |
| `supabase/functions/_shared/billing-provider.ts:15-16` | `Deno.env.get('STRIPE_PRICE_FEATURED')` / `Deno.env.get('STRIPE_PRICE_UNLIMITED')` |
| `supabase/functions/store-billing-checkout/index.ts:91-92` | `? env.priceFeatured` / `: env.priceUnlimited` |
| `supabase/functions/store-billing-webhook/index.ts:33-34` | `env.priceFeatured` / `env.priceUnlimited` (map to `gallery`/`full_gallery`) |

Confirmed by a full-working-tree search for `STRIPE_PRICE|priceFeatured|priceUnlimited`: matches existed only in those three files and no other file type (docs, workflows, `.env.example`, `config.toml`) referenced the price env names.

## After

| File | After |
|---|---|
| `billing-provider.ts:5-6` | `priceGallery?: string` / `priceFullGallery?: string` |
| `billing-provider.ts:15-16` | `Deno.env.get('STRIPE_PRICE_GALLERY')` / `Deno.env.get('STRIPE_PRICE_FULL_GALLERY')` |
| `store-billing-checkout/index.ts:91-92` | `? env.priceGallery` / `: env.priceFullGallery` |
| `store-billing-webhook/index.ts:33-34` | `env.priceGallery` / `env.priceFullGallery` (same canonical returns) |

## Regression coverage

`scripts/security-contract.mjs` now exports `findRetiredTierVocabularyFindings(entries)`, wired into `runSecurityContract` (and therefore `npm run security:contract`, `npm run test:release`, and `npm run check`). It scans live source seams (`src/`, `supabase/functions/`, `e2e/`) and flags any `featured|unlimited` occurrence, case-insensitively, with two documented exceptions:

- `src/features/catalog/StorePhotosPage.tsx` — photo-tile layout `Set` named `featured` (documented G1 presentation exception, not tier vocabulary).
- Non-live paths (`supabase/migrations/` immutable text, `supabase/tests/` 0077 compatibility boundary, `docs/`, `gates/`, root files).

`scripts/security-contract.test.mjs` adds three cases: flags `priceFeatured` and `STRIPE_PRICE_UNLIMITED` in billing-provider/webhook fixtures and `'featured' | 'unlimited'` in a client type; allows StorePhotosPage, 0077 fixture SQL, migration conversion text, docs, and root files; accepts canonical `gallery`/`full_gallery` vocabulary unchanged. 7/7 tests pass; the rendered contract run passes.

## Configuration provisioning

`.env.example` now documents the billing deployment configuration contract with empty values:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
BILLING_PROVIDER_GATE_ACCEPTED=false
STRIPE_PRICE_GALLERY=
STRIPE_PRICE_FULL_GALLERY=
```

with an explicit note that Featured/Unlimited env names are retired, values remain unset, and no billing configuration is authorized before the named commercial-research gate. No legacy price names exist anywhere in the tree.

## Verification run against candidate

- `node --test scripts/security-contract.test.mjs` — 7/7 pass.
- `npm run security:contract` — pass, including tier-vocabulary scan.
- `npx supabase test db supabase/tests/0077_package_13_tier_boundaries.sql` — 29/29, Result: PASS (no migration touched, so the stored-state/resolver contract is unchanged).
- `npm run check` — pass end to end (typecheck, eslint, prettier, full vitest suite, test:release 68/68, production build + PWA synthesize).
- `git diff --check` — exit 0.

Full output lines are captured in the closure comment and `gates/issue-174-repair.md`.

## Acceptance criterion mapping (#174)

- "No legacy `featured|unlimited` value or user-facing label remains outside an explicitly tested migration-compatibility boundary": now enforced by an automated regression check; live occurrences = 0; remaining occurrences are immutable migrations, the tested 0077 boundary, and the documented StorePhotosPage layout Set.
- "A repository-wide inventory identifies every authoritative and presentation use": see Before table + the full-tree sweep.

## Limitations

- This repair changes only the edge-function configuration contract (TypeScript field names and env var names). It does not provision or activate any Stripe price, change any migration, alter server tier resolution, or affect shopper reads. Hosted `database`, `web`, and `plan-governance` evidence and a fresh independent review are recorded under the PR and `independent-review.md`.
- Legacy env names were never present outside these three files, so no other configuration surface required migration.