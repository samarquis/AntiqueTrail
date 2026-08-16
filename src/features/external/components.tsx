import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { GENERIC_READINESS_BLOCKED } from './boundary'
import type { SyntheticTestAccount } from './types'

export function ExternalReadinessGuard({
  accounts,
  children,
}: {
  accounts: SyntheticTestAccount[]
  children: ReactNode
}) {
  if (accounts.length < 2) return <Navigate to="/stores" replace />
  return <>{children}</>
}

export function ExternalReadinessPage() {
  return (
    <main>
      <Link to="/stores"><span aria-hidden="true">←</span> Back</Link>
      <h1>External Testing Readiness</h1>
      <p>Readiness remains private until every human and provider gate is approved.</p>
      <p role="status">{GENERIC_READINESS_BLOCKED}</p>
    </main>
  )
}
