import { describe, expect, it, vi } from 'vitest'
import {
  createProviderBackedCheckMyDay,
  createProviderBackedGeocoder,
  type RoutingEdgeTransport,
} from './providerAdapter'
import {
  executeRoutingOperation,
  type RoutingOperationDependencies,
} from '../../../supabase/functions/_shared/routing-provider'

const operationId = '11111111-1111-4111-8111-111111111111'
const requestId = '22222222-2222-4222-8222-222222222222'

describe('R-01 provider adapter', () => {
  it('sends only bounded coordinates and operational fields through CheckMyDayProvider', async () => {
    const transport: RoutingEdgeTransport = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        providerOperationId: 'provider-op-1',
        providerVersion: 'contract-v1',
        attribution: 'Approved provider attribution',
        generatedAt: '2026-08-05T12:00:00.000Z',
        requestCount: 1,
        costUnits: 1,
        legs: [{ fromIndex: 0, toIndex: 1, miles: 2, minutes: 5 }],
      })),
    }
    const provider = createProviderBackedCheckMyDay(transport, () => requestId)
    await provider.getCoordinateMatrix(
      {
        coordinates: [
          { latitude: 39.0473, longitude: -95.6752 },
          { latitude: 39.055, longitude: -95.68 },
        ],
      },
      { signal: new AbortController().signal },
    )

    expect(transport.execute).toHaveBeenCalledWith(
      {
        operation: 'matrix',
        idempotencyKey: requestId,
        explicitAction: true,
        coordinates: [
          { latitude: 39.0473, longitude: -95.6752 },
          { latitude: 39.055, longitude: -95.68 },
        ],
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(JSON.stringify(vi.mocked(transport.execute).mock.calls[0])).not.toMatch(
      /account|cohort|note|storeId|tripId|email/iu,
    )
  })

  it('returns typed provider failures and lets the existing request timer own timeout', async () => {
    const timeoutTransport: RoutingEdgeTransport = {
      execute: vi.fn(async () => ({ status: 'timeout' as const, requestCount: 1, costUnits: 0 })),
    }
    const provider = createProviderBackedCheckMyDay(timeoutTransport, () => requestId)
    const controller = new AbortController()
    const pending = provider.getCoordinateMatrix(
      {
        coordinates: [
          { latitude: 39, longitude: -95 },
          { latitude: 39.1, longitude: -95.1 },
        ],
      },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(pending).rejects.toThrow()

    const quotaTransport: RoutingEdgeTransport = {
      execute: vi.fn(async () => ({ status: 'quota' as const, requestCount: 1, costUnits: 0 })),
    }
    await expect(
      createProviderBackedCheckMyDay(quotaTransport, () => requestId).getCoordinateMatrix(
        {
          coordinates: [
            { latitude: 39, longitude: -95 },
            { latitude: 39.1, longitude: -95.1 },
          ],
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ status: 'quota', requestCount: 1, costUnits: 0 })
  })

  it('returns bounded geocoding candidates without selecting one', async () => {
    const transport: RoutingEdgeTransport = {
      execute: vi.fn(async () => ({
        status: 'ok' as const,
        providerOperationId: 'provider-op-1',
        providerVersion: 'contract-v1',
        attribution: 'Approved provider attribution',
        generatedAt: '2026-08-05T12:00:00.000Z',
        requestCount: 1,
        costUnits: 1,
        candidates: [
          {
            label: 'Downtown Topeka, Kansas',
            address: 'Topeka, KS 66603',
            latitude: 39.0473,
            longitude: -95.6752,
          },
        ],
      })),
    }
    const geocoder = createProviderBackedGeocoder(transport, () => requestId)
    const result = await geocoder.search('  Downtown Topeka  ', 'start', {
      signal: new AbortController().signal,
    })
    expect(result).toEqual(expect.objectContaining({ status: 'ok', selectedCandidate: undefined }))
    expect(transport.execute).toHaveBeenCalledWith(
      {
        operation: 'geocode',
        idempotencyKey: requestId,
        explicitAction: true,
        text: 'Downtown Topeka',
        purpose: 'start',
      },
      expect.anything(),
    )
  })
})

