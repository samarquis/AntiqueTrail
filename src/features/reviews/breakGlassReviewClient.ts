export interface BreakGlassPacket {
  incidentId: string
  severity: string
  requestingActor: string
  approvals: string[]
  reason: string
  authorizedScope: string
  queries: string[]
  recordCounts: number[]
  startedAt: string
  expiresAt: string
  accessResults: string[]
  noticeStatus: string
  auditChainHash: string
  packetHash: string
  reviewDueAt: string
}

export interface BreakGlassChallenge {
  challengeId: string
  challenge: string
  rpId: string
  origin: string
  expiresAt: string
}

export interface BreakGlassReviewTransport {
  execute(command: BreakGlassReviewCommand): Promise<unknown>
}

export type BreakGlassBrowserCeremony = {
  credentialId: string
  clientDataJSON: string
  authenticatorData: string
  signature: string
  userHandle?: string
}

export type BreakGlassReviewCommand =
  | { operation: 'packet'; payload: { capabilityToken: string } }
  | { operation: 'request_assertion'; payload: { capabilityToken: string; idempotencyKey: string } }
  | {
      operation: 'complete_assertion'
      payload: { challengeId: string; idempotencyKey: string; ceremony: BreakGlassBrowserCeremony }
    }
  | {
      operation: 'submit'
      payload: {
        capabilityToken: string
        assertionReceiptId: string
        packetHash: string
        decision: 'Compliant' | 'Exception'
        reason: string
        followUpReference: string
        idempotencyKey: string
      }
    }

export function createBreakGlassReviewClient(transport: BreakGlassReviewTransport) {
  return {
    getPacket: (capabilityToken: string) =>
      transport.execute({ operation: 'packet', payload: { capabilityToken } }),
    requestAssertion: (capabilityToken: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_assertion',
        payload: { capabilityToken, idempotencyKey },
      }),
    completeAssertion: (
      challengeId: string,
      idempotencyKey: string,
      ceremony: BreakGlassBrowserCeremony,
    ) =>
      transport.execute({
        operation: 'complete_assertion',
        payload: { challengeId, idempotencyKey, ceremony },
      }),
    submit: (payload: Extract<BreakGlassReviewCommand, { operation: 'submit' }>['payload']) =>
      transport.execute({ operation: 'submit', payload }),
  }
}

export function readBreakGlassToken(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const token = new URLSearchParams(raw).get('token')
  return token && /^[A-Za-z0-9_-]{32,512}$/u.test(token) ? token : null
}

export function preflightBreakGlassReview(
  location: Pick<Location, 'pathname' | 'hash'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
  documentRoot: Document = document,
): string | null {
  if (location.pathname !== '/break-glass-review') return null
  const token = readBreakGlassToken(location.hash)
  history.replaceState(null, '', location.pathname)
  for (const [name, content] of [
    ['referrer', 'no-referrer'],
    ['cache-control', 'no-store'],
  ] as const) {
    let meta = documentRoot.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
    if (!meta) {
      meta = documentRoot.createElement('meta')
      meta.name = name
      documentRoot.head.prepend(meta)
    }
    meta.content = content
  }
  return token
}
