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
  assert.ok(Buffer.byteLength(writes[0], 'utf8') <= 4096)
  const diagnostic = JSON.parse(writes[0])
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    'attempts',
    'categoryCounts',
    'event',
    'failures',
    'httpStatusCounts',
    'probeKind',
  ])
  assert.equal(diagnostic.event, 'readiness-exhausted')
  assert.equal(diagnostic.probeKind, 'public-catalog')
  assert.equal(diagnostic.attempts, 60)
  assert.deepEqual(Object.keys(diagnostic.failures).sort(), ['first', 'firstHttp', 'last'])
  for (const record of Object.values(diagnostic.failures)) {
    if (record === null) continue
    assert.deepEqual(Object.keys(record).sort(), [
      'attempt',
      'category',
      'httpStatus',
      'safeErrorCode',
      'servingExitCode',
      'servingState',
      'transportCode',
    ])
    assert.ok(Number.isSafeInteger(record.attempt) && record.attempt >= 1 && record.attempt <= 60)
    assert.ok(
      [
        'fetchFailure',
        'responseParseFailure',
        'httpFailure',
        'invalidResponse',
        'unclassifiedFailure',
      ].includes(record.category),
    )
    assert.ok(
      record.httpStatus === null ||
        (Number.isInteger(record.httpStatus) &&
          record.httpStatus >= 100 &&
          record.httpStatus <= 599),
    )
    assert.ok(
      record.safeErrorCode === null ||
        [
          'ALPHA_AUTH_REQUIRED',
          'CATALOG_UNAVAILABLE',
          'GATEWAY_UNAVAILABLE',
          'INVALID_OPERATION',
          'INVALID_REQUEST',
          'MAP_UNAVAILABLE',
          'RATE_LIMITED',
          'BOOT_ERROR',
          'WORKER_ERROR',
          'WORKER_LIMIT',
        ].includes(record.safeErrorCode),
    )
    assert.ok(
      record.transportCode === null ||
        [
          'ECONNREFUSED',
          'ECONNRESET',
          'ETIMEDOUT',
          'EHOSTUNREACH',
          'ENETUNREACH',
          'ENOTFOUND',
          'UND_ERR_CONNECT_TIMEOUT',
          'UND_ERR_SOCKET',
        ].includes(record.transportCode),
    )
    assert.ok(record.category === 'fetchFailure' || record.transportCode === null)
    assert.ok(['running', 'exited', 'signaled', 'unavailable'].includes(record.servingState))
    assert.ok(
      record.servingExitCode === null ||
        (Number.isInteger(record.servingExitCode) &&
          record.servingExitCode >= 0 &&
          record.servingExitCode <= 255),
    )
  }
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

test('catalog HTTP exhaustion emits one bounded status-only diagnostic', async (t) => {
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
          json: async () => ({ message: sentinel }),
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

test('catalog exhaustion projects first, first HTTP, and final failures with bounded serving snapshots', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_READINESS_DIAGNOSTIC_SENTINEL_639'
  let calls = 0
  let snapshots = 0
  const servingStates = [
    { pid: 123, exitCode: null, signalCode: null, privateId: sentinel },
    { pid: 123, exitCode: 7, signalCode: null, privateId: sentinel },
    { pid: 123, exitCode: 7, signalCode: null, privateId: sentinel },
  ]
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        if (calls === 1) {
          throw Object.assign(new Error(sentinel), {
            cause: { code: 'ECONNREFUSED', message: sentinel },
            status: 503,
          })
        }
        const status = calls === 2 ? 500 : calls === 3 ? 502 : 503
        const code = calls === 2 ? 'BOOT_ERROR' : calls === 3 ? sentinel : 'GATEWAY_UNAVAILABLE'
        return { ok: false, status, json: async () => ({ error: { code }, message: sentinel }) }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      request,
      undefined,
      async () => {},
      () => {
        assert.ok(snapshots < 3)
        return servingStates[snapshots++]
      },
    ),
    { message: 'Local catalog function did not become ready' },
  )

  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.equal(snapshots, 3)
  assert.deepEqual(diagnostic.categoryCounts, {
    fetchFailure: 1,
    responseParseFailure: 0,
    httpFailure: 59,
    invalidResponse: 0,
    unclassifiedFailure: 0,
  })
  assert.deepEqual(diagnostic.httpStatusCounts, [
    { status: 500, count: 1 },
    { status: 502, count: 1 },
    { status: 503, count: 57 },
  ])
  assert.deepEqual(diagnostic.failures.first, {
    attempt: 1,
    category: 'fetchFailure',
    httpStatus: null,
    safeErrorCode: null,
    transportCode: 'ECONNREFUSED',
    servingState: 'running',
    servingExitCode: null,
  })
  assert.deepEqual(diagnostic.failures.firstHttp, {
    attempt: 2,
    category: 'httpFailure',
    httpStatus: 500,
    safeErrorCode: 'BOOT_ERROR',
    transportCode: null,
    servingState: 'exited',
    servingExitCode: 7,
  })
  assert.deepEqual(diagnostic.failures.last, {
    attempt: 60,
    category: 'httpFailure',
    httpStatus: 503,
    safeErrorCode: 'GATEWAY_UNAVAILABLE',
    transportCode: null,
    servingState: 'exited',
    servingExitCode: 7,
  })
  assert.equal(writes.join('').includes(sentinel), false)
})

