import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryAuthStore, type AuthSession } from '../features/auth'
import type { TripOfflineRuntime } from '../features/trips'
import type { PartnerAdminClient } from '../features/partners'
import { createAccessibleCatalogMapAdapter, demoCatalogClient } from '../features/catalog'
import { unavailableReviewClient } from '../features/reviews'
import App from './App'

describe('app shell', () => {
  afterEach(cleanup)
  it('renders the browse route with a skip-free accessible heading', () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /browse stores/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
  })

  it('wires private shopper actions into public catalog results', async () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findAllByRole('link', { name: /sign in to save store/i })).not.toHaveLength(
      0,
    )
    expect(screen.getAllByRole('link', { name: /sign in for private memory/i })).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /suggest a correction/i })).not.toHaveLength(0)
  })

  it('composes an injected accessible map without replacing the browse list', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            map: createAccessibleCatalogMapAdapter({
              capability: 'available',
              attribution: 'Approved synthetic map',
              bounds: { north: 39.2, south: 38.9, east: -95.5, west: -95.9 },
            }),
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /blue finch curios/i })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /show map/i }))
    expect(await screen.findAllByRole('region', { name: /store map/i })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  })

  it('fails the unavailable admin boundary closed without a role bypass', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('keeps partner administration closed without authoritative recent-auth evidence', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /partner administration/i }),
    ).not.toBeInTheDocument()
  })

  it('opens exact partner administration for an injected active MFA recent-auth session', () => {
    const partnerAdmin: PartnerAdminClient = {
      getCase: vi.fn(),
      decide: vi.fn(),
      issueSyntheticInvitation: vi.fn(),
      verifySignal: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App
          clients={{ partnerAdmin }}
          runtime={{
            adminSession: {
              userId: 'admin-1',
              role: 'Administrator',
              mfaEnrolled: true,
              mfaVerified: true,
              recentAuthAt: Date.now(),
              sessionActive: true,
            },
          }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /partner administration/i })).toBeInTheDocument()
  })

  it('opens partner administration from the real AuthContext session metadata', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'admin-2',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Administrator',
      mfaRequired: true,
      mfaEnrolled: true,
      mfaVerified: true,
      passwordAuthenticatedAt: new Date().toISOString(),
      mfaVerifiedAt: new Date().toISOString(),
    })
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App
          runtime={{
            authStore,
            sessionRegistry: {
              registerCurrentSession: vi.fn(),
              isActive: vi.fn(async () => true),
              revoke: vi.fn(),
            },
          }}
        />
      </MemoryRouter>,
    )
    return screen.findByRole('heading', { name: /partner administration/i })
  })

  it('exposes partner onboarding routes while keeping provider access gated', async () => {
    render(
      <MemoryRouter initialEntries={['/partner/verify']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /create and verify account/i })).toBeInTheDocument()
    expect(
      screen.getByText(/provider email verification is intentionally disabled/i),
    ).toBeInTheDocument()
  })

  it('keeps Internal Alpha readiness unavailable until an approved test account exists', async () => {
    render(
      <MemoryRouter initialEntries={['/alpha/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /synthetic internal alpha/i }),
    ).not.toBeInTheDocument()
  })

  it('exposes Store Portal home while keeping privileged reads unavailable by default', async () => {
    render(
      <MemoryRouter initialEntries={['/store-portal']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /store portal/i })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update this store portal/i)
  })

  it('keeps External Testing Readiness unavailable until the human gates exist', async () => {
    render(
      <MemoryRouter initialEntries={['/external/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /external testing readiness/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps public review entry unavailable before regional promotion', async () => {
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios/reviews']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/not available in this release/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview review/i })).not.toBeInTheDocument()
  })

  it('resolves a public store slug before calling the injected durable review client', async () => {
    const getStoreReviews = vi.fn(async () => ({
      storeId: 'unused',
      aggregate: { average: 0, count: 0 },
      reviews: [],
      ownReview: null,
    }))
    const getEligibility = vi.fn(async () => ({
      verifiedEmail: true,
      ageAttested: true,
      completedVisit: true,
      manualVisitAttested: false,
      activeReviewExists: false,
      ownStoreConflict: false,
      accountDeletionScheduled: false,
      rateLimited: false,
    }))
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios/reviews']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            reviews: {
              ...unavailableReviewClient,
              getCapability: async () => ({
                stage: 'regional_public_mvp',
                enabled: true,
                source: 'server',
              }),
              getStoreReviews,
              getEligibility,
            },
          }}
        />
      </MemoryRouter>,
    )
    const storeId = '00000000-0000-4000-8000-000000000001'
    expect(await screen.findByText(/no approved reviews yet/i)).toBeVisible()
    expect(getStoreReviews).toHaveBeenCalledWith(storeId)
    expect(getEligibility).toHaveBeenCalledWith(storeId)
  })

  it('returns not-found for the disabled public listing claim route', () => {
    render(
      <MemoryRouter initialEntries={['/partner/claim']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /claim a listing/i })).not.toBeInTheDocument()
  })

  it('uses the injected auth provider on the sign-in route', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => ({ kind: 'error' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/sign-in']}>
        <App
          runtime={{
            authProvider: {
              signIn,
              sendRecovery: vi.fn(),
              verifyMfa: vi.fn(),
              signOut: vi.fn(),
            },
          }}
        />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'shopper@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(signIn).toHaveBeenCalledWith('shopper@example.com', 'secret-password')
  })

  it('wires authenticated sign-out to the trip offline purge runtime', async () => {
    const user = userEvent.setup()
    const authStore = new InMemoryAuthStore()
    const session: AuthSession = {
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    }
    authStore.setSession(session)
    const offline: TripOfflineRuntime = {
      installId: 'test-install',
      deviceKeyId: 'test-device-key',
      start: vi.fn(),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: true, pendingCount: 1 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App runtime={{ authStore, tripOffline: offline }} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(offline.prepareSignOut).toHaveBeenCalledWith('shopper-a')
    expect(screen.getByRole('alert')).toHaveTextContent(/offline change.*permanently lost/i)
    expect(offline.purgeAccount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /sign out and discard/i }))
    expect(offline.purgeAccount).toHaveBeenCalledWith('shopper-a', 'confirmed_logout')
  })

  it('exposes Check My Day as a provider-blocked authenticated route until R-01', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/check-my-day']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /check my day/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/not available yet/i)
  })
})
