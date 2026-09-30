# Evidence — issue 422

## Candidate

- Issue: #422; authority: `docs/specs/store-owner-authority.md` / merged #429 and PR #454.
- Owner/chat: `01a0f3d7-265d-7c91-b68d-1de69253bb1d`; GitHub assignee `samarquis`.
- Risk: high (authorization and migrations).
- Baseline: `3da15f22c28e13b03a693a0a78d66a0dac4fc143`.
- Reviewed source candidate: `8ad639f44466bf49e5d7982d6c675765412ced4a`.
- Branch: `codex/issue-422-owner-access`; isolated managed worktree, primary dirty checkout preserved.
- Integration candidate: final PR #459 head. Documentation-only evidence commits preserve the source fingerprint below; merge requires all checks on that exact final head.
- Captured: 2026-09-30.

Source-only SHA-256: `cc6028f53cb4fe70ea0bc5210d7690eb059737464224a38c68f10ca82ffac9b9`.

Reproduce from the repository using Python; hash the raw bytes emitted by Git, without shell text conversion. Includes every changed tracked path except `docs/**`, including environment example, CI, browser, application, Edge, migrations and SQL tests. Replace the head with the final integration candidate to verify source equality.

```python
import hashlib, subprocess
raw = subprocess.check_output([
    'git', 'diff', '--binary',
    '3da15f22c28e13b03a693a0a78d66a0dac4fc143',
    '8ad639f44466bf49e5d7982d6c675765412ced4a',
    '--', '.', ':(exclude)docs/**',
])
print(hashlib.sha256(raw).hexdigest())
```

## Scope

Delivered: Site Admin approves one verified exact synthetic-store claim; private receipt, Owner grants and audited revocation; current store list/selection; existing Portal, promotion and media scope enforcement; Owner workspace entry with denial recovery. Grants remain independent across multiple stores. Every requested scope is server-validated.

