import { describe, expect, it, vi } from 'vitest'
import { GENERIC_PORTAL_ERROR, createPortalClient } from './portalClient'

describe('production portal client', () => {
  it('routes every durable portal action through the bounded RPC contract', async () => {
    const rpc = vi.fn(async (name: string, args: Readonly<Record<string, unknown>>) => ({
      data: name === 'portal_remove_official_link' ? { removed: true } : { name, args },
      error: null,
    }))
    const client = createPortalClient({ rpc }, () => [
      { key: 'route', label: 'Current screen', value: '/store-portal' },
    ])
    const hours = { timeZone: 'America/Chicago', weekly: [], holidays: [], version: 4 }

    await client.getHome()
    await client.getHours()
    await client.saveHours(hours)
    await client.saveManagedFields({ phone: '555-0100', website: '', description: 'Local store' })
    await client.submitControlledChange({ field: 'name', requestedValue: 'Oak', reason: 'Legal' })
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
})
