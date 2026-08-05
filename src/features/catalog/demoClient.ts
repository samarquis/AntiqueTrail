import type {
  CatalogClient,
  CatalogFilters,
  CatalogListResult,
  CatalogMapPoint,
  CatalogMedia,
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

const syntheticImageRoot = '/images/synthetic-stores/1280w'
const generatedRights = 'OpenAI-generated fictional image · Internal Alpha only'

const coverAltText = [
  'Blue-painted brick storefront with antique lamps, ceramics, and small chests in the windows.',
  'Cedar-clad storefront displaying a walnut cabinet and brass candlesticks.',
  'Cream brick storefront shaded by an elm tree, with pottery and framed art in the windows.',
  'Deep green craftsman storefront with porch displays and native flowers.',
  'Stone corner storefront with red trim, a glowing lantern, and antique furniture.',
  'Navy-trimmed storefront displaying travel trunks, maps, and wooden chairs.',
  'Buff brick storefront with oak cabinets and woven rugs behind broad windows.',
  'Rose-red storefront beneath a blooming redbud tree, with quilts in the windows.',
  'White brick storefront with a mustard door, sunflower planters, and salvaged furniture.',
  'Tan brick storefront framed by tall grasses, with pottery and quilts on display.',
  'Arched brick storefront with teal doors, travel trunks, clocks, and vintage chairs.',
  'Willow-green storefront beside a creek, displaying baskets, botanical art, and chairs.',
]

const coverImageSlugs = [
  'blue-finch-curios',
  'cedar-and-brass',
  'elm-street-finds',
  'juniper-house',
  'maple-lantern',
  'north-star-relics',
  'prairie-cabinet',
  'redbud-market',
  'sunflower-salvage',
  'tallgrass-treasures',
  'union-station-vintage',
  'willow-and-wren',
]

const syntheticMedia: CatalogMedia[][] = names.map((name, index) => {
  const media: CatalogMedia[] = [
    {
      src: `${syntheticImageRoot}/${coverImageSlugs[index]}-cover.webp`,
      alt: coverAltText[index],
      kind: 'cover',
      caption: `Fictional storefront created for the ${name} Synthetic Store fixture.`,
      rightsLabel: generatedRights,
    },
  ]

  if (index === 0) {
    media.push(
      {
        src: `${syntheticImageRoot}/blue-finch-curios-gallery-aisle.webp`,
        alt: 'Narrow brick-walled shop aisle lined with blue shelves, ceramic lamps, and walnut furniture.',
        kind: 'gallery',
        caption: 'The fictional Blue Finch Curios main aisle.',
        rightsLabel: generatedRights,
      },
      {
        src: `${syntheticImageRoot}/blue-finch-curios-gallery-vignette.webp`,
        alt: 'Blue-and-white ceramic lamp with brass candlesticks on a carved walnut table.',
        kind: 'gallery',
        caption: 'A fictional ceramics and lighting vignette.',
        rightsLabel: generatedRights,
      },
      {
        src: `${syntheticImageRoot}/blue-finch-curios-gallery-cabinet.webp`,
        alt: 'Oak glass-front cabinet, blue upholstered chair, and glassware against a brick wall.',
        kind: 'gallery',
        caption: 'A fictional cabinet and reading-chair display.',
        rightsLabel: generatedRights,
      },
    )
  }

  return media
})

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
  freshness:
    index === 0
      ? {
          label: 'Verified for Synthetic testing',
          verifiedAt: '2026-08-01T15:00:00Z',
          daysOld: 4,
          status: 'current',
        }
      : { label: 'Verified for Synthetic testing', daysOld: 0 },
  asOfUtc: '2026-08-05T15:00:00Z',
  hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    label: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
      weekday - 1
    ],
    status: weekday === 1 ? 'closed' : 'open',
    intervals:
      weekday === 1 ? [] : [{ opensAt: '10:00', closesAt: weekday > 5 ? '16:00' : '18:00' }],
  })),
  media: syntheticMedia[index],
  ...(index === 0
    ? {
        phone: '+1-785-555-0101',
        email: 'hello@blue-finch.example.invalid',
        website: 'https://blue-finch.example.invalid',
        provenance: {
          sourceLabel: 'Antique Trail Synthetic Store fixture',
          updatedAt: '2026-08-01T15:00:00Z',
          note: 'Fictional details maintained for Internal Alpha review only.',
        },
        accessibility: {
          status: 'verified' as const,
          details: [
            'Step-free entrance at the blue front door',
            '36-inch clear route through the main aisle',
            'Accessible parking space beside the storefront',
          ],
          verifiedAt: '2026-08-01T15:00:00Z',
        },
        hoursExceptions: [
          {
            date: '2026-09-07',
            label: 'Labor Day',
            status: 'closed' as const,
            intervals: [],
            note: 'Closed for the holiday.',
          },
        ],
        updates: [
          {
            id: 'blue-finch-update-1',
            title: 'Late-summer lighting collection',
            body: 'Newly curated table and floor lamps are now displayed in the main aisle.',
            publishedAt: '2026-08-01T15:00:00Z',
          },
          {
            id: 'blue-finch-update-2',
            title: 'Holiday hours posted',
            body: 'The shop will be closed on Labor Day and will reopen Tuesday at 10:00 AM.',
            publishedAt: '2026-08-03T15:00:00Z',
          },
        ],
        socialLinks: [
          { platform: 'Instagram' as const, href: 'https://instagram.example.invalid/blue-finch' },
          { platform: 'Facebook' as const, href: 'https://facebook.example.invalid/blue-finch' },
        ],
      }
    : {}),
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
    return { stores, asOfUtc: '2026-08-05T15:00:00Z' }
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
      asOfUtc: '2026-08-05T15:00:00Z',
    }
  },
}
