import { describe, expect, it, vi } from 'vitest'
import {
  GENERIC_RELEASE_COMMAND_ERROR,
  createRegionalReleaseClient,
  type RegionalReleaseCommandTransport,
} from './releaseClient'
import edgeSource from '../../../supabase/functions/regional-release-command/index.ts?raw'

describe('regional release operational client', () => {
  it('deploys a constrained executor boundary without service-role authority', () => {
    expect(edgeSource).toContain('REGIONAL_RELEASE_EXECUTOR_JWT')
    expect(edgeSource).toContain('execute_regional_release_command')
    expect(edgeSource).not.toContain('SERVICE_ROLE')
    expect(edgeSource).not.toContain('console.')
  })
  it('sends only immutable command IDs and accepted receipt references for promotion', async () => {
    const transport: RegionalReleaseCommandTransport = {
      execute: vi.fn(async () => ({ state: 'active' as const })),
    }
    const client = createRegionalReleaseClient(transport)
    await expect(
      client.promote({
        commandId: 'command-1',
        releaseId: 'release-1',
        receiptIds: ['receipt-1', 'receipt-2'],
      }),
    ).resolves.toEqual({ state: 'active' })
    expect(transport.execute).toHaveBeenCalledWith({
      operation: 'promote',
      commandId: 'command-1',
      releaseId: 'release-1',
      receiptIds: ['receipt-1', 'receipt-2'],
    })
  })

  it('normalizes rollback reason and hides service details on any ambiguous result', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ state: 'rolled_back' as const })
      .mockResolvedValueOnce({ state: 'active' as const })
    const client = createRegionalReleaseClient({ execute })
    await expect(
      client.rollback({ commandId: 'command-2', releaseId: 'release-1', reason: '  outage  ' }),
    ).resolves.toEqual({ state: 'rolled_back' })
    expect(execute).toHaveBeenCalledWith({
      operation: 'rollback',
      commandId: 'command-2',
      releaseId: 'release-1',
      reason: 'outage',
    })
    await expect(
      client.rollback({ commandId: 'command-3', releaseId: 'release-1', reason: 'outage' }),
    ).rejects.toThrow(GENERIC_RELEASE_COMMAND_ERROR)
  })
})
