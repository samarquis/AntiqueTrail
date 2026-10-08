import type {
  CatalogClient,
  CatalogFilters,
  CatalogNearbySearch,
  CatalogListResult,
  CatalogMapBounds,
  CatalogMapPoint,
  CatalogMapResult,
  CatalogStore,
} from './types'

export const MAX_BROWSE_MAP_RESULTS = 500
export const MAX_BROWSE_MAP_SPAN_DEGREES = 2

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>
}

export function createCatalogClient(client: RpcClient): CatalogClient {
  return {
    async list(filters: CatalogFilters): Promise<CatalogListResult> {
      const { data, error } = await client.rpc('catalog_list', {
        p_q: filters.q ?? null,
        p_category: filters.category ?? null,
        p_area: filters.area ?? null,
      })
      if (error) throw catalogError(error)
      const payload = Array.isArray(data)
        ? { stores: data }
        : ((data ?? {}) as Record<string, unknown>)
      return {
        stores: ((payload.stores ?? payload.results ?? []) as unknown[]).map(toStore),
        asOfUtc: typeof payload.as_of_utc === 'string' ? payload.as_of_utc : undefined,
      }
    },
    async nearbyList(
      filters: CatalogFilters,
      nearby: CatalogNearbySearch,
    ): Promise<CatalogListResult> {
      if (!validNearbySearch(filters, nearby)) throw new Error('Invalid nearby search')
      const { data, error } = await client.rpc('catalog_list_nearby', {
        p_q: filters.q ?? null,
        p_category: filters.category ?? null,
        p_area: null,
        p_device_latitude: nearby.latitude,
        p_device_longitude: nearby.longitude,
        p_device_radius_miles: nearby.radiusMiles ?? 25,
      })
      if (error) throw catalogError(error)
      const payload = Array.isArray(data)
        ? { stores: data }
        : ((data ?? {}) as Record<string, unknown>)
      return {
        stores: ((payload.stores ?? payload.results ?? []) as unknown[]).map(toStore),
        asOfUtc: typeof payload.as_of_utc === 'string' ? payload.as_of_utc : undefined,
      }
    },
    async details(slug: string): Promise<CatalogStore | null> {
      const { data, error } = await client.rpc('catalog_details', { p_slug: slug })
      if (error) {
        if (error.code === 'P0002' || error.code === 'NOT_FOUND') return null
        throw catalogError(error)
      }
      if (data == null || (Array.isArray(data) && data.length === 0)) return null
      return toStore(Array.isArray(data) ? data[0] : data)
    },
    async map(
      filters: CatalogFilters,
      bounds: CatalogMapBounds,
      zoom: number,
    ): Promise<CatalogMapResult> {
      if (!validMapBounds(bounds) || !Number.isInteger(zoom) || zoom < 0 || zoom > 22)
        throw new Error('Invalid map viewport.')
      const { data, error } = await client.rpc('get_browse_map_v2', {
        p_q: filters.q ?? null,
        p_category: filters.category ?? null,
        p_area: filters.area ?? null,
        p_open_now: filters.openNow ?? null,
        p_visited: filters.visited ?? null,
        p_saved: filters.saved ?? null,
        p_claimed: filters.claimed ?? null,
        p_max_area_centroid_miles: filters.maxAreaCentroidMiles ?? null,
        p_state: filters.state ?? null,
        p_north: bounds.north,
        p_south: bounds.south,
        p_east: bounds.east,
        p_west: bounds.west,
        p_zoom: zoom,
        p_limit: MAX_BROWSE_MAP_RESULTS,
      })
      if (error) throw catalogError(error)
      const payload = Array.isArray(data) ? { points: data } : asRow(data)
      const rawPoints = asArray(payload.points ?? payload.results)
      if (rawPoints.length > MAX_BROWSE_MAP_RESULTS) throw new Error('Invalid map response.')
      const points = rawPoints.map((value) => toMapPoint(value, bounds))
      if (new Set(points.map((point) => point.storeId)).size !== points.length)
        throw new Error('Invalid map response.')
      return {
        points,
        asOfUtc: stringOrNull(payload.as_of_utc),
      }
    },
  }
}

