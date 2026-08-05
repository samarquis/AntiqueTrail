# R-01 routing and geocoding provider runbook

Status: **NO-GO / disabled by default**. This repository contains no selected provider, legal approval, regional-processing claim, retention promise, production endpoint, credential, or cost approval. Synthetic fixtures and passing CI do not satisfy Provider R.

## Activation evidence

Before enabling anything, the named deployment owner must record a real, externally verified `provider_r` release-gate receipt and an accepted routing contract. The evidence packet must identify the provider and version, processing region, provider retention, authentication method, exact attribution, daily request ceiling, daily cost ceiling, maximum per-call cost, timeout, retry/idempotency behavior, fallback/replacement path, travel-time semantics, temporary-market behavior, and legal/privacy approval. The stored configuration digest must identify that reviewed packet; do not paste the packet or credentials into GitHub, application logs, or routing operation records.

Activation order:

1. Verify the provider endpoints accept the documented minimized matrix and geocode requests and honor the same idempotency key during reconciliation.
2. Insert the real routing-contract and Provider R receipts through their authorized evidence ceremonies.
3. Call `app_public.routing_accept_provider_config` using the deployment-service identity. This opens the database latch only if the evidence is real and consistent.
4. Set protected Edge secrets: `ROUTING_PROVIDER_JWT`, `ROUTING_MONITOR_JWT`, `ROUTING_PROVIDER_TOKEN`, exact HTTPS matrix/geocode/reconcile URLs, provider version, attribution, the reviewed `ROUTING_PROVIDER_TIMEOUT_MS`, and the worker secret.
5. Set `ROUTING_PROVIDER_GATE_ACCEPTED=true`; set the environment capability `routing_geocoding=true` only after a private-beta smoke test.
6. Keep `R01_ROUTING_OPERATIONS_ENABLED` false until the maintenance function and protected secrets are deployed, then enable it explicitly.

## Payload and behavior checks

- Invoke only from an explicit Check My Day or geocode-search action. Matrix payloads contain two to ten coordinates and optional final return index. Intermediate points must match approved active-store coordinates. No account, cohort, note, trip ID, store ID, or business metadata crosses the provider boundary.
- Geocoding sends only normalized user-entered start, return, or rest text. Return at most five candidates, preserve the original input, and require the user to choose; never auto-select.
- Provider responses are transient. Persist only operation state, provider version, attribution, request count, cost units, timestamps, outcome, and a digest where the legacy itinerary path requires one. Do not log bodies or coordinates.
- Check My Day is a feasibility suggestion using hours, dwell, transition, travel-time, closing, and selected-location inputs. It is not an optimal route claim. List/filter state and the user's existing order remain available on every fallback.

## Failure drills

Exercise timeout, quota, revocation, outage, temporary-market, no-route, and lost-response cases in private beta. Timeout/outage returns local fallback without retrying an unknown call. A lost response moves the operation to `reconciliation_required`; the next attempt queries the reconcile endpoint with only operation kind and the original idempotency key. Quota or revocation pauses the latch. Recovery requires reviewed evidence and an explicit deployment action; maintenance never re-enables provider access.

At 75% of either approved daily request or cost capacity, reservation pauses before making another provider call. Investigate provider receipts outside application logs, revoke the provider if contract facts changed, and keep the list-first experience available.

## Retention and deletion

The maintenance worker deletes settled content-free operation receipts after 90 days in bounded batches. Hash-chained audit events contain no request or response content. Provider-side deletion and retention must follow the accepted evidence packet; if that proof is unavailable or stale, revoke the capability and leave it disabled.
