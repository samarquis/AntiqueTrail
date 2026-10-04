import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { generateCatalogCustodySource } from './catalog-custody-recovery.mjs'
import { generateRecoveryEmailHmacCustodySource } from './recovery-email-hmac-custody.mjs'

const { Request, Response, TextEncoder, TextDecoder, atob, btoa, structuredClone, URL } = globalThis

const PROJECT = 'uaupykgpegbseboklubv'
const NONCE = 'a'.repeat(64)
const NOW = Date.now()
const BEARER = 'Bearer synthetic-selected-service-role-jwt'
const recipient = await webcrypto.subtle.generateKey(
  {
    name: 'RSA-OAEP',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['encrypt', 'decrypt'],
)
const config = {
  publicJwk: await webcrypto.subtle.exportKey('jwk', recipient.publicKey),
  operatorBearerSha256: createHash('sha256').update(BEARER).digest('hex'),
  operationNonce: NONCE,
  projectRef: PROJECT,
  issuedAt: NOW,
  expiresAt: NOW + 1800000,
}
const SETTINGS = {
  SUPABASE_URL: `https://${PROJECT}.supabase.co`,
  RECOVERY_EMAIL_HMAC_SECRET: 'synthetic-existing-email-hmac',
  PUBLIC_CATALOG_GATEWAY_JWT: 'synthetic-catalog-jwt-canary',
  PUBLIC_CATALOG_RATE_SALT: 'synthetic-catalog-salt-canary',
}

function request(overrides = {}) {
  return new Request('https://operator.test/email-custody', {
    method: 'POST',
    headers: { authorization: BEARER, 'x-recovery-email-hmac-custody-nonce': NONCE },
    ...overrides,
  })
}

async function fixture(value = config) {
  const source = await generateRecoveryEmailHmacCustodySource(value)
  const item = { clock: NOW, env: { ...SETTINGS }, reads: [], logs: [], egress: [] }
  await runInNewContext(`(async () => { ${source} })()`, {
    crypto: webcrypto,
    TextEncoder,
    Response,
    atob,
    btoa,
    Date: { now: () => item.clock },
    console: Object.fromEntries(
      ['log', 'warn', 'error'].map((name) => [name, (...values) => item.logs.push(values)]),
    ),
    fetch: (...values) => {
      item.egress.push(values)
      throw new Error('network prohibited')
    },
    Deno: {
      env: {
        get: (name) => {
          item.reads.push(name)
          item.onRead?.(name)
          if (item.readError === name) throw new Error('synthetic private read failure')
          return item.env[name]
        },
      },
      serve: (handler) => {
        item.handler = handler
      },
    },
  })
  return item
}

function metadata(envelope) {
  const {
    schemaVersion,
    purpose,
    algorithm,
    projectRef,
    operationNonce,
    recipientSha256,
    issuedAt,
    expiresAt,
  } = envelope
  return new TextEncoder().encode(
    JSON.stringify({
      schemaVersion,
      purpose,
      algorithm,
      projectRef,
      operationNonce,
      recipientSha256,
      issuedAt,
      expiresAt,
    }),
  )
}

async function decrypt(envelope, privateKey = recipient.privateKey) {
  const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  const aad = metadata(envelope)
  const raw = await webcrypto.subtle.decrypt(
    { name: 'RSA-OAEP', label: aad },
    privateKey,
    decode(envelope.wrappedKey),
  )
  const key = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv), additionalData: aad, tagLength: 128 },
    key,
    decode(envelope.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

test('generated email custody encrypts exactly one setting with a fixed authenticated purpose', async () => {
  const item = await fixture()
  const response = await item.handler(
    request({ body: JSON.stringify({ env: ['OTHER_SECRET'], purpose: 'catalog' }) }),
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  const body = await response.text()
  assert.equal(body.includes(SETTINGS.RECOVERY_EMAIL_HMAC_SECRET), false)
  const envelope = JSON.parse(body)
  assert.deepEqual(Object.keys(envelope), [
    'schemaVersion',
    'purpose',
    'algorithm',
    'projectRef',
    'operationNonce',
    'recipientSha256',
    'issuedAt',
    'expiresAt',
    'wrappedKey',
    'iv',
    'ciphertext',
  ])
  assert.equal(envelope.purpose, 'recovery-email-hmac-custody')
  assert.equal(
    envelope.recipientSha256,
    createHash('sha256')
      .update(JSON.stringify({ kty: 'RSA', n: config.publicJwk.n, e: 'AQAB' }))
      .digest('hex'),
  )
  assert.deepEqual(await decrypt(envelope), {
    RECOVERY_EMAIL_HMAC_SECRET: SETTINGS.RECOVERY_EMAIL_HMAC_SECRET,
  })
  assert.deepEqual(item.reads, ['SUPABASE_URL', 'RECOVERY_EMAIL_HMAC_SECRET'])
  assert.deepEqual(item.logs, [])
  assert.deepEqual(item.egress, [])
})

for (const [name, change] of [
  ['missing authorization', (item, input) => input.headers.delete('authorization')],
  [
    'anonymous bearer',
    (item, input) => input.headers.set('authorization', 'Bearer synthetic-anon'),
  ],
  [
    'wrong bearer',
    (item, input) => input.headers.set('authorization', 'Bearer synthetic-other-service-key'),
  ],
  [
    'wrong scheme',
    (item, input) => input.headers.set('authorization', BEARER.replace('Bearer', 'bearer')),
  ],
  [
    'oversized authorization',
    (item, input) => input.headers.set('authorization', 'x'.repeat(8200)),
  ],
  [
    'role claim alone',
    (item, input) =>
      input.headers.set(
        'authorization',
        'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.invalid',
      ),
  ],
  ['missing nonce', (item, input) => input.headers.delete('x-recovery-email-hmac-custody-nonce')],
  [
    'wrong nonce',
    (item, input) => input.headers.set('x-recovery-email-hmac-custody-nonce', 'b'.repeat(64)),
  ],
  [
    'catalog nonce header alone',
    (item, input) => {
      input.headers.delete('x-recovery-email-hmac-custody-nonce')
      input.headers.set('x-catalog-custody-nonce', NONCE)
    },
  ],
  ['Origin', (item, input) => input.headers.set('origin', 'https://browser.test')],
  ['empty Origin', (item, input) => input.headers.set('origin', '')],
  [
    'expiry',
    (item) => {
      item.clock = config.expiresAt
    },
  ],
  [
    'before issuance',
    (item) => {
      item.clock = config.issuedAt - 1
    },
  ],
  [
    'nonfinite runtime clock',
    (item) => {
      item.clock = Infinity
    },
  ],
  [
    'wrong project',
    (item) => {
      item.env.SUPABASE_URL = 'https://another.supabase.co'
    },
  ],
  [
    'URL with extra path',
    (item) => {
      item.env.SUPABASE_URL += '/other'
    },
  ],
  [
    'missing URL',
    (item) => {
      delete item.env.SUPABASE_URL
    },
  ],
]) {
  test(`generated ${name} request has opaque denial before HMAC read`, async () => {
    const item = await fixture()
    const input = request()
    change(item, input)
    const response = await item.handler(input)
    assert.equal(response.status, 403)
    assert.equal(await response.text(), '{"error":"denied"}')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    assert.equal(item.reads.includes('RECOVERY_EMAIL_HMAC_SECRET'), false)
    assert.equal(
      item.reads.every((name) => name === 'SUPABASE_URL'),
      true,
    )
    assert.deepEqual(item.logs, [])
    assert.deepEqual(item.egress, [])
  })
}

for (const method of ['GET', 'OPTIONS', 'PUT', 'DELETE']) {
  test(`generated ${method} request never reads environment`, async () => {
    const item = await fixture()
    const response = await item.handler(request({ method }))
    assert.equal(response.status, 403)
    assert.equal(await response.text(), '{"error":"denied"}')
    assert.deepEqual(item.reads, [])
  })
}

for (const [name, change] of [
  ...Object.keys(config).map((key) => [
    `missing ${key}`,
    (value) => {
      delete value[key]
    },
  ]),
  [
    'short operator hash',
    (value) => {
      value.operatorBearerSha256 = 'a'.repeat(63)
    },
  ],
  [
    'uppercase operator hash',
    (value) => {
      value.operatorBearerSha256 = 'A'.repeat(64)
    },
  ],
  [
    'nonhex operator hash',
    (value) => {
      value.operatorBearerSha256 = 'g'.repeat(64)
    },
  ],
  [
    'nonstring operator hash',
    (value) => {
      value.operatorBearerSha256 = 123
    },
  ],
  [
    'caller-selected secret',
    (value) => {
      value.settingName = 'OTHER_SECRET'
    },
  ],
  [
    'caller-selected purpose',
    (value) => {
      value.purpose = 'other-operation'
    },
  ],
  [
    'wrong project',
    (value) => {
      value.projectRef = 'another-project'
    },
  ],
  [
    'short nonce',
    (value) => {
      value.operationNonce = 'short'
    },
  ],
  [
    'future issuance',
    (value) => {
      value.issuedAt = NOW + 1
    },
  ],
  [
    'expired deadline',
    (value) => {
      value.expiresAt = NOW
    },
  ],
  [
    'window exceeding thirty minutes',
    (value) => {
      value.expiresAt = NOW + 1800001
    },
  ],
  [
    'empty window',
    (value) => {
      value.expiresAt = value.issuedAt
    },
  ],
  [
    'fractional timestamp',
    (value) => {
      value.issuedAt = NOW - 0.5
    },
  ],
  [
    'nonfinite timestamp',
    (value) => {
      value.expiresAt = Infinity
    },
  ],
  [
    'non-RSA recipient',
    (value) => {
      value.publicJwk.kty = 'EC'
    },
  ],
  [
    'wrong modulus length',
    (value) => {
      value.publicJwk.n = value.publicJwk.n.slice(1)
    },
  ],
  [
    'zero modulus',
    (value) => {
      value.publicJwk.n = 'A'.repeat(683)
    },
  ],
  [
    'noncanonical modulus padding',
    (value) => {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
      value.publicJwk.n =
        value.publicJwk.n.slice(0, -1) + alphabet[alphabet.indexOf(value.publicJwk.n.at(-1)) + 1]
    },
  ],
  [
    'wrong exponent',
    (value) => {
      value.publicJwk.e = 'Aw'
    },
  ],
  [
    'wrong RSA algorithm',
    (value) => {
      value.publicJwk.alg = 'RSA-OAEP'
    },
  ],
  [
    'private recipient field',
    (value) => {
      value.publicJwk.d = 'synthetic-private-field'
    },
  ],
  [
    'wrong key operation',
    (value) => {
      value.publicJwk.key_ops = ['decrypt']
    },
  ],
  [
    'wrong key extractability',
    (value) => {
      value.publicJwk.ext = false
    },
  ],
]) {
  test(`invalid ${name} cannot generate email recovery source`, async (context) => {
    context.mock.method(Date, 'now', () => NOW)
    const value = structuredClone(config)
    change(value)
    await assert.rejects(
      generateRecoveryEmailHmacCustodySource(value),
      /Invalid public custody configuration/,
    )
  })
}

for (const [name, value] of [
  ['missing', undefined],
  ['empty', ''],
  ['nonstring', 123],
  ['oversized', 'x'.repeat(8193)],
  ['oversized UTF-8', 'é'.repeat(5000)],
]) {
  test(`${name} HMAC yields opaque denial and consumes the isolate`, async () => {
    const item = await fixture()
    item.env.RECOVERY_EMAIL_HMAC_SECRET = value
    const response = await item.handler(request())
    assert.equal(response.status, 403)
    assert.equal(await response.text(), '{"error":"denied"}')
    assert.deepEqual(item.reads, ['SUPABASE_URL', 'RECOVERY_EMAIL_HMAC_SECRET'])
    item.env.RECOVERY_EMAIL_HMAC_SECRET = SETTINGS.RECOVERY_EMAIL_HMAC_SECRET
    assert.equal((await item.handler(request())).status, 403)
    assert.equal(item.reads.length, 2)
    assert.deepEqual(item.logs, [])
    assert.deepEqual(item.egress, [])
  })
}

test('exact 8192 UTF-8 bytes succeeds while no unrelated setting is read', async () => {
  const item = await fixture()
  item.env.RECOVERY_EMAIL_HMAC_SECRET = 'é'.repeat(4096)
  const response = await item.handler(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await decrypt(await response.json()), {
    RECOVERY_EMAIL_HMAC_SECRET: 'é'.repeat(4096),
  })
  assert.deepEqual(item.reads, ['SUPABASE_URL', 'RECOVERY_EMAIL_HMAC_SECRET'])
})

test('a distinct configured bearer pin denies before the HMAC read', async () => {
  const item = await fixture({ ...config, operatorBearerSha256: 'b'.repeat(64) })
  const response = await item.handler(request())
  assert.equal(response.status, 403)
  assert.equal(await response.text(), '{"error":"denied"}')
  assert.deepEqual(item.reads, ['SUPABASE_URL'])
})

test('HMAC read failure is opaque, has no logs or egress, and cannot be replayed', async () => {
  const item = await fixture()
  item.readError = 'RECOVERY_EMAIL_HMAC_SECRET'
  const response = await item.handler(request())
  assert.equal(response.status, 403)
  assert.equal(await response.text(), '{"error":"denied"}')
  assert.deepEqual(item.logs, [])
  assert.deepEqual(item.egress, [])
  assert.equal((await item.handler(request())).status, 403)
  assert.deepEqual(item.reads, ['SUPABASE_URL', 'RECOVERY_EMAIL_HMAC_SECRET'])
})

test('expiry during authorization blocks HMAC reads', async () => {
  const item = await fixture()
  item.onRead = (name) => {
    if (name === 'SUPABASE_URL') item.clock = config.expiresAt
  }
  assert.equal((await item.handler(request())).status, 403)
  assert.deepEqual(item.reads, ['SUPABASE_URL'])
})

test('expiry during HMAC read prevents ciphertext release', async () => {
  const item = await fixture()
  item.onRead = (name) => {
    if (name === 'RECOVERY_EMAIL_HMAC_SECRET') item.clock = config.expiresAt
  }
  const response = await item.handler(request())
  assert.equal(response.status, 403)
  assert.equal(await response.text(), '{"error":"denied"}')
})

test('concurrent requests and replay release at most one envelope per isolate', async () => {
  const item = await fixture()
  const responses = await Promise.all([item.handler(request()), item.handler(request())])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 403])
  assert.equal(item.reads.filter((name) => name === 'RECOVERY_EMAIL_HMAC_SECRET').length, 1)
  const reads = item.reads.length
  assert.equal((await item.handler(request())).status, 403)
  assert.equal(item.reads.length, reads)
})

