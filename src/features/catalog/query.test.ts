import { describe, expect, it } from 'vitest'
import {
  canonicalQueryString,
  externalNavigationHref,
  formatCatalogDate,
  formatHours,
  normalizeQueryParams,
  todayHoursSummary,
} from './query'
import { syntheticStores } from './demoClient'

describe('catalog query normalization', () => {
  it('keeps the first value, trims text, and removes malformed slugs', () => {
    expect(
      normalizeQueryParams('q=%20oak%20%20mall%20&q=ignored&category=Vintage&area=bad_slug'),
    ).toEqual({ q: 'oak mall', category: 'vintage' })
  })

  it('caps long queries and emits canonical params', () => {
    const filters = normalizeQueryParams(`q=${'x'.repeat(120)}&area=topeka-ks`)
    expect(filters.q).toHaveLength(100)
    expect(canonicalQueryString(filters)).toBe(`?q=${'x'.repeat(100)}&area=topeka-ks`)
  })

  it('round-trips the complete server-side map filter set', () => {
    const filters = normalizeQueryParams(
      '?openNow=1&visited=unvisited&saved=1&claimed=1&distance=25&state=ks',
    )
    expect(filters).toEqual({
      openNow: true,
      visited: 'unvisited',
      saved: true,
      claimed: true,
      maxAreaCentroidMiles: 25,
      state: 'KS',
    })
    expect(canonicalQueryString(filters)).toBe(
      '?openNow=1&visited=unvisited&saved=1&claimed=1&distance=25&state=KS',
    )
  })
})

describe('hours formatter', () => {
  it('never guesses when hours are unavailable', () => {
    expect(formatHours({ weekday: 1, label: 'Monday', status: 'unavailable', intervals: [] })).toBe(
      'Hours unavailable',
    )
    expect(formatHours({ weekday: 1, label: 'Monday', status: 'closed', intervals: [] })).toBe(
      'Closed',
    )
    expect(
      formatHours({
        weekday: 1,
        label: 'Monday',
        status: 'open',
        intervals: [{ opensAt: '09:00', closesAt: '17:30' }],
      }),
    ).toBe('9:00 AM–5:30 PM')
  })

  it('derives today hours and open state in the store time zone', () => {
    expect(todayHoursSummary(syntheticStores[0])).toEqual({
      dayLabel: 'Wednesday',
      hoursLabel: '10:00 AM–6:00 PM',
      openState: 'open',
      openStateLabel: 'Open now',
    })

    expect(
      todayHoursSummary({ ...syntheticStores[0], asOfUtc: '2026-01-01T18:00:00Z' }),
    ).toMatchObject({ openState: 'open', openStateLabel: 'Open now' })
  })

  it('does not infer an open state from missing current-day hours', () => {
    expect(todayHoursSummary({ ...syntheticStores[0], hours: [] })).toMatchObject({
      hoursLabel: 'Hours unavailable',
      openState: 'unavailable',
      openStateLabel: 'Open state unavailable',
    })
  })

  it('uses date-specific exceptions instead of the weekly schedule', () => {
    expect(
      todayHoursSummary({
        ...syntheticStores[0],
        asOfUtc: '2026-01-01T18:00:00Z',
        hoursExceptions: [
          {
            date: '2026-01-01',
            label: "New Year's Day",
            status: 'closed',
            intervals: [],
          },
        ],
      }),
    ).toEqual({
      dayLabel: "New Year's Day",
      hoursLabel: 'Closed',
      openState: 'closed',
      openStateLabel: 'Closed today',
    })
  })

  it('formats trustworthy dates and encodes a complete external map destination', () => {
    expect(formatCatalogDate('2026-08-05T11:00:00Z')).toBe('August 5, 2026')
    expect(formatCatalogDate('not-a-date')).toBeNull()
    const href = externalNavigationHref(syntheticStores[0])
    expect(href).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//)
    expect(decodeURIComponent(href)).toContain(syntheticStores[0].address)
  })
})
