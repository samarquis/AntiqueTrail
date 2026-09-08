import { createSalesClient } from '../features/billing/sales'
import { createServicingClient } from '../features/billing/servicing'
import { createPromotionClient } from '../features/portal/promotion'
import {
  createStoreApplicationClient,
  createStoreApplicationAdminClient,
} from '../features/partners/storeApplications'
import { createOwnerIntakeAvailabilityClient } from '../features/partners/ownerIntakeAvailability'
import { createClient, type Session } from '@supabase/supabase-js'
import type { AppClients, AppRuntime } from './App'
import { createAdminClient } from '../features/admin/adminClient'
import { createAccessibleCatalogMapAdapter } from '../features/catalog'
import { createReviewClient } from '../features/reviews'
import { createReviewerCredentialClient } from '../features/reviews/reviewerCredentialClient'
import { createBreakGlassReviewClient } from '../features/reviews'
import { createIndependentAppealClient } from '../features/reviews'
import {
  createPortalClient,
  createPortalMediaHttpTransport,
  sanitizeDiagnostics,
} from '../features/portal'
import { createReadinessAdminClient, createReadinessClient } from '../features/readiness'
import { createBetaClient } from '../features/beta'
import { createCommunityGateClient, createCommunityPreparationClient } from '../features/community'
import { createBillingClient } from '../features/billing'
import { createShopperClient } from '../features/shopper'
import { createOwnConsentClient } from '../features/rg01'
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
  IndexedDbRefreshSessionStorage,
  type RefreshSessionStorage,
} from '../features/auth/refreshSessionStorage'
import {
  createAccountLifecycleClient,
  createRpcSessionRegistry,
  type AccountRole,
  type AuthProviderAdapter,
  type PasswordRecoveryRequest,
  type ProviderSession,
} from '../features/auth'
import { createRG01Client } from '../features/rg01/rg01Client'
import { createRG01HttpTransport } from '../features/rg01/rg01HttpTransport'

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
    rpc: ReturnType<typeof createClient>['rpc']
  },
