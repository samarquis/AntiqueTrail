import { describe, expect, it } from 'vitest'
import { canonicalQueryString, formatHours, normalizeQueryParams } from './query'

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
})
