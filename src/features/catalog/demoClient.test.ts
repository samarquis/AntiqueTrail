import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { syntheticStores } from './demoClient'

describe('Synthetic Store image fixtures', () => {
  it('gives all twelve stores distinct shopper-facing copy while keeping fixture identity separate', () => {
    expect(syntheticStores).toHaveLength(12)
    expect(new Set(syntheticStores.map((store) => store.summary)).size).toBe(12)
    expect(new Set(syntheticStores.map((store) => store.description)).size).toBe(12)

    for (const store of syntheticStores) {
      expect(store.summary?.length).toBeGreaterThanOrEqual(60)
      expect(store.description?.length).toBeGreaterThanOrEqual(100)
      expect(store.summary).not.toMatch(/fictional|synthetic|fixture/iu)
      expect(store.description).not.toMatch(/fictional|synthetic|fixture/iu)
      expect(store.fixtureProfile?.label).toMatch(/synthetic.+internal only/iu)
    }
  })

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
    expect(covers.every((cover) => (cover?.caption?.length ?? 0) >= 60)).toBe(true)
    expect(new Set(covers.map((cover) => cover?.caption)).size).toBe(12)
    expect(covers.every((cover) => cover?.rightsLabel?.includes('OpenAI-generated'))).toBe(true)
    expect(covers.every((cover) => cover && existsSync(resolve(`public${cover.src}`)))).toBe(true)
  })

  it('makes every Synthetic Store carry 1-50 photos in the evaluation wall', () => {
    for (const store of syntheticStores) {
      // Each store has 1 cover + 0-50 gallery photos = 1-51 total, but cover is separate kind
      // media array includes cover + gallery photos, expect 1-50 gallery photos + 1 cover = 1-51 total
      // But the test checks total media length - expect between 2 and 51 (cover + at least 1 gallery, max 50 gallery + cover)
      expect(store.media.length).toBeGreaterThanOrEqual(2)
      expect(store.media.length).toBeLessThanOrEqual(51)
      expect(store.media.every((item) => item.alt.length >= 40)).toBe(true)
      expect(new Set(store.media.map((item) => item.alt)).size).toBe(store.media.length)
      expect(new Set(store.media.map((item) => item.src)).size).toBe(store.media.length)
      expect(store.fixtureProfile).toEqual({
        label: expect.stringContaining('Internal only'),
      })
    }
  })

  it('gives the primary review store distinct cover and gallery photography', () => {
    const blueFinch = syntheticStores.find((store) => store.slug === 'blue-finch-curios')

    expect(blueFinch?.media).toBeDefined()
    // Expect at least 1 cover and at most 50 gallery photos (1-51 total media items)
    expect(blueFinch?.media.length).toBeGreaterThanOrEqual(2)
    expect(blueFinch?.media.length).toBeLessThanOrEqual(51)
    // Cover is kind='cover', gallery photos are kind='gallery'
    const galleryCount = blueFinch?.media.filter((media) => media.kind === 'gallery').length ?? 0
    expect(galleryCount).toBeGreaterThanOrEqual(1)
    expect(galleryCount).toBeLessThanOrEqual(50)
    // All media sources should be distinct
    expect(new Set(blueFinch?.media.map((media) => media.src)).size).toBe(blueFinch?.media.length)
    expect(new Set(blueFinch?.media.map((media) => media.alt)).size).toBe(blueFinch?.media.length)
  })

  it('keeps the primary review wall at 50 media items with valid local assets', () => {
    const blueFinch = syntheticStores.find((store) => store.slug === 'blue-finch-curios')

    expect(blueFinch?.media).toHaveLength(50)
    expect(blueFinch?.media.filter((media) => media.kind === 'gallery')).toHaveLength(49)
    expect(blueFinch?.media.every((media) => existsSync(resolve(`public${media.src}`)))).toBe(true)
  })

  it('keeps a complete primary review fixture and a truthful sparse-data fixture', () => {
    const blueFinch = syntheticStores.find((store) => store.slug === 'blue-finch-curios')
    const cedar = syntheticStores.find((store) => store.slug === 'cedar-and-brass')

    expect(blueFinch).toMatchObject({
      phone: '+1-785-555-0101',
      email: 'hello@blue-finch.example.invalid',
      asOfUtc: '2026-08-12T15:00:00Z',
      freshness: { status: 'current', verifiedAt: '2026-08-01T15:00:00Z' },
      provenance: { sourceLabel: 'Antique Trail Synthetic Store fixture' },
      accessibility: { status: 'verified' },
    })
    expect(blueFinch?.hoursExceptions).toHaveLength(1)
    expect(blueFinch?.updates).toHaveLength(4)
    expect(blueFinch?.socialLinks).toHaveLength(2)
    expect(cedar?.phone).toBeUndefined()
    expect(cedar?.provenance).toBeUndefined()
    expect(cedar?.accessibility).toBeUndefined()
  })
})
