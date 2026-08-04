import type {
  CatalogClient,
  CatalogFilters,
  CatalogListResult,
  CatalogMapPoint,
  CatalogStore,
} from './types'

const names = [
  'Blue Finch Curios',
  'Cedar & Brass',
  'Elm Street Finds',
  'Juniper House',
  'Maple Lantern',
  'North Star Relics',
  'Prairie Cabinet',
  'Redbud Market',
  'Sunflower Salvage',
  'Tallgrass Treasures',
  'Union Station Vintage',
  'Willow & Wren',
]

/** Deterministic fictional data for the local Synthetic Store journey. */
export const syntheticStores: CatalogStore[] = names.map((name, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  slug: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
  name,
  town: 'Topeka',
  state: 'KS',
  address: `${100 + index * 17} Synthetic Avenue`,
  area: { slug: 'topeka-ks', label: 'Topeka' },
  categories: [
    { slug: index % 2 ? 'vintage' : 'antique-mall', label: index % 2 ? 'Vintage' : 'Antique mall' },
  ],
  summary: 'A fictional Synthetic Store for local browsing and testing.',
  description: 'This fictional listing is part of the Antique Trail Synthetic Store catalog.',
  timeZone: 'America/Chicago',
  freshness: { label: 'Verified for Synthetic testing', daysOld: 0 },
  asOfUtc: '2026-01-01T00:00:00Z',
  hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    label: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
      weekday - 1
    ],
    status: weekday === 1 ? 'closed' : 'open',
    intervals:
      weekday === 1 ? [] : [{ opensAt: '10:00', closesAt: weekday > 5 ? '16:00' : '18:00' }],
  })),
  media: [],
}))

export const syntheticMapPoints: CatalogMapPoint[] = syntheticStores.map((store, index) => ({
  storeId: store.id,
  slug: store.slug,
  name: store.name,
  latitude: 39.03 + index * 0.004,
  longitude: -95.72 + index * 0.004,
  store,
  rating: 4.2,
  ratingCount: 12,
  hoursLabel: '10:00 AM–6:00 PM',
  openState: 'open',
  categoryLabel: store.categories[0].label,
  distanceMiles: 1 + index * 0.4,
  claimed: index % 2 === 0,
  saved: null,
  visited: null,
}))

export const demoCatalogClient: CatalogClient = {
  async list(filters: CatalogFilters): Promise<CatalogListResult> {
    const q = filters.q?.toLocaleLowerCase()
    const stores = syntheticStores.filter(
      (store) =>
        (!q ||
          [
            store.name,
            store.town,
            store.area.label,
            ...store.categories.map((category) => category.label),
          ].some((value) => value.toLocaleLowerCase().includes(q))) &&
        (!filters.area || store.area.slug === filters.area) &&
        (!filters.category ||
          store.categories.some((category) => category.slug === filters.category)),
    )
    return { stores, asOfUtc: '2026-01-01T00:00:00Z' }
  },
  async details(slug: string) {
    return syntheticStores.find((store) => store.slug === slug) ?? null
  },
  async map(filters, bounds) {
    const visible = new Set((await this.list(filters)).stores.map((store) => store.id))
    return {
      points: syntheticMapPoints.filter(
        (point) =>
          visible.has(point.storeId) &&
          point.latitude >= bounds.south &&
          point.latitude <= bounds.north &&
          point.longitude >= bounds.west &&
          point.longitude <= bounds.east,
      ),
      asOfUtc: '2026-01-01T00:00:00Z',
    }
  },
}
