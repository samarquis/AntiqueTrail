import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syntheticPaidOffer as offer } from '../../review-harness/paidOffer'
import { createSalesClient, PaidPurchasePage, PublicPaidPlans, type SalesClient } from './sales'

afterEach(cleanup)
const context = { storeId: '18000000-0000-4000-8000-000000000001', storeVersion: 0, offer }
function client(): SalesClient {
  return {
    getOffer: vi.fn(async () => offer),
    getPurchase: vi.fn(async () => context),
    checkout: vi.fn(async () => {
      throw new Error('stage changed')
    }),
  }
}
describe('composite-controlled paid surfaces', () => {
  it('shows exact approved facts only while open, and removes them on refresh failure', async () => {
    const service = client()
    render(
      <MemoryRouter>
        <PublicPaidPlans client={service} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Optional photo memberships' })).toBeVisible()
    expect(screen.getByText(/Gallery: cover plus 15.*\$12.00/)).toBeVisible()
    expect(screen.getByText(/Full Gallery: cover plus no plan-count cap.*\$19.00/)).toBeVisible()
    expect(screen.getByText(offer.refundWindowRule)).toBeVisible()
    vi.mocked(service.getOffer).mockRejectedValueOnce(new Error('unavailable'))
    fireEvent.focus(window)
    await waitFor(() => expect(screen.queryByRole('heading')).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'Review photo plans' })).not.toBeInTheDocument()
  })
  it.each([null, 'error'])(
    'does not expose price or paid copy when response is %s',
    async (mode) => {
      const service = client()
      vi.mocked(service.getOffer).mockImplementation(async () => {
        if (mode === 'error') throw new Error('offline')
        return null
      })
      const { container } = render(
        <MemoryRouter>
          <PublicPaidPlans client={service} />
        </MemoryRouter>,
      )
      await waitFor(() => expect(service.getOffer).toHaveBeenCalled())
      expect(container).toBeEmptyDOMElement()
    },
  )
  it('requires fresh consent when target changes and preserves existing servicing on denial', async () => {
    const service = client()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PaidPurchasePage client={service} servicing={<p>Existing membership cancellation</p>} />
      </MemoryRouter>,
    )
    const button = await screen.findByRole('button', { name: 'Continue to secure Checkout' })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.selectOptions(screen.getByRole('combobox'), 'full_gallery')
    expect(button).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    vi.mocked(service.getPurchase).mockResolvedValueOnce(null)
    await user.click(button)
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.getByText('Existing membership cancellation')).toBeVisible()
    expect(service.checkout).toHaveBeenCalledWith(
      context,
      'full_gallery',
      expect.any(String),
      expect.any(String),
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
  it('binds consent to the exact offer and rejects a non-Stripe redirect', async () => {
    const rpc = vi.fn(async () => ({
      data: { consentId: '18000000-0000-4000-8000-000000000002' },
      error: null,
    }))
    const edge = vi.fn(async () => ({
      data: { url: 'https://attacker.example/checkout' },
      error: null,
    }))
    const service = createSalesClient(rpc, edge)
    await expect(
      service.checkout(context, 'gallery', 'consent-key', 'checkout-key'),
    ).rejects.toThrow()
    expect(rpc).toHaveBeenCalledWith(
      'billing_record_paid_tier_consent',
      expect.objectContaining({
        p_commercial_config_version: offer.version,
        p_disclosure_digest: offer.digest,
        p_expected_store_version: 0,
      }),
    )
    expect(edge).toHaveBeenCalledWith(
      'store-billing-checkout',
      expect.objectContaining({
        tier: 'gallery',
        consentId: '18000000-0000-4000-8000-000000000002',
      }),
    )
  })
  it('rejects inactive or malformed offers and never starts Checkout after consent denial', async () => {
    const rpc = vi.fn(async () => ({ data: { ...offer, state: 'approved_inactive' }, error: null }))
    const edge = vi.fn(async () => ({ data: null, error: null }))
    const service = createSalesClient(rpc, edge)
    await expect(service.getOffer()).rejects.toThrow()
    await expect(service.checkout(context, 'gallery', 'key', 'key')).rejects.toThrow()
    expect(edge).not.toHaveBeenCalled()
  })
})
