import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  const events: string[] = []
  const trip = {
    id: 'trip-1',
    name: 'Antique Day',
    localDate: '2026-08-10',
    state: 'active',
    version: 4,
    stops: [],
  }
  const grant = {
    keyId: 'key-v1',
    claims: {
      accountId: 'shopper-a',
      tripId: 'trip-1',
      installId: 'install-a',
      deviceId: 'device-key-a',
      deviceKeyId: 'device-key-a',
      sessionSecurityVersion: 3,
      issuedAt: '2026-08-04T12:00:00.000Z',
      expiresAt: '2026-08-05T12:00:00.000Z',
      reauthorizeBy: '2026-08-11T12:00:00.000Z',
      nonce: 'grant-1',
    },
    signature: 'valid-signature',
  }
  const supabase = {
    functions: {
      invoke: vi.fn(
        async (
          name: string,
          options: unknown,
        ): Promise<{
          data: Record<string, unknown> | null
          error: Error | null
        }> => {
          events.push(`edge:${name}`)
          void options
          if (name === 'trip-go-command') return { data: trip, error: null }
          return { data: { state: 'ready', receiptId: 'receipt-1' }, error: null }
        },
      ),
    },
    rpc: vi.fn(async (name: string, payload: unknown) => {
      events.push(`rpc:${name}`)
      void payload
      if (name === 'prepare_go_device_command') {
        return { data: { baseVersion: trip.version }, error: null }
      }
      if (name === 'account_lifecycle_status') {
        return { data: { state: 'active' }, error: null }
      }
      if (name === 'request_account_export') {
        return {
          data: { id: 'export-1', state: 'queued', createdAt: '2026-08-04T12:00:00Z' },
          error: null,
        }
      }
      return { data: { trip, grant }, error: null }
    }),
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
  return { events, trip, grant, supabase }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => harness.supabase) }))

import { configuredComposition, createAuthProvider } from './configuredComposition'
import {
  RECOVERY_ACCEPTED_BYTES,
  handleAuthRecoveryRequest,
} from '../../supabase/functions/_shared/auth-recovery-request'
import recoveryEdgeSource from '../../supabase/functions/auth-recovery-request/index.ts?raw'
import {
  InMemoryOfflineDatabase,
  loadOrCreateTripInstallationIdentity,
  type TripInstallationIdentity,
} from '../features/trips'

let tripDatabase: InMemoryOfflineDatabase
let tripIdentity: TripInstallationIdentity

const socialSupabase = {
  auth: {
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(),
  },
  functions: { invoke: vi.fn() },
  rpc: vi.fn(),
}

function socialAdapter() {
  return createAuthProvider(socialSupabase as unknown as Parameters<typeof createAuthProvider>[0])
}

function providerSessionFixture() {
  return {
    access_token: `header.${btoa(JSON.stringify({ amr: [{ method: 'oauth', timestamp: 1_755_000_000 }] }))}.sig`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'oauth-user-1',
      email: 'shopper@example.test',
      email_confirmed_at: '2026-08-01T00:00:00Z',
      app_metadata: { role: 'Shopper' },
      factors: [],
    },
  }
}

