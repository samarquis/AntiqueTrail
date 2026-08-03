import type { ReactNode } from 'react'
import { Link, Route, Routes } from 'react-router-dom'

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/stores" aria-label="Antique Trail home">
          <span className="brand-mark" aria-hidden="true">AT</span>
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

function StoreBrowserPlaceholder() {
  return (
    <section className="page-card" aria-labelledby="browser-heading">
      <p className="eyebrow">Explore nearby</p>
      <h1 id="browser-heading">Find your next treasure</h1>
      <p className="lede">Store browsing is coming online. Check back soon for the Synthetic Store catalog.</p>
    </section>
  )
}

function StoreDetailsPlaceholder() {
  return (
    <section className="page-card" aria-labelledby="details-heading">
      <p className="eyebrow">Store details</p>
      <h1 id="details-heading">This store is not available yet</h1>
      <p className="lede">The requested store could not be found in the current catalog.</p>
      <Link className="button" to="/stores">Return to stores</Link>
    </section>
  )
}

function NotFound() {
  return (
    <section className="page-card" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <Link className="button" to="/stores">Browse stores</Link>
    </section>
  )
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/stores" element={<StoreBrowserPlaceholder />} />
        <Route path="/stores/:slug" element={<StoreDetailsPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}
