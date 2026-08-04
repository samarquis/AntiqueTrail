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
}

export interface PartnerAdminTransport {
  rpc(command: string, payload: Readonly<Record<string, unknown>>): Promise<unknown>
}

export function createPartnerAdminClient(transport: PartnerAdminTransport) {
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
  }
}
