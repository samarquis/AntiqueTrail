import type { AppClients } from '../app/App'
import type {
  AccountLifecycleClient,
  AccountLifecycleSnapshot,
  AuthProviderAdapter,
  ProviderSession,
} from '../features/auth'
import {
  unavailableCandidateClient,
  type BlockedCandidateSender,
  type CandidateClient,
  type CandidateLink,
  type CandidateShareView,
  type GenericShareEnvelope,
  type TripIdea,
} from '../features/candidates'
import { unavailablePartnerAdminClient, type PartnerAdminClient } from '../features/partners'
import { unavailablePortalClient, type PortalClient, type PortalHours } from '../features/portal'
import { unavailableReviewClient, type ReviewClient } from '../features/reviews'
import {
  unavailableShopperClient,
  type PrivateStoreMemory,
  type ShopperPrivateClient,
} from '../features/shopper'
import { unavailableTripClient, type Trip, type TripClient } from '../features/trips'
import type { ReviewScenario, ReviewStateId } from './types'

const FIXED_NOW = '2026-08-05T12:00:00.000Z'

function reviewProviderSession(email: string): ProviderSession {
  return {
    userId: email.toLowerCase().startsWith('shopper-b') ? 'review-shopper-b' : 'review-shopper-a',
    email,
    emailVerified: true,
    accessToken: 'local-review-only:authenticated-shopper',
    expiresAt: Date.parse(FIXED_NOW) + 365 * 24 * 60 * 60 * 1_000,
    role: 'Shopper',
    mfaRequired: email.toLowerCase().startsWith('mfa'),
    mfaEnrolled: email.toLowerCase().startsWith('mfa'),
    passwordAuthenticatedAt: FIXED_NOW,
  }
}

export function createReviewHarnessAuthProvider(state: ReviewStateId): AuthProviderAdapter {
  let mfaSession: ProviderSession | null = null
  return {
    async signIn(email) {
      if (state !== 'success') return { kind: 'error' }
      const session = reviewProviderSession(email)
      if (session.mfaRequired) {
        mfaSession = session
        return { kind: 'mfa_required', challengeId: 'review-mfa-challenge', session }
      }
      return { kind: 'authenticated', session }
    },
    async sendRecovery() {
      if (state === 'loading') return new Promise<void>(() => undefined)
      // Recovery deliberately resolves identically for known and unknown synthetic addresses.
    },
    async verifyMfa(challengeId, code) {
      if (
        state !== 'success' ||
        challengeId !== 'review-mfa-challenge' ||
        code !== '123456' ||
        !mfaSession
      )
        return null
      return { ...mfaSession, mfaVerifiedAt: FIXED_NOW }
    },
    async register(request) {
      if (state !== 'success') return { kind: 'error' }
      if (!request.ageAttested || request.email.toLowerCase().startsWith('blocked'))
        return { kind: 'blocked' }
      return { kind: 'pending_verification' }
    },
    async verifyCallback(kind, tokenHash) {
      if (state !== 'success' || !/^review-(?:verify|recovery)-[ab]$/u.test(tokenHash))
        return { kind: 'error' }
      const email = tokenHash.endsWith('-b') ? 'shopper-b@local.invalid' : 'shopper-a@local.invalid'
      return kind === 'recovery'
        ? { kind: 'verified' }
        : { kind: 'authenticated', session: reviewProviderSession(email) }
    },
    async signOut() {
      return undefined
    },
  }
}

