import { createClient, type Session } from '@supabase/supabase-js'
import type { AppClients, AppRuntime } from './App'
import { createAccessibleCatalogMapAdapter, demoCatalogClient } from '../features/catalog'
import { createReviewClient } from '../features/reviews'
import {
  createPortalClient,
  createPortalMediaHttpTransport,
  sanitizeDiagnostics,
} from '../features/portal'
import { createReadinessClient } from '../features/readiness'
import { createBetaClient } from '../features/beta'
import { createShopperClient } from '../features/shopper'
import { createCandidateProductionClient } from '../features/candidates'
import {
  createPartnerAdminClient,
  createPartnerClient,
  createPartnerProductionTransport,
} from '../features/partners'
import {
  WebCryptoOfflineGrantVerifier,
  InMemoryOfflineDatabase,
  IndexedDbOfflineDatabase,
  createTripApi,
  createTripOfflineRuntime,
  loadOrCreateTripInstallationIdentity,
  signTripDeviceProof,
  type OfflineTripDatabase,
  type TripInstallationIdentity,
  type SignedOfflineGrant,
  type Trip,
  type TripOfflineGrantSource,
} from '../features/trips'
import {
  createAccountLifecycleClient,
  createRpcSessionRegistry,
  type AccountRole,
  type AuthProviderAdapter,
  type ProviderSession,
} from '../features/auth'

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

function authenticationMetadata(
  accessToken: string,
): Pick<ProviderSession, 'passwordAuthenticatedAt' | 'mfaVerifiedAt'> {
  try {
    const raw = accessToken.split('.')[1]
    const normalized = raw.replaceAll('-', '+').replaceAll('_', '/')
    const claims = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    ) as {
      amr?: Array<{ method?: string; timestamp?: number }>
    }
    const latest = (method: string) =>
      claims.amr
        ?.filter((entry) => entry.method === method && Number.isSafeInteger(entry.timestamp))
        .sort((left, right) => Number(right.timestamp) - Number(left.timestamp))[0]?.timestamp
    const password = latest('password')
    const mfa = latest('totp') ?? latest('recovery_code')
    return {
      ...(password ? { passwordAuthenticatedAt: new Date(password * 1_000).toISOString() } : {}),
      ...(mfa ? { mfaVerifiedAt: new Date(mfa * 1_000).toISOString() } : {}),
    }
  } catch {
    return {}
  }
}

function providerSession(session: Session): ProviderSession {
  const mfaEnrolled =
    session.user.factors?.some(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    ) ?? false
  return {
    userId: session.user.id,
    ...(session.user.email ? { email: session.user.email } : {}),
    emailVerified: Boolean(session.user.email_confirmed_at),
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1_000) + 300) * 1_000,
    role: role(session.user.app_metadata.role),
    mfaEnrolled,
    ...authenticationMetadata(session.access_token),
  }
}

export function createAuthProvider<
  T extends {
    auth: ReturnType<typeof createClient>['auth']
    functions: ReturnType<typeof createClient>['functions']
  },
