import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  CatalogBrowserPage,
  CatalogDetailsPage,
  StorePhotosPage,
  StoreUpdatesPage,
  configuredCatalogClient,
  demoCatalogClient,
  type CatalogClient,
  type CatalogMapAdapter,
} from '../features/catalog'
import {
  AuthProvider,
  AuthCallbackPage,
  MfaPage,
  RecoveryPage,
  RegisterPage,
  RequireSession,
  useAuth,
  SignInPage,
  VerifyAccountPage,
  unavailableAuthProvider,
  CancelDeletionPage,
  DeleteAccountPage,
  ExportPage,
  PrivacyPage,
  unavailableLifecycleClient,
  type AccountLifecycleClient,
  type AuthProviderAdapter,
  type AuthStore,
  type AuthCallback,
  type SessionRegistryClient,
} from '../features/auth'
import {
  CatalogPrivateActions,
  CorrectionPage,
  CorrectionStatusPage,
  HistoryPage,
  MemoryPage,
  NewSincePage,
  SavedPage,
  unavailableShopperClient,
  type ShopperPrivateClient,
} from '../features/shopper'
import {
  CandidateSessionGuard,
  BlockedSendersPage,
  CapturePage,
  ShareDetailsPage,
  SharesPage,
  TripIdeasPage,
  unavailableCandidateClient,
  type CandidateClient,
} from '../features/candidates'
import {
  AcceptTripInvitationPage,
  GoPage,
  GuardedTrips,
  InviteTripPartnerPage,
  NewTripPage,
  PlanPage,
  SummaryPage,
  TripsPage,
  unavailableTripClient,
  createTripOfflineRuntime,
  installBackgroundPlaintextClearer,
  type TripOfflineGrantSource,
  type TripOfflineRuntime,
  type TripClient,
} from '../features/trips'
import {
  AuthoritativeCheckMyDayPage,
  CheckMyDayPage,
  type CheckMyDayProvider,
  type CheckMyDayRequest,
} from '../features/routing'
import {
  AccessSafetyPage,
  AdminGuard,
  AdminMorePage,
  AdminPrimaryNavigation,
  ADMIN_ROUTES,
  ReviewQueuePage,
  adminSessionFromAuth,
  unavailableAdminClient,
  type AdminClient,
  type AdminRouteId,
  type AdminSession,
} from '../features/admin'
import { AlphaGuard, AlphaReadinessPage } from '../features/alpha'
import {
  ExternalReadinessGuard,
  ExternalReadinessPage,
  type SyntheticTestAccount,
} from '../features/external'
import {
  PartnerActivatePage,
  PartnerClaimPage,
  PartnerDraftPage,
  PartnerJoinPage,
  PartnerAdminPage,
  PartnerStatusPage,
  PartnerVerifyPage,
  unavailablePartnerClient,
  unavailablePartnerAdminClient,
  type PartnerAdminClient,
  type PartnerClient,
} from '../features/partners'
import {
  PortalControlledChangesPage,
  PortalHomePage,
  PortalHoursPage,
  PortalLinksPage,
  PortalManagedFieldsPage,
  PortalPreviewPage,
  PortalSupportPage,
  PortalUpdatesPage,
  unavailablePortalClient,
  type PortalClient,
} from '../features/portal'
import {
  ModerationQueuePage,
  PublicReviewsPage,
  ReviewAppealPage,
  unavailableReviewClient,
  type ReviewClient,
} from '../features/reviews'
import {
  ReadinessStatusPage,
  unavailableReadinessClient,
  type DurableReadinessClient,
} from '../features/readiness'
import { BetaControlPage, unavailableBetaClient, type DurableBetaClient } from '../features/beta'
import { OperationalStatusPage, type OperationalStatusConfig } from '../features/status'
import {
  CommercialResearchPage,
  unavailableBillingClient,
  type BillingClient,
} from '../features/billing'
import type { ReviewHarnessRuntime } from '../review-harness/types'

