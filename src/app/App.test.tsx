import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryAuthStore, type AuthSession } from '../features/auth'
import type { TripOfflineRuntime } from '../features/trips'
import type { PartnerAdminClient } from '../features/partners'
import { createAccessibleCatalogMapAdapter, demoCatalogClient } from '../features/catalog'
import { unavailableReviewClient } from '../features/reviews'
import { unavailablePortalClient } from '../features/portal'
import type { DurableReadinessClient } from '../features/readiness'
import App from './App'
import { createReviewHarness } from '../review-harness/harness'
import {
  createReviewHarnessAuthProvider,
  createReviewHarnessClients,
} from '../review-harness/clients'

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
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toHaveTextContent(
      'BrowseMy TripMore',
    )
    expect(screen.getByRole('heading', { name: /browse stores/i })).toHaveFocus()
  })

  it('opens the stable More menu and focuses its page heading', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: 'More' }))

    expect(screen.getByRole('heading', { name: 'More' })).toHaveFocus()
    expect(screen.getByRole('navigation', { name: /more destinations/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /saved stores/i })).toHaveAttribute('href', '/saved')
    expect(screen.getByRole('link', { name: /new since your last visit/i })).toHaveAttribute(
      'href',
      '/new-since',
    )
    expect(screen.getByRole('link', { name: /private history/i })).toHaveAttribute(
      'href',
      '/account/history',
    )
    expect(screen.getByRole('link', { name: /account & privacy/i })).toHaveAttribute(
      'href',
      '/account/privacy',
    )
  })

  it('focuses the final private destination after lifecycle hydration', async () => {
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/saved?reviewAs=shopper-a&reviewState=success',
    })
    expect(harness).not.toBeNull()
    render(
      <MemoryRouter initialEntries={['/saved?reviewAs=shopper-a&reviewState=success']}>
        <App
          clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
          runtime={{
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /saved stores/i })).toHaveFocus()
  })

  it('advances review export reauthentication to the request action', async () => {
    const user = userEvent.setup()
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/account/export?reviewAs=shopper-a&reviewState=success',
    })
    expect(harness).not.toBeNull()
    render(
      <MemoryRouter initialEntries={['/account/export?reviewAs=shopper-a&reviewState=success']}>
        <App
          clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
          runtime={{
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/email/i), 'shopper-a@local.invalid')
    await user.type(screen.getByLabelText(/^password$/i), 'synthetic-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(await screen.findByRole('button', { name: /request export/i })).toHaveFocus()
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

  it('keeps direct Administrator routes under exactly Review, Access, and More', () => {
    render(
      <MemoryRouter initialEntries={['/admin/more']}>
        <App
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

    const navigation = screen.getByRole('navigation', { name: /primary navigation/i })
    expect(navigation).toHaveTextContent('ReviewAccessMore')
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Access' })).toHaveAttribute('href', '/admin/access')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/admin/more')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /administrator more destinations/i }),
    ).toHaveTextContent(/Support.*Readiness.*View Audit.*Evidence.*Communities.*System status/s)
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

  it('exposes server-owned readiness status only through the authenticated admin boundary', async () => {
    const readiness: DurableReadinessClient = {
      getStatus: vi.fn(async (runId) => ({
        runId,
        state: 'frozen' as const,
        frozenDigest: 'sha256:frozen',
        blockers: ['provider_e'],
        calculatedAt: '2026-08-05T00:00:00Z',
        receiptId: null,
      })),
      requestSigningChallenge: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/admin/readiness/run-1']}>
        <App
          clients={{ readiness }}
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
    expect(await screen.findByRole('heading', { name: /readiness status/i })).toBeVisible()
    expect(screen.getByRole('region', { name: /readiness blockers/i })).toHaveTextContent(
      'provider_e',
    )
    expect(readiness.getStatus).toHaveBeenCalledWith('run-1')
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

  it('wires the injected durable Store Portal client into portal routes', async () => {
    const getHome = vi.fn(async () => ({
      store: {
        id: 'store-1',
        name: 'Oak Antiques',
        listingState: 'active' as const,
        timeZone: 'America/Chicago',
      },
      freshness: { state: 'verified' as const, label: 'Verified' },
      provenance: {
        sourceLabel: 'Representative',
        verifiedBy: 'Administrator',
        verifiedAt: '2026-08-01T00:00:00Z',
        ownerConfirmed: true,
      },
      pendingChanges: [],
    }))
    render(
      <MemoryRouter initialEntries={['/store-portal']}>
        <App clients={{ portal: { ...unavailablePortalClient, getHome } }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Oak Antiques')).toBeVisible()
    expect(getHome).toHaveBeenCalledOnce()
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
      requestId: '00000000-0000-4000-8000-000000000003',
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
    expect(screen.getByRole('heading', { name: /your account/i })).toHaveFocus()
    const controls = screen.getByRole('navigation', { name: /account controls/i })
    expect(controls).toHaveTextContent(
      'Privacy choicesExport my dataDelete my accountPrivate history',
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
