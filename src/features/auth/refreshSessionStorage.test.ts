import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IndexedDbRefreshSessionStorage,
  InMemoryRefreshSessionStorage,
} from './refreshSessionStorage'

describe('refresh session storage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['complete', 'abort'])(
    'waits for transaction %s after a delete request succeeds',
    async (outcome) => {
      const transaction = {
        oncomplete: null as null | (() => void),
        onabort: null as null | (() => void),
        error: new Error('aborted'),
      }
      const request = { onsuccess: null as null | (() => void) }
      const store = { transaction, delete: vi.fn(() => request) }
      const opened = {
        result: { transaction: () => ({ objectStore: () => store }) },
        onsuccess: null as null | (() => void),
      }
      vi.stubGlobal('indexedDB', { open: () => opened })
      const storage = new IndexedDbRefreshSessionStorage()
      let settled = false
      const clearing = storage.clear()
      const observed = clearing.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      opened.onsuccess!()
      await vi.waitFor(() => expect(store.delete).toHaveBeenCalled())
      request.onsuccess?.()
      await Promise.resolve()
      expect(settled).toBe(false)
      if (outcome === 'complete') {
        transaction.oncomplete!()
        await expect(clearing).resolves.toBeUndefined()
      } else {
        transaction.onabort!()
        await expect(clearing).rejects.toThrow('aborted')
      }
      await observed
    },
  )

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
