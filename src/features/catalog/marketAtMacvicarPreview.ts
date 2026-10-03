import galleryWall from '../../../docs/plans/market-at-macvicar/gallery-wall.json'
import type { CatalogHoursDay, CatalogMedia, CatalogStore } from './types'

const previewSlug = galleryWall.storeSlug

const photoUrl = (photoId: string) => `http://127.0.0.1:5981/photos/${photoId}.webp`
const closed = (weekday: number, label: string): CatalogHoursDay => ({
  weekday,
  label,
  status: 'closed',
  intervals: [],
})
const open = (weekday: number, label: string, closesAt: string): CatalogHoursDay => ({
  weekday,
  label,
  status: 'open',
  intervals: [{ opensAt: '10:00', closesAt }],
})

const media: CatalogMedia[] = [
  {
    src: photoUrl(galleryWall.cover.photoId),
    alt: galleryWall.cover.alt,
    kind: 'cover',
    caption: galleryWall.cover.caption,
    rightsLabel: galleryWall.cover.rightsLabel,
  },
  ...galleryWall.gallery.map((photo) => ({
    src: photoUrl(photo.photoId),
    alt: photo.alt,
    kind: 'gallery' as const,
    caption: photo.caption,
    rightsLabel: photo.rightsLabel,
  })),
]

const categoryLabels = [
  'Antiques',
  'Vintage',
  'Rustic',
  'Collectibles',
  'Gifts',
  'Home Accents',
  'Handcrafted',
  'Accessories',
  'Handbags',
  'Jewelry',
  'Furniture',
]

export const marketAtMacvicarPreviewStore: CatalogStore = {
  id: 'local-preview:market-at-macvicar',
  slug: previewSlug,
  name: 'The Market at Macvicar',
  town: 'Topeka',
  state: 'KS',
  address: '2307 SW 10th Ave',
  area: { slug: 'topeka', label: 'Topeka' },
  categories: categoryLabels.map((label) => ({
    slug: label.toLowerCase().replaceAll(' ', '-'),
    label,
  })),
  summary: 'A Vintage Boutique with more than 50 little shops in Topeka.',
  description:
    'Explore a vintage boutique with more than 50 little shops offering antiques, collectibles, rustic decor, furniture, gifts, handcrafted goods, jewelry, handbags, and home accents. Find The Market at Macvicar at the corner of SW 10th Avenue and Macvicar in Topeka.',
  phone: '(785) 409-4277',
  email: 'themarketatmacvicar2307@gmail.com',
  timeZone: 'America/Chicago',
  freshness: {
    label: 'Business information checked October 3, 2026',
    verifiedAt: '2026-10-03',
    status: 'current',
  },
  provenance: {
    sourceLabel: 'Official Facebook profile; user-confirmed hours',
    updatedAt: '2026-10-03',
    note: 'Hours confirmed by the user on October 3, 2026. Gallery images show examples and may not reflect current inventory. The cover is an official Facebook photo dated October 21, 2017; it shows the front windows only.',
  },
  asOfUtc: new Date().toISOString(),
  accessibility: {
    status: 'unverified',
    details: ['Entry and other accessibility details have not been verified.'],
  },
  updates: [],
  socialLinks: [
    { platform: 'Facebook', href: 'https://www.facebook.com/TheMarketatMacvicar2307/' },
  ],
  hoursExceptions: [],
  hours: [
    closed(1, 'Monday'),
    open(2, 'Tuesday', '17:00'),
    open(3, 'Wednesday', '17:00'),
    open(4, 'Thursday', '17:00'),
    open(5, 'Friday', '17:00'),
    open(6, 'Saturday', '16:00'),
    closed(7, 'Sunday'),
  ],
  media,
}
