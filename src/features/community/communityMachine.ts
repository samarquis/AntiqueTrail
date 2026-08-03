export const COMMUNITY_MUTATION_LOCK_ORDER = [
  'community_expansion_root',
  'community_activation_run',
  'community_catalog_projection',
] as const

export type CommunityRunState = 'prepared' | 'readiness_signed' | 'live' | 'withdrawn' | 'cancelled'

export interface CommunityExpansionRoot {
  id: 1
  lastActivationOrdinal: 0 | 1 | 2 | 3
  lastAttemptSequence: number
  activeRunId: string | null
  version: number
}

export interface CommunitySelectionReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  areaSlug: string
  expectedPriorReceiptId: string
  selectedAreaCount: number
  eligibility: {
    outsideLargerMetro: boolean
    withinSixtyMinuteDrive: boolean
    antiqueOrVintageShopCount: number
    willingAnchorConfirmed: boolean
  }
}

export interface Rg01PassingReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  decision: 'pass' | 'reject'
  frozenDigest: string
}

export interface CommunityVerifiedStore {
  storeId: string
  verifiedActive: boolean
  provenanceVerifierIds: readonly string[]
}

export interface CommunityAnchorEvidence {
  storeId: string
  ownerEvidenceId: string
  willing: boolean
  invitationConsentAuthorityComplete: boolean
}

export interface CommunityReadinessChecks {
  exactCatalogAndConsent: boolean
  willingAnchorOwner: boolean
  anchorInvitationConsentAuthority: boolean
  twoPersonListingProvenance: boolean
  primaryTesterSeparatePhoneTrip: boolean
  independentTesterSeparatePhoneTrip: boolean
  monitoring: boolean
  recovery: boolean
  security: boolean
  supportPath: boolean
  supportCapacity: boolean
  quota: boolean
  rollback: boolean
  zeroBlockingPrivacySecurityDataLossDefects: boolean
}

export interface CommunityReadinessReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  areaSlug: string
  storeIds: readonly string[]
  artifactBindingDigest: string
  checks: CommunityReadinessChecks
}

export interface CommunityActionReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  areaSlug: string
  storeIds: readonly string[]
  artifactBindingDigest: string
  schemaDigest: string
  configDigest: string
  recoveryAndCapacityConfirmed: boolean
  channelConsentsConfirmed: boolean
  canonicalRoute: string
  allowlistedSourceCodes: readonly string[]
}

export interface CommunityCancellationReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  areaSlug: string
  reason: string
}

export interface CommunityReactivationReceipt extends CommunityActionReceipt {
  repairReadinessConfirmed: boolean
}

export interface CommunityGateChecks {
  twoVerifiedActiveListings: boolean
  anchorDirectEdit: boolean
  reviewedControlledChange: boolean
  anchorSupportRequest: boolean
  primaryTesterSeparateAccountPhoneTrip: boolean
  independentTesterSeparateAccountPhoneTrip: boolean
  voluntaryShopperTripConfirmations: number
  noPreciseLocationTracking: boolean
  monitoring: boolean
  support: boolean
  storeDataAccuracy: boolean
  zeroBlockingPrivacySecurityDataLossDefects: boolean
}

export interface CommunityGateReceipt {
  id: string
  signed: boolean
  responsibility: 'ProductOwner' | 'Administrator' | 'PrimaryInternalTester'
  mfaVerified: boolean
  recentAuthentication: boolean
  frozenDigestCapability: boolean
  runId: string
  areaSlug: string
  artifactBindingDigest: string
  independentEvidenceDigest: string
  decision: 'pass' | 'reject'
  failedReasons: readonly string[]
  checks: CommunityGateChecks
}

