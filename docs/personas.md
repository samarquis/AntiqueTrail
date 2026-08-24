# Antique Trail — Internal Alpha Personas

> **Reconstruction notice (2026-08-22).** This file was accidentally overwritten by a
> mis-targeted cleanup-script write and could not be recovered verbatim from any local
> store (git object store, OpenCode transcripts and snapshots, Codex rollouts, VS Code
> and editor histories were all searched exhaustively). It is rebuilt from surviving
> quoted fragments plus authoritative repo sources (`scripts/create-demo-users.mjs`,
> `CONTEXT.md`). Original prose beyond the quoted excerpts below is lost; section order
> follows the surviving line-number anchors (≈L55, ≈L158, ≈L234, ≈L286, ≈L296–301).

## Purpose

Define the six demo Test Accounts that exercise Internal Alpha journeys against Synthetic
Stores, and record acceptance-test outcomes run against them. Each account is an isolated
identity per the Test Account rule: no shared logins, no household access, synthetic
private data that never crosses accounts. All six are real Supabase auth users created by
`scripts/create-demo-users.mjs`; profiles and role grants are backfilled by
`scripts/backfill-demo-profiles.mjs`.

## Personas

### Scott — you, the administrator (Primary Internal Tester)

- `scott@antiquetrail.test` — `app_metadata.role=Administrator`; no MFA factor enrolled,
  which keeps the admin console reachable for testing.
- Operates the privileged workflows during the Solo Agent-Assisted Alpha: reviewing Store
  Change Requests in `/admin`, granting/revoking representative scopes, inspecting audits.
- Your wife is the Independent Internal Tester: she repeats shopper acceptance later on
  her own phone and Test Account before any external testing (Two-Person Acceptance).
  Her results never come from these demo accounts or from an AI Test Agent.

### Shopper personas (Synthetic Alpha Test Accounts)

Five Shopper accounts share one demo password (see `scripts/create-demo-users.mjs`,
`DEMO_PASSWORD`) and differ only in how they are used:

| Name | Email | Role | Notes |
|---|---|---|---|
| Amy | `amy@antiquetrail.test` | Shopper | general shopper exercise |
| Ann | `ann@antiquetrail.test` | Shopper | general shopper exercise |
| Nick | `nick@antiquetrail.test` | Shopper | general shopper exercise |
| Andrea | `andrea@antiquetrail.test` | Shopper | designated browser-journey verification account (user id `8cb823df-bb73-4a0c-bc86-700b5c4efee1`) |
| Buc | `buc@antiquetrail.test` | Shopper | general shopper exercise |

## Alpha workflow checklist

1. Point `.env.local` at the reachable Supabase instance.
2. `node scripts/create-demo-users.mjs` (idempotent; verifies password sign-in per account).
3. `node scripts/backfill-demo-profiles.mjs` (profiles + active role grants).
4. Confirm Scott reaches `/admin` and shoppers do not.
5. Exercise Browse → Details → Save → Trip flows as a shopper.
6. **Run the real test with alpha Test Accounts** (Scott's Primary + Independent Tester),
   recording dated outcomes in the log below.
7. Purge any Journey-prefixed test artifacts afterward
   (`scripts/cleanup-journey-artifacts.mjs`).

## Administrator capability (Scott)

What the administrator side currently proves in Internal Alpha:

- `/admin` renders the Review queue for controlled store-field change requests.
- Representative scope grant/revoke and audit inspection follow the Access & Safety rules;
  none of it exposes shopper-private data.
- The role comes from `app_metadata.role=Administrator` plus an active `administrator`
  row in `app_private.role_grants`; there is no self-service path to it.

Surviving excerpt from the original persona notes (truncated):

> **Simulated Scott opinion:** "The admin side is there for store changes and access, but I…

The remainder of the simulated-opinion notes did not survive the overwrite.

## Acceptance journey log

- **2026-08-22 — Andrea shopper journey: PASS** (`scripts/journey-e2e.mjs`, real Chromium
  against remote Supabase, dev server `127.0.0.1:4173`). Sign-in → `/trips/new` → trip
  created and plan page rendered (`/trips/09d12230-…/plan`) → catalog browse from trip →
  private visit memory saved on Clockwork Cabinet → fresh sign-in still lists the trip and
  shows the persisted note (session loss on every full page load is expected InMemoryAuthStore
  behavior, covered by re-auth in the harness). Rows confirmed in `trip_private.trips`
  (owner = Andrea) and `shopper_private.private_store_memories`.
- **2026-08-22 — Scott administrator journey: PASS** (`scripts/journey-e2e.mjs`). Sign-in →
  `/admin` Review queue visible.
- Journey-prefixed trip/note artifacts from these runs are purged after each pass; the log
  above plus harness output is the durable evidence.

## Demo account state (last verified 2026-08-22)

Created and sign-in-verified by `scripts/create-demo-users.mjs`:

- `amy@antiquetrail.test` — Shopper — created
- `ann@antiquetrail.test` — Shopper — created
- `nick@antiquetrail.test` — Shopper — created
- `andrea@antiquetrail.test` — Shopper — created
- `buc@antiquetrail.test` — Shopper — created
- `scott@antiquetrail.test` — Administrator (`app_metadata.role=Administrator`, no MFA
  factor enrolled) — created
