/* global AbortController */
import assert from 'node:assert/strict'
import test from 'node:test'
import { waitForLocalServiceReadiness } from './configured-shopper-local.mjs'

const localRun = (users = [{ token: 'test-session-token' }]) => ({
  anonKey: 'test-anon-key',
  origin: 'http://127.0.0.1:4173',
  users,
})

test('a valid catalog array, including an empty array, establishes readiness', async () => {
  const calls = []
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

test('catalog exhaustion rejects after the bounded attempt budget with a fixed safe error', async () => {
  let calls = 0
  let waits = 0
  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => {
        calls++
        throw new Error('sentinel-private-probe-error')
      },
      undefined,
      async () => {
        waits++
      },
    ),
    (error) =>
      error.message === 'Local catalog function did not become ready' &&
      !error.message.includes('sentinel-private-probe-error'),
  )
  assert.equal(calls, 60)
  assert.equal(waits, 60)
})

test('non-array catalog payloads never admit startup', async () => {
  let calls = 0
  await assert.rejects(
    waitForLocalServiceReadiness(
      localRun(),
      async () => {
        calls++
        return { data: { message: 'sentinel-private-response' } }
      },
      undefined,
      async () => {},
    ),
    { message: 'Local catalog function did not become ready' },
  )
  assert.equal(calls, 60)
})

test('registration mode admits only its existing expected-blocked response', async () => {
  const calls = []
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
})

test('registration exhaustion keeps its fixed startup error', async () => {
  let calls = 0
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
})

test('abort between attempts prevents another readiness request', async () => {
  const controller = new AbortController()
  let calls = 0
  let waits = 0
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
})
