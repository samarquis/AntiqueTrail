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
  async downloadExport() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async requestDeletion() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
  async cancelDeletion() {
    throw new Error(GENERIC_LIFECYCLE_ERROR)
  },
}

export interface AccountLifecycleTransport {
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<unknown>
  download(jobId: string): Promise<Blob>
}

type LooseRecord = Record<string, unknown>

function record(value: unknown): LooseRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
  return value as LooseRecord
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256)
    throw new Error('invalid')
  return value
}

function exportJob(value: unknown) {
  const source = record(value)
  const state = text(source.state)
  if (!['queued', 'building', 'ready', 'failed', 'expired'].includes(state))
    throw new Error('invalid')
  return {
    id: text(source.id),
    state: state as 'queued' | 'building' | 'ready' | 'failed' | 'expired',
    createdAt: text(source.createdAt),
    ...(typeof source.expiresAt === 'string' ? { expiresAt: source.expiresAt } : {}),
  }
}

function lifecycleStatus(value: unknown) {
  const source = record(value)
  const state = text(source.state)
  if (!['active', 'deletion_scheduled', 'deleted'].includes(state)) throw new Error('invalid')
  return {
    state: state as 'active' | 'deletion_scheduled' | 'deleted',
    ...(typeof source.deletionDueAt === 'string' ? { deletionDueAt: source.deletionDueAt } : {}),
    ...(source.inactivityWarning && typeof source.inactivityWarning === 'object'
      ? {
          inactivityWarning: {
            daysRemaining: Number((source.inactivityWarning as LooseRecord).daysRemaining),
          },
        }
      : {}),
  }
}

/** Account identity is derived from the active server session; callers never supply an actor. */
export function createAccountLifecycleClient(
  transport: AccountLifecycleTransport,
): AccountLifecycleClient {
  async function safe<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch {
      throw new Error(GENERIC_LIFECYCLE_ERROR)
    }
  }
  return {
    getStatus: () =>
      safe(async () => lifecycleStatus(await transport.rpc('account_lifecycle_status'))),
    requestExport: () => safe(async () => exportJob(await transport.rpc('request_account_export'))),
    getExportStatus: (jobId) =>
      safe(async () =>
        exportJob(await transport.rpc('get_account_export_status', { p_job_id: jobId })),
      ),
    downloadExport: (jobId) => safe(async () => transport.download(jobId)),
    requestDeletion: () =>
      safe(async () => lifecycleStatus(await transport.rpc('request_account_deletion'))),
    cancelDeletion: () =>
      safe(async () => lifecycleStatus(await transport.rpc('cancel_account_deletion'))),
  }
}