// The current provider-neutral shell has no privileged session source. Keep the
// boundary explicitly unavailable until authenticated Admin wiring is approved.
const unavailableAlphaAccount = null
const unavailableExternalAccounts: SyntheticTestAccount[] = []
// Claims are available only in the local review harness until the production
// authority boundary is approved.
const publicListingClaimsEnabled = import.meta.env.VITE_REVIEW_HARNESS === 'true'
const blockedCheckMyDayProvider: CheckMyDayProvider = {
  async getCoordinateMatrix() {
    throw new Error('Routing provider is disabled until R-01 is approved.')
  },
}

function AppShell({
  children,
  reviewHarness,
  reviewHarnessUi,
}: {
  children: ReactNode
  reviewHarness?: ReviewHarnessRuntime
  reviewHarnessUi?: ReviewHarnessUi
}) {
  const location = useLocation()
  const { lifecycleReady } = useAuth()
  const contentRef = useRef<HTMLDivElement>(null)
  const moreIsCurrent = [
    '/more',
    '/saved',
    '/new-since',
    '/capture',
    '/shares',
    '/trip-ideas',
    '/account',
    '/install',
    '/help',
  ].some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
  const adminNav = location.pathname.startsWith('/admin')

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const focusHeading = () => {
      const heading = content.querySelector<HTMLElement>('h1')
      if (!heading) return false
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
      return true
    }

    if (focusHeading()) return
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect()
    })
    observer.observe(content, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [lifecycleReady, location.pathname])

  // Suppress the announced-heading focus ring after pointer navigation (keyboard keeps it).
  useEffect(() => {
    const onPointerDown = () => document.documentElement.setAttribute('data-pointer-input', 'true')
    const onKeyDown = () => document.documentElement.removeAttribute('data-pointer-input')
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <Link className="brand" to="/stores" aria-label="Antique Trail home">
          <img
            className="brand-mark"
            src="/app-icon.svg"
            alt=""
            aria-hidden="true"
            width="28"
            height="28"
          />
          <span>Antique Trail</span>
        </Link>
        <nav aria-label="Primary navigation">
          {adminNav ? (
            <AdminPrimaryNavigation />
          ) : (
            <>
              <NavLink to="/stores">
                <img
                  className="nav-icon"
                  src="/icons/antique-store.svg"
                  alt=""
                  aria-hidden="true"
                  width="20"
                  height="20"
                />
                Browse
              </NavLink>
              <NavLink to="/trips">
                <img
                  className="nav-icon"
                  src="/icons/trail-map.svg"
                  alt=""
                  aria-hidden="true"
                  width="20"
                  height="20"
                />
                My Trip
              </NavLink>
            </>
          )}
          {!adminNav && (
            <Link to="/more" aria-current={moreIsCurrent ? 'page' : undefined}>
              <svg
                className="nav-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              More
            </Link>
          )}
        </nav>
        <ThemeToggle />
      </header>
      {import.meta.env.VITE_PUBLIC_DEMO === 'true' && (
        <aside className="review-harness-banner" aria-label="Concept demo notice">
          <strong>Concept demo</strong>
          <span> Fictional sample stores. Accounts and private actions are not live.</span>
        </aside>
      )}
      {reviewHarness && reviewHarnessUi && <reviewHarnessUi.Banner runtime={reviewHarness} />}
      <div id="main-content" ref={contentRef} tabIndex={-1}>
        {children}
      </div>
      <footer className="site-footer">
        Synthetic catalog · Built for curious local explorers · <Link to="/status">Status</Link>
      </footer>
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark',
  )

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    try {
      localStorage.setItem('at-theme', next ? 'dark' : 'light')
    } catch {
      // Storage blocked (private mode); the in-session theme still applies.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

function MoreMenuLock() {
  return (
    <>
      <svg
        className="more-menu__lock"
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span className="sr-only"> Requires sign-in</span>
    </>
  )
}

function MorePage() {
  const { session } = useAuth()
  const signedIn = Boolean(session)
  const destinations: Array<{ to: string; label: string; requiresSignIn: boolean; icon?: string }> =
    [
      { to: '/saved', label: 'Saved Stores', requiresSignIn: true, icon: '/icons/saved-store.svg' },
      { to: '/new-since', label: 'New Since Your Last Visit', requiresSignIn: false },
      {
        to: '/account/history',
        label: 'Private History',
        requiresSignIn: true,
        icon: '/icons/private-notes.svg',
      },
      { to: '/capture', label: 'Add a Place from a Link', requiresSignIn: true },
      { to: '/shares', label: 'Shared with Me', requiresSignIn: true },
      { to: '/trip-ideas', label: 'Trip Ideas', requiresSignIn: true },
      { to: '/account/privacy', label: 'Account & Privacy', requiresSignIn: true },
      { to: '/install', label: 'Install', requiresSignIn: false },
      { to: '/help', label: 'Help', requiresSignIn: false },
    ]
  return (
    <main>
      <header>
        <p className="eyebrow">Your Antique Trail</p>
        <h1>More</h1>
        <p>Find your saved places, shared ideas, account settings, and help.</p>
      </header>
      <nav className="more-menu" aria-label="More destinations">
        {destinations.map((destination) => (
          <Link key={destination.to} to={destination.to}>
            {destination.icon && (
              <img
                className="more-menu__icon"
                src={destination.icon}
                alt=""
                aria-hidden="true"
                width="20"
                height="20"
              />
            )}
            {destination.label}
            {!signedIn && destination.requiresSignIn && <MoreMenuLock />}
          </Link>
        ))}
      </nav>
    </main>
  )
}

function InformationPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main>
      <section className="page-card">
        <h1>{title}</h1>
        <p>{children}</p>
        <Link className="button" to="/more">
          Back to More
        </Link>
      </section>
    </main>
  )
}