test('fresh operations use independent AES keys and IVs', async () => {
  const envelopes = []
  for (const operationNonce of [NONCE, 'b'.repeat(64)]) {
    const item = await fixture({ ...config, operationNonce })
    const input = request()
    input.headers.set('x-recovery-email-hmac-custody-nonce', operationNonce)
    envelopes.push(await (await item.handler(input)).json())
  }
  for (const field of ['wrappedKey', 'iv', 'ciphertext'])
    assert.notEqual(envelopes[0][field], envelopes[1][field])
  for (const envelope of envelopes)
    assert.deepEqual(await decrypt(envelope), {
      RECOVERY_EMAIL_HMAC_SECRET: SETTINGS.RECOVERY_EMAIL_HMAC_SECRET,
    })
})

test('wrong recipient and tampering every authenticated field prevents decryption', async () => {
  const item = await fixture()
  const envelope = await (await item.handler(request())).json()
  const other = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  )
  await assert.rejects(decrypt(envelope, other.privateKey))
  for (const [field, value] of Object.entries({
    schemaVersion: 2,
    purpose: 'catalog-custody',
    algorithm: 'different',
    projectRef: 'other-project',
    operationNonce: 'b'.repeat(64),
    recipientSha256: 'b'.repeat(64),
    issuedAt: NOW - 1,
    expiresAt: config.expiresAt + 1,
  }))
    await assert.rejects(decrypt({ ...envelope, [field]: value }))
  const withoutPurpose = { ...envelope }
  delete withoutPurpose.purpose
  await assert.rejects(decrypt(withoutPurpose))
  for (const field of ['wrappedKey', 'iv', 'ciphertext']) {
    const bytes = Uint8Array.from(atob(envelope[field]), (character) => character.charCodeAt(0))
    bytes[0] ^= 1
    await assert.rejects(decrypt({ ...envelope, [field]: btoa(String.fromCharCode(...bytes)) }))
  }
})

