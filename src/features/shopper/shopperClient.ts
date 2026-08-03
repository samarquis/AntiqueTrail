import type { ShopperPrivateClient } from './types'

export const GENERIC_SHOPPER_ERROR = "We couldn't complete that private action. Please try again."

export const unavailableShopperClient: ShopperPrivateClient = {
  async listSaved() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async toggleSave() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async getMemory() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async upsertMemory() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async deleteMemory() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async undoDeleteMemory() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async listCatalogAreas() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async getNewSince() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async markCatalogSeen() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async dismissNewStore() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async submitCorrection() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
  async getCorrection() {
    throw new Error(GENERIC_SHOPPER_ERROR)
  },
}
