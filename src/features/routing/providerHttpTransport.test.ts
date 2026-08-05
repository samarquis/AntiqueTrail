import { describe, expect, it, vi } from 'vitest'
import { createRoutingProviderHttpTransport } from './providerHttpTransport'

describe('routing provider HTTP transport', () => {
  it('posts only the operation with no-store browser controls', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'quota', requestCount: 0, costUnits: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const transport = createRoutingProviderHttpTransport({
      endpoint: 'https://api.example.test/functions/v1/routing-provider',
      getAccessToken: async () => 'access-token',
      fetcher,
    })
    const input = {
      operation: 'geocode' as const,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      explicitAction: true,
      text: 'Topeka',
      purpose: 'start' as const,
    }
    await expect(
      transport.execute(input, { signal: new AbortController().signal }),
    ).resolves.toEqual({ status: 'quota', requestCount: 0, costUnits: 0 })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/functions/v1/routing-provider',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(input),
      }),
    )
  })

  it('fails closed for an insecure endpoint or malformed response', async () => {
    expect(() =>
      createRoutingProviderHttpTransport({
        endpoint: 'http://example.test/provider',
        getAccessToken: async () => 'token',
      }),
    ).toThrow(/HTTPS/u)
    const transport = createRoutingProviderHttpTransport({
      endpoint: 'https://example.test/provider',
      getAccessToken: async () => 'token',
      fetcher: vi.fn(async () => new Response('{"status":"ok"}', { status: 200 })),
    })
    await expect(
      transport.execute(
        {
          operation: 'matrix',
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
          explicitAction: true,
          coordinates: [
            { latitude: 39, longitude: -95 },
            { latitude: 39.1, longitude: -95.1 },
          ],
        },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ status: 'outage', requestCount: 0, costUnits: 0 })
  })
})