function dependencies(
  overrides: Partial<RoutingOperationDependencies> = {},
): RoutingOperationDependencies {
  return {
    reserve: vi.fn(async () => ({ state: 'reserved' as const, operationId })),
    begin: vi.fn(async () => ({ state: 'calling' as const })),
    callMatrix: vi.fn(async () => ({
      status: 'ok' as const,
      providerOperationId: 'provider-op-1',
      providerVersion: 'contract-v1',
      attribution: 'Approved provider attribution',
      generatedAt: '2026-08-05T12:00:00.000Z',
      requestCount: 1,
      costUnits: 1,
      legs: [{ fromIndex: 0, toIndex: 1, miles: 2, minutes: 5 }],
    })),
    callGeocode: vi.fn(async () => ({
      status: 'no_route' as const,
      providerOperationId: 'provider-op-1',
      providerVersion: 'contract-v1',
      attribution: 'Approved provider attribution',
      requestCount: 1,
      costUnits: 1,
    })),
    reconcile: vi.fn(async () => ({
      status: 'quota' as const,
      providerOperationId: 'provider-op-1',
      providerVersion: 'contract-v1',
      attribution: 'Approved provider attribution',
      requestCount: 1,
      costUnits: 0,
    })),
    settle: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('R-01 operational execution', () => {
  it('never calls a provider without explicit action and an open reservation', async () => {
    const boundary = dependencies()
    await expect(
      executeRoutingOperation(
        {
          operation: 'matrix',
          idempotencyKey: requestId,
          explicitAction: false,
          coordinates: [
            { latitude: 39, longitude: -95 },
            { latitude: 39.1, longitude: -95.1 },
          ],
        },
        boundary,
        new AbortController().signal,
      ),
    ).resolves.toEqual({ status: 'revoked', requestCount: 0, costUnits: 0 })
    expect(boundary.reserve).not.toHaveBeenCalled()
    expect(boundary.callMatrix).not.toHaveBeenCalled()
  })

  it('reconciles a lost response with the same idempotency key instead of calling again', async () => {
    const boundary = dependencies({
      reserve: vi.fn(async () => ({
        state: 'reconciliation_required' as const,
        operationId,
      })),
    })
    const result = await executeRoutingOperation(
      {
        operation: 'matrix',
        idempotencyKey: requestId,
        explicitAction: true,
        coordinates: [
          { latitude: 39, longitude: -95 },
          { latitude: 39.1, longitude: -95.1 },
        ],
      },
      boundary,
      new AbortController().signal,
    )
    expect(result.status).toBe('quota')
    expect(boundary.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ operationId, idempotencyKey: requestId }),
    )
    expect(boundary.callMatrix).not.toHaveBeenCalled()
    expect(boundary.settle).toHaveBeenCalled()
  })

  it('records only operational evidence after returning the provider result unchanged', async () => {
    const boundary = dependencies()
    const input = {
      operation: 'matrix' as const,
      idempotencyKey: requestId,
      explicitAction: true as const,
      coordinates: [
        { latitude: 39.0473, longitude: -95.6752 },
        { latitude: 39.055, longitude: -95.68 },
      ],
    }
    const result = await executeRoutingOperation(input, boundary, new AbortController().signal)
    expect(result.status).toBe('ok')
    expect(boundary.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        idempotencyKey: requestId,
        outcome: 'ok',
        providerVersion: 'contract-v1',
        attribution: 'Approved provider attribution',
        requestCount: 1,
        costUnits: 1,
      }),
    )
    expect(JSON.stringify(vi.mocked(boundary.settle).mock.calls)).not.toContain('latitude')
    expect(JSON.stringify(vi.mocked(boundary.settle).mock.calls)).not.toContain('legs')
  })
})
