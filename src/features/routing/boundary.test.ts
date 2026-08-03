import { describe, expect, it } from 'vitest'
import {
  boundMapPoints,
  buildGeocodeRequest,
  buildMapRequest,
  buildProviderPayload,
  mapFallback,
  suggestCheckMyDay,
} from './boundary'

describe('provider-neutral routing boundary', () => {
  it('blocks all provider calls until R-01 is accepted and preserves list fallback', () => {
    expect(
      buildMapRequest('blocked', { bounds: { north: 1, south: 0, east: 1, west: 0 }, zoom: 10 }),
    ).toBeNull()
    expect(buildGeocodeRequest('unavailable', '  Topeka  ', 'start')).toBeNull()
    expect(
      buildProviderPayload('blocked', { id: 'a', name: 'A', latitude: 1, longitude: 2 }, []),
    ).toBeNull()
    expect(mapFallback('blocked').mapVisible).toBe(false)
    expect(
      boundMapPoints(
        Array.from({ length: 501 }, (_, index) => ({
          id: String(index),
          name: 'store',
          latitude: 1,
          longitude: 2,
        })),
      ),
    ).toEqual({ kind: 'too_many_results' })
  })

  it('minimizes provider payload to approved public coordinates and place text', () => {
    expect(
      buildMapRequest('available', {
        bounds: { north: 1, south: 0, east: 1, west: 0 },
        zoom: 10,
        q: '  antiques ',
      })?.q,
    ).toBe('antiques')
    expect(buildGeocodeRequest('available', '  Main Street, Topeka ', 'start')).toEqual({
      text: 'Main Street, Topeka',
      purpose: 'start',
    })
    expect(
      buildProviderPayload(
        'available',
        { id: 'private-id', name: 'Private', latitude: 1, longitude: 2 },
        [{ id: 'store-id', name: 'Store', latitude: 3, longitude: 4 }],
      ),
    ).toEqual({
      origin: { latitude: 1, longitude: 2 },
      destinations: [{ latitude: 3, longitude: 4 }],
    })
  })

  it('returns explained explicit-choice suggestions with return leg and limits', () => {
    const result = suggestCheckMyDay({
      departureMinute: 9 * 60,
      returnId: '__return__',
      maxDriveMiles: 20,
      maxTotalMinutes: 300,
      matrixTimestamp: '2026-01-01T00:00:00Z',
      stops: [
        {
          id: 'a',
          kind: 'store',
          name: 'A',
          priority: 'must',
          dwellMinutes: 30,
          originalIndex: 0,
          opensAt: 600,
          closesAt: 1_080,
        },
        {
          id: 'b',
          kind: 'store',
          name: 'B',
          priority: 'prefer',
          dwellMinutes: 20,
          originalIndex: 1,
          opensAt: 600,
          closesAt: 1_020,
        },
      ],
      matrix: {
        '__start__->a': { from: '__start__', to: 'a', miles: 5, minutes: 20 },
        'a->b': { from: 'a', to: 'b', miles: 3, minutes: 15 },
        'b->a': { from: 'b', to: 'a', miles: 3, minutes: 15 },
        'a->__return__': { from: 'a', to: '__return__', miles: 4, minutes: 15 },
        'b->__return__': { from: 'b', to: '__return__', miles: 4, minutes: 15 },
      },
    })
    expect(result.order.map((stop) => stop.id)).toEqual(['a', 'b'])
    expect(result.legs.at(-1)?.to).toBe('__return__')
    expect(result.reasons.join(' ')).toMatch(/explicit|Keep My Order/i)
    expect(result.feasible).toBe(true)
  })
})