function useCatalogClient(override?: CatalogClient) {
  const { session } = useAuth()
  return useMemo(
    () =>
      override ?? configuredCatalogClient(() => session?.accessToken ?? null) ?? demoCatalogClient,
    [override, session?.accessToken],
  )
}

function StoreBrowser({
  shopperClient,
  catalog,
  map,
}: {
  shopperClient: ShopperPrivateClient
  catalog?: CatalogClient
  map?: CatalogMapAdapter
}) {
  const { session } = useAuth()
  const shopperProjection = !session || session.role === 'Shopper'
  const location = useLocation()
  const client = useCatalogClient(catalog)
  return (
    <CatalogBrowserPage
      client={client}
      map={map}
      initialSearch={location.search}
      renderPrivateActions={(store) =>
        shopperProjection ? (
          <CatalogPrivateActions storeId={store.id} slug={store.slug} client={shopperClient} />
        ) : (
          <p>
            Public directory view. Sign out and use a separate shopper account for private actions.
          </p>
        )
      }
    />
  )
}

function StoreDetails({
  shopperClient,
  catalog,
}: {
  shopperClient: ShopperPrivateClient
  catalog?: CatalogClient
}) {
  const { session } = useAuth()
  const shopperProjection = !session || session.role === 'Shopper'
  const { slug = '' } = useParams()
  const client = useCatalogClient(catalog)
  return (
    <CatalogDetailsPage
      client={client}
      slug={slug}
      renderPrivateActions={(store) =>
        shopperProjection ? (
          <CatalogPrivateActions storeId={store.id} slug={store.slug} client={shopperClient} />
        ) : (
          <p>
            Public directory view. Sign out and use a separate shopper account for private actions.
          </p>
        )
      }
    />
  )
}

function StoreUpdates({ catalog }: { catalog?: CatalogClient }) {
  const { slug = '' } = useParams()
  const client = useCatalogClient(catalog)
  return <StoreUpdatesPage client={client} slug={slug} />
}

function StorePhotos({ catalog }: { catalog?: CatalogClient }) {
  const { slug = '' } = useParams()
  const client = useCatalogClient(catalog)
  return <StorePhotosPage client={client} slug={slug} />
}

