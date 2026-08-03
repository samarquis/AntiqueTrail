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
  SavedPage,
  unavailableShopperClient,
} from '../features/shopper'
import {
  CandidateSessionGuard,
  CapturePage,
  ShareDetailsPage,
  SharesPage,
  TripIdeasPage,
} from '../features/candidates'
import {
  GoPage,
  GuardedTrips,
  NewTripPage,
  PlanPage,
  SummaryPage,
  TripsPage,
  unavailableTripClient,
} from '../features/trips'
import { AccessSafetyPage, AdminGuard, ReviewQueuePage } from '../features/admin'

const catalogClient = configuredCatalogClient() ?? demoCatalogClient
// The current provider-neutral shell has no privileged session source. Keep the
// boundary explicitly unavailable until authenticated Admin wiring is approved.
const unavailableAdminSession = null

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

export default function App() {
  return (
    <AuthProvider provider={unavailableAuthProvider}>
      <AppShell>
        <Routes>
          <Route path="/stores" element={<StoreBrowser />} />
          <Route path="/stores/:slug" element={<StoreDetails />} />
          <Route
            path="/stores/:slug/memory"
            element={
              <RequireSession>
                <MemoryPage client={unavailableShopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/stores/:slug/correction"
            element={<CorrectionPage client={unavailableShopperClient} />}
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
                <SavedPage client={unavailableShopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/account/history"
            element={
              <RequireSession>
                <HistoryPage client={unavailableShopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/corrections/:correctionId"
            element={
              <RequireSession>
                <CorrectionStatusPage client={unavailableShopperClient} />
              </RequireSession>
            }
          />
          <Route
            path="/capture"
            element={
              <RequireSession>
                <CandidateSessionGuard>
                  <CapturePage />
                </CandidateSessionGuard>
              </RequireSession>
            }
          />
          <Route
            path="/shares"
            element={
              <RequireSession>
                <SharesPage />
              </RequireSession>
            }
          />
          <Route
            path="/shares/:shareId"
            element={
              <RequireSession>
                <ShareDetailsPage />
              </RequireSession>
            }
          />
          <Route
            path="/trip-ideas"
            element={
              <RequireSession>
                <TripIdeasPage />
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
            path="/trips"
            element={
              <GuardedTrips>
                <TripsPage client={unavailableTripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/new"
            element={
              <GuardedTrips>
                <NewTripPage client={unavailableTripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/plan"
            element={
              <GuardedTrips>
                <PlanPage client={unavailableTripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/go"
            element={
              <GuardedTrips>
                <GoPage client={unavailableTripClient} />
              </GuardedTrips>
            }
          />
          <Route
            path="/trips/:tripId/summary"
            element={
              <GuardedTrips>
                <SummaryPage client={unavailableTripClient} />
              </GuardedTrips>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </AuthProvider>
  )
}
