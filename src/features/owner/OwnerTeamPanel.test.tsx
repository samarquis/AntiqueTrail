import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerTeamPanel } from './OwnerTeamPanel'
import type { OwnerClient } from './ownerClient'

const store = { storeId: 'store-1', name: 'Blue Finch Curios', role: 'store_owner' as const }

function client(overrides: Partial<OwnerClient> = {}): OwnerClient {
  return {
    listStores: vi.fn().mockResolvedValue([store]),
    selectStore: vi.fn().mockResolvedValue(undefined),
    listTeam: vi.fn().mockResolvedValue({
      members: [
        {
          accessId: 'grant-editor',
          role: 'listing_editor',
          displayName: 'Jordan Editor',
          version: 4,
          canRevoke: true,
        },
      ],
      invitations: [],
    }),
    inviteTeam: vi.fn().mockResolvedValue(undefined),
    cancelTeamInvitation: vi.fn().mockResolvedValue(undefined),
    revokeTeamMember: vi.fn().mockResolvedValue(undefined),
    listPendingInvitations: vi.fn().mockResolvedValue([]),
    acceptInvitation: vi.fn().mockResolvedValue('store-1'),
    ...overrides,
  }
}

describe('OwnerTeamPanel', () => {
  afterEach(cleanup)

  it.each([
    { role: 'store_owner', expected: ['Co-Owner', 'Full Store Access', 'Listing Editor'] },
    { role: 'co_owner', expected: ['Co-Owner'] },
    { role: 'full_store_access', expected: ['Listing Editor'] },
  ] as const)('limits $role invitations to its approved roles', async ({ role, expected }) => {
    const user = userEvent.setup()
    render(<OwnerTeamPanel store={{ ...store, role }} client={client()} />)
    await user.click(
      screen.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }),
    )
    const options = Array.from(
      (screen.getByLabelText('Store role') as HTMLSelectElement).options,
    ).map((option) => option.textContent)
    expect(options).toEqual(expected)
  })

  it('requires explicit confirmation before revoking active access', async () => {
    const user = userEvent.setup()
    const owner = client()
    render(<OwnerTeamPanel store={store} client={owner} />)

    await user.click(
      screen.getByRole('button', { name: 'Manage team access for Blue Finch Curios' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove Jordan Editor' }))
    expect(owner.revokeTeamMember).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Confirm team access removal' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep access' }))
    expect(owner.revokeTeamMember).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove Jordan Editor' }))
    await user.click(screen.getByRole('button', { name: 'Confirm remove Jordan Editor' }))

    expect(owner.revokeTeamMember).toHaveBeenCalledWith(
      'store-1',
      'grant-editor',
      4,
      expect.any(String),
    )
  })
})
