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
import {
  unavailableTripClient,
  GENERIC_TRIP_ERROR,
  MAX_ACTIVE_STOPS,
  normalizeTripName,
  validDwellMinutes,
  type CheckMyDayServerResult,
  type OfflineQueueSnapshot,
  type Trip,
  type StopPriority,
  type StopState,
  type TripClient,
  type TripCollaboration,
  type TripStop,
} from '../features/trips'
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

const tripSeed: Trip = {
  id: 'trip-a',
  name: "Avery's antique day",
  localDate: '2026-08-08',
  state: 'draft',
  version: 3,
  departureMinute: 600,
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
    {
      id: 'stop-b',
      storeId: '00000000-0000-4000-8000-000000000002',
      kind: 'store',
      label: 'Cedar & Brass',
      address: '200 Synthetic Road, Topeka, KS',
      position: 1,
      priority: 'prefer',
      plannedDwellMinutes: 45,
      state: 'planned',
      memoryStatus: 'missing',
      hours: {
        state: 'stale',
        opensAt: 540,
        closesAt: 990,
        warning: 'Hours were last verified more than 180 days ago.',
      },
    },
  ],
}

const syntheticStoreCatalog: Record<
  string,
  { label: string; address: string; hours: NonNullable<TripStop['hours']> }
> = {
  '00000000-0000-4000-8000-000000000001': {
    label: 'Blue Finch Curios',
    address: '100 Synthetic Avenue, Topeka, KS',
    hours: { state: 'verified', opensAt: 600, closesAt: 1020 },
  },
  '00000000-0000-4000-8000-000000000002': {
    label: 'Cedar & Brass',
    address: '200 Synthetic Road, Topeka, KS',
    hours: {
      state: 'stale',
      opensAt: 540,
      closesAt: 990,
      warning: 'Hours were last verified more than 180 days ago.',
    },
  },
}

const TRIP_A_INVITATION_TOKEN = 'review-trip-invite-shopper-b'
const INVITATION_EXPIRES_AT = '2026-08-12T12:00:00.000Z'

interface QueuedOfflineAction {
  kind: string
  stopId?: string
  queuedAt: string
}

const OFFLINE_KIND_TO_STOP_STATE: Record<string, StopState> = {
  mark_arrived: 'arrived',
  complete_stop: 'completed',
  skip_stop: 'skipped',
  mark_observed_closed: 'observed_closed',
  restore_stop: 'planned',
}

