# Independent review — issue #174 billing vocabulary repair

Date: 2026-09-01. Reviewer: fresh-context general subagent (task ses_fa115de16ffeEven3LFI0Tj9Fl), no shared thread with the implementer. Reviewed base SHA: `e6827a4d6e40f619005aff2e4eecc653f2038f54` (origin/main). Initially reviewed head: `1e15bf9`. Final reviewed head after disposition commits: recorded on the PR.

## Verdict

APPROVE. Lane B (specification) PASS with no findings; Lane A (standards) PASS with one Minor and two hardening Nits, none open. The reviewer ran the ticket/retrospective-required checks itself (list below) and could not verify only the post-review R7-R9 steps.

## Findings and dispositions

| Severity | Finding | Disposition |
|---|---|---|
| Minor | Docs (`repair-billing-vocabulary.md`, `gates/issue-174-repair.md` R3) claimed the tier-vocabulary scan was wired into `npm run check`/`test:release`; enforcement actually ran only via `security:contract` + CI step `ci.yml`. | Fixed both directions: corrected the docs AND added a live-tree regression fixture to `security-contract.test.mjs` asserting `runSecurityContract() === []`, making `test:release` -> `check` enforce the guard locally too. Tests re-passed 8/8. |
| Nit | Whole-file `StorePhotosPage.tsx` whitelist in the scan would silently allow true tier vocabulary if ever added to that file. | Accepted and documented: the exception is deliberate per G1/G8 (photo-tile layout `Set`, not tier vocabulary); any regression there is caught by the presentation review lanes. |
| Nit | Substring regex `featured|unlimited` (case-insensitive) false-positives on future benign prose in live seams. | Accepted: deliberate defense-in-depth with zero current false positives; documented in `security-contract.mjs` and addressed at review time if activated. |

## Reviewer's independently executed evidence

- `git diff e6827a4..1e15bf9` read in full: 8 files, +236/-9, repair scope only.
- Live-source `.ts`/`.tsx` scan for `featured|unlimited`: only `src/features/catalog/StorePhotosPage.tsx:73,76,80`.
- `git grep` for `priceFeatured|priceUnlimited|STRIPE_PRICE_FEATURED|STRIPE_PRICE_UNLIMITED`: zero live hits; only repair docs, gate file, test fixtures.
- All `BillingProviderEnv`/`loadBillingProviderEnv` callers verified (checkout, portal, webhook); no stale field names.
- `node --test scripts/security-contract.test.mjs` pass; `node scripts/security-contract.mjs` exit 0.
- `npx supabase test db supabase/tests/0077_package_13_tier_boundaries.sql`: 29/29, Result: PASS (no migration touched).
- `git diff --check` exit 0; working tree clean.
- No `update plan` / plan-text changes (plan governance respected).

## Notably excluded (not findings)

Immutable migration text (`20260824120000`, `20260825100000`) and the `.env.example` retirement comment contain the words featured/unlimited as documented compatibility-boundary history per issue #174.

## Residual verification owned by the driver

Full `npm run check` re-run (typecheck/eslint/vitest/build) after the disposition commit; R8 hosted `database`/`web`/`plan-governance` PR checks on the final head; R9 merge, post-merge rerun, and issue closure. All tracked in `gates/issue-174-repair.md`.