import { createClient } from '@supabase/supabase-js'
import { createShopperClient } from './shopperApi'
import type { ShopperPrivateClient } from './types'

export function configuredShopperClient(): ShopperPrivateClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey || anonKey.startsWith('replace-with-')) return null

  const supabase = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return createShopperClient({
    rpc: async (name, args) => {
      const result = await supabase.rpc(name, args)
      return { data: result.data, error: result.error }
    },
  })
}
