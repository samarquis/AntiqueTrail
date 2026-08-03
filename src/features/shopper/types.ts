export type PrivateActionState =
  | 'loading'
  | 'saved'
  | 'updated'
  | 'delete-pending'
  | 'undone'
  | 'deleted'
  | 'error'
export type CorrectionState = 'submitted' | 'triaged' | 'resolved' | 'closed'

export interface SavedStore {
  storeId: string
  slug: string
  name: string
  savedAt: string
}

export interface PrivateStoreMemory {
  storeId: string
  rating: number | null
  note: string | null
  lastVisitMonth: string | null
  version: number
}

export interface CorrectionDraft {
  storeId: string
  type: 'hours' | 'address' | 'contact' | 'other'
  description: string
  publicSourceUrl?: string
}

export interface CorrectionStatus {
  id: string
  state: CorrectionState
}

export interface ShopperPrivateClient {
  listSaved(): Promise<SavedStore[]>
  toggleSave(storeId: string): Promise<{ saved: boolean }>
  getMemory(storeId: string): Promise<PrivateStoreMemory | null>
  upsertMemory(
    memory: Omit<PrivateStoreMemory, 'version'> & { version?: number },
  ): Promise<PrivateStoreMemory>
  deleteMemory(storeId: string): Promise<void>
  submitCorrection(draft: CorrectionDraft): Promise<CorrectionStatus>
  getCorrection(id: string): Promise<CorrectionStatus | null>
}
