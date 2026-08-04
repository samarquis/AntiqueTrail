export interface PartnerAdminInvitationResult {
  invitationId: string
  token: string
  expiresAt: string
}

export interface PartnerAdminInvitationDependencies {
  syntheticEnabled: boolean
  appOrigin?: string
  emailHmacSecret?: string
  hmacKeyVersion: number
  issue(input: {
    authorization: string
    recipientEmailHmac: string
    hmacKeyVersion: number
    idempotencyKey: string
  }): Promise<PartnerAdminInvitationResult>
}

const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handlePartnerAdminInvitation(
  request: Request,
  dependencies: PartnerAdminInvitationDependencies,
): Promise<Response> {
  const cors = partnerCors(request, dependencies.appOrigin)
  if (request.method === 'OPTIONS') return partnerPreflight(cors)
  if (!cors.allowed) return unavailable(cors.headers, 403)
  if (request.method !== 'POST' || !dependencies.syntheticEnabled) return unavailable(cors.headers)
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || !dependencies.emailHmacSecret)
    return unavailable(cors.headers)
  try {
    const body = (await request.json()) as { email?: unknown; idempotencyKey?: unknown }
    if (
      typeof body.email !== 'string' ||
      typeof body.idempotencyKey !== 'string' ||
      !emailPattern.test(body.email.trim()) ||
      !idempotencyPattern.test(body.idempotencyKey) ||
      dependencies.hmacKeyVersion < 1
    )
      return unavailable(cors.headers)
    const recipientEmailHmac = `\\x${await hmacHex(
      normalizeEmail(body.email),
      dependencies.emailHmacSecret,
    )}`
    const result = await dependencies.issue({
      authorization,
      recipientEmailHmac,
      hmacKeyVersion: dependencies.hmacKeyVersion,
      idempotencyKey: body.idempotencyKey,
    })
    return Response.json(result, {
      headers: cors.headers,
    })
  } catch {
    return unavailable(cors.headers)
  }
}

function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLocaleLowerCase()
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const bytes = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    bytes.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode(value)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function unavailable(headers: Record<string, string>, status = 503) {
  return new Response('Unavailable', {
    status,
    headers,
  })
}
// @ts-expect-error Deno Edge imports require an explicit TypeScript extension.
import { partnerCors, partnerPreflight } from './partner-cors.ts'
