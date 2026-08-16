import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { GENERIC_ALPHA_BLOCKED } from './boundary'
import type { AlphaAccount } from './types'

export function AlphaGuard({
  account,
  children,
}: {
  account?: AlphaAccount | null
  children: ReactNode
}) {
  if (!account) return <Navigate to="/stores" replace />
  return <>{children}</>
}

export function AlphaReadinessPage() {
  return (
    <main>
      <Link to="/stores">
        <span aria-hidden="true">←</span> Back
      </Link>
      <h1>Synthetic Internal Alpha</h1>
      <p>
        Private readiness evidence is collected only from fictional stores and approved test
        accounts.
      </p>
      <p role="status">{GENERIC_ALPHA_BLOCKED}</p>
    </main>
  )
}