export interface CommunityActivationRun {
  id: string
  attemptSequence: number
  targetOrdinal: 1 | 2 | 3
  activationOrdinal: 1 | 2 | 3 | null
  areaSlug: string
  selectionReceiptId: string
  rg01ReceiptId: string | null
  priorGateReceiptId: string | null
  state: CommunityRunState
  version: number
  frozenCatalog: CommunityCatalogProjection | null
  readinessReceiptId: string | null
  cancellationReceiptId: string | null
  activationReceiptId: string | null
  rollbackReceiptId: string | null
  reactivationReceiptId: string | null
  gate: CommunityGateDecision | null
}

export interface CommunityCatalogProjection {
  runId: string
  areaSlug: string
  storeIds: readonly string[]
  artifactBindingDigest: string
  visible: boolean
}

export interface CommunityGateDecision {
  receiptId: string
  decision: 'pass' | 'reject'
}

export interface CommunityMutationResult {
  root: CommunityExpansionRoot
  run: CommunityActivationRun
  projection: CommunityCatalogProjection | null
  lockOrder: typeof COMMUNITY_MUTATION_LOCK_ORDER
}

export class CommunityActivationMachine {
  #root: CommunityExpansionRoot = {
    id: 1,
    lastActivationOrdinal: 0,
    lastAttemptSequence: 0,
    activeRunId: null,
    version: 1,
  }
  readonly #runs = new Map<string, CommunityActivationRun>()
  readonly #idempotency = new Map<
    string,
    { fingerprint: string; result: CommunityMutationResult }
  >()

  prepare(input: {
    areaSlug: string
    selectionReceipt: CommunitySelectionReceipt
    rg01Receipt?: Rg01PassingReceipt
    expectedRootVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('prepare', input.idempotencyKey, input, () => {
      assertVersion(
        input.expectedRootVersion,
        this.#root.version,
        'community_root_version_conflict',
      )
      if (this.#root.activeRunId) throw new Error('community_active_run_exists')
      const targetOrdinal = this.#root.lastActivationOrdinal + 1
      if (targetOrdinal < 1 || targetOrdinal > 3) throw new Error('community_ordinal_denied')
      assertAreaSlug(input.areaSlug)
      assertSelection(input.selectionReceipt, input.areaSlug)
      if (
        [...this.#runs.values()].some((run) => run.selectionReceiptId === input.selectionReceipt.id)
      ) {
        throw new Error('community_selection_receipt_reused')
      }
      this.#assertReceiptUnused(input.selectionReceipt.id)
      if (
        [...this.#runs.values()].some(
          (run) => run.areaSlug === input.areaSlug && run.state !== 'cancelled',
        )
      ) {
        throw new Error('community_area_already_reserved')
      }

      let rg01ReceiptId: string | null = null
      let priorGateReceiptId: string | null = null
      if (targetOrdinal === 1) {
        assertRg01(input.rg01Receipt)
        if (input.selectionReceipt.expectedPriorReceiptId !== input.rg01Receipt.id) {
          throw new Error('community_wrong_rg01_receipt')
        }
        if (input.selectionReceipt.id === input.rg01Receipt.id) {
          throw new Error('community_conflicting_receipt')
        }
        rg01ReceiptId = input.rg01Receipt.id
      } else {
        if (input.rg01Receipt) throw new Error('community_rg01_substitution_denied')
        const priorRun = this.#runAtOrdinal((targetOrdinal - 1) as 1 | 2)
        if (priorRun.state !== 'live') throw new Error('community_prior_area_not_live')
        if (priorRun.gate?.decision !== 'pass') throw new Error('community_prior_gate_required')
        if (input.selectionReceipt.expectedPriorReceiptId !== priorRun.gate.receiptId) {
          throw new Error('community_wrong_prior_gate')
        }
        if (input.selectionReceipt.id === priorRun.gate.receiptId) {
          throw new Error('community_conflicting_receipt')
        }
        priorGateReceiptId = priorRun.gate.receiptId
      }

      const attemptSequence = this.#root.lastAttemptSequence + 1
      const run: CommunityActivationRun = {
        id: `community-run-${attemptSequence}`,
        attemptSequence,
        targetOrdinal: targetOrdinal as 1 | 2 | 3,
        activationOrdinal: null,
        areaSlug: input.areaSlug,
        selectionReceiptId: input.selectionReceipt.id,
        rg01ReceiptId,
        priorGateReceiptId,
        state: 'prepared',
        version: 1,
        frozenCatalog: null,
        readinessReceiptId: null,
        cancellationReceiptId: null,
        activationReceiptId: null,
        rollbackReceiptId: null,
        reactivationReceiptId: null,
        gate: null,
      }
      this.#runs.set(run.id, run)
      this.#root = {
        ...this.#root,
        lastAttemptSequence: attemptSequence,
        activeRunId: run.id,
        version: this.#root.version + 1,
      }
      return this.#result(run)
    })
  }

  freezeCatalog(input: {
    runId: string
    stores: readonly CommunityVerifiedStore[]
    anchor: CommunityAnchorEvidence
    artifactBindingDigest: string
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('freezeCatalog', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (this.#root.activeRunId !== run.id || run.state !== 'prepared' || run.frozenCatalog) {
        throw new Error('community_catalog_freeze_state_invalid')
      }
      const storeIds = assertFrozenStoreEvidence(input.stores, input.anchor)
      if (!input.artifactBindingDigest.trim()) {
        throw new Error('community_artifact_binding_required')
      }
      run.frozenCatalog = {
        runId: run.id,
        areaSlug: run.areaSlug,
        storeIds,
        artifactBindingDigest: input.artifactBindingDigest,
        visible: false,
      }
      this.#advanceVersions(run)
      return this.#result(run)
    })
  }

  signReadiness(input: {
    runId: string
    receipt: CommunityReadinessReceipt
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('signReadiness', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (this.#root.activeRunId !== run.id || run.state !== 'prepared' || !run.frozenCatalog) {
        throw new Error('community_readiness_state_invalid')
      }
      assertReadinessReceipt(input.receipt, run)
      this.#assertReceiptUnused(input.receipt.id)
      run.state = 'readiness_signed'
      run.readinessReceiptId = input.receipt.id
      this.#advanceVersions(run)
      return this.#result(run)
    })
  }

  cancelPreparation(input: {
    runId: string
    receipt: CommunityCancellationReceipt
    reason: string
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('cancelPreparation', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (
        this.#root.activeRunId !== run.id ||
        !['prepared', 'readiness_signed'].includes(run.state)
      ) {
        throw new Error('community_cancellation_state_invalid')
      }
      assertCancellationReceipt(input.receipt, run, input.reason)
      this.#assertReceiptUnused(input.receipt.id)
      run.state = 'cancelled'
      run.cancellationReceiptId = input.receipt.id
      if (run.frozenCatalog) run.frozenCatalog.visible = false
      run.version += 1
      this.#root = {
        ...this.#root,
        activeRunId: null,
        version: this.#root.version + 1,
      }
      return this.#result(run)
    })
  }

  activate(input: {
    runId: string
    receipt: CommunityActionReceipt
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('activate', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (
        this.#root.activeRunId !== run.id ||
        run.state !== 'readiness_signed' ||
        !run.frozenCatalog ||
        run.frozenCatalog.visible ||
        run.targetOrdinal !== this.#root.lastActivationOrdinal + 1
      ) {
        throw new Error('community_activation_state_invalid')
      }
      assertActionReceipt(input.receipt, run)
      this.#assertReceiptUnused(input.receipt.id)

      // All validation precedes this exact projection flip. The persistence
      // adapter applies these assignments in one lock-ordered transaction.
      run.frozenCatalog.visible = true
      run.state = 'live'
      run.activationOrdinal = run.targetOrdinal
      run.activationReceiptId = input.receipt.id
      run.version += 1
      this.#root = {
        ...this.#root,
        lastActivationOrdinal: run.targetOrdinal,
        activeRunId: null,
        version: this.#root.version + 1,
      }
      return this.#result(run)
    })
  }

  rollback(input: {
    runId: string
    receipt: CommunityActionReceipt
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('rollback', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (
        this.#root.activeRunId !== null ||
        run.state !== 'live' ||
        !run.activationOrdinal ||
        run.activationOrdinal !== this.#root.lastActivationOrdinal ||
        !run.frozenCatalog?.visible
      ) {
        throw new Error('community_rollback_state_invalid')
      }
      assertActionReceipt(input.receipt, run)
      this.#assertReceiptUnused(input.receipt.id)
      run.frozenCatalog.visible = false
      run.state = 'withdrawn'
      run.rollbackReceiptId = input.receipt.id
      run.gate = null
      this.#advanceVersions(run)
      return this.#result(run)
    })
  }

  reactivate(input: {
    runId: string
    receipt: CommunityReactivationReceipt
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('reactivate', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (
        this.#root.activeRunId !== null ||
        run.state !== 'withdrawn' ||
        !run.activationOrdinal ||
        run.activationOrdinal !== this.#root.lastActivationOrdinal ||
        !run.frozenCatalog ||
        run.frozenCatalog.visible
      ) {
        throw new Error('community_reactivation_state_invalid')
      }
      assertActionReceipt(input.receipt, run)
      if (!input.receipt.repairReadinessConfirmed) {
        throw new Error('community_repair_readiness_required')
      }
      this.#assertReceiptUnused(input.receipt.id)
      run.frozenCatalog.visible = true
      run.state = 'live'
      run.reactivationReceiptId = input.receipt.id
      run.gate = null
      this.#advanceVersions(run)
      return this.#result(run)
    })
  }

  decideGate(input: {
    runId: string
    receipt: CommunityGateReceipt
    expectedRootVersion: number
    expectedRunVersion: number
    idempotencyKey: string
  }): CommunityMutationResult {
    return this.#execute('decideGate', input.idempotencyKey, input, () => {
      const run = this.#mutableRun(input.runId)
      this.#assertMutationVersions(run, input.expectedRootVersion, input.expectedRunVersion)
      if (
        run.state !== 'live' ||
        run.activationOrdinal !== this.#root.lastActivationOrdinal ||
        !run.frozenCatalog?.visible ||
        run.gate
      ) {
        throw new Error('community_gate_state_invalid')
      }
      assertGateReceipt(input.receipt, run)
      this.#assertReceiptUnused(input.receipt.id)
      run.gate = { receiptId: input.receipt.id, decision: input.receipt.decision }
      if (input.receipt.decision === 'reject') {
        run.frozenCatalog.visible = false
        run.state = 'withdrawn'
      }
      this.#advanceVersions(run)
      return this.#result(run)
    })
  }

  snapshot(): {
    root: CommunityExpansionRoot
    runs: readonly CommunityActivationRun[]
  } {
    return clone({ root: this.#root, runs: [...this.#runs.values()] })
  }

  publicStores(areaSlug: string): readonly string[] {
    const projection = [...this.#runs.values()]
      .map((run) => run.frozenCatalog)
      .find((item) => item?.areaSlug === areaSlug && item.visible)
    return projection ? [...projection.storeIds] : []
  }

  #runAtOrdinal(ordinal: 1 | 2 | 3): CommunityActivationRun {
    const run = [...this.#runs.values()].find((item) => item.activationOrdinal === ordinal)
    if (!run) throw new Error('community_prior_activation_required')
    return run
  }

  #mutableRun(runId: string): CommunityActivationRun {
    const run = this.#runs.get(runId)
    if (!run) throw new Error('community_run_not_available')
    return run
  }

  #assertMutationVersions(
    run: CommunityActivationRun,
    expectedRootVersion: number,
    expectedRunVersion: number,
  ): void {
    assertVersion(expectedRootVersion, this.#root.version, 'community_root_version_conflict')
    assertVersion(expectedRunVersion, run.version, 'community_run_version_conflict')
  }

  #advanceVersions(run: CommunityActivationRun): void {
    run.version += 1
    this.#root = { ...this.#root, version: this.#root.version + 1 }
  }

  #assertReceiptUnused(receiptId: string): void {
    const used = [...this.#runs.values()].some(
      (run) =>
        run.selectionReceiptId === receiptId ||
        run.rg01ReceiptId === receiptId ||
        run.priorGateReceiptId === receiptId ||
        run.readinessReceiptId === receiptId ||
        run.cancellationReceiptId === receiptId ||
        run.activationReceiptId === receiptId ||
        run.rollbackReceiptId === receiptId ||
        run.reactivationReceiptId === receiptId ||
        run.gate?.receiptId === receiptId,
    )
    if (used) throw new Error('community_receipt_reused')
  }

  #execute<T extends object>(
    operation: string,
    key: string,
    input: T,
    mutate: () => CommunityMutationResult,
  ): CommunityMutationResult {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) {
      throw new Error('community_idempotency_key_invalid')
    }
    const fingerprint = stableStringify({ operation, input })
    const previous = this.#idempotency.get(key)
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error('community_idempotency_mismatch')
      return clone(previous.result)
    }
    const result = mutate()
    this.#idempotency.set(key, { fingerprint, result: clone(result) })
    return clone(result)
  }

  #result(run: CommunityActivationRun): CommunityMutationResult {
    return clone({
      root: this.#root,
      run,
      projection: run.frozenCatalog,
      lockOrder: COMMUNITY_MUTATION_LOCK_ORDER,
    })
  }
}

