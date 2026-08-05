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
    compressedBytes: 80,
    decompressedBytes: 80,
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

  it('enforces the normative pinned-request limits and strips ambient authority headers', async () => {
    let observed:
      | Parameters<CandidateExtractionDependencies['transport']['requestPinned']>[0]
      | null = null
    const service = new CandidateExtractionService(
      dependencies({
        transport: {
          requestPinned: async (request) => {
            observed = request
            return response()
          },
        },
      }),
    )

    await service.extract({ actorKey: 'shopper-1', link: 'https://example.com', note: '' })
    expect(observed).toMatchObject({
      connectTimeoutMs: 2_000,
      maxCompressedBytes: 1_048_576,
      maxDecompressedBytes: 2_097_152,
      stripHeaders: ['authorization', 'cookie', 'origin', 'proxy-authorization', 'referer'],
    })
  })

  it.each(['http://example.com:80/store', 'https://example.com:443/store'])(
    'permits only the explicit default HTTP(S) ports: %s',
    async (link) => {
      const service = new CandidateExtractionService(dependencies())
      await expect(
        service.extract({ actorKey: 'shopper-1', link, note: '' }),
      ).resolves.toMatchObject({
        mode: 'suggestions',
      })
    },
  )

  it('rejects non-contract ports before DNS or transport', async () => {
    const service = new CandidateExtractionService(
      dependencies({
        resolver: { resolve: async () => Promise.reject(new Error('must not resolve')) },
      }),
    )
    await expect(
      service.extract({ actorKey: 'shopper-1', link: 'https://example.com:8443/store', note: '' }),
    ).resolves.toMatchObject({ mode: 'manual_fallback', reason: 'invalid_link' })
  })

  it('accepts bounded plain text as unverified private suggestions', async () => {
    const body = new TextEncoder().encode('Oak Street Antiques\nFurniture and vintage tools')
    const service = new CandidateExtractionService(
      dependencies({
        transport: {
          requestPinned: async () =>
            response({
              headers: { 'content-type': 'text/plain' },
              compressedBytes: body.byteLength,
              decompressedBytes: body.byteLength,
              body: (async function* () {
                yield body
              })(),
            }),
        },
      }),
    )
    await expect(
      service.extract({ actorKey: 'shopper-1', link: 'https://example.com/store.txt', note: '' }),
    ).resolves.toMatchObject({
      mode: 'suggestions',
      suggestions: { title: 'Oak Street Antiques', description: 'Furniture and vintage tools' },
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
        headers: { 'content-type': 'text/html', 'content-length': '1048577' },
        compressedBytes: 1_048_577,
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
                yield new Uint8Array(1_500_000)
                yield new Uint8Array(700_000)
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
