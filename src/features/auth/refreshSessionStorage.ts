const DATABASE_NAME = 'antique-trail-auth-refresh-v1'
const RECORD_STORE = 'refresh-material'
const RECORD_KEY = 'current'

export interface RefreshSessionStorage {
  readRefreshToken(): Promise<string | null>
  writeRefreshToken(refreshToken: string): Promise<void>
  clear(): Promise<void>
}

interface RefreshMaterialRecord {
  id: typeof RECORD_KEY
  version: 1
  refreshToken: string
}

export function parseRefreshMaterial(value: unknown): string | null {
  const record = value as Partial<RefreshMaterialRecord> | null
  if (
    typeof record !== 'object' ||
    record === null ||
    record.id !== RECORD_KEY ||
    record.version !== 1 ||
    typeof record.refreshToken !== 'string' ||
    record.refreshToken.length === 0 ||
    Object.keys(record).some((key) => !['id', 'version', 'refreshToken'].includes(key))
  )
    return null
  return record.refreshToken
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

export class IndexedDbRefreshSessionStorage implements RefreshSessionStorage {
  private databasePromise?: Promise<IDBDatabase>
  private operations: Promise<unknown> = Promise.resolve()

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operations.then(operation, operation)
    this.operations = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is unavailable.'))
          return
        }
        const request = indexedDB.open(DATABASE_NAME, 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(RECORD_STORE))
            request.result.createObjectStore(RECORD_STORE, { keyPath: 'id' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
      })
    }
    return this.databasePromise
  }

  readRefreshToken(): Promise<string | null> {
    return this.enqueue(async () => {
      const store = (await this.database())
        .transaction(RECORD_STORE, 'readonly')
        .objectStore(RECORD_STORE)
      return parseRefreshMaterial(
        await requestResult<RefreshMaterialRecord | undefined>(store.get(RECORD_KEY)),
      )
    })
  }

  writeRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return Promise.reject(new Error('Refresh token is empty.'))
    return this.enqueue(async () => {
      const store = (await this.database())
        .transaction(RECORD_STORE, 'readwrite')
        .objectStore(RECORD_STORE)
      await requestResult(
        store.put({ id: RECORD_KEY, version: 1, refreshToken } satisfies RefreshMaterialRecord),
      )
    })
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      const store = (await this.database())
        .transaction(RECORD_STORE, 'readwrite')
        .objectStore(RECORD_STORE)
      await requestResult(store.delete(RECORD_KEY))
    })
  }
}
