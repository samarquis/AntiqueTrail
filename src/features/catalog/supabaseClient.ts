import { createCatalogClient } from './catalogApi'
import type { CatalogClient } from './types'

/**
 * Creates the anonymous catalog transport when local Supabase configuration is
 * present. Production catalog traffic goes through the abuse-controlled Edge
 * gateway; the browser never receives execution rights on catalog RPCs.
 */
export function configuredCatalogClient(): CatalogClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey || anonKey.startsWith('replace-with-')) return null

  return createCatalogClient({
    rpc: async (name, args) => {
      const operation =
        name === 'catalog_list'
          ? 'list'
          : name === 'catalog_details'
            ? 'details'
            : name === 'get_browse_map'
              ? 'map'
              : null
      if (!operation) return { data: null, error: { code: 'INVALID_OPERATION' } }
      try {
        const response = await fetch(`${url}/functions/v1/public-catalog`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ operation, args }),
        })
        const payload = (await response.json()) as {
          data?: unknown
          error?: { message?: string; code?: string }
        }
        return response.ok
          ? { data: payload.data ?? null, error: null }
          : { data: null, error: payload.error ?? { code: 'GATEWAY_UNAVAILABLE' } }
      } catch {
        return { data: null, error: { code: 'GATEWAY_UNAVAILABLE' } }
      }
    },
  })
}
