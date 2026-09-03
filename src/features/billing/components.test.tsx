// Red-first: the Package 13 gate renders nothing unless the served capability
// is on. Failed before src/features/billing/components.tsx existed.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BillingGate, BillingUnavailableNotice, CommercialResearchPage } from './components'
import { DISABLED_BILLING_CAPABILITY } from './billingClient'
import type { BillingCapability, BillingClient, CommercialResearchConfig } from './types'

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

const researchConfig: CommercialResearchConfig = {
  version: 7,
  state: 'approved_inactive',
  digest: 'a'.repeat(64),
  galleryPriceCents: 1200,
  fullGalleryPriceCents: 1900,
  currency: 'USD',
  taxMode: 'Tax is calculated at checkout.',
  firstChargeRule: 'The first charge follows Checkout confirmation.',
  renewalRule: 'The plan renews monthly until canceled.',
  refundPolicyVersion: 'refund-v1',
  supportPolicyVersion: 'support-v1',
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
  fullGalleryLimitsVersion: 'limits-v1',
  fullGalleryLimits: {
    acceptedFileTypes: ['image/jpeg', 'image/png'],
    maxFileBytes: 10_000_000,
    maxWidthPixels: 6000,
    maxHeightPixels: 6000,
    uploadRateRule: 'Up to 20 uploads per hour.',
    quotaOutageRule: 'Uploads pause during provider outages.',
    moderationAbuseRule: 'Every photo remains subject to moderation and abuse controls.',
    reasonRecoveryAppealRule: 'A reason, recovery step, and appeal path are provided.',
    paidServiceRemedy: 'Service failures receive the published remedy.',
  },
}

function researchClient(): BillingClient {
  return {
    getCapability: vi.fn(),
    startCheckout: vi.fn(),
    openPortal: vi.fn(),
    getCommercialResearchConfig: vi.fn(async () => researchConfig),
    recordCommercialResearchAttempt: vi.fn(async () => ({
      attemptId: 'attempt-1',
      configVersion: researchConfig.version,
      configDigest: researchConfig.digest,
    })),
  }
}

describe('CommercialResearchPage', () => {
  it('is noindex and shows the complete exact inactive offer without a purchase action', async () => {
    render(
      <CommercialResearchPage
        authorizationId="authorization-1"
        artifactDigest={'b'.repeat(64)}
        questionVersion="questions-v1"
        client={researchClient()}
      />,
    )
    await screen.findByRole('heading', { name: 'Compare optional photo capacity' })
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
    expect(screen.getByText(/Cover plus 15 gallery photos/)).toHaveTextContent('$12.00')
    expect(screen.getByText(/no plan-count cap/)).toHaveTextContent('$19.00')
    expect(screen.getByText(/reason, recovery step, and appeal path/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /checkout|buy|upgrade/i })).not.toBeInTheDocument()
  })

  it('binds a minimized response to the displayed config without a provider call', async () => {
    const client = researchClient()
    const user = userEvent.setup()
    render(
      <CommercialResearchPage
        authorizationId="authorization-1"
        artifactDigest={'b'.repeat(64)}
        questionVersion="questions-v1"
        client={client}
      />,
    )
    await screen.findByRole('heading', { name: 'Compare optional photo capacity' })
    await user.selectOptions(screen.getByLabelText('Which would you choose?'), 'gallery')
    await user.selectOptions(screen.getByLabelText('Primary reason'), 'photo_capacity')
    await user.click(screen.getByLabelText('Record this minimized research response'))
    await user.click(screen.getByRole('button', { name: 'Record response' }))
    await screen.findByText('Your research response was recorded. No purchase was made.')
    await waitFor(() => expect(client.recordCommercialResearchAttempt).toHaveBeenCalledTimes(1))
    expect(client.startCheckout).not.toHaveBeenCalled()
    expect(client.openPortal).not.toHaveBeenCalled()
    expect(client.recordCommercialResearchAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        authorizationId: 'authorization-1',
        configVersion: 7,
        configDigest: 'a'.repeat(64),
        artifactDigest: 'b'.repeat(64),
        questionVersion: 'questions-v1',
        choice: 'gallery',
        reasonCode: 'photo_capacity',
      }),
    )
  })
})
