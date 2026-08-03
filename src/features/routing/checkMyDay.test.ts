import { describe, expect, it, vi } from 'vitest'
import {
  checkMyDay,
  type CheckMyDayProvider,
  type CheckMyDayProviderResponse,
  type CheckMyDayRequest,
  type CoordinateMatrixRequest,
} from './checkMyDay'

const baseRequest: CheckMyDayRequest = {
  capability: 'available',
  providerContract: {
    version: 'route-contract-v1',
    maxRequests: 1,
    maxCostUnits: 10,
    timeoutMs: 100,
  },
  origin: { latitude: 39.0473, longitude: -95.6752 },
  returnCoordinate: { latitude: 39.0473, longitude: -95.6752 },
  departureMinute: 9 * 60,
  transitionMinutes: 10,
  maxDriveMiles: 30,
  maxTotalMinutes: 360,
  stops: [
    {
      id: 'oak',
      name: 'Oak Antiques',
      coordinate: { latitude: 39.05, longitude: -95.68 },
      kind: 'store',
      priority: 'must',
      dwellMinutes: 60,
      originalIndex: 0,
      hours: { state: 'verified', opensAt: 9 * 60, closesAt: 17 * 60 },
    },
    {
      id: 'pine',
      name: 'Pine Finds',
      coordinate: { latitude: 39.06, longitude: -95.69 },
      kind: 'store',
      priority: 'prefer',
      dwellMinutes: 45,
      originalIndex: 1,
      hours: { state: 'verified', opensAt: 9 * 60, closesAt: 11 * 60 },
    },
  ],
}

const matrixResponse: CheckMyDayProviderResponse = {
  status: 'ok',
  providerVersion: 'route-contract-v1',
  attribution: 'Synthetic routing fixture',
  generatedAt: '2026-08-03T12:00:00.000Z',
  requestCount: 1,
  costUnits: 2,
  legs: [
    { fromIndex: 0, toIndex: 1, miles: 5, minutes: 20 },
    { fromIndex: 0, toIndex: 2, miles: 4, minutes: 15 },
    { fromIndex: 1, toIndex: 2, miles: 3, minutes: 20 },
    { fromIndex: 2, toIndex: 1, miles: 3, minutes: 20 },
    { fromIndex: 1, toIndex: 3, miles: 5, minutes: 20 },
    { fromIndex: 2, toIndex: 3, miles: 4, minutes: 15 },
  ],
}

function provider(response: CheckMyDayProviderResponse = matrixResponse) {
  return {
    getCoordinateMatrix: vi.fn(async (_request: CoordinateMatrixRequest) => {
      void _request
      return response
    }),
  } satisfies CheckMyDayProvider
}

describe('Check My Day provider-neutral machinery', () => {
  it('does not call a provider before R-01 and preserves the manual order', async () => {
    const adapter = provider()
    const result = await checkMyDay({ ...baseRequest, capability: 'blocked' }, adapter)

    expect(adapter.getCoordinateMatrix).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      kind: 'fallback',
      reason: 'r01_blocked',
      originalOrder: ['oak', 'pine'],
      evidence: { requestCount: 0, costUnits: 0, coordinateCount: 0 },
    })
  })

  it('sends only approved coordinates and returns explicit suggested/keep choices', async () => {
    const adapter = provider()
    const result = await checkMyDay(baseRequest, adapter)

    expect(adapter.getCoordinateMatrix).toHaveBeenCalledWith(
      {
        coordinates: [
          baseRequest.origin,
          baseRequest.stops[0].coordinate,
          baseRequest.stops[1].coordinate,
          baseRequest.returnCoordinate,
        ],
        returnIndex: 3,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(JSON.stringify(adapter.getCoordinateMatrix.mock.calls[0][0])).not.toMatch(
      /oak|pine|account|note|trip/i,
    )
    expect(result).toMatchObject({
      kind: 'suggestion',
      choices: {
        useSuggestedOrder: ['pine', 'oak'],
        keepMyOrder: ['oak', 'pine'],
      },
      optimalityClaim: false,
      evidence: {
        providerVersion: 'route-contract-v1',
        requestCount: 1,
        costUnits: 2,
        coordinateCount: 4,
        persistedCoordinates: false,
        loggedCoordinates: false,
      },
    })
    if (result.kind === 'suggestion') {
      expect(result.explanation.join(' ')).toMatch(/hours|dwell|transition|not.*optimal/i)
      expect(result.itinerary[0]).toMatchObject({ id: 'pine', arrivalMinute: 555 })
      expect(result.itinerary[1]).toMatchObject({ id: 'oak', arrivalMinute: 630 })
      expect(result.estimatedFinishMinute).toBe(720)
    }
  })

  it.each([
    ['quota', 'quota'],
    ['revoked', 'revoked'],
    ['outage', 'provider_outage'],
    ['no_route', 'no_route'],
    ['temporary_market', 'temporary_market'],
  ] as const)('uses a manual-order fallback for provider %s', async (status, reason) => {
    const result = await checkMyDay(
      baseRequest,
      provider({ status, requestCount: 1, costUnits: 0 }),
    )
    expect(result).toMatchObject({
      kind: 'fallback',
      reason,
      originalOrder: ['oak', 'pine'],
      evidence: { outcome: reason },
    })
  })

  it('times out safely and records the control without retaining coordinates', async () => {
    const slow: CheckMyDayProvider = {
      getCoordinateMatrix: vi.fn(() => new Promise<CheckMyDayProviderResponse>(() => undefined)),
    }
    const result = await checkMyDay(
      { ...baseRequest, providerContract: { ...baseRequest.providerContract, timeoutMs: 5 } },
      slow,
    )
    expect(result).toMatchObject({
      kind: 'fallback',
      reason: 'timeout',
      evidence: {
        timeoutMs: 5,
        requestCount: 1,
        outcome: 'timeout',
        loggedCoordinates: false,
        persistedCoordinates: false,
      },
    })
  })

  it('rejects invalid planning limits without sending coordinates', async () => {
    const adapter = provider()
    const result = await checkMyDay({ ...baseRequest, maxDriveMiles: 0 }, adapter)
    expect(adapter.getCoordinateMatrix).not.toHaveBeenCalled()
    expect(result).toMatchObject({ kind: 'fallback', reason: 'invalid_input' })
  })

  it('fails closed when provider version, request, or cost controls are exceeded', async () => {
    const wrongVersion = await checkMyDay(
      baseRequest,
      provider({ ...matrixResponse, providerVersion: 'unexpected-v2' }),
    )
    expect(wrongVersion).toMatchObject({ kind: 'fallback', reason: 'contract_mismatch' })

    const overCost = await checkMyDay(
      baseRequest,
      provider({ ...matrixResponse, requestCount: 2, costUnits: 11 }),
    )
    expect(overCost).toMatchObject({ kind: 'fallback', reason: 'cost_control' })
  })
})
