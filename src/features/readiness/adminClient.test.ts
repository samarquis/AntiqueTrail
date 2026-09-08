import { describe, expect, it, vi } from 'vitest'
import {
  createReadinessAdminClient,
  GENERIC_READINESS_ADMIN_ERROR,
  ReadinessAdminApiError,
} from './adminClient'

describe('readiness admin RPC boundary', () => {
  it('sends only scoped server-command arguments', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        cohort: { cohortId: 'cohort-1', areaSlug: 'topeka-ks', state: 'active', version: 1 },
        invitations: [],
        subjects: [],
        run: null,
        capabilities: {
          listingsPrivate: true,
          noindex: true,
          anonymousRealStoreAccess: false,
          publicReviews: false,
          publicPromotion: false,
        },
      },
      error: null,
    }))
    const client = createReadinessAdminClient({ rpc })

    await client.getWorkspace()

    expect(rpc).toHaveBeenCalledWith('readiness_admin_workspace', {
      p_cohort_id: null,
      p_run_id: null,
    })
  })

  it('does not accept client totals or signer identity in the operation API', async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }))
    const client = createReadinessAdminClient({ rpc })

    await client.calculateGate('run-1')
    await client.requestSigningCapability('run-1', 'a'.repeat(64))

    expect(rpc).toHaveBeenNthCalledWith(1, 'readiness_admin_calculate_gate', {
      p_run_id: 'run-1',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'readiness_admin_request_signing_capability', {
      p_run_id: 'run-1',
      p_expected_digest: 'a'.repeat(64),
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /completedJourneys|signerUserId|signatureVerified/,
    )
  })

  it('redacts backend/provider failure details', async () => {
    const client = createReadinessAdminClient({
      rpc: async () => ({ data: null, error: { message: 'provider-secret' } }),
    })

    await expect(client.getWorkspace()).rejects.toEqual(new ReadinessAdminApiError())
    await expect(client.getWorkspace()).rejects.not.toThrow('provider-secret')
    expect(GENERIC_READINESS_ADMIN_ERROR).not.toContain('provider-secret')
  })
})
