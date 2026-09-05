import { describe, expect, it } from 'vitest'
import {
  createReviewHarnessAuthProvider,
  createReviewHarnessCatalogClient,
  createReviewHarnessClients,
} from './clients'
import { reviewScenarios } from './harness'

function scenario(id: (typeof reviewScenarios)[number]['id']) {
  return reviewScenarios.find((candidate) => candidate.id === id)!
}

describe('scenario-aware review clients', () => {
  it('exposes deterministic populated, empty, and error catalog states', async () => {
    await expect(createReviewHarnessCatalogClient('success').list({})).resolves.toMatchObject({
      stores: expect.arrayContaining([expect.objectContaining({ name: 'Blue Finch Curios' })]),
    })
    await expect(createReviewHarnessCatalogClient('empty').list({})).resolves.toMatchObject({
      stores: [],
    })
    await expect(createReviewHarnessCatalogClient('error').list({})).rejects.toThrow(
      'Synthetic catalog review error.',
    )
  })

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

  it('runs the full representative partner and Store Portal fixture without fabricating gated work', async () => {
    const representative = createReviewHarnessClients(scenario('representative'), 'success')
    const partner = representative.partner!
    const portal = representative.portal!

    await expect(partner.exchangeInvitation('review-partner-invite')).resolves.toMatchObject({
      state: 'active',
      resumeHandle: 'resume-review-partner',
    })
    await expect(partner.resumeInvitation('resume-review-partner')).resolves.toMatchObject({
      state: 'active',
    })
    await expect(
      partner.acceptConsent({
        resumeHandle: 'resume-review-partner',
        idempotencyKey: 'consent-1',
        identity: { name: 'River', title: 'Owner', store: 'Blue Finch Curios', email: 'r@x.test' },
        acknowledgements: {
          authority: true,
          voluntary: true,
          permittedData: true,
          noPayment: true,
          withdrawal: true,
        },
      }),
    ).resolves.toMatchObject({ onboarding: 'draft', pendingIdentity: 'provisional' })
    await expect(partner.bindIdentity()).rejects.toThrow(/Email verification is unavailable/i)
    await expect(partner.getStatus()).resolves.toMatchObject({
      onboarding: 'approved',
      storeScope: 'Blue Finch Curios',
    })
    await expect(
      partner.saveDraft({
        storeName: 'Blue Finch Curios',
        address: '1 Main',
        hours: '10–5',
        website: 'https://example.invalid',
        description: 'Synthetic',
      }),
    ).resolves.toMatchObject({ onboarding: 'draft' })
    await expect(partner.submitDraft()).resolves.toMatchObject({ onboarding: 'submitted' })
    const claim = await partner.submitClaim({
      storeReference: 'Blue Finch Curios',
      relationship: 'Owner',
      authorityStatement: 'I am authorized.',
    })
    await expect(
      partner.submitAuthoritySignal({
        claimId: claim.claimId,
        channelClass: 'published_business_contact',
        evidenceReference: 'public-contact',
      }),
    ).resolves.toMatchObject({ state: 'verification_pending' })
    await expect(partner.requestAuthorityRecheck(claim.claimId)).resolves.toMatchObject({
      state: 'verification_pending',
      recheckDueAt: expect.any(String),
    })
    await expect(partner.withdrawClaim(claim.claimId)).resolves.toMatchObject({
      state: 'withdrawn',
    })
    await expect(partner.withdraw()).resolves.toMatchObject({ onboarding: 'withdrawn' })

    const initialHours = await portal.getHours()
    await expect(portal.saveHours(initialHours)).resolves.toMatchObject({
      version: initialHours.version + 1,
    })
    await portal.saveManagedFields({
      phone: '785-555-0199',
      website: 'https://blue-finch.example.invalid',
      description: 'Updated synthetic description.',
    })
    await portal.saveManagedFields({
      ...(await portal.getHome()).managedFields!,
      phone: '785-555-0188',
    })
    await expect(portal.previewPublicListing()).resolves.toMatchObject({
      liveFields: expect.objectContaining({
        phone: '785-555-0188',
        website: 'https://blue-finch.example.invalid',
        description: 'Updated synthetic description.',
      }),
    })
    const change = await portal.submitControlledChange({
      field: 'address',
      requestedValue: '200 East Synthetic Avenue',
      reason: 'Moved',
    })
    await expect(portal.getHome()).resolves.toMatchObject({
      pendingChanges: expect.arrayContaining([expect.objectContaining({ id: change.id })]),
    })
    await expect(portal.getMediaCapability()).resolves.toEqual({ enabled: false, source: 'server' })
    await expect(portal.listMediaUploads()).resolves.toMatchObject({
      uploads: [
        expect.objectContaining({
          state: 'rejected',
          rejectionReason: 'Image quality needs more detail.',
        }),
      ],
    })
    await expect(
      portal.uploadOfficialMedia({
        storeId: 'store-blue-finch',
        kind: 'cover',
        altText: 'Synthetic item',
        file: new File(['x'], 'x.png', { type: 'image/png' }),
        rightsConfirmed: true,
        idempotencyKey: 'media-1',
      }),
    ).rejects.toThrow(/couldn't update this Store Portal/i)
    const update = await portal.createUpdate({
      type: 'announcement',
      headline: 'Late opening',
      details: 'Synthetic notice.',
    })
    await expect(portal.archiveUpdate(update.id)).resolves.toMatchObject({ state: 'archived' })
    await expect(portal.restoreUpdate(update.id)).resolves.toMatchObject({ state: 'live' })
    await portal.saveOfficialLink({ platform: 'facebook', url: 'https://example.invalid/facebook' })
    await expect(portal.removeOfficialLink('facebook')).resolves.toBeUndefined()
    const ticket = await portal.createSupportTicket({
      category: 'bug',
      subject: 'Synthetic issue',
      body: 'Synthetic details.',
      diagnostics: await portal.getDiagnostics(),
    })
    await expect(portal.replySupportTicket(ticket.id, 'More detail')).resolves.toMatchObject({
      state: 'waiting_on_you',
      replies: [expect.objectContaining({ body: 'More detail' })],
    })
    await expect(portal.confirmSupportResolution(ticket.id)).resolves.toMatchObject({
      state: 'resolved',
    })
    await expect(portal.reopenSupportTicket(ticket.id)).resolves.toMatchObject({
      state: 'reopened',
    })
  })

  it('keeps partner and portal roles and review states honest', async () => {
    for (const identity of ['anonymous', 'shopper-a', 'administrator'] as const) {
      const clients = createReviewHarnessClients(scenario(identity), 'success')
      await expect(clients.partner!.getStatus()).rejects.toThrow(/permission denied/i)
      await expect(clients.portal!.getHome()).rejects.toThrow(/permission denied/i)
    }
    const empty = createReviewHarnessClients(scenario('representative'), 'empty')
    await expect(empty.partner!.getStatus()).resolves.toMatchObject({ onboarding: 'draft' })
    await expect(empty.portal!.listUpdates()).resolves.toEqual([])
    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      const clients = createReviewHarnessClients(scenario('representative'), state)
      await expect(clients.partner!.getStatus()).rejects.toThrow(
        /couldn't continue this invitation/i,
      )
      await expect(clients.portal!.getHome()).rejects.toThrow(/couldn't update/i)
    }
    const loading = createReviewHarnessClients(scenario('representative'), 'loading')
    await expect(
      Promise.race([
        loading.partner!.getStatus().then(() => 'resolved'),
        Promise.resolve('pending'),
      ]),
    ).resolves.toBe('pending')
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

  it('implements the administrator queue, scope, merge, partner, and moderation mutations', async () => {
    const administrator = createReviewHarnessClients(scenario('administrator'), 'success')
    const admin = administrator.admin!

    const [reviewCase] = await admin.listCases()
    expect(reviewCase).toMatchObject({ id: 'case-1', state: 'assigned', version: 3 })
    await expect(admin.getCase(reviewCase.id)).resolves.toMatchObject({
      immutableSubmission: true,
      allowedActions: ['approve', 'return', 'reject'],
      audit: expect.arrayContaining([expect.objectContaining({ action: 'assigned' })]),
    })
    await expect(
      admin.decideCase(reviewCase.id, 'approve', 'accurate', 2, 'stale'),
    ).rejects.toThrow(/version conflict/i)
    await expect(
      admin.decideCase(reviewCase.id, 'approve', 'accurate', 3, 'decide-1'),
    ).resolves.toEqual({
      id: 'case-1',
      state: 'approved',
      version: 4,
    })
    await expect(admin.listCases()).resolves.toEqual([
      expect.objectContaining({
        id: 'case-onboarding-1',
        queueCategory: 'onboarding',
        assignedCount: 1,
      }),
    ])

    const [grant] = await admin.listStoreGrants()
    const preview = await admin.previewStoreScopeChange(
      'revoke',
      grant.subjectUserId,
      grant.storeId,
      grant.version,
    )
    await expect(
      admin.changeStoreScope(
        'revoke',
        grant.subjectUserId,
        grant.storeId,
        grant.version,
        'administrator_revoked',
        'revoke-1',
        preview.previewId,
      ),
    ).resolves.toMatchObject({ state: 'revoked', version: 3 })
    const regrantPreview = await admin.previewStoreScopeChange(
      'regrant',
      grant.subjectUserId,
      grant.storeId,
      3,
    )
    await expect(
      admin.changeStoreScope(
        'regrant',
        grant.subjectUserId,
        grant.storeId,
        3,
        'authority_reverified',
        'regrant-1',
        regrantPreview.previewId,
      ),
    ).resolves.toMatchObject({ state: 'active', version: 4 })

    const merge = await admin.previewDuplicateMerge('store-blue-finch', 'store-cedar-brass')
    expect(merge).toMatchObject({ state: 'previewed', safeReferences: 12, quarantinedConflicts: 1 })
    const executed = await admin.executeDuplicateMerge(merge.proposalId, merge.version, 'merge-1')
    await expect(
      admin.rollbackDuplicateMerge(executed.proposalId, executed.version, 'rollback-1'),
    ).resolves.toMatchObject({ state: 'rolled_back', version: 3 })

    const partner = administrator.partnerAdmin!
    const partnerCase = await partner.getCase('claim-synthetic')
    const signal = partnerCase.pendingSignals![0]
    const verified = await partner.verifySignal({
      operation: 'verify',
      claimId: partnerCase.claimId,
      signalId: signal.signalId,
      expectedVersion: partnerCase.version!,
      idempotencyKey: 'signal-1',
      reasonCode: 'confirmed',
    })
    await expect(
      partner.decide({
        operation: 'approve',
        claimId: verified.claimId,
        expectedVersion: verified.version!,
        idempotencyKey: 'partner-1',
        reasonCode: 'verified_authority',
      }),
    ).resolves.toMatchObject({ state: 'approved', version: 4 })

    const reviews = administrator.reviews!
    const [moderation] = await reviews.listModerationCases()
    await expect(
      reviews.decideModerationCase(moderation.id, {
        action: 'remove',
        reason: 'confirmed spam',
        expectedVersion: moderation.version,
        idempotencyKey: 'moderation-1-v1',
        mfaVerified: true,
        recentAuthAt: '2026-08-05T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      state: 'removed',
      evidence: expect.arrayContaining([
        expect.objectContaining({ kind: 'prior_decision', value: 'confirmed spam' }),
      ]),
    })
  })

  it('denies every privileged fixture to non-administrators and keeps admin states honest', async () => {
    for (const identity of ['shopper-a', 'representative'] as const) {
      const clients = createReviewHarnessClients(scenario(identity), 'success')
      await expect(clients.admin!.listCases()).rejects.toThrow(/permission denied/i)
      await expect(clients.partnerAdmin!.getCase('claim-synthetic')).rejects.toThrow(
        /permission denied/i,
      )
      await expect(clients.reviews!.listModerationCases()).rejects.toThrow(/permission denied/i)
    }
    const empty = createReviewHarnessClients(scenario('administrator'), 'empty')
    await expect(empty.admin!.listCases()).resolves.toEqual([])
    await expect(empty.admin!.listStoreGrants()).resolves.toEqual([])
    for (const state of ['error', 'blocked', 'permission-denied'] as const) {
      await expect(
        createReviewHarnessClients(scenario('administrator'), state).admin!.listCases(),
      ).rejects.toThrow(/This item is not available/i)
    }
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

  it('drives the full in-memory trip workflow for review', async () => {
    const trips = createReviewHarnessClients(scenario('shopper-a'), 'success').trips!

    const seeded = await trips.list()
    expect(seeded).toHaveLength(1)
    expect(seeded[0]).toMatchObject({
      id: 'trip-a',
      name: "Avery's antique day",
      state: 'draft',
      version: 3,
      departureMinute: 600,
    })
    expect(seeded[0].stops.map((stop) => stop.id)).toEqual(['stop-a', 'stop-b'])

    const renamed = await trips.renameTrip('trip-a', '  Antique\nMorning Run  ', 3, 'rename-1')
    expect(renamed).toEqual({
      state: 'applied',
      trip: expect.objectContaining({ name: 'Antique Morning Run', version: 4 }),
    })
    await expect(trips.renameTrip('trip-a', 'Stale write', 3, 'rename-2')).resolves.toEqual({
      state: 'conflict',
      latest: { name: 'Antique Morning Run', version: 4 },
    })

    const withRest = await trips.addStop('trip-a', {
      kind: 'rest',
      label: 'Lunch stop',
      priority: 'flexible',
      plannedDwellMinutes: 30,
    })
    expect(withRest.stops.at(-1)).toMatchObject({
      kind: 'rest',
      position: 2,
      memoryStatus: 'not_applicable',
    })

    const withStore = await trips.addStoreStop('trip-a', '00000000-0000-4000-8000-000000000002')
    expect(withStore.stops.at(-1)).toMatchObject({
      storeId: '00000000-0000-4000-8000-000000000002',
      label: 'Cedar & Brass',
      priority: 'prefer',
    })

    const unacknowledged = await trips.reviewHours('trip-a')
    expect(unacknowledged.state).toBe('draft')
    expect(unacknowledged.hoursReview).toEqual({
      reviewedAt: '2026-08-05T12:00:00.000Z',
      hasUnresolvedWarnings: true,
      acknowledged: false,
    })
    const reviewed = await trips.reviewHours('trip-a', true)
    expect(reviewed.state).toBe('ready')
    expect(reviewed.hoursReview).toEqual({
      reviewedAt: '2026-08-05T12:00:00.000Z',
      hasUnresolvedWarnings: true,
      acknowledged: true,
    })

    const restStopId = withRest.stops.at(-1)!.id
    const cedarStopId = withStore.stops.at(-1)!.id
    const started = await trips.start('trip-a')
    expect(started.state).toBe('active')
    expect(started.durationMinutes).toBe(240)
    expect(started.transitionMinutes).toBe(45)
    await trips.markArrived('trip-a', 'stop-a')
    await trips.completeStop('trip-a', 'stop-a')
    await trips.skipStop('trip-a', 'stop-b')
    await trips.markObservedClosed!('trip-a', cedarStopId)
    await trips.completeStop('trip-a', restStopId)
    const completed = await trips.completeTrip!('trip-a')
    expect(completed.state).toBe('completed')
    const completedVersion = completed.version
    await expect(trips.start('trip-a')).rejects.toThrow(/couldn't update this trip/i)

    const clone = await trips.cloneCompleted('trip-a')
    expect(clone).toMatchObject({ name: 'Antique Morning Run (copy)', state: 'draft' })
    expect(clone.stops.every((stop) => stop.state === 'planned')).toBe(true)
    await expect(trips.get('missing-trip')).resolves.toBeNull()

    const queued = await trips.queueOfflineAction('trip-a', {
      kind: 'mark_arrived',
      stopId: 'stop-a',
    })
    expect(queued).toMatchObject({ state: 'queued', pendingCount: 1 })
    const baseEnvelope = {
      tripId: 'trip-a',
      idempotencyKey: 'replay-1',
      baseVersion: completedVersion,
      deviceId: 'device-a',
      localSequence: 1,
    } as const
    await expect(
      trips.replayOfflineMutation!({ ...baseEnvelope, kind: 'mark_arrived', stopId: 'stop-a' }),
    ).resolves.toMatchObject({
      state: 'accepted',
      trip: expect.objectContaining({ version: completedVersion + 1 }),
    })
    await expect(
      trips.replayOfflineMutation!({
        ...baseEnvelope,
        idempotencyKey: 'replay-2',
        kind: 'skip_stop',
        stopId: 'stop-b',
      }),
    ).resolves.toMatchObject({ state: 'conflict', summary: expect.any(String) })
    await expect(
      trips.replayOfflineMutation!({
        ...baseEnvelope,
        idempotencyKey: 'replay-3',
        tripId: 'no-such-trip',
        kind: 'skip_stop',
        stopId: 'stop-b',
      }),
    ).resolves.toEqual({ state: 'unauthorized' })

    const remembered = await trips.saveVisitMemory!(
      'trip-a',
      '00000000-0000-4000-8000-000000000001',
      { rating: 5, note: 'Walnut secretary', returnChoice: 'yes' },
    )
    expect(remembered.stops[0]).toMatchObject({ memoryStatus: 'saved' })

    const collaboration = await trips.getCollaboration('trip-a')
    expect(collaboration.participants).toEqual([
      { userId: 'review-shopper-a', displayName: 'Avery', role: 'creator' },
    ])
    await expect(
      trips.invitePartner('trip-a', 'review-shopper-b@local.invalid'),
    ).resolves.toMatchObject({ invitation: { id: 'inv-trip-a', state: 'pending' } })
    await expect(trips.invitePartner('trip-a', 'review-shopper-b@local.invalid')).rejects.toThrow(
      /already pending/i,
    )
    await expect(trips.acceptInvitation('review-trip-invite-shopper-b')).resolves.toMatchObject({
      currentUserId: 'review-shopper-a',
    })
    await expect(trips.acceptInvitation('unknown-token')).rejects.toThrow(/unavailable or expired/i)
    await expect(trips.assignNavigator('trip-a', 'review-shopper-a')).resolves.toMatchObject({
      navigatorUserId: 'review-shopper-a',
    })
    await expect(trips.leaveTrip('trip-a')).rejects.toThrow(/creator cannot leave/i)

    const suggestion = await trips.requestCheckMyDay!('trip-a')
    expect(suggestion).toMatchObject({ state: 'suggested' })
    expect(suggestion.orderedStopIds).toEqual(['stop-a', 'stop-b', cedarStopId, restStopId])
    const reversed = [...suggestion.orderedStopIds!].reverse()
    const reordered = await trips.saveCheckMyDayChoice!('trip-a', 'suggested', reversed)
    expect(reordered.stops.map((stop) => stop.id)).toEqual(reversed)

    const fresh = await trips.create({ name: 'Blank slate', localDate: '2026-08-09' })
    expect(fresh.state).toBe('draft')
    await expect(trips.start(fresh.id)).rejects.toThrow(/couldn't update this trip/i)
    await expect(trips.requestCheckMyDay!(fresh.id)).resolves.toMatchObject({
      state: 'blocked',
      reason: 'departure_required',
    })
    await expect(trips.getOfflineQueue(fresh.id)).resolves.toEqual({
      state: 'empty',
      pendingCount: 0,
    })
  })

  it('replays a real offline queue and resolves conflicts for review', async () => {
    const trips = createReviewHarnessClients(scenario('shopper-a'), 'success').trips!

    const queued = await trips.queueOfflineAction('trip-a', {
      kind: 'mark_arrived',
      stopId: 'stop-a',
    })
    expect(queued).toMatchObject({ state: 'queued', pendingCount: 1 })
    await trips.queueOfflineAction('trip-a', { kind: 'skip_stop', stopId: 'stop-b' })

    const replayed = await trips.replayOffline('trip-a')
    expect(replayed.stops[0]).toMatchObject({ id: 'stop-a', state: 'arrived' })
    expect(replayed.stops[1]).toMatchObject({ id: 'stop-b', state: 'skipped' })
    await expect(trips.getOfflineQueue('trip-a')).resolves.toMatchObject({
      state: 'empty',
      pendingCount: 0,
    })

    await trips.queueOfflineAction('trip-a', { kind: 'mark_arrived', stopId: 'vanished-stop' })
    const halted = await trips.replayOffline('trip-a')
    expect(halted.stops[0]).toMatchObject({ id: 'stop-a', state: 'arrived' })
    expect(halted.stops[1]).toMatchObject({ id: 'stop-b', state: 'skipped' })
    await expect(trips.getOfflineQueue('trip-a')).resolves.toMatchObject({
      state: 'conflict',
      conflict: { id: 'mark_arrived', summary: expect.any(String) },
    })
    await expect(trips.resolveOfflineConflict('trip-a', 'saved')).resolves.toMatchObject({
      state: 'empty',
      pendingCount: 0,
    })
  })

  it('orders check-my-day by opening hours and persists private visit memory', async () => {
    const trips = createReviewHarnessClients(scenario('shopper-a'), 'success').trips!
    const fresh = await trips.create({ name: 'Hours demo', localDate: '2026-08-11' })
    await trips.updateSchedule(fresh.id, { localDate: '2026-08-11', departureMinute: 480 }, 1)
    const withBlueFinch = await trips.addStoreStop(fresh.id, '00000000-0000-4000-8000-000000000001')
    const withBoth = await trips.addStoreStop(fresh.id, '00000000-0000-4000-8000-000000000002')
    const blueFinchStop = withBlueFinch.stops.at(-1)!
    const cedarStop = withBoth.stops.at(-1)!
    expect(cedarStop.position).toBeGreaterThan(blueFinchStop.position)

    const suggestion = await trips.requestCheckMyDay!(fresh.id)
    expect(suggestion.state).toBe('suggested')
    if (suggestion.state === 'suggested') {
      expect(suggestion.orderedStopIds).toEqual([cedarStop.id, blueFinchStop.id])
    }

    const remembered = await trips.saveVisitMemory!(
      fresh.id,
      '00000000-0000-4000-8000-000000000001',
      { rating: 5, note: 'Walnut secretary', returnChoice: 'yes' },
    )
    expect(remembered.stops[0]).toMatchObject({ memoryStatus: 'saved' })
  })

  it('keeps shopper-b trips isolated while allowing self-created trips', async () => {
    const trips = createReviewHarnessClients(scenario('shopper-b'), 'success').trips!
    await expect(trips.list()).resolves.toEqual([])
    await expect(trips.get('trip-a')).resolves.toBeNull()
    await expect(trips.acceptInvitation('review-trip-invite-shopper-b')).rejects.toThrow(
      /trip unavailable/i,
    )
    const created = await trips.create({ name: 'B trip', localDate: '2026-08-10' })
    await expect(trips.list()).resolves.toEqual([expect.objectContaining({ id: created.id })])
  })
})
