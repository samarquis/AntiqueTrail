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
      { storeId: '00000000-0000-4000-8000-000000001001', name: 'Clockwork Cabinet' },
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
})
