import { afterEach, describe, expect, it } from 'vitest'
import {
  preflightReviewerCapability,
  readReviewerCapabilityToken,
  takePreflightReviewerCapability,
} from './reviewerCredentialBrowser'

describe('reviewer credential fragment preflight', () => {
  afterEach(() => {
    takePreflightReviewerCapability()
    document.head
      .querySelectorAll('meta[name="referrer"], meta[name="cache-control"]')
      .forEach((node) => node.remove())
  })

  it('scrubs setup, management, and recovery fragments before app import', () => {
    window.history.replaceState(
      {},
      '',
      '/reviewer/credentials?returnTo=%2Fstores#token=' + 'A'.repeat(43),
    )
    expect(preflightReviewerCapability()).toBe('A'.repeat(43))
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?returnTo=%2Fstores')
    expect(takePreflightReviewerCapability()).toBe('A'.repeat(43))
    expect(takePreflightReviewerCapability()).toBeNull()
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    )
    expect(document.head.querySelector('meta[name="cache-control"]')).toHaveAttribute(
      'content',
      'no-store',
    )
  })

  it('accepts only opaque capability tokens', () => {
    expect(readReviewerCapabilityToken('#token=' + 'A'.repeat(43))).toBe('A'.repeat(43))
    expect(readReviewerCapabilityToken('#token=short')).toBeNull()
    expect(readReviewerCapabilityToken('#username=reviewer')).toBeNull()
  })
})
