export type DeviceProofPurpose = 'grant-v1' | 'go-v1'

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('invalid proof')
  const binary = atob(
    value
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '='),
  )
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function base64Url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function deviceKeyId(publicKey: JsonWebKey): Promise<string> {
  if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || !publicKey.x || !publicKey.y)
    throw new Error('invalid device key')
  const canonical = JSON.stringify({ crv: 'P-256', kty: 'EC', x: publicKey.x, y: publicKey.y })
  return `device-key-${base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)))}`
}

export async function verifyDeviceProof(input: {
  publicKey: JsonWebKey
  deviceKeyId: string
  purpose: DeviceProofPurpose
  fields: readonly (string | number)[]
  issuedAt: string
  nonce: string
  signature: string
  now?: number
}): Promise<boolean> {
  try {
    if ((await deviceKeyId(input.publicKey)) !== input.deviceKeyId) return false
    const issued = Date.parse(input.issuedAt)
    if (!Number.isFinite(issued) || Math.abs((input.now ?? Date.now()) - issued) > 5 * 60_000)
      return false
    if (!/^[0-9a-f-]{36}$/u.test(input.nonce)) return false
    const key = await crypto.subtle.importKey(
      'jwk',
      input.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const bytes = new TextEncoder().encode(
      JSON.stringify([
        input.purpose,
        ...input.fields,
        input.deviceKeyId,
        input.issuedAt,
        input.nonce,
      ]),
    )
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      decodeBase64Url(input.signature),
      bytes,
    )
  } catch {
    return false
  }
}
