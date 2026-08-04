import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import { handlePartnerAdminInvitation } from '../_shared/partner-admin-invitation.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const emailHmacSecret = Deno.env.get('PARTNER_EMAIL_HMAC_SECRET')
const hmacKeyVersion = Number(Deno.env.get('PARTNER_EMAIL_HMAC_KEY_VERSION') ?? '0')
const syntheticEnabled = Deno.env.get('PARTNER_SYNTHETIC_ENABLED') === 'true'
const appOrigin = Deno.env.get('APP_ORIGIN')

Deno.serve((request) =>
  handlePartnerAdminInvitation(request, {
    syntheticEnabled,
    appOrigin,
    emailHmacSecret,
    hmacKeyVersion,
    async issue(input) {
      if (!url || !anonKey) throw new Error('unavailable')
      const client = createClient(url, anonKey, {
        db: { schema: 'app_public' },
        global: { headers: { Authorization: input.authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const result = await client.rpc('issue_synthetic_partner_invitation', {
        p_recipient_email_hmac: input.recipientEmailHmac,
        p_hmac_key_version: input.hmacKeyVersion,
        p_idempotency_key: input.idempotencyKey,
      })
      if (result.error || !result.data) throw new Error('unavailable')
      return result.data as {
        invitationId: string
        token: string
        expiresAt: string
      }
    },
  }),
)
