# Evidence — issue 377

## Candidate

- Issue/spec: GitHub issue #377 — trusted correction IP rate context
- Owner/chat: Codex issue-377 isolated worktree
- Risk: high
- Baseline SHA: `a1a32faef7783e59a9697843f457276db178afc5`
- Candidate source/test SHA: `0df95e5d5e555d989930722d9d771e5f03ca922b`
- Diff fingerprint: `2e1718e10f682d57114105031a3b082201ea03cc`
- Worktree/branch: `C:\Users\samar\.codex\worktrees\55cc\AntiqueTrail`; `codex/issue-377-ip-rate-context`
- Evidence captured at: `2026-09-29T16:17:08-05:00`

## Scope

Changed outcome: Shopper correction submissions now cross a trusted Edge boundary. Edge verifies the bearer token, derives actor and session from that token, derives a coarse runtime-address HMAC, and calls a service-role-only database gateway. Browser roles cannot execute the low-level correction RPC or privileged gateway.

Excluded scope: Hosted deployment, provider configuration, secret rotation, production acceptance, and changes to the canonical correction limits or eligibility rules.

Overlapping branches/worktrees checked: Existing clean `codex/issue-377-ip-rate-context-repair` worktree points at the first implementation commit and was not modified. Current branch owns the review fixes and publication candidate.

Pre-existing failures or unrelated work: `npm audit --audit-level=high` passes its configured threshold while reporting four existing moderate dependency advisories. Full check retains 14 existing lint warnings and one known jsdom navigation diagnostic.

## Acceptance

| Criterion | Observable pass condition | Verification method | Result/evidence |
| --------- | ------------------------- | ------------------- | --------------- |
| Browser cannot choose low-level IP rate key | Browser roles lack execute on core and gateway RPCs | pgTAP assertions and privilege review | Covered in `0127_issue_377_correction_gateway.sql`; local DB execution unavailable |
| Edge owns actor, session, and network context | Forged body fields and forwarding headers do not affect submitted authority values | Vitest handler tests | 8 focused gateway tests passed |
| Provider and session controls remain enforced | Invalid, mismatched, unregistered, unentitled, and revoked sessions fail | Vitest plus pgTAP contract | Vitest passed; pgTAP execution deferred to CI |
| Existing correction rules remain intact | Active Shopper succeeds; ownership, store eligibility, and 5/20/2 limits persist | pgTAP behavioral assertions and source review | Exact-head independent spec review passed; pgTAP execution deferred to CI |
| Claim context does not leak | Exact prior claims restored after success and denial | pgTAP sentinel assertions | Static review passed; execution deferred to CI |

## Verification

| Layer | Command or flow | Result | Applies to SHA/environment |
| ----- | --------------- | ------ | -------------------------- |
| Focused tests | `npx vitest run src/features/shopper/correctionGateway.test.ts src/features/shopper/shopperApi.test.ts --reporter=dot` | 13/13 passed | Candidate code; local Windows Node environment |
| Type/lint/format/build | `npm run check` | Passed: 1004 tests passed, 1 skipped; 155 release checks; build and seed-media verification passed | Runtime implementation commit `2d0e03fa`; later delta changes pgTAP only |
| Security contract | `npm run security:contract` | Passed | Candidate source/test tree |
| Dependency audit | `npm run security:audit` | High-severity threshold passed; four existing moderate advisories reported | Runtime implementation commit `2d0e03fa` |
| Database/RLS/RPC | `supabase db reset` / pgTAP | Unavailable: Docker Desktop Linux engine absent | Must pass in CI before merge |
| Edge type check | `deno check` | Unavailable: Deno absent | Must pass in CI before merge |
| Desktop/mobile UI | Not applicable | No visible UI change | Candidate |
| Accessibility/error states | Handler negative tests | Invalid authority and gateway failures return bounded 401/429/503 responses | Candidate code |
| Hosted/provider lifecycle | Not run | No hosted mutation authorized or performed | Unverified |
| Canonical production route | Not run | No deployment authorized or performed | Unverified |

## Security and negative proof

- Denied identities/scopes: anonymous, authenticated direct RPC, missing actor/session, mismatched actor/session, unregistered session, active but unentitled account, revoked session, and internal/public-test routes.
- Failure and timeout behavior: rate-limit errors map to HTTP 429 with bounded `Retry-After`; authorization failures map to 401; unavailable transport/provider failures map to 503.
- Secret/PII handling: Raw addresses are neither persisted nor logged. Edge sends only a domain-separated HMAC of coarse IPv4 `/24` or IPv6 `/64` context. HMAC and service-role secrets remain server-side.
- Security review: Completed scan `312a6cf0-f4ab-4cc3-88e2-3abb5652498f` found zero reportable issues with complete four-surface coverage at runtime commit `2d0e03fab826adc372442138d2b3dfc59715d5e6`. Candidate delta after that scan strengthens pgTAP only and received independent standards/spec review.

## Independent review

- Reviewer: Separate Standards and Spec agents
- Standards verdict: PASS after behavioral limit and exact claim-restoration proof replaced weak source-text assertions
- Spec verdict: PASS after explicit unregistered-session denial coverage was added
- Final verdict: `WOWED`
- Findings and disposition: Three P2 test-proof gaps fixed in `0df95e5d5e555d989930722d9d771e5f03ca922b`; no remaining actionable findings. Advisory-lock concurrency remains source-reviewed, not stress-tested locally.

## Unverified

- Local migration and pgTAP execution: Docker Desktop Linux engine unavailable. CI must prove migration ordering, grants, RLS, gateway behavior, all three limits, and claim restoration before merge.
- Direct Deno type check: Deno unavailable. CI must prove Edge type compatibility.
- Hosted Edge semantics: `connection.remoteAddr.hostname`, provider `getUser`, Edge secret placement, and deployed database grants were not exercised.
- Production: no deployment or canonical rendered-route proof requested or performed.

## Invalidation

Evidence applies only to candidate and environments named above. Re-run affected checks and review after any relevant candidate or integration change.
