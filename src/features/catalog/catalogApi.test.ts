import { describe, expect, it, vi } from 'vitest'
import { createCatalogClient } from './catalogApi'

describe('catalog RPC client', () => {
  it('uses one bounded list RPC and maps the complete projection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        as_of_utc: '2026-01-01T00:00:00Z',
        stores: [
          {
            id: '1',
            slug: 'oak-mall',
            name: 'Oak Mall',
            area_slug: 'topeka-ks',
            area_label: 'Topeka',
            categories: [{ slug: 'vintage', label: 'Vintage' }],
            hours: [],
            media: [],
          },
        ],
      },
      error: null,
    })
    const result = await createCatalogClient({ rpc }).list({
      q: 'oak',
      category: 'vintage',
      area: 'topeka-ks',
    })
    expect(rpc).toHaveBeenCalledWith('catalog_list', {
      p_q: 'oak',
      p_category: 'vintage',
      p_area: 'topeka-ks',
    })
    expect(result.stores[0].name).toBe('Oak Mall')
    expect(result.asOfUtc).toBe('2026-01-01T00:00:00Z')
  })

  it('maps not-found details to null and does not leak row errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'NOT_FOUND' } })
    await expect(createCatalogClient({ rpc }).details('hidden-store')).resolves.toBeNull()
  })

  it('keeps catalog media on the public src, alt, and kind allowlist', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: '1',
        slug: 'public-store',
        name: 'Public Store',
        area_slug: 'topeka-ks',
        area_label: 'Topeka',
        categories: [],
        hours: [],
        media: [
          {
            src: '/public/store.webp',
            alt: 'Public storefront',
            kind: 'cover',
            object_key: 'private/object-key',
            signed_url: 'https://storage.invalid/signed?token=secret',
            reviewer_note: 'Internal only',
            moderation_state: 'pending',
            provenance: { provider_response: 'secret' },
          },
        ],
      },
      error: null,
    })

    const store = await createCatalogClient({ rpc }).details('public-store')

    expect(store?.media).toEqual([
      { src: '/public/store.webp', alt: 'Public storefront', kind: 'cover' },
    ])
  })

  it('requests only bounded Browse map coordinates with the active list filters', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        as_of_utc: '2026-08-04T12:00:00Z',
        points: [
          {
            store_id: '00000000-0000-4000-8000-000000000001',
            slug: 'public-store',
            name: 'Public Store',
            latitude: 39.05,
            longitude: -95.68,
            town: 'Topeka',
            state_code: 'KS',
            address: '1 Main St',
            area_slug: 'topeka-ks',
            area_label: 'Topeka',
            categories: [{ slug: 'vintage', label: 'Vintage' }],
            hours: [],
            media: [],
            rating: 4.5,
            rating_count: 8,
            hours_label: '10:00 AM–6:00 PM',
            open_state: 'open',
            category_label: 'Vintage',
            distance_miles: 2.4,
            claimed: true,
            saved: false,
            visited: true,
          },
        ],
      },
      error: null,
    })
    const result = await createCatalogClient({ rpc }).map!(
      {
        q: 'public',
        area: 'topeka-ks',
        openNow: true,
        visited: 'visited',
        saved: true,
        claimed: true,
        maxAreaCentroidMiles: 10,
        state: 'KS',
      },
      { north: 40, south: 39, east: -95, west: -96 },
      13,
    )

    expect(rpc).toHaveBeenCalledWith('get_browse_map_v2', {
      p_q: 'public',
      p_category: null,
      p_area: 'topeka-ks',
      p_open_now: true,
      p_visited: 'visited',
      p_saved: true,
      p_claimed: true,
      p_max_area_centroid_miles: 10,
      p_state: 'KS',
      p_north: 40,
      p_south: 39,
      p_east: -95,
      p_west: -96,
      p_zoom: 13,
      p_limit: 500,
    })
    expect(result).toEqual({
      asOfUtc: '2026-08-04T12:00:00Z',
      points: [
        {
          storeId: '00000000-0000-4000-8000-000000000001',
          slug: 'public-store',
          name: 'Public Store',
          latitude: 39.05,
          longitude: -95.68,
          store: expect.objectContaining({
            id: '00000000-0000-4000-8000-000000000001',
            state: 'KS',
          }),
          rating: 4.5,
          ratingCount: 8,
          hoursLabel: '10:00 AM–6:00 PM',
          openState: 'open',
          categoryLabel: 'Vintage',
          distanceMiles: 2.4,
          claimed: true,
          saved: false,
          visited: true,
        },
      ],
    })
  })

  it('fails closed on an invalid or oversized map projection', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        points: Array.from({ length: 501 }, (_, index) => ({
          store_id: String(index),
          slug: `store-${index}`,
          name: `Store ${index}`,
          latitude: 39,
          longitude: -95,
        })),
      },
      error: null,
    })
    await expect(
      createCatalogClient({ rpc }).map!({}, { north: 40, south: 39, east: -95, west: -96 }, 12),
    ).rejects.toThrow(/map response/i)
  })
})
