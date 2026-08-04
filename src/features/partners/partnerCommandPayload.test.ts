import { describe, expect, it } from 'vitest'
import { prepareSyntheticPartnerPayload } from '../../../supabase/functions/_shared/partner-command-payload'

describe('partner provider payload minimization', () => {
  it('replaces raw signal evidence with a deterministic 32-byte HMAC', async () => {
    const result = await prepareSyntheticPartnerPayload(
      'submit_authority_signal',
      {
        input: {
          claimId: 'claim-1',
          channelClass: 'callback',
          evidenceReference: ' Call completed at test number ',
        },
      },
      { evidenceHmacSecret: 'test-only-secret' },
    )

    expect(result).toMatchObject({
      synthetic: true,
      input: { claimId: 'claim-1', channelClass: 'callback' },
    })
    expect((result.input as Record<string, unknown>).evidenceReference).toBeUndefined()
    expect((result.input as Record<string, unknown>).evidenceRefHmac).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails closed when a required secret is absent', async () => {
    await expect(
      prepareSyntheticPartnerPayload(
        'submit_authority_signal',
        { input: { evidenceReference: 'raw' } },
        {},
      ),
    ).rejects.toThrow('unavailable')
  })
})
