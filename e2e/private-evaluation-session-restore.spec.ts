import { expect, test, type Page } from '@playwright/test'

const AUTH_DB = 'antique-trail-auth-refresh-v1'

async function seedRefreshMaterial(page: Page) {
  await page.evaluate((databaseName) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('refresh-material'))
          request.result.createObjectStore('refresh-material', { keyPath: 'id' })
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const transaction = request.result.transaction('refresh-material', 'readwrite')
        transaction.objectStore('refresh-material').put({
          id: 'current',
          version: 1,
          refreshToken: 'controlled-refresh-token',
        })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }, AUTH_DB)
}

async function persistedBrowserValues(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases()
    const values: unknown[] = []
    for (const databaseInfo of databases) {
      if (!databaseInfo.name) continue
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseInfo.name!)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      for (const storeName of Array.from(database.objectStoreNames)) {
        const records = await new Promise<unknown[]>((resolve, reject) => {
          const request = database
            .transaction(storeName, 'readonly')
            .objectStore(storeName)
            .getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        values.push(...records)
      }
      database.close()
    }
    return values
  })
}

test('configured session restore uses browser IndexedDB refresh material only', async ({
  page,
}) => {
  test.skip(!process.env.VITE_SUPABASE_URL, 'requires the configured Supabase browser contract')
  const supabaseUrl = process.env.VITE_SUPABASE_URL!

  await page.route(`${supabaseUrl}/auth/v1/token*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'controlled-access-token',
        token_type: 'bearer',
        expires_in: 3_600,
        expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        refresh_token: 'rotated-refresh-token',
        user: {
          id: 'controlled-shopper',
          email: 'shopper@example.test',
          email_confirmed_at: '2026-09-01T00:00:00.000Z',
          app_metadata: { role: 'Shopper' },
          factors: [],
        },
      }),
    })
  })
  await page.route(`${supabaseUrl}/rest/v1/rpc/*`, async (route) => {
    const operation = new URL(route.request().url()).pathname.split('/').pop()
    if (operation === 'current_session_is_active') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
      return
    }
    if (operation === 'account_lifecycle_status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'active' }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })

  await page.goto('/stores')
  await seedRefreshMaterial(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: /stores/i })).toBeVisible()

  const persisted = await persistedBrowserValues(page)
  expect(JSON.stringify(persisted)).not.toContain('controlled-access-token')
  expect(JSON.stringify(persisted)).not.toContain('access_token')
  expect(JSON.stringify(persisted)).not.toContain('userId')
})
