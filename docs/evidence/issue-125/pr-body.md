## Ticket

Closes #125

## Reason addressed

The Store Portal media-history RPC previously returned storage identifiers and media metadata beyond the six fields the Portal needs. This change makes the server projection, strict client decoder, types, fixtures, and regression tests agree on the minimal response. It also makes the redefined security-definer RPC use the full, exact-one Portal authorization guard rather than a weaker direct grant lookup.

## Plan requirements

- `SECURITY_AND_TRUST.md` — `Data classification`
- `SECURITY_AND_TRUST.md` — `Privacy by default`
- `SECURITY_AND_TRUST.md` — `Authorization`
- `SECURITY_AND_TRUST.md` — `Upload security`
- `SECURITY_AND_TRUST.md` — `API security`
- `PACKAGE_CONTRACTS.md` — `Package 13 — Photo-tier memberships, moderation, and staged-off billing`
- `PRODUCT_DECISIONS.md` — `Photo moderation criteria (#92)`

## Plan conformance

Conforming work; no plan change.

## Acceptance evidence

- The forward-only migration projects exactly `uploadId`, `kind`, `state`, `altText`, `submittedAt`, and `rejectionReason`; it returns no object key, bucket, URL, signing material, dimensions, or secret identifier.
- `PortalMediaUpload` and `decodePortalMediaUploadHistory` require exactly that shape; tests reject reintroduced storage or dimension fields.
- pgTAP exercises active session/MFA/recent-auth, exact-one scope, own-store results, anonymous/no-grant denial, and a separately authorized other-store representative's isolated response.
- [Verification receipt](docs/evidence/issue-125/verification.md) and [independent review](docs/evidence/issue-125/independent-review.md) record the local evidence and review outcome.

## Verification

- `npm test -- --run src/features/portal` — pass (2 files / 20 tests)
- `npx supabase@2.115.0 test db supabase/tests/0076_portal_media_history.sql` — pass (1 file / 26 assertions)
- CI-equivalent pgTAP runner — repaired Package 6B plus target contracts pass (2 files / 81 assertions)
- `npm run security:contract` — pass
- `node --test scripts/plan-governance-contract.test.mjs` — pass (7 tests)
- `npm run check` — previously passed for the unchanged TypeScript candidate; hosted web and database checks are still required for this final head.
- `git diff --check` — pass

## Plan change authorization

Not a plan change.
