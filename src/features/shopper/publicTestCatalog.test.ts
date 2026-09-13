// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createPublicCatalogHandler } from '../../../supabase/functions/_shared/public-catalog'

const origin = 'https://antique-trail.vercel.app'
function setup(overrides = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'fictional' }], error: null })
  const verify = vi.fn().mockResolvedValue(null)
  const handler = createPublicCatalogHandler(
    {
      url: 'https://uaupykgpegbseboklubv.supabase.co',
      anonKey: 'anon',
      gatewayJwt: 'server-only',
      allowedOrigin: origin,
      rateSalt: 'server-salt',
      publicTest: true,
      ...overrides,
    },
    { gateway: () => ({ rpc }), verify },
  )
  return { rpc, verify, handler }
}
function request(operation = 'list', requestOrigin = origin) {
  return new Request('https://uaupykgpegbseboklubv.supabase.co/functions/v1/public-catalog', {
    method: 'POST',
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, args: {} }),
  })
}
const connection = { remoteAddr: { hostname: '192.0.2.10' } }
describe('public test catalog transport', () => {
  it('admits unsigned catalog requests through only the dedicated bounded RPC', async () => {
    const { handler, rpc, verify } = setup()
    const response = await handler(request(), connection)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [{ id: 'fictional' }] })
    expect(verify).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledExactlyOnceWith('public_test_catalog_gateway_request', {
      p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_operation: 'list',
      p_args: {},
    })
  })
  it('fails closed on expired or revoked scope without an older-stage fallback', async () => {
    const { handler, rpc } = setup()
    rpc.mockResolvedValue({ data: null, error: { message: 'public_test_unavailable' } })
    expect((await handler(request(), connection)).status).toBe(503)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  it('rejects a different request origin before contacting the backend', async () => {
    const { handler, rpc } = setup()
    expect((await handler(request('list', 'https://evil.example'), connection)).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('rejects a different configured backend even with internally matching credentials', async () => {
    const { handler, rpc } = setup({ url: 'https://other-project.supabase.co' })
    expect((await handler(request(), connection)).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not trust an IP header when the runtime address is unavailable', async () => {
    const { handler, rpc } = setup()
    const forged = request()
    forged.headers.set('x-forwarded-for', '192.0.2.10')
    expect((await handler(forged)).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('keeps maps outside this public-test scope', async () => {
    const { handler, rpc } = setup()
    expect((await handler(request('map'), connection)).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('preserves bounded retry behavior on rate rejection', async () => {
    const { handler, rpc } = setup()
    rpc.mockResolvedValue({ data: null, error: { message: 'catalog_rate_limited' } })
    const response = await handler(request(), connection)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('300')
  })
})
