# Independent review history — Issue #168

Reviewer: `/root/collision_audit`

Review base: `56584b6229445424240c07adab1b817867e59868`

Scope: complete base-to-head review in two independent lanes: (1) correctness, security, privacy, authorization, data integrity, accessibility, maintainability, blast radius, and evidence quality; and (2) issue reason, plan, every acceptance criterion, dependencies, non-goals, and protection against silent plan changes.

## Review iterations

### Head `b88f285500d89cccc2c4daf0fd2becc07c8f2606` — changes required

1. **P1 — artifact binding:** the manifest copied an operator-provided `VITE_OWNER_RESEARCH_ARTIFACT_DIGEST`; it did not derive a digest from the generated artifact bytes.
2. **P1 — shared intake seam:** the common transaction rejected every non-Synthetic audience, while the public wrapper always invoked it as `public`; this did not implement the required shared Package 10B transaction.
3. **P1 — authorization:** the research RPC trusted JWT identity/grant state without requiring `app_private.current_session_is_active()`, so a revoked application session could retain access.
4. **P1 — teardown ordering:** the command destroyed the deployment before revoking grants and purging research state, leaving access/state live if the database step failed.
5. **P1 — browser security contract:** the isolated deployment omitted the controlling CSP, COOP, CORP, and `Vary` contract.
6. **P1 — copy contract:** the prohibited-copy list and absence-only assertion did not fail on all required paid, lead-form, fabricated-proof, ranking, ROI, urgency, or review-speed mutations.
7. **P2 — trust destinations:** relative support, security, privacy, terms, and status links were unavailable from the isolated deployment.

Focused evidence reviewed or rerun included eight focused Vitest assertions, the normal build, the isolated build with explicit synthetic inputs, artifact verification, the security contract, and diff hygiene. Passing local tests did not override the semantic findings.

### Head `2738e7523b70234dc2c41b9d0c2daf606c707cfd` — changes required

The shared audience-neutral state machine with separate adapters, active-session admission, purge-first idempotent teardown receipt, mutation-based copy guard, and absolute trust destinations resolved findings 2, 3, 4, 6, and 7. Post-build file hashing structurally resolved finding 1, but its evidence still lacked a reproducible exact-input/head binding.

Two blocking findings remained:

1. **P1 — browser security contract:** `vercel.owner-research.json` and its verifier encoded values that contradicted `SECURITY_AND_TRUST.md`: wildcard rather than exact Supabase hosts, no exact WSS host, missing required CSP directives, incorrect CORP and `Vary`, and a different Permissions Policy.
2. **P1 — evidence binding:** acceptance evidence did not identify the reviewed replacement implementation and its recorded artifact digest did not reproduce from disclosed inputs.

Focused reruns passed pgTAP 48/48, Node artifact tests 3/3, Vitest 9/9, the normal build, the isolated build/verifier, and diff hygiene.

### Head `172e62b42c5cd2e1dc14c69938ca938df1a750f0` — approved

The deployment configuration now matches the controlling HTTP/browser contract with exact HTTPS, WSS, and storage hosts; complete CSP directives; `Cross-Origin-Resource-Policy: same-site`; `Vary: Authorization, Origin`; and the required Permissions Policy. The verifier requires those exact values and mutation tests fail closed for the repaired header classes.

Using the disclosed inputs below, a fresh build reproduced and the verifier independently recomputed `sha256:e359ad7e292d36d7909d061abbbd8aae0d78b5d1179a8a5d24e3bb4f22bb47d5`:

- `VITE_SUPABASE_URL=https://uaupykgpegbseboklubv.supabase.co`
- `VITE_SUPABASE_ANON_KEY=synthetic-local-anon-key`
- `VITE_OWNER_RESEARCH_COHORT_KEY=topeka-owner-10a`
- `VITE_CANONICAL_SITE_URL=https://antique-trail-pages.pages.dev`

Final reviewer reruns passed Node artifact tests 3/3, focused Vitest 9/9, the isolated build and verifier, the security contract, and base-to-head diff hygiene. The unchanged database implementation had passed focused pgTAP 48/48 at `2738e752`; a final rerun was unavailable because the shared local database had been reset to Issue #175's schema, which is an environment limitation rather than a code failure.

## Verdict and remaining limitations

**APPROVED:** the full diff from `56584b6229445424240c07adab1b817867e59868` through `172e62b42c5cd2e1dc14c69938ca938df1a750f0` has no open P0/P1 finding in either review lane.

This source approval is not closure evidence for the unavailable external steps. Hosted `web`, `database`, and `plan-governance` checks, an authorized Deployment-Protection deployment and teardown receipt, literal real-browser 200% evidence, merge, and post-merge verification remain required. This review file necessarily follows the reviewed implementation commit; the PR and issue review receipt must bind this documentation commit and the final pushed head without pretending that a commit can contain its own SHA.