function validNearbySearch(filters: unknown, nearby: unknown): nearby is CatalogNearbySearch {
  if (
    !filters ||
    typeof filters !== 'object' ||
    Array.isArray(filters) ||
    !nearby ||
    typeof nearby !== 'object' ||
    Array.isArray(nearby)
  )
    return false
  const search = nearby as CatalogNearbySearch
  return (
    typeof search.latitude === 'number' &&
    Number.isFinite(search.latitude) &&
    search.latitude >= -90 &&
    search.latitude <= 90 &&
    typeof search.longitude === 'number' &&
    Number.isFinite(search.longitude) &&
    search.longitude >= -180 &&
    search.longitude <= 180 &&
    (search.radiusMiles === undefined ||
      search.radiusMiles === 5 ||
      search.radiusMiles === 10 ||
      search.radiusMiles === 25 ||
      search.radiusMiles === 50)
  )
}

export function validMapBounds(bounds: CatalogMapBounds): boolean {
  const values = [bounds.north, bounds.south, bounds.east, bounds.west]
  return (
    values.every(Number.isFinite) &&
    bounds.north <= 90 &&
    bounds.south >= -90 &&
    bounds.east <= 180 &&
    bounds.west >= -180 &&
    bounds.north > bounds.south &&
    bounds.east > bounds.west &&
    bounds.north - bounds.south <= MAX_BROWSE_MAP_SPAN_DEGREES &&
    bounds.east - bounds.west <= MAX_BROWSE_MAP_SPAN_DEGREES
  )
}

