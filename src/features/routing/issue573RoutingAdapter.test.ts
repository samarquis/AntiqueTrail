/**
 * ISSUE 573 CONTRACT PREPARATION; runtime admission remains BLOCKED.
 *
 * Frozen inputs: consume the final #572 routing map and #567 confirmed-destination
 * map. A confirmed/exact address does not authorize or derive route coordinates.
 * Keep #570 nearby-search inputs separate: device center is transient, manual
 * centroid is user-entered, and approved 5/10/25/50 mi radii (default 25) never
 * enter the routing DTO.
 *
 * Required boundary: only a single, explicit route action for the current trip
 * revision may start routing. Loading, polling, background work, or confirming
 * an address is not that action. `explicitAction: true` below is only the
 * transport protocol marker; this fixture cannot prove caller provenance.
 * Send only approved coordinates, operation kind, idempotency key, marker, and
 * optional final-point return index. Do not send names, IDs, account/trip text,
 * notes, search centers, or radius. R-01 currently admits only bounded points
 * whose intermediate points match active public-store coordinates; private/rest
 * destinations have no admitted success path.
 *
 * Keep performs no save. Use sends trip ID, request ID, and expected trip
 * revision; the server fetches the stored order and applies it only when the
 * request belongs to this actor and the live trip still has that revision. The
 * former three-argument arbitrary-order save RPC is removed.
 * Failures, cancellation, timeout, incomplete matrices, and stale revisions
 * preserve the manual order. Retry still starts a new route request; no
 * end-to-end cancellation contract is established.
 *
 * Before runtime READY, freeze selected date/departure/timezone/origin/return,
 * dwell and hours; bind action and revision through request/poll/save; define
 * wrong-account/store behavior; approve provider, region, retention/deletion,
 * auth, version/attribution, timeout, quotas/cost, replacement, and a signed
 * config/acceptance receipt. R-01 is blocked by default. Define any cache TTL,
 * retention, and invalidation. Current HTTP is no-store; it does not approve a
 * separate cache. Prove coordinate exclusion from logs, analytics, support,
 * persisted data, and provider retention. Existing source only shows operation
 * digests persisted; complete sink/provider proof is unavailable.
 *
 * This synthetic fixture proves only DTO mapping and typed no-route propagation.
 * It does not prove user action, caller wiring, R-01 reservation, provider
 * admission, egress, retention, stale-save safety, private/rest support, or
 * production behavior. Existing providerAdapter/checkMyDay/transport tests
 * already cover base DTO, blocked fallback, failures, and no-store behavior.
 * Source maps: #572 comment 6048793668, #567 comment 6048480426, #570 comment
 * 6048392339. This file is prepared for #573 only; no runtime tests were run.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  checkMyDay,
  type CheckMyDayProvider,
  type CheckMyDayRequest,
} from './checkMyDay'
import { createProviderBackedCheckMyDay, type RoutingEdgeTransport } from './providerAdapter'

const idempotencyKey = '22222222-2222-4222-8222-222222222222'
const request: CheckMyDayRequest = {
  capability: 'available',
  providerContract: { version: 'synthetic-v1', maxRequests: 1, maxCostUnits: 5, timeoutMs: 100 },
  origin: { latitude: 1, longitude: 2 },
  departureMinute: 540,
  transitionMinutes: 10,
  maxDriveMiles: 30,
  maxTotalMinutes: 360,
  stops: [
    {
      id: 'a',
      name: 'Synthetic Stop A',
      coordinate: { latitude: 3, longitude: 4 },
      kind: 'store',
      priority: 'must',
      dwellMinutes: 30,
      originalIndex: 0,
    },
    {
      id: 'b',
      name: 'Synthetic Stop B',
      coordinate: { latitude: 5, longitude: 6 },
      kind: 'store',
      priority: 'flexible',
      dwellMinutes: 30,
      originalIndex: 1,
    },
  ],
}

describe('issue 573 synthetic routing adapter fixture', () => {
  it('sends only synthetic coordinates and the optional final return index', async () => {
    const coordinates = [
      { latitude: 1, longitude: 2 },
      { latitude: 3, longitude: 4 },
      { latitude: 5, longitude: 6 },
    ]
    const transport: RoutingEdgeTransport = {
      execute: vi.fn(async () => ({ status: 'no_route' as const, requestCount: 1, costUnits: 0 })),
    }
    const adapter = createProviderBackedCheckMyDay(transport, () => idempotencyKey)

    await expect(
      adapter.getCoordinateMatrix(
        { coordinates, returnIndex: 2 },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ status: 'no_route', requestCount: 1, costUnits: 0 })

    expect(transport.execute).toHaveBeenCalledWith(
      {
        operation: 'matrix',
        idempotencyKey,
        // Protocol marker only; this fixture does not establish caller action provenance.
        explicitAction: true,
        coordinates,
        returnIndex: 2,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it.each([
    {
      name: 'no_route',
      response: { status: 'no_route' as const, requestCount: 1, costUnits: 0 },
      reason: 'no_route',
    },
    {
      name: 'malformed matrix',
      response: {
        status: 'ok' as const,
        providerVersion: 'synthetic-v1',
        attribution: 'Synthetic fixture',
        generatedAt: '2026-08-03T12:00:00.000Z',
        requestCount: 1,
        costUnits: 1,
        legs: [{ fromIndex: 99, toIndex: 0, miles: 1, minutes: 2 }],
      },
      reason: 'contract_mismatch',
    },
  ])('preserves manual stop order for $name', async ({ response, reason }) => {
    const provider: CheckMyDayProvider = {
      getCoordinateMatrix: vi.fn(async () => response),
    }
    const outcome = await checkMyDay(request, provider)

    expect(outcome).toMatchObject({
      kind: 'fallback',
      reason,
      originalOrder: ['a', 'b'],
    })
  })
})
