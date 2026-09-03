# Issue #168 gate

- Ticket: https://github.com/samarquis/AntiqueTrail/issues/168
- Base: `56584b6229445424240c07adab1b817867e59868`
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
- [ ] Separate-agent exact-diff review has no open P0/P1 findings.
- [ ] Hosted `web`, `database`, and `plan-governance` checks pass at the final pushed SHA.
- [ ] Post-merge checks and criterion-level closure evidence pass.

## Coordination

Migration `20260903030000` is reserved for this ticket. Local Supabase reset/test waits for the coordinator's database lane. No protected plan source is modified.