function lifecycleClient(scenario: ReviewScenario, state: ReviewStateId): AccountLifecycleClient {
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  let snapshot: AccountLifecycleSnapshot = {
    state: 'active',
    inactivityWarning: { daysRemaining: 30 },
  }
  const exportJob = {
    id: `export-${scenario.id}`,
    state: 'ready' as const,
    createdAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
    expiresAt: '2026-08-12T12:00:00.000Z',
    fileSizeBytes: 2048,
    checksumSha256: 'a'.repeat(64),
  }
  return {
    async getStatus() {
      // getStatus is the app-wide session hydration read (AuthProvider), not a
      // lifecycle page request. It must not be shopper-gated: Administrator and
      // Representative harness sessions would otherwise be signed out on
      // hydration and their review pages would redirect to /stores. The
      // shopper-only gate below guards the private lifecycle endpoints only.
      return structuredClone(snapshot)
    },
    async requestExport() {
      allowed()
      return fixture(state, exportJob, exportJob)
    },
    async getExportStatus(jobId) {
      allowed()
      if (jobId !== exportJob.id) throw new Error('Synthetic cross-account denial.')
      return fixture(state, exportJob, exportJob)
    },
    async downloadExport(jobId) {
      allowed()
      if (jobId !== exportJob.id) throw new Error('Synthetic cross-account denial.')
      return new Blob(['Synthetic account export'])
    },
    async requestDeletion() {
      allowed()
      const result = await fixture<AccountLifecycleSnapshot>(
        state,
        { state: 'deletion_scheduled', deletionDueAt: '2026-08-12T12:00:00.000Z' },
        snapshot,
      )
      snapshot = result
      return structuredClone(result)
    },
    async cancelDeletion() {
      allowed()
      const result = await fixture<AccountLifecycleSnapshot>(
        state,
        { state: 'active', inactivityWarning: { daysRemaining: 30 } },
        snapshot,
      )
      snapshot = result
      return structuredClone(result)
    },
  }
}

function fixture<T>(state: ReviewStateId, success: T, empty: T): Promise<T> {
  if (state === 'loading') return new Promise<T>(() => undefined)
  if (state === 'error') return Promise.reject(new Error('Synthetic review error.'))
  if (state === 'blocked') return Promise.reject(new Error('Synthetic release gate blocked.'))
  if (state === 'permission-denied')
    return Promise.reject(new Error('Synthetic permission denied.'))
  return Promise.resolve(state === 'empty' ? empty : structuredClone(success))
}

function requireRole<T>(scenario: ReviewScenario, allowed: ReviewScenario['role'][], value: T): T {
  if (!allowed.includes(scenario.role)) throw new Error('Synthetic permission denied.')
  return value
}