>(
  supabase: T,
  refreshStorage: RefreshSessionStorage = new IndexedDbRefreshSessionStorage(),
): AuthProviderAdapter {
  const challenges = new Map<string, { factorId: string; session: ProviderSession }>()
  const remember = async (session: Session) => {
    await refreshStorage
      .write({ userId: session.user.id, refreshToken: session.refresh_token })
      .catch(() => undefined)
  }
  return {
    async signIn(email, password) {
      const result = await supabase.auth.signInWithPassword({ email, password })
      if (result.error || !result.data.session) return { kind: 'error' }
      await remember(result.data.session)
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
      await remember(result.data)
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
      if (result.data?.state !== 'authenticated' || !result.data.session) return { kind: 'error' }
      const returnedSession = result.data.session as Session
      const session = providerSession(returnedSession)
      if (kind === 'verify') {
        const installed = await supabase.auth.setSession({
          access_token: returnedSession.access_token,
          refresh_token: returnedSession.refresh_token,
        })
        if (
          installed.error ||
          !installed.data.session ||
          installed.data.session.user.id !== session.userId
        ) {
          await supabase.auth.signOut({ scope: 'local' })
          return { kind: 'error' }
        }
      }
      await remember(returnedSession)
      return { kind: 'authenticated', session }
    },
    async completePasswordRecovery(request: PasswordRecoveryRequest) {
      const result = await supabase.functions.invoke('auth-recovery-complete', {
        body: {
          token_hash: request.tokenHash,
          password: request.password,
          request_id: request.requestId,
        },
      })
      if (result.error || result.data?.state !== 'completed') return { kind: 'error' }
      return { kind: 'completed' }
    },
    async signInWithProvider(providerId, returnTo) {
      const target = new URL('/auth/callback', window.location.origin)
      if (returnTo && returnTo !== '/stores') target.searchParams.set('returnTo', returnTo)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: providerId,
        options: { redirectTo: target.toString() },
      })
      if (error) throw new Error('Provider redirect unavailable.')
    },
    async oauthCallback(code, oauthError) {
      if (!code || oauthError) return { kind: 'error' }
      const exchanged = await supabase.auth.exchangeCodeForSession(code)
      if (exchanged.error || !exchanged.data.session) return { kind: 'error' }
      // The admission RPC is declared in SQL, not generated types; assert its wire shape here.
      const admission = (await supabase.rpc('oauth_admission_check')) as {
        data: { state?: string } | null
        error: { message: string } | null
      }
      if (admission.error || admission.data?.state !== 'active') {
        await supabase.auth.signOut({ scope: 'local' })
        await refreshStorage.clear().catch(() => undefined)
        return { kind: 'blocked' }
      }
      await remember(exchanged.data.session)
      return { kind: 'authenticated', session: providerSession(exchanged.data.session) }
    },
    async restoreSession() {
      try {
        const material = await refreshStorage.read()
        if (!material) return null
        const refreshed = await supabase.auth.refreshSession({
          refresh_token: material.refreshToken,
        })
        if (refreshed.error || !refreshed.data.session) throw new Error('refresh_failed')
        if (refreshed.data.session.user.id !== material.userId) throw new Error('account_mismatch')
        await remember(refreshed.data.session)
        return providerSession(refreshed.data.session)
      } catch {
        await refreshStorage.clear().catch(() => undefined)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
        return null
      }
    },
    onSessionChange(listener) {
      const subscription = supabase.auth.onAuthStateChange((event, session) => {
        if (!session || event === 'SIGNED_OUT') {
          void refreshStorage.clear().catch(() => undefined)
          listener(null)
          return
        }
        void remember(session).catch(() => undefined)
        listener(providerSession(session))
      })
      return () => subscription.data.subscription.unsubscribe()
    },
    async clearSessionMaterial() {
      await refreshStorage.clear()
    },
    async signOut() {
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } finally {
        await refreshStorage.clear().catch(() => undefined)
      }
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
  const url = configuredValue(import.meta.env.VITE_SUPABASE_URL)
  const anonKey = configuredValue(import.meta.env.VITE_SUPABASE_ANON_KEY)
  // With no Supabase environment, plain `npm run dev` activates the same local
  // review harness the explicit review build uses, so every role flow (shopper,
  // representative, administrator) and account setup stay testable on one server.
  const localNoEnvHarness = import.meta.env.DEV && !url && !anonKey
  if (
    (import.meta.env.DEV &&
      import.meta.env.MODE === 'review' &&
      import.meta.env.VITE_REVIEW_HARNESS === 'true') ||
    localNoEnvHarness
  ) {
    // A production replacement makes this branch unreachable, so Vite omits both
    // local-only dynamic modules (including all fixture labels) from the bundle.
    const [
      { createReviewHarness },
      {
        createReviewHarnessAuthProvider,
        createReviewHarnessCatalogClient,
        createReviewHarnessClients,
      },
      { ReviewHarnessBanner, ReviewHarnessPage },
      { commercialResearchReviewClient },
      { billingServicingReviewClients },
    ] = await Promise.all([
      import('../review-harness/harness'),
      import('../review-harness/clients'),
      import('../review-harness/components'),
      import('../review-harness/commercialResearch'),
      import('../review-harness/billingServicing'),
    ])
    const reviewHarness = await createReviewHarness({
      dev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
      enabled: localNoEnvHarness ? 'true' : import.meta.env.VITE_REVIEW_HARNESS,
      url: typeof window === 'undefined' ? 'http://127.0.0.1:4173/review' : window.location.href,
    })
    if (reviewHarness) {
      return {
        clients: {
          catalog: createReviewHarnessCatalogClient(reviewHarness.state),
          ...billingServicingReviewClients(
            typeof window === 'undefined' ? '' : window.location.href,
          ),
          ...createReviewHarnessClients(
            reviewHarness.scenario,
            reviewHarness.state,
            reviewHarness.mediaReviewEnabled,
          ),
          ...(import.meta.env.VITE_COMMERCIAL_RESEARCH_REVIEW === 'true'
            ? { billing: commercialResearchReviewClient }
            : {}),
        },
        runtime: {
          reviewHarness,
          reviewHarnessUi: { Banner: ReviewHarnessBanner, Page: ReviewHarnessPage },
          authStore: reviewHarness.authStore,
          authProvider: createReviewHarnessAuthProvider(reviewHarness.state),
          sessionRegistry: reviewHarness.sessionRegistry,
          ...(import.meta.env.VITE_COMMERCIAL_RESEARCH_REVIEW === 'true'
            ? {
                commercialResearch: {
                  artifactDigest: 'b'.repeat(64),
                  questionVersion: 'questions-v1',
                },
              }
            : {}),
        },
      }
    }
  }
  if (!url || !anonKey) return null
  const supabase = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    // PKCE plus preflight-owned URL consumption: main.tsx scrubs every credential
    // from /auth/callback before import, so the provider client must not consume
    // OAuth codes independently of the app's single-use latch.
    auth: {
      persistSession: false,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
  if (
    typeof window !== 'undefined' &&
    ['/reviewer/setup', '/reviewer/credentials', '/reviewer/recover'].includes(
      window.location.pathname,
    )
  ) {
    return {
      clients: {
        reviewerCredentials: createReviewerCredentialClient({
          async execute(command) {
            const result = await supabase.functions.invoke('reviewer-credentials', {
              body: command,
            })
            if (result.error) throw result.error
            return result.data
          },
        }),
      },
      runtime: {},
    }
  }
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
    async edge(name, args) {
      const result = await supabase.functions.invoke(name, { body: args })
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
  const rg01 = createRG01Client(
    createRG01HttpTransport({
      endpoint: `${url}/functions/v1/rg01-command`,
      async getAccessToken() {
        const session = await supabase.auth.getSession()
        return session.data.session?.access_token ?? ''
      },
    }),
  )
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
  const billing = createBillingClient({
    async rpc(name, args) {
      const result = await supabase.rpc(name, args)
      return { data: result.data, error: result.error }
    },
  })
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
  const commercialResearchArtifactDigest = configuredValue(
    import.meta.env.VITE_COMMERCIAL_RESEARCH_ARTIFACT_DIGEST,
  )
  const commercialResearchQuestionVersion = configuredValue(
    import.meta.env.VITE_COMMERCIAL_RESEARCH_QUESTION_VERSION,
  )
  const commercialResearch =
    commercialResearchArtifactDigest?.match(/^[0-9a-f]{64}$/) && commercialResearchQuestionVersion
      ? {
          artifactDigest: commercialResearchArtifactDigest,
          questionVersion: commercialResearchQuestionVersion,
        }
      : undefined
  return {
    clients: {
      candidate,
      admin: createAdminClient({
        async rpc(name, args) {
          const result = await supabase.rpc(name, args)
          return { data: result.data, error: result.error }
        },
      }),
      lifecycle,
      partner,
      partnerAdmin,
      billing,
      billingServicing: createServicingClient((name, args) => supabase.rpc(name, args)),
      billingSales: createSalesClient(
        (name, args) => supabase.rpc(name, args),
        (name, body) => supabase.functions.invoke(name, { body }),
      ),
      shopper,
      reviews: createReviewClient({
        async rpc(name, args) {
          const result = await supabase.rpc(name, args)
          return { data: result.data, error: result.error }
        },
      }),
      reviewerCredentials: createReviewerCredentialClient({
        async execute(command) {
          return edge('reviewer-credentials', command)
        },
      }),
      breakGlassReview: createBreakGlassReviewClient({
        async execute(command) {
          const result = await supabase.functions.invoke('break-glass-review', { body: command })
          if (result.error) throw result.error
          return result.data
        },
      }),
      independentAppealReview: createIndependentAppealClient({
        async execute(command) {
          const result = await supabase.functions.invoke('appeal-review', { body: command })
          if (result.error) throw result.error
          return result.data
        },
      }),
      storeApplicationAdmin: createStoreApplicationAdminClient(async (operation, payload) => {
        if (operation === 'verify_signal')
          return edge('partner-provider-command', {
            operation: 'store_application_verify_signal',
            payload,
          })
        return rpc('store_application_admin_command', {
          p_operation: operation,
          p_payload: payload,
        })
      }),
      storeApplications: createStoreApplicationClient(async (operation, payload) => {
        if (operation === 'signal')
          return edge('partner-provider-command', {
            operation: 'store_application_signal',
            payload,
          })
        const result = await supabase.rpc('store_application_command', {
          p_operation: operation,
          p_payload: payload,
        })
        if (result.error) throw result.error
        return result.data
      }),
      ownerIntakeAvailability: createOwnerIntakeAvailabilityClient(async (name) => {
        const result = await supabase.rpc(name)
        return { data: result.data, error: result.error }
      }),
      promotion: createPromotionClient(rpc),
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
      readinessAdmin: createReadinessAdminClient({
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
      ownConsent: createOwnConsentClient(async (name, args) => {
        const result = await supabase.rpc(name, args)
        if (result.error) throw result.error
        return result.data
      }),
      rg01,
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
      ...(commercialResearch ? { commercialResearch } : {}),
    },
  }
}
