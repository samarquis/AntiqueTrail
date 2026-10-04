import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCatalogCustodyHandler,
  generateCatalogCustodySource,
} from './catalog-custody-recovery.mjs'
const { Request, TextEncoder, TextDecoder, atob } = globalThis

const PROJECT = 'uaupykgpegbseboklubv'
const NONCE = 'a'.repeat(64)
const NOW = Date.now()
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
const publicJwk = await webcrypto.subtle.exportKey('jwk', recipient.publicKey)
const config = {
  publicJwk,
  operationNonce: NONCE,
  projectRef: PROJECT,
  issuedAt: NOW,
  expiresAt: NOW + 1800000,
}
const SETTINGS = {
  SUPABASE_URL: `https://${PROJECT}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
  PUBLIC_CATALOG_GATEWAY_JWT: 'synthetic-existing-catalog-jwt',
  PUBLIC_CATALOG_RATE_SALT: 'synthetic-existing-catalog-salt',
}

function request(overrides = {}) {
  return new Request('https://operator.test/custody', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SETTINGS.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-catalog-custody-nonce': NONCE,
    },
    ...overrides,
  })
}

function metadata(envelope) {
  const {
    schemaVersion,
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
  const decode = (text) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
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

test('authorized handler returns only recipient-bound ciphertext for the two existing settings', async () => {
  const reads = []
  const handler = await createCatalogCustodyHandler(config, {
    now: () => NOW,
    getEnv: (name) => {
      reads.push(name)
      return SETTINGS[name]
    },
  })
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  const body = await response.text(),
    envelope = JSON.parse(body)
  assert.deepEqual(
    Object.keys(envelope).sort(),
    [
      'schemaVersion',
      'algorithm',
      'projectRef',
      'operationNonce',
      'recipientSha256',
      'issuedAt',
      'expiresAt',
      'wrappedKey',
      'iv',
      'ciphertext',
    ].sort(),
  )
  assert.equal(body.includes(SETTINGS.PUBLIC_CATALOG_GATEWAY_JWT), false)
  assert.equal(body.includes(SETTINGS.PUBLIC_CATALOG_RATE_SALT), false)
  assert.equal(envelope.projectRef, PROJECT)
  assert.equal(envelope.operationNonce, NONCE)
  assert.match(envelope.recipientSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(await decrypt(envelope), {
    PUBLIC_CATALOG_GATEWAY_JWT: SETTINGS.PUBLIC_CATALOG_GATEWAY_JWT,
    PUBLIC_CATALOG_RATE_SALT: SETTINGS.PUBLIC_CATALOG_RATE_SALT,
  })
  assert.deepEqual(reads.sort(), Object.keys(SETTINGS).sort())
})

test('generated Deno source executes the actual factory with native crypto and authorization gates', async () => {
  const source = await generateCatalogCustodySource(config)
  let handler
  const reads = []
  let clock = NOW
  const env = { ...SETTINGS }
  await runInNewContext(`(async () => { ${source} })()`, {
    crypto: webcrypto,
    TextEncoder,
    Response: globalThis.Response,
    atob,
    btoa: globalThis.btoa,
    Date: { now: () => clock },
    Deno: {
      env: {
        get: (name) => {
          reads.push(name)
          return env[name]
        },
      },
      serve: (value) => {
        handler = value
      },
    },
  })
  assert.equal(typeof handler, 'function')
  const wrong = request()
  wrong.headers.set('authorization', 'Bearer synthetic-anon-token')
  assert.equal((await handler(wrong)).status, 403)
  const wrongNonce = request()
  wrongNonce.headers.set('x-catalog-custody-nonce', 'b'.repeat(64))
  assert.equal((await handler(wrongNonce)).status, 403)
  const browser = request()
  browser.headers.set('origin', 'https://browser.test')
  assert.equal((await handler(browser)).status, 403)
  assert.equal((await handler(request({ method: 'GET' }))).status, 403)
  clock = config.expiresAt
  assert.equal((await handler(request())).status, 403)
  clock = NOW
  env.SUPABASE_URL = 'https://another-project.supabase.co'
  assert.equal((await handler(request())).status, 403)
  env.SUPABASE_URL = SETTINGS.SUPABASE_URL
  assert.equal(
    reads.some((name) => name.startsWith('PUBLIC_CATALOG_')),
    false,
  )
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.deepEqual(await decrypt(await response.json()), {
    PUBLIC_CATALOG_GATEWAY_JWT: SETTINGS.PUBLIC_CATALOG_GATEWAY_JWT,
    PUBLIC_CATALOG_RATE_SALT: SETTINGS.PUBLIC_CATALOG_RATE_SALT,
  })
  const priorReads = reads.length
  assert.equal((await handler(request())).status, 403)
  assert.equal(reads.length, priorReads)
})

test('rejects a recipient modulus with noncanonical base64url padding bits', async () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const n = publicJwk.n.slice(0, -1) + alphabet[alphabet.indexOf(publicJwk.n.at(-1)) + 1]
  await assert.rejects(
    createCatalogCustodyHandler({ ...config, publicJwk: { ...publicJwk, n } }, { now: () => NOW }),
    /Invalid public custody configuration/,
  )
})

for (const [name, change] of [
  [
    'missing authorization',
    (item) => {
      item.request.headers.delete('authorization')
    },
  ],
  [
    'anon token',
    (item) => {
      item.request.headers.set('authorization', 'Bearer synthetic-anon-token')
    },
  ],
  [
    'wrong service key',
    (item) => {
      item.request.headers.set('authorization', 'Bearer synthetic-service-role-kex')
    },
  ],
  [
    'wrong bearer scheme',
    (item) => {
      item.request.headers.set('authorization', `bearer ${SETTINGS.SUPABASE_SERVICE_ROLE_KEY}`)
    },
  ],
  [
    'oversized authorization',
    (item) => {
      item.request.headers.set('authorization', 'x'.repeat(8200))
    },
  ],
  [
    'missing nonce',
    (item) => {
      item.request.headers.delete('x-catalog-custody-nonce')
    },
  ],
  [
    'wrong nonce',
    (item) => {
      item.request.headers.set('x-catalog-custody-nonce', 'b'.repeat(64))
    },
  ],
  [
    'expired request',
    (item) => {
      item.clock = config.expiresAt
    },
  ],
  [
    'clock before issuance',
    (item) => {
      item.clock = config.issuedAt - 1
    },
  ],
  [
    'wrong project',
    (item) => {
      item.env.SUPABASE_URL = 'https://another-project.supabase.co'
    },
  ],
  [
    'project URL with extra path',
    (item) => {
      item.env.SUPABASE_URL += '/other'
    },
  ],
  [
    'missing service key',
    (item) => {
      delete item.env.SUPABASE_SERVICE_ROLE_KEY
    },
  ],
  [
    'Origin',
    (item) => {
      item.request.headers.set('origin', 'https://browser.test')
    },
  ],
  [
    'empty Origin',
    (item) => {
      item.request.headers.set('origin', '')
    },
  ],
  [
    'GET',
    (item) => {
      item.request = request({ method: 'GET' })
    },
  ],
  [
    'OPTIONS',
    (item) => {
      item.request = request({ method: 'OPTIONS' })
    },
  ],
]) {
  test(`opaque ${name} denial never reads either catalog setting`, async () => {
    const reads = [],
      item = { env: { ...SETTINGS }, request: request(), clock: NOW }
    const handler = await createCatalogCustodyHandler(config, {
      now: () => item.clock,
      getEnv: (key) => {
        reads.push(key)
        return item.env[key]
      },
    })
    change(item)
    const response = await handler(item.request)
    assert.equal(response.status, 403)
    assert.equal(await response.text(), '{"error":"denied"}')
    assert.equal(response.headers.get('access-control-allow-origin'), null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(
      reads.some((key) => key.startsWith('PUBLIC_CATALOG_')),
      false,
    )
  })
}

test('wrong recipient and envelope tampering cannot decrypt either value', async () => {
  const handler = await createCatalogCustodyHandler(config, {
    now: () => NOW,
    getEnv: (key) => SETTINGS[key],
  })
  const envelope = await (await handler(request())).json()
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
  for (const field of ['wrappedKey', 'iv', 'ciphertext']) {
    const bytes = Uint8Array.from(atob(envelope[field]), (value) => value.charCodeAt(0))
    bytes[0] ^= 1
    await assert.rejects(
      decrypt({ ...envelope, [field]: globalThis.btoa(String.fromCharCode(...bytes)) }),
    )
  }
  for (const [field, value] of Object.entries({
    schemaVersion: 2,
    algorithm: 'different',
    projectRef: 'other-project',
    operationNonce: 'b'.repeat(64),
    recipientSha256: 'b'.repeat(64),
    issuedAt: NOW - 1,
    expiresAt: config.expiresAt + 1,
  }))
    await assert.rejects(decrypt({ ...envelope, [field]: value }))
})

for (const [name, change] of [
  [
    'unknown config key',
    (value) => {
      value.arbitraryEnv = 'OTHER_SECRET'
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
    'future issuedAt',
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
    'excessive deadline',
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
    'wrong exponent',
    (value) => {
      value.publicJwk.e = 'Aw'
    },
  ],
  [
    'wrong hash algorithm',
    (value) => {
      value.publicJwk.alg = 'RSA-OAEP'
    },
  ],
  [
    'private recipient fields',
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
]) {
  test(`invalid ${name} fails before environment access or source generation`, async (context) => {
    context.mock.method(Date, 'now', () => NOW)
    const value = globalThis.structuredClone(config),
      reads = []
    change(value)
    await assert.rejects(
      createCatalogCustodyHandler(value, { now: () => NOW, getEnv: (key) => reads.push(key) }),
      /Invalid public custody configuration/,
    )
    await assert.rejects(
      generateCatalogCustodySource(value),
      /Invalid public custody configuration/,
    )
    assert.deepEqual(reads, [])
  })
}

for (const key of ['PUBLIC_CATALOG_GATEWAY_JWT', 'PUBLIC_CATALOG_RATE_SALT']) {
  for (const [name, value] of [
    ['missing', undefined],
    ['empty', ''],
    ['oversized', 'x'.repeat(8193)],
    ['oversized UTF-8', 'é'.repeat(5000)],
  ]) {
    test(`${name} ${key} produces only opaque denial`, async () => {
      const env = { ...SETTINGS, [key]: value }
      const handler = await createCatalogCustodyHandler(config, {
        now: () => NOW,
        getEnv: (name) => env[name],
      })
      const response = await handler(request())
      assert.equal(response.status, 403)
      assert.equal(await response.text(), '{"error":"denied"}')
    })
  }
}

test('concurrent requests and replay allow only one export in the same isolate', async () => {
  const reads = []
  const handler = await createCatalogCustodyHandler(config, {
    now: () => NOW,
    getEnv: (key) => {
      reads.push(key)
      return SETTINGS[key]
    },
  })
  const responses = await Promise.all([handler(request()), handler(request())])
  assert.deepEqual(responses.map((value) => value.status).sort(), [200, 403])
  assert.equal(reads.filter((key) => key.startsWith('PUBLIC_CATALOG_')).length, 2)
  const previousReads = reads.length
  assert.equal((await handler(request())).status, 403)
  assert.equal(reads.length, previousReads)
})

test('expiry during authorization closes the setting-read gate', async () => {
  let clock = NOW
  const reads = []
  const handler = await createCatalogCustodyHandler(config, {
    now: () => clock,
    getEnv: (key) => {
      reads.push(key)
      if (key === 'SUPABASE_URL') clock = config.expiresAt
      return SETTINGS[key]
    },
  })
  assert.equal((await handler(request())).status, 403)
  assert.equal(
    reads.some((key) => key.startsWith('PUBLIC_CATALOG_')),
    false,
  )
})

test('fresh operations use independent keys and IVs and ignore caller-selected setting names', async () => {
  const reads = []
  const envelopes = []
  for (const operationNonce of [NONCE, 'b'.repeat(64)]) {
    const handler = await createCatalogCustodyHandler(
      { ...config, operationNonce },
      {
        now: () => NOW,
        getEnv: (key) => {
          reads.push(key)
          return SETTINGS[key]
        },
      },
    )
    const input = request({ body: JSON.stringify({ env: ['OTHER_SECRET'] }) })
    input.headers.set('x-catalog-custody-nonce', operationNonce)
    envelopes.push(await (await handler(input)).json())
  }
  for (const field of ['wrappedKey', 'iv', 'ciphertext'])
    assert.notEqual(envelopes[0][field], envelopes[1][field])
  assert.deepEqual(new Set(reads), new Set(Object.keys(SETTINGS)))
  for (const envelope of envelopes)
    assert.deepEqual(Object.keys(await decrypt(envelope)).sort(), [
      'PUBLIC_CATALOG_GATEWAY_JWT',
      'PUBLIC_CATALOG_RATE_SALT',
    ])
})

test('success and read failures emit no logs, egress or plaintext error', async (context) => {
  const logs = [],
    egress = []
  for (const method of ['log', 'warn', 'error'])
    context.mock.method(globalThis.console, method, (...values) => logs.push(values))
  context.mock.method(globalThis, 'fetch', (...values) => {
    egress.push(values)
    throw new Error('network prohibited')
  })
  const handler = await createCatalogCustodyHandler(config, {
    now: () => NOW,
    getEnv: (key) => SETTINGS[key],
  })
  assert.equal((await handler(request())).status, 200)
  const failing = await createCatalogCustodyHandler(config, {
    now: () => NOW,
    getEnv: (key) => {
      if (key === 'PUBLIC_CATALOG_GATEWAY_JWT') throw new Error('synthetic private error')
      return SETTINGS[key]
    },
  })
  const denied = await failing(request())
  assert.equal(denied.status, 403)
  assert.equal(await denied.text(), '{"error":"denied"}')
  assert.deepEqual(logs, [])
  assert.deepEqual(egress, [])
})