test('the first unreadable HTTP response stays the first HTTP diagnosis', async (t) => {
  const writes = captureStderr(t)
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        if (calls === 1)
          return {
            ok: false,
            status: 500,
            json: async () => Promise.reject(new Error('PRIVATE_BODY')),
          }
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'GATEWAY_UNAVAILABLE' } }),
        }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )
  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.deepEqual(diagnostic.failures.firstHttp, {
    attempt: 1,
    category: 'responseParseFailure',
    httpStatus: 500,
    safeErrorCode: null,
    transportCode: null,
    servingState: 'unavailable',
    servingExitCode: null,
  })
  assert.equal(diagnostic.failures.last.attempt, 60)
  assert.equal(diagnostic.failures.last.httpStatus, 503)
  assert.equal(diagnostic.failures.last.safeErrorCode, 'GATEWAY_UNAVAILABLE')
  assert.equal(writes.join('').includes('PRIVATE_BODY'), false)
})

test('serving snapshots report signaled, exited, and running without exposing process text', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_SIGNAL_NAME_639'
  const servingStates = [
    { pid: 123, exitCode: null, signalCode: sentinel, path: sentinel },
    { pid: 123, exitCode: 0, signalCode: null },
    { pid: 123, exitCode: null, signalCode: null },
  ]
  let calls = 0
  let snapshots = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        if (calls === 1) return { ok: true, status: 200, json: async () => ({ data: {} }) }
        const status = calls === 2 ? 502 : 503
        return { ok: false, status, json: async () => ({ error: { code: 'WORKER_ERROR' } }) }
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      request,
      undefined,
      async () => {},
      () => servingStates[snapshots++],
    ),
    { message: 'Local catalog function did not become ready' },
  )
  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.equal(snapshots, 3)
  assert.deepEqual(diagnostic.failures.first, {
    attempt: 1,
    category: 'invalidResponse',
    httpStatus: 200,
    safeErrorCode: null,
    transportCode: null,
    servingState: 'signaled',
    servingExitCode: null,
  })
  assert.equal(diagnostic.failures.firstHttp.servingState, 'exited')
  assert.equal(diagnostic.failures.firstHttp.servingExitCode, 0)
  assert.equal(diagnostic.failures.last.servingState, 'running')
  assert.equal(diagnostic.failures.last.servingExitCode, null)
  assert.equal(writes.join('').includes(sentinel), false)
})

