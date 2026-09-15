# Preserved beta compatibility bridge (#374)

This runbook implements [ADR0010's publication and migration contract](../adr/0010-free-public-test-publication.md#publication-and-migration-contract). It is not a hosted migration, account or publication receipt.

## Observed history and current behavior

The read-only inspection of `uaupykgpegbseboklubv` compared source at `e1cd892626548d8f7409865bd7ccfd0335ca0633` with all 87 remote migration records. The same numeric version is not evidence that the same SQL ran. Preserve the fetched raw history, exact-byte SHA256 pairs and current function/ACL inventory in private recovery custody.

| Historical version | Missing or different current behavior | Forward treatment |
|---|---|---|
| 20260818800000 | Remote navigator function is owned by `identity_service`; the historical source now leaves ownership with its migration role | Preserve the existing owner and replace the corrected body under that owner |
| 20260821000000 | `review_automation` lacks `extensions` USAGE | Restore only that expected schema privilege |
| 20260821400000 | Consent guard evaluates listing-only record fields on other trigger tables | Restore the existing table-specific branching; retain trigger/function identities and owner |
| 20260821700000 | Three nullable media rejection columns are absent | Add them without replacing upload rows; later 20260826100000 already tolerates their presence |
| 20260822300000 | `release_executor` lacks `app_public` USAGE | Restore only that expected schema privilege |
| 20260822900000 | Remote history is a compatibility comment; the old four-argument correction RPC remains and the rate table is absent | Create the current rate contract and retire the obsolete overload without deleting correction reports |
| 20260823150000 | Remote history drops a diagnostic function; source at this version corrects navigator parameter ambiguity | Keep the actual history; supply the missing navigator body in the new bridge |
| 20260914000000 | Remote-only forward data fix aligning the ten synthetic stores' `store_media` cover `asset_path` with the reviewed webp covers in `seed.sql` (applied to the beta on 2026-09-14, absent from every prior repo commit) | Adopted verbatim as `supabase/migrations/20260914000000_public_test_align_media_asset_paths.sql` so local history equals remote; idempotent data-only alignment, harmless on fresh installs |

Remote-only `20260823140000` created the diagnostic which the next remote migration removed. It is absent in the current backend. Never replay it, reconstruct a fabricated marker, rename its history or claim the source's colliding navigator migration ran. The other three shared-content differences are comment punctuation/statement serialization; preserve those originals too. `20260914000000` is recorded here in the custody log as the live remote-only divergence observed during the public test backend reconciliation; keep its exact-byte SQL from `supabase_migrations.schema_migrations` in the same private recovery custody as the rest of the fetched history.

## Required ordering

1. Pin the final reviewed source and selected backend. Capture exact history/content, current function owners/definitions, effective role memberships and privileges, preserved row/object counts and provider configuration. Compare with the reviewed inventory. A new version, different body, unexpected owner, partial correction table or unreviewed side effect blocks this operation; do not extend the allowlist while applying it.
2. Complete the encrypted export and isolated recovery acceptance in ADR0010. A default Supabase CLI dump omits provider-maintained migration tables; keep a consistent full logical archive as well as roles and provider configuration. Storage object bytes require their own inventory; zero objects must be observed, not assumed. Do not overwrite existing backups.
3. In a fresh isolated PostgreSQL cluster, restore the exact historical snapshot and original application role graph. Reproduce provider-managed database/schema ownership from the archive rather than granting broad privileges to make the test pass. Separate databases share cluster roles, so they do not isolate repeated `CREATE ROLE` migrations. Record effective-privilege comparisons and provider-specific limits.
4. Apply **20260912230000_issue_374_preserved_beta_contract_bridge.sql first**, in one transaction. This special ordering repairs dependencies needed by older-numbered pending migrations. It does not change any existing history row. When applying to the real backend, atomically record only this newly executed version/name and its exact SQL; preserve the old collision separately. On canonical fresh installs, normal ordered replay reaches this bridge last and leaves the existing contracts intact.
5. Apply each actually pending source migration in reviewed order, transactionally recording its exact executed SQL only after successful execution. Compare version **and content**; never use `migration repair --status applied`, a rewritten historical migration, or an unreviewed `db push --include-all` to hide the discrepancy. Reconcile response loss against the transaction/history before retrying. Rerun the allow/deny and preservation checks at the final source SHA. Provider writes still require the separately accepted recovery/activation receipt.

## Verification

`supabase/tests/0126_issue_374_preserved_beta_contract.sql` checks the expected grants/columns, rate-boundary availability and direct denials, diagnostic absence, and actual consent-trigger behavior across different record shapes. A historical restore rehearsal must additionally compare complete existing Auth/store rows, historical migration rows and both corrected function owners before/after the bridge, then apply the entire pending sequence. Keep row values, Auth tokens/password hashes, archive keys and provider secrets out of repository evidence.

Canonical clean replay and the historical restoration are different evidence. Hosted Auth/session/email behavior, a working public catalog and browser acceptance remain separate requirements; passing this bridge test cannot supply them. The eventual publication must use the coordinating task's final source-ready SHA, including independently accepted fixes after this preflight baseline.
