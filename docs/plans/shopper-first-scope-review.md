# Shopper-first scope and backlog reconciliation

Date: 2026-10-06, America/Chicago. Approved by the Product Owner: “I approve this cleanup and scope.” Baseline: `d075998137c501c6ff7252880ad59500e59bec16`. Owner: this scope-cleanup chat; worktree `ba15/AntiqueTrail`, branch `codex/shopper-first-scope`. Low-risk documentation-only change; no source/schema/provider/data mutation.

## Acceptance for this cleanup

1. PRD and specialist requirements agree on discover → favorite/share → Add to Trip → plan → visit → private memory, simple owner/admin management and ad-free photo-capacity funding.
2. Private unlisted stops, suggested order with manual adjustment and persistent photos are included; prices/paid capacities remain unresolved.
3. Full synthetic teams, offline synchronization, public reviews and advanced billing stop driving the first milestone.
4. Current exposure, private data, grants, media rights and any subscriber obligations remain protected; target scope is not an activation receipt.
5. Cross-document references and a dated implementation/backlog map support the next bounded work without fabricating completion or creating duplicate assignments.

## Source comparison

Static inspection only. Relevant application files at the original inspected `8a28fc65` are identical at this baseline. Code presence is not working local, hosted or production proof.

| Capability | Disposition | Evidence and next requirement |
|---|---|---|
| Catalog/details/photo wall/updates | Keep | `src/features/catalog/`, `src/features/portal/`; verify actual selected environment later |
| Favorites/private memory | Keep/connect | `src/features/shopper/types.ts`, `components.tsx`; public-test guards currently suppress private actions |
| Public store share → Add to Trip | Inspect/connect | Existing `App.tsx` trip routes and `trips/components.tsx` chooser; define canonical public link, sign-in continuation, chooser and retry acceptance |
| Researched unlisted store → usable stop | Missing connection in inspected UI | `candidates/components.tsx:337` only edit/delete; `trips/components.tsx:527` and `tripApi.ts:435` manual input lacks structured address/hours; pin safe stop/navigation contract |
| Day planning, navigation and memory | Reuse/simplify | `trips/types.ts:37` one date; `components.tsx:1248` Maps/Waze and `:1555` private memory; verify suggestion and current service wiring |
| Device-centered nearby search | Gap to verify/implement | `catalog/types.ts:76` contains area-centroid filter; no `navigator.geolocation` found in inspected `src`; do not call area distance device distance |
| Online-first trip start | Dependency review required | `configuredComposition.ts:607` couples start/Go to signed grants; `offlineTripStore.ts` implements encryption/replay; cannot remove gates by hiding controls |
| Owner listing setup | Keep/scope | `owner/ownerClient.ts`, portal and partners features; internal flag/synthetic SQL guards are not public-owner activation |
| Team roles, analytics, promotions, public reviews | Deferred | Existing code/data remains; no mandatory full synthetic suite |
| Photo tiers and servicing | Preserve; resolve offer later | Existing migration `20260831010000_migrate_photo_tiers_free_gallery_full_gallery.sql` has 5/15/unlimited gallery capacity. Existing downgrade grace is not monthly deletion. No provider state/subscriber inventory performed |

## Open GitHub reconciliation snapshot

Read on 2026-10-06: 26 open issues, no open PRs. This is a dated disposition, not a live backlog copy; refresh GitHub and owner handoffs before execution. No active release assignment is taken over by this chat.

| Existing issues | Disposition under approved scope |
|---|---|
| #498, #507 | Keep existing design/release acceptance ownership; do not turn into shopper-feature implementation. #507 assigned to samarquis |
| #548, #549, #550, #551, #552, #553, #554, #555, #556, #557, #558 | Keep exact-release binding, selected rendered cases, capability denial and rollback/stop proof under #507. No new activation from scope cleanup; #557's catalog-only denial remains valid for that existing exposure |
| #511, #538, #540, #543, #544, #545, #546, #547 | Preserve beta recovery and secret-custody obligations. Do not close as “overengineering”; existing data remains |
| #527, #541, #542 | Keep existing curated-image delivery/manifest/route proof; source merge alone is not their full hosted closure |
| #428 | Keep hosted account-lifecycle proof and existing inbox/owner boundary; assigned to samarquis. No account/email actions by this cleanup |
| #487 | Keep SPECIFICATION. Source-bound selected-role evidence is useful; reconcile required personas with the approved shopper/owner/admin scope before READY. Do not require team/analytics/promotion/public-review breadth merely because older fixtures contain it |

None of these 26 issues is a new feature assignment that can be safely closed solely because the product scope narrowed. Source/history evidence does not supersede retained-data or actual-release obligations. No mass closure, new tickets or changes to another owner's body/state are performed here. #487's exact persona/route specification remains unresolved; the scope link and answer key should be updated when this amendment is published, without claiming implementation readiness.

## Next bounded planning work

This is an ordered gap assessment, not READY implementation tickets or a second backlog:

1. Pin one connected acceptance scenario across two shopper accounts and one permitted owner/admin flow. Distinguish synthetic/local/hosted/human layers.
2. Inspect/reuse Favorite/public Share/Add to Trip and specify the missing connection, including sign-in cancellation and duplicate-retry behavior.
3. Specify private-stop address/hours/navigation mapping and the smallest online-first trip-start change; protect retained offline data and revoked identities.
4. Pin suggested-order and explicit nearby-location provider/capability contracts; manual fallbacks cannot be presented as full suggested-order proof.
5. Map simple Owner permission to existing grants and verify listing/photo/update journey without creating team work.
6. Exercise the connected real outing/owner evaluation only after applicable admission. Then resolve the commercial offer; no live billing dependency beforehand.

Split these into independent leaves only after inputs, ownership, exact interfaces, acceptance and dependencies are resolved under ENGINEERING_WORKFLOW. No blanket implementation authorization comes from this documentation amendment.

## Limits

No application tests, database migrations, browser journeys, account/provider operations or deployment were run for this scope change. Existing stack, code, grants, data and published assets remain intact. The earlier broad contracts remain recoverable at the baseline commit for any compatibility migration; historical evidence has not been rewritten as current proof.
