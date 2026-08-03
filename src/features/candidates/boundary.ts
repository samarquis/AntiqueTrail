import type { CandidateLink, CandidateShare, GenericShareEnvelope, TripIdea } from './types'

export const GENERIC_SHARE_MESSAGE = 'If the recipient can receive this share, it will appear in their inbox.'
export const GENERIC_CANDIDATE_FAILURE = 'This item is not available.'

export function normalizeRecipientEmail(email: string): string {
  return email.normalize('NFKC').trim().toLocaleLowerCase()
}

/** HMAC is supplied by the server/provider boundary; raw email never travels in a share record. */
export async function recipientEmailHmac(email: string, hmac: (normalizedEmail: string) => Promise<string>): Promise<string> {
  return hmac(normalizeRecipientEmail(email))
}

export function normalizeCandidateUrl(raw: string): { url: string; host: string } | null {
  try {
    const parsed = new URL(raw.trim())
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    const host = parsed.hostname.toLocaleLowerCase()
    if (!host || host === 'localhost' || host.endsWith('.localhost') || isPrivateIp(host)) return null
    parsed.hash = ''
    return { url: parsed.toString(), host }
  } catch {
    return null
  }
}

function isPrivateIp(host: string): boolean {
  if (/^(?:127|10|192\.168)\./.test(host) || /^169\.254\./.test(host)) return true
  const match = /^172\.(\d+)\./.exec(host)
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
}

export function isCandidateOwner(userId: string | null | undefined, candidate: CandidateLink): boolean {
  return Boolean(userId && candidate.ownerUserId === userId)
}

export function canReadShare(userId: string | null | undefined, share: CandidateShare, now = Date.now()): boolean {
  if (!userId || share.state === 'closed' || share.expiresAt <= now) return false
  return share.senderId === userId || share.recipientId === userId
}

export function senderShareView(userId: string | null | undefined, share: CandidateShare, now = Date.now()): GenericShareEnvelope | null {
  if (!userId || share.senderId !== userId) return null
  if (share.state === 'accepted') return { accepted: true, state: 'accepted', message: 'Accepted' }
  if (share.state === 'pending' && share.expiresAt > now) return { accepted: false, state: 'pending', message: 'Pending' }
  return { accepted: false, state: 'closed', message: 'Closed' }
}

export function recipientShareView(userId: string | null | undefined, share: CandidateShare, now = Date.now()): GenericShareEnvelope {
  if (!canReadShare(userId, share, now) || share.recipientId !== userId) return { accepted: false, state: 'closed', message: GENERIC_CANDIDATE_FAILURE }
  return share.state === 'accepted' ? { accepted: true, state: 'accepted', message: 'Accepted' } : { accepted: false, state: 'pending', message: 'Pending' }
}

export function canEditTripIdea(userId: string | null | undefined, idea: TripIdea): boolean {
  return Boolean(userId && idea.ownerUserId === userId)
}

export class IdempotencyLedger<T> {
  #entries = new Map<string, { fingerprint: string; result: T }>()

  execute(key: string, input: unknown, operation: () => T): T {
    const fingerprint = JSON.stringify(input)
    const prior = this.#entries.get(key)
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new Error('idempotency_mismatch')
      return prior.result
    }
    const result = operation()
    this.#entries.set(key, { fingerprint, result })
    return result
  }
}

