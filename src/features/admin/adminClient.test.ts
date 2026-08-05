import { describe, expect, it } from 'vitest'
import { createAdminClient } from './adminClient'
import { GENERIC_ADMIN_FAILURE } from './boundary'

describe('admin RPC client', () => {
  it('decides exactly one typed review case with concurrency and idempotency evidence', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
    const client = createAdminClient({
      rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: { id: 'case-1', state: 'approved', version: 4 }, error: null }
      },
    })

    await expect(
      client.decideCase('case-1', 'approve', 'Owner authority verified', 3, 'review-case-1-v3'),
    ).resolves.toMatchObject({ id: 'case-1', state: 'approved', version: 4 })
    expect(calls).toEqual([
      {
        name: 'admin_decide_review_case',
        args: {
          p_case_id: 'case-1',
          p_action: 'approve',
          p_reason: 'Owner authority verified',
          p_expected_version: 3,
          p_idempotency_key: 'review-case-1-v3',
        },
      },
    ])
  })

  it('revokes only the named representative and exact store scope', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
    const client = createAdminClient({
      rpc: async (name, args) => {
        calls.push({ name, args })
        return { data: { grantId: 'grant-1', state: 'revoked', version: 2 }, error: null }
      },
    })

    await client.changeStoreScope(
      'revoke',
      'rep-1',
      'store-1',
      1,
      'authority_withdrawn',
      'scope-grant-1-v1',
    )
    expect(calls[0]).toEqual({
      name: 'admin_change_store_scope',
      args: {
        p_operation: 'revoke',
        p_subject_user_id: 'rep-1',
        p_store_id: 'store-1',
        p_expected_version: 1,
        p_reason_code: 'authority_withdrawn',
        p_idempotency_key: 'scope-grant-1-v1',
      },
    })
  })

  it('uses one generic failure for denied or malformed server responses', async () => {
    const denied = createAdminClient({
      rpc: async () => ({ data: null, error: { message: 'secret database detail' } }),
    })
    await expect(denied.listCases()).rejects.toThrow(GENERIC_ADMIN_FAILURE)
  })
})