function assertSelection(receipt: CommunitySelectionReceipt, areaSlug: string): void {
  if (
    !receipt.id ||
    !receipt.signed ||
    receipt.responsibility !== 'ProductOwner' ||
    receipt.areaSlug !== areaSlug ||
    receipt.selectedAreaCount !== 1 ||
    !receipt.expectedPriorReceiptId ||
    !receipt.eligibility.outsideLargerMetro ||
    !receipt.eligibility.withinSixtyMinuteDrive ||
    receipt.eligibility.antiqueOrVintageShopCount < 2 ||
    !receipt.eligibility.willingAnchorConfirmed
  ) {
    throw new Error('community_selection_evidence_invalid')
  }
}

function assertRg01(
  receipt: Rg01PassingReceipt | undefined,
): asserts receipt is Rg01PassingReceipt {
  if (
    !receipt?.id ||
    !receipt.signed ||
    receipt.responsibility !== 'ProductOwner' ||
    receipt.decision !== 'pass' ||
    !receipt.frozenDigest
  ) {
    throw new Error('community_rg01_evidence_required')
  }
}

function assertFrozenStoreEvidence(
  stores: readonly CommunityVerifiedStore[],
  anchor: CommunityAnchorEvidence,
): readonly string[] {
  const storeIds = stores.map((store) => store.storeId).sort()
  if (
    stores.length < 2 ||
    new Set(storeIds).size !== stores.length ||
    stores.some(
      (store) =>
        !store.storeId ||
        !store.verifiedActive ||
        new Set(store.provenanceVerifierIds.filter(Boolean)).size < 2,
    )
  ) {
    throw new Error('community_verified_store_evidence_incomplete')
  }
  if (
    !anchor.storeId ||
    !storeIds.includes(anchor.storeId) ||
    !anchor.ownerEvidenceId ||
    !anchor.willing ||
    !anchor.invitationConsentAuthorityComplete
  ) {
    throw new Error('community_anchor_evidence_incomplete')
  }
  return storeIds
}

