import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import { createStoreUpdateExpiryHandler } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

Deno.serve(
  createStoreUpdateExpiryHandler({
    url: Deno.env.get('SUPABASE_URL'),
    apiKey: Deno.env.get('SUPABASE_ANON_KEY'),
    workerJwt: Deno.env.get('STORE_UPDATE_EXPIRY_JWT'),
    schedulerToken: Deno.env.get('STORE_UPDATE_EXPIRY_SCHEDULER_TOKEN'),
    createClient: (url, apiKey, workerJwt) => {
      const client = createClient(url, apiKey, {
        db: { schema: 'app_public' },
        auth: { persistSession: false, autoRefreshToken: false },
        accessToken: async () => workerJwt,
      })
      return {
        rpc: async (name, args) => {
          const response = await client.rpc(name, args)
          return { data: response.data, error: response.error }
        },
      }
    },
  }),
)
