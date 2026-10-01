import type { PartnerClaimState } from './types'
import type { OwnerTeamInviteRole } from '../owner/ownerClient'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const idempotencyKey = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type PartnerAdminOperation =
  | 'changes'
  | 'conflict'
  | 'approve'
  | 'approve_owner'
  | 'reject'
  | 'revoke'
  | 'recheck'
  | 'transfer'

export interface PartnerAdminCase {
  claimId: string
  storeId?: string
  state: PartnerClaimState
  version?: number
  exactStoreScope?: string
  verifiedSignals?: ReadonlyArray<{ channelClass: string; signalType: string }>
  pendingSignals?: ReadonlyArray<{
    signalId: string
    channelClass: string
    signalType: string
  }>
}

export interface PartnerAdminTeamMember {
  grantId: string
  role: OwnerTeamInviteRole
  displayName: string
  version: number
}

export interface PartnerAdminTransport {
  ownerApprovalAvailable?: boolean
  rpc(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>
  edge?(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>
}

export interface SyntheticPartnerInvitation {
  invitationId: string
  token: string
  expiresAt: string
}

export interface PartnerAdminClient {
  ownerApprovalAvailable?: boolean
  getCase(claimId: string): Promise<PartnerAdminCase>
  listStoreTeam(storeId: string): Promise<{ members: PartnerAdminTeamMember[] }>
  revokeStoreTeamAccess(input: {
    storeId: string
    grantId: string
    expectedVersion: number
    idempotencyKey: string
    reason: string
  }): Promise<void>
  decide(input: {
    operation: PartnerAdminOperation
    claimId: string
    expectedVersion: number
    idempotencyKey: string
    reasonCode: string
    transferFromClaimId?: string
    confirmedStoreId?: string
  }): Promise<PartnerAdminCase>
  issueSyntheticInvitation(input: {
    email: string
    idempotencyKey: string
  }): Promise<SyntheticPartnerInvitation>
  verifySignal(input: {
    operation: 'verify' | 'reject'
    claimId: string
    signalId: string
    expectedVersion: number
    idempotencyKey: string
    reasonCode: string
  }): Promise<PartnerAdminCase>
}

export function createPartnerAdminClient(transport: PartnerAdminTransport): PartnerAdminClient {
  return {
    ownerApprovalAvailable: transport.ownerApprovalAvailable === true,
    getCase(claimId: string): Promise<PartnerAdminCase> {
      return transport.rpc('partner_admin_claim_case', {
        p_claim_id: claimId,
      }) as Promise<PartnerAdminCase>
    },
    async listStoreTeam(storeId: string): Promise<{ members: PartnerAdminTeamMember[] }> {
      if (!uuid.test(storeId)) throw new Error('partner_administration_unavailable')
      const value = await transport.rpc('owner_admin_team_list', { p_store_id: storeId })
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('partner_administration_unavailable')
      const members = (value as { members?: unknown }).members
      if (!Array.isArray(members)) throw new Error('partner_administration_unavailable')
      const validRoles: OwnerTeamInviteRole[] = ['co_owner', 'full_store_access', 'listing_editor']
      return {
        members: members.map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item))
            throw new Error('partner_administration_unavailable')
          const member = item as Record<string, unknown>
          if (
            typeof member.grantId !== 'string' ||
            !uuid.test(member.grantId) ||
            typeof member.role !== 'string' ||
            !validRoles.includes(member.role as OwnerTeamInviteRole) ||
            typeof member.displayName !== 'string' ||
            !Number.isSafeInteger(member.version) ||
            (member.version as number) < 1
          )
            throw new Error('partner_administration_unavailable')
          return {
            grantId: member.grantId,
            role: member.role as OwnerTeamInviteRole,
            displayName: member.displayName,
            version: member.version as number,
          }
        }),
      }
    },
    async revokeStoreTeamAccess(input): Promise<void> {
      const reason = input.reason.trim()
      if (
        !uuid.test(input.storeId) ||
        !uuid.test(input.grantId) ||
        !Number.isSafeInteger(input.expectedVersion) ||
        input.expectedVersion < 1 ||
        !idempotencyKey.test(input.idempotencyKey) ||
        !reason ||
        [...reason].length > 240 ||
        [...reason].some((character) => {
          const code = character.codePointAt(0) ?? 0
          return code <= 31 || (code >= 127 && code <= 159)
        })
      )
        throw new Error('partner_administration_unavailable')
      const result = await transport.rpc('owner_admin_team_revoke', {
        p_store_id: input.storeId,
        p_grant_id: input.grantId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason: reason,
      })
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new Error('partner_administration_unavailable')
      const response = result as Record<string, unknown>
      if (
        response.state === 'conflict' &&
        Number.isSafeInteger(response.version) &&
        Number(response.version) > 0
      )
        throw new Error(`Store team access changed. Current version: ${response.version}.`)
      if (
        response.state !== 'revoked' ||
        !Number.isSafeInteger(response.version) ||
        Number(response.version) < 1
      )
        throw new Error('partner_administration_unavailable')
    },
    async decide(input: {
      operation: PartnerAdminOperation
      claimId: string
      expectedVersion: number
      idempotencyKey: string
      reasonCode: string
      transferFromClaimId?: string
      confirmedStoreId?: string
    }): Promise<PartnerAdminCase> {
      if (input.operation === 'approve_owner') {
        if (!transport.ownerApprovalAvailable || !input.confirmedStoreId)
          throw new Error('partner_administration_unavailable')
        await transport.rpc('owner_admin_approve_claim', {
          p_claim_id: input.claimId,
          p_store_id: input.confirmedStoreId,
          p_expected_version: input.expectedVersion,
          p_idempotency_key: input.idempotencyKey,
        })
        return transport.rpc('partner_admin_claim_case', {
          p_claim_id: input.claimId,
        }) as Promise<PartnerAdminCase>
      }
      return transport.rpc('partner_admin_claim_command', {
        p_operation: input.operation,
        p_claim_id: input.claimId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason_code: input.reasonCode,
        p_transfer_from_claim_id: input.transferFromClaimId ?? null,
      }) as Promise<PartnerAdminCase>
    },
    issueSyntheticInvitation(input) {
      if (!transport.edge) return Promise.reject(new Error('partner_invitation_unavailable'))
      return transport.edge('partner-admin-invitation', {
        email: input.email,
        idempotencyKey: input.idempotencyKey,
      }) as Promise<SyntheticPartnerInvitation>
    },
    verifySignal(input) {
      return transport.rpc('partner_admin_signal_command', {
        p_operation: input.operation,
        p_claim_id: input.claimId,
        p_signal_id: input.signalId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason_code: input.reasonCode,
      }) as Promise<PartnerAdminCase>
    },
  }
}

export const unavailablePartnerAdminClient: PartnerAdminClient = {
  getCase: async () => Promise.reject(new Error('partner_administration_unavailable')),
  listStoreTeam: async () => Promise.reject(new Error('partner_administration_unavailable')),
  revokeStoreTeamAccess: async () =>
    Promise.reject(new Error('partner_administration_unavailable')),
  decide: async () => Promise.reject(new Error('partner_administration_unavailable')),
  issueSyntheticInvitation: async () =>
    Promise.reject(new Error('partner_administration_unavailable')),
  verifySignal: async () => Promise.reject(new Error('partner_administration_unavailable')),
}
