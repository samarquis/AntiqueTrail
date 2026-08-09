import { describe, expect, it } from 'vitest'
import { createReviewHarnessAuthProvider, createReviewHarnessClients } from './clients'
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
      expect.objectContaining({
        id: 'share-b',
        direction: 'received',
        state: 'pending',
        title: 'Weekend estate-sale lead',
      }),
      expect.objectContaining({
        id: 'share-expired',
        direction: 'received',
        state: 'closed',
        title: 'Antique sideboard lead',
      }),
      expect.objectContaining({
        id: 'share-revoked',
        direction: 'received',
        state: 'closed',
        title: 'Vintage lamp lead',
      }),
      expect.objectContaining({
        id: 'share-b-sent',
        direction: 'sent',
        state: 'pending',
        title: 'Mid-century credenza lead',
      }),
    ])
    await expect(shopperB.candidate!.acceptShare('share-expired')).resolves.toEqual({
      accepted: false,
      state: 'closed',
      message: 'No change.',
    })
    await expect(shopperB.candidate!.getShare('share-expired')).resolves.toMatchObject({
      id: 'share-expired',
      state: 'closed',
    })
    await expect(shopperB.candidate!.acceptShare('share-b')).resolves.toMatchObject({
      accepted: true,
      state: 'accepted',
    })
    await expect(shopperB.candidate!.listShares()).resolves.toEqual([
      expect.objectContaining({ id: 'share-b', state: 'accepted' }),
      expect.objectContaining({ id: 'share-expired', state: 'closed' }),
      expect.objectContaining({ id: 'share-revoked', state: 'closed' }),
      expect.objectContaining({ id: 'share-b-sent', state: 'pending' }),
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

  it('keeps lifecycle authorization active while destination loading remains pending', async () => {
    const clients = createReviewHarnessClients(scenario('shopper-a'), 'loading')
    await expect(clients.lifecycle!.getStatus()).resolves.toMatchObject({ state: 'active' })
    const destination = clients.shopper!.listSaved()
    await expect(
      Promise.race([destination.then(() => 'resolved'), Promise.resolve('pending')]),
    ).resolves.toBe('pending')
  })

  it('provides deterministic sign-in, MFA, recovery, and account lifecycle review fixtures', async () => {
    const provider = createReviewHarnessAuthProvider('success')
    await expect(
      provider.signIn('shopper-a@local.invalid', 'synthetic-password'),
    ).resolves.toMatchObject({
      kind: 'authenticated',
      session: { userId: 'review-shopper-a', role: 'Shopper', emailVerified: true },
    })
    await expect(provider.signIn('mfa@local.invalid', 'synthetic-password')).resolves.toMatchObject(
      {
        kind: 'mfa_required',
        challengeId: 'review-mfa-challenge',
      },
    )
    await expect(provider.verifyMfa('review-mfa-challenge', '123456')).resolves.toMatchObject({
      userId: 'review-shopper-a',
      mfaVerifiedAt: '2026-08-05T12:00:00.000Z',
    })
    await expect(provider.sendRecovery('unknown@local.invalid')).resolves.toBeUndefined()

    const shopper = createReviewHarnessClients(scenario('shopper-a'), 'success')
    await expect(shopper.lifecycle!.getStatus()).resolves.toMatchObject({ state: 'active' })
    await expect(shopper.lifecycle!.requestDeletion()).resolves.toMatchObject({
      state: 'deletion_scheduled',
    })
    await expect(shopper.lifecycle!.getStatus()).resolves.toMatchObject({
      state: 'deletion_scheduled',
    })
    await expect(shopper.lifecycle!.cancelDeletion()).resolves.toMatchObject({ state: 'active' })
    await expect(shopper.lifecycle!.getStatus()).resolves.toMatchObject({ state: 'active' })
    const administrator = createReviewHarnessClients(scenario('administrator'), 'success')
    await expect(administrator.lifecycle!.getStatus()).resolves.toMatchObject({ state: 'active' })
    await expect(administrator.lifecycle!.requestDeletion()).rejects.toThrow(/permission denied/i)
  })

  it('persists deterministic shopper mutations for end-to-end review', async () => {
    const clients = createReviewHarnessClients(scenario('shopper-a'), 'success')
    const shopper = clients.shopper!
    const blueFinchId = '00000000-0000-4000-8000-000000000001'
    await expect(shopper.setSave(blueFinchId, false)).resolves.toEqual({ saved: false })
    await expect(shopper.listSaved()).resolves.toEqual([])
    const updated = await shopper.upsertMemory({
      storeId: blueFinchId,
      rating: 5,
      note: 'Updated note',
      lastVisitMonth: '2026-08',
    })
    await expect(shopper.getMemory(blueFinchId)).resolves.toEqual(updated)
    const receipt = await shopper.deleteMemory(blueFinchId)
    await expect(shopper.getMemory(blueFinchId)).resolves.toBeNull()
    await expect(shopper.undoDeleteMemory(blueFinchId, receipt.undoToken)).resolves.toMatchObject({
      note: 'Updated note',
    })
    const correction = await shopper.submitCorrection({
      storeId: blueFinchId,
      type: 'hours',
      description: 'Friday hours changed.',
    })
    await expect(shopper.getCorrection(correction.id)).resolves.toEqual(correction)
  })

  it('provides blocked admission and generic callback fixtures', async () => {
    const provider = createReviewHarnessAuthProvider('success')
    await expect(
      provider.register!({
        email: 'blocked@local.invalid',
        password: 'synthetic-password',
        ageAttested: true,
        requestId: '00000000-0000-4000-8000-000000000001',
      }),
    ).resolves.toEqual({ kind: 'blocked' })
    await expect(
      provider.register!({
        email: 'shopper-a@local.invalid',
        password: 'synthetic-password',
        ageAttested: true,
        requestId: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toEqual({ kind: 'pending_verification' })
    await expect(provider.verifyCallback!('verify', 'review-verify-b')).resolves.toMatchObject({
      kind: 'authenticated',
      session: { userId: 'review-shopper-b' },
    })
    await expect(provider.verifyCallback!('verify', 'unknown-token')).resolves.toEqual({
      kind: 'error',
    })
  })
})
