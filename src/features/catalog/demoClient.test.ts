import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { syntheticStores } from './demoClient'

describe('Synthetic Store image fixtures', () => {
  it('gives every store one unique, locally hosted generated cover', () => {
    const covers = syntheticStores.map((store) =>
      store.media.find((media) => media.kind === 'cover'),
    )

    expect(covers).toHaveLength(12)
    expect(covers.every(Boolean)).toBe(true)
    expect(new Set(covers.map((cover) => cover?.src)).size).toBe(12)
    expect(covers.every((cover) => cover?.src.startsWith('/images/synthetic-stores/1280w/'))).toBe(
      true,
    )
    expect(covers.every((cover) => (cover?.alt.length ?? 0) >= 40)).toBe(true)
    expect(covers.every((cover) => cover?.rightsLabel?.includes('OpenAI-generated'))).toBe(true)
    expect(covers.every((cover) => cover && existsSync(resolve(`public${cover.src}`)))).toBe(true)
  })

  it('gives the primary review store distinct cover and gallery photography', () => {
    const blueFinch = syntheticStores.find((store) => store.slug === 'blue-finch-curios')

    expect(blueFinch?.media).toHaveLength(4)
    expect(blueFinch?.media.filter((media) => media.kind === 'gallery')).toHaveLength(3)
    expect(new Set(blueFinch?.media.map((media) => media.src)).size).toBe(4)
    expect(new Set(blueFinch?.media.map((media) => media.alt)).size).toBe(4)
  })

  it('keeps a complete primary review fixture and a truthful sparse-data fixture', () => {
    const blueFinch = syntheticStores.find((store) => store.slug === 'blue-finch-curios')
    const cedar = syntheticStores.find((store) => store.slug === 'cedar-and-brass')

    expect(blueFinch).toMatchObject({
      phone: '+1-785-555-0101',
      email: 'hello@blue-finch.example.invalid',
      asOfUtc: '2026-08-05T15:00:00Z',
      freshness: { status: 'current', verifiedAt: '2026-08-01T15:00:00Z' },
      provenance: { sourceLabel: 'Antique Trail Synthetic Store fixture' },
      accessibility: { status: 'verified' },
    })
    expect(blueFinch?.hoursExceptions).toHaveLength(1)
    expect(blueFinch?.updates).toHaveLength(2)
    expect(blueFinch?.socialLinks).toHaveLength(2)
    expect(cedar?.phone).toBeUndefined()
    expect(cedar?.provenance).toBeUndefined()
    expect(cedar?.accessibility).toBeUndefined()
  })
})
