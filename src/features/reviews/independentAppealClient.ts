export interface IndependentAppealPacket {
  caseId: string
  appealId: string
  reviewId: string
  store: { name: string; town: string; stateCode: string; areaLabel: string }
  reviewText: string
  rule: string
  priorDecision: 'hold' | 'remove'
  appealText: string
  evidence: Array<{ kind: string; value: string }>
  packetHash: string
  state: 'ready' | 'restored' | 'upheld' | 'expired' | 'revoked' | 'consumed'
  outcome?: 'restore' | 'uphold'
}

export interface IndependentAppealAssertionOptions {
  challengeId: string
  challenge: string
  rpId: string
  origin: string
  expiresAt: string
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>
}

export interface IndependentAppealBrowserCeremony {
  credentialId: string
  clientDataJSON: string
  authenticatorData: string
  signature: string
  userHandle?: string
}

export interface IndependentAppealTransport {
  execute(command: IndependentAppealCommand): Promise<unknown>
}

export type IndependentAppealCommand =
  | { operation: 'request_assertion'; payload: { capabilityToken: string; idempotencyKey: string } }
  | {
      operation: 'complete_assertion'
      payload: {
        challengeId: string
        idempotencyKey: string
        ceremony: IndependentAppealBrowserCeremony
      }
    }
  | {
      operation: 'packet'
      payload: { capabilityToken: string; assertionReceiptId: string }
    }
  | {
      operation: 'submit'
      payload: {
        capabilityToken: string
        assertionReceiptId: string
        packetHash: string
        outcome: 'restore' | 'uphold'
        reason: string
        idempotencyKey: string
      }
    }

export function createIndependentAppealClient(transport: IndependentAppealTransport) {
  return {
    requestAssertion: (capabilityToken: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_assertion',
        payload: { capabilityToken, idempotencyKey },
      }) as Promise<IndependentAppealAssertionOptions>,
    completeAssertion: (
      challengeId: string,
      idempotencyKey: string,
      ceremony: IndependentAppealBrowserCeremony,
    ) =>
      transport.execute({
        operation: 'complete_assertion',
        payload: { challengeId, idempotencyKey, ceremony },
      }) as Promise<{ assertionReceiptId: string; expiresAt: string }>,
    getPacket: (capabilityToken: string, assertionReceiptId: string) =>
      transport.execute({
        operation: 'packet',
        payload: { capabilityToken, assertionReceiptId },
      }) as Promise<IndependentAppealPacket>,
    submit: (payload: Extract<IndependentAppealCommand, { operation: 'submit' }>['payload']) =>
      transport.execute({ operation: 'submit', payload }) as Promise<IndependentAppealPacket>,
  }
}

const TOKEN = /^[A-Za-z0-9_-]{32,512}$/u

export function readIndependentAppealToken(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const token = new URLSearchParams(raw).get('token')
  return token && TOKEN.test(token) ? token : null
}

export function preflightIndependentAppeal(
  location: Pick<Location, 'pathname' | 'hash'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
  documentRoot: Document = document,
): string | null {
  if (location.pathname !== '/appeal-review') return null
  const token = readIndependentAppealToken(location.hash)
  history.replaceState(null, '', location.pathname)
  for (const [name, content] of [
    ['referrer', 'no-referrer'],
    ['cache-control', 'private, no-store'],
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