function shopperClient(scenario: ReviewScenario, state: ReviewStateId): ShopperPrivateClient {
  const store = {
    storeId:
      scenario.id === 'shopper-b'
        ? '00000000-0000-4000-8000-000000000002'
        : '00000000-0000-4000-8000-000000000001',
    slug: scenario.id === 'shopper-b' ? 'cedar-and-brass' : 'blue-finch-curios',
    name: scenario.id === 'shopper-b' ? 'Cedar & Brass' : 'Blue Finch Curios',
    savedAt: FIXED_NOW,
  }
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  let saved = true
  let memory: PrivateStoreMemory | null = {
    storeId: store.storeId,
    rating: 4,
    note: 'Ask about the walnut secretary.',
    lastVisitMonth: '2026-07',
    version: 1,
  }
  let deletedMemory: PrivateStoreMemory | null = null
  let undoToken: string | null = null
  let lastSeenAt = '2026-08-01T12:00:00.000Z'
  const dismissed = new Set<string>()
  const corrections = new Map<string, { id: string; state: 'submitted' | 'triaged' }>([
    ['correction-a', { id: 'correction-a', state: 'triaged' }],
  ])
  return {
    ...unavailableShopperClient,
    async listSaved() {
      allowed()
      return fixture(state, saved ? [store] : [], [])
    },
    async getSaveState(storeId) {
      allowed()
      return fixture(state, { saved: storeId === store.storeId && saved }, { saved: false })
    },
    async setSave(storeId, nextSaved) {
      allowed()
      await fixture(state, true, true)
      if (storeId !== store.storeId) throw new Error('Synthetic cross-account denial.')
      saved = nextSaved
      return { saved }
    },
    async getMemory(storeId) {
      allowed()
      return fixture(state, memory && memory.storeId === storeId ? memory : null, null)
    },
    async listMemories() {
      allowed()
      return fixture(state, memory ? [memory] : [], [])
    },
    async upsertMemory(input) {
      allowed()
      await fixture(state, true, true)
      memory = { ...input, version: memory ? memory.version + 1 : 1 }
      deletedMemory = null
      undoToken = null
      return structuredClone(memory)
    },
    async deleteMemory(storeId) {
      allowed()
      await fixture(state, true, true)
      if (!memory || memory.storeId !== storeId) throw new Error('Synthetic memory unavailable.')
      deletedMemory = memory
      memory = null
      undoToken = `undo-${scenario.id}-${storeId}`
      return { undoToken, undoUntil: '2026-08-05T12:01:00.000Z' }
    },
    async undoDeleteMemory(storeId, token) {
      allowed()
      await fixture(state, true, true)
      if (!deletedMemory || token !== undoToken || deletedMemory.storeId !== storeId)
        throw new Error('Synthetic undo unavailable.')
      memory = { ...deletedMemory, version: deletedMemory.version + 1 }
      deletedMemory = null
      undoToken = null
      return structuredClone(memory)
    },
    async listCatalogAreas() {
      allowed()
      return fixture(state, [{ id: 'topeka', slug: 'topeka', label: 'Topeka area' }], [])
    },
    async getNewSince() {
      allowed()
      return fixture(
        state,
        {
          area: { id: 'topeka', slug: 'topeka', label: 'Topeka area' },
          lastSeenAt,
          stores: dismissed.has(store.storeId)
            ? []
            : [{ ...store, addedAt: '2026-08-04T12:00:00.000Z' }],
        },
        {
          area: { id: 'topeka', slug: 'topeka', label: 'Topeka area' },
          lastSeenAt: FIXED_NOW,
          stores: [],
        },
      )
    },
    async markCatalogSeen() {
      allowed()
      await fixture(state, true, true)
      lastSeenAt = FIXED_NOW
      return { seenAt: lastSeenAt }
    },
    async dismissNewStore(storeId) {
      allowed()
      await fixture(state, true, true)
      dismissed.add(storeId)
    },
    async submitCorrection(draft) {
      allowed()
      await fixture(state, true, true)
      const correction = {
        id: `correction-${scenario.id}-${corrections.size + 1}`,
        state: 'submitted' as const,
      }
      if (!draft.storeId || !draft.description.trim())
        throw new Error('Synthetic validation failed.')
      corrections.set(correction.id, correction)
      return structuredClone(correction)
    },
    async getCorrection(id) {
      allowed()
      const correction = corrections.get(id)
      if (scenario.id !== 'shopper-a' || !correction)
        throw new Error('Synthetic cross-account denial.')
      return fixture(state, correction, null)
    },
  }
}

