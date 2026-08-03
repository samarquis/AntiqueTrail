import type { CatalogFilters, CatalogHoursDay, CatalogStore } from './types'

const MAX_QUERY_LENGTH = 100
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const trimUnicode = (value: string) => value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
const removeControlCharacters = (value: string) =>
  [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint > 0x1f && codePoint !== 0x7f
    })
    .join('')

export function normalizeQueryParams(input: URLSearchParams | string): CatalogFilters {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input
  const q = removeControlCharacters(trimUnicode(params.get('q') ?? '')).slice(0, MAX_QUERY_LENGTH)
  const category = trimUnicode(params.get('category') ?? '').toLowerCase()
  const area = trimUnicode(params.get('area') ?? '').toLowerCase()
  return {
    ...(q ? { q } : {}),
    ...(category && SLUG_RE.test(category) ? { category } : {}),
    ...(area && SLUG_RE.test(area) ? { area } : {}),
  }
}

export function queryParams(filters: CatalogFilters): URLSearchParams {
  const result = new URLSearchParams()
  if (filters.q) result.set('q', trimUnicode(filters.q).slice(0, MAX_QUERY_LENGTH))
  if (filters.category && SLUG_RE.test(filters.category)) result.set('category', filters.category)
  if (filters.area && SLUG_RE.test(filters.area)) result.set('area', filters.area)
  return result
}

export function canonicalQueryString(filters: CatalogFilters): string {
  const value = queryParams(filters).toString()
  return value ? `?${value}` : ''
}

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function formatHours(day: CatalogHoursDay): string {
  if (day.status === 'closed') return 'Closed'
  if (day.status === 'unavailable' || !day.intervals.length) return 'Hours unavailable'
  return day.intervals
    .map((interval) => `${formatTime(interval.opensAt)}–${formatTime(interval.closesAt)}`)
    .join(', ')
}

function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  const hour = Number(match[1])
  const minute = match[2]
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${suffix}`
}

export function displayDayLabel(weekday: number): string {
  return days[weekday - 1] ?? 'Day'
}

export function freshnessLabel(store: CatalogStore): string {
  if (store.freshness?.label) return store.freshness.label
  if (store.freshness?.daysOld != null) {
    if (store.freshness.daysOld <= 0) return 'Verified today'
    if (store.freshness.daysOld === 1) return 'Verified yesterday'
    return `Verified ${store.freshness.daysOld} days ago`
  }
  return 'Freshness unavailable'
}
