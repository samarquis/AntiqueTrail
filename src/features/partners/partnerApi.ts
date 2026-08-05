import { GENERIC_PARTNER_ERROR } from './partnerClient'
import type {
  PartnerClaimStatus,
  PartnerClient,
  PartnerConsentStatus,
  PartnerInvitation,
  PartnerStatus,
} from './types'

type PartnerOperation =
  | 'exchange_invitation'
  | 'resume_invitation'
  | 'accept_consent'
  | 'get_consent_status'
  | 'accept_material_terms'
  | 'bind_identity'
  | 'get_status'
  | 'save_draft'
  | 'submit_draft'
  | 'withdraw'
  | 'submit_claim'
  | 'get_claim_status'
  | 'submit_authority_signal'
  | 'withdraw_claim'
  | 'request_authority_recheck'

export interface PartnerApiTransport {
  post(operation: PartnerOperation, payload: Readonly<Record<string, unknown>>): Promise<unknown>
}

export class PartnerApiError extends Error {
  constructor() {
    super(GENERIC_PARTNER_ERROR)
    this.name = 'PartnerApiError'
  }
}

/**
 * Bounded application-service adapter. Authentication and actor identity belong
 * to the transport session; callers cannot submit arbitrary user identifiers.
 */
export function createPartnerClient(transport: PartnerApiTransport): PartnerClient {
  async function post<T>(
    operation: PartnerOperation,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    try {
      return (await transport.post(operation, payload)) as T
    } catch {
      throw new PartnerApiError()
    }
  }

  return {
    exchangeInvitation: (token) => post<PartnerInvitation>('exchange_invitation', { token }),
    resumeInvitation: (resumeHandle) =>
      post<PartnerInvitation>('resume_invitation', { resumeHandle }),
    acceptConsent: (input) => post<PartnerStatus>('accept_consent', { ...input }),
    getConsentStatus: () => post<PartnerConsentStatus>('get_consent_status', {}),
    acceptMaterialTerms: (input) =>
      post<PartnerConsentStatus>('accept_material_terms', { ...input }),
    bindIdentity: () => post<PartnerStatus>('bind_identity', {}),
    getStatus: () => post<PartnerStatus>('get_status', {}),
    saveDraft: (draft) => post<PartnerStatus>('save_draft', { draft }),
    submitDraft: () => post<PartnerStatus>('submit_draft', {}),
    withdraw: () => post<PartnerStatus>('withdraw', {}),
    submitClaim: (draft) => post<PartnerClaimStatus>('submit_claim', { draft }),
    getClaimStatus: () => post<PartnerClaimStatus | null>('get_claim_status', {}),
    submitAuthoritySignal: (input) =>
      post<PartnerClaimStatus>('submit_authority_signal', { input }),
    withdrawClaim: (claimId) => post<PartnerClaimStatus>('withdraw_claim', { claimId }),
    requestAuthorityRecheck: (claimId) =>
      post<PartnerClaimStatus>('request_authority_recheck', { claimId }),
  }
}
