import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredCatalogClient } from './supabaseClient'

describe('configured catalog transport', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('reads the current in-memory bearer for private map overlays without persisting it', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://catalog.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')
    let accessToken: string | null = 'memory-only-user-token'
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { stores: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetch)

    const client = configuredCatalogClient(() => accessToken)!
    await client.list({})
    expect(fetch).toHaveBeenLastCalledWith(
      'https://catalog.test/functions/v1/public-catalog',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer memory-only-user-token' }),
      }),
    )

    accessToken = null
    await client.list({})
    expect(fetch).toHaveBeenLastCalledWith(
      'https://catalog.test/functions/v1/public-catalog',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer public-anon-key' }),
      }),
    )
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('localStorage')
  })

  it('sends nearby searches through the public catalog POST without a legacy fallback', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://catalog.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'INVALID_OPERATION', message: 'Unavailable' } }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetch)

    const client = configuredCatalogClient()!
    await expect(
      client.nearbyList!(
        { q: 'oak', category: 'vintage', area: 'manual-area' },
        {
          latitude: 0,
          longitude: 0,
          radiusMiles: 50,
        },
      ),
    ).rejects.toThrow('Unavailable')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://catalog.test/functions/v1/public-catalog',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          operation: 'nearby-list',
          args: {
            p_q: 'oak',
            p_category: 'vintage',
            p_area: null,
            p_device_latitude: 0,
            p_device_longitude: 0,
            p_device_radius_miles: 50,
          },
        }),
      }),
    )
  })

  it('sends nearby map requests through the nearby-map operation without fallback', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://catalog.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key')
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'INVALID_OPERATION', message: 'Unavailable' } }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetch)

    const client = configuredCatalogClient()!
    await expect(
      client.nearbyMap!(
        { q: 'oak', category: 'vintage', area: 'manual-area', maxAreaCentroidMiles: 10 },
        { north: 40, south: 39, east: -95, west: -96 },
        12,
        { latitude: 39.5, longitude: -95.5 },
      ),
    ).rejects.toThrow('Unavailable')

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      'https://catalog.test/functions/v1/public-catalog',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          operation: 'nearby-map',
          args: {
            p_q: 'oak',
            p_category: 'vintage',
            p_area: null,
            p_open_now: null,
            p_visited: null,
            p_saved: null,
            p_claimed: null,
            p_max_area_centroid_miles: null,
            p_state: null,
            p_north: 40,
            p_south: 39,
            p_east: -95,
            p_west: -96,
            p_zoom: 12,
            p_limit: 500,
            p_device_latitude: 39.5,
            p_device_longitude: -95.5,
            p_device_radius_miles: 25,
          },
        }),
      }),
    )
  })
})
