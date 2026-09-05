# Issue #168 gate

- Ticket: https://github.com/samarquis/AntiqueTrail/issues/168
- Base: `ca863eae06e3749e839940f0df847b7ccb89a314`
- Plan amendment dependency: PR #167 merged as `585497125d722d2568ac63a3113cda3091b8db50`
- Scope: isolated Package 10A owner-research artifact only; no public route, real store, authority, email, payment, or provider effect.

## Gates

- [x] Distinct `noindex` research artifact and unambiguous manifest.
- [x] Exact active cohort grant and artifact binding; generic denial for every invalid admission.
- [x] Run-scoped `audience=synthetic` state; cross-run access denied server-side.
- [x] Shared owner-intake transaction with separate research and normal wrappers.
- [x] Start, save, resume, submit, and status for fixed existing-claim and add-store scenarios.
- [x] Required Free-only content order and prohibited-copy contract.
- [x] No authority, canonical store, public projection, email, payment, or provider effect.
- [x] Normal production artifact excludes the research entry point, route, markers, and controls.
- [x] Deterministic teardown revokes grants, purges run state, and retains only minimized outcomes.
- [x] Focused unit/browser/pgTAP, security contract, repository check, and diff check pass.
- [x] Separate-agent exact-diff source review has no unresolved findings; see refreshed independent-review.md.
- [ ] Hosted `web`, `database`, and `plan-governance` checks pass at the final pushed SHA.
- [ ] Criterion-level closure receipt records the accepted head, hosted results, and merge.

## Coordination

Migration `20260903030000` is reserved for this ticket. Local Supabase reset/test waits for the coordinator's database lane. No protected plan source is modified.

The 2026-09-05 refresh adds forward migration `20260905021434`, tested in a rollback-only
local transaction without resetting the shared database. Current PR #208 governance
separates external #169 gates and does not require routine post-merge test repetition.