function assertReadinessReceipt(
  receipt: CommunityReadinessReceipt,
  run: CommunityActivationRun,
): void {
  const projection = run.frozenCatalog
  if (
    !projection ||
    !receipt.id ||
    !receipt.signed ||
    receipt.responsibility !== 'ProductOwner' ||
    receipt.areaSlug !== run.areaSlug ||
    receipt.artifactBindingDigest !== projection.artifactBindingDigest ||
    !sameStringSet(receipt.storeIds, projection.storeIds)
  ) {
    throw new Error('community_readiness_receipt_binding_invalid')
  }
  if (Object.values(receipt.checks).some((passed) => passed !== true)) {
    throw new Error('community_readiness_evidence_incomplete')
  }
}

function assertCancellationReceipt(
  receipt: CommunityCancellationReceipt,
  run: CommunityActivationRun,
  reason: string,
): void {
  if (
    !receipt.id ||
    !receipt.signed ||
    receipt.responsibility !== 'ProductOwner' ||
    receipt.areaSlug !== run.areaSlug ||
    !reason.trim() ||
    receipt.reason !== reason
  ) {
    throw new Error('community_cancellation_receipt_invalid')
  }
}

function assertActionReceipt(receipt: CommunityActionReceipt, run: CommunityActivationRun): void {
  const projection = run.frozenCatalog
  if (
    !projection ||
    !receipt.id ||
    !receipt.signed ||
    receipt.responsibility !== 'ProductOwner' ||
    receipt.areaSlug !== run.areaSlug ||
    !sameStringSet(receipt.storeIds, projection.storeIds) ||
    receipt.artifactBindingDigest !== projection.artifactBindingDigest ||
    !receipt.schemaDigest ||
    !receipt.configDigest ||
    !receipt.recoveryAndCapacityConfirmed ||
    !receipt.channelConsentsConfirmed ||
    receipt.canonicalRoute !== `/areas/${run.areaSlug}` ||
    new Set(receipt.allowlistedSourceCodes).size !== receipt.allowlistedSourceCodes.length ||
    receipt.allowlistedSourceCodes.some((code) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code))
  ) {
    throw new Error('community_action_receipt_binding_invalid')
  }
}

