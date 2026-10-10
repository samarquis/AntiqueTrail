import { describe, expect, it } from 'vitest'
import { isConfiguredLocalShopperReview } from './configuredComposition'

const admitted = {
  supabaseUrl: 'http://127.0.0.1:54321',
  anonKey: 'synthetic-public-anon-key',
  browserOrigin: 'http://127.0.0.1:4173',
  reviewHarness: 'false',
  catalogOnlyPublicTest: false,
}

describe('configured Saved entry provenance', () => {
  it('admits explicit real loopback configuration', () => {
    expect(isConfiguredLocalShopperReview(admitted)).toBe(true)
    expect(
      isConfiguredLocalShopperReview({
        ...admitted,
        supabaseUrl: `${admitted.supabaseUrl}/`,
        browserOrigin: `${admitted.browserOrigin}/`,
      }),
    ).toBe(true)
  })
  it.each([
    { supabaseUrl: null },
    { anonKey: null },
    { anonKey: '' },
    { browserOrigin: null },
    { reviewHarness: undefined },
    { reviewHarness: 'true' },
    { reviewHarness: 'False' },
    { catalogOnlyPublicTest: true },
  ])('denies absent or conflicting configuration %j', (override) => {
    expect(isConfiguredLocalShopperReview({ ...admitted, ...override })).toBe(false)
  })
  it.each([
    'https://127.0.0.1:4173',
    'http://localhost:4173',
    'http://example.invalid:4173',
    'http://127.0.0.2:4173',
    'http://[::1]:4173',
    'http://127.1:4173',
    'http://2130706433:4173',
    'http://0x7f000001:4173',
    'http://127.0.0.1',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
    'http://user:password@127.0.0.1:4173',
    'http://127.0.0.1:4173/path',
    'http://127.0.0.1:4173?token=secret',
    'http://127.0.0.1:4173#secret',
    'not a URL',
  ])('requires literal loopback and clean authority for both origins: %s', (url) => {
    expect(isConfiguredLocalShopperReview({ ...admitted, supabaseUrl: url })).toBe(false)
    expect(isConfiguredLocalShopperReview({ ...admitted, browserOrigin: url })).toBe(false)
  })
})
