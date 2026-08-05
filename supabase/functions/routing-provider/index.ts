import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  executeRoutingOperation,
  type RoutingOperationDependencies,
  type RoutingOperationInput,
  type RoutingProviderResult,
} from '../_shared/routing-provider.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const providerJwt = Deno.env.get('ROUTING_PROVIDER_JWT')
const appOrigin = Deno.env.get('APP_ORIGIN')
const matrixUrl = exactHttpsUrl(Deno.env.get('ROUTING_MATRIX_URL'))
const geocodeUrl = exactHttpsUrl(Deno.env.get('ROUTING_GEOCODE_URL'))
const reconcileUrl = exactHttpsUrl(Deno.env.get('ROUTING_RECONCILE_URL'))
const providerToken = Deno.env.get('ROUTING_PROVIDER_TOKEN')
const providerVersion = Deno.env.get('ROUTING_PROVIDER_VERSION')
const attribution = Deno.env.get('ROUTING_PROVIDER_ATTRIBUTION')
const enabled = Deno.env.get('ROUTING_PROVIDER_GATE_ACCEPTED') === 'true'
const configuredTimeout = Number(Deno.env.get('ROUTING_PROVIDER_TIMEOUT_MS') ?? '8000')
const timeoutMs = Number.isInteger(configuredTimeout)
  ? Math.min(30_000, Math.max(100, configuredTimeout))
  : 8_000

function exactHttpsUrl(raw: string | undefined): string | undefined {
  if (!raw) return
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      ? url.toString()
      : undefined
  } catch {
    return
  }
}

function response(status: number, body: unknown, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
    },
  })
}

function operationalFailure(status: RoutingProviderResult['status']): RoutingProviderResult {
  return { status: status === 'ok' ? 'outage' : status, requestCount: 0, costUnits: 0 }
}

async function providerCall(
  url: string | undefined,
  body: unknown,
  idempotencyKey: string,
  signal: AbortSignal,
): Promise<RoutingProviderResult> {
  if (!url || !providerToken || !providerVersion || !attribution)
    return operationalFailure('revoked')
  try {
    const result = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${providerToken}`,
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!result.ok || !result.headers.get('content-type')?.includes('application/json'))
      return operationalFailure(result.status === 429 ? 'quota' : 'outage')
    const value = (await result.json()) as Record<string, unknown>
    const status = value.status
    const costUnits = typeof value.costUnits === 'number' ? value.costUnits : 0
    if (status !== 'ok') {
      if (
        !['timeout', 'quota', 'revoked', 'outage', 'temporary_market', 'no_route'].includes(
          String(status),
        )
      )
        return operationalFailure('outage')
      return {
        status,
        providerOperationId:
          typeof value.providerOperationId === 'string' ? value.providerOperationId : undefined,
        providerVersion,
        attribution,
        requestCount: 1,
        costUnits,
      } as RoutingProviderResult
    }
    const evidence = {
      status: 'ok' as const,
      providerOperationId:
        typeof value.providerOperationId === 'string' ? value.providerOperationId : '',
      providerVersion,
      attribution,
      generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
      requestCount: 1,
      costUnits,
    }
    if (Array.isArray(value.legs)) return { ...evidence, legs: value.legs } as RoutingProviderResult
    if (Array.isArray(value.candidates))
      return { ...evidence, candidates: value.candidates } as RoutingProviderResult
    return operationalFailure('outage')
  } catch {
    return operationalFailure(signal.aborted ? 'timeout' : 'outage')
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? undefined
  if (!appOrigin || origin !== appOrigin) return response(404, { status: 'unavailable' })
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': appOrigin,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-max-age': '600',
        vary: 'origin',
      },
    })
  if (request.method !== 'POST' || !enabled || !supabaseUrl || !anonKey || !providerJwt)
    return response(503, operationalFailure('revoked'), appOrigin)
  const bearer = request.headers.get('authorization')
  if (!bearer?.startsWith('Bearer ')) return response(404, { status: 'unavailable' }, appOrigin)

  try {
    const input = (await request.json()) as RoutingOperationInput
    const user = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const worker = createClient(supabaseUrl, anonKey, {
      db: { schema: 'app_public' },
      global: { headers: { authorization: `Bearer ${providerJwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const dependencies: RoutingOperationDependencies = {
      async reserve(value) {
        const result = await user.rpc('routing_reserve_operation', {
          p_kind: value.operation,
          p_idempotency: value.idempotencyKey,
          p_explicit: value.explicitAction,
          p_point_count: value.pointCount,
          p_coordinates: value.coordinates ?? null,
          p_return_index: value.returnIndex ?? null,
        })
        if (result.error || !result.data) return { state: 'blocked', reason: 'r01_blocked' }
        return result.data as Awaited<ReturnType<RoutingOperationDependencies['reserve']>>
      },
      async begin(operationId, idempotencyKey) {
        const result = await worker.rpc('routing_begin_operation', {
          p_operation: operationId,
          p_idempotency: idempotencyKey,
        })
        if (result.error || !result.data) return { state: 'blocked', reason: 'r01_blocked' }
        return result.data as Awaited<ReturnType<RoutingOperationDependencies['begin']>>
      },
      callMatrix: (value, signal) =>
        providerCall(
          matrixUrl,
          {
            coordinates: value.coordinates,
            ...(value.returnIndex == null ? {} : { returnIndex: value.returnIndex }),
          },
          value.idempotencyKey,
          signal,
        ),
      callGeocode: (value, signal) =>
        providerCall(
          geocodeUrl,
          { text: value.text, purpose: value.purpose },
          value.idempotencyKey,
          signal,
        ),
      reconcile: (value) =>
        providerCall(
          reconcileUrl,
          { operation: value.operation, idempotencyKey: value.idempotencyKey },
          value.idempotencyKey,
          value.signal,
        ),
      async settle(value) {
        const result = await worker.rpc('routing_settle_operation', {
          p_operation: value.operationId,
          p_idempotency: value.idempotencyKey,
          p_outcome: value.outcome,
          p_provider_operation_id: value.providerOperationId ?? null,
          p_provider_version: value.providerVersion ?? null,
          p_attribution: value.attribution ?? null,
          p_request_count: value.requestCount,
          p_cost_units: value.costUnits,
        })
        if (result.error) throw new Error('settlement unavailable')
      },
    }
    const controller = new AbortController()
    const abort = () => controller.abort()
    request.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, timeoutMs)
    try {
      const result = await executeRoutingOperation(input, dependencies, controller.signal)
      return response(200, result, appOrigin)
    } finally {
      clearTimeout(timer)
      request.signal.removeEventListener('abort', abort)
    }
  } catch {
    return response(503, operationalFailure('outage'), appOrigin)
  }
})
