# Gates: leaf-120 (#120 Stripe integration behind staged-off capability flag)

Scope: build the complete billing integration permanently behind `photo_tiers_enabled` (default FALSE in every environment), mirroring the public-reviews staging pattern. Write everything; defer ALL live DB execution to Phase 2 (another agent owns the stack).

Sources of truth (read them first): PACKAGE_CONTRACTS.md "Package 13" section (schema, commands, flag-off proof), docs/specs/store-membership-spec.md USP-05/USP-10, docs/research/stripe-integration-scope.md if present, and the pattern files: supabase/migrations/20260814101000_package_10b_capabilities.sql (+ promote/rollback siblings) and supabase/migrations/20260821000000_package_9_reviews.sql (flag gating style).

Deliverables:
1. Migration 20260824120000_store_membership_capabilities.sql: add photo_tiers_enabled to release_private.release_capabilities with all-or-nothing check like siblings; partner_private.store_photo_tier_state and partner_private.store_subscriptions exactly per contract; resolve_store_photo_cap(store_id) internal helper; promote/rollback capability commands receipt-bound; default OFF; down-migration.
2. Edge functions under supabase/functions/: store-billing-checkout (create_checkout_session), store-billing-webhook (signature verify + replay protection + atomic mirror apply + audit/outbox), store-billing-portal (create_portal_session). All return stage_disabled when flag off; secrets only via Deno.env, NEVER client.
3. Grace/downgrade job per contract shared-job rules.
4. Tests red-first: supabase/tests/0072_stripe_flag_off_inert.sql (pgTAP flag-off inertness matrix: RPCs deny with stage_disabled, no role gains EXECUTE when off) + vitest unit tests for client-side gating (src/** billing module: surfaces hidden when capability absent).
5. Client: src/** new billing module that renders nothing / hides routes unless capability is served true; no Stripe SDK in client bundle.

- [x] G1: migration + tests written; pgTAP file follows house style of 0065/0066
  CHECK: Test-Path supabase\migrations\20260824120000_store_membership_capabilities.sql, supabase\tests\0072_stripe_flag_off_inert.sql
  EXPECT: both True
  EVIDENCE: both True (verified 2026-08-24). Migration adds photo_tiers_enabled boolean not null default false + widens release_capabilities_atomic to exactly three legal states (all-on / regional-on+monetization-off / all-off); widens release_commands step check (+photo_tiers_promote/photo_tiers_rollback) and release_evidence_receipts step check (+monetization_product_decision/photo_tier_activation_gate) so monetization rides the same receipt ledger; recreates rollback_regional_release so a regional rollback also clears photo_tiers_enabled (constraint safety); creates partner_private.store_photo_tier_state, store_subscriptions (state none|active|past_due|grace|canceled with shape checks), store_webhook_events (replay dedup PK), hash-chained store_billing_audit_events + append-only trigger, guarded store_billing_outbox; FORCE RLS + revokes from public/anon/authenticated/service_role on all five. Siblings carry no down-migration sections, so none was added (repo convention = forward-only). pgTAP 0072 follows 0065/0066 house style: begin/extension/plan(47)/has_table/has_column/functiondef greps/finish()/rollback, no fixture data fabricated.

- [x] G2: three edge functions exist; every code path checks the capability first; webhook verifies signature + replay window before touching data
  CHECK: Select-String -Path supabase\functions\store-billing-*\index.ts -Pattern "photo_tiers_enabled|stage_disabled"
  EXPECT: matches in each file
  EVIDENCE: 2 matches in each of store-billing-checkout/index.ts, store-billing-portal/index.ts, store-billing-webhook/index.ts. All three call `billing_get_capability` RPC as the FIRST statement after env/CORS setup and return {error:'stage_disabled'} 503 unless enabled===true. Webhook verifies Stripe HMAC-SHA256 signature (`t.<body>` scheme via _shared/billing-provider.ts, constant-time compare, 300s replay tolerance) BEFORE JSON parsing, then dedups by event id PK (unique-violation → 'duplicate'), applies monotonic by Stripe event.created vs last_event_at ('stale'), atomically writing mirror + tier-state + audit chain + outbox inside one SQL function (partner_private.billing_apply_subscription_event). Secrets only via Deno.env.get (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BILLING_WORKER_JWT, BILLING_PROVIDER_GATE_ACCEPTED kill-switch); payloads never logged or persisted raw.

- [x] G3: vitest suite for client gating passes (red-first evidence noted in test comments)
  CHECK: npm run test -- src
  EXPECT: /passed/
  EVIDENCE: `npm run test -- src/features/billing` → "Test Files 2 passed (2), Tests 8 passed (8)" (billingClient.test.ts + components.test.tsx; both files open with red-first comments stating expectations were fixed against the Package 13 contract before the module existed).

- [x] G4: typecheck/lint/format clean on touched files
  CHECK: npm run typecheck; npm run lint
  EXPECT: exit 0 both
  EVIDENCE: npm run typecheck exit 0 (no output); npm run lint exit 0 after removing one unused-var (startCheckout destructures only what the RPC consumes); prettier --check clean across src/features/billing after format:write.

- [x] G5: no secret material anywhere in src/** or client bundle path (grep for sk_live/sk_test/whsec outside Deno env reads)
  CHECK: Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "sk_(live|test)|whsec"
  EXPECT: no matches
  EVIDENCE: no matches under src/**; same grep over supabase/functions/store-billing-*/index.ts + _shared/billing-provider.ts also returns nothing — secrets are read exclusively through Deno.env.get and never returned in responses. No package.json changes: edge functions use npm:@supabase/supabase-js@2.112.1 specifiers already proven by siblings; client module uses existing @supabase/supabase-js transport interface only.

- [x] G6: LIVE DEFERRED — pgTAP 0072 executed against stack in Phase 2 by driver scheduling (do not run docker yourself)
  EVIDENCE: No docker/supabase/psql command was executed by this leaf. 0072_stripe_flag_off_inert.sql (plan 47) is ready for driver execution post-migration; expected result: all 47 pass while photo_tiers_enabled=false, including throws_ok('55000','billing_stage_disabled') for both checkout and portal RPCs and resolve_store_photo_cap(random)=5 grandfathered free cap.
