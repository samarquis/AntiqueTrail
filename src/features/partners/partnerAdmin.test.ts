import { describe, expect, it, vi } from 'vitest'
import { createPartnerAdminClient } from './partnerAdmin'

describe('partner administrator boundary', () => {
  it('confirms the exact Owner store through the synthetic Owner approval RPC', async () => {
    const storeId = '00000000-0000-4000-8000-000000000009'
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ role: 'Store Owner', storeId, claimId: 'claim-1' })
      .mockResolvedValueOnce({ claimId: 'claim-1', state: 'approved', ownerIntent: false })
    const client = createPartnerAdminClient({ rpc, ownerApprovalAvailable: true })
    await client.decide({
      operation: 'approve_owner',
      claimId: 'claim-1',
      confirmedStoreId: storeId,
      expectedVersion: 3,
      idempotencyKey: 'owner-approval',
      reasonCode: 'owner_boundary_confirmed',
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'owner_admin_approve_claim', {
      p_claim_id: 'claim-1',
      p_store_id: storeId,
      p_expected_version: 3,
      p_idempotency_key: 'owner-approval',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'partner_admin_claim_case', { p_claim_id: 'claim-1' })
  })
  it('does not offer Owner approval in the normal composition', async () => {
    const rpc = vi.fn()
    const client = createPartnerAdminClient({ rpc })
    await expect(
      client.decide({
        operation: 'approve_owner',
        claimId: 'claim-1',
        confirmedStoreId: '00000000-0000-4000-8000-000000000009',
        expectedVersion: 3,
        idempotencyKey: 'owner-approval',
        reasonCode: 'owner_boundary_confirmed',
      }),
    ).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([undefined, 'synthetic-store'])(
    'rejects Owner approval without a UUID store ID (%s) before any RPC',
    async (confirmedStoreId) => {
      const rpc = vi.fn()
      const client = createPartnerAdminClient({ rpc, ownerApprovalAvailable: true })
      await expect(
        client.decide({
          operation: 'approve_owner',
          claimId: '11111111-1111-4111-8111-111111111111',
          confirmedStoreId,
          expectedVersion: 3,
          idempotencyKey: 'owner-approval',
          reasonCode: 'owner_boundary_confirmed',
        }),
      ).rejects.toThrow('partner_administration_unavailable')
      expect(rpc).not.toHaveBeenCalled()
    },
  )
  it('uses one exact claim per read and never exposes a bulk operation', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-1', state: 'verification_pending', ownerIntent: false }
    })
    const client = createPartnerAdminClient({ rpc })

    await client.getCase('claim-1')

    expect(rpc).toHaveBeenCalledWith('partner_admin_claim_case', { p_claim_id: 'claim-1' })
    expect('listCases' in client).toBe(false)
  })

  it.each([
    { claimId: 'claim-1', state: 'verification_pending' },
    { claimId: 'claim-1', state: 'verification_pending', ownerIntent: 'false' },
  ])('rejects a case response without a boolean Owner-intent flag', async (value) => {
    const client = createPartnerAdminClient({ rpc: vi.fn().mockResolvedValue(value) })

    await expect(client.getCase('claim-1')).rejects.toThrow('partner_administration_unavailable')
  })

  it('lists and revokes exact-store team grants without returning recipient email', async () => {
    const storeId = '00000000-0000-4000-8000-000000000009'
    const grantId = '00000000-0000-4000-8000-000000000424'
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        members: [{ grantId, role: 'listing_editor', displayName: 'Jordan Editor', version: 2 }],
      })
      .mockResolvedValueOnce({ state: 'revoked', version: 3 })
    const client = createPartnerAdminClient({ rpc })

    expect(await client.listStoreTeam(storeId)).toEqual({
      members: [{ grantId, role: 'listing_editor', displayName: 'Jordan Editor', version: 2 }],
    })
    await client.revokeStoreTeamAccess({
      storeId,
      grantId,
      expectedVersion: 2,
      idempotencyKey: 'admin-team-remove-v2',
      reason: 'Access removed after authorization mismatch',
    })

    expect(rpc).toHaveBeenNthCalledWith(1, 'owner_admin_team_list', { p_store_id: storeId })
    expect(rpc).toHaveBeenNthCalledWith(2, 'owner_admin_team_revoke', {
      p_store_id: storeId,
      p_grant_id: grantId,
      p_expected_version: 2,
      p_idempotency_key: 'admin-team-remove-v2',
      p_reason: 'Access removed after authorization mismatch',
    })
  })

  it('surfaces the current version when Site Admin removal conflicts', async () => {
    const rpc = vi.fn().mockResolvedValue({ state: 'conflict', version: 4 })
    const client = createPartnerAdminClient({ rpc })
    await expect(
      client.revokeStoreTeamAccess({
        storeId: '00000000-0000-4000-8000-000000000009',
        grantId: '00000000-0000-4000-8000-000000000424',
        expectedVersion: 3,
        idempotencyKey: 'admin-team-remove-v3',
        reason: 'Access removal approved',
      }),
    ).rejects.toThrow('Current version: 4')
  })

  it('rejects empty or control-character revocation reasons before the RPC', async () => {
    const rpc = vi.fn()
    const client = createPartnerAdminClient({ rpc })
    const base = {
      storeId: '00000000-0000-4000-8000-000000000009',
      grantId: '00000000-0000-4000-8000-000000000424',
      expectedVersion: 2,
      idempotencyKey: 'admin-team-remove-v2',
    }

    await expect(client.revokeStoreTeamAccess({ ...base, reason: '   ' })).rejects.toThrow()
    await expect(
      client.revokeStoreTeamAccess({ ...base, reason: 'reason\nfor removal' }),
    ).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed Site Admin team projections', async () => {
    const rpc = vi.fn().mockResolvedValue({
      members: [{ grantId: 'attacker', role: 'administrator', displayName: 'Owner', version: 1 }],
    })
    const client = createPartnerAdminClient({ rpc })

    await expect(client.listStoreTeam('00000000-0000-4000-8000-000000000009')).rejects.toThrow()
  })

  it('binds every decision to version, idempotency key, and reason', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-1', state: 'changes_requested', ownerIntent: false }
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
      return { claimId: 'claim-new', state: 'approved', ownerIntent: false }
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

  it('sends the exact invitation email only to the bounded Edge operation', async () => {
    const rpc = vi.fn()
    const edge = vi.fn(async () => ({
      invitationId: 'invitation-1',
      token: 'opaque-one-time-token',
      expiresAt: '2026-08-04T12:30:00Z',
    }))
    const client = createPartnerAdminClient({ rpc, edge })

    await expect(
      client.issueSyntheticInvitation({
        email: 'owner@example.com',
        idempotencyKey: 'invite-owner-1',
      }),
    ).resolves.toMatchObject({ invitationId: 'invitation-1' })

    expect(edge).toHaveBeenCalledWith('partner-admin-invitation', {
      email: 'owner@example.com',
      idempotencyKey: 'invite-owner-1',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('verifies one submitted signal through the server-authoritative command', async () => {
    const rpc = vi.fn(async (command: string, payload: Readonly<Record<string, unknown>>) => {
      void command
      void payload
      return { claimId: 'claim-1', state: 'verification_pending', ownerIntent: false }
    })
    const client = createPartnerAdminClient({ rpc })

    await client.verifySignal({
      operation: 'verify',
      claimId: 'claim-1',
      signalId: 'signal-1',
      expectedVersion: 3,
      idempotencyKey: 'verify-signal-1-v3',
      reasonCode: 'independent_authority_confirmed',
    })

    expect(rpc).toHaveBeenCalledWith('partner_admin_signal_command', {
      p_operation: 'verify',
      p_claim_id: 'claim-1',
      p_signal_id: 'signal-1',
      p_expected_version: 3,
      p_idempotency_key: 'verify-signal-1-v3',
      p_reason_code: 'independent_authority_confirmed',
    })
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('evidence')
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('actorUserId')
  })
})
