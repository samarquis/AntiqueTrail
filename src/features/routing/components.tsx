import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ROUTING_BLOCKED_MESSAGE } from './boundary'
import type { RoutingCapability } from './types'

export function RoutingGuard({
  capability,
  children,
}: {
  capability: RoutingCapability
  children: ReactNode
}) {
  if (capability === 'blocked')
    return (
      <main>
        <Link to="/stores">
          <span aria-hidden="true">←</span> Back to stores
        </Link>
        <h1>Check My Day</h1>
        <p role="status">{ROUTING_BLOCKED_MESSAGE}</p>
        <p>Review your trip in the manual planner while routing is unavailable.</p>
      </main>
    )
  return <>{children}</>
}

export function MapFallback({ capability }: { capability: RoutingCapability }) {
  if (capability === 'available') return null
  return <p role="status">{ROUTING_BLOCKED_MESSAGE}</p>
}

export function CheckMyDayChoice({
  onUseSuggested,
  onKeepOrder,
}: {
  onUseSuggested: () => void
  onKeepOrder: () => void
}) {
  return (
    <section aria-labelledby="check-day-choice">
      <h2 id="check-day-choice">Review your day</h2>
      <p>
        Suggestions are based on your selected limits and available hours; they are not a claim of
        real-world optimality.
      </p>
      <button type="button" onClick={onUseSuggested}>
        Use Suggested Order
      </button>
      <button type="button" onClick={onKeepOrder}>
        Keep My Order
      </button>
    </section>
  )
}

export function RedirectFromProviderBlocked() {
  return <Navigate to="/trips" replace />
}
