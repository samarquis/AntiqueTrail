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
  async resumeInvitation() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async getConsentStatus() {
    throw new Error(GENERIC_PARTNER_ERROR)
  },
  async acceptMaterialTerms() {
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

export interface PartnerResumeState {
  resumeHandle: string
  consentAttemptId: string
}

const PARTNER_RESUME_KEY = 'antique-trail.partner-resume'

export function loadPartnerResume(storage: Pick<Storage, 'getItem'>): PartnerResumeState | null {
  try {
    const parsed = JSON.parse(storage.getItem(PARTNER_RESUME_KEY) ?? 'null') as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Record<string, unknown>
    if (
      typeof value.resumeHandle !== 'string' ||
      value.resumeHandle.length < 16 ||
      value.resumeHandle.length > 2048 ||
      typeof value.consentAttemptId !== 'string' ||
      value.consentAttemptId.length < 16 ||
      value.consentAttemptId.length > 128
    )
      return null
    return { resumeHandle: value.resumeHandle, consentAttemptId: value.consentAttemptId }
  } catch {
    return null
  }
}

export function savePartnerResume(
  storage: Pick<Storage, 'setItem'>,
  value: PartnerResumeState,
): void {
  storage.setItem(PARTNER_RESUME_KEY, JSON.stringify(value))
}

export function clearPartnerResume(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(PARTNER_RESUME_KEY)
}
