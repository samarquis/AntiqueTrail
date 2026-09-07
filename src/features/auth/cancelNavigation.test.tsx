import { describe, expect, it } from 'vitest'
import { safeCancelTarget } from './components'

describe('safe auth cancellation targets', () => {
  it('returns a public store for private store actions and Browse for protected routes', () => {
    expect(safeCancelTarget('/stores/oak/memory')).toBe('/stores/oak')
    expect(safeCancelTarget('/stores/oak/correction')).toBe('/stores/oak')
    expect(safeCancelTarget('/trips/trip-1')).toBe('/stores')
    expect(safeCancelTarget('https://example.com')).toBe('/stores')
  })
})
