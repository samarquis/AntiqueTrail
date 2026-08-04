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
    })
    await expect(transport.post('bind_identity', {})).rejects.toThrow(
      'partner_email_provider_unavailable',
    )
    expect(edge).not.toHaveBeenCalled()
  })
})
