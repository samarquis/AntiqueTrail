import { describe, expect, it, vi } from 'vitest'
import {
  handlePartnerAdminInvitation,
  type PartnerAdminInvitationDependencies,
} from '../../../supabase/functions/_shared/partner-admin-invitation'

function dependencies(
  overrides: Partial<PartnerAdminInvitationDependencies> = {},
): PartnerAdminInvitationDependencies {
  return {
    syntheticEnabled: true,
    appOrigin: 'https://app.example.test',
    emailHmacSecret: 'test-secret-at-least-32-characters',
    hmacKeyVersion: 1,
    issue: vi.fn(async () => ({
      invitationId: 'invitation-1',
      token: 'one-time-token',
      expiresAt: '2026-08-04T12:30:00Z',
    })),
    ...overrides,
  }
}

describe('partner Administrator invitation provider boundary', () => {
  it('normalizes and HMACs the email before the SQL boundary', async () => {
    const boundary = dependencies()
    const response = await handlePartnerAdminInvitation(
      new Request('https://example.test', {
        method: 'POST',
        headers: {
          authorization: 'Bearer session',
          'content-type': 'application/json',
          origin: 'https://app.example.test',
        },
        body: JSON.stringify({ email: ' Owner@Example.COM ', idempotencyKey: 'invite-owner-1' }),
      }),
      boundary,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.test')
    expect(response.headers.get('Vary')).toBe('Authorization, Origin')
    expect(boundary.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: 'Bearer session',
        recipientEmailHmac: expect.stringMatching(/^\\x[0-9a-f]{64}$/),
        hmacKeyVersion: 1,
        idempotencyKey: 'invite-owner-1',
      }),
    )
    const issued = vi.mocked(boundary.issue).mock.calls[0]?.[0]
    expect(JSON.stringify(issued)).not.toContain('Owner@Example.COM')
  })

  it('fails closed when synthetic issuance is disabled or input is malformed', async () => {
    const boundary = dependencies({ syntheticEnabled: false })
    const response = await handlePartnerAdminInvitation(
      new Request('https://example.test', {
        method: 'POST',
        headers: {
          authorization: 'Bearer session',
          'content-type': 'application/json',
          origin: 'https://app.example.test',
        },
        body: JSON.stringify({ email: 'owner@example.com', idempotencyKey: 'invite-owner-1' }),
      }),
      boundary,
    )
    expect(response.status).toBe(503)
    expect(boundary.issue).not.toHaveBeenCalled()
  })

  it('answers exact-origin preflight and rejects every other origin', async () => {
    const boundary = dependencies()
    const allowed = await handlePartnerAdminInvitation(
      new Request('https://example.test', {
        method: 'OPTIONS',
        headers: { origin: 'https://app.example.test' },
      }),
      boundary,
    )
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.test')
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
    expect(allowed.headers.get('Access-Control-Allow-Headers')).toContain('authorization')

    const denied = await handlePartnerAdminInvitation(
      new Request('https://example.test', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
      boundary,
    )
    expect(denied.status).toBe(403)
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(denied.headers.get('Vary')).toBe('Authorization, Origin')
  })

  it('rejects a cross-origin POST before invitation issuance', async () => {
    const boundary = dependencies()
    const response = await handlePartnerAdminInvitation(
      new Request('https://example.test', {
        method: 'POST',
        headers: {
          authorization: 'Bearer session',
          'content-type': 'application/json',
          origin: 'https://evil.example',
        },
        body: JSON.stringify({ email: 'owner@example.com', idempotencyKey: 'invite-owner-1' }),
      }),
      boundary,
    )
    expect(response.status).toBe(403)
    expect(boundary.issue).not.toHaveBeenCalled()
  })
})