describe('social sign-in provider adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts the provider redirect at the callback route and preserves a custom returnTo', async () => {
    socialSupabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })
    const adapter = socialAdapter()
    await adapter.signInWithProvider!('google')
    const defaultCall = socialSupabase.auth.signInWithOAuth.mock.calls[0][0]
    expect(defaultCall.provider).toBe('google')
    expect(new URL(defaultCall.options.redirectTo).pathname).toBe('/auth/callback')
    expect(new URL(defaultCall.options.redirectTo).search).toBe('')

    await adapter.signInWithProvider!('facebook', '/stores/oak/memory')
    const returnCall = socialSupabase.auth.signInWithOAuth.mock.calls[1][0]
    expect(returnCall.provider).toBe('facebook')
    expect(new URL(returnCall.options.redirectTo).searchParams.get('returnTo')).toBe(
      '/stores/oak/memory',
    )

    socialSupabase.auth.signInWithOAuth.mockResolvedValue({
      data: {},
      error: new Error('provider unreachable'),
    })
    await expect(adapter.signInWithProvider!('google')).rejects.toThrow()
  })

  it('exchanges the PKCE code and admits only identities with an active receipt', async () => {
    socialSupabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: providerSessionFixture() },
      error: null,
    })
    socialSupabase.rpc.mockResolvedValue({ data: { state: 'active' }, error: null })
    const result = await socialAdapter().oauthCallback!('code-1', null)
    expect(socialSupabase.rpc).toHaveBeenCalledWith('oauth_admission_check')
    if (result.kind !== 'authenticated') throw new Error('expected authenticated')
    expect(result.session.userId).toBe('oauth-user-1')
    expect(result.session.email).toBe('shopper@example.test')
    expect(result.session.role).toBe('Shopper')
    expect(result.session.mfaRequired ?? false).toBe(false)
    expect(socialSupabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('signs non-admitted identities out locally and reports them blocked', async () => {
    socialSupabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: providerSessionFixture() },
      error: null,
    })
    socialSupabase.rpc.mockResolvedValue({ data: { state: 'blocked' }, error: null })
    const result = await socialAdapter().oauthCallback!('code-2', null)
    expect(result.kind).toBe('blocked')
    expect(socialSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('fails closed when the admission RPC errors or the exchange fails', async () => {
    socialSupabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: providerSessionFixture() },
      error: null,
    })
    socialSupabase.rpc.mockResolvedValue({ data: null, error: new Error('rpc down') })
    expect((await socialAdapter().oauthCallback!('code-3', null)).kind).toBe('blocked')

    socialSupabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error('invalid grant'),
    })
    expect((await socialAdapter().oauthCallback!('code-4', null)).kind).toBe('error')
    expect((await socialAdapter().oauthCallback!(null, 'access_denied')).kind).toBe('error')
  })
})

