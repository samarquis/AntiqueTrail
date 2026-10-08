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
})
