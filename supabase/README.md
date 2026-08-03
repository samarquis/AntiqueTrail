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

With Docker and the Supabase CLI installed:

```text
supabase start
supabase db reset
supabase test db
```

`db reset` is local/destructive and must never target a shared or production project. The current development environment does not include Docker or the Supabase CLI, so database reset and pgTAP execution remain a CI/environment verification step.