function candidateClient(scenario: ReviewScenario, state: ReviewStateId): CandidateClient {
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  const ownerUserId = `review-${scenario.id}`

  // Fixture mutations persist across client-side navigation within one document load.
  const shares: CandidateShareView[] =
    scenario.id === 'shopper-b'
      ? [
          {
            id: 'share-b',
            direction: 'received',
            state: 'pending',
            title: 'Weekend estate-sale lead',
            expiresAt: Date.parse('2026-08-12T12:00:00Z'),
          },
          {
            id: 'share-expired',
            direction: 'received',
            state: 'pending',
            title: 'Antique sideboard lead',
            expiresAt: Date.parse('2026-08-01T12:00:00Z'),
          },
          {
            id: 'share-revoked',
            direction: 'received',
            state: 'closed',
            title: 'Vintage lamp lead',
            expiresAt: Date.parse('2026-08-12T12:00:00Z'),
          },
          {
            id: 'share-b-sent',
            direction: 'sent',
            state: 'pending',
            title: 'Mid-century credenza lead',
            expiresAt: Date.parse('2026-08-12T12:00:00Z'),
          },
        ]
      : []
  let tripIdeas: TripIdea[] =
    scenario.id === 'shopper-b'
      ? [
          {
            id: 'idea-b',
            ownerUserId: 'review-shopper-b',
            sourceShareId: 'share-b',
            title: 'North Topeka finds',
            urlNote: 'Start after breakfast.',
            version: 1,
          },
        ]
      : []
  const blockedSenders = new Map<string, BlockedCandidateSender>(
    scenario.id === 'shopper-b'
      ? [
          [
            'synthetic-sender',
            {
              blockedUserId: 'synthetic-sender',
              label: 'A blocked synthetic sender',
              blockedAt: Date.parse(FIXED_NOW),
            },
          ],
        ]
      : [],
  )
  const savedCandidates = new Map<string, CandidateLink>()

  function requireShare(shareId: string): CandidateShareView {
    if (scenario.id !== 'shopper-b') throw new Error('Synthetic cross-account denial.')
    const share = shares.find((candidate) => candidate.id === shareId)
    if (!share) throw new Error('Synthetic cross-account denial.')
    return share
  }

  // Mirror the production boundary: a pending share whose expiry has passed is
  // unreadable and unclaimable immediately (PRODUCT_DECISIONS.md 103 / PRD 375).
  const fixedNow = Date.parse(FIXED_NOW)
  const isClaimable = (share: CandidateShareView) =>
    share.state === 'pending' && share.expiresAt > fixedNow

  function projectShare(share: CandidateShareView): CandidateShareView {
    if (isClaimable(share) || share.state !== 'pending') return share
    return { ...share, state: 'closed' }
  }

  function closeShare(shareId: string): GenericShareEnvelope {
    const share = requireShare(shareId)
    if (!isClaimable(share)) return { accepted: false, state: 'closed', message: 'No change.' }
    share.state = 'closed'
    return { accepted: false, state: 'closed', message: 'Closed.' }
  }

  return {
    ...unavailableCandidateClient,
    async listShares() {
      allowed()
      return fixture(state, shares.map(projectShare), [])
    },
    async getShare(shareId) {
      allowed()
      return fixture(state, projectShare(requireShare(shareId)), null)
    },
    async acceptShare(shareId) {
      allowed()
      await fixture(state, true, true)
      const share = requireShare(shareId)
      if (!isClaimable(share)) return { accepted: false, state: 'closed', message: 'No change.' }
      share.state = 'accepted'
      tripIdeas.push({
        id: `idea-${shareId}`,
        ownerUserId,
        sourceShareId: shareId,
        title: share.title,
        urlNote: 'Accepted from a Candidate share.',
        version: 1,
      })
      return { accepted: true, state: 'accepted', message: 'Accepted.' }
    },
    async dismissShare(shareId) {
      allowed()
      await fixture(state, true, true)
      return closeShare(shareId)
    },
    async blockShare(shareId) {
      allowed()
      await fixture(state, true, true)
      const share = requireShare(shareId)
      if (!isClaimable(share)) return { accepted: false, state: 'closed', message: 'No change.' }
      share.state = 'closed'
      blockedSenders.set(`sender-${shareId}`, {
        blockedUserId: `sender-${shareId}`,
        label: share.title,
        blockedAt: Date.parse(FIXED_NOW),
      })
      return { accepted: false, state: 'closed', message: 'Blocked.' }
    },
    async reportShare(shareId) {
      allowed()
      await fixture(state, true, true)
      return closeShare(shareId)
    },
    async revokeCandidateShare(shareId) {
      allowed()
      await fixture(state, true, true)
      return closeShare(shareId)
    },
    async extractCandidate(input) {
      allowed()
      await fixture(state, true, true)
      const url = new URL(input.url)
      return {
        mode: 'suggestions' as const,
        originalLink: input.url,
        originalNote: input.note,
        normalizedUrl: url.toString(),
        destinationHost: url.hostname.toLocaleLowerCase(),
        suggestions: {
          title: 'Synthetic store page',
          description: 'Synthetic extraction for local review.',
          canonicalUrl: null,
          verified: false as const,
        },
        publicWriteAllowed: false as const,
      }
    },
    async saveCandidate(input) {
      allowed()
      await fixture(state, true, true)
      const url = new URL(input.url)
      const candidate: CandidateLink = {
        id: `candidate-${scenario.id}-${savedCandidates.size + 1}`,
        ownerUserId,
        normalizedUrl: url.toString(),
        destinationHost: url.hostname.toLocaleLowerCase(),
        title: input.title,
        note: input.note,
        provenance: 'url' as const,
        extractionState: 'saved' as const,
        version: 1,
      }
      savedCandidates.set(candidate.id, candidate)
      return structuredClone(candidate)
    },
    async sendShare(input) {
      allowed()
      await fixture(state, true, true)
      if (!savedCandidates.has(input.candidateId))
        throw new Error('Synthetic candidate unavailable.')
      return { accepted: false, state: 'pending' as const, message: 'Sent.' }
    },
    async listTripIdeas() {
      allowed()
      return fixture(state, tripIdeas, [])
    },
    async updateTripIdea(ideaId, input) {
      allowed()
      await fixture(state, true, true)
      const idea = tripIdeas.find((candidate) => candidate.id === ideaId)
      if (!idea) throw new Error('Synthetic trip idea unavailable.')
      if (idea.version !== input.expectedVersion) throw new Error('Synthetic version conflict.')
      const updated: TripIdea = {
        ...idea,
        title: input.title,
        urlNote: input.urlNote,
        version: idea.version + 1,
      }
      tripIdeas = tripIdeas.map((candidate) => (candidate.id === ideaId ? updated : candidate))
      return structuredClone(updated)
    },
    async deleteTripIdea(ideaId, confirmation) {
      allowed()
      await fixture(state, true, true)
      if (!confirmation.confirmed) throw new Error('Synthetic confirmation required.')
      tripIdeas = tripIdeas.filter((candidate) => candidate.id !== ideaId)
    },
    async listBlockedCandidateSenders() {
      allowed()
      return fixture(state, [...blockedSenders.values()], [])
    },
    async unblockCandidateSender(blockedUserId, confirmation) {
      allowed()
      await fixture(state, true, true)
      if (!confirmation.confirmed) throw new Error('Synthetic confirmation required.')
      blockedSenders.delete(blockedUserId)
    },
  }
}

