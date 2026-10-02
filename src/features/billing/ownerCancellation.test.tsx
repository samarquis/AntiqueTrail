import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { createOwnerCancellationClient, OwnerCancellation } from './ownerCancellation'

afterEach(cleanup)

it('records fresh confirmation before intent and preserves pending reconciliation', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        consentId: '42600000-0000-4000-8000-000000000001',
        expiresAt: '2026-10-31T00:00:00Z',
      },
      error: null,
    })
    .mockResolvedValueOnce({ data: { state: 'reconciliation_pending' }, error: null })
  const client = createOwnerCancellationClient(rpc)
  await expect(
    client.cancel(
      'a'.repeat(64),
      '42600000-0000-4000-8000-000000000002',
      '42600000-0000-4000-8000-000000000003',
    ),
  ).resolves.toEqual({ state: 'reconciliation_pending' })
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    'billing_record_owner_cancel_consent',
    'billing_request_owner_cancellation',
  ])
})

it('shows no action when the server has not admitted a cancellation context', async () => {
  render(
    <MemoryRouter>
      <OwnerCancellation client={{ getContext: async () => null, cancel: vi.fn() }} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByText('Checking cancellation availability…')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Cancel renewal' })).toBeNull()
})

it('requires explicit exact-store confirmation and shows pending instead of success', async () => {
  const user = userEvent.setup()
  const cancel = vi.fn().mockResolvedValue({ state: 'pending' })
  render(
    <OwnerCancellation
      client={{
        getContext: async () => ({
          storeName: 'Blue Finch Curios',
          paidThrough: '2026-10-31T00:00:00Z',
          snapshot: 'a'.repeat(64),
          state: 'available',
        }),
        cancel,
      }}
    />,
  )
  await user.click(await screen.findByRole('button', { name: 'Cancel renewal' }))
  expect(
    screen.getByRole('heading', { name: 'Confirm cancellation for Blue Finch Curios' }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Confirmation is pending.')
  expect(screen.queryByText(/cancellation is confirmed/)).toBeNull()
  expect(cancel).toHaveBeenCalledTimes(1)
})

it('denied or stale confirmation requires a refresh before another request', async () => {
  const user = userEvent.setup()
  const cancel = vi.fn().mockRejectedValue(new Error('revoked'))
  render(
    <OwnerCancellation
      client={{
        getContext: async () => ({
          storeName: 'Blue Finch Curios',
          paidThrough: '2026-10-31T00:00:00Z',
          snapshot: 'a'.repeat(64),
          state: 'available',
        }),
        cancel,
      }}
    />,
  )
  await user.click(await screen.findByRole('button', { name: 'Cancel renewal' }))
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Refresh billing before confirming again.',
  )
  expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
  expect(screen.queryByText(/cancellation is confirmed/)).toBeNull()
})

it.each(['pending', 'reconciliation_pending', 'scheduled', 'completed', 'failed'] as const)(
  'renders the %s outcome without offering another cancellation',
  async (state) => {
    render(
      <OwnerCancellation
        client={{
          getContext: async () => ({
            storeName: 'Blue Finch Curios',
            paidThrough: '2026-10-31T00:00:00Z',
            snapshot: 'a'.repeat(64),
            state,
          }),
          cancel: vi.fn(),
        }}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).not.toHaveTextContent('Checking cancellation'),
    )
    expect(screen.queryByRole('button', { name: 'Cancel renewal' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh billing' })).toBeVisible()
  },
)
