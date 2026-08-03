import { describe, expect, it } from 'vitest'
import {
  authorizeRoute,
  genericAuthFailure,
  isSessionActive,
  parseAuthCallback,
  scrubCallbackUrl,
} from './authBoundary'

const activeShopper = {
  state: 'active' as const,
  accountState: 'active' as const,
  role: 'shopper' as const,
  sessionEpoch: 2,
  currentEpoch: 2,
}

describe('auth route boundary', () => {
  it('allows anonymous catalog browsing but fails private routes closed', () => {
    expect(authorizeRoute('/stores')).toBe('public')
    expect(authorizeRoute('/stores/blue-finch')).toBe('public')
    expect(authorizeRoute('/account/privacy')).toBe('forbidden')
    expect(authorizeRoute('/admin')).toBe('forbidden')
  })

  it('enforces role and session epoch boundaries', () => {
    expect(authorizeRoute('/account/privacy', activeShopper)).toBe('authenticated')
    expect(authorizeRoute('/admin', activeShopper)).toBe('forbidden')
    expect(isSessionActive({ ...activeShopper, currentEpoch: 3 })).toBe(false)
    expect(isSessionActive({ ...activeShopper, state: 'revoked' })).toBe(false)
    expect(isSessionActive({ ...activeShopper, accountState: 'deletion_scheduled' })).toBe(false)
  })
})

describe('callback and failure privacy boundaries', () => {
  it('accepts only verify/recovery callback types and keeps bearer in memory', () => {
    expect(parseAuthCallback('#token_hash=abc123&type=verify')).toEqual({
      kind: 'verify',
      tokenHash: 'abc123',
    })
    expect(parseAuthCallback('#token_hash=abc123&type=recovery')).toEqual({
      kind: 'recovery',
      tokenHash: 'abc123',
    })
    expect(parseAuthCallback('#token_hash=abc123&type=signup')).toBeNull()
    expect(scrubCallbackUrl()).toBe('/auth/verify')
    expect(scrubCallbackUrl('recovery')).toBe('/auth/recovery')
  })

  it('uses one indistinguishable failure for unknown, blocked, or expired accounts', () => {
    expect(genericAuthFailure()).toEqual(genericAuthFailure())
    expect(genericAuthFailure().message).not.toMatch(/account|email|user|exist/i)
  })
})