const trip: Trip = {
  id: 'trip-a',
  name: "Avery's antique day",
  localDate: '2026-08-08',
  state: 'draft',
  version: 3,
  stops: [
    {
      id: 'stop-a',
      storeId: '00000000-0000-4000-8000-000000000001',
      kind: 'store',
      label: 'Blue Finch Curios',
      address: '100 Synthetic Avenue, Topeka, KS',
      position: 0,
      priority: 'must',
      plannedDwellMinutes: 60,
      state: 'planned',
      memoryStatus: 'missing',
      hours: { state: 'verified', opensAt: 600, closesAt: 1020 },
    },
  ],
}

function tripClient(scenario: ReviewScenario, state: ReviewStateId): TripClient {
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  return {
    ...unavailableTripClient,
    async list() {
      allowed()
      if (scenario.id !== 'shopper-a') return []
      return fixture(state, [trip], [])
    },
    async get(id) {
      allowed()
      if (scenario.id !== 'shopper-a' || id !== trip.id) return null
      return fixture(state, trip, null)
    },
  }
}

const hours: PortalHours = {
  timeZone: 'America/Chicago',
  weekly: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
    (label, weekday) => ({
      weekday,
      label,
      isClosed: weekday === 0,
      intervals: weekday === 0 ? [] : [{ opensAt: '10:00', closesAt: '17:00' }],
    }),
  ),
  holidays: [{ localDate: '2026-09-07', label: 'Labor Day', isClosed: true, intervals: [] }],
  version: 2,
}

