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
} from '../features/auth'

const catalogClient = configuredCatalogClient() ?? demoCatalogClient

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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </AuthProvider>
  )
}
