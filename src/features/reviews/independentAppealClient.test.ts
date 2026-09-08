import { describe, expect, it, vi } from 'vitest'
import {
  createIndependentAppealClient,
  preflightIndependentAppeal,
  readIndependentAppealToken,
} from './independentAppealClient'

describe('independent appeal client', () => {
  it('maps the appeal-only command boundary without actor or role fields', async () => {
    const execute = vi.fn(async () => ({ state: 'ready' }))
    const client = createIndependentAppealClient({ execute })
    await client.getPacket('A'.repeat(32), '00000000-0000-4000-8000-000000000001')
    expect(execute).toHaveBeenCalledWith({
      operation: 'packet',
      payload: {
        capabilityToken: 'A'.repeat(32),
        assertionReceiptId: '00000000-0000-4000-8000-000000000001',
      },
    })
    expect(JSON.stringify(execute.mock.calls[0][0])).not.toMatch(/actor|role|mfa/iu)
  })

  it('accepts only an opaque fragment token and scrubs it before route use', () => {
    const token = 'A'.repeat(32)
    expect(readIndependentAppealToken(`#token=${token}`)).toBe(token)
    expect(readIndependentAppealToken('#token=short')).toBeNull()
    const replaceState = vi.fn()
    const head = document.createElement('head')
    const tokenFromPreflight = preflightIndependentAppeal(
      { pathname: '/appeal-review', hash: `#token=${token}` },
      { replaceState },
      { head, createElement: document.createElement.bind(document) } as unknown as Document,
    )
    expect(tokenFromPreflight).toBe(token)
    expect(replaceState).toHaveBeenCalledWith(null, '', '/appeal-review')
    expect(head.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    expect(head.querySelector('meta[name="cache-control"]')).toHaveAttribute(
      'content',
      'private, no-store',
    )
  })
})
