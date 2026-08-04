import type {
  CatalogClient,
  CatalogFilters,
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
    website: stringOrNull(row.website),
    timeZone: stringOrNull(row.time_zone ?? row.timeZone),
    freshness: parseFreshness(
      row.freshness ?? row.freshness_state,
      row.verified_at ?? row.oldest_verified_at,
    ),
    asOfUtc: stringOrNull(row.as_of_utc),
    hours,
    media: media.map((value) => {
      const item = asRow(value)
      return {
        src: String(item.src ?? item.path ?? item.asset_path ?? ''),
        alt: String(item.alt ?? item.alt_text ?? ''),
        kind: item.kind as 'cover' | 'gallery' | undefined,
      }
    }),
  }
}

function asRow(value: unknown): LooseRow {
  return value && typeof value === 'object' ? (value as LooseRow) : {}
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function parseFreshness(value: unknown, verifiedAt: unknown) {
  if (value && typeof value === 'object') {
    const row = asRow(value)
    return {
      label: String(row.label ?? 'Freshness unavailable'),
      verifiedAt: stringOrNull(row.verified_at ?? row.verifiedAt),
      daysOld: typeof row.days_old === 'number' ? row.days_old : null,
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
      }
    : state
      ? { label: freshnessStateLabel(state), verifiedAt: null, daysOld: null }
      : undefined
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