function tripClient(scenario: ReviewScenario, state: ReviewStateId): TripClient {
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  const currentUserId = scenario.id === 'shopper-b' ? 'review-shopper-b' : 'review-shopper-a'
  const currentDisplayName = scenario.id === 'shopper-b' ? 'Shopper B' : 'Avery'

  const trips = new Map<string, Trip>()
  const collaborations = new Map<string, TripCollaboration>()
  const offlineQueues = new Map<string, OfflineQueueSnapshot>()
  const checkMyDay = new Map<string, CheckMyDayServerResult>()
  const invitationTokens = new Map<string, { tripId: string; invitationId: string }>()
  const offlinePending = new Map<string, QueuedOfflineAction[]>()
  const visitMemories = new Map<
    string,
    { rating?: number; returnChoice?: 'no' | 'maybe' | 'yes'; note?: string }
  >()
  let nextTripNumber = 1
  let nextStopNumber = 1
  let nextCheckMyDayNumber = 1

  if (scenario.id === 'shopper-a') {
    trips.set(tripSeed.id, structuredClone(tripSeed))
    collaborations.set(tripSeed.id, {
      tripId: tripSeed.id,
      currentUserId,
      participants: [{ userId: currentUserId, displayName: currentDisplayName, role: 'creator' }],
      navigatorUserId: currentUserId,
    })
  }
  invitationTokens.set(TRIP_A_INVITATION_TOKEN, {
    tripId: 'trip-a',
    invitationId: 'trip-a-invite-shopper-b',
  })

  function findTrip(tripId: string): Trip {
    const trip = trips.get(tripId)
    if (!trip) throw new Error('Synthetic trip unavailable.')
    return trip
  }

  function requireVersion(trip: Trip, expectedVersion: number): void {
    if (trip.version !== expectedVersion) throw new Error('Synthetic version conflict.')
  }

  function bumpVersion(trip: Trip): Trip {
    return { ...trip, version: trip.version + 1 }
  }

  function persistTrip(trip: Trip): Trip {
    trips.set(trip.id, trip)
    return structuredClone(trip)
  }

  function requireCollaboration(tripId: string): TripCollaboration {
    const collaboration = collaborations.get(tripId)
    if (!collaboration || collaboration.currentUserId !== currentUserId)
      throw new Error('Synthetic collaboration unavailable.')
    return collaboration
  }

  function persistCollaboration(collaboration: TripCollaboration): TripCollaboration {
    collaborations.set(collaboration.tripId, structuredClone(collaboration))
    return structuredClone(collaboration)
  }

  function queueFor(tripId: string): OfflineQueueSnapshot {
    const existing = offlineQueues.get(tripId)
    if (existing) return existing
    const queue: OfflineQueueSnapshot = { state: 'empty', pendingCount: 0 }
    offlineQueues.set(tripId, queue)
    return queue
  }

  function pendingFor(tripId: string): QueuedOfflineAction[] {
    const existing = offlinePending.get(tripId)
    if (existing) return existing
    const pending: QueuedOfflineAction[] = []
    offlinePending.set(tripId, pending)
    return pending
  }

  function transitionStop(trip: Trip, stopId: string, next: StopState): Trip {
    return bumpVersion({
      ...trip,
      stops: trip.stops.map((stop) => (stop.id === stopId ? { ...stop, state: next } : stop)),
    })
  }

  function registerTrip(input: { name: string; localDate: string }): Trip {
    const trip: Trip = {
      id: `trip-${nextTripNumber++}`,
      name: normalizeTripName(input.name),
      localDate: input.localDate,
      state: 'draft',
      version: 1,
      stops: [],
    }
    trips.set(trip.id, trip)
    collaborations.set(trip.id, {
      tripId: trip.id,
      currentUserId,
      participants: [{ userId: currentUserId, displayName: currentDisplayName, role: 'creator' }],
    })
    return structuredClone(trip)
  }

  return {
    ...unavailableTripClient,
    async list() {
      allowed()
      return fixture(state, [...trips.values()], [])
    },
    async get(id) {
      allowed()
      const trip = trips.get(id)
      if (!trip) return null
      return fixture(state, trip, null)
    },
    async create(input) {
      allowed()
      await fixture(state, true, true)
      return registerTrip(input)
    },
    async cloneCompleted(tripId) {
      allowed()
      await fixture(state, true, true)
      const source = findTrip(tripId)
      if (source.state !== 'completed') throw new Error('Synthetic trip not completed.')
      const clone = registerTrip({ name: source.name, localDate: source.localDate })
      return persistTrip({
        ...clone,
        name: `${clone.name} (copy)`,
        departureMinute: source.departureMinute,
        stops: source.stops.map((stop) => ({
          ...structuredClone(stop),
          id: `stop-${nextStopNumber++}`,
          state: 'planned' as const,
          memoryStatus: stop.kind === 'rest' ? 'not_applicable' : 'missing',
        })),
      })
    },
    async addStop(tripId, input) {
      allowed()
      await fixture(state, true, true)
      if (!validDwellMinutes(input.plannedDwellMinutes)) throw new Error(GENERIC_TRIP_ERROR)
      const trip = findTrip(tripId)
      const stop: TripStop = {
        id: `stop-${nextStopNumber++}`,
        kind: input.kind,
        label: input.label,
        position: trip.stops.length,
        priority: input.priority,
        plannedDwellMinutes: input.plannedDwellMinutes,
        state: 'planned',
        memoryStatus: input.kind === 'rest' ? 'not_applicable' : 'missing',
      }
      return persistTrip(bumpVersion({ ...trip, stops: [...trip.stops, stop] }))
    },
    async addStoreStop(tripId, storeId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.stops.filter((stop) => stop.kind === 'store').length >= MAX_ACTIVE_STOPS)
        throw new Error(GENERIC_TRIP_ERROR)
      const catalog = syntheticStoreCatalog[storeId]
      if (!catalog) throw new Error('Synthetic store unavailable.')
      const stop: TripStop = {
        id: `stop-${nextStopNumber++}`,
        storeId,
        kind: 'store',
        label: catalog.label,
        address: catalog.address,
        position: trip.stops.length,
        priority: 'prefer',
        plannedDwellMinutes: 60,
        state: 'planned',
        memoryStatus: 'missing',
        hours: structuredClone(catalog.hours),
      }
      return persistTrip(bumpVersion({ ...trip, stops: [...trip.stops, stop] }))
    },
    async reorderStop(tripId, stopId, position) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const index = trip.stops.findIndex((stop) => stop.id === stopId)
      if (index < 0) throw new Error('Synthetic stop unavailable.')
      if (position < 0 || position >= trip.stops.length) throw new Error(GENERIC_TRIP_ERROR)
      const stops = [...trip.stops]
      const [moved] = stops.splice(index, 1)
      stops.splice(position, 0, moved)
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: stops.map((stop, slot) => ({ ...stop, position: slot })),
        }),
      )
    },
    async renameTrip(tripId, name, expectedVersion) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.version !== expectedVersion)
        return { state: 'conflict', latest: { name: trip.name, version: trip.version } }
      return {
        state: 'applied',
        trip: persistTrip(bumpVersion({ ...trip, name: normalizeTripName(name) })),
      }
    },
    async removeStop(tripId, stopId, expectedVersion) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      requireVersion(trip, expectedVersion)
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: trip.stops
            .filter((stop) => stop.id !== stopId)
            .map((stop, slot) => ({ ...stop, position: slot })),
        }),
      )
    },
    async setStopPriority(tripId, stopId, priority, expectedVersion) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      requireVersion(trip, expectedVersion)
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: trip.stops.map((stop) => (stop.id === stopId ? { ...stop, priority } : stop)),
        }),
      )
    },
    async setStopDwell(tripId, stopId, dwellMinutes, expectedVersion) {
      allowed()
      await fixture(state, true, true)
      if (!validDwellMinutes(dwellMinutes)) throw new Error(GENERIC_TRIP_ERROR)
      const trip = findTrip(tripId)
      requireVersion(trip, expectedVersion)
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: trip.stops.map((stop) =>
            stop.id === stopId ? { ...stop, plannedDwellMinutes: dwellMinutes } : stop,
          ),
        }),
      )
    },
    async updateSchedule(tripId, input, expectedVersion) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      requireVersion(trip, expectedVersion)
      return persistTrip(
        bumpVersion({
          ...trip,
          localDate: input.localDate,
          ...(input.departureMinute !== undefined
            ? { departureMinute: input.departureMinute }
            : {}),
        }),
      )
    },
    async bindNavigatorDevice(tripId) {
      allowed()
      await fixture(state, true, true)
      const collaboration = requireCollaboration(tripId)
      return persistCollaboration({ ...collaboration, navigatorUserId: currentUserId })
    },
    async transferNavigatorDevice(tripId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      return structuredClone(trip)
    },
    async reviewHours(tripId, acknowledgeWarnings = false) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const hasUnresolvedWarnings = trip.stops.some((stop) => stop.hours?.warning)
      if (hasUnresolvedWarnings && !acknowledgeWarnings)
        throw new Error('Synthetic hours warnings require acknowledgment.')
      return persistTrip(
        bumpVersion({
          ...trip,
          hoursReview: {
            reviewedAt: FIXED_NOW,
            hasUnresolvedWarnings,
            acknowledged: acknowledgeWarnings,
          },
        }),
      )
    },
    async start(tripId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state === 'completed' || trip.state === 'cancelled')
        throw new Error(GENERIC_TRIP_ERROR)
      if (trip.stops.length === 0 || trip.departureMinute === undefined)
        throw new Error(GENERIC_TRIP_ERROR)
      const transitionMinutes = 15 * Math.max(0, trip.stops.length - 1)
      const durationMinutes =
        trip.stops.reduce((total, stop) => total + stop.plannedDwellMinutes, 0) + transitionMinutes
      return persistTrip(
        bumpVersion({ ...trip, state: 'active', durationMinutes, transitionMinutes }),
      )
    },
    async markArrived(tripId, stopId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(transitionStop(trip, stopId, 'arrived'))
    },
    async completeStop(tripId, stopId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(transitionStop(trip, stopId, 'completed'))
    },
    async skipStop(tripId, stopId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(transitionStop(trip, stopId, 'skipped'))
    },
    async setStart(tripId, input) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      return persistTrip(
        bumpVersion({
          ...trip,
          startKind: input.kind,
          startLabel: input.label,
          departureMinute: input.departureMinute,
          ...(input.latitude !== undefined && input.longitude !== undefined
            ? { origin: { latitude: input.latitude, longitude: input.longitude } }
            : {}),
        }),
      )
    },
    async setReturn(tripId, input) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (input === null) {
        const next = { ...trip }
        delete next.returnCoordinate
        return persistTrip(bumpVersion(next))
      }
      return persistTrip(
        bumpVersion({
          ...trip,
          returnCoordinate:
            input.latitude !== undefined && input.longitude !== undefined
              ? { latitude: input.latitude, longitude: input.longitude }
              : trip.returnCoordinate,
        }),
      )
    },
    async setLimits(tripId, input) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      return persistTrip(
        bumpVersion({
          ...trip,
          ...(input.maxDriveMiles !== undefined ? { maxDriveMiles: input.maxDriveMiles } : {}),
          ...(input.maxTotalMinutes !== undefined
            ? { maxTotalMinutes: input.maxTotalMinutes }
            : {}),
        }),
      )
    },
    async addRestStop(tripId, input) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const stop: TripStop = {
        id: `stop-${nextStopNumber++}`,
        kind: 'rest',
        label: input.label,
        address: input.address,
        position: trip.stops.length,
        priority: input.priority,
        plannedDwellMinutes: input.plannedDwellMinutes,
        state: 'planned',
        memoryStatus: 'not_applicable',
        ...(input.latitude !== undefined && input.longitude !== undefined
          ? { coordinate: { latitude: input.latitude, longitude: input.longitude } }
          : {}),
      }
      return persistTrip(bumpVersion({ ...trip, stops: [...trip.stops, stop] }))
    },
    async markObservedClosed(tripId, stopId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(transitionStop(trip, stopId, 'observed_closed'))
    },
    async restoreStop(tripId, stopId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const stop = trip.stops.find((candidate) => candidate.id === stopId)
      if (!stop) throw new Error('Synthetic stop unavailable.')
      if (stop.state === 'planned' || stop.state === 'arrived' || stop.state === 'completed')
        throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(transitionStop(trip, stopId, 'planned'))
    },
    async completeTrip(tripId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.state !== 'active') throw new Error(GENERIC_TRIP_ERROR)
      if (
        trip.stops.some(
          (stop) =>
            stop.state !== 'completed' &&
            stop.state !== 'skipped' &&
            stop.state !== 'observed_closed',
        )
      )
        throw new Error(GENERIC_TRIP_ERROR)
      return persistTrip(bumpVersion({ ...trip, state: 'completed' }))
    },
    async saveVisitMemory(tripId, storeId, input) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (!trip.stops.some((stop) => stop.storeId === storeId))
        throw new Error('Synthetic store stop unavailable.')
      visitMemories.set(storeId, {
        ...(input.rating !== undefined ? { rating: input.rating } : {}),
        ...(input.returnChoice !== undefined ? { returnChoice: input.returnChoice } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      })
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: trip.stops.map((stop) =>
            stop.storeId === storeId ? { ...stop, memoryStatus: 'saved' as const } : stop,
          ),
        }),
      )
    },
    async replayOffline(tripId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const pending = pendingFor(tripId)
      const snapshot = queueFor(tripId)
      if (pending.length === 0) return structuredClone(trip)
      offlineQueues.set(tripId, { ...snapshot, state: 'replaying' })
      let current = trip
      for (const action of pending) {
        const next = OFFLINE_KIND_TO_STOP_STATE[action.kind]
        const stop = action.stopId
          ? current.stops.find((candidate) => candidate.id === action.stopId)
          : undefined
        if (!next || !stop) {
          offlineQueues.set(tripId, {
            ...snapshot,
            state: 'conflict',
            conflict: { id: action.kind, summary: 'A queued action no longer applies.' },
          })
          return structuredClone(current)
        }
        current = transitionStop(current, action.stopId!, next)
      }
      trips.set(tripId, current)
      offlinePending.set(tripId, [])
      offlineQueues.set(tripId, { state: 'empty', pendingCount: 0, lastUpdatedAt: FIXED_NOW })
      return structuredClone(current)
    },
    async replayOfflineMutation(envelope) {
      allowed()
      await fixture(state, true, true)
      const trip = trips.get(envelope.tripId)
      if (!trip) return { state: 'unauthorized' }
      const queue = queueFor(envelope.tripId)
      if (envelope.baseVersion !== trip.version) {
        offlineQueues.set(envelope.tripId, {
          ...queue,
          state: 'conflict',
          conflict: { id: envelope.idempotencyKey, summary: 'Version mismatch during replay.' },
        })
        return { state: 'conflict', summary: 'Version mismatch during replay.' }
      }
      if (!trip.stops.some((stop) => stop.id === envelope.stopId)) return { state: 'unauthorized' }
      const next = transitionStop(trip, envelope.stopId, OFFLINE_KIND_TO_STOP_STATE[envelope.kind])
      offlineQueues.set(envelope.tripId, {
        state: 'empty',
        pendingCount: 0,
        lastUpdatedAt: FIXED_NOW,
      })
      return { state: 'accepted', trip: persistTrip(next) }
    },
    async getOfflineQueue(tripId) {
      allowed()
      return fixture(state, queueFor(tripId), { state: 'empty', pendingCount: 0 })
    },
    async queueOfflineAction(tripId, action) {
      allowed()
      await fixture(state, true, true)
      findTrip(tripId)
      const pending = pendingFor(tripId)
      pending.push({ ...action, queuedAt: FIXED_NOW })
      const next: OfflineQueueSnapshot = {
        state: 'queued',
        pendingCount: pending.length,
        lastUpdatedAt: FIXED_NOW,
      }
      offlineQueues.set(tripId, next)
      return structuredClone(next)
    },
    async resolveOfflineConflict(tripId, choice) {
      allowed()
      await fixture(state, true, true)
      const queue = queueFor(tripId)
      if (queue.state !== 'conflict') throw new Error('Synthetic offline conflict unavailable.')
      const pending = pendingFor(tripId)
      const next: OfflineQueueSnapshot =
        choice === 'saved'
          ? { state: 'empty', pendingCount: 0, lastUpdatedAt: FIXED_NOW }
          : {
              state: 'blocked',
              pendingCount: pending.length,
              purgeReason: 'phone',
              lastUpdatedAt: FIXED_NOW,
            }
      offlineQueues.set(tripId, next)
      return structuredClone(next)
    },
    async purgeOffline(tripId, reason) {
      allowed()
      await fixture(state, true, true)
      const next: OfflineQueueSnapshot = {
        state: 'purged',
        pendingCount: 0,
        purgeReason: reason,
        lastUpdatedAt: FIXED_NOW,
      }
      offlinePending.set(tripId, [])
      offlineQueues.set(tripId, next)
      return structuredClone(next)
    },
    async getCollaboration(tripId) {
      allowed()
      return fixture(state, requireCollaboration(tripId), {
        tripId,
        currentUserId,
        participants: [],
      })
    },
    async invitePartner(tripId) {
      allowed()
      await fixture(state, true, true)
      const collaboration = requireCollaboration(tripId)
      if (collaboration.invitation?.state === 'pending')
        throw new Error('Synthetic invitation already pending.')
      const invitationId = `inv-${tripId}`
      invitationTokens.set(TRIP_A_INVITATION_TOKEN, { tripId, invitationId })
      return persistCollaboration({
        ...collaboration,
        invitation: { id: invitationId, state: 'pending', expiresAt: INVITATION_EXPIRES_AT },
      })
    },
    async revokeInvitation(tripId, invitationId) {
      allowed()
      await fixture(state, true, true)
      const collaboration = requireCollaboration(tripId)
      if (collaboration.invitation?.id !== invitationId)
        throw new Error('Synthetic invitation unavailable.')
      return persistCollaboration({
        ...collaboration,
        invitation: { ...collaboration.invitation, state: 'revoked' },
      })
    },
    async acceptInvitation(fragmentToken) {
      allowed()
      await fixture(state, true, true)
      const binding = invitationTokens.get(fragmentToken)
      if (!binding) throw new Error('Synthetic invitation unavailable or expired.')
      const collaboration = collaborations.get(binding.tripId)
      if (!collaboration) throw new Error('Synthetic trip unavailable.')
      if (collaboration.participants.some((participant) => participant.userId === currentUserId))
        return structuredClone(collaboration)
      return persistCollaboration({
        ...collaboration,
        participants: [
          ...collaboration.participants,
          { userId: currentUserId, displayName: currentDisplayName, role: 'partner' },
        ],
        invitation: collaboration.invitation
          ? { ...collaboration.invitation, state: 'accepted' }
          : undefined,
      })
    },
    async assignNavigator(tripId, participantUserId) {
      allowed()
      await fixture(state, true, true)
      const collaboration = requireCollaboration(tripId)
      if (!collaboration.participants.some((candidate) => candidate.userId === participantUserId))
        throw new Error('Synthetic participant unavailable.')
      return persistCollaboration({ ...collaboration, navigatorUserId: participantUserId })
    },
    async leaveTrip(tripId) {
      allowed()
      await fixture(state, true, true)
      const collaboration = requireCollaboration(tripId)
      const me = collaboration.participants.find(
        (participant) => participant.userId === currentUserId,
      )
      if (!me || me.role === 'creator') throw new Error('Synthetic creator cannot leave.')
      const remaining = collaboration.participants.filter(
        (participant) => participant.userId !== currentUserId,
      )
      collaborations.set(tripId, {
        ...collaboration,
        participants: remaining,
        ...(collaboration.navigatorUserId === currentUserId
          ? { navigatorUserId: remaining[0]?.userId }
          : {}),
      })
    },
    async saveCheckMyDayChoice(tripId, _choice, stopIds) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      const chosen = stopIds
        .map((stopId) => trip.stops.find((stop) => stop.id === stopId))
        .filter((stop): stop is TripStop => stop !== undefined)
      const rest = trip.stops.filter((stop) => !stopIds.includes(stop.id))
      return persistTrip(
        bumpVersion({
          ...trip,
          stops: [...chosen, ...rest].map((stop, slot) => ({ ...stop, position: slot })),
        }),
      )
    },
    async requestCheckMyDay(tripId) {
      allowed()
      await fixture(state, true, true)
      const trip = findTrip(tripId)
      if (trip.departureMinute === undefined)
        return {
          requestId: `check-my-day-${nextCheckMyDayNumber++}`,
          state: 'blocked' as const,
          reason: 'departure_required' as const,
        }
      const ranks: Record<StopPriority, number> = { must: 0, prefer: 1, flexible: 2 }
      const sorted = [...trip.stops].sort((a, b) => {
        const byPriority = ranks[a.priority] - ranks[b.priority]
        if (byPriority !== 0) return byPriority
        const aOpens = a.hours?.opensAt ?? Number.POSITIVE_INFINITY
        const bOpens = b.hours?.opensAt ?? Number.POSITIVE_INFINITY
        if (aOpens !== bOpens) return aOpens - bOpens
        return a.position - b.position
      })
      const result: CheckMyDayServerResult = {
        requestId: `check-my-day-${nextCheckMyDayNumber++}`,
        state: 'suggested',
        orderedStopIds: sorted.map((stop) => stop.id),
        explanation: ['Suggested order prioritizes must-see stops, then earlier opening times.'],
      }
      checkMyDay.set(result.requestId, result)
      return structuredClone(result)
    },
    async getCheckMyDaySuggestion(requestId) {
      allowed()
      const result = checkMyDay.get(requestId)
      if (!result) return { requestId, state: 'failed' as const }
      return fixture(state, result, { requestId, state: 'failed' as const })
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
