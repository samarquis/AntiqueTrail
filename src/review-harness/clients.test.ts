import { describe, expect, it } from 'vitest'
import { createReviewHarnessClients } from './clients'
import { reviewScenarios } from './harness'

function scenario(id: (typeof reviewScenarios)[number]['id']) {
  return reviewScenarios.find((candidate) => candidate.id === id)!
}

describe('scenario-aware review clients', () => {
  it('seeds distinct private shopper workflows', async () => {
    const shopperA = createReviewHarnessClients(scenario('shopper-a'), 'success')
    const shopperB = createReviewHarnessClients(scenario('shopper-b'), 'success')

    await expect(shopperA.shopper!.listSaved()).resolves.toEqual([
      expect.objectContaining({ name: 'Blue Finch Curios' }),
    ])
    await expect(shopperA.trips!.list()).resolves.toEqual([
      expect.objectContaining({ name: "Avery's antique day" }),
    ])
    await expect(shopperB.candidate!.listShares()).resolves.toEqual([
      expect.objectContaining({ id: 'share-b', title: 'Weekend estate-sale lead' }),
    ])
    await expect(shopperA.candidate!.listShares()).resolves.toEqual([])
    await expect(shopperA.candidate!.listTripIdeas()).resolves.toEqual([])
    await expect(shopperB.trips!.list()).resolves.toEqual([])
    await expect(shopperA.candidate!.getShare('share-b')).rejects.toThrow(/cross-account/i)
    await expect(shopperB.shopper!.getCorrection('correction-a')).rejects.toThrow(/cross-account/i)
  })

  it('seeds a store-scoped Representative workspace and denies shoppers', async () => {
    const representative = createReviewHarnessClients(scenario('representative'), 'success')
    const shopper = createReviewHarnessClients(scenario('shopper-a'), 'success')
    await expect(representative.portal!.getHome()).resolves.toMatchObject({
      store: { name: 'Blue Finch Curios' },
      pendingChanges: [{ field: 'address', state: 'pending' }],
    })
    await expect(shopper.portal!.getHome()).rejects.toThrow(/permission denied/i)
  })

  it('seeds an Administrator moderation queue without shopper-private access', async () => {
    const administrator = createReviewHarnessClients(scenario('administrator'), 'success')
    await expect(administrator.reviews!.listModerationCases()).resolves.toEqual([
      expect.objectContaining({ id: 'moderation-1', state: 'open' }),
    ])
    await expect(administrator.shopper!.listSaved()).rejects.toThrow(/permission denied/i)
    await expect(administrator.partnerAdmin!.getCase('claim-synthetic')).resolves.toMatchObject({
      claimId: 'claim-synthetic',
      exactStoreScope: 'Blue Finch Curios',
    })
    await expect(administrator.partnerAdmin!.getCase('another-claim')).rejects.toThrow(
      /exact-case denial/i,
    )
  })

  it('maps empty, loading, error, blocked, and permission states through real clients', async () => {
    await expect(
      createReviewHarnessClients(scenario('shopper-a'), 'empty').shopper!.listSaved(),
    ).resolves.toEqual([])
    await expect(
      createReviewHarnessClients(scenario('shopper-a'), 'error').shopper!.listSaved(),
    ).rejects.toThrow(/review error/i)
    await expect(
      createReviewHarnessClients(scenario('shopper-a'), 'blocked').trips!.list(),
    ).rejects.toThrow(/release gate blocked/i)
    await expect(
      createReviewHarnessClients(
        scenario('administrator'),
        'permission-denied',
      ).reviews!.listModerationCases(),
    ).rejects.toThrow(/permission denied/i)

    const loading = createReviewHarnessClients(
      scenario('representative'),
      'loading',
    ).portal!.getHome()
    await expect(
      Promise.race([loading.then(() => 'resolved'), Promise.resolve('pending')]),
    ).resolves.toBe('pending')
  })
})
