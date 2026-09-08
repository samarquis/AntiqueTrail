import { describe, expect, it, vi } from 'vitest'
import {
  createOwnConsentClient,
  GENERIC_OWN_CONSENT_ERROR,
  parseOwnConsentStatus,
} from './ownConsentClient'

const available = {
  status: 'available',
  collectionActive: true,
  consentState: 'not_consented',
  consentedAt: null,
  withdrawnAt: null,
}

describe('own RG-01 consent client', () => {
  it('accepts only the privacy-minimized projection shape', () => {
    expect(parseOwnConsentStatus(available)).toEqual({
      kind: 'available',
      collectionActive: true,
      consentState: 'not_consented',
      consentedAt: null,
      withdrawnAt: null,
    })
    expect(parseOwnConsentStatus({ status: 'unavailable', collectionActive: false })).toEqual({
      kind: 'unavailable',
      collectionActive: false,
    })
    expect(() =>
      parseOwnConsentStatus({ ...available, subjectId: 'sibling-subject', metrics: {} }),
    ).toThrow(GENERIC_OWN_CONSENT_ERROR)
  })

  it('refreshes confirmed state after an explicit write and never sends an actor ID', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...available,
        consentState: 'consented',
        consentedAt: '2026-09-07T12:00:00Z',
      })
    const client = createOwnConsentClient(rpc)

    await expect(client.setConsent(true)).resolves.toMatchObject({
      kind: 'available',
      consentState: 'consented',
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'rg01_set_own_consent', { p_consent: true })
    expect(rpc).toHaveBeenNthCalledWith(2, 'rg01_get_own_consent', {})
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('userId')
  })

  it('fails closed on malformed or invalid timestamps', () => {
    expect(() => parseOwnConsentStatus({ ...available, consentedAt: 'not-a-date' })).toThrow(
      GENERIC_OWN_CONSENT_ERROR,
    )
    expect(() =>
      parseOwnConsentStatus({
        status: 'available',
        collectionActive: false,
        consentState: 'consented',
        consentedAt: null,
        withdrawnAt: null,
      }),
    ).toThrow(GENERIC_OWN_CONSENT_ERROR)
  })
})
