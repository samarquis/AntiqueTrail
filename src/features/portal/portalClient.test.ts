import { describe, expect, it, vi } from 'vitest'
import {
  GENERIC_PORTAL_ERROR,
  createPortalClient,
  createPortalMediaHttpTransport,
  decodePortalMediaUploadHistory,
  unavailablePortalClient,
} from './portalClient'

describe('production portal client', () => {
  it('routes every durable portal action through the bounded RPC contract', async () => {
    const rpc = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => ({
      data:
        name === 'portal_remove_official_link'
          ? { removed: true }
          : name === 'portal_list_media_uploads'
            ? { uploads: [] }
            : { name, args },
      error: null,
    }))
    const client = createPortalClient(
      { rpc },
      () => [{ key: 'route', label: 'Current screen', value: '/store-portal' }],
      {
        upload: vi.fn(async () => ({
          uploadId: '11111111-1111-4111-8111-111111111111',
          state: 'awaiting_review' as const,
        })),
      },
    )
    const hours = { timeZone: 'America/Chicago', weekly: [], holidays: [], version: 4 }

    await client.getHome()
    await client.getHours()
    await client.saveHours(hours)
    await client.saveManagedFields({ phone: '555-0100', website: '', description: 'Local store' })
    await client.submitControlledChange({ field: 'name', requestedValue: 'Oak', reason: 'Legal' })
    await client.getMediaCapability()
    await client.uploadOfficialMedia({
      storeId: '11111111-1111-4111-8111-111111111111',
      kind: 'gallery',
      altText: 'Front entrance',
      file: new File([new Uint8Array(32)], 'store.png', { type: 'image/png' }),
      rightsConfirmed: true,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    })
    await client.listMediaUploads()
    await client.resubmitMedia({
      originalUploadId: '33333333-3333-4333-8333-333333333333',
      storeId: '11111111-1111-4111-8111-111111111111',
      kind: 'gallery',
      file: new File([new Uint8Array(32)], 'replacement.png', { type: 'image/png' }),
      altText: 'Replacement front entrance',
      rightsConfirmed: true,
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
    })
    await client.listUpdates()
    await client.createUpdate({ type: 'announcement', headline: 'Hello', details: 'Details' })
    await client.archiveUpdate('update-1')
    await client.restoreUpdate('update-1')
    await client.listOfficialLinks()
    await client.saveOfficialLink({ platform: 'instagram', url: 'https://instagram.com/oak' })
    await client.removeOfficialLink('instagram')
    await client.listSupportTickets()
    await client.createSupportTicket({
      category: 'bug',
      subject: 'Cannot save',
      body: 'The save action failed.',
      diagnostics: [],
    })
    await client.replySupportTicket('ticket-1', 'More details')
    await client.confirmSupportResolution('ticket-1')
    await client.reopenSupportTicket('ticket-1')
    await client.previewPublicListing()

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'portal_get_home',
      'portal_get_hours',
      'portal_save_hours',
      'portal_save_managed_fields',
      'portal_submit_controlled_change',
      'media_get_capability',
      'portal_list_media_uploads',
      'portal_list_updates',
      'portal_create_update',
      'portal_archive_update',
      'portal_restore_update',
      'portal_list_official_links',
      'portal_save_official_link',
      'portal_remove_official_link',
      'portal_list_support_tickets',
      'portal_create_support_ticket',
      'portal_reply_support_ticket',
      'portal_confirm_support_resolution',
      'portal_reopen_support_ticket',
      'portal_preview_public_listing',
    ])
    expect(rpc).toHaveBeenCalledWith('portal_save_hours', { p_hours: hours })
    expect(await client.getDiagnostics()).toEqual([
      { key: 'route', label: 'Current screen', value: '/store-portal' },
    ])
  })

  it('returns one reason-neutral error for transport failures and malformed void responses', async () => {
    const failed = createPortalClient({
      rpc: vi.fn(async () => ({ data: null, error: new Error('private database detail') })),
    })
    await expect(failed.getHome()).rejects.toThrow(GENERIC_PORTAL_ERROR)
    await expect(failed.removeOfficialLink('facebook')).rejects.toThrow(GENERIC_PORTAL_ERROR)
  })

  it('preserves the scoped managed-field hydration payload from Portal home', async () => {
    const home = {
      store: {
        id: 'store-1',
        name: 'Oak Antiques',
        listingState: 'active',
        timeZone: 'America/Chicago',
      },
      freshness: { state: 'verified', label: 'Verified' },
      provenance: {
        sourceLabel: 'Owner confirmation',
        verifiedBy: 'Representative',
        verifiedAt: '2026-08-28',
        ownerConfirmed: true,
      },
      pendingChanges: [],
      managedFields: {
        phone: '785-555-0123',
        website: 'https://oak.example.invalid',
        description: 'Approved description.',
      },
    } as const
    const client = createPortalClient({
      rpc: vi.fn(async () => ({ data: home, error: null })),
    })

    await expect(client.getHome()).resolves.toMatchObject({ managedFields: home.managedFields })
  })

  it('keeps unavailable media-history actions on the generic portal error boundary', async () => {
    await expect(unavailablePortalClient.listMediaUploads()).rejects.toThrow(GENERIC_PORTAL_ERROR)
    await expect(
      unavailablePortalClient.resubmitMedia({
        originalUploadId: '33333333-3333-4333-8333-333333333333',
        storeId: '11111111-1111-4111-8111-111111111111',
        kind: 'gallery',
        file: new File([new Uint8Array(1)], 'replacement.png', { type: 'image/png' }),
        altText: 'Replacement',
        rightsConfirmed: true,
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toThrow(GENERIC_PORTAL_ERROR)
  })

  it('accepts only the six-field media-history response and rejects extra storage fields', async () => {
    const exact = {
      uploads: [
        {
          uploadId: '11111111-1111-4111-8111-111111111111',
          kind: 'gallery',
          state: 'rejected',
          altText: 'Front entrance',
          submittedAt: '2026-08-30T00:00:00Z',
          rejectionReason: 'Image quality insufficient for storefront',
        },
      ],
    }
    expect(decodePortalMediaUploadHistory(exact)).toEqual(exact)
    expect(() =>
      decodePortalMediaUploadHistory({
        uploads: [{ ...exact.uploads[0], originalObjectKey: 'quarantine/private/original' }],
      }),
    ).toThrow(GENERIC_PORTAL_ERROR)

    const client = createPortalClient({
      rpc: vi.fn(async () => ({
        data: { uploads: [{ ...exact.uploads[0], derivativeWidth: 640 }] },
        error: null,
      })),
    })
    await expect(client.listMediaUploads()).rejects.toThrow(GENERIC_PORTAL_ERROR)
  })

  it('uploads only through the authenticated bounded media endpoint', async () => {
    const requests: RequestInit[] = []
    const fetcher: typeof fetch = vi.fn(async (_input, init) => {
      requests.push(init ?? {})
      return Response.json(
        { uploadId: '11111111-1111-4111-8111-111111111111', state: 'awaiting_review' },
        { status: 202 },
      )
    })
    const transport = createPortalMediaHttpTransport({
      endpoint: 'https://project.supabase.co/functions/v1/media-provider-command',
      apiKey: 'public-anon-key',
      getAccessToken: async () => 'user-access-token',
      fetcher,
    })
    const file = new File([new Uint8Array(32)], 'store.png', { type: 'image/png' })
    await expect(
      transport.upload({
        storeId: '11111111-1111-4111-8111-111111111111',
        kind: 'gallery',
        altText: 'Front entrance',
        file,
        rightsConfirmed: true,
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      }),
    ).resolves.toMatchObject({ state: 'awaiting_review' })
    const request = requests[0]
    expect(request).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer user-access-token', apikey: 'public-anon-key' },
    })
    expect(request?.body).toBeInstanceOf(FormData)
    expect((request?.body as FormData).get('image')).toBe(file)
  })
})
