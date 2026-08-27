// Red-first: the Package 13 gate renders nothing unless the served capability
// is on. Failed before src/features/billing/components.tsx existed.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BillingGate, BillingUnavailableNotice } from './components'
import { DISABLED_BILLING_CAPABILITY } from './billingClient'
import type { BillingCapability } from './types'

afterEach(cleanup)

function capability(overrides: Partial<BillingCapability> = {}): BillingCapability {
  return { enabled: true, source: 'server', ...overrides }
}

describe('BillingGate', () => {
  it('renders children only when the server-served capability is enabled', () => {
    const { getByTestId } = render(
      <BillingGate capability={capability()}>
        <span data-testid="billing-surface">Billing</span>
      </BillingGate>,
    )
    expect(getByTestId('billing-surface').textContent).toBe('Billing')
  })

  it('renders nothing while staged off, untrusted, or unknown', () => {
    for (const off of [
      DISABLED_BILLING_CAPABILITY,
      capability({ enabled: false }),
      capability({ source: 'local' }),
      null,
    ]) {
      const { container } = render(
        <BillingGate capability={off}>
          <span data-testid="billing-surface">Billing</span>
        </BillingGate>,
      )
      expect(container.querySelector('[data-testid="billing-surface"]')).toBeNull()
      expect(container.textContent).toBe('')
    }
  })

  it('announces the staged-off state without exposing any billing action', () => {
    const { getByTestId } = render(<BillingUnavailableNotice />)
    expect(getByTestId('billing-stage-disabled').textContent).toMatch(/not available/)
  })
})
