import { describe, expect, it } from 'vitest'
import {
  CandidateExtractionService,
  type CandidateExtractionDependencies,
  type CandidateExtractionResponse,
} from './candidateExtraction'

function response(
  overrides: Partial<CandidateExtractionResponse> = {},
): CandidateExtractionResponse {
  return {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    connectedAddress: '93.184.216.34',
    body: (async function* () {
      yield new TextEncoder().encode(
        '<html><head><title>Oak &amp; Pine Antiques</title></head></html>',
      )
    })(),
    ...overrides,
  }
}

function dependencies(
  overrides: Partial<CandidateExtractionDependencies> = {},
): CandidateExtractionDependencies {
  return {
    rateLimiter: { consume: async () => true },
    resolver: { resolve: async () => ['93.184.216.34'] },
    transport: { requestPinned: async () => response() },
    ...overrides,
  }
}

describe('candidate extraction service', () => {
  it('returns unverified suggestions while preserving the original private link and note', async () => {
    const service = new CandidateExtractionService(dependencies())

    await expect(
      service.extract({
        actorKey: 'shopper-1',
        link: ' https://Example.com/store#spring-sale ',
        note: 'Check the oak cabinet',
      }),
    ).resolves.toEqual({
      mode: 'suggestions',
      originalLink: 'https://Example.com/store#spring-sale',
      originalNote: 'Check the oak cabinet',
      normalizedUrl: 'https://example.com/store',
      destinationHost: 'example.com',
      suggestions: {
        title: 'Oak & Pine Antiques',
        description: null,
        canonicalUrl: null,
        verified: false,
      },
      publicWriteAllowed: false,
    })
  })

  it('uses manual fallback for a hostname that resolves to a private address', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        resolver: { resolve: async () => ['10.20.30.40'] },
        transport: {
          requestPinned: async () => {
            throw new Error('private destinations must never be requested')
          },
        },
      }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://internal.example/inventory',
      note: 'Keep this note',
    })

    expect(result).toMatchObject({
      mode: 'manual_fallback',
      reason: 'private_destination',
      originalLink: 'https://internal.example/inventory',
      originalNote: 'Keep this note',
      publicWriteAllowed: false,
    })
  })

  it('rejects DNS rebinding between the pinned request and post-request check', async () => {
    let resolution = 0
    const service = new CandidateExtractionService(
      dependencies({
        resolver: {
          resolve: async () => (++resolution === 1 ? ['93.184.216.34'] : ['127.0.0.1']),
        },
      }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/inventory',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason: 'dns_rebinding' })
  })

  it('revalidates every redirect destination before following it', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        resolver: {
          resolve: async (host) => (host === 'example.com' ? ['93.184.216.34'] : ['192.168.1.10']),
        },
        transport: {
          requestPinned: async () =>
            response({
              status: 302,
              headers: { location: 'http://router.example/admin' },
              body: null,
            }),
        },
      }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/start',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason: 'private_destination' })
  })

  it.each([
    {
      name: 'unsupported content',
      response: response({ headers: { 'content-type': 'application/pdf' } }),
      reason: 'unsupported_content',
    },
    {
      name: 'oversized declared content',
      response: response({
        headers: { 'content-type': 'text/html', 'content-length': '600000' },
      }),
      reason: 'response_too_large',
    },
  ])('falls back for $name', async ({ response: extractionResponse, reason }) => {
    const service = new CandidateExtractionService(
      dependencies({ transport: { requestPinned: async () => extractionResponse } }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/item',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason })
  })

  it('stops reading when a streamed response exceeds the byte limit', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        transport: {
          requestPinned: async () =>
            response({
              body: (async function* () {
                yield new Uint8Array(400_000)
                yield new Uint8Array(200_000)
              })(),
            }),
        },
      }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/item',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason: 'response_too_large' })
  })

  it('fails closed when the request exceeds its deadline', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        transport: {
          requestPinned: async () => new Promise<CandidateExtractionResponse>(() => undefined),
        },
      }),
      { requestTimeoutMs: 5 },
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/slow',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason: 'timeout' })
  })

  it('applies the deadline while reading a stalled response body', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        transport: {
          requestPinned: async () =>
            response({
              body: (async function* () {
                await new Promise(() => undefined)
                yield new Uint8Array()
              })(),
            }),
        },
      }),
      { requestTimeoutMs: 5 },
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/slow-body',
      note: '',
    })

    expect(result).toMatchObject({ mode: 'manual_fallback', reason: 'timeout' })
  })

  it('does not resolve or request a source after the actor reaches the extraction rate limit', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        rateLimiter: { consume: async () => false },
        resolver: {
          resolve: async () => {
            throw new Error('rate-limited requests must stop before DNS')
          },
        },
      }),
    )

    const result = await service.extract({
      actorKey: 'shopper-1',
      link: 'https://example.com/item',
      note: 'Manual details survive',
    })

    expect(result).toMatchObject({
      mode: 'manual_fallback',
      reason: 'rate_limited',
      originalNote: 'Manual details survive',
    })
  })
})
