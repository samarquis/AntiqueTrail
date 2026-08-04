import type { PartnerClaimState } from './types'

export type PartnerAdminOperation =
  | 'changes'
  | 'conflict'
  | 'approve'
  | 'reject'
  | 'revoke'
  | 'recheck'
  | 'transfer'

export interface PartnerAdminCase {
  claimId: string
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

export interface PartnerAdminTransport {
  rpc(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>
  edge?(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>
}

export interface SyntheticPartnerInvitation {
  invitationId: string
  token: string
  expiresAt: string
}

export interface PartnerAdminClient {
  getCase(claimId: string): Promise<PartnerAdminCase>
  decide(input: {
    operation: PartnerAdminOperation
    claimId: string
    expectedVersion: number
    idempotencyKey: string
    reasonCode: string
    transferFromClaimId?: string
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
    getCase(claimId: string): Promise<PartnerAdminCase> {
      return transport.rpc('partner_admin_claim_case', {
        p_claim_id: claimId,
      }) as Promise<PartnerAdminCase>
    },
    decide(input: {
      operation: PartnerAdminOperation
      claimId: string
      expectedVersion: number
      idempotencyKey: string
      reasonCode: string
      transferFromClaimId?: string
    }): Promise<PartnerAdminCase> {
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
  decide: async () => Promise.reject(new Error('partner_administration_unavailable')),
  issueSyntheticInvitation: async () =>
    Promise.reject(new Error('partner_administration_unavailable')),
  verifySignal: async () => Promise.reject(new Error('partner_administration_unavailable')),
}
