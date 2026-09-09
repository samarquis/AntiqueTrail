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

/**
 * Public claim evidence is never persisted verbatim.  The caller's exact
 * listing scope remains in the database command; this helper only replaces
 * the transient reference with the server-held, purpose-keyed HMAC.
 */
export async function preparePublicClaimSignalPayload(
  payload: Readonly<Record<string, unknown>>,
  evidenceHmacSecret?: string,
): Promise<Record<string, unknown>> {
  const input = payload.input as Record<string, unknown> | undefined
  if (
    !evidenceHmacSecret ||
    typeof input?.claimId !== 'string' ||
    typeof input?.idempotencyKey !== 'string' ||
    typeof input?.channelClass !== 'string' ||
    typeof input?.evidenceReference !== 'string'
  )
    throw new Error('unavailable')
  const { evidenceReference, ...bounded } = input
  return {
    ...bounded,
    evidenceRefHmac: await hmacHex(normalize(evidenceReference), evidenceHmacSecret),
    idempotencyKey: input.idempotencyKey,
  }
}

export async function prepareStoreApplicationSignalPayload(
  payload: Readonly<Record<string, unknown>>,
  evidenceHmacSecret?: string,
): Promise<Record<string, unknown>> {
  if (!evidenceHmacSecret || typeof payload.applicationId !== 'string' || typeof payload.version !== 'number'
    || typeof payload.channelClass !== 'string' || typeof payload.evidenceReference !== 'string'
    || payload.evidenceReference.length < 1 || payload.evidenceReference.length > 500)
    throw new Error('unavailable')
  const evidenceHmac = await hmacHex(`store-application-object:${normalize(payload.evidenceReference)}`, evidenceHmacSecret)
  const result: Record<string, unknown> = {
    applicationId: payload.applicationId, version: payload.version, channelClass: payload.channelClass,
    reasonCode: payload.reasonCode, evidenceHmac,
  }
  if (typeof payload.verificationEventReference === 'string' && payload.verificationEventReference.length > 0 && payload.verificationEventReference.length <= 500) {
    const digest = await hmacHex(`store-application-event:${normalize(payload.verificationEventReference)}`, evidenceHmacSecret)
    result.verificationEventId = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`
  }
  return result
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