test('the original generated catalog handler retains exactly two settings and its nonce protocol', async () => {
  const source = await generateCatalogCustodySource(config)
  let handler
  const reads = []
  await runInNewContext(`(async () => { ${source} })()`, {
    crypto: webcrypto,
    TextEncoder,
    Response,
    atob,
    btoa,
    Date: { now: () => NOW },
    Deno: {
      env: {
        get: (name) => {
          reads.push(name)
          return SETTINGS[name]
        },
      },
      serve: (value) => {
        handler = value
      },
    },
  })
  assert.equal((await handler(request())).status, 403)
  const input = request()
  input.headers.delete('x-recovery-email-hmac-custody-nonce')
  input.headers.set('x-catalog-custody-nonce', NONCE)
  const response = await handler(input)
  assert.equal(response.status, 200)
  const envelope = await response.json()
  assert.equal(Object.hasOwn(envelope, 'purpose'), false)
  assert.deepEqual(reads, [
    'SUPABASE_URL',
    'PUBLIC_CATALOG_GATEWAY_JWT',
    'PUBLIC_CATALOG_RATE_SALT',
  ])
  // Original metadata excludes purpose; decrypt with its independently specified order.
  const {
    schemaVersion,
    algorithm,
    projectRef,
    operationNonce,
    recipientSha256,
    issuedAt,
    expiresAt,
  } = envelope
  const aad = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion,
      algorithm,
      projectRef,
      operationNonce,
      recipientSha256,
      issuedAt,
      expiresAt,
    }),
  )
  const decode = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  const raw = await webcrypto.subtle.decrypt(
    { name: 'RSA-OAEP', label: aad },
    recipient.privateKey,
    decode(envelope.wrappedKey),
  )
  const key = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(envelope.iv), additionalData: aad },
    key,
    decode(envelope.ciphertext),
  )
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext)), {
    PUBLIC_CATALOG_GATEWAY_JWT: SETTINGS.PUBLIC_CATALOG_GATEWAY_JWT,
    PUBLIC_CATALOG_RATE_SALT: SETTINGS.PUBLIC_CATALOG_RATE_SALT,
  })
})

test('missing or duplicated fixed compiler markers fail closed instead of broadening scope', async () => {
  const compiler = (
    await readFile(new URL('./recovery-email-hmac-custody.mjs', import.meta.url), 'utf8')
  )
    .replace(/^import[^\n]+\n/, '')
    .replace('export async function', 'async function')
  const source = await generateCatalogCustodySource(config)
  for (const marker of [
    "['PUBLIC_CATALOG_GATEWAY_JWT', 'PUBLIC_CATALOG_RATE_SALT']",
    "'x-catalog-custody-nonce'",
    'schemaVersion: 1,',
  ]) {
    for (const upstream of [source.replace(marker, ''), source + marker]) {
      await assert.rejects(
        runInNewContext(
          `(async () => { ${compiler}; return await generateRecoveryEmailHmacCustodySource(config) })()`,
          {
            config,
            generateCatalogCustodySource: async () => upstream,
          },
        ),
        /Invalid custody source shape/,
      )
    }
  }
})
