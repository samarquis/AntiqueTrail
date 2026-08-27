import type { ReactNode } from 'react'
import { BILLING_STAGE_DISABLED_MESSAGE, isBillingCapabilityEnabled } from './billingClient'
import type { BillingCapability } from './types'

/**
 * Renders nothing at all unless the server-served capability says ON —
 * Package 13 keeps every billing surface hidden and unreachable by default.
 */
export function BillingGate({
  capability,
  children,
}: {
  capability: BillingCapability | null
  children: ReactNode
}) {
  if (!isBillingCapabilityEnabled(capability)) return null
  return <>{children}</>
}

export function BillingUnavailableNotice() {
  return (
    <p role="status" data-testid="billing-stage-disabled">
      {BILLING_STAGE_DISABLED_MESSAGE}
    </p>
  )
}
