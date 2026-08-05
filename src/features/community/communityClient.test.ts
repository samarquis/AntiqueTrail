import { describe, expect, it, vi } from 'vitest'
import { CommunityCommandError, createCommunityDeploymentClient } from './communityClient'

describe('community deployment client', () => {
  it('sends one exact prepare command without client-authored evidence or digest', async () => {
    const rpc = vi.fn(async () => ({
      data: { run_id: '12000000-0000-4000-8000-000000000101', state: 'prepared' },
      error: null,
    }))
    const client = createCommunityDeploymentClient({ rpc })

    await client.execute({
      operation: 'prepare',
      payload: {
        runId: '12000000-0000-4000-8000-000000000101',
        areaSlug: 'osage-city',
        targetOrdinal: 1,
        selectionReceiptId: '12000000-0000-4000-8000-000000000001',
        prerequisiteReceiptId: '12000000-0000-4000-8000-000000000002',
        expectedRootVersion: 1,
        idempotencyKey: 'prepare-osage',
      },
    })

    expect(rpc).toHaveBeenCalledWith('community_deployment_command', {
      p_operation: 'prepare',
      p_payload: {
        runId: '12000000-0000-4000-8000-000000000101',
        areaSlug: 'osage-city',
        targetOrdinal: 1,
        selectionReceiptId: '12000000-0000-4000-8000-000000000001',
        prerequisiteReceiptId: '12000000-0000-4000-8000-000000000002',
        expectedRootVersion: 1,
        idempotencyKey: 'prepare-osage',
      },
    })
    expect(JSON.stringify(rpc.mock.calls[0])).not.toMatch(/signature|evidence|inputDigest/i)
  })

  it('fails closed with one reason-neutral error', async () => {
    const client = createCommunityDeploymentClient({
      rpc: async () => ({ data: null, error: { message: 'private database detail' } }),
    })

    await expect(
      client.execute({
        operation: 'rollback',
        payload: {
          runId: '12000000-0000-4000-8000-000000000101',
          rollbackReceiptId: '12000000-0000-4000-8000-000000000009',
          expectedRootVersion: 6,
          expectedRunVersion: 5,
          idempotencyKey: 'rollback-osage',
        },
      }),
    ).rejects.toBeInstanceOf(CommunityCommandError)
  })
})
