import { createClient, type Session } from '@supabase/supabase-js'
import type { AppClients, AppRuntime } from './App'
import { createShopperClient } from '../features/shopper'
import {
  WebCryptoOfflineGrantVerifier,
  createTripApi,
  createTripOfflineRuntime,
  type SignedOfflineGrant,
  type Trip,
  type TripOfflineGrantSource,
} from '../features/trips'
import type { AccountRole, AuthProviderAdapter, ProviderSession } from '../features/auth'

export interface ConfiguredComposition {
  clients: AppClients
  runtime: AppRuntime
}

function configuredValue(value: string | undefined): string | null {
  return value && !value.startsWith('replace-with-') ? value : null
}

function role(value: unknown): AccountRole {
  return value === 'Representative' || value === 'Administrator' ? value : 'Shopper'
}

function providerSession(session: Session): ProviderSession {
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1_000) + 300) * 1_000,
    role: role(session.user.app_metadata.role),
  }
}

function createAuthProvider<T extends { auth: ReturnType<typeof createClient>['auth'] }>(
  supabase: T,
): AuthProviderAdapter {
  const challenges = new Map<string, { factorId: string; session: ProviderSession }>()
  return {
    async signIn(email, password) {
      const result = await supabase.auth.signInWithPassword({ email, password })
      if (result.error || !result.data.session) return { kind: 'error' }
      const session = providerSession(result.data.session)
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (
        !assurance.error &&
        assurance.data.nextLevel === 'aal2' &&
        assurance.data.currentLevel !== 'aal2'
      ) {
        const factors = await supabase.auth.mfa.listFactors()
        const factor = factors.data?.totp.find((candidate) => candidate.status === 'verified')
        if (!factor) return { kind: 'error' }
        const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id })
        if (challenge.error) return { kind: 'error' }
        challenges.set(challenge.data.id, { factorId: factor.id, session })
        return {
          kind: 'mfa_required',
          challengeId: challenge.data.id,
          session: { ...session, mfaRequired: true },
        }
      }
      return { kind: 'authenticated', session }
    },
    async sendRecovery(email) {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recovery`,
      })
    },
    async verifyMfa(challengeId, code) {
      const pending = challenges.get(challengeId)
      if (!pending) return null
      const result = await supabase.auth.mfa.verify({
        factorId: pending.factorId,
        challengeId,
        code,
      })
      if (result.error) return null
      challenges.delete(challengeId)
      return providerSession(result.data)
    },
    async signOut() {
      await supabase.auth.signOut({ scope: 'local' })
    },
  }
}

async function offlineConfiguration(): Promise<{
  runtime: ReturnType<typeof createTripOfflineRuntime>
  enabled: boolean
}> {
  const installId = configuredValue(import.meta.env.VITE_TRIP_INSTALL_ID) ?? undefined
  const deviceKeyId = configuredValue(import.meta.env.VITE_TRIP_DEVICE_KEY_ID) ?? undefined
  const keyId = configuredValue(import.meta.env.VITE_TRIP_OFFLINE_GRANT_KEY_ID)
  const rawJwk = configuredValue(import.meta.env.VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK)
  if (!keyId || !rawJwk || !deviceKeyId)
    return { runtime: createTripOfflineRuntime({ installId, deviceKeyId }), enabled: false }
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(rawJwk) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return {
      runtime: createTripOfflineRuntime({
        installId,
        deviceKeyId,
        verifier: new WebCryptoOfflineGrantVerifier(new Map([[keyId, publicKey]])),
      }),
      enabled: true,
    }
  } catch {
    return { runtime: createTripOfflineRuntime({ installId, deviceKeyId }), enabled: false }
  }
}

export async function configuredComposition(): Promise<ConfiguredComposition | null> {
  const url = configuredValue(import.meta.env.VITE_SUPABASE_URL)
  const anonKey = configuredValue(import.meta.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !anonKey) return null
  const supabase = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
  })
  const offline = await offlineConfiguration()
  const trips = createTripApi({
    async invoke(command, payload) {
      const result = await supabase.rpc(command, payload)
      if (result.error) throw result.error
      return result.data
    },
  })
  const shopper = createShopperClient({
    async rpc(name, args) {
      const result = await supabase.rpc(name, args)
      return { data: result.data, error: result.error }
    },
  })
  let source: TripOfflineGrantSource | undefined
  if (offline.enabled) {
    source = {
      async startTripWithOfflineGrant(tripId, installId, deviceKeyId) {
        const result = await supabase.rpc('start_trip_with_offline_grant', {
          trip_id: tripId,
          install_id: installId,
          device_key_id: deviceKeyId,
        })
        if (result.error || !result.data || typeof result.data !== 'object')
          throw new Error('Offline trip grant unavailable.')
        const data = result.data as { trip?: Trip; grant?: SignedOfflineGrant }
        if (!data.trip || !data.grant) throw new Error('Offline trip grant unavailable.')
        return { trip: data.trip, grant: data.grant }
      },
    }
  }
  return {
    clients: { shopper, trips, tripOfflineGrants: source },
    runtime: { authProvider: createAuthProvider(supabase), tripOffline: offline.runtime },
  }
}
