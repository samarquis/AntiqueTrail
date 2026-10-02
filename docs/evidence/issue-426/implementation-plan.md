# #426 implementation admission

Owner: chat 01a0fa12-0375-7cc1-a88f-ad30456f817a; isolated checkout 8f76; branch codex/issue-426-servicing-contract. Baseline c0bf4e12. Product contract approved in this chat and PR #464; parent remains open until implementation proof.

High-risk payment/authorization boundary. Approved seams: authenticated cancellation RPCs, durable fake-provider worker RPCs, Owner billing UI. These are the server/provider/UI seams from the approved proposal.

A: new cancellation migration, SQL tests using existing Owner approval fixtures. RPCs billing_get_owner_cancellation(), billing_record_owner_cancel_consent(p_snapshot text,p_idempotency_key uuid), billing_request_owner_cancellation(p_consent_id uuid,p_idempotency_key uuid). Store selection uses existing x-owner-store-id header and server Owner grant checks. Context returns store name, period-end, digest of the current subscription/tier/schedule/stage/terms snapshot and semantic state. Consent binds that snapshot for 15 minutes. Intent is unique per consent, replay is input-bound, and audit/obligation commit together.

B: private disabled-by-default fixture control; synthetic fake-provider mirror with no network path. billing_execute_owner_fake_cancellation(uuid) and billing_reconcile_owner_cancellation(uuid) are worker-only. Durable fake effect and intent reconciliation are separate transactions so response loss/restart is observable. Existing Representative/provider code stays intact. Test fake execution, retry, duplicate/concurrent changes, stale versions, schedule replacement and revocation after dispatch. A working harness is required before acceptance.

C: separate typed cancellation client/page integrated into Owner status, only when server-approved context is available. Confirmation previews exact store/end date and consequences; pending/reconciliation states never show success. Existing read-only status response remains unchanged.

Owned paths: new migration; supabase/tests/0132_store_owner_access.sql plus its cancellation include; src/features/billing/ownerCancellation.tsx and tests; ownerStatus.tsx; configuredComposition.ts; review-harness/billingServicing.ts; existing configured Owner acceptance test/runner for local browser integration. Reuse existing CSS tokens; no design change.

Commands: npm ci; focused Vitest; npm run check; run-owned local Supabase migration replay/pgTAP; configured Owner browser runner; relevant review Playwright. Fixture control remains disabled in ordinary migrations. No actual provider call, deployment, payment activation or public action.

Closure: exact-SHA independent Standards/Spec review and security review, CI, merged main verification and criterion-level issue receipt. Any source/fixture change invalidates affected proof.
