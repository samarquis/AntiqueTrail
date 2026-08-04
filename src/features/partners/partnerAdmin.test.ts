import { describe, expect, it, vi } from 'vitest'
import { createPartnerAdminClient } from './partnerAdmin'

describe('partner administrator boundary', () => {
  it('uses one exact claim per read and never exposes a bulk operation', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-1', state: 'verification_pending' }
    })
    const client = createPartnerAdminClient({ rpc })

    await client.getCase('claim-1')

    expect(rpc).toHaveBeenCalledWith('partner_admin_claim_case', { p_claim_id: 'claim-1' })
    expect('listCases' in client).toBe(false)
  })

  it('binds every decision to version, idempotency key, and reason', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-1', state: 'changes_requested' }
    })
    const client = createPartnerAdminClient({ rpc })

    await client.decide({
      operation: 'changes',
      claimId: 'claim-1',
      expectedVersion: 3,
      idempotencyKey: 'changes-claim-1-v3',
      reasonCode: 'authority_details_needed',
    })

    expect(rpc).toHaveBeenCalledWith('partner_admin_claim_command', {
      p_operation: 'changes',
      p_claim_id: 'claim-1',
      p_expected_version: 3,
      p_idempotency_key: 'changes-claim-1-v3',
      p_reason_code: 'authority_details_needed',
      p_transfer_from_claim_id: null,
    })
  })

  it('makes transfer source explicit without accepting actor or store scope', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-new', state: 'approved' }
    })
    const client = createPartnerAdminClient({ rpc })

    await client.decide({
      operation: 'transfer',
      claimId: 'claim-new',
      transferFromClaimId: 'claim-old',
      expectedVersion: 2,
      idempotencyKey: 'transfer-claim-new-v2',
      reasonCode: 'verified_authority_transfer',
    })

    const payload = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('actorUserId')
    expect(payload).not.toHaveProperty('storeId')
    expect(payload.p_transfer_from_claim_id).toBe('claim-old')
  })
})