function toMapPoint(value: unknown, bounds: CatalogMapBounds): CatalogMapPoint {
  const row = asRow(value)
  const latitude = Number(row.latitude)
  const longitude = Number(row.longitude)
  const point: CatalogMapPoint = {
    storeId: String(row.store_id ?? row.storeId ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    latitude,
    longitude,
    store: toStore(row),
    rating:
      typeof row.rating === 'number' ? row.rating : row.rating == null ? null : Number(row.rating),
    ratingCount: Number(row.rating_count ?? row.ratingCount ?? 0),
    hoursLabel: String(row.hours_label ?? row.hoursLabel ?? 'Hours unavailable'),
    openState:
      row.open_state === 'open' || row.open_state === 'closed' ? row.open_state : 'unavailable',
    categoryLabel: String(row.category_label ?? row.categoryLabel ?? 'Uncategorized'),
    distanceMiles: Number(row.distance_miles ?? row.distanceMiles ?? 0),
    claimed: Boolean(row.claimed),
    saved: typeof row.saved === 'boolean' ? row.saved : null,
    visited: typeof row.visited === 'boolean' ? row.visited : null,
  }
  if (
    !point.storeId ||
    !point.slug ||
    !point.name ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(point.ratingCount) ||
    !Number.isFinite(point.distanceMiles) ||
    latitude < bounds.south ||
    latitude > bounds.north ||
    longitude < bounds.west ||
    longitude > bounds.east
  )
    throw new Error('Invalid map response.')
  return point
}

function catalogError(error: { message?: string; code?: string }): Error & { code?: string } {
  const result = new Error(
    error.code === 'catalog_too_large'
      ? 'Too many stores matched. Please refine your search.'
      : error.message || 'Catalog unavailable. Please try again.',
  ) as Error & { code?: string }
  result.code = error.code
  return result
}

type LooseRow = Record<string, unknown>

function toStore(value: unknown): CatalogStore {
  const row = asRow(value)
  const area = asRow(row.area ?? { slug: row.area_slug, label: row.area_label })
  const categories = asArray(row.categories ?? row.category_labels)
  const media = asArray(row.media)
  const hours = mapHours(row)
  return {
    id: String(row.id ?? row.store_id ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    town: String(row.town ?? row.city ?? ''),
    state: String(row.state ?? row.state_code ?? ''),
    address: String(row.address ?? ''),
    area: { slug: String(area.slug ?? ''), label: String(area.label ?? '') },
    categories: categories.map((item) => {
      const category = asRow(item)
      return typeof item === 'string'
        ? { slug: item, label: item }
        : {
            slug: String(category.slug ?? ''),
            label: String(category.label ?? category.name ?? ''),
          }
    }),
    summary: stringOrNull(row.summary),
    description: stringOrNull(row.description),
    phone: stringOrNull(row.phone),
    email:
      typeof row.email === 'string' &&
      !/\s/.test(row.email) &&
      /^[A-Za-z0-9_+-]+(?:\.[A-Za-z0-9_+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(
        row.email,
      )
        ? row.email
        : null,
    website: stringOrNull(row.website),
    timeZone: stringOrNull(row.timezone_name ?? row.time_zone ?? row.timeZone),
    freshness: parseFreshness(
      row.freshness ?? row.freshness_state,
      row.verified_at ?? row.oldest_verified_at,
    ),
    asOfUtc: stringOrNull(row.as_of_utc),
    provenance: mapProvenance(row.provenance),
    accessibility: mapAccessibility(row.accessibility),
    socialLinks: asArray(row.socialLinks).flatMap((value) => {
      const link = asRow(value)
      return link.platform === 'Facebook' &&
        link.href === 'https://www.facebook.com/TheMarketatMacvicar2307/'
        ? [{ platform: 'Facebook' as const, href: link.href }]
        : []
    }),
    hoursExceptions: asArray(row.hoursExceptions).flatMap(mapHoursException),
    updates: asArray(row.updates).flatMap(mapUpdate),
    hours,
    media: media.flatMap((value) => {
      const item = asRow(value)
      const src = publicUrlOrNull(item.src ?? item.path ?? item.asset_path)
      const alt = item.alt ?? item.alt_text ?? ''
      if (
        !src ||
        typeof alt !== 'string' ||
        (item.kind != null && item.kind !== 'cover' && item.kind !== 'gallery')
      )
        return []
      return [
        {
          src,
          alt,
          ...(item.kind === 'cover' || item.kind === 'gallery' ? { kind: item.kind } : {}),
          ...(typeof item.caption === 'string' ? { caption: item.caption } : {}),
          ...(typeof item.rightsLabel === 'string' ? { rightsLabel: item.rightsLabel } : {}),
        },
      ]
    }),
  }
}

function asRow(value: unknown): LooseRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRow) : {}
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function dateOrNull(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(
      value,
    )
  )
    return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(Date.parse(value)) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice(0, 10)
    ? value
    : null
}
function publicUrlOrNull(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !value ||
    /[\s\\]/.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? value : null
  } catch {
    return null
  }
}
function mapHoursException(value: unknown): NonNullable<CatalogStore['hoursExceptions']> {
  const row = asRow(value)
  if (
    typeof row.date !== 'string' ||
    row.date.length !== 10 ||
    !dateOrNull(row.date) ||
    typeof row.label !== 'string' ||
    !row.label.trim() ||
    (row.status !== 'open' && row.status !== 'closed' && row.status !== 'unavailable') ||
    !Array.isArray(row.intervals)
  )
    return []
  const intervals = row.intervals.flatMap((value) => {
    const interval = asRow(value)
    return typeof interval.opensAt === 'string' &&
      typeof interval.closesAt === 'string' &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.opensAt) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.closesAt) &&
      interval.opensAt < interval.closesAt
      ? [{ opensAt: interval.opensAt, closesAt: interval.closesAt }]
      : []
  })
  if (
    intervals.length !== row.intervals.length ||
    (row.status === 'open' ? !intervals.length : !!intervals.length)
  )
    return []
  return [
    {
      date: row.date,
      label: row.label,
      status: row.status,
      intervals,
      note: stringOrNull(row.note),
    },
  ]
}
function mapUpdate(value: unknown): NonNullable<CatalogStore['updates']> {
  const row = asRow(value)
  const publishedAt = dateOrNull(row.publishedAt)
  if (
    typeof row.id !== 'string' ||
    !row.id.trim() ||
    typeof row.title !== 'string' ||
    !row.title.trim() ||
    typeof row.body !== 'string' ||
    !publishedAt
  )
    return []
  return [
    { id: row.id, title: row.title, body: row.body, publishedAt, href: publicUrlOrNull(row.href) },
  ]
}
function mapProvenance(value: unknown): CatalogStore['provenance'] {
  const row = asRow(value)
  return typeof row.sourceLabel === 'string' && row.sourceLabel.trim()
    ? {
        sourceLabel: row.sourceLabel,
        updatedAt: dateOrNull(row.updatedAt),
        note: stringOrNull(row.note),
      }
    : undefined
}
function mapAccessibility(value: unknown): CatalogStore['accessibility'] {
  const row = asRow(value)
  return row.status === 'verified' || row.status === 'unverified' || row.status === 'unavailable'
    ? {
        status: row.status,
        details: asArray(row.details).filter(
          (detail): detail is string => typeof detail === 'string',
        ),
        verifiedAt: dateOrNull(row.verifiedAt),
      }
    : undefined
}
function parseFreshness(value: unknown, verifiedAt: unknown) {
  if (value && typeof value === 'object') {
    const row = asRow(value)
    const state = String(row.status ?? row.state ?? row.freshness_state ?? '')
    return {
      label: String(row.label ?? 'Freshness unavailable'),
      verifiedAt: stringOrNull(row.verified_at ?? row.verifiedAt),
      daysOld: typeof row.days_old === 'number' ? row.days_old : null,
      status: catalogFreshnessStatus(state),
    }
  }
  const state = typeof value === 'string' ? value : undefined
  return typeof verifiedAt === 'string'
    ? {
        label: state
          ? freshnessStateLabel(state)
          : `Verified ${new Date(verifiedAt).toLocaleDateString()}`,
        verifiedAt,
        daysOld: null,
        status: state ? catalogFreshnessStatus(state) : undefined,
      }
    : state
      ? {
          label: freshnessStateLabel(state),
          verifiedAt: null,
          daysOld: null,
          status: catalogFreshnessStatus(state),
        }
      : undefined
}

