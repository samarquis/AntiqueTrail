import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

export type AdminRouteParentId = 'review' | 'access' | 'more'

export interface AdminRouteParent {
  id: AdminRouteParentId
  label: 'Review' | 'Access' | 'More'
  destination: string
  matches(pathname: string): boolean
}

const startsWithRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`)

/** Every mounted Administrator route belongs to exactly one of these parents. */
export const ADMIN_ROUTE_PARENTS: readonly AdminRouteParent[] = [
  {
    id: 'review',
    label: 'Review',
    destination: '/admin',
    matches: (pathname) =>
      pathname === '/admin' ||
      startsWithRoute(pathname, '/admin/partners') ||
      startsWithRoute(pathname, '/admin/reviews'),
  },
  {
    id: 'access',
    label: 'Access',
    destination: '/admin/access',
    matches: (pathname) => startsWithRoute(pathname, '/admin/access'),
  },
  {
    id: 'more',
    label: 'More',
    destination: '/admin/more',
    matches: (pathname) =>
      startsWithRoute(pathname, '/admin/more') ||
      startsWithRoute(pathname, '/admin/readiness') ||
      startsWithRoute(pathname, '/admin/beta'),
  },
]

export function adminRouteParent(pathname: string): AdminRouteParent | null {
  const matches = ADMIN_ROUTE_PARENTS.filter((parent) => parent.matches(pathname))
  return matches.length === 1 ? matches[0] : null
}

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