describe('configured Trip grant composition', () => {
  it('wires production audit selection and read through the authenticated RPC client', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    expect(composition?.clients.admin).toBeDefined()
    await composition!.clients.admin!.getCase('case-131')
    await composition!.clients.admin!.listStoreGrants()
    await composition!.clients.admin!.readAudit('opaque-reference')
    expect(harness.supabase.rpc).toHaveBeenCalledWith('admin_get_review_case', {
      p_case_id: 'case-131',
    })
    expect(harness.supabase.rpc).toHaveBeenCalledWith('admin_list_store_scopes', undefined)
    expect(harness.supabase.rpc).toHaveBeenCalledWith('admin_read_record_audit', {
      p_access: 'opaque-reference',
    })
  })
  beforeEach(async () => {
    harness.events.length = 0
    harness.supabase.rpc.mockClear()
    harness.supabase.functions.invoke.mockClear()
    harness.supabase.auth.resetPasswordForEmail.mockClear()
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    tripDatabase = new InMemoryOfflineDatabase()
    tripIdentity = await loadOrCreateTripInstallationIdentity(tripDatabase)
    harness.grant.claims.installId = tripIdentity.installId
    harness.grant.claims.deviceId = tripIdentity.deviceKeyId
    harness.grant.claims.deviceKeyId = tripIdentity.deviceKeyId
    vi.stubEnv('VITE_TRIP_OFFLINE_GRANT_KEY_ID', 'key-v1')
    vi.stubEnv(
      'VITE_TRIP_OFFLINE_GRANT_PUBLIC_JWK',
      JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    )
  })

  afterEach(() => vi.unstubAllEnvs())

  it('preflights the signer before consumption and unwraps fallback and offline starts', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    expect(composition).not.toBeNull()

    await expect(composition!.clients.trips!.start('trip-1')).resolves.toEqual(harness.trip)
    expect(harness.events).toEqual(['edge:trip-grant-signer', 'rpc:start_trip_with_offline_grant'])
    expect(harness.supabase.functions.invoke).toHaveBeenLastCalledWith('trip-grant-signer', {
      body: expect.objectContaining({
        tripId: 'trip-1',
        installId: tripIdentity.installId,
        deviceKeyId: tripIdentity.deviceKeyId,
        devicePublicKey: tripIdentity.publicKeyJwk,
        proof: expect.objectContaining({
          issuedAt: expect.any(String),
          nonce: expect.any(String),
          signature: expect.any(String),
        }),
      }),
    })

    harness.events.length = 0
    await expect(
      composition!.clients.tripOfflineGrants!.startTripWithOfflineGrant(
        'trip-1',
        tripIdentity.installId,
        tripIdentity.deviceKeyId,
      ),
    ).resolves.toEqual({ trip: harness.trip, grant: harness.grant })
    expect(harness.events).toEqual(['edge:trip-grant-signer', 'rpc:start_trip_with_offline_grant'])
  })

  it('fails closed without calling a consume RPC when signer preflight is unavailable', async () => {
    harness.supabase.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('signer unavailable'),
    })
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    await expect(composition!.clients.trips!.start('trip-1')).rejects.toThrow()
    expect(harness.supabase.rpc).not.toHaveBeenCalled()
  })

  it('routes every ordinary online Go mutation through a fresh device proof gateway', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    await expect(composition!.clients.trips!.markArrived('trip-1', 'stop-1')).resolves.toEqual(
      harness.trip,
    )
    expect(harness.events).toEqual(['rpc:prepare_go_device_command', 'edge:trip-go-command'])
    expect(harness.supabase.functions.invoke).toHaveBeenCalledWith('trip-go-command', {
      body: expect.objectContaining({
        tripId: 'trip-1',
        action: 'mark_arrived',
        stopId: 'stop-1',
        baseVersion: 4,
        deviceKeyId: tripIdentity.deviceKeyId,
        devicePublicKey: tripIdentity.publicKeyJwk,
        proof: expect.objectContaining({ nonce: expect.any(String) }),
      }),
    })
  })

  it('composes the account lifecycle client through bounded RPCs', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    await expect(composition!.clients.lifecycle!.getStatus()).resolves.toEqual({ state: 'active' })
    await expect(composition!.clients.lifecycle!.requestExport()).resolves.toMatchObject({
      id: 'export-1',
      state: 'queued',
    })
    expect(harness.supabase.rpc).toHaveBeenCalledWith('account_lifecycle_status', undefined)
    expect(harness.supabase.rpc).toHaveBeenCalledWith('request_account_export', undefined)
  })

  it('keeps Browse map composition blocked until explicit attributed configuration exists', async () => {
    const blocked = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    expect(blocked!.clients.map).toMatchObject({ capability: 'blocked' })

    vi.stubEnv('VITE_BROWSE_MAP_ENABLED', 'true')
    vi.stubEnv('VITE_BROWSE_MAP_ATTRIBUTION', 'Map data © approved provider v1')
    const enabled = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    expect(enabled!.clients.map).toMatchObject({
      capability: 'available',
      attribution: 'Map data © approved provider v1',
    })
    expect(enabled!.clients.map!.render).toEqual(expect.any(Function))
  })

  it('routes password recovery through the fail-closed Edge boundary', async () => {
    const composition = await configuredComposition({ tripOfflineDatabase: tripDatabase })
    const authProvider = composition?.runtime.authProvider
    expect(authProvider).toBeDefined()
    if (!authProvider) throw new Error('configured auth provider missing')

    await expect(authProvider.sendRecovery(' Shopper@Example.COM ')).resolves.toBeUndefined()

    expect(harness.supabase.functions.invoke).toHaveBeenCalledWith('auth-recovery-request', {
      body: {
        email: 'Shopper@Example.COM',
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      },
    })
    expect(harness.supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('E-01 recovery HTTP boundary', () => {
  it('deploys only the bounded service-role recovery operation', () => {
    expect(recoveryEdgeSource).toContain("admin.rpc('reserve_auth_recovery_delivery'")
    expect(recoveryEdgeSource).toContain("admin.rpc('complete_auth_recovery_delivery'")
    expect(recoveryEdgeSource).toContain('RECOVERY_EMAIL_HMAC_SECRET')
    expect(recoveryEdgeSource).not.toContain('resetPasswordForEmail')
    expect(recoveryEdgeSource).not.toContain('auth.admin')
    expect(recoveryEdgeSource).not.toContain('console.')
  })

  it('returns one indistinguishable response and makes no provider call while disabled', async () => {
    const reserve = vi.fn(async () => ({ state: 'blocked' as const }))
    const deliver = vi.fn()
    const settle = vi.fn()
    const recipientHmac = vi.fn(async () => `\\x${'ab'.repeat(32)}`)
    const clockValues = [1_000, 1_125, 2_000, 2_125]
    const sleep = vi.fn(async () => undefined)
    const dependencies = {
      reserve,
      deliver,
      settle,
      recipientHmac,
      now: () => clockValues.shift() ?? 2_125,
      sleep,
    }

    const responses: Response[] = []
    for (const [index, email] of ['known@example.com', 'missing@example.com'].entries()) {
      responses.push(
        await handleAuthRecoveryRequest(
          new Request('https://example.test/functions/v1/auth-recovery-request', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              email,
              requestId: `00000000-0000-4000-8000-00000000000${index + 1}`,
            }),
          }),
          dependencies,
        ),
      )
    }

    expect(responses.map((response) => response.status)).toEqual([202, 202])
    expect(await responses[0].clone().text()).toBe(await responses[1].clone().text())
    expect(new TextEncoder().encode(await responses[0].text())).toHaveLength(
      RECOVERY_ACCEPTED_BYTES,
    )
    expect([...responses[0].headers]).toEqual([...responses[1].headers])
    expect(deliver).not.toHaveBeenCalled()
    expect(settle).not.toHaveBeenCalled()
    expect(JSON.stringify(reserve.mock.calls)).not.toMatch(/known|missing|example\.com/i)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('settles a reserved operation as no effect when no provider adapter is configured', async () => {
    const settle = vi.fn(async () => undefined)
    const response = await handleAuthRecoveryRequest(
      new Request('https://example.test/functions/v1/auth-recovery-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'shopper@example.com',
          requestId: '00000000-0000-4000-8000-000000000001',
        }),
      }),
      {
        recipientHmac: async () => `\\x${'ab'.repeat(32)}`,
        reserve: async () => ({ state: 'reserved', operationId: 'operation-1' }),
        settle,
        now: () => 1_000,
        sleep: async () => undefined,
      },
    )

    expect(response.status).toBe(202)
    expect(settle).toHaveBeenCalledWith(
      'operation-1',
      '00000000-0000-4000-8000-000000000001',
      'confirmed_not_delivered',
    )
  })

  it('rechecks the latch before delivery and never resends an unknown operation replay', async () => {
    const reserve = vi
      .fn()
      .mockResolvedValueOnce({ state: 'reserved', operationId: 'operation-2' })
      .mockResolvedValueOnce({ state: 'reconciliation_required', operationId: 'operation-2' })
    const begin = vi.fn(async () => ({ state: 'calling' as const }))
    const deliver = vi.fn(async () => 'unknown' as const)
    const settle = vi.fn(async () => undefined)
    const request = () =>
      new Request('https://example.test/functions/v1/auth-recovery-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'shopper@example.com',
          requestId: '00000000-0000-4000-8000-000000000002',
        }),
      })
    const dependencies = {
      recipientHmac: async () => `\\x${'cd'.repeat(32)}`,
      reserve,
      begin,
      deliver,
      settle,
      now: () => 1_000,
      sleep: async () => undefined,
    }

    const first = await handleAuthRecoveryRequest(request(), dependencies)
    const replay = await handleAuthRecoveryRequest(request(), dependencies)

    expect(first.status).toBe(202)
    expect(await first.text()).toBe(await replay.text())
    expect(begin).toHaveBeenCalledOnce()
    expect(begin).toHaveBeenCalledWith('operation-2', '00000000-0000-4000-8000-000000000002')
    expect(deliver).toHaveBeenCalledOnce()
    expect(settle).toHaveBeenCalledWith(
      'operation-2',
      '00000000-0000-4000-8000-000000000002',
      'unknown',
    )
  })
})
