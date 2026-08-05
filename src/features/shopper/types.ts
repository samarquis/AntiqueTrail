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

export interface PrivateDeleteReceipt {
  undoToken: string
  undoUntil: string
}

export interface CatalogAreaChoice {
  id: string
  slug: string
  label: string
}

export interface NewSinceStore {
  storeId: string
  slug: string
  name: string
  addedAt: string
}

export interface NewSinceResult {
  area: CatalogAreaChoice
  lastSeenAt: string | null
  stores: NewSinceStore[]
}

export interface CorrectionDraft {
  storeId: string
  type: 'identity' | 'contact' | 'hours' | 'categories' | 'other'
  description: string
  publicSourceUrl?: string
}

export interface CorrectionStatus {
  id: string
  state: CorrectionState
}

export interface ShopperPrivateClient {
  listSaved(): Promise<SavedStore[]>
  getSaveState(storeId: string): Promise<{ saved: boolean }>
  setSave(storeId: string, saved: boolean): Promise<{ saved: boolean }>
  getMemory(storeId: string): Promise<PrivateStoreMemory | null>
  listMemories(): Promise<PrivateStoreMemory[]>
  upsertMemory(
    memory: Omit<PrivateStoreMemory, 'version'> & { version?: number },
  ): Promise<PrivateStoreMemory>
  deleteMemory(storeId: string): Promise<PrivateDeleteReceipt>
  undoDeleteMemory(storeId: string, undoToken: string): Promise<PrivateStoreMemory>
  listCatalogAreas(): Promise<CatalogAreaChoice[]>
  getNewSince(areaId: string): Promise<NewSinceResult>
  markCatalogSeen(areaId: string): Promise<{ seenAt: string }>
  dismissNewStore(storeId: string): Promise<void>
  submitCorrection(draft: CorrectionDraft): Promise<CorrectionStatus>
  getCorrection(id: string): Promise<CorrectionStatus | null>
}
