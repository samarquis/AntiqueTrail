import { describe, expect, it, vi } from 'vitest'
import { canEditTripIdea, canReadShare, IdempotencyLedger, normalizeCandidateUrl, normalizeRecipientEmail, recipientEmailHmac, recipientShareView, senderShareView } from './boundary'

const share = { id: 'share-1', senderId: 'sender', recipientId: 'recipient', recipientEmailHmac: 'hmac', state: 'pending' as const, expiresAt: 2_000, version: 1 }

describe('candidate private boundary', () => {
  it('normalizes URL capture and rejects SSRF-sensitive destinations', () => {
    expect(normalizeCandidateUrl(' https://Example.com/store#private ')).toEqual({ url: 'https://example.com/store', host: 'example.com' })
    expect(normalizeCandidateUrl('http://127.0.0.1/admin')).toBeNull()
    expect(normalizeCandidateUrl('https://user:pass@example.com')).toBeNull()
  })

  it('HMACs normalized recipient email without exposing the raw address', async () => {
    const hmac = vi.fn(async (email: string) => `hmac:length-${email.length}`)
    const result = await recipientEmailHmac('  User@Example.COM ', hmac)
    expect(result).toBe('hmac:length-16')
    expect(hmac).toHaveBeenCalledWith('user@example.com')
    expect(result).not.toContain('@example.com')
    expect(normalizeRecipientEmail(' User@Example.COM ')).toBe('user@example.com')
  })

  it('isolates sender/recipient and closes expired shares without reason leakage', () => {
    expect(canReadShare('sender', share, 1_000)).toBe(true)
    expect(canReadShare('other', share, 1_000)).toBe(false)
    expect(canReadShare('recipient', share, 2_000)).toBe(false)
    expect(senderShareView('sender', share, 1_000)).toEqual({ accepted: false, state: 'pending', message: 'Pending' })
    expect(senderShareView('sender', { ...share, state: 'closed' }, 1_000)).toEqual({ accepted: false, state: 'closed', message: 'Closed' })
    expect(recipientShareView('other', share, 1_000).message).toBe('This item is not available.')
    expect(canEditTripIdea('sender', { id: 'idea', ownerUserId: 'recipient', title: 'x', urlNote: '', version: 1 })).toBe(false)
  })

  it('replays idempotent commands and rejects changed payloads', () => {
    const ledger = new IdempotencyLedger<{ state: string }>()
    const operation = vi.fn(() => ({ state: 'pending' }))
    expect(ledger.execute('send-1', { share: 'share-1' }, operation)).toEqual({ state: 'pending' })
    expect(ledger.execute('send-1', { share: 'share-1' }, operation)).toEqual({ state: 'pending' })
    expect(operation).toHaveBeenCalledOnce()
    expect(() => ledger.execute('send-1', { share: 'share-2' }, operation)).toThrow('idempotency_mismatch')
  })
})
