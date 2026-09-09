# Antique Trail

## Start here

Read the [PRD product overview](PRD.md#purpose-people-and-product-promise), [connected shopper experience](PRD.md#the-connected-shopper-experience), and [next Free private evaluation](PRD.md#next-milestone-free-private-experience-evaluation) for the whole intended product and current priority. For task work, read [PLAN_GOVERNANCE.md](PLAN_GOVERNANCE.md), the [dated state index](PROJECT_STATE.md), and only the relevant capability and specialist headings.

## Source precedence

| Question | Current owner |
| --- | --- |
| Product purpose, behavior, capability outcomes, product-stage acceptance, deferred choices | [PRD.md](PRD.md) |
| Detailed journeys, action transitions, interruption/error recovery, interaction/copy intent | [DESIGN.md](DESIGN.md) |
| Exact visual tokens, responsive layout, reusable component/accessibility rules, routes and visual screen acceptance | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) |
| Exact privacy, authorization, retention, recovery, abuse and security controls | [SECURITY_AND_TRUST.md](SECURITY_AND_TRUST.md) |
| Schema, commands, jobs, concurrency, technical failure/verification/rollback contracts | [PACKAGE_CONTRACTS.md](PACKAGE_CONTRACTS.md), including Package 1 |
| Invited-owner interaction variant | [Owner onboarding](docs/specs/owner-onboarding.md), explicitly delegated by PRD/DESIGN |
| Exact acquisition, membership, commercial-consent and servicing mechanics | [Store membership](docs/specs/store-membership-spec.md), explicitly delegated by PRD/DESIGN |
| Architecture choices and constraints for a named boundary | Most recent applicable accepted [ADR](docs/adr/); supersession is limited to its stated boundary |
| Plan authority, amendments, ticket admission, review and closure | [PLAN_GOVERNANCE.md](PLAN_GOVERNANCE.md) |
| Document inventory and current/historical classification | [PLANNING_INDEX.md](PLANNING_INDEX.md); this table owns responsibilities |
| Implementation/environment facts and evidence links | [PROJECT_STATE.md](PROJECT_STATE.md), dated and scope-bound |
| Live issue/PR status | GitHub |

The PRD is the product entry point, not permission to override specialist controls. Each rule has one current owner; other files link to that rule instead of independently restating it. If owners conflict, stop the affected work and reconcile through PLAN_GOVERNANCE.md. New product intent requires an authorized amendment; a ticket, prototype, historical decision, dated receipt, or existing implementation cannot silently change it.

PRODUCT_DECISIONS.md preserves decision history and links to current rules; PLAN_CHANGELOG.md preserves authorization history. IMPLEMENTATION_PLAN.md is the old roadmap; PLAN_ACCEPTANCE.md is a linked map and historical review record; PRODUCT.md is a compatibility pointer. Operational runbooks own the concrete procedures delegated by security/architecture requirements; a signed receipt proves only its named action and scope. Research, older reviews, and the flow lab are evidence, not current requirements.

The file manifest.json inventories this documentation handoff; it is separate from the installable PWA manifest.

## Run the local Synthetic Store journey

```bash
npm ci
npm run check
npm run dev
```

Open `http://127.0.0.1:4173/stores`. With no environment file, the app uses the deterministic 12-store fictional catalog so the browser journey is reproducible without external services. To exercise the bounded Supabase RPC transport, copy `.env.example` to `.env.local`, set the local anonymous key, and run `npx supabase@2.115.0 start` followed by `npx supabase@2.115.0 db reset`. Boot and reset provision the stress-gateway PostgREST privileges through migration `20260824000000_post_boot_authenticator_privileges.sql`; for a drifted running volume, `npm run db:post-boot` reapplies them without a destructive reset. To serve the production catalog gateway function locally (`POST /functions/v1/public-catalog`), follow `docs/operations/RUNBOOK_LOCAL_FUNCTIONS_GATEWAY.md`. CLI 2.33.9 is broken: it pins a storage-api image tag whose Docker Hub dist is empty, so the storage schema never initializes and migration `20260819400000_account_lifecycle_export.sql` fails on `relation "storage.buckets" does not exist`. If you must stay on an older CLI, retag `supabase/storage-api:v1.11.2` over the empty tag before `start`.

Focused commands are `npm run typecheck`, `npm run lint`, `npm run format`, `npm run test`, `npm run test:e2e`, and `npm run build`. Browser tests install Chromium with `npx playwright install --with-deps chromium` when needed. Database tests require a Docker-compatible runtime and the Supabase CLI; they intentionally fail rather than silently skip when that runtime is unavailable.
