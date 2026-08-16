import { describe, expect, it, vi } from 'vitest'
import { createShopperClient, ShopperApiError } from './shopperApi'

function edgeTransport(edge = vi.fn(async () => ({ data: null, error: null }))) {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    edge,
  }
}

describe('shopper RPC boundary', () => {
  it('maps private-memory input without a caller-supplied actor', async () => {
    const rpc = vi.fn(async () => ({
      data: { storeId: 'store-1', rating: 4, note: 'Good', lastVisitMonth: '2026-07', version: 3 },
      error: null,
    }))
    const client = createShopperClient({ rpc, edge: edgeTransport().edge })

    await client.upsertMemory({
      storeId: 'store-1',
      rating: 4,
      note: 'Good',
      lastVisitMonth: '2026-07',
      version: 2,
    })

    expect(rpc).toHaveBeenCalledWith('shopper_upsert_memory', {
      p_store_id: 'store-1',
      p_rating: 4,
      p_note: 'Good',
      p_last_visit_month: '2026-07-01',
      p_expected_version: 2,
    })
  })

  it('uses the bounded account-implicit correction lookup', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const client = createShopperClient({ rpc, edge: edgeTransport().edge })

    await expect(client.getCorrection('report-1')).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledWith('shopper_get_correction', { p_report_id: 'report-1' })
  })

  it('uses explicit idempotent Save state and an independent memory-history RPC', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'shopper_list_memories' ? [] : { saved: true },
      error: null,
    }))
    const client = createShopperClient({ rpc, edge: edgeTransport().edge })

    await expect(client.getSaveState('store-1')).resolves.toEqual({ saved: true })
    await expect(client.setSave('store-1', true)).resolves.toEqual({ saved: true })
    await expect(client.listMemories()).resolves.toEqual([])
    expect(rpc).toHaveBeenNthCalledWith(1, 'shopper_save_state', { p_store_id: 'store-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'shopper_set_save', {
      p_store_id: 'store-1',
      p_saved: true,
    })
    expect(rpc).toHaveBeenNthCalledWith(3, 'shopper_list_memories', {})
  })

  it('routes correction submission through the edge gateway without caller-supplied digests', async () => {
    const edge = vi.fn(async () => ({
      data: { id: 'report-1', state: 'submitted' },
      error: null,
    }))
    const client = createShopperClient({ rpc: edgeTransport().rpc, edge })

    await expect(
      client.submitCorrection({
        storeId: 'store-1',
        type: 'hours',
        description: 'Hours are outdated',
        publicSourceUrl: 'https://example.com/hours',
      }),
    ).resolves.toEqual({ id: 'report-1', state: 'submitted' })

    expect(edge).toHaveBeenCalledWith('correction-submit', {
      storeId: 'store-1',
      type: 'hours',
      description: 'Hours are outdated',
      publicSourceUrl: 'https://example.com/hours',
    })
    expect(edge).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ p_ip_hmac: expect.anything() }),
    )
  })

  it('does not expose database error details', async () => {
    const client = createShopperClient({
      rpc: async () => ({ data: null, error: { message: 'private user id leaked' } }),
      edge: edgeTransport().edge,
    })
    await expect(client.listSaved()).rejects.toEqual(new ShopperApiError())
  })
})
