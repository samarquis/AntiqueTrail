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
