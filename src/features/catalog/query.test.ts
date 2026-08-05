import { describe, expect, it } from 'vitest'
import { canonicalQueryString, formatHours, normalizeQueryParams, todayHoursSummary } from './query'
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
      openState: 'closed',
      openStateLabel: 'Closed now',
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
})
