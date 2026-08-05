import { describe, expect, it, vi } from 'vitest'
import { createPartnerClient, PartnerApiError } from './partnerApi'

describe('partner API boundary', () => {
  it('sends invitation secrets only to the bounded exchange operation', async () => {
    const post = vi.fn(async () => ({ state: 'active', maskedRecipient: 's***@example.com' }))
    const client = createPartnerClient({ post })

    await expect(client.exchangeInvitation('opaque-secret')).resolves.toMatchObject({
      state: 'active',
    })
    expect(post).toHaveBeenCalledWith('exchange_invitation', { token: 'opaque-secret' })
  })

  it('uses a resume handle and stable idempotency key without replaying the invitation token', async () => {
    const post = vi.fn(async () => ({ state: 'active' }))
    const client = createPartnerClient({ post })
    await client.resumeInvitation('resume-handle-123456789')
    await client.acceptConsent({
      resumeHandle: 'resume-handle-123456789',
      idempotencyKey: 'partner-consent-attempt-1',
      identity: { name: 'Sam', title: 'Owner', store: 'Oak', email: 'owner@example.com' },
      acknowledgements: {
        authority: true,
        voluntary: true,
        permittedData: true,
        noPayment: true,
        withdrawal: true,
      },
    })
    expect(post.mock.calls).toEqual([
      ['resume_invitation', { resumeHandle: 'resume-handle-123456789' }],
      [
        'accept_consent',
        expect.objectContaining({
          resumeHandle: 'resume-handle-123456789',
          idempotencyKey: 'partner-consent-attempt-1',
        }),
      ],
    ])
    expect(post.mock.calls.flat()).not.toContain('opaque-secret')
  })

  it('uses implicit actor operations and never accepts a user id from callers', async () => {
    const post = vi.fn(async () => ({
      invitation: 'consumed',
      pendingIdentity: 'bound',
      onboarding: 'draft',
    }))
    const client = createPartnerClient({ post })

    await client.getStatus()
    await client.submitDraft()
    expect(post.mock.calls).toEqual([
      ['get_status', {}],
      ['submit_draft', {}],
    ])
  })

  it('normalizes transport failures to a reason-neutral error', async () => {
    const client = createPartnerClient({
      post: async () => {
        throw new Error('claim exists for private user 123')
      },
    })

    await expect(client.getClaimStatus()).rejects.toEqual(new PartnerApiError())
  })
})
