/* global Response */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmationUrl,
  registrationEnvironment,
  readMailbox,
  sanitizeJourneyError,
} from './local-signup-contract.mjs'
import { localProjectConfig, loopbackRequest } from './configured-shopper-local.mjs'

test('extracts only a run-owned GoTrue link returning to the local callback', () => {
  const messages = [
    {
      text: 'Confirm: http://127.0.0.1:54321/auth/v1/verify?token=one&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A4173%2Fauth%2Fcallback',
    },
  ]
  assert.equal(
    confirmationUrl(messages, 'http://127.0.0.1:54321', 'http://127.0.0.1:4173'),
    'http://127.0.0.1:54321/auth/v1/verify?token=one&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A4173%2Fauth%2Fcallback',
  )
})

test('extracts a GoTrue link followed by sentence punctuation', () => {
  assert.equal(
    confirmationUrl(
      [
        {
          text: 'Confirm: http://127.0.0.1:54321/auth/v1/verify?token=one&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A4173%2Fauth%2Fcallback.',
        },
      ],
      'http://127.0.0.1:54321',
      'http://127.0.0.1:4173',
    ),
    'http://127.0.0.1:54321/auth/v1/verify?token=one&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A4173%2Fauth%2Fcallback',
  )
})

test('extracts the token-hash callback link from the local confirmation template', () => {
  assert.equal(
    confirmationUrl(
      [
        {
          html: '<a href="http://127.0.0.1:4173/auth/callback#token_hash=opaque&type=verify">Confirm</a>',
        },
      ],
      'http://127.0.0.1:54321',
      'http://127.0.0.1:4173',
    ),
    'http://127.0.0.1:4173/auth/callback#token_hash=opaque&type=verify',
  )
})

test('builds registration settings only for loopback endpoints and a private HMAC key', () => {
  const env = registrationEnvironment({
    appOrigin: 'http://127.0.0.1:4173',
    supabaseOrigin: 'http://kong:8000',
    mailOrigin: 'http://127.0.0.1:54322',
    secret: 'a'.repeat(64),
  })
  assert.match(env, /REGISTRATION_LOCAL_MODE=true/)
  assert.match(env, /APP_ORIGIN=http:\/\/127\.0\.0\.1:4173/)
  assert.doesNotMatch(env, /https:\/\/|localhost/)
  assert.throws(
    () =>
      registrationEnvironment({
        appOrigin: 'https://example.com',
        supabaseOrigin: 'http://kong:8000',
        mailOrigin: 'http://127.0.0.1:54322',
        secret: 'a'.repeat(64),
      }),
    /local endpoints/,
  )
})

test('sanitizes browser failure diagnostics before saving local evidence', () => {
  const safe = sanitizeJourneyError(
    'bad http://127.0.0.1:54321/auth/callback?token_hash=private shopper@probe.invalid',
  )
  assert.doesNotMatch(safe, /token_hash=private|shopper@probe\.invalid/)
  assert.match(safe, /bad \[local URL\]/)
})

test('rejects confirmation links outside the configured local callback origin', () => {
  assert.throws(
    () =>
      confirmationUrl(
        [
          {
            text: 'http://127.0.0.1:54321/auth/v1/verify?token=one&type=signup&redirect_to=http%3A%2F%2F127.0.0.1%3A4174%2Fauth%2Fcallback',
          },
        ],
        'http://127.0.0.1:54321',
        'http://127.0.0.1:4173',
      ),
    /local callback link unavailable/,
  )
})

