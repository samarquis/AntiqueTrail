import { describe, expect, it } from 'vitest'
import {
  CommunityActivationMachine,
  COMMUNITY_MUTATION_LOCK_ORDER,
  type CommunityActionReceipt,
  type CommunityCancellationReceipt,
  type CommunityGateReceipt,
  type CommunityReadinessReceipt,
  type CommunityReactivationReceipt,
  type CommunitySelectionReceipt,
  type Rg01PassingReceipt,
} from './communityMachine'

const selection = (
  overrides: Partial<CommunitySelectionReceipt> = {},
): CommunitySelectionReceipt => ({
  id: 'selection-1',
  signed: true,
  responsibility: 'ProductOwner',
  areaSlug: 'osage-city',
  expectedPriorReceiptId: 'rg01-pass',
  selectedAreaCount: 1,
  eligibility: {
    outsideLargerMetro: true,
    withinSixtyMinuteDrive: true,
    antiqueOrVintageShopCount: 2,
    willingAnchorConfirmed: true,
  },
  ...overrides,
})

const rg01 = (overrides: Partial<Rg01PassingReceipt> = {}): Rg01PassingReceipt => ({
  id: 'rg01-pass',
  signed: true,
  responsibility: 'ProductOwner',
  decision: 'pass',
  frozenDigest: 'rg01:frozen:sha256',
  ...overrides,
})

const readiness = (
  overrides: Partial<CommunityReadinessReceipt> = {},
): CommunityReadinessReceipt => ({
  id: 'readiness-1',
  signed: true,
  responsibility: 'ProductOwner',
  areaSlug: 'osage-city',
  storeIds: ['store-anchor', 'store-two'],
  artifactBindingDigest: 'artifact:osage:v1',
  checks: {
    exactCatalogAndConsent: true,
    willingAnchorOwner: true,
    anchorInvitationConsentAuthority: true,
    twoPersonListingProvenance: true,
    primaryTesterSeparatePhoneTrip: true,
    independentTesterSeparatePhoneTrip: true,
    monitoring: true,
    recovery: true,
    security: true,
    supportPath: true,
    supportCapacity: true,
    quota: true,
    rollback: true,
    zeroBlockingPrivacySecurityDataLossDefects: true,
  },
  ...overrides,
})

const actionReceipt = (
  overrides: Partial<CommunityActionReceipt> = {},
): CommunityActionReceipt => ({
  id: 'activation-1',
  signed: true,
  responsibility: 'ProductOwner',
  areaSlug: 'osage-city',
  storeIds: ['store-anchor', 'store-two'],
  artifactBindingDigest: 'artifact:osage:v1',
  schemaDigest: 'schema:v1',
  configDigest: 'config:v1',
  recoveryAndCapacityConfirmed: true,
  channelConsentsConfirmed: true,
  canonicalRoute: '/stores?area=osage-city',
  allowlistedSourceCodes: ['osage-flyer'],
  ...overrides,
})

const cancellation = (
  overrides: Partial<CommunityCancellationReceipt> = {},
): CommunityCancellationReceipt => ({
  id: 'cancel-1',
  signed: true,
  responsibility: 'ProductOwner',
  areaSlug: 'osage-city',
  reason: 'Anchor withdrew before activation',
  ...overrides,
})

const reactivationReceipt = (
  overrides: Partial<CommunityReactivationReceipt> = {},
): CommunityReactivationReceipt => ({
  ...actionReceipt({ id: 'reactivation-1' }),
  repairReadinessConfirmed: true,
  ...overrides,
})

const gateReceipt = (overrides: Partial<CommunityGateReceipt> = {}): CommunityGateReceipt => ({
  id: 'gate-1',
  signed: true,
  responsibility: 'PrimaryInternalTester',
  mfaVerified: true,
  recentAuthentication: true,
  frozenDigestCapability: true,
  runId: 'community-run-1',
  areaSlug: 'osage-city',
  artifactBindingDigest: 'artifact:osage:v1',
  independentEvidenceDigest: 'gate-evidence:osage:v1',
  decision: 'pass',
  failedReasons: [],
  checks: {
    twoVerifiedActiveListings: true,
    anchorDirectEdit: true,
    reviewedControlledChange: true,
    anchorSupportRequest: true,
    primaryTesterSeparateAccountPhoneTrip: true,
    independentTesterSeparateAccountPhoneTrip: true,
    voluntaryShopperTripConfirmations: 5,
    noPreciseLocationTracking: true,
    monitoring: true,
    support: true,
    storeDataAccuracy: true,
    zeroBlockingPrivacySecurityDataLossDefects: true,
  },
  ...overrides,
})

