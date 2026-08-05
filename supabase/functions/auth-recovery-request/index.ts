import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  handleAuthRecoveryRequest,
  type AuthRecoveryDependencies,
  type RecoveryReservation,
} from '../_shared/auth-recovery-request.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const recipientHmacSecret = Deno.env.get('RECOVERY_EMAIL_HMAC_SECRET')
const appOrigin = Deno.env.get('APP_ORIGIN')

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const corsOrigin = origin && appOrigin && origin === appOrigin ? origin : null
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: corsOrigin ? 204 : 403,
      headers: corsHeaders(corsOrigin),
    })
  }
  const response = await handleAuthRecoveryRequest(request, dependencies())
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(corsHeaders(corsOrigin))) headers.set(name, value)
  return new Response(response.body, { status: response.status, headers })
})

function dependencies(): AuthRecoveryDependencies {
  if (!url || !serviceKey || !recipientHmacSecret || recipientHmacSecret.length < 32)
    return unavailableDependencies()
  const admin = createClient(url, serviceKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    recipientHmac: (email) => hmac(email, recipientHmacSecret),
    async reserve(input): Promise<RecoveryReservation> {
      const result = await admin.rpc('reserve_auth_recovery_delivery', {
        p_recipient_hmac: input.recipientHmac,
        p_idempotency_key: input.idempotencyKey,
      })
      if (result.error || !result.data || typeof result.data !== 'object')
        throw new Error('unavailable')
      const value = result.data as { operationId?: unknown; state?: unknown }
      if (value.state === 'blocked') return { state: 'blocked' }
      if (
        (value.state === 'reserved' || value.state === 'reconciliation_required') &&
        typeof value.operationId === 'string'
      )
        return { state: value.state, operationId: value.operationId }
      throw new Error('unavailable')
    },
    async settle(operationId, idempotencyKey, outcome) {
      const result = await admin.rpc('complete_auth_recovery_delivery', {
        p_operation_id: operationId,
        p_idempotency_key: idempotencyKey,
        p_outcome: outcome,
      })
      if (result.error) throw result.error
    },
  }
}

function unavailableDependencies(): AuthRecoveryDependencies {
  const unavailable = async () => {
    throw new Error('unavailable')
  }
  return {
    recipientHmac: unavailable,
    reserve: unavailable,
    settle: unavailable,
  }
}

async function hmac(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const normalized = email.normalize('NFKC').trim().toLocaleLowerCase('en-US')
  const value = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(normalized)),
  )
  return `\\x${[...value].map((item) => item.toString(16).padStart(2, '0')).join('')}`
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}
