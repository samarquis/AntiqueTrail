import { describe, expect, it, vi } from 'vitest'
import { createPartnerProductionTransport } from './partnerProductionTransport'

describe('partner production transport', () => {
  it('routes ordinary claimant lifecycle actions without a pilot identity or email provider', async () => {
    const rpc = vi.fn()
    const edge = vi.fn()
    const transport = createPartnerProductionTransport({
      rpc,
      edge,
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: false,
    })
    await transport.post('withdraw_claim', { claimId: 'own-claim' })
    await transport.post('request_authority_recheck', { claimId: 'own-claim' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'public_listing_claim_action', {
      p_operation: 'withdraw',
      p_claim_id: 'own-claim',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'public_listing_claim_action', {
      p_operation: 'recheck',
      p_claim_id: 'own-claim',
    })
    expect(edge).not.toHaveBeenCalled()
  })
  it('routes safe synthetic commands through the bounded RPC', async () => {
    const calls: unknown[][] = []
    const rpc = async <T>(...args: unknown[]): Promise<T> => {
      calls.push(args)
      return { onboarding: 'draft' } as T
    }
    const transport = createPartnerProductionTransport({
      rpc,
      edge: vi.fn(),
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: false,
    })
    await transport.post('save_draft', { draft: { storeName: 'Synthetic Store' } })
    expect(calls[0]).toEqual([
      'partner_safe_command',
      {
        p_operation: 'save_draft',
        p_payload: { draft: { storeName: 'Synthetic Store' } },
      },
    ])
  })

  it('fails provider commands closed until the email gate is configured', async () => {
    const edge = vi.fn()
    const transport = createPartnerProductionTransport({
      rpc: vi.fn(),
      edge,
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: false,
    })
    await expect(transport.post('bind_identity', {})).rejects.toThrow(
      'partner_email_provider_unavailable',
    )
    expect(edge).not.toHaveBeenCalled()
  })

  it('routes material reconsent only to its bounded authenticated command', async () => {
    const calls: unknown[][] = []
    const rpc = async <T>(...args: unknown[]): Promise<T> => {
      calls.push(args)
      return { reconsentRequired: false } as T
    }
    const transport = createPartnerProductionTransport({
      rpc,
      edge: vi.fn(),
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: true,
    })
    await transport.post('accept_material_terms', {
      policyVersion: 'synthetic-v3',
      acknowledgements: { reviewed: true, voluntary: true },
      idempotencyKey: 'partner-reconsent-attempt-1',
    })
    expect(calls[0]).toEqual([
      'partner_consent_command',
      {
        p_operation: 'accept_material_terms',
        p_payload: expect.objectContaining({ policyVersion: 'synthetic-v3' }),
      },
    ])
  })

  it('allows only the explicit Synthetic provider path without E-01', async () => {
    const calls: unknown[][] = []
    const transport = createPartnerProductionTransport({
      rpc: vi.fn(),
      edge: async <T>(...args: unknown[]): Promise<T> => {
        calls.push(args)
        return { state: 'active' } as T
      },
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: true,
    })
    await transport.post('exchange_invitation', { token: 'synthetic-token-123456' })
    expect(calls[0]).toEqual([
      'partner-provider-command',
      {
        operation: 'exchange_invitation',
        payload: { token: 'synthetic-token-123456' },
        synthetic: true,
      },
    ])
  })

  it('sends an exact selected store only to the staged server claim command', async () => {
    const calls: unknown[][] = []
    const transport = createPartnerProductionTransport({
      rpc: async <T>(...args: unknown[]): Promise<T> => {
        calls.push(args)
        return { state: 'draft' } as T
      },
      edge: vi.fn(),
      emailProviderEnabled: false,
      mediaProviderEnabled: false,
      syntheticEnabled: false,
    })
    await transport.post('submit_claim', {
      draft: {
        storeId: '10000000-0000-4000-8000-000000000001',
        relationship: 'Owner',
        authorityStatement: 'I am authorized to represent this store.',
        idempotencyKey: 'public-claim-170',
      },
    })
    expect(calls).toEqual([
      [
        'public_listing_claim_command',
        {
          p_operation: 'start',
          p_payload: expect.objectContaining({
            storeId: '10000000-0000-4000-8000-000000000001',
          }),
        },
      ],
    ])
  })
})
