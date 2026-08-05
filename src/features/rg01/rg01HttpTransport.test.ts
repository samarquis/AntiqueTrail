import { describe, expect, it, vi } from 'vitest'
import { createRG01HttpTransport } from './rg01HttpTransport'

describe('RG-01 HTTP transport', () => {
  it('uses authenticated no-store requests without credentials or referrer', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'current' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const transport = createRG01HttpTransport({
      endpoint: 'https://example.test/functions/v1/rg01-command',
      getAccessToken: async () => 'token',
      fetcher,
    })
    await transport.execute({ operation: 'status', payload: {} })
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/functions/v1/rg01-command',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    )
  })

  it('fails closed for insecure endpoints and server errors', async () => {
    expect(() =>
      createRG01HttpTransport({
        endpoint: 'http://example.test/rg01',
        getAccessToken: async () => 'x',
      }),
    ).toThrow(/HTTPS/u)
    const transport = createRG01HttpTransport({
      endpoint: 'https://example.test/rg01',
      getAccessToken: async () => 'x',
      fetcher: vi.fn(async () => new Response('{}', { status: 503 })),
    })
    await expect(transport.execute({ operation: 'status', payload: {} })).rejects.toThrow()
  })
})