test('response codes use fixed allowlists and nested code precedence without serializing body text', async (t) => {
  const writes = captureStderr(t)
  const sentinel = 'PRIVATE_RESPONSE_CODE_SENTINEL_639'
  const cases = [
    [
      { error: { code: 'ALPHA_AUTH_REQUIRED' }, code: 'BOOT_ERROR', message: sentinel },
      'ALPHA_AUTH_REQUIRED',
    ],
    [{ error: { code: sentinel }, code: 'BOOT_ERROR', message: sentinel }, null],
    [{ code: 'RATE_LIMITED', message: sentinel }, 'RATE_LIMITED'],
    [{ error: { code: 503 }, code: 'BOOT_ERROR', message: sentinel }, null],
    [[{ code: 'BOOT_ERROR' }, sentinel], null],
  ]
  for (const [body, expectedCode] of cases) {
    const start = writes.length
    const request = (route, options) =>
      loopbackRequest('http://127.0.0.1:54321', route, {
        ...options,
        fetcher: async () => ({ ok: false, status: 503, json: async () => body }),
      })
    await assert.rejects(
      waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
      { message: 'Local catalog function did not become ready' },
    )
    const diagnostic = readReadinessDiagnostic(writes.slice(start))
    assert.equal(diagnostic.failures.first.safeErrorCode, expectedCode)
    assert.equal(diagnostic.failures.last.safeErrorCode, expectedCode)
  }
  assert.equal(writes.join('').includes(sentinel), false)
})

test('fetch and unclassified failures expose only allowlisted transport metadata', async (t) => {
  const writes = captureStderr(t)
  let calls = 0
  const request = (route, options) =>
    loopbackRequest('http://127.0.0.1:54321', route, {
      ...options,
      fetcher: async () => {
        calls++
        if (calls === 1)
          throw Object.assign(new Error('PRIVATE_FETCH_MESSAGE'), {
            cause: { code: 'PRIVATE_CAUSE_CODE', message: 'PRIVATE_CAUSE_MESSAGE' },
            code: 'ECONNRESET',
            status: 503,
            privateField: 'PRIVATE_FETCH_FIELD',
          })
        throw 'PRIVATE_THROWN_PRIMITIVE'
      },
    })

  await assert.rejects(
    waitForLocalServiceReadiness(localRun(), request, undefined, async () => {}),
    { message: 'Local catalog function did not become ready' },
  )
  const diagnostic = readReadinessDiagnostic(writes)
  assert.equal(calls, 60)
  assert.deepEqual(diagnostic.failures.first, {
    attempt: 1,
    category: 'fetchFailure',
    httpStatus: null,
    safeErrorCode: null,
    transportCode: null,
    servingState: 'unavailable',
    servingExitCode: null,
  })
  assert.deepEqual(diagnostic.failures.last, {
    attempt: 60,
    category: 'unclassifiedFailure',
    httpStatus: null,
    safeErrorCode: null,
    transportCode: null,
    servingState: 'unavailable',
    servingExitCode: null,
  })
  assert.doesNotMatch(writes.join(''), /PRIVATE_/)
})

test('serving snapshots reject malformed values and exceptions without replacing readiness failure', async (t) => {
  const writes = captureStderr(t)
  const invalidStates = [
    null,
    { pid: 0, exitCode: null, signalCode: null },
    { pid: 123, exitCode: -1, signalCode: null, privateId: 'PRIVATE_EXIT_CODE' },
    { pid: 123, exitCode: 1.5, signalCode: null, privateId: 'PRIVATE_EXIT_CODE' },
    { pid: 123, exitCode: 256, signalCode: null, privateId: 'PRIVATE_EXIT_CODE' },
    new Error('PRIVATE_SNAPSHOT_ERROR'),
  ]
  for (const invalidState of invalidStates) {
    const start = writes.length
    const request = (route, options) =>
      loopbackRequest('http://127.0.0.1:54321', route, {
        ...options,
        fetcher: async () => ({
          ok: false,
          status: 503,
          json: async () => ({ error: { code: 'WORKER_ERROR' } }),
        }),
      })
    let snapshots = 0
    await assert.rejects(
      waitForLocalServiceReadiness(
        localRun(),
        request,
        undefined,
        async () => {},
        () => {
          snapshots++
          if (invalidState instanceof Error) throw invalidState
          return invalidState
        },
      ),
      { message: 'Local catalog function did not become ready' },
    )
    const diagnostic = readReadinessDiagnostic(writes.slice(start))
    assert.equal(snapshots, 2)
    assert.equal(diagnostic.failures.first.servingState, 'unavailable')
    assert.equal(diagnostic.failures.first.servingExitCode, null)
    assert.equal(diagnostic.failures.last.servingState, 'unavailable')
    assert.equal(diagnostic.failures.last.servingExitCode, null)
    assert.doesNotMatch(writes.join(''), /PRIVATE_/)
  }
})
