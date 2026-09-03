import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { ADMIN_ROUTE_PARENTS, adminRouteParent } from './routes'

export function AdminPrimaryNavigation() {
  const { pathname } = useLocation()
  const activeParent = adminRouteParent(pathname)

  return (
    <>
      {ADMIN_ROUTE_PARENTS.map((parent) => (
        <Link
          key={parent.id}
          to={parent.destination}
          aria-current={activeParent?.id === parent.id ? 'page' : undefined}
        >
          {parent.label}
        </Link>
      ))}
    </>
  )
}

export function AdminMorePage() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function submitSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <main>
      <p className="eyebrow">Administrator operations</p>
      <h1>More</h1>
      <p>Operational destinations that are not routine review or representative access changes.</p>
      <nav aria-label="Administrator more destinations">
        <ul>
          <li>
            <Link to="/help">Support</Link>
          </li>
          <li>
            <strong>Readiness</strong> — available only from a server-authorized exact run.
          </li>
          <li>
            <strong>View Audit</strong> — narrow D30 audit is available only from its exact
            authorized record; full Audit History and export are not approved.
          </li>
          <li>
            <strong>Evidence</strong> — unavailable until the server authorizes an exact frozen
            evidence link.
          </li>
          <li>
            <strong>Communities</strong> — unavailable until the server authorizes the applicable
            operational scope.
          </li>
          <li>
            <Link to="/status">System status</Link>
          </li>
        </ul>
      </nav>
      <button type="button" disabled={signingOut} onClick={() => void submitSignOut()}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </main>
  )
}
