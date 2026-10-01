import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerStoresPage } from './OwnerStoresPage'
import type { OwnerClient } from './ownerClient'

const storeId = '00000000-0000-4000-8000-000000001001'
const stores = [{ storeId, name: 'Clockwork Cabinet', role: 'store_owner' as const }]
function client(overrides: Partial<OwnerClient> = {}): OwnerClient {
  return {
    listStores: vi.fn().mockResolvedValue(stores),
    selectStore: vi.fn().mockResolvedValue(undefined),
    listTeam: vi.fn().mockResolvedValue({ members: [], invitations: [] }),
    inviteTeam: vi.fn().mockResolvedValue(undefined),
    cancelTeamInvitation: vi.fn().mockResolvedValue(undefined),
    revokeTeamMember: vi.fn().mockResolvedValue(undefined),
    listPendingInvitations: vi.fn().mockResolvedValue([]),
    acceptInvitation: vi.fn().mockResolvedValue(storeId),
    ...overrides,
  }
}
function show(client: OwnerClient) {
  render(
    <MemoryRouter initialEntries={['/owner/stores']}>
      <Routes>
        <Route path="/owner/stores" element={<OwnerStoresPage client={client} />} />
        <Route path="/store-portal" element={<h1>Selected store portal</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}
describe('Store Owner workspace entry', () => {
  afterEach(cleanup)
  it('lists approved stores and enters the portal only after server selection', async () => {
    const ownerClient = client()
    show(ownerClient)
    const button = await screen.findByRole('button', { name: 'Open Clockwork Cabinet' })
    await userEvent.click(button)
    expect(ownerClient.selectStore).toHaveBeenCalledWith(stores[0].storeId)
    expect(
      await screen.findByRole('heading', { name: 'Selected store portal' }),
    ).toBeInTheDocument()
  })
  it('shows reason-neutral denial and recovers with a fresh authorized list', async () => {
    show(
      client({
        listStores: vi
          .fn()
          .mockRejectedValueOnce(new Error('revoked'))
          .mockResolvedValueOnce(stores),
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store workspace access is unavailable.',
    )
    expect(screen.queryByText('revoked')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check access again' }))
    expect(
      await screen.findByRole('button', { name: 'Open Clockwork Cabinet' }),
    ).toBeInTheDocument()
  })
  it('removes stale choices when selection is revoked', async () => {
    show({
      ...client(),
      selectStore: vi.fn().mockRejectedValue(new Error('revoked')),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Open Clockwork Cabinet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store workspace access is unavailable.',
    )
    expect(screen.queryByRole('button', { name: 'Open Clockwork Cabinet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Selected store portal' })).not.toBeInTheDocument()
  })

  it('adds an invitation without exposing an account lookup result', async () => {
    const ownerClient = client()
    show(ownerClient)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Manage team access for Clockwork Cabinet' }),
    )
    await userEvent.type(screen.getByLabelText('Verified teammate email'), 'editor@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Invite teammate' }))
    expect(ownerClient.inviteTeam).toHaveBeenCalledWith(
      storeId,
      'editor@example.test',
      'co_owner',
      expect.any(String),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'If that verified account exists, an invitation is ready to accept.',
    )
  })

  it('does not expose team management to Listing Editors', async () => {
    show(
      client({
        listStores: vi.fn().mockResolvedValue([{ ...stores[0], role: 'listing_editor' }]),
      }),
    )
    expect(await screen.findByText('Listing Editor')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Manage team access for Clockwork Cabinet' }),
    ).not.toBeInTheDocument()
  })

  it('limits Full Store Access invitations to Listing Editors', async () => {
    show(
      client({
        listStores: vi.fn().mockResolvedValue([{ ...stores[0], role: 'full_store_access' }]),
      }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Manage team access for Clockwork Cabinet' }),
    )
    expect(screen.getByRole('combobox', { name: 'Store role' })).toHaveValue('listing_editor')
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})
