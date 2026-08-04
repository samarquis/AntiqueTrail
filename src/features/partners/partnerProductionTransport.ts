import type { PartnerApiTransport } from './partnerApi'

const SAFE_RPC_OPERATIONS = new Set([
  'get_status',
  'save_draft',
  'submit_draft',
  'withdraw',
  'submit_claim',
  'get_claim_status',
  'withdraw_claim',
])

const EMAIL_PROVIDER_OPERATIONS = new Set([
  'exchange_invitation',
  'accept_consent',
  'bind_identity',
  'submit_authority_signal',
  'request_authority_recheck',
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
      if (SAFE_RPC_OPERATIONS.has(operation)) {
        return input.rpc('partner_safe_command', { p_operation: operation, p_payload: payload })
      }
      if (EMAIL_PROVIDER_OPERATIONS.has(operation)) {
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
