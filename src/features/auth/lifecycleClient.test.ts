import { describe, expect, it, vi } from 'vitest'
import {
  GENERIC_LIFECYCLE_ERROR,
  createAccountLifecycleClient,
  type AccountLifecycleTransport,
} from './lifecycleClient'

function transport(): AccountLifecycleTransport {
  return {
    rpc: vi.fn(async (name) => {
      if (name === 'account_lifecycle_status') return { state: 'active' }
      if (name === 'request_account_export')
        return { id: 'export-1', state: 'queued', createdAt: '2026-08-04T12:00:00Z' }
      if (name === 'get_account_export_status')
        return {
          id: 'export-1',
          state: 'ready',
          createdAt: '2026-08-04T12:00:00Z',
          expiresAt: '2026-08-11T12:00:00Z',
          generatedAt: '2026-08-04T12:01:00Z',
          fileSizeBytes: 4096,
          checksumSha256: 'ab'.repeat(32),
        }
      if (name === 'request_account_deletion')
        return { state: 'deletion_scheduled', deletionDueAt: '2026-08-11T12:00:00Z' }
      return { state: 'active' }
    }),
    download: vi.fn(async () => new Blob(['{}'], { type: 'application/json' })),
  }
}

describe('account lifecycle production client', () => {
  it('uses account-implicit bounded RPCs and a blob-only download handoff', async () => {
    const boundary = transport()
    const client = createAccountLifecycleClient(boundary)
    await expect(client.getStatus()).resolves.toEqual({ state: 'active' })
    await expect(client.requestExport()).resolves.toMatchObject({ id: 'export-1', state: 'queued' })
    await expect(client.getExportStatus('export-1')).resolves.toMatchObject({
      state: 'ready',
      fileSizeBytes: 4096,
      checksumSha256: 'ab'.repeat(32),
    })
    await expect(client.downloadExport('export-1')).resolves.toBeInstanceOf(Blob)
    await expect(client.requestDeletion()).resolves.toMatchObject({ state: 'deletion_scheduled' })
    await expect(client.cancelDeletion()).resolves.toEqual({ state: 'active' })
    expect(boundary.rpc).toHaveBeenCalledWith('account_lifecycle_status')
    expect(boundary.rpc).toHaveBeenCalledWith('request_account_export')
    expect(boundary.rpc).toHaveBeenCalledWith('get_account_export_status', {
      p_job_id: 'export-1',
    })
    expect(boundary.rpc).toHaveBeenCalledWith('request_account_deletion')
    expect(boundary.rpc).toHaveBeenCalledWith('cancel_account_deletion')
    expect(boundary.download).toHaveBeenCalledWith('export-1')
  })

  it('conflates transport and malformed response details', async () => {
    const client = createAccountLifecycleClient({
      rpc: vi.fn(async () => ({ state: 'provider-secret-detail' })),
      download: vi.fn(async () => {
        throw new Error('signed-url=secret')
      }),
    })
    await expect(client.getStatus()).rejects.toThrow(GENERIC_LIFECYCLE_ERROR)
    await expect(client.downloadExport('export-1')).rejects.toThrow(GENERIC_LIFECYCLE_ERROR)
  })
})
