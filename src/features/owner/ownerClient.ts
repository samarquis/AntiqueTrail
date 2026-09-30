export interface OwnerStore {
  storeId: string
  name: string
}

export interface OwnerClient {
  listStores(): Promise<OwnerStore[]>
  selectStore(storeId: string): Promise<void>
}

export const OWNER_ACCESS_ERROR = 'Store workspace access is unavailable.'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(OWNER_ACCESS_ERROR)
  return value as Record<string, unknown>
}

export function createOwnerClient(
  rpc: (command: string, payload: Readonly<Record<string, unknown>>) => Promise<unknown>,
): OwnerClient {
  return {
    async listStores() {
      const result = object(await rpc('owner_list_stores', {}))
      if (result.role !== 'Store Owner' || !Array.isArray(result.stores) || !result.stores.length)
        throw new Error(OWNER_ACCESS_ERROR)
      return result.stores.map((value) => {
        const store = object(value)
        if (
          typeof store.storeId !== 'string' ||
          !uuid.test(store.storeId) ||
          typeof store.name !== 'string' ||
          !store.name.trim()
        )
          throw new Error(OWNER_ACCESS_ERROR)
        return { storeId: store.storeId, name: store.name }
      })
    },
    async selectStore(storeId) {
      if (!uuid.test(storeId)) throw new Error(OWNER_ACCESS_ERROR)
      const result = object(await rpc('owner_select_store', { p_store_id: storeId }))
      if (result.storeId !== storeId) throw new Error(OWNER_ACCESS_ERROR)
    },
  }
}

export const unavailableOwnerClient: OwnerClient = {
  listStores: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  selectStore: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
}