function assertGateReceipt(receipt: CommunityGateReceipt, run: CommunityActivationRun): void {
  if (
    !receipt.id ||
    !receipt.signed ||
    receipt.responsibility !== 'PrimaryInternalTester' ||
    !receipt.mfaVerified ||
    !receipt.recentAuthentication ||
    !receipt.frozenDigestCapability
  ) {
    throw new Error('community_gate_authorization_invalid')
  }
  if (
    receipt.runId !== run.id ||
    receipt.areaSlug !== run.areaSlug ||
    !run.frozenCatalog ||
    receipt.artifactBindingDigest !== run.frozenCatalog.artifactBindingDigest ||
    !receipt.independentEvidenceDigest ||
    receipt.independentEvidenceDigest === receipt.artifactBindingDigest
  ) {
    throw new Error('community_gate_receipt_binding_invalid')
  }

  const checks = receipt.checks
  const passEvidenceComplete =
    checks.twoVerifiedActiveListings &&
    checks.anchorDirectEdit &&
    checks.reviewedControlledChange &&
    checks.anchorSupportRequest &&
    checks.primaryTesterSeparateAccountPhoneTrip &&
    checks.independentTesterSeparateAccountPhoneTrip &&
    Number.isInteger(checks.voluntaryShopperTripConfirmations) &&
    checks.voluntaryShopperTripConfirmations >= 5 &&
    checks.noPreciseLocationTracking &&
    checks.monitoring &&
    checks.support &&
    checks.storeDataAccuracy &&
    checks.zeroBlockingPrivacySecurityDataLossDefects

  if (receipt.decision === 'pass') {
    if (!passEvidenceComplete || receipt.failedReasons.length !== 0) {
      throw new Error('community_gate_pass_evidence_incomplete')
    }
  } else if (
    receipt.failedReasons.length === 0 ||
    receipt.failedReasons.some((reason) => !reason.trim()) ||
    passEvidenceComplete
  ) {
    throw new Error('community_gate_rejection_evidence_invalid')
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = [...new Set(left)].sort()
  const b = [...new Set(right)].sort()
  return (
    a.length === left.length && b.length === right.length && a.every((value, i) => value === b[i])
  )
}

function assertAreaSlug(value: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) {
    throw new Error('community_area_slug_invalid')
  }
}

function assertVersion(expected: number, actual: number, message: string): void {
  if (expected !== actual) throw new Error(message)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}
