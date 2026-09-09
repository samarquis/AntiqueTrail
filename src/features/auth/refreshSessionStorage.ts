export interface RefreshSessionMaterial {
  userId: string
  refreshToken: string
}

export interface RefreshSessionStorage {
  read(): Promise<RefreshSessionMaterial | null>
  write(material: RefreshSessionMaterial): Promise<void>
  clear(): Promise<void>
}

const DATABASE_NAME = 'antique-trail-auth-refresh-v1'
const STORE_NAME = 'refresh-material'
const RECORD_KEY = 'current'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

export class IndexedDbRefreshSessionStorage implements RefreshSessionStorage {
  private databasePromise?: Promise<IDBDatabase>

  private database(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB unavailable.'))
          return
        }
        const request = indexedDB.open(DATABASE_NAME, 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME))
            request.result.createObjectStore(STORE_NAME)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
      })
    }
    return this.databasePromise
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.database()).transaction(STORE_NAME, mode).objectStore(STORE_NAME)
  }

  async read(): Promise<RefreshSessionMaterial | null> {
    const value = await requestResult<RefreshSessionMaterial | undefined>(
      (await this.store('readonly')).get(RECORD_KEY),
    )
    if (!value || typeof value.userId !== 'string' || typeof value.refreshToken !== 'string')
      return null
    return { userId: value.userId, refreshToken: value.refreshToken }
  }

  async write(material: RefreshSessionMaterial): Promise<void> {
    if (!material.userId || !material.refreshToken) throw new Error('Invalid refresh material.')
    await requestResult((await this.store('readwrite')).put(material, RECORD_KEY))
  }

  async clear(): Promise<void> {
    await requestResult((await this.store('readwrite')).delete(RECORD_KEY))
  }
}

export class InMemoryRefreshSessionStorage implements RefreshSessionStorage {
  private material: RefreshSessionMaterial | null = null

  async read(): Promise<RefreshSessionMaterial | null> {
    return this.material && { ...this.material }
  }

  async write(material: RefreshSessionMaterial): Promise<void> {
    this.material = { ...material }
  }

  async clear(): Promise<void> {
    this.material = null
  }
}
