import assert from 'node:assert/strict'
import test from 'node:test'
import { runProviderAuthSmoke } from './auth-provider-gate.mjs'

const response = (status, body = {}) =>
  new globalThis.Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

test('fails closed when provider proof is unconfigured', async () => {
  await assert.rejects(runProviderAuthSmoke({}), /unconfigured/)
})

test('proves direct signup denial, service generation, and cleanup', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/signup')) return response(422, { code: 'signup_disabled' })
    if (url.endsWith('/generate_link'))
      return response(200, {
        user: { id: 'user-1' },
        properties: { hashed_token: 'secret-never-output' },
      })
    return response(200)
  }
  assert.deepEqual(
    await runProviderAuthSmoke({
      url: 'https://project.supabase.co',
      anonKey: 'anon',
      serviceRoleKey: 'service',
      fetchImpl,
    }),
    { directPublicSignupDenied: true, serviceGenerateLinkAvailable: true, cleanupConfirmed: true },
  )
  assert.equal(calls.length, 3)
})

test('blocks activation if public signup succeeds or service generation is unavailable', async () => {
  await assert.rejects(
    runProviderAuthSmoke({
      url: 'https://project.supabase.co',
      anonKey: 'anon',
      serviceRoleKey: 'service',
      fetchImpl: async () => response(200),
    }),
    /status is unknown/,
  )
})

for (const [status, body] of [
  [429, { code: 'signup_disabled' }],
  [503, { code: 'signup_disabled' }],
  [422, { code: 'email_invalid' }],
  [400, { error_code: 'signup_disabled' }],
]) {
  test(`rejects non-authoritative disabled-signup response ${status}`, async () => {
    await assert.rejects(
      runProviderAuthSmoke({
        url: 'https://project.supabase.co',
        anonKey: 'anon',
        serviceRoleKey: 'service',
        fetchImpl: async () => response(status, body),
      }),
      /status is unknown/,
    )
  })
}

test('accepts the documented error_code response key', async () => {
  let call = 0
  const proof = await runProviderAuthSmoke({
    url: 'https://project.supabase.co',
    anonKey: 'anon',
    serviceRoleKey: 'service',
    fetchImpl: async () =>
      ++call === 1
        ? response(422, { error_code: 'signup_disabled' })
        : call === 2
          ? response(200, { user: { id: 'user-1' } })
          : response(200),
  })
  assert.equal(proof.directPublicSignupDenied, true)
})

test('treats malformed and network signup responses as unknown', async () => {
  await assert.rejects(
    runProviderAuthSmoke({
      url: 'https://project.supabase.co',
      anonKey: 'anon',
      serviceRoleKey: 'service',
      fetchImpl: async () => new globalThis.Response('not-json', { status: 422 }),
    }),
    /status is unknown/,
  )
  await assert.rejects(
    runProviderAuthSmoke({
      url: 'https://project.supabase.co',
      anonKey: 'anon',
      serviceRoleKey: 'service',
      fetchImpl: async () => {
        throw new Error('network')
      },
    }),
    /status is unknown/,
  )
})
