// Self-contained: source generation serializes this exact tested factory.
export async function createCatalogCustodyHandler(config, options = {}) {
  const invalid = () => {
    throw new Error('Invalid public custody configuration')
  }
  const now = options.now ?? (() => Date.now())
  const getEnv = options.getEnv ?? ((name) => globalThis.Deno?.env.get(name))
  const keys = ['publicJwk', 'operationNonce', 'projectRef', 'issuedAt', 'expiresAt']
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).length !== keys.length ||
    Object.keys(config).some((key) => !keys.includes(key))
  )
    invalid()
  const { operationNonce, projectRef, issuedAt, expiresAt, publicJwk } = config
  const current = now()
  if (
    projectRef !== 'uaupykgpegbseboklubv' ||
    typeof operationNonce !== 'string' ||
    !/^[a-f0-9]{64}$/.test(operationNonce) ||
    ![issuedAt, expiresAt, current].every(Number.isSafeInteger) ||
    issuedAt > current ||
    expiresAt <= current ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > 30 * 60 * 1000
  )
    invalid()
  const allowedJwk = ['kty', 'n', 'e', 'alg', 'key_ops', 'ext']
  if (
    !publicJwk ||
    typeof publicJwk !== 'object' ||
    Array.isArray(publicJwk) ||
    Object.keys(publicJwk).some((key) => !allowedJwk.includes(key)) ||
    publicJwk.kty !== 'RSA' ||
    typeof publicJwk.n !== 'string' ||
    !/^[A-Za-z0-9_-]{683}$/.test(publicJwk.n) ||
    publicJwk.e !== 'AQAB' ||
    (publicJwk.alg !== undefined && publicJwk.alg !== 'RSA-OAEP-256') ||
    (publicJwk.ext !== undefined && publicJwk.ext !== true) ||
    (publicJwk.key_ops !== undefined &&
      (!Array.isArray(publicJwk.key_ops) ||
        publicJwk.key_ops.length !== 1 ||
        publicJwk.key_ops[0] !== 'encrypt'))
  )
    invalid()
  let recipient
  const recipientJwk = { kty: 'RSA', n: publicJwk.n, e: 'AQAB' }
  const encoder = new globalThis.TextEncoder()
  try {
    const modulus = globalThis.atob(publicJwk.n.replaceAll('-', '+').replaceAll('_', '/'))
    if (
      modulus.length !== 512 ||
      !(modulus.charCodeAt(0) & 128) ||
      globalThis.btoa(modulus).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !==
        publicJwk.n
    )
      invalid()
    recipient = await globalThis.crypto.subtle.importKey(
      'jwk',
      recipientJwk,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    )
  } catch {
    invalid()
  }
  const recipientHash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(recipientJwk))),
  )
  const recipientSha256 = Array.from(recipientHash, (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
  const metadata = {
    schemaVersion: 1,
    algorithm: 'RSA-OAEP-256/A256GCM',
    projectRef,
    operationNonce,
    recipientSha256,
    issuedAt,
    expiresAt,
  }
  const aad = encoder.encode(JSON.stringify(metadata))
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }
  const denied = () => new globalThis.Response('{"error":"denied"}', { status: 403, headers })
  const active = () => {
    const time = now()
    return Number.isSafeInteger(time) && time >= issuedAt && time < expiresAt
  }
  const base64 = (bytes) => globalThis.btoa(String.fromCharCode(...new Uint8Array(bytes)))
  let consumed = false
  return async (request) => {
    try {
      if (
        request.method !== 'POST' ||
        request.headers.has('origin') ||
        consumed ||
        !active() ||
        request.headers.get('x-catalog-custody-nonce') !== operationNonce
      )
        return denied()
      const authorization = request.headers.get('authorization')
      if (typeof authorization !== 'string' || authorization.length > 8199) return denied()
      const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
      if (
        typeof serviceKey !== 'string' ||
        serviceKey.length === 0 ||
        serviceKey.length > 8192 ||
        getEnv('SUPABASE_URL') !== `https://${projectRef}.supabase.co`
      )
        return denied()
      const supplied = new Uint8Array(
        await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(authorization)),
      )
      const expected = new Uint8Array(
        await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${serviceKey}`)),
      )
      let difference = 0
      for (let index = 0; index < 32; index += 1) difference |= supplied[index] ^ expected[index]
      if (difference !== 0 || consumed || !active()) return denied()
      // One export per isolate; operator must invoke once and delete the endpoint globally.
      consumed = true
      const values = {}
      for (const name of ['PUBLIC_CATALOG_GATEWAY_JWT', 'PUBLIC_CATALOG_RATE_SALT']) {
        const value = getEnv(name)
        if (
          typeof value !== 'string' ||
          value.length === 0 ||
          value.length > 8192 ||
          encoder.encode(value).length > 8192
        )
          return denied()
        values[name] = value
      }
      const plaintext = encoder.encode(JSON.stringify(values))
      const key = await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt'],
      )
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
      const rawKey = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key))
      try {
        const ciphertext = await globalThis.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
          key,
          plaintext,
        )
        const wrappedKey = await globalThis.crypto.subtle.encrypt(
          { name: 'RSA-OAEP', label: aad },
          recipient,
          rawKey,
        )
        if (!active()) return denied()
        return new globalThis.Response(
          JSON.stringify({
            ...metadata,
            wrappedKey: base64(wrappedKey),
            iv: base64(iv),
            ciphertext: base64(ciphertext),
          }),
          { status: 200, headers },
        )
      } finally {
        plaintext.fill(0)
        rawKey.fill(0)
      }
    } catch {
      return denied()
    }
  }
}

export async function generateCatalogCustodySource(config) {
  let publicConfig
  try {
    publicConfig = globalThis.structuredClone(config)
    await createCatalogCustodyHandler(publicConfig)
  } catch {
    throw new Error('Invalid public custody configuration')
  }
  return `Deno.serve(await (${createCatalogCustodyHandler.toString()})(${JSON.stringify(publicConfig)}));\n`
}
