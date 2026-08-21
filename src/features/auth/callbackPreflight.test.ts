import { afterEach, describe, expect, it } from 'vitest'
import { preflightAuthCallback, takePreflightAuthCallback } from './callbackPreflight'

describe('auth callback preflight', () => {
  afterEach(() => {
    takePreflightAuthCallback()
    document.head
      .querySelectorAll('meta[name="referrer"], meta[name="cache-control"]')
      .forEach((node) => node.remove())
  })

  it('replaces the fragment before use and retains the credential in memory for one read', () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback?returnTo=%2Fsaved#token_hash=secret-a&type=verify',
    )
    expect(preflightAuthCallback()).toEqual({ kind: 'verify', tokenHash: 'secret-a' })
    expect(window.location.href).not.toContain('secret-a')
    expect(window.location.pathname + window.location.search).toBe(
      '/auth/callback?returnTo=%2Fsaved',
    )
    expect(takePreflightAuthCallback()).toEqual({ kind: 'verify', tokenHash: 'secret-a' })
    expect(takePreflightAuthCallback()).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('sets no-referrer and no-store metadata and cannot restore the fragment through history', () => {
    window.history.replaceState({}, '', '/auth/callback#token_hash=secret-b&type=recovery')
    preflightAuthCallback()
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    )
    expect(document.head.querySelector('meta[name="cache-control"]')).toHaveAttribute(
      'content',
      'no-store',
    )
    window.history.back()
    expect(window.location.hash).toBe('')
  })

  it('captures an OAuth PKCE code, strips only OAuth params, and preserves returnTo', () => {
    window.history.replaceState({}, '', '/auth/callback?code=pkce-code-1&returnTo=%2Fsaved')
    expect(preflightAuthCallback()).toEqual({ kind: 'oauth', code: 'pkce-code-1' })
    expect(window.location.pathname + window.location.search).toBe(
      '/auth/callback?returnTo=%2Fsaved',
    )
    expect(takePreflightAuthCallback()).toEqual({ kind: 'oauth', code: 'pkce-code-1' })
    expect(takePreflightAuthCallback()).toBeNull()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('captures a provider cancellation without leaving the error in the URL', () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback?error=access_denied&error_description=user+cancelled',
    )
    expect(preflightAuthCallback()).toEqual({ kind: 'oauth', oauthError: 'access_denied' })
    expect(window.location.search).toBe('')
  })
})
