import type { ReactNode } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import {
  CatalogBrowserPage,
  CatalogDetailsPage,
  configuredCatalogClient,
  demoCatalogClient,
} from '../features/catalog'
import {
  AccountPlaceholder,
  AuthProvider,
  MfaPage,
  RecoveryPage,
  RequireSession,
  useAuth,
  SignInPage,
  unavailableAuthProvider,
  CancelDeletionPage,
  DeleteAccountPage,
  ExportPage,
  PrivacyPage,
  unavailableLifecycleClient,
} from '../features/auth'
import {
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
  type TripClient,
} from '../features/trips'
import { AccessSafetyPage, AdminGuard, ReviewQueuePage } from '../features/admin'
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
  PartnerStatusPage,
  PartnerVerifyPage,
  unavailablePartnerClient,
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
} from '../features/portal'
import {
  ModerationQueuePage,
  PublicReviewsPage,
  ReviewAppealPage,
  unavailableReviewClient,
} from '../features/reviews'

const catalogClient = configuredCatalogClient() ?? demoCatalogClient
// The current provider-neutral shell has no privileged session source. Keep the
// boundary explicitly unavailable until authenticated Admin wiring is approved.
const unavailableAdminSession = null
const unavailableAlphaAccount = null
const unavailableExternalAccounts: SyntheticTestAccount[] = []

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/stores" aria-label="Antique Trail home">
          <span className="brand-mark" aria-hidden="true">
            AT
          </span>
          <span>Antique Trail</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link to="/stores">Browse stores</Link>
          <Link to="/saved">Saved stores</Link>
          <Link to="/new-since">New since</Link>
        </nav>
      </header>
      <div id="main-content">{children}</div>
      <footer className="site-footer">Synthetic catalog · Built for curious local explorers</footer>
    </div>
  )
}

function StoreBrowser() {
  const location = useLocation()
  return <CatalogBrowserPage client={catalogClient} initialSearch={location.search} />
}

function StoreDetails() {
  const { slug = '' } = useParams()
  return <CatalogDetailsPage client={catalogClient} slug={slug} />
}

function StoreReviews() {
  const { slug = '' } = useParams()
  return <PublicReviewsPage client={unavailableReviewClient} storeId={slug} />
}

function RestrictionAppeal() {
  const { restrictionId = '' } = useParams()
  return <ReviewAppealPage restrictionId={restrictionId} client={unavailableReviewClient} />
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

function NotFound() {
  return (
    <section className="page-card" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <Link className="button" to="/stores">
        Browse stores
      </Link>
    </section>
  )
}

export interface AppClients {
  candidate?: CandidateClient
  shopper?: ShopperPrivateClient
  trips?: TripClient
  partner?: PartnerClient
}

export default function App({ clients = {} }: { clients?: AppClients }) {
  const candidateClient = clients.candidate ?? unavailableCandidateClient
  const shopperClient = clients.shopper ?? unavailableShopperClient
  const tripClient = clients.trips ?? unavailableTripClient
  const partnerClient = clients.partner ?? unavailablePartnerClient

  return (
    <AuthProvider provider={unavailableAuthProvider}>
      <AppShell>
        <Routes>
          <Route path="/stores" element={<StoreBrowser />} />
          <Route path="/stores/:slug" element={<StoreDetails />} />
          <Route path="/stores/:slug/reviews" element={<StoreReviews />} />
          <Route
            path="/stores/:slug/memory"
            element={
              <RequireSession>
                <MemoryPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/stores/:slug/correction"
            element={<CorrectionPage client={shopperClient} />}
          />
          <Route path="/auth/sign-in" element={<SignInPage provider={unavailableAuthProvider} />} />
          <Route
            path="/auth/recovery"
            element={<RecoveryPage provider={unavailableAuthProvider} />}
          />
          <Route path="/auth/mfa" element={<MfaPage provider={unavailableAuthProvider} />} />
          <Route
            path="/account/*"
            element={
              <RequireSession>
                <AccountPlaceholder />
              </RequireSession>
            }
          />
          <Route
            path="/account/privacy"
            element={
              <RequireSession>
                <PrivacyPage client={unavailableLifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/export"
            element={
              <RequireSession>
                <ExportPage client={unavailableLifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/delete"
            element={
              <RequireSession>
                <DeleteAccountPage client={unavailableLifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/delete/cancel"
            element={
              <RequireSession>
                <CancelDeletionPage client={unavailableLifecycleClient} />
              </RequireSession>
            }
          />
          <Route
            path="/saved"
            element={
              <RequireSession>
                <SavedPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/new-since"
            element={
              <RequireSession>
                <NewSincePage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/history"
            element={
              <RequireSession>
                <HistoryPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/corrections/:correctionId"
            element={
              <RequireSession>
                <CorrectionStatusPage client={shopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/capture"
            element={
              <RequireSession>
                <CandidateCaptureRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/shares"
            element={
              <RequireSession>
                <CandidateSharesRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/shares/:shareId"
            element={
              <RequireSession>
                <CandidateShareDetailsRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/trip-ideas"
            element={
              <RequireSession>
                <CandidateIdeasRoute client={candidateClient} />
              </RequireSession>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminGuard session={unavailableAdminSession}>
                <ReviewQueuePage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/access"
            element={
              <AdminGuard session={unavailableAdminSession}>
                <AccessSafetyPage />
              </AdminGuard>
            }
          />
          <Route
            path="/admin/reviews"
            element={
              <AdminGuard session={unavailableAdminSession}>
                <ModerationQueuePage client={unavailableReviewClient} />
              </AdminGuard>
            }
          />
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
            element={<RestrictionAppeal />}
          />
          <Route path="/partner/join" element={<PartnerJoinPage client={partnerClient} />} />
          <Route path="/partner/verify" element={<PartnerVerifyPage client={partnerClient} />} />
          <Route path="/partner/draft" element={<PartnerDraftPage client={partnerClient} />} />
          <Route path="/partner/status" element={<PartnerStatusPage client={partnerClient} />} />
          <Route
            path="/partner/claim"
            element={
              <RequireSession>
                <PartnerClaimPage client={partnerClient} />
              </RequireSession>
            }
          />
          <Route path="/partner/activate" element={<PartnerActivatePage />} />
          <Route
            path="/store-portal"
            element={<PortalHomePage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/hours"
            element={<PortalHoursPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/info"
            element={<PortalManagedFieldsPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/changes"
            element={<PortalControlledChangesPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/updates"
            element={<PortalUpdatesPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/links"
            element={<PortalLinksPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/support"
            element={<PortalSupportPage client={unavailablePortalClient} />}
          />
          <Route
            path="/store-portal/preview"
            element={<PortalPreviewPage client={unavailablePortalClient} />}
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
                <GoPage client={tripClient} />
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