describe('one-community activation state machine', () => {
  it('prepares ordinal one only from separate signed RG-01 and exact-area selection evidence', () => {
    const machine = new CommunityActivationMachine()

    const result = machine.prepare({
      areaSlug: 'osage-city',
      selectionReceipt: selection(),
      rg01Receipt: rg01(),
      expectedRootVersion: 1,
      idempotencyKey: 'prepare-osage-1',
    })

    expect(result.root).toMatchObject({
      id: 1,
      lastActivationOrdinal: 0,
      lastAttemptSequence: 1,
      activeRunId: result.run.id,
      version: 2,
    })
    expect(result.run).toMatchObject({
      attemptSequence: 1,
      targetOrdinal: 1,
      activationOrdinal: null,
      areaSlug: 'osage-city',
      selectionReceiptId: 'selection-1',
      rg01ReceiptId: 'rg01-pass',
      priorGateReceiptId: null,
      state: 'prepared',
    })
    expect(result.lockOrder).toEqual(COMMUNITY_MUTATION_LOCK_ORDER)
    expect(machine.publicStores('osage-city')).toEqual([])
  })

  it('blocks preparation when signed human eligibility evidence is absent or names a larger metro', () => {
    const unsignedMachine = new CommunityActivationMachine()
    expect(() =>
      unsignedMachine.prepare({
        areaSlug: 'osage-city',
        selectionReceipt: selection({ signed: false }),
        rg01Receipt: rg01(),
        expectedRootVersion: 1,
        idempotencyKey: 'unsigned-selection',
      }),
    ).toThrow('community_selection_evidence_invalid')

    const metroMachine = new CommunityActivationMachine()
    expect(() =>
      metroMachine.prepare({
        areaSlug: 'kansas-city',
        selectionReceipt: selection({
          areaSlug: 'kansas-city',
          eligibility: {
            ...selection().eligibility,
            outsideLargerMetro: false,
          },
        }),
        rg01Receipt: rg01(),
        expectedRootVersion: 1,
        idempotencyKey: 'larger-metro-selection',
      }),
    ).toThrow('community_selection_evidence_invalid')
  })

  it('freezes an exact nonpublic store set and signs readiness only with complete external evidence', () => {
    const machine = new CommunityActivationMachine()
    const prepared = machine.prepare({
      areaSlug: 'osage-city',
      selectionReceipt: selection(),
      rg01Receipt: rg01(),
      expectedRootVersion: 1,
      idempotencyKey: 'prepare-osage',
    })

    const frozen = machine.freezeCatalog({
      runId: prepared.run.id,
      stores: [
        {
          storeId: 'store-two',
          verifiedActive: true,
          provenanceVerifierIds: ['verifier-a', 'verifier-b'],
        },
        {
          storeId: 'store-anchor',
          verifiedActive: true,
          provenanceVerifierIds: ['verifier-a', 'verifier-b'],
        },
      ],
      anchor: {
        storeId: 'store-anchor',
        ownerEvidenceId: 'owner-evidence-1',
        willing: true,
        invitationConsentAuthorityComplete: true,
      },
      artifactBindingDigest: 'artifact:osage:v1',
      expectedRootVersion: 2,
      expectedRunVersion: 1,
      idempotencyKey: 'freeze-osage',
    })

    expect(frozen.projection).toEqual({
      runId: prepared.run.id,
      areaSlug: 'osage-city',
      storeIds: ['store-anchor', 'store-two'],
      artifactBindingDigest: 'artifact:osage:v1',
      visible: false,
    })
    expect(machine.publicStores('osage-city')).toEqual([])

    const signed = machine.signReadiness({
      runId: prepared.run.id,
      receipt: readiness(),
      expectedRootVersion: 3,
      expectedRunVersion: 2,
      idempotencyKey: 'sign-osage-readiness',
    })
    expect(signed.run.state).toBe('readiness_signed')
    expect(signed.run.readinessReceiptId).toBe('readiness-1')
    expect(machine.publicStores('osage-city')).toEqual([])
  })

  it('rejects weak listing provenance and idempotently freezes only the validated exact set', () => {
    const machine = new CommunityActivationMachine()
    machine.prepare({
      areaSlug: 'osage-city',
      selectionReceipt: selection(),
      rg01Receipt: rg01(),
      expectedRootVersion: 1,
      idempotencyKey: 'prepare-freeze-check',
    })
    expect(() =>
      machine.freezeCatalog({
        runId: 'community-run-1',
        stores: [
          {
            storeId: 'store-anchor',
            verifiedActive: true,
            provenanceVerifierIds: ['one-verifier'],
          },
        ],
        anchor: {
          storeId: 'store-anchor',
          ownerEvidenceId: 'owner-evidence-1',
          willing: true,
          invitationConsentAuthorityComplete: true,
        },
        artifactBindingDigest: 'artifact:weak',
        expectedRootVersion: 2,
        expectedRunVersion: 1,
        idempotencyKey: 'weak-freeze',
      }),
    ).toThrow('community_verified_store_evidence_incomplete')

    const command = {
      runId: 'community-run-1',
      stores: [
        {
          storeId: 'store-anchor',
          verifiedActive: true,
          provenanceVerifierIds: ['verifier-a', 'verifier-b'],
        },
        {
          storeId: 'store-two',
          verifiedActive: true,
          provenanceVerifierIds: ['verifier-a', 'verifier-b'],
        },
      ],
      anchor: {
        storeId: 'store-anchor',
        ownerEvidenceId: 'owner-evidence-1',
        willing: true,
        invitationConsentAuthorityComplete: true,
      },
      artifactBindingDigest: 'artifact:osage:v1',
      expectedRootVersion: 2,
      expectedRunVersion: 1,
      idempotencyKey: 'freeze-exact-set',
    } as const
    const frozen = machine.freezeCatalog(command)
    expect(machine.freezeCatalog(command)).toEqual(frozen)
    expect(() =>
      machine.freezeCatalog({ ...command, artifactBindingDigest: 'artifact:changed' }),
    ).toThrow('community_idempotency_mismatch')
  })

  it('denies readiness when any required predicate is missing instead of inventing evidence', () => {
    const machine = preparedAndFrozenMachine()
    expect(() =>
      machine.signReadiness({
        runId: 'community-run-1',
        receipt: readiness({ checks: { ...readiness().checks, recovery: false } }),
        expectedRootVersion: 3,
        expectedRunVersion: 2,
        idempotencyKey: 'sign-incomplete-readiness',
      }),
    ).toThrow('community_readiness_evidence_incomplete')
  })

  it('activates only the frozen exact area/store set and safely replays a lost response', () => {
    const machine = readyMachine()
    const command = {
      runId: 'community-run-1',
      receipt: actionReceipt(),
      expectedRootVersion: 4,
      expectedRunVersion: 3,
      idempotencyKey: 'activate-osage-1',
    }

    const activated = machine.activate(command)
    expect(activated.root).toMatchObject({
      lastActivationOrdinal: 1,
      activeRunId: null,
      version: 5,
    })
    expect(activated.run).toMatchObject({
      state: 'live',
      activationOrdinal: 1,
      activationReceiptId: 'activation-1',
      version: 4,
    })
    expect(machine.publicStores('osage-city')).toEqual(['store-anchor', 'store-two'])
    expect(machine.publicStores('topeka')).toEqual([])
    expect(machine.publicStores('another-area')).toEqual([])
    expect(machine.activate(command)).toEqual(activated)
    expect(() => machine.activate({ ...command, receipt: actionReceipt({ id: 'other' }) })).toThrow(
      'community_idempotency_mismatch',
    )
  })

  it('keeps visibility and ordinal unchanged when activation validation fails', () => {
    const machine = readyMachine()
    expect(() =>
      machine.activate({
        runId: 'community-run-1',
        receipt: actionReceipt({ areaSlug: 'wrong-area' }),
        expectedRootVersion: 4,
        expectedRunVersion: 3,
        idempotencyKey: 'wrong-area-activation',
      }),
    ).toThrow('community_action_receipt_binding_invalid')
    expect(() =>
      machine.activate({
        runId: 'community-run-1',
        receipt: actionReceipt({ canonicalRoute: '/areas/osage-city' }),
        expectedRootVersion: 4,
        expectedRunVersion: 3,
        idempotencyKey: 'legacy-area-route-activation',
      }),
    ).toThrow('community_action_receipt_binding_invalid')
    expect(machine.publicStores('osage-city')).toEqual([])
    expect(machine.snapshot().root.lastActivationOrdinal).toBe(0)
  })

  it('cancels preparation without advancing and repairs the same ordinal with a new attempt', () => {
    const machine = new CommunityActivationMachine()
    machine.prepare({
      areaSlug: 'osage-city',
      selectionReceipt: selection(),
      rg01Receipt: rg01(),
      expectedRootVersion: 1,
      idempotencyKey: 'prepare-to-cancel',
    })
    const cancelled = machine.cancelPreparation({
      runId: 'community-run-1',
      receipt: cancellation(),
      reason: 'Anchor withdrew before activation',
      expectedRootVersion: 2,
      expectedRunVersion: 1,
      idempotencyKey: 'cancel-osage',
    })
    expect(cancelled.root).toMatchObject({
      lastActivationOrdinal: 0,
      lastAttemptSequence: 1,
      activeRunId: null,
    })
    expect(cancelled.run.state).toBe('cancelled')

    const repair = machine.prepare({
      areaSlug: 'osage-city',
      selectionReceipt: selection({ id: 'selection-repair' }),
      rg01Receipt: rg01(),
      expectedRootVersion: 3,
      idempotencyKey: 'prepare-repair',
    })
    expect(repair.run).toMatchObject({ attemptSequence: 2, targetOrdinal: 1 })
    expect(repair.root.lastActivationOrdinal).toBe(0)
    expect(machine.publicStores('osage-city')).toEqual([])
  })

  it('rolls back visibility and reactivates the same frozen set without advancing the ordinal', () => {
    const machine = liveMachine()
    const withdrawn = machine.rollback({
      runId: 'community-run-1',
      receipt: actionReceipt({ id: 'rollback-1' }),
      expectedRootVersion: 5,
      expectedRunVersion: 4,
      idempotencyKey: 'rollback-osage',
    })
    expect(withdrawn.root.lastActivationOrdinal).toBe(1)
    expect(withdrawn.run).toMatchObject({
      state: 'withdrawn',
      activationOrdinal: 1,
      rollbackReceiptId: 'rollback-1',
    })
    expect(machine.publicStores('osage-city')).toEqual([])
    expect(() =>
      machine.prepare({
        areaSlug: 'emporia',
        selectionReceipt: selection({
          id: 'selection-emporia',
          areaSlug: 'emporia',
          expectedPriorReceiptId: 'not-yet-available',
        }),
        expectedRootVersion: 6,
        idempotencyKey: 'prepare-while-withdrawn',
      }),
    ).toThrow('community_prior_area_not_live')

    const repaired = machine.reactivate({
      runId: 'community-run-1',
      receipt: reactivationReceipt(),
      expectedRootVersion: 6,
      expectedRunVersion: 5,
      idempotencyKey: 'reactivate-osage',
    })
    expect(repaired.root.lastActivationOrdinal).toBe(1)
    expect(repaired.run).toMatchObject({
      state: 'live',
      activationOrdinal: 1,
      reactivationReceiptId: 'reactivation-1',
    })
    expect(machine.publicStores('osage-city')).toEqual(['store-anchor', 'store-two'])
  })

  it('passes the postactivation gate only with exact independent Primary Internal Tester evidence', () => {
    const machine = liveMachine()
    expect(() =>
      machine.decideGate({
        runId: 'community-run-1',
        receipt: gateReceipt({
          checks: { ...gateReceipt().checks, voluntaryShopperTripConfirmations: 4 },
        }),
        expectedRootVersion: 5,
        expectedRunVersion: 4,
        idempotencyKey: 'invalid-gate-pass',
      }),
    ).toThrow('community_gate_pass_evidence_incomplete')
    expect(machine.publicStores('osage-city')).toEqual(['store-anchor', 'store-two'])

    expect(() =>
      machine.decideGate({
        runId: 'community-run-1',
        receipt: gateReceipt({ responsibility: 'ProductOwner' }),
        expectedRootVersion: 5,
        expectedRunVersion: 4,
        idempotencyKey: 'wrong-gate-signer',
      }),
    ).toThrow('community_gate_authorization_invalid')

    const passed = machine.decideGate({
      runId: 'community-run-1',
      receipt: gateReceipt(),
      expectedRootVersion: 5,
      expectedRunVersion: 4,
      idempotencyKey: 'pass-osage-gate',
    })
    expect(passed.run.gate).toEqual({ receiptId: 'gate-1', decision: 'pass' })
    expect(passed.run.state).toBe('live')
  })

  it('withdraws a rejected area and blocks the next ordinal', () => {
    const machine = liveMachine()
    const rejected = machine.decideGate({
      runId: 'community-run-1',
      receipt: gateReceipt({
        id: 'gate-reject-1',
        decision: 'reject',
        failedReasons: ['Monitoring did not pass'],
        checks: { ...gateReceipt().checks, monitoring: false },
      }),
      expectedRootVersion: 5,
      expectedRunVersion: 4,
      idempotencyKey: 'reject-osage-gate',
    })
    expect(rejected.run.state).toBe('withdrawn')
    expect(machine.publicStores('osage-city')).toEqual([])
    expect(() =>
      machine.prepare({
        areaSlug: 'emporia',
        selectionReceipt: selectionFor('selection-2', 'emporia', 'gate-reject-1'),
        expectedRootVersion: 6,
        idempotencyKey: 'prepare-after-rejection',
      }),
    ).toThrow('community_prior_area_not_live')
  })

  it('requires each immediately prior passing gate, activates ordinals two and three, and denies four', () => {
    const machine = liveMachine()
    passGate(machine, 'community-run-1', gateReceipt(), 'pass-gate-1')

    const run2 = prepareNext(machine, 'emporia', 'selection-2', 'gate-1')
    activateRun(machine, run2.run.id, 'emporia', 'two')
    passGate(
      machine,
      run2.run.id,
      gateForRun(run2.run.id, 'emporia', 'two', 'gate-2'),
      'pass-gate-2',
    )

    const run3 = prepareNext(machine, 'abilene', 'selection-3', 'gate-2')
    activateRun(machine, run3.run.id, 'abilene', 'three')
    passGate(
      machine,
      run3.run.id,
      gateForRun(run3.run.id, 'abilene', 'three', 'gate-3'),
      'pass-gate-3',
    )

    expect(machine.snapshot().root.lastActivationOrdinal).toBe(3)
    expect(machine.publicStores('osage-city')).toEqual(['store-anchor', 'store-two'])
    expect(machine.publicStores('emporia')).toEqual(['two-anchor', 'two-store'])
    expect(machine.publicStores('abilene')).toEqual(['three-anchor', 'three-store'])
    expect(() =>
      machine.prepare({
        areaSlug: 'lawrence',
        selectionReceipt: selectionFor('selection-4', 'lawrence', 'gate-3'),
        expectedRootVersion: machine.snapshot().root.version,
        idempotencyKey: 'ordinal-four-denied',
      }),
    ).toThrow('community_ordinal_denied')
  })

  it('denies RG-01 substitution and a selection bound to the wrong prior gate', () => {
    const machine = liveMachine()
    passGate(machine, 'community-run-1', gateReceipt(), 'pass-gate-for-chain-check')
    const rootVersion = machine.snapshot().root.version
    expect(() =>
      machine.prepare({
        areaSlug: 'emporia',
        selectionReceipt: selectionFor('selection-substitution', 'emporia', 'rg01-pass'),
        rg01Receipt: rg01(),
        expectedRootVersion: rootVersion,
        idempotencyKey: 'rg-substitution',
      }),
    ).toThrow('community_rg01_substitution_denied')
    expect(() =>
      machine.prepare({
        areaSlug: 'emporia',
        selectionReceipt: selectionFor('selection-wrong-gate', 'emporia', 'some-other-gate'),
        expectedRootVersion: rootVersion,
        idempotencyKey: 'wrong-prior-gate',
      }),
    ).toThrow('community_wrong_prior_gate')
  })
})

