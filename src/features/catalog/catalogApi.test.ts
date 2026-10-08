import { describe, expect, it, vi } from 'vitest'
import { createCatalogClient } from './catalogApi'

function nearbyList(
  client: ReturnType<typeof createCatalogClient>,
  filters: unknown,
  nearby: unknown,
): Promise<unknown> {
  return (
    client as unknown as {
      nearbyList(filters: unknown, nearby: unknown): Promise<unknown>
    }
  ).nearbyList(filters, nearby)
}

describe('catalog RPC client', () => {
  it.each(['list', 'details'] as const)(
    'omits malformed media, URLs, and nontext optional fields through %s',
    async (method) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'public-store',
            slug: 'public-store',
            media: [
              null,
              'not a record',
              [],
              { src: { private: 'object' }, alt: 'Wrong source' },
              { src: 'javascript:alert(1)', alt: 'Wrong protocol' },
              { src: '//unapproved.invalid/photo.webp', alt: 'Protocol relative' },
              { src: 'https://user:password@unapproved.invalid/photo.webp', alt: 'Credentials' },
              { src: '/\\unapproved.invalid/photo.webp', alt: 'Backslash' },
              { src: 'https://images.example.invalid/\u0000photo.webp', alt: 'Control character' },
              { src: '/public/photo.webp', alt: { private: 'object' } },
              { src: '/public/photo.webp', alt: 'Wrong enum', kind: 'secret' },
              {
                path: '/public/legacy.webp',
                alt_text: 'Legacy public photo',
                kind: 'gallery',
                caption: { private: 'object' },
                rightsLabel: 123,
                private_note: 'private',
              },
              { src: 'https://images.example.invalid/photo.webp', alt: 'Public photo' },
            ],
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list' ? (await client.list({})).stores[0] : await client.details('public-store')

      expect(store?.media).toStrictEqual([
        { src: '/public/legacy.webp', alt: 'Legacy public photo', kind: 'gallery' },
        { src: 'https://images.example.invalid/photo.webp', alt: 'Public photo' },
      ])
    },
  )

  it.each(['list', 'details'] as const)(
    'narrows malformed public profile data and exact approved Facebook links through %s',
    async (method) => {
      const approved = {
        platform: 'Facebook',
        href: 'https://www.facebook.com/TheMarketatMacvicar2307/',
      }
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'public-store',
            slug: 'public-store',
            email: 'public@example.invalid?subject=private',
            provenance: {
              sourceLabel: 'Public source',
              updatedAt: '2026-02-30',
              note: { private: 'value' },
              owner_id: 'private',
            },
            accessibility: {
              status: 'unverified',
              details: ['Public text', null, 42, { private: 'value' }],
              verifiedAt: '2026-10-03T25:00:00Z',
              owner_id: 'private',
            },
            socialLinks: [
              null,
              [],
              'not a record',
              approved,
              { ...approved, platform: 'Instagram' },
              { ...approved, href: 'http://www.facebook.com/TheMarketatMacvicar2307/' },
              { ...approved, href: `${approved.href}?token=private` },
              { ...approved, href: 'https://www.facebook.com/private-owner/' },
              {
                ...approved,
                href: 'https://www.facebook.com.evil.invalid/TheMarketatMacvicar2307/',
              },
              {
                ...approved,
                href: 'https://user:password@www.facebook.com/TheMarketatMacvicar2307/',
              },
            ],
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list' ? (await client.list({})).stores[0] : await client.details('public-store')

      expect(store?.email).toBeNull()
      expect(store?.provenance).toStrictEqual({
        sourceLabel: 'Public source',
        updatedAt: null,
        note: null,
      })
      expect(store?.accessibility).toStrictEqual({
        status: 'unverified',
        details: ['Public text'],
        verifiedAt: null,
      })
      expect(store?.socialLinks).toStrictEqual([approved])
    },
  )

  it.each(['list', 'details'] as const)(
    'omits malformed exceptions and updates without inventing clocks or links through %s',
    async (method) => {
      const closed = {
        date: '2026-12-25',
        label: 'Fictional closure',
        status: 'closed',
        intervals: [],
        note: null,
      }
      const unavailable = { ...closed, date: '2026-12-26', status: 'unavailable' }
      const open = {
        ...closed,
        status: 'open',
        intervals: [{ opensAt: '10:00', closesAt: '16:00' }],
      }
      const update = {
        id: 'public-notice',
        title: 'Public notice',
        body: 'Public text',
        publishedAt: '2026-10-03',
        href: null,
      }
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'public-store',
            slug: 'public-store',
            hoursExceptions: [
              null,
              [],
              123,
              closed,
              unavailable,
              { ...open, date: '2026-02-30' },
              { ...open, date: '2026-12-25T00:00:00Z' },
              { ...open, label: { private: 'object' } },
              { ...open, status: 'secret' },
              { ...open, intervals: { opensAt: '10:00', closesAt: '16:00' } },
              { ...open, intervals: [{ opensAt: '24:00', closesAt: '25:00' }] },
              { ...open, intervals: [{ opensAt: '16:00', closesAt: '10:00' }] },
              { ...open, intervals: [{ opensAt: '10:00', closesAt: '10:00' }] },
              { ...open, intervals: [null] },
              { ...closed, intervals: open.intervals },
              { ...open, intervals: [] },
            ],
            updates: [
              null,
              [],
              123,
              { ...update, href: 'javascript:alert(1)' },
              { ...update, href: '//unapproved.invalid/' },
              { ...update, href: 'https://user:password@unapproved.invalid/' },
              { ...update, id: { private: 'object' } },
              { ...update, title: 123 },
              { ...update, body: { private: 'object' } },
              { ...update, publishedAt: '2026-02-30T12:00:00Z' },
              { ...update, publishedAt: '2026-10-03T12:60:00Z' },
              { ...update, publishedAt: '2026-10-03T12:00:00' },
            ],
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list' ? (await client.list({})).stores[0] : await client.details('public-store')

      expect(store?.hoursExceptions).toStrictEqual([closed, unavailable])
      expect(store?.updates).toStrictEqual([update, update, update])
    },
  )

  it.each([undefined, null, 123, 'not a collection', {}, []])(
    'safely omits invalid optional objects and collections: %j',
    async (value) => {
      const rpc = vi.fn().mockResolvedValue({
        data: {
          id: 'public-store',
          slug: 'public-store',
          email: value,
          provenance: value,
          accessibility: value,
          socialLinks: value,
          hoursExceptions: value,
          updates: value,
          media: value,
        },
        error: null,
      })
      const store = await createCatalogClient({ rpc }).details('public-store')

      expect(store?.email).toBeNull()
      expect(store?.provenance).toBeUndefined()
      expect(store?.accessibility).toBeUndefined()
      expect(store?.socialLinks).toStrictEqual([])
      expect(store?.hoursExceptions).toStrictEqual([])
      expect(store?.updates).toStrictEqual([])
      expect(store?.media).toStrictEqual([])
    },
  )

  it.each([
    'public..business@example.invalid',
    '.public@example.invalid',
    'public.@example.invalid',
    'public@example..invalid',
    'public@-example.invalid',
    'public@example-.invalid',
    'public@example.invalid\n',
    'public@example.invalid#private',
  ])('omits malformed business email %j', async (email) => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'public-store', email }, error: null })
    const store = await createCatalogClient({ rpc }).details('public-store')

    expect(store?.email).toBeNull()
  })

  it.each([
    {
      provenance: { sourceLabel: { private: 'object' } },
      accessibility: { status: 'secret', details: ['Not verified'] },
    },
    {
      provenance: { sourceLabel: ' ' },
      accessibility: { status: ['verified'], details: ['Not verified'] },
    },
  ])('omits invalid profile labels and status enums: %j', async (profile) => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'public-store', ...profile }, error: null })
    const store = await createCatalogClient({ rpc }).details('public-store')

    expect(store?.provenance).toBeUndefined()
    expect(store?.accessibility).toBeUndefined()
  })

  it.each(['list', 'details'] as const)(
    'preserves approved plain media captions and rights through %s',
    async (method) => {
      const media = {
        src: '/curated/macvicar/v1/cover.webp',
        alt: 'Storefront windows bearing THE MARKET at Macvicar lettering.',
        kind: 'cover',
        caption: 'Front windows at The Market at Macvicar · official Facebook photo, October 2017',
        rightsLabel: 'Store owner-authorized photo',
      }
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'approved-store',
            slug: 'the-market-at-macvicar',
            media: [{ ...media, reviewer_note: 'private' }],
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list'
          ? (await client.list({})).stores[0]
          : await client.details('the-market-at-macvicar')

      expect(store?.media).toStrictEqual([media])
    },
  )

  it.each(['list', 'details'] as const)(
    'maps valid public exception and update records through %s',
    async (method) => {
      const hoursExceptions = [
        {
          date: '2026-12-24',
          label: 'Fictional winter schedule',
          status: 'open',
          intervals: [{ opensAt: '11:00', closesAt: '15:00' }],
          note: '<b>Plain public text</b>',
        },
      ]
      const updates = [
        {
          id: 'public-update',
          title: 'Fictional notice',
          body: '<script>Shown as plain text</script>',
          publishedAt: '2026-10-03T12:00:00Z',
          href: '/stores/public-store/updates',
        },
      ]
      const provenance = {
        sourceLabel: 'Public business source',
        updatedAt: '2026-10-03T12:00:00Z',
        note: 'Public source note',
      }
      const accessibility = {
        status: 'verified',
        details: ['Public verified detail'],
        verifiedAt: '2026-10-03T12:00:00+00:00',
      }
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'public-store',
            slug: 'public-store',
            provenance,
            accessibility,
            hoursExceptions: hoursExceptions.map((item) => ({ ...item, owner_id: 'private' })),
            updates: updates.map((item) => ({ ...item, moderation_note: 'private' })),
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list' ? (await client.list({})).stores[0] : await client.details('public-store')

      expect(store?.hoursExceptions).toStrictEqual(hoursExceptions)
      expect(store?.updates).toStrictEqual(updates)
      expect(store?.provenance).toStrictEqual(provenance)
      expect(store?.accessibility).toStrictEqual(accessibility)
    },
  )

  it.each(['list', 'details'] as const)(
    'preserves the approved public business profile through %s without private records',
    async (method) => {
      const profile = {
        email: 'themarketatmacvicar2307@gmail.com',
        provenance: {
          sourceLabel: 'Official Facebook profile; user-confirmed hours',
          updatedAt: '2026-10-03',
          note: 'Hours confirmed by the user on October 3, 2026. Gallery images show examples and may not reflect current inventory. The cover is an official Facebook photo dated October 21, 2017; it shows the front windows only.',
        },
        accessibility: {
          status: 'unverified',
          details: ['Entry and other accessibility details have not been verified.'],
        },
        socialLinks: [
          { platform: 'Facebook', href: 'https://www.facebook.com/TheMarketatMacvicar2307/' },
        ],
        hoursExceptions: [],
        updates: [],
      }
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'approved-store',
            slug: 'the-market-at-macvicar',
            ...profile,
            ownerAccount: { email: 'private-owner@example.invalid' },
            planEntitlement: { tier: 'private' },
            technicalAdmission: { token: 'private' },
            private_email: 'private@example.invalid',
          },
        ],
        error: null,
      })
      const client = createCatalogClient({ rpc })
      const store =
        method === 'list'
          ? (await client.list({})).stores[0]
          : await client.details('the-market-at-macvicar')

      expect(store).toMatchObject(profile)
      for (const key of ['ownerAccount', 'planEntitlement', 'technicalAdmission', 'private_email'])
        expect(store).not.toHaveProperty(key)
    },
  )

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

  it.each([
    ['zero coordinates and the default radius', { latitude: 0, longitude: 0 }, undefined, 25],
    ['the north/east boundary and radius 5', { latitude: 90, longitude: 180 }, 5, 5],
    ['the south/west boundary and radius 10', { latitude: -90, longitude: -180 }, 10, 10],
    ['radius 25', { latitude: 12, longitude: -45 }, 25, 25],
    ['radius 50', { latitude: 0, longitude: 0 }, 50, 50],
  ] as const)(
    'sends a nearby catalog list for %s',
    async (_case, coordinates, radiusMiles, radius) => {
      const filters = { q: 'oak', category: 'vintage', area: 'topeka-ks' }
      const originalFilters = { ...filters }
      const rpc = vi.fn().mockResolvedValue({ data: { stores: [] }, error: null })
      const client = createCatalogClient({ rpc })

      await nearbyList(client, filters, {
        ...coordinates,
        ...(radiusMiles === undefined ? {} : { radiusMiles }),
      })

      expect(rpc).toHaveBeenCalledWith('catalog_list_nearby', {
        p_q: 'oak',
        p_category: 'vintage',
        p_area: null,
        p_device_latitude: coordinates.latitude,
        p_device_longitude: coordinates.longitude,
        p_device_radius_miles: radius,
      })
      expect(filters).toEqual(originalFilters)
    },
  )

  it.each([
    ['null filters', null, { latitude: 1, longitude: 2 }],
    ['nonobject filters', 'private filters', { latitude: 1, longitude: 2 }],
    ['null nearby input', {}, null],
    ['nonobject nearby input', {}, []],
    ['string nearby input', {}, 'private nearby input'],
    ['partial coordinates', {}, { latitude: 1 }],
    ['string latitude', {}, { latitude: '1', longitude: 2 }],
    ['nonfinite latitude', {}, { latitude: Number.NaN, longitude: 2 }],
    ['infinite longitude', {}, { latitude: 1, longitude: Number.POSITIVE_INFINITY }],
    ['latitude below range', {}, { latitude: -90.01, longitude: 2 }],
    ['latitude above range', {}, { latitude: 90.01, longitude: 2 }],
    ['longitude below range', {}, { latitude: 1, longitude: -180.01 }],
    ['longitude above range', {}, { latitude: 1, longitude: 180.01 }],
    ['null radius', {}, { latitude: 1, longitude: 2, radiusMiles: null }],
    ['string radius', {}, { latitude: 1, longitude: 2, radiusMiles: '5' }],
    ['unsupported radius', {}, { latitude: 1, longitude: 2, radiusMiles: 15 }],
  ])('rejects %s before transport with a generic error', async (_case, filters, nearby) => {
    const rpc = vi.fn()
    const client = createCatalogClient({ rpc })

    await expect(nearbyList(client, filters, nearby)).rejects.toThrow('Invalid nearby search')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('preserves the SQL timezone_name projection for local-hours rendering', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        stores: [{ id: '1', slug: 'oak-mall', name: 'Oak Mall', timezone_name: 'America/Chicago' }],
      },
      error: null,
    })

    const result = await createCatalogClient({ rpc }).list({})

    expect(result.stores[0].timeZone).toBe('America/Chicago')
  })

  it('maps current verification status for trusted Store Details navigation', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: '1',
        slug: 'verified-store',
        name: 'Verified Store',
        freshness_state: 'current',
        oldest_verified_at: '2026-08-03T12:00:00Z',
        categories: [],
        hours: [],
        media: [],
      },
      error: null,
    })

    const store = await createCatalogClient({ rpc }).details('verified-store')

    expect(store?.freshness).toMatchObject({
      status: 'current',
      verifiedAt: '2026-08-03T12:00:00Z',
    })
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
