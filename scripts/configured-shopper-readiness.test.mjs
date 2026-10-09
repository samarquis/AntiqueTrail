/* global AbortController, Buffer, process */
import assert from 'node:assert/strict'
import test from 'node:test'
import { loopbackRequest, waitForLocalServiceReadiness } from './configured-shopper-local.mjs'

const localRun = (users = [{ token: 'test-session-token' }]) => ({
  anonKey: 'test-anon-key',
  origin: 'http://127.0.0.1:4173',
  users,
})

function captureStderr(t) {
  const writes = []
  t.mock.method(process.stderr, 'write', (chunk) => {
    writes.push(String(chunk))
    return true
  })
  return writes
}

function readReadinessDiagnostic(writes) {
  assert.equal(writes.length, 1)
  assert.ok(writes[0].endsWith('\n'))
  assert.equal(writes[0].trimEnd().includes('\n'), false)
  assert.ok(Buffer.byteLength(writes[0], 'utf8') <= 2048)
  const diagnostic = JSON.parse(writes[0])
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    'attempts',
    'categoryCounts',
    'event',
    'httpStatusCounts',
    'probeKind',
    'responseCodeCounts',
  ])
  assert.equal(diagnostic.event, 'readiness-exhausted')
  assert.equal(diagnostic.probeKind, 'public-catalog')
  assert.equal(diagnostic.attempts, 60)
  assert.deepEqual(Object.keys(diagnostic.categoryCounts).sort(), [
    'fetchFailure',
    'httpFailure',
    'invalidResponse',
    'responseParseFailure',
    'unclassifiedFailure',
  ])
  const categories = Object.values(diagnostic.categoryCounts)
  assert.ok(categories.every((count) => Number.isInteger(count) && count >= 0 && count <= 60))
  assert.equal(
    categories.reduce((total, count) => total + count, 0),
    diagnostic.attempts,
  )
  assert.ok(Array.isArray(diagnostic.httpStatusCounts))
  assert.ok(
    diagnostic.httpStatusCounts.every(
      ({ status, count }) =>
        Number.isInteger(status) &&
        status >= 100 &&
        status <= 599 &&
        Number.isInteger(count) &&
        count > 0 &&
        count <= 60,
    ),
  )
  assert.equal(
    diagnostic.httpStatusCounts.reduce((total, entry) => total + entry.count, 0) <=
      diagnostic.attempts,
    true,
  )
  const responseCodes = new Set([
    'ALPHA_AUTH_REQUIRED',
    'CATALOG_UNAVAILABLE',
    'GATEWAY_UNAVAILABLE',
    'INVALID_OPERATION',
    'INVALID_REQUEST',
    'MAP_UNAVAILABLE',
    'RATE_LIMITED',
    'other',
  ])
  assert.ok(Array.isArray(diagnostic.responseCodeCounts))
  assert.ok(
    diagnostic.responseCodeCounts.every(
      ({ code, count }) =>
        responseCodes.has(code) && Number.isInteger(count) && count > 0 && count <= 60,
    ),
  )
  assert.equal(
    diagnostic.responseCodeCounts.reduce((total, entry) => total + entry.count, 0) <=
      diagnostic.attempts,
    true,
  )
  return diagnostic
}

test('a valid catalog array, including an empty array, establishes readiness silently', async (t) => {
  const calls = []
  const writes = captureStderr(t)
  await waitForLocalServiceReadiness(
    localRun(),
    async (route, options) => {
      calls.push({ route, options })
      return { data: [] }
    },
    undefined,
    async () => assert.fail('ready response must not wait'),
  )
  assert.deepEqual(calls, [
    {
      route: '/functions/v1/public-catalog',
      options: {
        key: 'test-anon-key',
        token: 'test-session-token',
        origin: 'http://127.0.0.1:4173',
        body: { operation: 'list', args: { p_q: null, p_category: null, p_area: null } },
      },
    },
  ])
  assert.deepEqual(writes, [])
})

test('transient probe failures and invalid payloads retry only until a valid response', async () => {
  let calls = 0
  let waits = 0
  await waitForLocalServiceReadiness(
    localRun(),
    async () => {
      calls++
      if (calls === 1) throw new Error('synthetic probe failure')
      if (calls === 2) return { data: 'not-an-array' }
      return { data: [{ id: 'synthetic-store' }] }
    },
    undefined,
    async () => {
      waits++
    },
  )
  assert.equal(calls, 3)
  assert.equal(waits, 2)
})

test('catalog exhaustion emits bounded counts and keeps its fixed safe error', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_ERROR_1183'
  let calls = 0
  let waits = 0
  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => {
        calls++
        throw new Error(sentinel)
      },
      undefined,
      async () => {
        waits++
      },
    ),
    (error) =>
      error.message === 'Local catalog function did not become ready' &&
      !error.message.includes(sentinel),
  )
  assert.equal(calls, 60)
  assert.equal(waits, 60)
  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(diagnostic.categoryCounts.unclassifiedFailure, 60)
  assert.equal(writes.join('').includes(sentinel), false)
})