function catalogFreshnessStatus(state: string): 'current' | 'stale' | 'unknown' {
  if (state === 'current') return 'current'
  if (state === 'overdue' || state === 'stale') return 'stale'
  return 'unknown'
}

function freshnessStateLabel(state: string) {
  return state === 'current'
    ? 'Verified recently'
    : state === 'overdue'
      ? 'Verification overdue'
      : 'Freshness unavailable'
}

function mapHours(row: LooseRow): CatalogStore['hours'] {
  const raw = row.hours ?? row.weekly_hours ?? row.today_hours
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const today = asRow(raw)
    const weekday = Number(today.weekday ?? 1)
    return [
      {
        weekday,
        label: displayDay(weekday),
        status:
          row.hours_state === 'unavailable' || today.hours_state === 'unavailable'
            ? 'unavailable'
            : today.is_closed
              ? 'closed'
              : 'open',
        intervals: asArray(today.intervals).map((value) => {
          const interval = asRow(value)
          return {
            opensAt: String(interval.opens_at ?? ''),
            closesAt: String(interval.closes_at ?? ''),
          }
        }),
      },
    ]
  }
  const grouped = new Map<
    number,
    { closed: boolean; intervals: Array<{ opensAt: string; closesAt: string }> }
  >()
  for (const value of asArray(raw)) {
    const item = asRow(value)
    const weekday = Number(item.weekday ?? item.iso_weekday ?? 0)
    if (!weekday) continue
    const existing = grouped.get(weekday) ?? { closed: Boolean(item.is_closed), intervals: [] }
    if (!item.is_closed && item.opens_at && item.closes_at)
      existing.intervals.push({ opensAt: String(item.opens_at), closesAt: String(item.closes_at) })
    grouped.set(weekday, existing)
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, day]) => ({
      weekday,
      label: displayDay(weekday),
      status: day.closed ? 'closed' : day.intervals.length ? 'open' : 'unavailable',
      intervals: day.intervals,
    }))
}

function displayDay(weekday: number) {
  return (
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekday - 1] ??
    'Day'
  )
}
