import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOwnerBillingStatusClient, OwnerBillingStatusPage } from './ownerStatus'

const freeStatus = {
  tier: 'free',
  subscriptionState: 'none',
  paidThrough: null,
  salesOpen: false,
  availableActions: [],
} as const

afterEach(() => cleanup())

describe('owner billing status', () => {
  it('shows the actual Free state and no executable billing actions', async () => {
    render(
      <MemoryRouter>
        <OwnerBillingStatusPage client={{ getStatus: async () => freeStatus }} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Billing status' })).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('No paid subscription')).toBeInTheDocument()
    expect(screen.getByText('Paid plan sales are closed.')).toBeInTheDocument()
    expect(
      screen.getByText('No billing actions are available in this workspace.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /upgrade|change|cancel|refund|payment/i }),
    ).toBeNull()
    expect(screen.queryByText(/\$|USD|Stripe/i)).toBeNull()
  })

  it('shows an existing paid state when sales are closed without exposing actions', async () => {
    render(
      <MemoryRouter>
        <OwnerBillingStatusPage
          client={{
            getStatus: async () => ({
              ...freeStatus,
              tier: 'gallery',
              subscriptionState: 'past_due',
              paidThrough: '2026-10-31T00:00:00.000Z',
            }),
          }}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Gallery')).toBeInTheDocument()
    expect(screen.getByText('Past due')).toBeInTheDocument()
    expect(screen.getByText('Paid plan sales are closed.')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /upgrade|change|cancel|refund|payment/i }),
    ).toBeNull()
  })

  it('calls only the read-only status RPC and rejects any action-bearing response', async () => {
    const rpc = vi.fn(
      async (
        name: string,
        args: Record<string, unknown>,
      ): Promise<{ data: unknown; error: unknown }> => {
        expect(name).toBe('billing_get_owner_status')
        expect(args).toEqual({})
        return { data: freeStatus, error: null }
      },
    )
    const client = createOwnerBillingStatusClient(rpc)

    await expect(client.getStatus()).resolves.toEqual(freeStatus)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('billing_get_owner_status', {})

    rpc.mockResolvedValueOnce({
      data: { ...freeStatus, availableActions: ['upgrade'] },
      error: null,
    })
    await expect(client.getStatus()).rejects.toThrow()
  })

  it('offers a retry after the status read fails', async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(freeStatus)
    render(
      <MemoryRouter>
        <OwnerBillingStatusPage client={{ getStatus }} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Try again' }).click()
    await waitFor(() => expect(screen.getByText('No paid subscription')).toBeInTheDocument())
  })
})
