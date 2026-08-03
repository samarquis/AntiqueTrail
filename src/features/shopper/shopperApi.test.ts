import { describe, expect, it, vi } from 'vitest'
import { createShopperClient, ShopperApiError } from './shopperApi'

describe('shopper RPC boundary', () => {
  it('maps private-memory input without a caller-supplied actor', async () => {
    const rpc = vi.fn(async () => ({
      data: { storeId: 'store-1', rating: 4, note: 'Good', lastVisitMonth: '2026-07', version: 3 },
      error: null,
    }))
    const client = createShopperClient({ rpc })

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
    const client = createShopperClient({ rpc })

    await expect(client.getCorrection('report-1')).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledWith('shopper_get_correction', { p_report_id: 'report-1' })
  })

  it('does not expose database error details', async () => {
    const client = createShopperClient({
      rpc: async () => ({ data: null, error: { message: 'private user id leaked' } }),
    })
    await expect(client.listSaved()).rejects.toEqual(new ShopperApiError())
  })
})
