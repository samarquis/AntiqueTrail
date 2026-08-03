import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import type { AdminSession } from './types'
import { canUseAdminBoundary, GENERIC_ADMIN_FAILURE } from './boundary'

export function AdminGuard({ session, children }: { session: AdminSession | null; children: ReactNode }) {
  if (!canUseAdminBoundary(session)) return <Navigate to="/stores" replace />
  return <>{children}</>
}

export function ReviewQueuePage() { return <main><Link to="/stores">← Back</Link><h1>Review queue</h1><p>No assigned review cases.</p></main> }
export function AccessSafetyPage() { return <main><Link to="/admin">← Back</Link><h1>Access &amp; Safety</h1><p>Review exact store scopes and recent security events.</p></main> }
export function AdminUnavailable() { return <p role="alert">{GENERIC_ADMIN_FAILURE}</p> }

