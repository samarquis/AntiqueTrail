import { describe, expect, it, vi } from 'vitest'
import {
  createStoreApplicationClient,
  createStoreApplicationAdminClient,
  APPLICATION_ERROR,
} from './storeApplications'
import { prepareStoreApplicationSignalPayload } from '../../../supabase/functions/_shared/partner-command-payload'
const id = '17100000-0000-4000-8000-000000000001'
const snapshot = {
  applicationId: id,
  state: 'withdrawn',
  version: 2,
  draft: null,
  matchedStoreId: null,
  matches: [],
  categoryLabel: null,
  storeId: null,
  claimId: null,
}
describe('store application transport boundary', () => {
  it('normalizes provider details and rejects malformed snapshots', async () => {
    const invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error('private other applicant'))
      .mockResolvedValueOnce({ ...snapshot, version: '2' })
    const client = createStoreApplicationClient(invoke)
    await expect(client.status()).rejects.toThrow(APPLICATION_ERROR)
    await expect(client.status()).rejects.toThrow(APPLICATION_ERROR)
  })
  it('sends exact applicant and version for conversion', async () => {
    const invoke = vi.fn().mockResolvedValue(snapshot)
    const client = createStoreApplicationClient(invoke)
    const current = await client.status()
    if (!current) throw new Error('Missing fixture')
    await client.convert(current, id)
    expect(invoke).toHaveBeenLastCalledWith('convert', {
      applicationId: id,
      version: 2,
      storeId: id,
      confirmed: true,
    })
  })
  it('administrator details cannot replace the selected case or version', async () => {
    const invoke = vi.fn().mockResolvedValue(snapshot)
    const client = createStoreApplicationAdminClient(invoke)
    const current = await client.read(id)
    await client.command('approve', current, { applicationId: 'other', version: 999 })
    expect(invoke).toHaveBeenLastCalledWith('approve', { applicationId: id, version: 2 })
  })
  it('hashes evidence objects independently from channel and verification events', async () => {
    const payload = {
      applicationId: id,
      version: 1,
      channelClass: 'callback',
      evidenceReference: 'Same Object',
      verificationEventReference: 'Same Event',
    }
    const first = await prepareStoreApplicationSignalPayload(payload, 'synthetic-secret')
    const second = await prepareStoreApplicationSignalPayload(
      {
        ...payload,
        channelClass: 'published_business_contact',
        evidenceReference: ' same object ',
      },
      'synthetic-secret',
    )
    expect(first.evidenceHmac).toBe(second.evidenceHmac)
    expect(first.verificationEventId).toBe(second.verificationEventId)
    expect(JSON.stringify(first)).not.toContain('Same Object')
    expect(JSON.stringify(first)).not.toContain('Same Event')
    expect(first.evidenceHmac).toMatch(/^[0-9a-f]{64}$/)
  })
  it('rejects missing HMAC configuration without emitting a raw reference', async () => {
    await expect(
      prepareStoreApplicationSignalPayload(
        {
          applicationId: id,
          version: 1,
          channelClass: 'callback',
          evidenceReference: 'private-reference',
        },
        undefined,
      ),
    ).rejects.toThrow()
  })
})
