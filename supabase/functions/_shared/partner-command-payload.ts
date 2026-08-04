export async function prepareSyntheticPartnerPayload(
  operation: string,
  payload: Readonly<Record<string, unknown>>,
  secrets: { emailHmacSecret?: string; evidenceHmacSecret?: string },
): Promise<Record<string, unknown>> {
  const safe: Record<string, unknown> = { ...payload, synthetic: true }
  if (operation === 'accept_consent') {
    const identity = payload.identity as { email?: unknown } | undefined
    if (!secrets.emailHmacSecret || typeof identity?.email !== 'string')
      throw new Error('unavailable')
    safe.emailHmac = await hmacHex(normalize(identity.email), secrets.emailHmacSecret)
  }
  if (operation === 'submit_authority_signal') {
    const input = payload.input as Record<string, unknown> | undefined
    if (!secrets.evidenceHmacSecret || typeof input?.evidenceReference !== 'string')
      throw new Error('unavailable')
    const { evidenceReference, ...bounded } = input
    safe.input = {
      ...bounded,
      evidenceRefHmac: await hmacHex(normalize(evidenceReference), secrets.evidenceHmacSecret),
    }
  }
  return safe
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
