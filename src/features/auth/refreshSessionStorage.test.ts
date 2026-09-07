import { describe, expect, it } from 'vitest'
import { InMemoryRefreshSessionStorage } from './refreshSessionStorage'

describe('refresh session storage', () => {
  it('stores only the dedicated refresh material and clears it', async () => {
    const storage = new InMemoryRefreshSessionStorage()
    await storage.write({ userId: 'user-1', refreshToken: 'refresh-only' })
    const material = await storage.read()
    expect(material).toEqual({ userId: 'user-1', refreshToken: 'refresh-only' })
    expect(JSON.stringify(material)).not.toContain('accessToken')
    await storage.clear()
    await expect(storage.read()).resolves.toBeNull()
  })
})
