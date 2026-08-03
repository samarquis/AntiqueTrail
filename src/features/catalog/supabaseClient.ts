import { createClient } from '@supabase/supabase-js'
import { createCatalogClient } from './catalogApi'
import type { CatalogClient } from './types'

/**
 * Creates the anonymous catalog transport when local Supabase configuration is
 * present. The client is scoped to app_public so base tables are never queried
 * from the browser; only the two bounded RPCs are exposed by CatalogClient.
 */
export function configuredCatalogClient(): CatalogClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey || anonKey.startsWith('replace-with-')) return null

  const supabase = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  return createCatalogClient({
    rpc: async (name, args) => {
      const result = await supabase.rpc(name, args)
      return { data: result.data, error: result.error }
    },
  })
}