function ResolvedStorePrivateRoute({
  shopperClient,
  catalog,
  action,
}: {
  shopperClient: ShopperPrivateClient
  catalog?: CatalogClient
  action: 'memory' | 'correction'
}) {
  const { slug = '' } = useParams()
  const client = useCatalogClient(catalog)
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; storeId: string } | { kind: 'unavailable' }
  >({ kind: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    client
      .details(slug)
      .then((store) => {
        if (!cancelled)
          setState(store ? { kind: 'ready', storeId: store.id } : { kind: 'unavailable' })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'unavailable' })
      })
    return () => {
      cancelled = true
    }
  }, [client, slug])
  if (state.kind === 'loading') return <p role="status">Loading store…</p>
  if (state.kind === 'unavailable') return <NotFound />
  return action === 'memory' ? (
    <MemoryPage storeId={state.storeId} client={shopperClient} />
  ) : (
    <CorrectionPage storeId={state.storeId} client={shopperClient} />
  )
}

function StoreReviews({ client, catalog }: { client: ReviewClient; catalog?: CatalogClient }) {
  const { slug = '' } = useParams()
  const catalogClient = useCatalogClient(catalog)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let cancelled = false
    setStoreId(null)
    setUnavailable(false)
    catalogClient
      .details(slug)
      .then((store) => {
        if (cancelled) return
        if (store) setStoreId(store.id)
        else setUnavailable(true)
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [catalogClient, slug])
  if (unavailable) return <NotFound />
  if (!storeId) return <p role="status">Loading store…</p>
  return <PublicReviewsPage client={client} storeId={storeId} />
}

function RestrictionAppeal({ client }: { client: ReviewClient }) {
  const { restrictionId = '' } = useParams()
  return <ReviewAppealPage restrictionId={restrictionId} client={client} />
}

function ReadinessStatus({ client }: { client: DurableReadinessClient }) {
  const { runId = '' } = useParams()
  return <ReadinessStatusPage runId={runId} client={client} />
}

function CommercialResearchRoute({
  client,
  runtime,
}: {
  client: BillingClient
  runtime: NonNullable<AppRuntime['commercialResearch']>
}) {
  const { authorizationId = '' } = useParams()
  return (
    <CommercialResearchPage
      authorizationId={authorizationId}
      artifactDigest={runtime.artifactDigest}
      questionVersion={runtime.questionVersion}
      client={client}
    />
  )
}

function BetaControl({ client }: { client: DurableBetaClient }) {
  const { cohortId = '' } = useParams()
  return <BetaControlPage cohortId={cohortId} client={client} />
}

function CandidateCaptureRoute({ client }: { client: CandidateClient }) {
  const { session } = useAuth()
  return (
    <CandidateSessionGuard userId={session?.userId}>
      <CapturePage client={client} />
    </CandidateSessionGuard>
  )
}

function CandidateSharesRoute({ client }: { client: CandidateClient }) {
  return <SharesPage client={client} />
}

function CandidateShareDetailsRoute({ client }: { client: CandidateClient }) {
  return <ShareDetailsPage client={client} />
}

function CandidateIdeasRoute({ client }: { client: CandidateClient }) {
  return <TripIdeasPage client={client} />
}

function CandidateBlockedSendersRoute({ client }: { client: CandidateClient }) {
  return <BlockedSendersPage client={client} />
}

function AuthenticatedAdminGuard({
  override,
  registry,
  children,
}: {
  override?: AdminSession
  registry?: SessionRegistryClient
  children: ReactNode
}) {
  const { session } = useAuth()
  const [registryProof, setRegistryProof] = useState<{ key: string; active: boolean } | null>(null)
  const testOverride = import.meta.env.MODE === 'test' ? override : undefined
  useEffect(() => {
    let current = true
    setRegistryProof(null)
    if (!session || !registry || testOverride) return () => undefined
    const key = `${session.userId}:${session.accessToken}`
    registry
      .isActive(session)
      .then((active) => {
        if (current) setRegistryProof({ key, active })
      })
      .catch(() => {
        if (current) setRegistryProof({ key, active: false })
      })
    return () => {
      current = false
    }
  }, [registry, session, testOverride])
  const derived = adminSessionFromAuth(session)
  const sessionKey = session ? `${session.userId}:${session.accessToken}` : null
  if (!testOverride && session && registry && registryProof?.key !== sessionKey)
    return <p role="status">Verifying administrator session…</p>
  const guarded = derived
    ? {
        ...derived,
        sessionActive:
          derived.sessionActive && registryProof?.key === sessionKey && registryProof.active,
      }
    : null
  return <AdminGuard session={testOverride ?? guarded}>{children}</AdminGuard>
}

function TripAccountLifecycle({ runtime }: { runtime: TripOfflineRuntime }) {
  const { session } = useAuth()
  const priorAccount = useRef(session?.userId)
  useEffect(() => {
    const previous = priorAccount.current
    if (previous && session?.userId && previous !== session.userId)
      void runtime.purgeAccount(previous, 'account_switch')
    priorAccount.current = session?.userId
  }, [runtime, session?.userId])
  return null
}

function TripAwareAccountPage({ runtime }: { runtime: TripOfflineRuntime }) {
  const { session, signOut } = useAuth()
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [error, setError] = useState(false)

  async function requestSignOut() {
    if (!session) return
    try {
      const status = await runtime.prepareSignOut(session.userId)
      if (status.requiresConfirmation) setUnsyncedCount(status.pendingCount)
      else await signOut()
    } catch {
      setError(true)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="account-heading">
        <h1 id="account-heading">Your account</h1>
        <p>Signed in as a private {session?.role} account.</p>
        {unsyncedCount > 0 && (
          <div role="alert">
            <p>
              {unsyncedCount} offline change{unsyncedCount === 1 ? '' : 's'} will be permanently
              lost if you sign out.
            </p>
            <button className="button" type="button" onClick={() => void signOut()}>
              Sign out and discard offline changes
            </button>
            <button type="button" onClick={() => setUnsyncedCount(0)}>
              Keep working
            </button>
          </div>
        )}
        {error && <p role="alert">We couldn&apos;t safely prepare sign-out. Please try again.</p>}
        {unsyncedCount === 0 && (
          <button className="button" type="button" onClick={() => void requestSignOut()}>
            Sign out
          </button>
        )}
        <nav className="account-menu" aria-label="Account controls">
          <Link to="/account/privacy">Privacy choices</Link>
          <Link to="/account/export">Export my data</Link>
          <Link to="/account/delete">Delete my account</Link>
          {session?.role === 'Shopper' && <Link to="/account/history">Private history</Link>}
        </nav>
      </section>
    </main>
  )
}

function TripGoRoute({
  client,
  runtime,
  grantSource,
}: {
  client: TripClient
  runtime: TripOfflineRuntime
  grantSource?: TripOfflineGrantSource
}) {
  const { session } = useAuth()
  return (
    <GoPage
      client={client}
      offlineRuntime={runtime}
      offlineGrantSource={grantSource}
      accountId={session?.userId}
    />
  )
}

function TripCheckMyDayRoute({ client }: { client: TripClient }) {
  const { tripId = '' } = useParams()
  const persist = async (choice: 'suggested' | 'manual', stopIds: string[]) => {
    if (!client.saveCheckMyDayChoice) throw new Error('Trip choice persistence is unavailable.')
    await client.saveCheckMyDayChoice(tripId, choice, stopIds)
  }
  if (!client.requestCheckMyDay || !client.getCheckMyDaySuggestion)
    return <CheckMyDayPage request={null} provider={blockedCheckMyDayProvider} />
  return (
    <AuthoritativeCheckMyDayPage
      requestServer={() => client.requestCheckMyDay!(tripId)}
      pollServer={(requestId) => client.getCheckMyDaySuggestion!(requestId)}
      onUseSuggestedOrder={(ids) => persist('suggested', ids)}
      onKeepMyOrder={async () => {
        const trip = await client.get(tripId)
        if (trip)
          await persist(
            'manual',
            trip.stops.map((stop) => stop.id),
          )
      }}
    />
  )
}

function NotFound() {
  return (
    <main>
      <section className="page-card" aria-labelledby="not-found-heading">
        <h1 id="not-found-heading">Page not found</h1>
        <Link className="button" to="/stores">
          Browse stores
        </Link>
      </section>
    </main>
  )
}

export interface AppClients {
  catalog?: CatalogClient
  map?: CatalogMapAdapter
  candidate?: CandidateClient
  shopper?: ShopperPrivateClient
  trips?: TripClient
  partner?: PartnerClient
  partnerAdmin?: PartnerAdminClient
  admin?: AdminClient
  lifecycle?: AccountLifecycleClient
  reviews?: ReviewClient
  portal?: PortalClient
  readiness?: DurableReadinessClient
  billing?: BillingClient
  beta?: DurableBetaClient
  operationalStatus?: OperationalStatusConfig
  tripOfflineGrants?: TripOfflineGrantSource
  routing?: { provider: CheckMyDayProvider; capability: CheckMyDayRequest['capability'] }
}

export interface AppRuntime {
  tripOffline?: TripOfflineRuntime
  authStore?: AuthStore
  authProvider?: AuthProviderAdapter
  sessionRegistry?: SessionRegistryClient
  /** Test-only override. Production administration is derived from AuthContext. */
  adminSession?: AdminSession
  /** Explicit local-only role and state fixtures; never configured by production composition. */
  reviewHarness?: ReviewHarnessRuntime
  /** Components are supplied only by the compile-time review branch. */
  reviewHarnessUi?: ReviewHarnessUi
  /** Pre-render memory-only callback captured by the bootstrap preflight. */
  authCallback?: AuthCallback | null
  /** Deployment-protected research builds provide exact frozen artifact/question bindings. */
  commercialResearch?: { artifactDigest: string; questionVersion: string }
}

export interface ReviewHarnessUi {
  Banner: ComponentType<{ runtime: ReviewHarnessRuntime }>
  Page: ComponentType<{ runtime: ReviewHarnessRuntime }>
}

export default function App({
  clients = {},
  runtime = {},
}: {
  clients?: AppClients
  runtime?: AppRuntime
}) {
  const candidateClient = clients.candidate ?? unavailableCandidateClient
  const shopperClient = clients.shopper ?? unavailableShopperClient
  const tripClient = clients.trips ?? unavailableTripClient
  const partnerClient = clients.partner ?? unavailablePartnerClient
  const partnerAdminClient = clients.partnerAdmin ?? unavailablePartnerAdminClient
  const adminClient = clients.admin ?? unavailableAdminClient
  const lifecycleClient = clients.lifecycle ?? unavailableLifecycleClient
  const reviewClient = clients.reviews ?? unavailableReviewClient
  const portalClient = clients.portal ?? unavailablePortalClient
  const readinessClient = clients.readiness ?? unavailableReadinessClient
  const billingClient = clients.billing ?? unavailableBillingClient
  const betaClient = clients.beta ?? unavailableBetaClient
  const authProvider = runtime.authProvider ?? unavailableAuthProvider
  const tripOfflineRef = useRef<TripOfflineRuntime>(
    runtime.tripOffline ?? createTripOfflineRuntime(),
  )
  const tripOffline = tripOfflineRef.current
  const [privacyEpoch, setPrivacyEpoch] = useState(0)
  useEffect(
    () => installBackgroundPlaintextClearer(document, () => setPrivacyEpoch((value) => value + 1)),
    [],
  )

  const adminRouteElements: Record<AdminRouteId, ReactNode> = {
    reviewQueue: <ReviewQueuePage client={adminClient} />,
    accessSafety: <AccessSafetyPage client={adminClient} />,
    more: <AdminMorePage />,
    partners: <PartnerAdminPage client={partnerAdminClient} />,
    reviews: <ModerationQueuePage client={reviewClient} />,
    readiness: <ReadinessStatus client={readinessClient} />,
    beta: <BetaControl client={betaClient} />,
  }

  return (
    <AuthProvider
      provider={authProvider}
      authStore={runtime.authStore}
      registry={runtime.sessionRegistry}
      lifecycle={clients.lifecycle}
      onLocalSignOut={async (session) => {
        await tripOffline.prepareSignOut(session.userId)
        await tripOffline.purgeAccount(session.userId, 'confirmed_logout')
      }}
    >
      <TripAccountLifecycle runtime={tripOffline} />
      <AppShell
        key={privacyEpoch}
        reviewHarness={runtime.reviewHarness}
        reviewHarnessUi={runtime.reviewHarnessUi}
      >
        <Routes>
          <Route path="/" element={<Navigate replace to="/stores" />} />
          {runtime.reviewHarness && runtime.reviewHarnessUi && (
            <Route
              path="/review"
              element={<runtime.reviewHarnessUi.Page runtime={runtime.reviewHarness} />}
            />
          )}
          <Route
            path="/status"
            element={
              <main>
                <OperationalStatusPage config={clients.operationalStatus ?? {}} />
              </main>
            }
          />
          <Route path="/more" element={<MorePage />} />
          <Route
            path="/install"
            element={
              <InformationPage title="Install Antique Trail">
                Install guidance will appear here when this device supports the approved app flow.
              </InformationPage>
            }
          />
          <Route
            path="/help"
            element={
              <InformationPage title="Help">
                Help and support contacts will appear here when operational support is configured.
              </InformationPage>
            }
          />
          <Route
            path="/stores"
            element={
              <StoreBrowser
                shopperClient={shopperClient}
                catalog={clients.catalog}
                map={clients.map}
              />
            }
          />
          <Route
            path="/stores/:slug"
            element={<StoreDetails shopperClient={shopperClient} catalog={clients.catalog} />}
          />
          <Route
            path="/stores/:slug/updates"
            element={<StoreUpdates catalog={clients.catalog} />}
          />
          <Route path="/stores/:slug/photos" element={<StorePhotos catalog={clients.catalog} />} />
          <Route
            path="/stores/:slug/reviews"
            element={<StoreReviews client={reviewClient} catalog={clients.catalog} />}
          />
          <Route
            path="/stores/:slug/memory"
            element={
              <RequireSession requiredRole="Shopper">
                <ResolvedStorePrivateRoute
                  shopperClient={shopperClient}
                  catalog={clients.catalog}
                  action="memory"
                />
              </RequireSession>
            }
          />
          <Route
            path="/stores/:slug/correction"
            element={
              <ResolvedStorePrivateRoute
                shopperClient={shopperClient}
                catalog={clients.catalog}
                action="correction"
              />
            }
          />
          <Route path="/auth/sign-in" element={<SignInPage provider={authProvider} />} />
          <Route path="/auth/register" element={<RegisterPage provider={authProvider} />} />
          <Route path="/auth/verify" element={<VerifyAccountPage />} />
          <Route
            path="/auth/callback"
            element={<AuthCallbackPage provider={authProvider} callback={runtime.authCallback} />}
          />
          <Route path="/auth/recovery" element={<RecoveryPage provider={authProvider} />} />
          <Route path="/auth/mfa" element={<MfaPage provider={authProvider} />} />
          <Route
            path="/research/photo-tiers/:authorizationId"
            element={
              runtime.commercialResearch ? (
                <RequireSession>
                  <CommercialResearchRoute
                    client={billingClient}
                    runtime={runtime.commercialResearch}
                  />
                </RequireSession>
              ) : (
                <NotFound />
              )
            }
          />
          <Route
            path="/account/*"
            element={
              <RequireSession>
                <TripAwareAccountPage runtime={tripOffline} />
              </RequireSession>
            }
          />
          <Route
            path="/account/privacy"
            element={
              <RequireSession requiredRole="Shopper">
                <PrivacyPage client={lifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/export"
            element={
              <RequireSession requiredRole="Shopper">
                <ExportPage client={lifecycleClient} provider={authProvider} />
              </RequireSession>
            }
          />
          <Route
            path="/account/delete"
            element={
              <RequireSession requiredRole="Shopper">
                <DeleteAccountPage client={lifecycleClient} provider={authProvider} />
              </RequireSession>
            }
          />
          <Route
            path="/account/delete/cancel"
            element={
              <RequireSession requiredRole="Shopper" allowCancellationOnly>
                <CancelDeletionPage client={lifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/saved"
            element={
              <RequireSession requiredRole="Shopper">
                <SavedPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/new-since"
            element={
              <RequireSession requiredRole="Shopper">
                <NewSincePage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/history"
            element={
              <RequireSession requiredRole="Shopper">
                <HistoryPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/corrections/:correctionId"
            element={
              <RequireSession requiredRole="Shopper">
                <CorrectionStatusPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/capture"
            element={
              <RequireSession requiredRole="Shopper">
                <CandidateCaptureRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/shares"
            element={
              <RequireSession requiredRole="Shopper">
                <CandidateSharesRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/shares/:shareId"
            element={
              <RequireSession requiredRole="Shopper">
                <CandidateShareDetailsRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/trip-ideas"
            element={
              <RequireSession requiredRole="Shopper">
                <CandidateIdeasRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/privacy/blocked-senders"
            element={
              <RequireSession requiredRole="Shopper">
                <CandidateBlockedSendersRoute client={candidateClient} />
              </RequireSession>
            }
          />
          {ADMIN_ROUTES.map((route) => (
            <Route
              key={route.id}
              path={route.path}
              element={
                <AuthenticatedAdminGuard
                  override={runtime.adminSession}
                  registry={runtime.sessionRegistry}
                >
                  {adminRouteElements[route.id]}
                </AuthenticatedAdminGuard>
              }
            />
          ))}
          <Route
            path="/alpha/readiness"
            element={
              <AlphaGuard account={unavailableAlphaAccount}>
                <AlphaReadinessPage />
              </AlphaGuard>
            }
          />
          <Route
            path="/external/readiness"
            element={
              <ExternalReadinessGuard accounts={unavailableExternalAccounts}>
                <ExternalReadinessPage />
              </ExternalReadinessGuard>
            }
          />
          <Route
            path="/reviews/restrictions/:restrictionId/appeal"
            element={<RestrictionAppeal client={reviewClient} />}
          />
          <Route path="/partner/join" element={<PartnerJoinPage client={partnerClient} />} />
          <Route path="/partner/verify" element={<PartnerVerifyPage client={partnerClient} />} />
          <Route path="/partner/draft" element={<PartnerDraftPage client={partnerClient} />} />
          <Route path="/partner/status" element={<PartnerStatusPage client={partnerClient} />} />
          <Route
            path="/partner/claim"
            element={
              publicListingClaimsEnabled ? (
                <RequireSession>
                  <PartnerClaimPage client={partnerClient} />
                </RequireSession>
              ) : (
                <NotFound />
              )
            }
          />
          <Route
            path="/partner/activate"
            element={<PartnerActivatePage client={partnerClient} />}
          />
          <Route path="/store-portal" element={<PortalHomePage client={portalClient} />} />
          <Route path="/store-portal/hours" element={<PortalHoursPage client={portalClient} />} />
          <Route
            path="/store-portal/info"
            element={<PortalManagedFieldsPage client={portalClient} />}
          />
          <Route
            path="/store-portal/changes"
            element={<PortalControlledChangesPage client={portalClient} />}
          />
          <Route
            path="/store-portal/updates"
            element={<PortalUpdatesPage client={portalClient} />}
          />
          <Route path="/store-portal/links" element={<PortalLinksPage client={portalClient} />} />
          <Route
            path="/store-portal/support"
            element={<PortalSupportPage client={portalClient} />}
          />
          <Route
            path="/store-portal/preview"
            element={<PortalPreviewPage client={portalClient} />}
          />
          <Route
            path="/trips"
            element={
              <GuardedTrips>
                <TripsPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/new"
            element={
              <GuardedTrips>
                <NewTripPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/plan"
            element={
              <GuardedTrips>
                <PlanPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/invite"
            element={
              <GuardedTrips>
                <InviteTripPartnerPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trip-invitations"
            element={
              <GuardedTrips>
                <AcceptTripInvitationPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/go"
            element={
              <GuardedTrips>
                <TripGoRoute
                  client={tripClient}
                  runtime={tripOffline}
                  grantSource={clients.tripOfflineGrants}
                />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/check-my-day"
            element={
              <GuardedTrips>
                <TripCheckMyDayRoute client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/summary"
            element={
              <GuardedTrips>
                <SummaryPage client={tripClient} />
              </GuardedTrips>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </AuthProvider>
  )
}
