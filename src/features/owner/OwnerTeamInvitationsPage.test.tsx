import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { OwnerTeamInvitationsPage } from './OwnerTeamInvitationsPage'
import type { OwnerClient } from './ownerClient'

const storeId = '00000000-0000-4000-8000-000000001001'
const invitationId = '00000000-0000-4000-8000-000000001002'

describe('team invitation acceptance', () => {
  afterEach(cleanup)

  it('accepts server-scoped invitation, selects its store, then enters the portal', async () => {
    const client: OwnerClient = {
      listStores: vi.fn().mockResolvedValue([]),
      selectStore: vi.fn().mockResolvedValue(undefined),
      listTeam: vi.fn().mockResolvedValue({ members: [], invitations: [] }),
      inviteTeam: vi.fn(),
      cancelTeamInvitation: vi.fn(),
      revokeTeamMember: vi.fn(),
      listPendingInvitations: vi.fn().mockResolvedValue([
        {
          invitationId,
          storeId,
          storeName: 'Clockwork Cabinet',
          inviterName: 'Sam',
          role: 'listing_editor',
          version: 2,
        },
      ]),
      acceptInvitation: vi.fn().mockResolvedValue(storeId),
    }
    render(
      <MemoryRouter initialEntries={['/owner/invitations']}>
        <Routes>
          <Route path="/owner/invitations" element={<OwnerTeamInvitationsPage client={client} />} />
          <Route path="/store-portal" element={<h1>Selected store portal</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(
      await screen.findByRole('button', { name: 'Accept invitation to Clockwork Cabinet' }),
    )
    expect(client.acceptInvitation).toHaveBeenCalledWith(invitationId, 2, expect.any(String))
    expect(client.selectStore).toHaveBeenCalledWith(storeId)
    expect(
      await screen.findByRole('heading', { name: 'Selected store portal' }),
    ).toBeInTheDocument()
  })
})
