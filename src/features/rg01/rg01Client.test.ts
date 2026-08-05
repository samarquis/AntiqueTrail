import { describe, expect, it, vi } from 'vitest'
import { createRG01Client, RG01CommandError, type RG01Transport } from './rg01Client'

const runId = '11111111-1111-4111-8111-111111111111'
const key = '22222222-2222-4222-8222-222222222222'

describe('RG-01 operational client', () => {
  it('sends only constrained begin and freeze commands', async () => {
    const transport: RG01Transport = { execute: vi.fn(async () => ({ state: 'collecting' })) }
    const client = createRG01Client(transport)
    await client.begin({
      runId,
      idempotencyKey: key,
      windowStart: '2026-02-06T00:00:00.000Z',
      windowEnd: '2026-08-05T00:00:00.000Z',
    })
    await client.freeze(runId, key)
    expect(transport.execute).toHaveBeenNthCalledWith(1, {
      operation: 'begin',
      payload: {
        runId,
        idempotencyKey: key,
        windowStart: '2026-02-06T00:00:00.000Z',
        windowEnd: '2026-08-05T00:00:00.000Z',
      },
    })
    expect(transport.execute).toHaveBeenNthCalledWith(2, {
      operation: 'freeze',
      payload: { runId, idempotencyKey: key },
    })
    expect(JSON.stringify(vi.mocked(transport.execute).mock.calls)).not.toMatch(
      /total|denominator|exclusion|signature|tripContents|supportContent/iu,
    )
  })

  it('requests and consumes a Product Owner challenge without accepting a signature', async () => {
    const transport: RG01Transport = { execute: vi.fn(async () => ({ state: 'pending' })) }
    const client = createRG01Client(transport)
    await client.requestDecision(runId, 'reject', key)
    await client.consumeDecision('33333333-3333-4333-8333-333333333333', 'a'.repeat(64), key)
    expect(transport.execute).toHaveBeenLastCalledWith({
      operation: 'consume_decision',
      payload: {
        challengeId: '33333333-3333-4333-8333-333333333333',
        payloadDigest: 'a'.repeat(64),
        idempotencyKey: key,
      },
    })
  })

  it('maps operational failures to a content-free error', async () => {
    const client = createRG01Client({
      execute: vi.fn(async () => {
        throw new Error('private')
      }),
    })
    await expect(client.status()).rejects.toEqual(new RG01CommandError())
  })
})
