import { GENERIC_SHOPPER_ERROR } from './shopperClient'
import type { ShopperPrivateClient } from './types'

type ShopperRpcName =
  | 'shopper_list_saved'
  | 'shopper_save_state'
  | 'shopper_set_save'
  | 'shopper_get_memory'
  | 'shopper_list_memories'
  | 'shopper_upsert_memory'
  | 'shopper_delete_memory'
  | 'shopper_undo_delete_memory'
  | 'shopper_list_catalog_areas'
  | 'shopper_get_new_since'
  | 'shopper_mark_catalog_seen'
  | 'shopper_dismiss_new_store'
  | 'shopper_submit_correction'
  | 'shopper_get_correction'

export interface ShopperRpcTransport {
  rpc(
    name: ShopperRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export class ShopperApiError extends Error {
  constructor() {
    super(GENERIC_SHOPPER_ERROR)
    this.name = 'ShopperApiError'
  }
}

export function createShopperClient(transport: ShopperRpcTransport): ShopperPrivateClient {
  async function call<T>(
    name: ShopperRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error) throw new ShopperApiError()
      return result.data as T
    } catch (error) {
      if (error instanceof ShopperApiError) throw error
      throw new ShopperApiError()
    }
  }

  return {
    listSaved: () => call('shopper_list_saved', {}),
    getSaveState: (storeId) => call('shopper_save_state', { p_store_id: storeId }),
    setSave: (storeId, saved) =>
      call('shopper_set_save', { p_store_id: storeId, p_saved: saved }),
    getMemory: (storeId) => call('shopper_get_memory', { p_store_id: storeId }),
    listMemories: () => call('shopper_list_memories', {}),
    upsertMemory: (memory) =>
      call('shopper_upsert_memory', {
        p_store_id: memory.storeId,
        p_rating: memory.rating,
        p_note: memory.note,
        p_last_visit_month: memory.lastVisitMonth ? `${memory.lastVisitMonth}-01` : null,
        p_expected_version: memory.version ?? null,
      }),
    deleteMemory: (storeId) => call('shopper_delete_memory', { p_store_id: storeId }),
    undoDeleteMemory: (storeId, undoToken) =>
      call('shopper_undo_delete_memory', {
        p_store_id: storeId,
        p_undo_token: undoToken,
      }),
    listCatalogAreas: () => call('shopper_list_catalog_areas', {}),
    getNewSince: (areaId) => call('shopper_get_new_since', { p_area_id: areaId }),
    markCatalogSeen: (areaId) => call('shopper_mark_catalog_seen', { p_area_id: areaId }),
    async dismissNewStore(storeId) {
      await call('shopper_dismiss_new_store', { p_store_id: storeId })
    },
    submitCorrection: (draft) =>
      call('shopper_submit_correction', {
        p_store_id: draft.storeId,
        p_type: draft.type,
        p_description: draft.description,
        p_public_source_url: draft.publicSourceUrl ?? null,
      }),
    getCorrection: (id) => call('shopper_get_correction', { p_report_id: id }),
  }
}
