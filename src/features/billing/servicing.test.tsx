import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaidServicingPage, createServicingClient, type ServicingClient } from './servicing'
afterEach(cleanup)

const context = {
  storeId: '17800000-0000-4000-8000-000000000001',
  subscriptionVersion: 3,
  tierVersion: 2,
  tier: 'gallery' as const,
  salesOpen: true,
  state: 'active',
  paidThrough: '2026-10-01T00:00:00Z',
  configVersion: 178,
  configDigest: 'a'.repeat(64),
  galleryPriceCents: 500,
  fullGalleryPriceCents: 1200,
  currency: 'USD',
  terms: ['Renews monthly', 'Refund within 48 hours'],
  scheduledTier: 'free' as const,
  scheduledChangeId: '17800000-0000-4000-8000-000000000099',
  pending: false,
  charges: [],
}
function client(): ServicingClient {
  return {
    getContext: vi.fn(async () => context),
    change: vi.fn(async () => {}),
    refund: vi.fn(async () => {}),
  }
}
describe('authenticated membership servicing', () => {
  it('opening billing and dismissing cancellation leave the accepted future change untouched', async () => {
    const service = client()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PaidServicingPage client={service} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Photo membership' })
    expect(service.change).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel paid membership' }))
    expect(
      screen.getByText(/the paid subscription ends and your listing moves to Free/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Keep current arrangement' }))
    expect(service.change).not.toHaveBeenCalled()
    expect(screen.getByText(/Scheduled change: Free/)).toBeVisible()
  })
  it('allows confirmed cancellation in servicing-only and keeps fresh upgrade controls absent', async () => {
    const service = client()
    vi.mocked(service.getContext).mockResolvedValue({ ...context, salesOpen: false })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PaidServicingPage client={service} />
      </MemoryRouter>,
    )
    await screen.findByRole('heading', { name: 'Photo membership' })
    expect(
      screen.queryByRole('button', { name: 'Review Full Gallery upgrade' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel paid membership' }))
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(service.change).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionVersion: 3 }),
      'free',
      expect.any(String),
      expect.any(String),
    )
    expect(await screen.findByText(/Request recorded/)).toBeVisible()
  })
  it('requires unchecked fresh consent and displays the accepted future arrangement during upgrade', async () => {
    const service = client()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PaidServicingPage client={service} />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Review Full Gallery upgrade' }))
    expect(screen.getByText(/Your accepted change to Free/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm change' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirm change' }))
    expect(service.change).toHaveBeenCalledWith(
      context,
      'full_gallery',
      expect.any(String),
      expect.any(String),
    )
  })
  it('binds paid consent to the displayed future change and preserves keys through a response-loss retry', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'billing_record_paid_change_consent'
          ? { consentId: '17800000-0000-4000-8000-000000000040' }
          : { changeId: '17800000-0000-4000-8000-000000000041' },
      error: null,
    }))
    const service = createServicingClient(rpc)
    await service.change(context, 'full_gallery', 'consent-key', 'change-key')
    await service.change(context, 'full_gallery', 'consent-key', 'change-key')
    expect(rpc).toHaveBeenCalledWith(
      'billing_record_paid_change_consent',
      expect.objectContaining({
        p_expected_future_change_id: context.scheduledChangeId,
        p_idempotency_key: 'consent-key',
      }),
    )
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[2])
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[3])
  })
  it('renders no paid content and performs no mutation when staged off', async () => {
    const service = client()
    vi.mocked(service.getContext).mockResolvedValue(null)
    render(
      <MemoryRouter>
        <PaidServicingPage client={service} />
      </MemoryRouter>,
    )
    await vi.waitFor(() =>
      expect(screen.queryByText('Loading membership…')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(service.change).not.toHaveBeenCalled()
  })
})
