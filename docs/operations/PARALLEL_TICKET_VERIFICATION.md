# Parallel ticket verification

Run `npm run verify:baseline` on `main` before opening independent ticket worktrees. This proves the security contract, high-severity dependency audit, static checks, unit and release tests, and production build once; a failure belongs to the shared baseline instead of every ticket.

Use focused checks while implementing, then run `npm run verify:web` on each final candidate. The final gate adds the same core checks and browser suite used by hosted web CI, with two browser retries in both environments. It does not generate CI's SBOM or upload browser artifacts, so local results do not replace hosted evidence.

Code work and web verification may run in parallel in separate worktrees; each browser run uses two workers to avoid local resource contention. The default Supabase configuration targets the shared `supabase_db_antique-trail` container, so local database start, reset, migration, and pgTAP operations must run one at a time. Hosted database jobs remain isolated per GitHub runner.
