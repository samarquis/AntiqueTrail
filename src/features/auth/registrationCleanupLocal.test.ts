// @vitest-environment node
import { createHmac, createHash, randomUUID, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { createLocalService } from '../../../scripts/configured-shopper-local.mjs'
import {
  handleAccountRegistration,
  type AccountRegistrationDependencies,
} from '../../../supabase/functions/_shared/account-registration'
import { runRegistrationCleanup } from '../../../supabase/functions/_shared/account-registration-cleanup'
import { withDeadline } from '../../../supabase/functions/_shared/registration-config'

const runLocalProviderProof = process.env.RUN_LOCAL_REGISTRATION_CLEANUP === '1'
const describeLocal = runLocalProviderProof ? describe : describe.skip
type RegistrationReservation =
  | { state: 'blocked' }
  | { state: 'pending_verification' }
  | {
      state: 'reconciliation_required'
      admissionId: string
      operationId: string
      kind: 'generate_link' | 'send_verification'
    }
  | { state: 'reserved'; admissionId: string; providerOperationId: string }

describeLocal('registration cleanup against an isolated local provider and database', () => {
  it('times out after provider creation, reconciles one identity, rejects callback during cleanup, and preserves admitted identities', async () => {
    const local = createLocalService({ disableStorage: true })
    try {
      const run = await local.start()
      if (!run.anonKey || !run.serviceRoleKey || !run.endpoint)
        throw new Error('Local provider credentials unavailable')
      const anonKey = run.anonKey
      const serviceRoleKey = run.serviceRoleKey
      const emailSecret = randomBytes(32).toString('hex')
      const origin = run.endpoint
      const rpc = (name: string, args: Record<string, unknown> = {}) =>
        local.request(`/rest/v1/rpc/${name}`, {
          key: run.anonKey,
          token: serviceRoleKey,
          schema: 'app_public',
          body: args,
        })
      const admin = async (method: 'GET' | 'PUT' | 'DELETE', userId: string, body?: object) => {
        if (!/^[0-9a-f-]{36}$/iu.test(userId)) throw new Error('Invalid local provider user id')
        const response = await fetch(`${origin}/auth/v1/admin/users/${userId}`, {
          method,
          redirect: 'error',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
        return { status: response.status, body: await response.json().catch(() => null) }
      }
      const createProviderUser = async (
        email: string,
        password: string,
        admissionId: string,
        emailConfirmed: boolean,
      ) => {
        const user = await local.request('/auth/v1/admin/users', {
          key: anonKey,
          token: serviceRoleKey,
          body: {
            email,
            password,
            email_confirm: emailConfirmed,
            user_metadata: { antique_trail_admission_id: admissionId },
          },
        })
        if (!/^[0-9a-f-]{36}$/iu.test(user.id))
          throw new Error('Local provider did not return exact user id')
        return user.id as string
      }
      const hmac = (email: string) =>
        `\\x${createHmac('sha256', emailSecret)
          .update(email.normalize('NFKC').trim().toLocaleLowerCase('en-US'))
          .digest('hex')}`
      const digest = (email: string) =>
        `\\x${createHash('sha256')
          .update(email.normalize('NFKC').trim().toLocaleLowerCase('en-US'))
          .digest('hex')}`
      const reserve = async (
        email: string,
        requestId: string,
      ): Promise<RegistrationReservation> => {
        const mode = await rpc('account_registration_fingerprint_mode', {
          p_idempotency_key: requestId,
          p_keyed_email_hmac: hmac(email),
          p_legacy_email_digest: digest(email),
        })
        expect(mode).toBe('current')
        const result = await rpc('begin_account_registration', {
          p_email_hmac: hmac(email),
          p_age_18_attestation: true,
          p_idempotency_key: requestId,
        })
        return result as RegistrationReservation
      }
      const registrationDependencies = (
        signupOrigin: string,
        timeoutMs: number,
      ): AccountRegistrationDependencies => ({
        reserve: ({ email, requestId }: { email: string; requestId: string }) =>
          reserve(email, requestId),
        begin: (
          operationId: string,
          admissionId: string,
          requestId: string,
          kind: 'generate_link' | 'send_verification',
        ) =>
          rpc('begin_account_registration_operation', {
            p_operation_id: operationId,
            p_admission_id: admissionId,
            p_idempotency_key: requestId,
            p_kind: kind,
          }),
        generate: async ({
          admissionId,
          email,
          password,
        }: {
          admissionId: string
          email: string
          password: string
        }) => {
          const response = await withDeadline(timeoutMs, (signal) =>
            fetch(`${signupOrigin}/auth/v1/signup`, {
              method: 'POST',
              signal,
              redirect: 'error',
              headers: { apikey: anonKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email,
                password,
                data: { antique_trail_admission_id: admissionId },
              }),
            }),
          )
          if (!response.ok) return { outcome: 'unknown' as const }
          const payload = (await response.json()) as { user?: { id?: unknown } }
          if (typeof payload.user?.id !== 'string') return { outcome: 'unknown' as const }
          return {
            outcome: 'confirmed_generated' as const,
            appCallbackUrl: 'http://127.0.0.1:4173/auth/callback',
            providerUserId: payload.user.id,
          }
        },
        settleGenerate: (input: {
          operationId: string
          admissionId: string
          requestId: string
          outcome: string
          providerUserId?: string
        }) =>
          rpc('settle_account_registration_generate', {
            p_operation_id: input.operationId,
            p_admission_id: input.admissionId,
            p_idempotency_key: input.requestId,
            p_outcome: input.outcome,
            p_provider_user_id: input.providerUserId ?? null,
          }),
        deliver: async () => 'confirmed_delivered' as const,
        settleDelivery: (input: {
          operationId: string
          admissionId: string
          requestId: string
          outcome: string
        }) =>
          rpc('settle_account_registration_delivery', {
            p_operation_id: input.operationId,
            p_admission_id: input.admissionId,
            p_idempotency_key: input.requestId,
            p_outcome: input.outcome,
          }),
        reconcile: async (input: {
          admissionId: string
          operationId: string
          requestId: string
          kind: 'generate_link' | 'send_verification'
        }) => {
          if (input.kind === 'generate_link') {
            const exact = (await rpc('registration_exact_provider_for_admission', {
              p_admission_id: input.admissionId,
            })) as { state: 'found' | 'absent' | 'duplicate'; providerUserId?: string }
            const result = (await rpc('reconcile_account_registration_generate', {
              p_operation_id: input.operationId,
              p_admission_id: input.admissionId,
              p_idempotency_key: input.requestId,
              p_provider_state: exact.state,
              p_provider_user_id: exact.providerUserId ?? null,
            })) as { state: string }
            return {
              state:
                result.state === 'reconciliation_required'
                  ? ('reconciliation_required' as const)
                  : ('blocked' as const),
            }
          }
          const result = (await rpc('reconcile_account_registration_delivery', {
            p_operation_id: input.operationId,
            p_admission_id: input.admissionId,
            p_idempotency_key: input.requestId,
            p_outcome: 'confirmed_delivered',
          })) as { state: string }
          return {
            state:
              result.state === 'pending_verification'
                ? ('pending_verification' as const)
                : result.state === 'blocked'
                  ? ('blocked' as const)
                  : ('reconciliation_required' as const),
          }
        },
      })

      await local.sql(
        "update app_private.account_registration_config set mode='public', version=version+1 where id=1; update app_private.registration_quarantine_latch set state='open' where id=1;",
      )

      const decoyEmail = `cleanup-decoy-${randomUUID()}@example.test`
      const decoyId = await createProviderUser(decoyEmail, 'Passw0rd', randomUUID(), true)
      const requestId = randomUUID()
      const email = `cleanup-timeout-${requestId}@example.test`
      const password = 'Passw0rd'
      const timeoutReservation = await reserve(email, requestId)
      if (timeoutReservation.state !== 'reserved')
        throw new Error('Timeout scenario reservation was not created')
      const admissionId = timeoutReservation.admissionId
      const proxy = await delayedSignupProxy(origin, anonKey, 700)
      let providerId = ''
      let callbackRejectedDuringCleanup = false
      let timeoutSnapshot: Record<string, unknown> = {}
      let terminalSnapshot: Record<string, unknown> = {}
      try {
        const request = () =>
          new Request('http://127.0.0.1/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, ageAttested: true, requestId }),
          })
        const first = await handleAccountRegistration(
          request(),
          registrationDependencies(proxy.origin, 150),
        )
        expect(first.status).toBe(503)
        expect(await first.json()).toEqual({ state: 'error' })
        providerId = await proxy.createdProviderId
        const existing = await admin('GET', providerId)
        expect(existing.status).toBe(200)
        expect(proxy.signupCount()).toBe(1)
        timeoutSnapshot = await readLifecycleState(local, requestId, providerId)
        expect(timeoutSnapshot).toMatchObject({ registrationOperation: 'reconciliation_required' })

        const retry = await handleAccountRegistration(
          request(),
          registrationDependencies(proxy.origin, 150),
        )
        expect(retry.status).toBe(202)
        expect(await retry.json()).toEqual({ state: 'blocked' })
        expect(proxy.signupCount()).toBe(1)
        const identityCount = Number(
          await local.sql(
            `select count(*) from auth.users where raw_user_meta_data->>'antique_trail_admission_id'='${admissionId}';`,
          ),
        )
        expect(identityCount).toBe(1)

        const cleanup = await runRegistrationCleanup({
          claim: () => rpc('claim_account_registration_cleanup'),
          begin: (cleanupTicketId: string, providerUserId: string) =>
            rpc('begin_account_registration_cleanup', {
              p_cleanup_ticket_id: cleanupTicketId,
              p_provider_user_id: providerUserId,
            }),
          async deleteExact(exactProviderId: string) {
            expect(exactProviderId).toBe(providerId)
            const confirmed = await admin('PUT', exactProviderId, { email_confirm: true })
            expect(confirmed.status).toBe(200)
            const callback = await rpc('complete_account_registration_callback', {
              p_admission_id: admissionId,
              p_provider_user_id: exactProviderId,
            })
            callbackRejectedDuringCleanup = callback === false
            expect(callbackRejectedDuringCleanup).toBe(true)
            const response = await admin('DELETE', exactProviderId)
            return response.status === 404 || (response.status >= 200 && response.status < 300)
              ? ('confirmed_deleted' as const)
              : response.status < 500
                ? ('confirmed_not_deleted' as const)
                : ('unknown' as const)
          },
          settle: (cleanupTicketId: string, providerUserId: string, outcome: string) =>
            rpc('settle_account_registration_cleanup', {
              p_cleanup_ticket_id: cleanupTicketId,
              p_provider_user_id: providerUserId,
              p_outcome: outcome,
            }),
          reconcile: (cleanupTicketId: string, providerUserId: string) =>
            rpc('reconcile_account_registration_cleanup', {
              p_cleanup_ticket_id: cleanupTicketId,
              p_provider_user_id: providerUserId,
            }),
        })
        expect(cleanup).toBe('completed_terminal_cleanup')
        expect((await admin('GET', providerId)).status).toBe(404)
        expect((await admin('GET', decoyId)).status).toBe(200)
        terminalSnapshot = await readLifecycleState(local, requestId, providerId)
        expect(terminalSnapshot).toMatchObject({
          admission: 'completed_terminal_cleanup',
          registrationOperation: 'settled_captured',
          cleanupTicket: 'completed_absent',
          activeRoleGrant: false,
        })
      } finally {
        await proxy.close()
      }

      const protectedRequestId = randomUUID()
      const protectedEmail = `cleanup-admitted-${protectedRequestId}@example.test`
      const reservation = await reserve(protectedEmail, protectedRequestId)
      if (reservation.state !== 'reserved')
        throw new Error('Protected scenario reservation was not created')
      const protectedAdmissionId = reservation.admissionId
      const operationId = reservation.providerOperationId
      if (!operationId) throw new Error('Missing protected registration operation')
      expect(
        await rpc('begin_account_registration_operation', {
          p_operation_id: operationId,
          p_admission_id: protectedAdmissionId,
          p_idempotency_key: protectedRequestId,
          p_kind: 'generate_link',
        }),
      ).toMatchObject({ state: 'calling' })
      const protectedId = await createProviderUser(
        protectedEmail,
        'Passw0rd',
        protectedAdmissionId,
        true,
      )
      const generated = (await rpc('settle_account_registration_generate', {
        p_operation_id: operationId,
        p_admission_id: protectedAdmissionId,
        p_idempotency_key: protectedRequestId,
        p_outcome: 'confirmed_generated',
        p_provider_user_id: protectedId,
      })) as { deliveryOperationId?: string }
      if (!generated.deliveryOperationId) throw new Error('Missing delivery operation')
      expect(
        await rpc('begin_account_registration_operation', {
          p_operation_id: generated.deliveryOperationId,
          p_admission_id: protectedAdmissionId,
          p_idempotency_key: protectedRequestId,
          p_kind: 'send_verification',
        }),
      ).toMatchObject({ state: 'calling' })
      expect(
        await rpc('settle_account_registration_delivery', {
          p_operation_id: generated.deliveryOperationId,
          p_admission_id: protectedAdmissionId,
          p_idempotency_key: protectedRequestId,
          p_outcome: 'confirmed_delivered',
        }),
      ).toMatchObject({ state: 'pending_verification' })
      expect(
        await rpc('complete_account_registration_callback', {
          p_admission_id: protectedAdmissionId,
          p_provider_user_id: protectedId,
        }),
      ).toBe(true)
      const enqueue = await rpc('enqueue_account_registration_cleanup', {
        p_admission_id: admissionId,
        p_provider_user_id: protectedId,
      })
      expect(enqueue).toEqual({ state: 'blocked' })
      expect((await admin('GET', protectedId)).status).toBe(200)
      const protectedState = await readLifecycleState(local, protectedRequestId, protectedId)
      expect(protectedState).toMatchObject({
        admission: 'active',
        registrationOperation: 'settled_captured',
        cleanupTicket: null,
        activeRoleGrant: true,
      })

      console.info(
        JSON.stringify({
          localProject: run.projectId,
          sourceSha: run.sourceSha,
          timeoutRetry: {
            providerTimeoutObserved: true,
            providerSignupRequests: proxy.signupCount(),
            providerIdentityCountAfterRetry: 1,
            durableStateAfterTimeout: timeoutSnapshot,
            callbackRejectedDuringCleanup,
            providerIdentityAfterCleanup: 'absent',
            finalState: terminalSnapshot,
          },
          unrelatedProviderIdentity: 'preserved',
          admittedIdentityCleanupAttempt: 'blocked',
          admittedProviderIdentity: 'present',
          admittedFinalState: protectedState,
        }),
      )
    } finally {
      await local.cleanup()
    }
  }, 1_200_000)
})

async function delayedSignupProxy(
  supabaseOrigin: string,
  anonKey: string,
  responseDelayMs: number,
): Promise<{
  origin: string
  createdProviderId: Promise<string>
  signupCount: () => number
  close: () => Promise<void>
}> {
  let signupCount = 0
  let resolveCreated!: (userId: string) => void
  let rejectCreated!: (error: Error) => void
  const createdProviderId = new Promise<string>((resolve, reject) => {
    resolveCreated = resolve
    rejectCreated = reject
  })
  void createdProviderId.catch(() => {})
  const server: Server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/auth/v1/signup') {
      response.writeHead(404).end()
      return
    }
    signupCount++
    try {
      const parts: Buffer[] = []
      for await (const part of request) {
        parts.push(Buffer.from(part))
        if (parts.reduce((total, part) => total + part.length, 0) > 64_000)
          throw new Error('Local signup request too large')
      }
      const upstream = await fetch(`${supabaseOrigin}/auth/v1/signup`, {
        method: 'POST',
        redirect: 'error',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: Buffer.concat(parts),
      })
      const body = Buffer.from(await upstream.arrayBuffer())
      const signup = JSON.parse(body.toString('utf8')) as {
        user?: { id?: unknown }
        id?: unknown
      }
      const providerUserId = typeof signup.user?.id === 'string' ? signup.user.id : signup.id
      if (!upstream.ok || typeof providerUserId !== 'string')
        throw new Error(`Local provider signup failed with HTTP ${upstream.status}`)
      resolveCreated(providerUserId)
      await delay(responseDelayMs)
      if (!response.destroyed && !response.writableEnded) {
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        })
        response.end(body)
      }
    } catch (error) {
      rejectCreated(error instanceof Error ? error : new Error('Local provider proxy failed'))
      if (!response.destroyed && !response.writableEnded) response.writeHead(502).end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local signup proxy did not bind')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    createdProviderId,
    signupCount: () => signupCount,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

async function readLifecycleState(
  local: ReturnType<typeof createLocalService>,
  requestId: string,
  providerUserId: string,
): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/iu.test(requestId) || !/^[0-9a-f-]{36}$/iu.test(providerUserId))
    throw new Error('Invalid registration proof identity')
  const raw = await local.sql(
    `select json_build_object(
      'admission',(select state from app_private.account_admission_receipts where idempotency_key='${requestId}'),
      'registrationOperation',(select o.state from app_private.registration_provider_operations o join app_private.account_admission_receipts a using(admission_id) where a.idempotency_key='${requestId}' and o.kind='generate_link'),
      'cleanupTicket',(select state from app_private.registration_cleanup_tickets where provider_user_id='${providerUserId}'),
      'activeRoleGrant',exists(select 1 from app_private.role_grants where subject_user_id='${providerUserId}' and state='active')
    )::text;`,
  )
  return JSON.parse(String(raw).trim()) as Record<string, unknown>
}
