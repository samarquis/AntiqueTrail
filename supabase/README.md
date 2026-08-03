# Local catalog database

Package 1 is intentionally local and synthetic. The migration creates the `app_public` schema, seeds twelve fictional stores, and exposes only two anonymous read RPCs:

- `catalog_list(p_q, p_category, p_area)` — deterministic name/area/category search.
- `catalog_details(p_slug)` — one active Synthetic Store or an indistinguishable empty result.

The browser Supabase client must set its database schema to `app_public`. Direct table reads and all anonymous writes are denied by grants and `FORCE ROW LEVEL SECURITY`.

Package 2A identity state lives in the private `app_private` schema. `profiles`, `active_sessions`, `role_grants`, and the append-only `privileged_audit_events` chain are server-owned and are not exposed through PostgREST. The boolean session/role gates are the only client-callable boundary; account admission, recovery, and deletion remain Package 2B work.

Package 2B adds provider-neutral admission receipts, quarantine state, export/deletion jobs, deletion receipts, and notification/revocation outboxes in the same private schema. Only token hashes/HMACs and content-free lifecycle metadata are persisted; provider calls and delivery are separate gated jobs.

Package 3 shopper-private rows live in the non-API `shopper_private` schema. Saves, memories, last-seen, dismissals, and correction reports require the authenticated owner’s active application session; correction case events are service-only and append-only.

Package 4 candidate data lives in the non-API `candidate_private` schema. Candidate Links are owner-only, shares resolve to one recipient and expire after 30 days, encrypted share payloads are recipient-pending-only, and accepted shares can produce only a recipient-owned Trip Idea. Sender/recipient terminal reasons, abuse evidence, and share idempotency records stay service-scoped; no candidate row grants public writes or publishes a catalog record.

Package 5A trip state lives in the non-API `trip_private` schema. Trips and stops are owner/active-participant scoped; invitations store only token hashes, one partner and one active Navigator/device are bounded server-side, and offline/idempotency/conflict records contain hashes and metadata rather than bearer or location payloads.

Package 6A partner onboarding state lives in the non-API `partner_private` schema. Invitations contain only 32-byte token/email HMACs and expire after 30 minutes or one atomic consumption; immutable provisional/final consent receipts, pending identities, owner drafts, authority signals, claims/conflicts, revocations, and exact one-store Representative grants are service-owned and FORCE-RLS protected. Provider/email calls, raw credentials/evidence, public claims, and broad role scope are intentionally absent.

The Package 7 security-hardening migration keeps candidate share parties and candidate pointers immutable to authenticated clients, limits sender/recipient transitions to their allowed terminal actions, and splits pilot-draft writes between the bound partner and an assigned administrator. Approval/rejection requires the administrator role, active MFA, recent authentication, and reviewer evidence; partner draft content and reviewer fields cannot be rewritten by the other actor.

Package 7 administrator review state lives in the non-API `admin_private` schema. Typed cases carry only target metadata and snapshot hashes; field-change approvals, duplicate-merge previews/ledgers/tombstones, exact grant revoke/regrant prerequisites, append-only privileged actions, audit outbox, and root-anchor health are service-owned and FORCE-RLS protected. Review locks are bounded to 15 minutes, every future admin read/action rechecks assignment, exact scope, MFA, and recent authentication, and public promotion or shopper-private browsing is absent.

With Docker and the Supabase CLI installed:

```text
supabase start
supabase db reset
supabase test db
```

`db reset` is local/destructive and must never target a shared or production project. The current development environment does not include Docker or the Supabase CLI, so database reset and pgTAP execution remain a CI/environment verification step.
