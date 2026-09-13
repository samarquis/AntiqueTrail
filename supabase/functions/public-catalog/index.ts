import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { createPublicCatalogHandler } from '../_shared/public-catalog.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(
    handler: (request: Request, info: { remoteAddr?: { hostname?: string } }) => Promise<Response>,
  ): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const gatewayJwt = Deno.env.get('PUBLIC_CATALOG_GATEWAY_JWT')
const allowedOrigin = Deno.env.get('PUBLIC_APP_ORIGIN')

Deno.serve(
  createPublicCatalogHandler(
    {
      url,
      anonKey,
      gatewayJwt,
      allowedOrigin,
      rateSalt: Deno.env.get('PUBLIC_CATALOG_RATE_SALT'),
      publicTest: Deno.env.get('PUBLIC_TEST_MODE') === 'true',
    },
    {
      gateway: () => {
        const client = createClient(url!, anonKey!, {
          accessToken: async () => gatewayJwt!,
          db: { schema: 'app_public' },
          global: { headers: { Origin: allowedOrigin! } },
          auth: { persistSession: false, autoRefreshToken: false },
        })
        return { rpc: async (name, args) => client.rpc(name, args) }
      },
      verify: async (bearer) => {
        const result = await createClient(url!, anonKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
        }).auth.getUser(bearer)
        return result.error ? null : result.data.user
      },
    },
  ),
)
