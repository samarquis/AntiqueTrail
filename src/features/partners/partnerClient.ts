import type { PartnerClient } from './types'

export const GENERIC_PARTNER_ERROR =
  "We couldn't continue this invitation. Check the link or try again."
export const EMAIL_GATE_MESSAGE =
  'Email verification is unavailable until the approved email provider gate passes.'

export function normalizePartnerEmail(email: string): string {
  return email.normalize('NFKC').trim().toLocaleLowerCase()
}

export const unavailablePartnerClient: PartnerClient = {
  async exchangeInvitation() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async acceptConsent() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async bindIdentity() {
    throw new Error(EMAIL_GATE_MESSAGE)
  },
  async getStatus() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async saveDraft() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async submitDraft() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async withdraw() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async submitClaim() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async getClaimStatus() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async submitAuthoritySignal() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async withdrawClaim() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async requestAuthorityRecheck() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
}

/** Reads one opaque fragment once. The raw value must never be rendered, logged, or persisted. */
export function readInvitationToken(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const token = params.get('token')
  return token && token.length >= 16 && token.length <= 2048 ? token : null
}

export function scrubInvitationUrl(
  history: Pick<History, 'replaceState'>,
  kind = '/partner/join',
): void {
  history.replaceState({}, '', kind)
}
