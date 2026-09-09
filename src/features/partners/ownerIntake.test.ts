import { describe, expect, it, vi } from 'vitest'
import { createOwnerIntakeClient } from './ownerIntake'

describe('shared owner intake client', () => {
  it('routes every allowed lifecycle action through one bounded transaction', async () => {
    const invoke = vi.fn(async (operation: string, payload: Readonly<Record<string, unknown>>) => {
      void operation
      void payload
      return {
        runId: 'run-1',
        audience: 'synthetic' as const,
        kind: null,
        state: 'ready' as const,
        draft: null,
        updatedAt: null,
      }
    })
    const client = createOwnerIntakeClient({ invoke })

    await client.start('existing_claim')
    await client.save({
      fixture: 'existing-store-a',
      relationship: 'owner',
      ownerFactsConfirmed: true,
      reviewedFactsUnderstood: true,
    })
    await client.resume()
    await client.submit()
    await client.status()

    expect(invoke.mock.calls.map(([operation]) => operation)).toEqual([
      'start',
      'save',
      'resume',
      'submit',
      'status',
    ])
  })
})