test('reads Mailpit message details for the exact probe recipient', async () => {
  const requested = []
  const messages = await readMailbox({
    endpoint: 'http://127.0.0.1:54324',
    email: 'signup-probe@probe.invalid',
    fetcher: async (url) => {
      requested.push(String(url))
      if (String(url).includes('/api/v1/messages?'))
        return new Response(JSON.stringify({ messages: [{ ID: 'mail-1' }, { ID: 'mail-2' }] }))
      const rightRecipient = String(url).endsWith('mail-1')
      return new Response(
        JSON.stringify({
          To: [{ Address: rightRecipient ? 'signup-probe@probe.invalid' : 'other@probe.invalid' }],
          Text: rightRecipient ? 'Confirm link' : 'unrelated',
          HTML: '',
          Subject: 'Confirm signup',
        }),
      )
    },
  })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].text, 'Confirm link')
  assert.match(requested[0], /\/api\/v1\/messages\?limit=50$/)
  assert.ok(requested[1].endsWith('/api/v1/message/mail-1'))
  assert.ok(requested[2].endsWith('/api/v1/message/mail-2'))
})

test('treats an empty Mailpit search as no delivered messages', async () => {
  assert.deepEqual(
    await readMailbox({
      endpoint: 'http://127.0.0.1:54324',
      email: 'signup-probe@probe.invalid',
      fetcher: async () => new Response(JSON.stringify({ messages: [] })),
    }),
    [],
  )
})

test('assigns isolated API, database, mail, and callback ports to a local project', () => {
  const config = localProjectConfig(
    'project_id = "base"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[inbucket]\nenabled = true\n[auth]\nsite_url = "http://localhost:4173"\nadditional_redirect_urls = ["http://localhost:4173"]\n[auth.email]\nenable_confirmations = true\n[auth.mfa.totp]\nenroll_enabled = true\n[studio]\nenabled = true\n',
    {
      projectId: 'probe-0123456789abcdef01234567',
      api: 41001,
      db: 41002,
      shadow: 41003,
      mail: 41004,
      smtp: 41005,
      pop3: 41006,
      inspector: 41007,
      origin: 'http://127.0.0.1:41008',
    },
    { signupJourney: true },
  )
  for (const value of [41001, 41002, 41003, 41004, 41005, 41006, 41007])
    assert.match(config, new RegExp(`= ${value}(?:\\n|$)`))
  assert.match(config, /site_url = "http:\/\/127\.0\.0\.1:41008"/)
  assert.match(
    config,
    /additional_redirect_urls = \["http:\/\/127\.0\.0\.1:41008\/auth\/callback"\]/,
  )
  assert.match(
    config,
    /\[local_smtp\][\s\S]*?enabled = true[\s\S]*?port = 41004[\s\S]*?smtp_port = 41005/,
  )
  assert.match(
    config,
    /\[auth\.email\.template\.confirmation\][\s\S]*?content_path = "\.\/supabase\/templates\/confirmation\.html"/,
  )
  assert.doesNotMatch(config, /\[auth\.email\.smtp\]/)
  assert.equal((config.match(/\[auth\.email\]/g) ?? []).length, 1)
  assert.match(config, /\[auth\.mfa\.totp\]/)
  assert.throws(
    () =>
      localProjectConfig('project_id = "base"\n', {
        projectId: 'probe-0123456789abcdef01234567',
        api: 41008,
        db: 41002,
        shadow: 41003,
        mail: 41004,
        smtp: 41005,
        pop3: 41006,
        inspector: 41007,
        origin: 'http://127.0.0.1:41008',
      }),
    /Invalid isolated local project ports/,
  )
})

test('allows only the local registration function for startup readiness', async () => {
  let requested = ''
  const response = await loopbackRequest(
    'http://127.0.0.1:54321',
    '/functions/v1/account-registration',
    {
      key: 'anon',
      token: 'anon',
      origin: 'http://127.0.0.1:4173',
      body: {},
      fetcher: async (url) => {
        requested = url
        return new Response(JSON.stringify({ state: 'blocked' }), { status: 202 })
      },
    },
  )
  assert.equal(response.state, 'blocked')
  assert.equal(requested, 'http://127.0.0.1:54321/functions/v1/account-registration')
  await assert.rejects(
    loopbackRequest('http://127.0.0.1:54321', '/functions/v1/unrelated', { key: 'anon' }),
    /Unexpected local request route/,
  )
})
