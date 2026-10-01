import { describe, expect, it, vi } from 'vitest'
import { createOwnerClient } from './ownerClient'

describe('approved Store Owner workspace contract', () => {
  it('lists only the server-returned exact stores and selects one through the server', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        role: 'Store Owner',
        stores: [{ storeId: '00000000-0000-4000-8000-000000001001', name: 'Clockwork Cabinet' }],
      })
      .mockResolvedValueOnce({ storeId: '00000000-0000-4000-8000-000000001001' })
    const client = createOwnerClient(rpc)
    expect(await client.listStores()).toEqual([
      {
        storeId: '00000000-0000-4000-8000-000000001001',
        name: 'Clockwork Cabinet',
        role: 'store_owner',
      },
    ])
    await client.selectStore('00000000-0000-4000-8000-000000001001')
    expect(rpc).toHaveBeenLastCalledWith('owner_select_store', {
      p_store_id: '00000000-0000-4000-8000-000000001001',
    })
  })

  it.each([
    null,
    { role: 'Administrator', stores: [] },
    { role: 'Store Owner', stores: [] },
    { role: 'Store Owner', stores: [{ storeId: 'forged', name: 'Other store' }] },
  ])('denies malformed or empty authority: %j', async (result) => {
    const client = createOwnerClient(vi.fn().mockResolvedValue(result))
    await expect(client.listStores()).rejects.toThrow('Store workspace access is unavailable.')
  })

  it('does not enter a different store when the selection response disagrees', async () => {
    const client = createOwnerClient(
      vi.fn().mockResolvedValue({ storeId: '00000000-0000-4000-8000-000000001002' }),
    )
    await expect(client.selectStore('00000000-0000-4000-8000-000000001001')).rejects.toThrow(
      'Store workspace access is unavailable.',
    )
  })

  it('loads and mutates team access through exact-store RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ members: [], invitations: [] })
      .mockResolvedValueOnce({ invitationId: '00000000-0000-4000-8000-000000001002' })
      .mockResolvedValueOnce({ state: 'revoked' })
    const client = createOwnerClient(rpc) as ReturnType<typeof createOwnerClient> & {
      listTeam(storeId: string): Promise<unknown>
      inviteTeam(
        storeId: string,
        email: string,
        role: string,
        idempotencyKey: string,
      ): Promise<unknown>
      revokeTeamMember(
        storeId: string,
        accessId: string,
        expectedVersion: number,
        idempotencyKey: string,
      ): Promise<unknown>
    }
    const storeId = '00000000-0000-4000-8000-000000001001'
    const accessId = '00000000-0000-4000-8000-000000001003'
    const key = 'owner-team-test-1'
    await client.listTeam(storeId)
    await client.inviteTeam(storeId, ' editor@example.test ', 'listing_editor', key)
    await client.revokeTeamMember(storeId, accessId, 3, key)
    expect(rpc.mock.calls).toEqual([
      ['owner_team_list', { p_store_id: storeId }],
      [
        'owner_team_invite',
        {
          p_store_id: storeId,
          p_recipient_email: 'editor@example.test',
          p_role: 'listing_editor',
          p_idempotency_key: key,
        },
      ],
      [
        'owner_team_revoke',
        {
          p_store_id: storeId,
          p_grant_id: accessId,
          p_expected_version: 3,
          p_idempotency_key: key,
        },
      ],
    ])
  })

  it('surfaces the current version on stale invitation and team writes', async () => {
    const client = createOwnerClient(vi.fn().mockResolvedValue({ state: 'conflict', version: 5 }))
    await expect(
      client.cancelTeamInvitation(
        '00000000-0000-4000-8000-000000001001',
        '00000000-0000-4000-8000-000000001002',
        4,
        'stale-cancel',
      ),
    ).rejects.toThrow('Current version: 5')
    await expect(
      client.revokeTeamMember(
        '00000000-0000-4000-8000-000000001001',
        '00000000-0000-4000-8000-000000001003',
        4,
        'stale-revoke',
      ),
    ).rejects.toThrow('Current version: 5')
    await expect(
      client.acceptInvitation('00000000-0000-4000-8000-000000001002', 4, 'stale-accept'),
    ).rejects.toThrow('Current version: 5')
  })
})
