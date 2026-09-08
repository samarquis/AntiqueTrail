import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import type { RG01Client } from '../rg01'
import { projectRG01Status } from '../rg01'
import { ADMIN_ROUTE_PARENTS, adminRouteParent } from './routes'
import type { CommunityPreparationClient } from '../community'

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

export function AdminMorePage({
  rg01,
  communityClient,
}: { rg01?: RG01Client; communityClient?: CommunityPreparationClient } = {}) {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [evidenceAvailable, setEvidenceAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEvidenceAvailable(false)
    if (!rg01) return () => undefined
    rg01
      .status()
      .then((value) => {
        if (!cancelled) setEvidenceAvailable(Boolean(projectRG01Status(value)))
      })
      .catch(() => {
        if (!cancelled) setEvidenceAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [rg01])
  const [communitiesAvailable, setCommunitiesAvailable] = useState(false)

  useEffect(() => {
    if (!communityClient) return
    let mounted = true
    void communityClient
      .list()
      .then((projection) => {
        if (mounted) setCommunitiesAvailable(projection.status === 'available')
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [communityClient])

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
            <Link to="/admin/readiness">Readiness</Link> — available only from a server-authorized
            exact cohort.
          </li>
          <li>
            <strong>View Audit</strong> — narrow D30 audit is available only from its exact
            authorized record; full Audit History and export are not approved.
          </li>
          <li>
            {evidenceAvailable ? (
              <Link to="/admin/evidence/rg-01">Evidence</Link>
            ) : (
              <strong>Evidence</strong>
            )}{' '}
            {!evidenceAvailable &&
              '— unavailable until the server authorizes an exact evidence responsibility.'}
          </li>
          <li>
            {communitiesAvailable ? (
              <Link to="/admin/communities">Communities</Link>
            ) : (
              <>
                <strong>Communities</strong> — unavailable until the server authorizes the
                applicable operational scope.
              </>
            )}
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
