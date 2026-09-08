import type { ReviewerBrowserCeremony } from '../../../supabase/functions/_shared/reviewer-credentials'

const TOKEN = /^[A-Za-z0-9_-]{32,512}$/u

export interface ReviewerAllowCredential {
  id: string
  type: 'public-key'
  transports?: AuthenticatorTransport[]
}

export interface ReviewerCredentialChallenge {
  challengeId: string
  challenge: string
  rpId: string
  origin: string
  expiresAt: string
  state: 'pending' | 'consumed'
  allowCredentials: ReviewerAllowCredential[]
  registrationCompletedCount?: number
  registrationTargetCount?: number
}

export interface ReviewerCredentialBrowserApi {
  create(options: CredentialCreationOptions): Promise<Credential | null>
  get(options: CredentialRequestOptions): Promise<Credential | null>
}

const browserApi: ReviewerCredentialBrowserApi = {
  create: (options) => navigator.credentials.create(options),
  get: (options) => navigator.credentials.get(options),
}

function bytesFromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(value)) throw new Error('reviewer credential unavailable')
  return Uint8Array.from(value.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)))
}

function bytesFromBase64Url(value: string): Uint8Array {
  if (!TOKEN.test(value) && !/^[A-Za-z0-9_-]{1,8192}$/u.test(value))
    throw new Error('reviewer credential unavailable')
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

function base64Url(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

function challenge(value: unknown): ReviewerCredentialChallenge {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('reviewer credential unavailable')
  const candidate = value as Partial<ReviewerCredentialChallenge>
  if (
    typeof candidate.challengeId !== 'string' ||
    typeof candidate.challenge !== 'string' ||
    typeof candidate.rpId !== 'string' ||
    typeof candidate.origin !== 'string' ||
    typeof candidate.expiresAt !== 'string' ||
    (candidate.state !== 'pending' && candidate.state !== 'consumed') ||
    !Array.isArray(candidate.allowCredentials)
  )
    throw new Error('reviewer credential unavailable')
  const allowCredentials = candidate.allowCredentials.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string')
      throw new Error('reviewer credential unavailable')
    const item = entry as ReviewerAllowCredential
    if (item.type !== 'public-key' || (item.transports && !Array.isArray(item.transports)))
      throw new Error('reviewer credential unavailable')
    return item
  })
  return { ...candidate, allowCredentials } as ReviewerCredentialChallenge
}

export async function createReviewerBrowserCeremony(
  rawChallenge: unknown,
  ceremony: 'registration' | 'assertion',
  api: ReviewerCredentialBrowserApi = browserApi,
): Promise<ReviewerBrowserCeremony> {
  const value = challenge(rawChallenge)
  if (value.state !== 'pending' || value.origin !== window.location.origin)
    throw new Error('reviewer credential unavailable')
  const publicKey: PublicKeyCredentialCreationOptions | PublicKeyCredentialRequestOptions =
    ceremony === 'registration'
      ? {
          challenge: bytesFromHex(value.challenge),
          rp: { id: value.rpId, name: 'Antique Trail' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(32)),
            name: 'independent-reviewer',
            displayName: 'Independent reviewer',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: 'discouraged',
            requireResidentKey: false,
            userVerification: 'required',
          },
          attestation: 'none',
          timeout: 300_000,
        }
      : {
          challenge: bytesFromHex(value.challenge),
          rpId: value.rpId,
          allowCredentials: value.allowCredentials.map((credential) => ({
            id: bytesFromBase64Url(credential.id),
            type: 'public-key',
            ...(credential.transports ? { transports: credential.transports } : {}),
          })),
          userVerification: 'required',
          timeout: 300_000,
        }
  if (ceremony === 'assertion' && value.allowCredentials.length === 0)
    throw new Error('reviewer credential unavailable')
  const credential =
    ceremony === 'registration'
      ? await api.create({ publicKey: publicKey as PublicKeyCredentialCreationOptions })
      : await api.get({ publicKey: publicKey as PublicKeyCredentialRequestOptions })
  if (!(credential instanceof PublicKeyCredential))
    throw new Error('reviewer credential unavailable')
  if (ceremony === 'registration') {
    const response = credential.response
    if (!(response instanceof AuthenticatorAttestationResponse) || !response.attestationObject)
      throw new Error('reviewer credential unavailable')
    return {
      credentialId: base64Url(credential.rawId),
      clientDataJSON: base64Url(response.clientDataJSON),
      attestationObject: base64Url(response.attestationObject),
    }
  }
  const response = credential.response
  if (!(response instanceof AuthenticatorAssertionResponse))
    throw new Error('reviewer credential unavailable')
  return {
    credentialId: base64Url(credential.rawId),
    clientDataJSON: base64Url(response.clientDataJSON),
    authenticatorData: base64Url(response.authenticatorData),
    signature: base64Url(response.signature),
    ...(response.userHandle ? { userHandle: base64Url(response.userHandle) } : {}),
  }
}

export function readReviewerCapabilityToken(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('token')
  return token && TOKEN.test(token) ? token : null
}

let pendingReviewerCapability: string | null = null

export function preflightReviewerCapability(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
  documentRoot: Document = document,
): string | null {
  if (
    !['/reviewer/setup', '/reviewer/credentials', '/reviewer/recover'].includes(location.pathname)
  )
    return null
  pendingReviewerCapability = readReviewerCapabilityToken(location.hash)
  history.replaceState(null, '', `${location.pathname}${location.search}`)
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
  return pendingReviewerCapability
}

export function takePreflightReviewerCapability(): string | null {
  const token = pendingReviewerCapability
  pendingReviewerCapability = null
  return token
}
