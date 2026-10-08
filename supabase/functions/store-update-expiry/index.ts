import { createClient } from 'npm:@supabase/supabase-js@2.112.1'
import { createStoreUpdateExpiryHandler } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

Deno.serve(
  createStoreUpdateExpiryHandler({
    url: Deno.env.get('SUPABASE_URL'),
    workerJwt: Deno.env.get('STORE_UPDATE_EXPIRY_JWT'),
    schedulerToken: Deno.env.get('STORE_UPDATE_EXPIRY_SCHEDULER_TOKEN'),
    createClient: (url, jwt) => {
      const client = createClient(url, jwt, {
        db: { schema: 'app_public' },
        auth: { persistSession: false, autoRefreshToken: false },
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
