import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { handleCorrectionSubmit, verifiedCorrectionSession } from '../_shared/correction-submit.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(
    handler: (request: Request, info: { remoteAddr?: { hostname?: string } }) => Promise<Response>,
  ): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const hmacSecret = Deno.env.get('CANDIDATE_EMAIL_HMAC_SECRET')
const publicTestMode = Deno.env.get('PUBLIC_TEST_MODE') === 'true'
const options = {
  db: { schema: 'app_public' },
  auth: { persistSession: false, autoRefreshToken: false },
}
const verifier = url && anonKey ? createClient(url, anonKey, options) : null
const service = url && serviceKey ? createClient(url, serviceKey, options) : null

Deno.serve((request, connection) =>
  handleCorrectionSubmit(
    request,
    connection.remoteAddr?.hostname,
    verifier && service && hmacSecret
      ? {
          hmacSecret,
          async verify(token) {
            const result = await verifier.auth.getUser(token)
            if (result.error || !result.data.user) return null
            return verifiedCorrectionSession(token, result.data.user.id)
          },
          async submit(args) {
            return service.rpc('correction_gateway_submit', args)
          },
        }
      : null,
    publicTestMode,
  ),
)
