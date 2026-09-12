import fixtureMedia from './fixtureMedia.json'
import type {
  CatalogClient,
  CatalogFilters,
  CatalogListResult,
  CatalogMapPoint,
  CatalogMedia,
  CatalogStore,
} from './types'

const syntheticImageRoot = `${import.meta.env.BASE_URL}images/synthetic-stores/1280w`
const syntheticFixtureRoot = `${import.meta.env.BASE_URL}images/synthetic-fixtures`
const generatedRights = 'OpenAI-generated fictional image · Internal Alpha only'
const evaluationFixtureLabel =
  'Synthetic wall-evaluation fixture · Internal only · Generated template art, not a real store listing'

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

const storeCopy = [
  {
    summary: 'Lamp-lit rooms pair blue-and-white ceramics with small chests and walnut furniture.',
    description:
      'An antique-mall-style collection of ceramic lighting, brass accents, glassware, small chests, and walnut furniture arranged in room-like displays.',
    coverCaption:
      'Blue-painted brick storefront with lamps, ceramics, and small chests displayed in the windows.',
  },
  {
    summary: 'Warm wood furniture and brass candlesticks shape a compact vintage storefront.',
    description:
      'A vintage-focused setting built around a walnut cabinet, brass candlesticks, and the warm cedar-and-brick character shown in the storefront image.',
    coverCaption:
      'Cedar-clad storefront with a walnut cabinet and brass candlesticks in the display window.',
  },
  {
    summary: 'Pottery and framed art fill a light storefront shaded by a broad elm tree.',
    description:
      'An antique-mall-style mix of pottery and framed art presented in a cream-brick storefront with a leafy, neighborhood-shop feel.',
    coverCaption:
      'Cream brick storefront beneath an elm tree, with pottery and framed art in the windows.',
  },
  {
    summary: 'Porch displays give this green bungalow-style vintage shop a relaxed garden setting.',
    description:
      'A vintage browsing setting arranged around a deep green craftsman storefront, porch displays, and native flowers rather than a conventional retail facade.',
    coverCaption:
      'Deep green craftsman storefront with porch displays and native flowers along the walk.',
  },
  {
    summary: 'A glowing lantern leads into a stone corner display of antique furniture.',
    description:
      'An antique-mall-style furniture display framed by stone walls, maple-red trim, and the warm light of a prominent entry lantern.',
    coverCaption:
      'Stone corner storefront with red trim, a glowing entry lantern, and antique furniture on display.',
  },
  {
    summary:
      'Travel trunks, maps, and wooden chairs give this vintage storefront an explorer theme.',
    description:
      'A vintage collection centered on travel trunks, maps, and wooden seating, presented behind a cream masonry facade with navy trim.',
    coverCaption:
      'Cream masonry storefront with navy trim and window displays of trunks, maps, and wooden chairs.',
  },
  {
    summary: 'Oak cabinets and woven rugs anchor broad windows inspired by prairie interiors.',
    description:
      'An antique-mall-style furniture setting where oak cabinetry and woven rugs are the main visual themes behind wide buff-brick storefront windows.',
    coverCaption:
      'Buff brick storefront with broad windows displaying oak cabinets and woven rugs.',
  },
  {
    summary: 'Colorful quilts brighten a rose-red vintage storefront beneath a flowering redbud.',
    description:
      'A vintage textile setting focused on quilts, with a rose-red brick facade and blooming redbud giving the storefront its distinct identity.',
    coverCaption:
      'Rose-red brick storefront beneath a blooming redbud tree, with quilts filling the windows.',
  },
  {
    summary: 'Salvaged furniture meets bright sunflower planters in an industrial-style setting.',
    description:
      'An antique-mall-style assortment of salvaged furniture presented against white industrial brick, a mustard-colored door, and sunflower planters.',
    coverCaption:
      'White industrial-brick storefront with a mustard door, sunflower planters, and salvaged furniture.',
  },
  {
    summary:
      'Pottery and quilts sit behind tall grasses in a warm, understated vintage storefront.',
    description:
      'A vintage mix of pottery and quilts displayed in a tan-brick setting framed by native-grass planters and soft natural textures.',
    coverCaption:
      'Tan brick storefront framed by tall grasses, with pottery and quilts in the display windows.',
  },
  {
    summary:
      'Railway arches frame travel trunks, clocks, and vintage chairs in a reused station setting.',
    description:
      'An antique-mall-style collection of travel trunks, clocks, and vintage chairs presented beneath brick railway arches and teal doors.',
    coverCaption:
      'Reused railway storefront with brick arches, teal doors, trunks, clocks, and vintage chairs.',
  },
  {
    summary: 'Baskets, botanical art, and chairs create a gentle vintage display beside the creek.',
    description:
      'A vintage collection of woven baskets, botanical art, and seating shown in a willow-green storefront with a quiet creekside setting.',
    coverCaption:
      'Willow-green creekside storefront displaying baskets, botanical art, and chairs.',
  },
]

const fixtureGalleryBySlug = new Map<string, CatalogMedia[]>()
for (const record of fixtureMedia.records) {
  const gallery = fixtureGalleryBySlug.get(record.slug) ?? []
  gallery.push({
    src: `${syntheticFixtureRoot}/${record.slug}/${record.file}`,
    alt: record.alt,
    kind: 'gallery',
    caption: record.caption,
    rightsLabel: record.rightsLabel,
  })
  fixtureGalleryBySlug.set(record.slug, gallery)
}

const syntheticMedia: CatalogMedia[][] = names.map((name, index) => {
  const media: CatalogMedia[] = [
    {
      src: `${syntheticImageRoot}/${coverImageSlugs[index]}-cover.webp`,
      alt: coverAltText[index],
      kind: 'cover',
      caption: storeCopy[index].coverCaption,
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

  const slug = coverImageSlugs[index]
  media.push(...(fixtureGalleryBySlug.get(slug) ?? []))

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
  summary: storeCopy[index].summary,
  description: storeCopy[index].description,
  timeZone: 'America/Chicago',
  freshness:
    index === 0
      ? {
          label: 'Verified for Synthetic testing',
          verifiedAt: '2026-08-01T15:00:00Z',
          daysOld: 4,
          status: 'current',
        }
      : index === 1
        ? {
            label: 'Verification overdue',
            verifiedAt: '2026-02-01T15:00:00Z',
            daysOld: 192,
            status: 'stale',
          }
        : { label: 'Verified for Synthetic testing', daysOld: 0 },
  asOfUtc: '2026-08-12T15:00:00Z',
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
  fixtureProfile: { label: evaluationFixtureLabel },
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
          {
            id: 'blue-finch-update-3',
            title: 'New finds in the back room',
            body: 'A fresh delivery of vintage maps and travel posters arrived this week.',
            publishedAt: '2026-08-06T15:00:00Z',
          },
          {
            id: 'blue-finch-update-4',
            title: 'Saturday pop-up restock',
            body: 'Look for a small pop-up table of restored hardware and kitchen wares on Saturday.',
            publishedAt: '2026-08-09T15:00:00Z',
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