>(supabase: T): AuthProviderAdapter {
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
      await supabase.functions.invoke('auth-recovery-request', {
        body: {
          email: email.normalize('NFKC').trim(),
          requestId: crypto.randomUUID(),
        },
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
    async register(request) {
      const result = await supabase.functions.invoke('account-registration', {
        body: {
          email: request.email.normalize('NFKC').trim(),
          password: request.password,
          ageAttested: request.ageAttested,
          requestId: request.requestId,
        },
      })
      if (result.error) return { kind: 'error' }
      if (result.data?.state === 'blocked') return { kind: 'blocked' }
      return result.data?.state === 'pending_verification'
        ? { kind: 'pending_verification' }
        : { kind: 'error' }
    },
    async verifyCallback(kind, tokenHash) {
      const result = await supabase.functions.invoke('account-registration-callback', {
        body: { kind, tokenHash },
      })
      if (result.error) return { kind: 'error' }
      if (result.data?.state === 'blocked') return { kind: 'blocked' }
      if (result.data?.state === 'verified') return { kind: 'verified' }
      return result.data?.state === 'authenticated' && result.data.session
        ? { kind: 'authenticated', session: providerSession(result.data.session as Session) }
        : { kind: 'error' }
    },
    async signOut() {
      await supabase.auth.signOut({ scope: 'local' })
    },
  }
}

async function offlineConfiguration(database: OfflineTripDatabase): Promise<{
  runtime: ReturnType<typeof createTripOfflineRuntime>
  enabled: boolean
  identityReady: boolean
  database: OfflineTripDatabase
  identity?: TripInstallationIdentity
}> {
  const keyId = configuredValue(import.meta.env.VITE_TRIP_OFFLINE_GRANT_KEY_ID)
  const rawJwk = configuredValue(import.meta.env.VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK)
  try {
    const identity = await loadOrCreateTripInstallationIdentity(database)
    const runtimeOptions = {
      database,
      installId: identity.installId,
      deviceKeyId: identity.deviceKeyId,
    }
    if (!keyId || !rawJwk)
      return {
        runtime: createTripOfflineRuntime(runtimeOptions),
        enabled: false,
        identityReady: true,
        database,
        identity,
      }
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(rawJwk) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    return {
      runtime: createTripOfflineRuntime({
        ...runtimeOptions,
        verifier: new WebCryptoOfflineGrantVerifier(new Map([[keyId, publicKey]])),
      }),
      enabled: true,
      identityReady: true,
      database,
      identity,
    }
  } catch {
    return {
      runtime: createTripOfflineRuntime({ database: new InMemoryOfflineDatabase() }),
      enabled: false,
      identityReady: false,
      database: new InMemoryOfflineDatabase(),
    }
  }
}

export async function configuredComposition(
  options: {
    tripOfflineDatabase?: OfflineTripDatabase
  } = {},
): Promise<ConfiguredComposition | null> {
  if (
    import.meta.env.DEV &&
    import.meta.env.MODE === 'review' &&
    import.meta.env.VITE_REVIEW_HARNESS === 'true'
  ) {
    // A production replacement makes this branch unreachable, so Vite omits both
    // local-only dynamic modules (including all fixture labels) from the bundle.
    const [
      { createReviewHarness },
      { createReviewHarnessAuthProvider, createReviewHarnessClients },
      { ReviewHarnessBanner, ReviewHarnessPage },
    ] = await Promise.all([
      import('../review-harness/harness'),
      import('../review-harness/clients'),
      import('../review-harness/components'),
    ])
    const reviewHarness = await createReviewHarness({
      dev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
      enabled: import.meta.env.VITE_REVIEW_HARNESS,
      url: typeof window === 'undefined' ? 'http://127.0.0.1:4173/review' : window.location.href,
    })
    if (reviewHarness) {
      return {
        clients: {
          catalog: demoCatalogClient,
          ...createReviewHarnessClients(reviewHarness.scenario, reviewHarness.state),
        },
        runtime: {
          reviewHarness,
          reviewHarnessUi: { Banner: ReviewHarnessBanner, Page: ReviewHarnessPage },
          authStore: reviewHarness.authStore,
          authProvider: createReviewHarnessAuthProvider(reviewHarness.state),
          sessionRegistry: reviewHarness.sessionRegistry,
        },
      }
    }
  }
  const url = configuredValue(import.meta.env.VITE_SUPABASE_URL)
  const anonKey = configuredValue(import.meta.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !anonKey) return null
  const supabase = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
  })
  const offline = await offlineConfiguration(
    options.tripOfflineDatabase ?? new IndexedDbOfflineDatabase(),
  )
  const consumeSignedTripGrant = async (
    command: 'start_trip_with_offline_grant' | 'transfer_navigator_device',
    tripId: string,
    installId: string,
    deviceKeyId: string,
  ): Promise<unknown> => {
    if (!offline.identityReady || !offline.identity)
      throw new Error('Offline trip grant unavailable.')
    const proof = await signTripDeviceProof(offline.database, offline.identity, 'grant-v1', [
      tripId,
      installId,
    ])
    const preflight = await supabase.functions.invoke('trip-grant-signer', {
      body: {
        tripId,
        installId,
        deviceKeyId,
        devicePublicKey: offline.identity.publicKeyJwk,
        proof,
      },
    })
    if (
      preflight.error ||
      !preflight.data ||
      typeof preflight.data !== 'object' ||
      preflight.data.state !== 'ready' ||
      typeof preflight.data.receiptId !== 'string'
    )
      throw new Error('Offline trip grant unavailable.')
    const result = await supabase.rpc(command, {
      trip_id: tripId,
      install_id: installId,
      device_key_id: deviceKeyId,
    })
    if (result.error) throw result.error
    return result.data
  }
  const goActions = new Map<string, string>([
    ['mark_arrived', 'mark_arrived'],
    ['complete_trip_stop', 'complete_stop'],
    ['skip_trip_stop', 'skip_stop'],
    ['mark_trip_stop_closed', 'mark_observed_closed'],
    ['restore_trip_stop', 'restore_stop'],
    ['complete_trip', 'complete_trip'],
  ])
  const executeVerifiedGoCommand = async (
    command: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<unknown> => {
    if (!offline.identityReady || !offline.identity) throw new Error('Device proof unavailable.')
    const action = goActions.get(command)
    if (!action) throw new Error('Device proof unavailable.')
    const tripId = String(payload.trip_id)
    const stopId = payload.stop_id == null ? '' : String(payload.stop_id)
    const prepared = await supabase.rpc('prepare_go_device_command', {
      trip_id: tripId,
      action,
      stop_id: stopId || null,
      device_key_id: offline.identity.deviceKeyId,
    })
    const baseVersion = Number((prepared.data as { baseVersion?: unknown } | null)?.baseVersion)
    if (prepared.error || !Number.isInteger(baseVersion) || baseVersion < 1)
      throw new Error('Device proof unavailable.')
    const proof = await signTripDeviceProof(offline.database, offline.identity, 'go-v1', [
      tripId,
      action,
      stopId,
      baseVersion,
    ])
    const result = await supabase.functions.invoke('trip-go-command', {
      body: {
        tripId,
        action,
        stopId: stopId || null,
        baseVersion,
        deviceKeyId: offline.identity.deviceKeyId,
        devicePublicKey: offline.identity.publicKeyJwk,
        proof,
      },
    })
    if (result.error) throw result.error
    return result.data
  }
  const trips = createTripApi(
    {
      async invoke(command, payload) {
        if (goActions.has(command)) return executeVerifiedGoCommand(command, payload)
        if (command === 'start_trip')
          return consumeSignedTripGrant(
            'start_trip_with_offline_grant',
            String(payload.trip_id),
            offline.runtime.installId,
            offline.runtime.deviceKeyId,
          )
        if (command === 'transfer_navigator_device')
          return consumeSignedTripGrant(
            command,
            String(payload.trip_id),
            offline.runtime.installId,
            offline.runtime.deviceKeyId,
          )
        const result = await supabase.rpc(command, payload)
        if (result.error) throw result.error
        return result.data
      },
    },
    {
      installId: offline.runtime.installId,
      deviceKeyId: offline.runtime.deviceKeyId,
    },
  )
  const sessionRegistry = createRpcSessionRegistry({
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
  const rpc = async <T>(
    command: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<T> => {
    const result = await supabase.rpc(command, payload)
    if (result.error) throw result.error
    return result.data as T
  }
  const edge = async <T>(
    command: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<T> => {
    const result = await supabase.functions.invoke(command, { body: payload })
    if (result.error) throw result.error
    return result.data as T
  }
  const candidate = createCandidateProductionClient({ rpc, edge })
  const lifecycle = createAccountLifecycleClient({
    rpc,
    async download(jobId) {
      const session = await supabase.auth.getSession()
      const accessToken = session.data.session?.access_token
      if (!accessToken) throw new Error('Account export unavailable.')
      const response = await fetch(`${url}/functions/v1/account-export-download`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Account export unavailable.')
      return response.blob()
    },
  })
  const partner = createPartnerClient(
    createPartnerProductionTransport({
      rpc,
      edge,
      emailProviderEnabled: import.meta.env.VITE_PARTNER_EMAIL_PROVIDER_ENABLED === 'true',
      mediaProviderEnabled: import.meta.env.VITE_PARTNER_MEDIA_PROVIDER_ENABLED === 'true',
      syntheticEnabled: import.meta.env.VITE_PARTNER_SYNTHETIC_ENABLED === 'true',
    }),
  )
  const partnerAdmin = createPartnerAdminClient({ rpc, edge })
  let source: TripOfflineGrantSource | undefined
  if (offline.enabled) {
    source = {
      async startTripWithOfflineGrant(tripId, installId, deviceKeyId) {
        const result = await consumeSignedTripGrant(
          'start_trip_with_offline_grant',
          tripId,
          installId,
          deviceKeyId,
        )
        if (!result || typeof result !== 'object')
          throw new Error('Offline trip grant unavailable.')
        const data = result as { trip?: Trip; grant?: SignedOfflineGrant }
        if (!data.trip || !data.grant) throw new Error('Offline trip grant unavailable.')
        return { trip: data.trip, grant: data.grant }
      },
    }
  }
  return {
    clients: {
      candidate,
      lifecycle,
      partner,
      partnerAdmin,
      shopper,
      reviews: createReviewClient({
        async rpc(name, args) {
          const result = await supabase.rpc(name, args)
          return { data: result.data, error: result.error }
        },
      }),
      portal: createPortalClient(
        {
          async rpc(name, args) {
            const result = await supabase.rpc(name, args)
            return { data: result.data, error: result.error }
          },
        },
        () =>
          sanitizeDiagnostics({
            browser: navigator.userAgent,
            route: window.location.pathname,
            connection: navigator.onLine ? 'online' : 'offline',
          }),
        createPortalMediaHttpTransport({
          endpoint: `${url}/functions/v1/media-provider-command`,
          apiKey: anonKey,
          async getAccessToken() {
            const session = await supabase.auth.getSession()
            return session.data.session?.access_token ?? ''
          },
        }),
      ),
      readiness: createReadinessClient({
        async rpc(name, args) {
          const result = await supabase.rpc(name, args)
          return { data: result.data, error: result.error }
        },
      }),
      beta: createBetaClient({
        async rpc(name, args) {
          const result = await supabase.rpc(name, args)
          return { data: result.data, error: result.error }
        },
      }),
      operationalStatus: {
        supportUrl: configuredValue(import.meta.env.VITE_SUPPORT_URL) ?? undefined,
        securityUrl: configuredValue(import.meta.env.VITE_SECURITY_CONTACT_URL) ?? undefined,
        statusUrl: configuredValue(import.meta.env.VITE_STATUS_URL) ?? undefined,
        responseCommitment:
          configuredValue(import.meta.env.VITE_INCIDENT_RESPONSE_COMMITMENT) ?? undefined,
      },
      trips,
      tripOfflineGrants: source,
      map: createAccessibleCatalogMapAdapter({
        capability: import.meta.env.VITE_BROWSE_MAP_ENABLED === 'true' ? 'available' : 'blocked',
        attribution: import.meta.env.VITE_BROWSE_MAP_ATTRIBUTION ?? '',
        bounds: { north: 39.25, south: 38.85, east: -95.4, west: -96 },
        zoom: 11,
      }),
    },
    runtime: {
      authProvider: createAuthProvider(supabase),
      sessionRegistry,
      tripOffline: offline.runtime,
    },
  }
}