Excluded: public/provider/production activation, external publication, payment/billing authority (#425), team invitations (#424), and Site Admin console access for Owners. `VITE_STORE_OWNER_INTERNAL_ENABLED` defaults false. An enabled browser flag cannot grant database authority.

Ownership checked before admission: no other #422 claim, branch/PR or attached worktree; unrelated PRs #394/#408 and primary checkout edits were preserved. No unrelated source changes included. Larger A/B/C parent executed sequentially after authority was resolved; shared endpoint authorization required transport and SQL seams rather than disconnected leaf workers.

## Acceptance

| Criterion                           | Observable pass condition                                                                                                                                 | Verification/evidence                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact approved Owner grant          | Verified claim/email/MFA and confirmed store produce one auditable Owner grant; replay does not duplicate                                                 | SQL `0132` positive approval/replay; negative missing evidence, email, MFA, wrong boundary, real store, stage and actor cases                  |
| No implicit sibling authority       | List contains separately approved stores only; direct forged selection/header denied                                                                      | SQL `0132` one/two-store lists, wrong-store selection and forged header; tab selection never changes another request's target                  |
| Existing tools honor selected store | Portal managed fields and promotion consent affect chosen store only; media actor/replay checks revalidate Owner grant                                    | SQL `0132`, composition transport and Portal media HTTP tests; Edge forwards scope only to user client                                         |
| Revocation effective next request   | One-store/all-store revocation removes that authority; selected revoked scope never falls back to Representative; denial is logged                        | SQL `0132` direct reads/mutations/media replay/withdrawal; CI verifies opaque exact-store denial in PostgreSQL logs after transaction rollback |
| Workspace entry and recovery        | Distinct Owner label and server stores; selection enters Portal; revoked session signs in; denied grant offers retry and no stale choices                 | Client/component tests; six desktop/mobile browser cases, zero retries                                                                         |
| Existing roles preserved            | Owner cannot self-escalate; Representative remains on its store; independent Administrator media authority and selected scope survive coexistence/refresh | SQL `0132`, Admin boundary and composition regression tests                                                                                    |

## Verification

| Layer                      | Command/flow                                                                                   | Result/environment                                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused unit/component     | Owner client/page, configured composition, Admin boundary and Portal media tests               | 43 tests passed across focused files; latest same-user Administrator/Owner refresh expectation failed before fix and passed in 20-test composition rerun                          |
| Auth/media affected seams  | Configured auth, session refresh, Portal media and Edge boundary focused run, `--maxWorkers=1` | 22 passed                                                                                                                                                                         |
| Static/unit/release/build  | CI `npm run check`; security contract and dependency audit                                     | Source-head full `npm run check`, security contract, dependency audit and browser CI passed; final exact-head CI required before merge                                            |
| Database/RLS/RPC           | CI clean Supabase start/reset and full pgTAP                                                   | 120 files / 3,546 tests PASS, including `0132`; denial-log verification PASS at [source run](https://github.com/samarquis/AntiqueTrail/actions/runs/36779932248/job/110107774995) |
| Desktop/mobile/errors      | `npx playwright test e2e/issue-422-owner-workspace.spec.ts --retries=0 --workers=1`            | Six passed; Owner success, grant denial and revoked-session sign-in; snapshots visually inspected                                                                                 |
| Accessibility              | Axe, no horizontal overflow, >=48px Open button on both browser projects                       | Zero Axe violations; responsive/touch assertions passed                                                                                                                           |
| Full browser matrix        | Exact-head CI browser job                                                                      | PASS at [source run](https://github.com/samarquis/AntiqueTrail/actions/runs/36779932248/job/110107774825); exact final integration-head run required before merge                 |
| Hosted/provider/production | No activation/deployment performed                                                             | Out of scope; live log retention and provider acceptance remain deployment gates                                                                                                  |

Cold parallel local browser runs stalled on account-access loading; serial zero-retry rerun passed six cases. Broad local `npm run check` encountered several unchanged component tests hit their 5-second timeouts on Windows; resource contention was suspected and was stopped; clean CI full checks are authoritative. No timeout/retry increase was introduced. Database setup failures found invalid synthetic invitation/audience fixtures and restricted function-owner/schema privileges; repaired before passing replay/pgTAP.

## Security and negative proof

- Unapproved, wrong-store, anonymous, expired/revoked session, aal1, unconfirmed-email and Owner-as-Administrator attempts fail closed.
- Client decoders reject empty/malformed/wrong-role/scope responses. Selection failure clears choices; unmounted/stale async results cannot navigate.
- Private approval ledger uses forced RLS and no browser/service-role grants; no evidence content, credentials or personal paths appear in this record.
- Denial logs contain opaque actor/requested-store IDs and fixed operation codes. PostgreSQL logs survive exception rollback; hosting collection/retention remains separately unverified.
- Independent security review found missing denial audit at initial head; fixed with structured server LOG and executed CI verification. Merge additionally requires a completed security scan on the exact integration head, with its receipt linked from PR #459; immutable prior scan IDs: `cac21943-454b-4773-b229-c1ae5b2c6ede`, `6b570858-5c31-4914-beb4-ad333114fccb`.

## Independent review

- Standards: `/root/standards`, PASS at source `8ad639f4`; reported promotion/media scope and Administrator role/refresh regressions repaired and tested.
- Spec: `/root/spec`, PASS at source `8ad639f4`; denial audit, approval-denial coverage and Administrator coexistence findings resolved.
- Security: `/root/security`, no new finding after affected-source review; exact integration-head scan receipt is required in PR #459 before merge.
- Source verdict: `WOWED`; all applicable source acceptance layers and independent code/spec review pass. Merge and closure additionally require final-head CI, completed security scan and exact-source-equivalent documentation review; PR #459 retains those immutable receipts.

## Unverified and invalidation

Local Docker Desktop could not start because its runtime socket was inaccessible; automatic approval review rejected deletion of that stale socket. Clean ephemeral CI supplied database proof. Reticle tooling was unavailable; Playwright supplied rendered browser and accessibility evidence. No local-Docker, hosted lifecycle, provider, deployment or canonical production acceptance claim.

Relevant source/configuration/fixture changes invalidate affected checks and review. Documentation-only integration commits must reproduce the source-only digest and pass required checks on final PR head. Verify merged main SHA/tree and live issue state independently; an issue-closing directive alone is insufficient.
