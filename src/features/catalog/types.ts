export type CatalogHoursStatus = 'open' | 'closed' | 'unavailable'

export interface CatalogHoursDay {
  weekday: number
  label: string
  status: CatalogHoursStatus
  intervals: Array<{ opensAt: string; closesAt: string }>
}

export interface CatalogHoursException {
  date: string
  label: string
  status: CatalogHoursStatus
  intervals: Array<{ opensAt: string; closesAt: string }>
  note?: string | null
}

export interface CatalogMedia {
  src: string
  alt: string
  kind?: 'cover' | 'gallery'
  caption?: string | null
  rightsLabel?: string | null
}

export interface CatalogUpdate {
  id: string
  title: string
  body: string
  publishedAt: string
  href?: string | null
}

export interface CatalogSocialLink {
  platform: 'Facebook' | 'Instagram' | 'YouTube' | 'Pinterest' | 'TikTok'
  href: string
}

export interface CatalogStore {
  id: string
  slug: string
  name: string
  town: string
  state: string
  address: string
  area: { slug: string; label: string }
  categories: Array<{ slug: string; label: string }>
  summary?: string | null
  description?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  navigationHref?: string | null
  timeZone?: string | null
  freshness?: {
    label: string
    verifiedAt?: string | null
    daysOld?: number | null
    status?: 'current' | 'stale' | 'unknown'
  }
  provenance?: { sourceLabel: string; updatedAt?: string | null; note?: string | null }
  accessibility?: {
    status: 'verified' | 'unverified' | 'unavailable'
    details: string[]
    verifiedAt?: string | null
  }
  updates?: CatalogUpdate[]
  socialLinks?: CatalogSocialLink[]
  hoursExceptions?: CatalogHoursException[]
  asOfUtc?: string | null
  hours: CatalogHoursDay[]
  media: CatalogMedia[]
}

export interface CatalogFilters {
  q?: string
  category?: string
  area?: string
  openNow?: boolean
  visited?: 'visited' | 'unvisited'
  saved?: boolean
  claimed?: boolean
  maxAreaCentroidMiles?: number
  state?: string
}

/** Controls which progressively delivered Browse filters are visible. */
export type CatalogBrowseStage = 'package-1' | 'package-3' | 'package-5b' | 'package-10a'

/** Store Details actions are revealed only after their backing flow is executable. */
export type CatalogDetailsStage = 'package-1' | 'package-3' | 'package-5a' | 'package-10a'

export interface CatalogListResult {
  stores: CatalogStore[]
  asOfUtc?: string | null
}

export interface CatalogMapBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface CatalogMapPoint {
  storeId: string
  slug: string
  name: string
  latitude: number
  longitude: number
  store: CatalogStore
  rating: number | null
  ratingCount: number
  hoursLabel: string
  openState: CatalogHoursStatus
  categoryLabel: string
  distanceMiles: number
  claimed: boolean
  saved: boolean | null
  visited: boolean | null
}

/** Public coordinates are the only data handed to the map provider adapter. */
export type CatalogProviderMapPoint = Pick<
  CatalogMapPoint,
  'storeId' | 'slug' | 'name' | 'latitude' | 'longitude'
>

export interface CatalogMapResult {
  points: CatalogMapPoint[]
  asOfUtc?: string | null
}

export type CatalogMapCapability = 'blocked' | 'available' | 'unavailable'

export interface CatalogMapCluster {
  bounds: CatalogMapBounds
  label: string
}

export interface CatalogMapRenderInput {
  points: CatalogProviderMapPoint[]
  searchedBounds: CatalogMapBounds
  pendingBounds: CatalogMapBounds
  searchedZoom: number
  pendingZoom: number
  selectedStoreId?: string
  previewStore?: CatalogStore
  onBoundsChange: (bounds: CatalogMapBounds) => void
  onZoomChange: (zoom: number) => void
  onClusterZoom: (cluster: CatalogMapCluster) => void
  onPreview: (storeId: string) => void
  onSelect: (storeId: string) => void
}

export interface CatalogMapAdapter {
  capability: CatalogMapCapability
  bounds?: CatalogMapBounds
  zoom?: number
  attribution?: string
  navigationHref?: (point: CatalogProviderMapPoint) => string
  render?: (input: CatalogMapRenderInput) => import('react').ReactNode
}

export type CatalogErrorCode = 'catalog_too_large' | 'not_found' | 'network' | 'unknown'

export interface CatalogError {
  code: CatalogErrorCode
  message: string
  retryable: boolean
}

export interface CatalogClient {
  list(filters: CatalogFilters): Promise<CatalogListResult>
  details(slug: string): Promise<CatalogStore | null>
  map?(filters: CatalogFilters, bounds: CatalogMapBounds, zoom: number): Promise<CatalogMapResult>
}