function preparedAndFrozenMachine(): CommunityActivationMachine {
  const machine = new CommunityActivationMachine()
  machine.prepare({
    areaSlug: 'osage-city',
    selectionReceipt: selection(),
    rg01Receipt: rg01(),
    expectedRootVersion: 1,
    idempotencyKey: 'prepare-osage',
  })
  machine.freezeCatalog({
    runId: 'community-run-1',
    stores: [
      {
        storeId: 'store-anchor',
        verifiedActive: true,
        provenanceVerifierIds: ['verifier-a', 'verifier-b'],
      },
      {
        storeId: 'store-two',
        verifiedActive: true,
        provenanceVerifierIds: ['verifier-a', 'verifier-b'],
      },
    ],
    anchor: {
      storeId: 'store-anchor',
      ownerEvidenceId: 'owner-evidence-1',
      willing: true,
      invitationConsentAuthorityComplete: true,
    },
    artifactBindingDigest: 'artifact:osage:v1',
    expectedRootVersion: 2,
    expectedRunVersion: 1,
    idempotencyKey: 'freeze-osage',
  })
  return machine
}

function readyMachine(): CommunityActivationMachine {
  const machine = preparedAndFrozenMachine()
  machine.signReadiness({
    runId: 'community-run-1',
    receipt: readiness(),
    expectedRootVersion: 3,
    expectedRunVersion: 2,
    idempotencyKey: 'sign-osage',
  })
  return machine
}

