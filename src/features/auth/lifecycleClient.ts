import type { AccountLifecycleClient } from './lifecycle'

export const GENERIC_LIFECYCLE_ERROR =
  "We couldn't complete that account request. Please try again."

export const unavailableLifecycleClient: AccountLifecycleClient = {
  async getStatus() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async requestExport() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async getExportStatus() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async requestDeletion() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async cancelDeletion() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
}
