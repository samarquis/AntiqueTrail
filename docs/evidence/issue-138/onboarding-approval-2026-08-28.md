# Issue #138 onboarding approval evidence — 2026-08-28

## Scope and boundary

The Administrator review queue now receives a server-classified `onboarding` category and count for an assigned Pilot Store Draft. The review detail exposes only the proposed store fields plus status-only consent, authority, and identity readiness; it deliberately excludes consent receipts, authority evidence references, account identifiers, tokens, and the immutable preview hash.

The approval action still calls the existing atomic `partner_private.approve_pilot_onboarding_exact` path. Its authoritative result supplies the created Pilot Store Record label and the one store-scoped Store Representative grant; the UI does not create an approval state locally.

## Checks

- `npm test -- --run src/features/admin/components.test.tsx src/features/admin/adminClient.test.ts src/review-harness/clients.test.ts`: 3 files / 28 tests passed.
- `npm run typecheck`: passed.
- `npx playwright test e2e/ui09-admin-moderation.spec.ts --config=playwright.review.config.ts --grep "onboarding approval"`: 3 passed: desktop, tablet, and mobile. The assertion operates the category and case with the keyboard, verifies the allowlisted context and approval result, then checks 320 CSS-px reflow for horizontal overflow.
- Local pgTAP was not runnable on this host: `npx supabase@2.115.0 db reset --local` could not connect to the Docker Desktop Linux engine. The database contract is present in `supabase/tests/0060_package_7_operational_admin.sql` and remains a required hosted-CI gate before issue closure.

## Fixture boundary

The review-harness onboarding case is deterministic UI evidence only. It exercises the same typed client result shape but cannot replace the database contract’s atomicity, MFA/recent-auth, assignment, stale-version, replay, or self-approval enforcement.
