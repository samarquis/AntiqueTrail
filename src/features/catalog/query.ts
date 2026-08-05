import type { CatalogFilters, CatalogHoursDay, CatalogHoursStatus, CatalogStore } from './types'

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
  const visited = params.get('visited')
  const distance = Number(params.get('distance'))
  const state = trimUnicode(params.get('state') ?? '').toUpperCase()
  return {
    ...(q ? { q } : {}),
    ...(category && SLUG_RE.test(category) ? { category } : {}),
    ...(area && SLUG_RE.test(area) ? { area } : {}),
    ...(params.get('openNow') === '1' ? { openNow: true } : {}),
    ...(visited === 'visited' || visited === 'unvisited' ? { visited } : {}),
    ...(params.get('saved') === '1' ? { saved: true } : {}),
    ...(params.get('claimed') === '1' ? { claimed: true } : {}),
    ...(Number.isFinite(distance) && distance >= 1 && distance <= 500
      ? { maxAreaCentroidMiles: distance }
      : {}),
    ...(state.match(/^[A-Z]{2}$/) ? { state } : {}),
  }
}

export function queryParams(filters: CatalogFilters): URLSearchParams {
  const result = new URLSearchParams()
  if (filters.q) result.set('q', trimUnicode(filters.q).slice(0, MAX_QUERY_LENGTH))
  if (filters.category && SLUG_RE.test(filters.category)) result.set('category', filters.category)
  if (filters.area && SLUG_RE.test(filters.area)) result.set('area', filters.area)
  if (filters.openNow) result.set('openNow', '1')
  if (filters.visited) result.set('visited', filters.visited)
  if (filters.saved) result.set('saved', '1')
  if (filters.claimed) result.set('claimed', '1')
  if (filters.maxAreaCentroidMiles) result.set('distance', String(filters.maxAreaCentroidMiles))
  if (filters.state?.match(/^[A-Z]{2}$/)) result.set('state', filters.state)
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

export interface TodayHoursSummary {
  dayLabel: string
  hoursLabel: string
  openState: CatalogHoursStatus
  openStateLabel: string
}

/**
 * Formats the card's current-day hours from the catalog's own reference time.
 * Production responses provide `asOfUtc`; using it avoids making stale cached
 * records look current merely because the shopper's clock moved forward.
 */
export function todayHoursSummary(store: CatalogStore, now = new Date()): TodayHoursSummary {
  const reference = store.asOfUtc ? new Date(store.asOfUtc) : now
  const safeReference = Number.isNaN(reference.getTime()) ? now : reference
  const zoned = zonedDateParts(safeReference, store.timeZone)
  const weekday = zoned.weekday
  const today = store.hours.find((day) => day.weekday === weekday)
  const dayLabel = today?.label || displayDayLabel(weekday)

  if (!today || today.status === 'unavailable' || !today.intervals.length) {
    return {
      dayLabel,
      hoursLabel: 'Hours unavailable',
      openState: 'unavailable',
      openStateLabel: 'Open state unavailable',
    }
  }
  if (today.status === 'closed') {
    return { dayLabel, hoursLabel: 'Closed', openState: 'closed', openStateLabel: 'Closed today' }
  }

  const minuteOfDay = zoned.hour * 60 + zoned.minute
  const isOpen = today.intervals.some(({ opensAt, closesAt }) => {
    const opens = minutesFromTime(opensAt)
    const closes = minutesFromTime(closesAt)
    return opens != null && closes != null && minuteOfDay >= opens && minuteOfDay < closes
  })
  return {
    dayLabel,
    hoursLabel: formatHours(today),
    openState: isOpen ? 'open' : 'closed',
    openStateLabel: isOpen ? 'Open now' : 'Closed now',
  }
}

function minutesFromTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

function zonedDateParts(date: Date, timeZone?: string | null) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const weekdayName = parts.find((part) => part.type === 'weekday')?.value
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayName ?? '') + 1
    return {
      weekday: weekday || ((date.getUTCDay() + 6) % 7) + 1,
      hour: Number(parts.find((part) => part.type === 'hour')?.value ?? date.getUTCHours()),
      minute: Number(parts.find((part) => part.type === 'minute')?.value ?? date.getUTCMinutes()),
    }
  } catch {
    return {
      weekday: ((date.getUTCDay() + 6) % 7) + 1,
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    }
  }
}