function portalClient(scenario: ReviewScenario, state: ReviewStateId): PortalClient {
  const allowed = () => requireRole(scenario, ['Representative'], true)
  const home = {
    store: {
      id: 'store-blue-finch',
      name: 'Blue Finch Curios',
      listingState: 'active' as const,
      timeZone: 'America/Chicago',
    },
    freshness: {
      state: 'overdue' as const,
      label: 'Hours need review',
      verifiedAt: '2026-05-01T12:00:00.000Z',
      daysSinceVerification: 96,
    },
    provenance: {
      sourceLabel: 'Store Representative',
      verifiedBy: 'Synthetic Administrator',
      verifiedAt: '2026-05-01T12:00:00.000Z',
      ownerConfirmed: true,
    },
    pendingChanges: [
      {
        id: 'change-1',
        field: 'address' as const,
        requestedValue: '100 Synthetic Avenue, Topeka, KS',
        state: 'pending' as const,
        submittedAt: FIXED_NOW,
      },
    ],
  }
  return {
    ...unavailablePortalClient,
    async getHome() {
      allowed()
      return fixture(state, home, { ...home, pendingChanges: [] })
    },
    async getHours() {
      allowed()
      return fixture(state, hours, { ...hours, weekly: [], holidays: [] })
    },
    async saveHours(value) {
      allowed()
      return { ...value, version: value.version + 1 }
    },
    async listUpdates() {
      allowed()
      return fixture(
        state,
        [
          {
            id: 'update-1',
            type: 'new_finds' as const,
            headline: 'Fresh walnut furniture',
            details: 'A synthetic shipment for local review.',
            state: 'live' as const,
            publishedAt: FIXED_NOW,
          },
        ],
        [],
      )
    },
    async listOfficialLinks() {
      allowed()
      return fixture(
        state,
        [
          {
            platform: 'instagram' as const,
            url: 'https://example.invalid/blue-finch',
            verifiedAt: FIXED_NOW,
          },
        ],
        [],
      )
    },
    async listSupportTickets() {
      allowed()
      return fixture(
        state,
        [
          {
            id: 'ticket-1',
            category: 'store_data_correction' as const,
            subject: 'Holiday hours',
            body: 'Please confirm the synthetic closure.',
            state: 'waiting_on_you' as const,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
            diagnostics: [],
            screenshotAttached: false as const,
            replies: [],
          },
        ],
        [],
      )
    },
    async previewPublicListing() {
      allowed()
      return fixture(
        state,
        {
          storeName: home.store.name,
          listingState: home.store.listingState,
          liveFields: { Address: '98 Synthetic Avenue, Topeka, KS' },
          pendingChanges: home.pendingChanges,
          freshness: home.freshness,
        },
        {
          storeName: home.store.name,
          listingState: home.store.listingState,
          liveFields: {} as Record<string, string>,
          pendingChanges: [],
          freshness: home.freshness,
        },
      )
    },
  }
}

function reviewClient(scenario: ReviewScenario, state: ReviewStateId): ReviewClient {
  return {
    ...unavailableReviewClient,
    async listModerationCases() {
      requireRole(scenario, ['Administrator'], true)
      return fixture(
        state,
        [
          {
            id: 'moderation-1',
            reviewId: 'review-1',
            storeId: 'store-blue-finch',
            state: 'open' as const,
            reasonCode: 'spam' as const,
            evidence: [{ kind: 'report_reason' as const, value: 'Synthetic spam report' }],
            openedAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
            reporterPseudonym: 'Reporter 17',
          },
        ],
        [],
      )
    },
  }
}

function partnerAdminClient(scenario: ReviewScenario, state: ReviewStateId): PartnerAdminClient {
  const allowed = () => requireRole(scenario, ['Administrator'], true)
  const partnerCase = {
    claimId: 'claim-synthetic',
    state: 'verification_pending' as const,
    version: 2,
    exactStoreScope: 'Blue Finch Curios',
    verifiedSignals: [{ channelClass: 'published_business_contact', signalType: 'email' }],
    pendingSignals: [
      {
        signalId: 'signal-synthetic',
        channelClass: 'owner_attestation',
        signalType: 'in_person_confirmation',
      },
    ],
  }
  return {
    ...unavailablePartnerAdminClient,
    async getCase(claimId) {
      allowed()
      if (claimId !== partnerCase.claimId) throw new Error('Synthetic exact-case denial.')
      return fixture(state, partnerCase, { ...partnerCase, pendingSignals: [] })
    },
    async issueSyntheticInvitation() {
      allowed()
      return fixture(
        state,
        {
          invitationId: 'invitation-synthetic',
          token: 'synthetic-review-token-not-a-secret',
          expiresAt: '2026-08-05T12:30:00.000Z',
        },
        {
          invitationId: 'invitation-empty',
          token: 'synthetic-empty-token',
          expiresAt: '2026-08-05T12:30:00.000Z',
        },
      )
    },
  }
}

export function createReviewHarnessClients(
  scenario: ReviewScenario,
  state: ReviewStateId,
): AppClients {
  return {
    lifecycle: lifecycleClient(scenario, state),
    shopper: shopperClient(scenario, state),
    candidate: candidateClient(scenario, state),
    trips: tripClient(scenario, state),
    portal: portalClient(scenario, state),
    reviews: reviewClient(scenario, state),
    partnerAdmin: partnerAdminClient(scenario, state),
  }
}
