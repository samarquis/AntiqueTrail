import { describe, expect, it, vi } from 'vitest'
import { createPartnerProductionTransport } from './partnerProductionTransport'

describe('partner production transport', () => {
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
})
