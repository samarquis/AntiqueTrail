import { describe, expect, it } from 'vitest'
import { createReviewHarness } from './harness'

const base = {
  dev: true,
  mode: 'review',
  enabled: 'true',
  url: 'http://127.0.0.1:4173/review',
  now: Date.parse('2026-08-05T12:00:00Z'),
}

describe('local review harness', () => {
  it('cannot activate outside an explicit development review mode', async () => {
    await expect(createReviewHarness({ ...base, dev: false })).resolves.toBeNull()
    await expect(createReviewHarness({ ...base, mode: 'production' })).resolves.toBeNull()
    await expect(createReviewHarness({ ...base, enabled: undefined })).resolves.toBeNull()
  })

  it('creates an anonymous session without credentials', async () => {
    const harness = await createReviewHarness(base)
    expect(harness?.scenario.id).toBe('anonymous')
    expect(harness?.authStore.getSession()).toBeNull()
  })

  it.each([
    ['shopper-a', 'Shopper'],
    ['shopper-b', 'Shopper'],
    ['representative', 'Representative'],
    ['administrator', 'Administrator'],
  ] as const)('seeds an isolated %s session with %s authority', async (scenario, role) => {
    const harness = await createReviewHarness({
      ...base,
      url: `http://127.0.0.1:4173/review?reviewAs=${scenario}&reviewState=success`,
    })
    const session = harness?.authStore.getSession()
    expect(session).toMatchObject({ userId: `review-${scenario}`, role })
    expect(session?.accessToken).toBe(`local-review-only:${scenario}`)
    await expect(harness?.sessionRegistry.isActive(session!)).resolves.toBe(true)
  })

  it('supports every required deterministic state and rejects unknown URL values', async () => {
    for (const state of ['success', 'loading', 'empty', 'error', 'blocked', 'permission-denied']) {
      const harness = await createReviewHarness({
        ...base,
        url: `http://127.0.0.1:4173/review?reviewAs=shopper-a&reviewState=${state}`,
      })
      expect(harness?.state).toBe(state)
    }
    const fallback = await createReviewHarness({
      ...base,
      url: 'http://127.0.0.1:4173/review?reviewAs=attacker&reviewState=secret',
    })
    expect(fallback).toMatchObject({ scenario: { id: 'anonymous' }, state: 'success' })
  })

  it('keeps Shopper A and Shopper B sessions and fixture paths separate', async () => {
    const a = await createReviewHarness({ ...base, url: `${base.url}?reviewAs=shopper-a` })
    const b = await createReviewHarness({ ...base, url: `${base.url}?reviewAs=shopper-b` })
    expect(a?.authStore.getSession()?.userId).not.toBe(b?.authStore.getSession()?.userId)
    expect(a?.scenario.destinations.map(({ path }) => path)).toContain('/saved')
    expect(b?.scenario.destinations.map(({ path }) => path)).toContain('/shares')
    expect(b?.scenario.deniedDestinations.map(({ path }) => path)).toContain(
      '/corrections/correction-a',
    )
  })
})
