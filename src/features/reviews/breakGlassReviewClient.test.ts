import { describe, expect, it, vi } from 'vitest'
import {
  createBreakGlassReviewClient,
  preflightBreakGlassReview,
  type BreakGlassReviewTransport,
} from './breakGlassReviewClient'

const token = 'A'.repeat(43)
const id = '11111111-1111-4111-8111-111111111111'

describe('break-glass review client', () => {
  it('sends only the capability, packet hash, decision, and receipt references', async () => {
    const transport: BreakGlassReviewTransport = { execute: vi.fn(async () => ({})) }
    const client = createBreakGlassReviewClient(transport)
    await client.getPacket(token)
    await client.submit({
      capabilityToken: token,
      assertionReceiptId: id,
      packetHash: 'a'.repeat(64),
      decision: 'Compliant',
      reason: 'Reviewed the authorized scope.',
      followUpReference: 'incident-1',
      idempotencyKey: id,
    })
    expect(JSON.stringify(vi.mocked(transport.execute).mock.calls)).not.toMatch(
      /email|userId|session|rawRecord|reviewerName/iu,
    )
  })

  it('scrubs the fragment before rendering and applies private response metadata', () => {
    const replaceState = vi.fn()
    const head = document.createElement('head')
    const documentRoot = {
      head,
      createElement: document.createElement.bind(document),
    } as unknown as Document
    const token = preflightBreakGlassReview(
      { pathname: '/break-glass-review', hash: '#token=' + 'A'.repeat(43) },
      { replaceState },
      documentRoot,
    )
    expect(token).toHaveLength(43)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/break-glass-review')
    expect(head.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    expect(head.querySelector('meta[name="cache-control"]')).toHaveAttribute('content', 'no-store')
  })
})