test('catalog HTTP exhaustion emits bounded status and allowlisted response code counts', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_HTTP_BODY_9401'
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'GATEWAY_UNAVAILABLE' }, message: sentinel }),
        }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.deepEqual(diagnostic.categoryCounts, {
    fetchFailure: 0,
    responseParseFailure: 0,
    httpFailure: 60,
    invalidResponse: 0,
    unclassifiedFailure: 0,
  })
  assert.deepEqual(diagnostic.httpStatusCounts, [{ status: 503, count: 60 }])
  assert.deepEqual(diagnostic.responseCodeCounts, [{ code: 'GATEWAY_UNAVAILABLE', count: 60 }])
  assert.equal(writes.join('').includes(sentinel), false)
})

test('catalog fetch errors expose only fixed categories, never injected error text', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_FETCH_ERROR_6287'
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        throw new Error(sentinel)
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.deepEqual(diagnostic.categoryCounts, {
    fetchFailure: 60,
    responseParseFailure: 0,
    httpFailure: 0,
    invalidResponse: 0,
    unclassifiedFailure: 0,
  })
  assert.deepEqual(diagnostic.httpStatusCounts, [])
  assert.equal(writes.join('').includes(sentinel), false)
})

test('catalog parse failures expose no private text', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_RESPONSE_2864'
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error(sentinel)
          },
        }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.equal(diagnostic.categoryCounts.responseParseFailure, 60)
  assert.deepEqual(diagnostic.httpStatusCounts, [{ status: 200, count: 60 }])
  assert.equal(writes.join('').includes(sentinel), false)
})

test('catalog diagnostics stay bounded with one distinct status per attempt', async (t) => {
  const writes = captureStderr(t)
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        const status = 400 + calls++
        return { ok: false, status, json: async () => ({}) }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.equal(diagnostic.httpStatusCounts.length, 60)
  assert.equal(diagnostic.httpStatusCounts[0].status, 400)
  assert.equal(diagnostic.httpStatusCounts[59].status, 459)
  assert.deepEqual(diagnostic.responseCodeCounts, [{ code: 'other', count: 60 }])
})

test('non-array catalog payloads never admit startup or expose response content', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_RESPONSE_2864'
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { message: sentinel } }),
        }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )
  assert.equal(calls, 60)
  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(diagnostic.categoryCounts.invalidResponse, 60)
  assert.deepEqual(diagnostic.httpStatusCounts, [{ status: 200, count: 60 }])
  assert.equal(writes.join('').includes(sentinel), false)
})

test('catalog diagnostics retain trusted HTTP status for primitive JSON responses', async (t) => {
  const writes = captureStderr(t)
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        return { ok: true, status: 200, json: async () => null }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.equal(diagnostic.categoryCounts.invalidResponse, 60)
  assert.deepEqual(diagnostic.httpStatusCounts, [{ status: 200, count: 60 }])
})

test('untrusted request status fields are not treated as HTTP status metadata', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SENTINEL_RESPONSE_STATUS_3972'

  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => ({ data: { message: sentinel }, status: 599 }),
      undefined,
      async () => {},
    ),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(diagnostic.categoryCounts.invalidResponse, 60)
  assert.deepEqual(diagnostic.httpStatusCounts, [])
  assert.equal(writes.join('').includes(sentinel), false)
})

test('registration mode admits only its existing expected-blocked response silently', async (t) => {
  const calls = []
  const writes = captureStderr(t)
  await waitForLocalServiceReadiness(
    localRun([]),
    async (route, options) => {
      calls.push({ route, options })
      return { state: 'blocked' }
    },
    undefined,
    async () => assert.fail('blocked registration response must not wait'),
  )
  assert.deepEqual(calls, [
    {
      route: '/functions/v1/account-registration',
      options: {
        key: 'test-anon-key',
        token: 'test-anon-key',
        origin: 'http://127.0.0.1:4173',
        body: {},
      },
    },
  ])
  assert.deepEqual(writes, [])
})

test('registration exhaustion keeps its fixed startup error without catalog diagnostics', async (t) => {
  let calls = 0
  const writes = captureStderr(t)
  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun([]),
      async () => {
        calls++
        return { state: 'not-blocked' }
      },
      undefined,
      async () => {},
    ),
    { message: 'Local registration function did not become ready' },
  )
  assert.equal(calls, 60)
  assert.deepEqual(writes, [])
})

test('abort between attempts prevents another request and emits no diagnostic', async (t) => {
  const controller = new AbortController()
  let calls = 0
  let waits = 0
  const writes = captureStderr(t)
  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => {
        calls++
        return { data: null }
      },
      controller.signal,
      async () => {
        waits++
        controller.abort()
      },
    ),
    (error) => error.name === 'AbortError',
  )
  assert.equal(calls, 1)
  assert.equal(waits, 1)
  assert.deepEqual(writes, [])
})

test('abort during the final wait keeps fixed exhaustion behavior but emits no diagnostic', async (t) => {
  const controller = new AbortController()
  let calls = 0
  let waits = 0
  const writes = captureStderr(t)

  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => {
        calls++
        return { data: null }
      },
      controller.signal,
      async () => {
        waits++
        if (waits === 60) controller.abort()
      },
    ),
    { message: 'Local catalog function did not become ready' },
  )

  assert.equal(calls, 60)
  assert.equal(waits, 60)
  assert.deepEqual(writes, [])
})
