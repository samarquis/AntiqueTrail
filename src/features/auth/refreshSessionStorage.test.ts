import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDbRefreshSessionStorage, parseRefreshMaterial } from './refreshSessionStorage'

describe('refresh-only session storage', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('accepts only the dedicated refresh-material record shape', () => {
    expect(parseRefreshMaterial({ id: 'current', version: 1, refreshToken: 'refresh-token' })).toBe(
      'refresh-token',
    )
    expect(
      parseRefreshMaterial({
        id: 'current',
        version: 1,
        refreshToken: 'refresh-token',
        access_token: 'must-never-persist',
      }),
    ).toBeNull()
    expect(window.localStorage.length).toBe(0)
  })

  it('fails closed when IndexedDB is unavailable', async () => {
    const storage = new IndexedDbRefreshSessionStorage()
    await expect(storage.readRefreshToken()).rejects.toThrow('IndexedDB')
    await expect(storage.clear()).rejects.toThrow('IndexedDB')
  })
})
