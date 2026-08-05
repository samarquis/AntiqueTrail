import type { AppClients } from '../app/App'
import { unavailableCandidateClient, type CandidateClient } from '../features/candidates'
import { unavailablePartnerAdminClient, type PartnerAdminClient } from '../features/partners'
import { unavailablePortalClient, type PortalClient, type PortalHours } from '../features/portal'
import { unavailableReviewClient, type ReviewClient } from '../features/reviews'
import { unavailableShopperClient, type ShopperPrivateClient } from '../features/shopper'
import { unavailableTripClient, type Trip, type TripClient } from '../features/trips'
import type { ReviewScenario, ReviewStateId } from './types'

const FIXED_NOW = '2026-08-05T12:00:00.000Z'

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
    storeId: scenario.id === 'shopper-b' ? 'store-cedar' : 'store-blue-finch',
    slug: scenario.id === 'shopper-b' ? 'cedar-and-brass' : 'blue-finch-curios',
    name: scenario.id === 'shopper-b' ? 'Cedar & Brass' : 'Blue Finch Curios',
    savedAt: FIXED_NOW,
  }
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  return {
    ...unavailableShopperClient,
    async listSaved() {
      allowed()
      return fixture(state, [store], [])
    },
    async getSaveState(storeId) {
      allowed()
      return fixture(state, { saved: storeId === store.storeId }, { saved: false })
    },
    async setSave(_storeId, saved) {
      allowed()
      return { saved }
    },
    async getMemory(storeId) {
      allowed()
      return fixture(
        state,
        {
          storeId,
          rating: 4,
          note: 'Ask about the walnut secretary.',
          lastVisitMonth: '2026-07',
          version: 1,
        },
        null,
      )
    },
    async listMemories() {
      allowed()
      return fixture(
        state,
        [
          {
            storeId: store.storeId,
            rating: 4,
            note: 'Ask about the walnut secretary.',
            lastVisitMonth: '2026-07',
            version: 1,
          },
        ],
        [],
      )
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
          lastSeenAt: '2026-08-01T12:00:00.000Z',
          stores: [{ ...store, addedAt: '2026-08-04T12:00:00.000Z' }],
        },
        {
          area: { id: 'topeka', slug: 'topeka', label: 'Topeka area' },
          lastSeenAt: FIXED_NOW,
          stores: [],
        },
      )
    },
    async getCorrection(id) {
      allowed()
      if (scenario.id !== 'shopper-a' || id !== 'correction-a')
        throw new Error('Synthetic cross-account denial.')
      return fixture(state, { id, state: 'triaged' as const }, null)
    },
  }
}

function candidateClient(scenario: ReviewScenario, state: ReviewStateId): CandidateClient {
  const allowed = () => requireRole(scenario, ['Shopper'], true)
  return {
    ...unavailableCandidateClient,
    async listShares() {
      allowed()
      if (scenario.id !== 'shopper-b') return []
      return fixture(
        state,
        [
          {
            id: 'share-b',
            direction: 'received' as const,
            state: 'pending' as const,
            title: 'Weekend estate-sale lead',
            expiresAt: Date.parse('2026-08-12T12:00:00Z'),
          },
        ],
        [],
      )
    },
    async getShare(shareId) {
      allowed()
      if (scenario.id !== 'shopper-b' || shareId !== 'share-b')
        throw new Error('Synthetic cross-account denial.')
      return fixture(
        state,
        {
          id: shareId,
          direction: 'received' as const,
          state: 'pending' as const,
          title: 'Weekend estate-sale lead',
          expiresAt: Date.parse('2026-08-12T12:00:00Z'),
        },
        null,
      )
    },
    async listTripIdeas() {
      allowed()
      if (scenario.id !== 'shopper-b') return []
      return fixture(
        state,
        [
          {
            id: 'idea-b',
            ownerUserId: 'review-shopper-b',
            sourceShareId: 'share-b',
            title: 'North Topeka finds',
            urlNote: 'Start after breakfast.',
            version: 1,
          },
        ],
        [],
      )
    },
    async listBlockedCandidateSenders() {
      allowed()
      if (scenario.id !== 'shopper-b') return []
      return fixture(
        state,
        [
          {
            blockedUserId: 'synthetic-sender',
            label: 'A blocked synthetic sender',
            blockedAt: Date.parse(FIXED_NOW),
          },
        ],
        [],
      )
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
      storeId: 'store-blue-finch',
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
    shopper: shopperClient(scenario, state),
    candidate: candidateClient(scenario, state),
    trips: tripClient(scenario, state),
    portal: portalClient(scenario, state),
    reviews: reviewClient(scenario, state),
    partnerAdmin: partnerAdminClient(scenario, state),
  }
}
