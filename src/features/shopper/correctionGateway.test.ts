import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

const modulePath = resolve('supabase/functions/_shared/correction-submit.ts')
const moduleUrl = pathToFileURL(modulePath)

interface Gateway {
  hmacSecret: string
  verify(token: string): Promise<{ userId: string; sessionId: string } | null>
  submit(args: Record<string, unknown>): Promise<{
    data: unknown
    error?: { code?: string; message?: string; details?: string } | null
  }>
}

const actor = {
  userId: '37700000-0000-4000-8000-000000000001',
  sessionId: '37700000-0000-4000-8000-000000000002',
}
const body = {
  storeId: '37700000-0000-4000-8000-000000000003',
  type: 'other',
  description: 'Fixture correction',
}
const request = (extra = {}, headers = {}) =>
  new Request('https://backend.example/correction-submit', {
    method: 'POST',
    headers: {
      authorization: 'Bearer provider-token',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ ...body, ...extra }),
  })
const gateway = (): Gateway => ({
  hmacSecret: 'local-test-only-secret-material-377',
  verify: vi.fn().mockResolvedValue(actor),
  submit: vi.fn().mockResolvedValue({ data: { id: 'report', state: 'submitted' }, error: null }),
})

async function loadHandler() {
  expect(existsSync(modulePath)).toBe(true)
  return import(/* @vite-ignore */ moduleUrl.href)
}

describe('trusted correction Edge', () => {
  it('uses provider identity and runtime IP despite forged body and forwarding context', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()
    const response = await handleCorrectionSubmit(
      request(
        { p_actor_user_id: 'forged', p_session_id: 'forged', p_ip_hmac: 'forged' },
        { 'x-forwarded-for': '203.0.113.1' },
      ),
      '192.0.2.14',
      transport,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'report', state: 'submitted' })
    expect(transport.verify).toHaveBeenCalledWith('provider-token')
    expect(transport.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        p_actor_user_id: actor.userId,
        p_session_id: actor.sessionId,
        p_ip_hmac: expect.stringMatching(/^\\x[0-9a-f]{64}$/u),
      }),
    )
    expect(JSON.stringify(vi.mocked(transport.submit).mock.calls)).not.toMatch(
      /forged|provider-token|192\.0\.2/u,
    )
  })

  it('keeps one IP aggregate across header spoofing and the same runtime network prefix', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()
    await handleCorrectionSubmit(
      request({}, { 'x-forwarded-for': '203.0.113.1' }),
      '192.0.2.14',
      transport,
    )
    await handleCorrectionSubmit(
      request({}, { 'x-forwarded-for': '198.51.100.1' }),
      '192.0.2.99',
      transport,
    )
    await handleCorrectionSubmit(request(), '192.0.3.14', transport)
    const keys = vi.mocked(transport.submit).mock.calls.map(([args]) => args.p_ip_hmac)

    expect(keys[0]).toBe(keys[1])
    expect(keys[0]).not.toBe(keys[2])
  })

  it('denies an unverified provider bearer before using privileged transport', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()
    vi.mocked(transport.verify).mockResolvedValue(null)

    expect((await handleCorrectionSubmit(request(), '192.0.2.14', transport)).status).toBe(401)
    expect(transport.submit).not.toHaveBeenCalled()
  })

  it('does not replace missing runtime IP with a supplied forwarding header', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()

    expect(
      (
        await handleCorrectionSubmit(
          request({}, { 'x-forwarded-for': '192.0.2.14' }),
          undefined,
          transport,
        )
      ).status,
    ).toBe(503)
    expect(transport.submit).not.toHaveBeenCalled()
  })

  it('does not grant authority when database rejects revoked or unentitled session', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()
    vi.mocked(transport.submit).mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'private backend detail' },
    })

    const response = await handleCorrectionSubmit(request(), '192.0.2.14', transport)
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('Unauthorized')
  })

  it('retains bounded rate-limit response without exposing private details', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    const transport = gateway()
    vi.mocked(transport.submit).mockResolvedValue({
      data: null,
      error: { code: '42900', details: JSON.stringify({ retryAfter: 120 }) },
    })

    const response = await handleCorrectionSubmit(request(), '192.0.2.14', transport)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
  })

  it('requires configured server transport', async () => {
    const { handleCorrectionSubmit } = await loadHandler()
    expect((await handleCorrectionSubmit(request(), '192.0.2.14', null)).status).toBe(503)
  })
})

describe('session extraction after provider verification', () => {
  const token = (claims: unknown) => `header.${btoa(JSON.stringify(claims))}.signature`

  it('binds token subject and session to provider-verified user', async () => {
    const { verifiedCorrectionSession } = await loadHandler()
    expect(
      verifiedCorrectionSession(
        token({ sub: actor.userId, session_id: actor.sessionId }),
        actor.userId,
      ),
    ).toEqual(actor)
    expect(
      verifiedCorrectionSession(
        token({ sub: 'another-user', session_id: actor.sessionId }),
        actor.userId,
      ),
    ).toBeNull()
    expect(
      verifiedCorrectionSession(token({ sub: actor.userId, session_id: 'forged' }), actor.userId),
    ).toBeNull()
  })
})
