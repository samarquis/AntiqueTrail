export type AccountLifecycleState = 'active' | 'deletion_scheduled' | 'deleted'
export type AccountExportState = 'queued' | 'building' | 'ready' | 'failed' | 'expired'

export interface InactivityWarning {
  daysRemaining: number
}

export interface AccountLifecycleSnapshot {
  state: AccountLifecycleState
  deletionDueAt?: string
  inactivityWarning?: InactivityWarning
}

export interface ExportJob {
  id: string
  state: AccountExportState
  createdAt: string
  expiresAt?: string
}

/** Provider-neutral application lifecycle contract. No provider tokens or signed URLs cross this seam. */
export interface AccountLifecycleClient {
  getStatus(): Promise<AccountLifecycleSnapshot>
  requestExport(): Promise<ExportJob>
  getExportStatus(jobId: string): Promise<ExportJob>
  downloadExport(jobId: string): Promise<Blob>
  requestDeletion(): Promise<AccountLifecycleSnapshot>
  cancelDeletion(): Promise<AccountLifecycleSnapshot>
}
