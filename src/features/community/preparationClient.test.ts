import { describe, expect, it, vi } from 'vitest'
import { CommunityPreparationError, createCommunityPreparationClient } from './preparationClient'

describe('community preparation client', () => {
  it('sends exact user-session operations and never exposes deployment commands', async () => {
    const execute = vi.fn(async () => ({ status: 'available', root: {}, runs: [] }))
    const client = createCommunityPreparationClient({ execute })
    await client.list()
    expect(execute).toHaveBeenCalledWith('list', {})
    expect(JSON.stringify(execute.mock.calls)).not.toMatch(
      /activate|rollback|reactivate|secret|jwt/i,
    )
  })

  it('fails closed for transport errors', async () => {
    const client = createCommunityPreparationClient({
      execute: async () => {
        throw new Error('private detail')
      },
    })
    await expect(client.detail('12000000-0000-4000-8000-000000000101')).rejects.toBeInstanceOf(
      CommunityPreparationError,
    )
  })
})
