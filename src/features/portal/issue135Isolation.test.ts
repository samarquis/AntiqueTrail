import { describe, expect, it, vi } from 'vitest'
import { createPortalClient, GENERIC_PORTAL_ERROR } from './portalClient'
import { createPartnerClient } from '../partners/partnerApi'
import { GENERIC_PARTNER_ERROR } from '../partners/partnerClient'

describe('issue 135 production denial responses', () => {
  for (const cause of ['wrong_store', 'revoked', 'expired', 'stale_session', 'missing_case']) {
    it(`does not enumerate ${cause} through Portal reads or object mutations`, async () => {
      const rpc = vi.fn(async () => ({
        data: { privatePath: 'must-not-escape' },
        error: { message: cause },
      }))
      const client = createPortalClient({ rpc })
      const calls = [
        () => client.getHome(),
        () => client.getHours(),
        () => client.listUpdates(),
        () => client.listOfficialLinks(),
        () => client.listSupportTickets(),
        () => client.previewPublicListing(),
        () => client.listMediaUploads(),
        () => client.archiveUpdate('sibling-update'),
        () => client.restoreUpdate('guessed-update'),
        () => client.replySupportTicket('sibling-ticket', 'private reply'),
        () => client.confirmSupportResolution('guessed-ticket'),
        () => client.reopenSupportTicket('sibling-ticket'),
      ]
      for (const call of calls) await expect(call()).rejects.toThrow(GENERIC_PORTAL_ERROR)
      expect(rpc).toHaveBeenCalledTimes(calls.length)
    })

    it(`does not enumerate ${cause} through partner status or claim actions`, async () => {
      const post = vi.fn(async () => {
        throw new Error(`${cause}: private-case-detail`)
      })
      const client = createPartnerClient({ post })
      for (const call of [
        () => client.getStatus(),
        () => client.getClaimStatus(),
        () => client.withdrawClaim('sibling-case'),
        () => client.requestAuthorityRecheck('guessed-case'),
      ])
        await expect(call()).rejects.toThrow(GENERIC_PARTNER_ERROR)
      expect(post).toHaveBeenCalledTimes(4)
    })
  }
})
