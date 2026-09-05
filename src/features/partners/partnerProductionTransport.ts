import type { PartnerApiTransport } from './partnerApi'

const SAFE_RPC_OPERATIONS = new Set(['get_status', 'save_draft', 'submit_draft', 'withdraw'])

const CONSENT_OPERATIONS = new Set(['get_consent_status', 'accept_material_terms'])

const EMAIL_PROVIDER_OPERATIONS = new Set([
  'exchange_invitation',
  'resume_invitation',
  'accept_consent',
  'bind_identity',
  'submit_authority_signal',
])

export function createPartnerProductionTransport(input: {
  rpc<T>(command: string, payload: Readonly<Record<string, unknown>>): Promise<T>
  edge<T>(command: string, payload: Readonly<Record<string, unknown>>): Promise<T>
  emailProviderEnabled: boolean
  mediaProviderEnabled: boolean
  syntheticEnabled: boolean
}): PartnerApiTransport {
  return {
    async post(operation, payload) {
      if (operation === 'withdraw_claim' || operation === 'request_authority_recheck') {
        return input.rpc('public_listing_claim_action', {
          p_operation: operation === 'withdraw_claim' ? 'withdraw' : 'recheck',
          p_claim_id: payload.claimId,
        })
      }
      if (operation === 'submit_claim') {
        return input.rpc('public_listing_claim_command', {
          p_operation: 'start',
          p_payload: payload.draft,
        })
      }
      if (operation === 'get_claim_status') {
        return input.rpc('public_listing_claim_status', { p_claim_id: null })
      }
      if (CONSENT_OPERATIONS.has(operation)) {
        return input.rpc('partner_consent_command', {
          p_operation: operation,
          p_payload: payload,
        })
      }
      if (SAFE_RPC_OPERATIONS.has(operation)) {
        return input.rpc('partner_safe_command', { p_operation: operation, p_payload: payload })
      }
      if (EMAIL_PROVIDER_OPERATIONS.has(operation)) {
        if (operation === 'submit_authority_signal') {
          return input.edge('partner-provider-command', {
            operation,
            payload,
            synthetic: input.syntheticEnabled && !input.emailProviderEnabled,
          })
        }
        if (!input.emailProviderEnabled && !input.syntheticEnabled) {
          throw new Error('partner_email_provider_unavailable')
        }
        return input.edge('partner-provider-command', {
          operation,
          payload,
          synthetic: input.syntheticEnabled && !input.emailProviderEnabled,
        })
      }
      // No current client command is allowed to smuggle media. Keep the gate
      // explicit so adding media later cannot silently bypass M-01.
      if (!input.mediaProviderEnabled) throw new Error('partner_media_provider_unavailable')
      throw new Error('partner_operation_unavailable')
    },
  }
}