function liveMachine(): CommunityActivationMachine {
  const machine = readyMachine()
  machine.activate({
    runId: 'community-run-1',
    receipt: actionReceipt(),
    expectedRootVersion: 4,
    expectedRunVersion: 3,
    idempotencyKey: 'activate-osage',
  })
  return machine
}

function selectionFor(
  id: string,
  areaSlug: string,
  expectedPriorReceiptId: string,
): CommunitySelectionReceipt {
  return selection({ id, areaSlug, expectedPriorReceiptId })
}

function gateForRun(
  runId: string,
  areaSlug: string,
  suffix: string,
  id: string,
): CommunityGateReceipt {
  return gateReceipt({
    id,
    runId,
    areaSlug,
    artifactBindingDigest: `artifact:${suffix}:v1`,
    independentEvidenceDigest: `gate-evidence:${suffix}:v1`,
  })
}

function prepareNext(
  machine: CommunityActivationMachine,
  areaSlug: string,
  selectionId: string,
  priorGateId: string,
) {
  return machine.prepare({
    areaSlug,
    selectionReceipt: selectionFor(selectionId, areaSlug, priorGateId),
    expectedRootVersion: machine.snapshot().root.version,
    idempotencyKey: `prepare-${areaSlug}`,
  })
}

function activateRun(
  machine: CommunityActivationMachine,
  runId: string,
  areaSlug: string,
  suffix: string,
): void {
  let snapshot = machine.snapshot()
  let run = snapshot.runs.find((item) => item.id === runId)!
  machine.freezeCatalog({
    runId,
    stores: [
      {
        storeId: `${suffix}-anchor`,
        verifiedActive: true,
        provenanceVerifierIds: ['verifier-a', 'verifier-b'],
      },
      {
        storeId: `${suffix}-store`,
        verifiedActive: true,
        provenanceVerifierIds: ['verifier-a', 'verifier-b'],
      },
    ],
    anchor: {
      storeId: `${suffix}-anchor`,
      ownerEvidenceId: `owner-${suffix}`,
      willing: true,
      invitationConsentAuthorityComplete: true,
    },
    artifactBindingDigest: `artifact:${suffix}:v1`,
    expectedRootVersion: snapshot.root.version,
    expectedRunVersion: run.version,
    idempotencyKey: `freeze-${suffix}`,
  })
  snapshot = machine.snapshot()
  run = snapshot.runs.find((item) => item.id === runId)!
  machine.signReadiness({
    runId,
    receipt: readiness({
      id: `readiness-${suffix}`,
      areaSlug,
      storeIds: [`${suffix}-anchor`, `${suffix}-store`],
      artifactBindingDigest: `artifact:${suffix}:v1`,
    }),
    expectedRootVersion: snapshot.root.version,
    expectedRunVersion: run.version,
    idempotencyKey: `readiness-${suffix}`,
  })
  snapshot = machine.snapshot()
  run = snapshot.runs.find((item) => item.id === runId)!
  machine.activate({
    runId,
    receipt: actionReceipt({
      id: `activation-${suffix}`,
      areaSlug,
      storeIds: [`${suffix}-anchor`, `${suffix}-store`],
      artifactBindingDigest: `artifact:${suffix}:v1`,
      canonicalRoute: `/stores?area=${areaSlug}`,
      allowlistedSourceCodes: [`${suffix}-flyer`],
    }),
    expectedRootVersion: snapshot.root.version,
    expectedRunVersion: run.version,
    idempotencyKey: `activate-${suffix}`,
  })
}

function passGate(
  machine: CommunityActivationMachine,
  runId: string,
  receipt: CommunityGateReceipt,
  idempotencyKey: string,
): void {
  const snapshot = machine.snapshot()
  const run = snapshot.runs.find((item) => item.id === runId)!
  machine.decideGate({
    runId,
    receipt,
    expectedRootVersion: snapshot.root.version,
    expectedRunVersion: run.version,
    idempotencyKey,
  })
}
