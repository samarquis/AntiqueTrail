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

  it('preserves the server-authoritative onboarding category and atomic approval outcome', async () => {
    const client = createAdminClient({
      rpc: async (name) => {
        if (name === 'admin_list_review_cases') {
          return {
            data: [
              {
                id: 'case-onboarding-1',
                caseType: 'partner_onboarding',
                queueCategory: 'onboarding',
                assignedCount: 1,
                targetKind: 'pilot_store_draft',
                storeLabel: 'Juniper House Antiques',
                state: 'assigned',
                version: 2,
                createdAt: '2026-08-05T12:00:00Z',
              },
            ],
            error: null,
          }
        }
        return {
          data: {
            id: 'case-onboarding-1',
            state: 'approved',
            version: 3,
            onboardingOutcome: {
              pilotStoreRecordCreated: true,
              storeLabel: 'Juniper House Antiques',
              representativeScope: 'Juniper House Antiques only',
              unrelatedAuthorityChanged: false,
            },
          },
          error: null,
        }
      },
    })

    await expect(client.listCases()).resolves.toMatchObject([
      { caseType: 'partner_onboarding', queueCategory: 'onboarding' },
    ])
    await expect(
      client.decideCase('case-onboarding-1', 'approve', 'verified', 2, 'onboarding-1-v2'),
    ).resolves.toMatchObject({
      onboardingOutcome: {
        pilotStoreRecordCreated: true,
        representativeScope: 'Juniper House Antiques only',
        unrelatedAuthorityChanged: false,
      },
    })
  })

  it('binds an active revoke preview and mutation to one exact representative store scope', async () => {
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = []
    const client = createAdminClient({
      rpc: async (name, args) => {
        calls.push({ name, args })
        return {
          data:
            name === 'admin_preview_store_scope_change'
              ? {
                  previewId: 'preview-1',
                  subjectUserId: 'rep-1',
                  storeId: 'store-1',
                  grantId: 'grant-1',
                  grantVersion: 1,
                  previewHash: 'hash',
                  expiresAt: '2026-08-28T12:10:00Z',
                }
              : { grantId: 'grant-1', state: 'revoked', version: 2 },
          error: null,
        }
      },
    })

    await client.previewStoreScopeChange('revoke', 'rep-1', 'store-1', 1)
    await client.changeStoreScope(
      'revoke',
      'rep-1',
      'store-1',
      1,
      'authority_withdrawn',
      'scope-grant-1-v1',
      'preview-1',
    )
    expect(calls).toEqual([
      {
        name: 'admin_preview_store_scope_change',
        args: {
          p_operation: 'revoke',
          p_subject_user_id: 'rep-1',
          p_store_id: 'store-1',
          p_expected_version: 1,
        },
      },
      {
        name: 'admin_change_store_scope',
        args: {
          p_operation: 'revoke',
          p_subject_user_id: 'rep-1',
          p_store_id: 'store-1',
          p_expected_version: 1,
          p_reason_code: 'authority_withdrawn',
          p_idempotency_key: 'scope-grant-1-v1',
          p_preview_id: 'preview-1',
        },
      },
    ])
  })

  it('uses one generic failure for denied or malformed server responses', async () => {
    const denied = createAdminClient({
      rpc: async () => ({ data: null, error: { message: 'secret database detail' } }),
    })
    await expect(denied.listCases()).rejects.toThrow(GENERIC_ADMIN_FAILURE)
  })
})
