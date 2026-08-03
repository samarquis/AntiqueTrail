import { describe, expect, it, vi } from 'vitest'
import { createReadinessClient, ReadinessApiError } from './readinessApi'

describe('durable readiness RPC boundary', () => {
  it('requests status without accepting evidence or signer identity from the browser', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        runId: 'run-1',
        state: 'frozen',
        frozenDigest: 'digest',
        blockers: [],
        calculatedAt: '2026-08-03T00:00:00Z',
        receiptId: null,
      },
      error: null,
    }))
    const client = createReadinessClient({ rpc })

    await client.getStatus('run-1')

    expect(rpc).toHaveBeenCalledWith('readiness_get_status', { p_run_id: 'run-1' })
  })

  it('requests a server-generated one-use challenge without a signatureVerified claim', async () => {
    const rpc = vi.fn(async () => ({
      data: { challengeId: 'challenge-1', payloadDigest: 'digest', expiresAt: 'soon' },
      error: null,
    }))
    const client = createReadinessClient({ rpc })

    await client.requestSigningChallenge('run-1')

    expect(rpc).toHaveBeenCalledWith('readiness_request_signing_challenge', {
      p_run_id: 'run-1',
    })
  })

  it('fails closed without exposing database or provider details', async () => {
    const client = createReadinessClient({
      rpc: async () => ({ data: null, error: { message: 'provider-key-secret' } }),
    })

    await expect(client.getStatus('run-1')).rejects.toEqual(new ReadinessApiError())
  })
})
