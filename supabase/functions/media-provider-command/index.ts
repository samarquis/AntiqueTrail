import { createClient } from 'npm:@supabase/supabase-js@2.49.1'
import {
  MEDIA_MAX_IMAGE_BYTES,
  runMediaIngest,
  type MediaPipelineDependencies,
} from '../_shared/media-pipeline.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const workerJwt = Deno.env.get('MEDIA_WORKER_JWT')
const appOrigin = Deno.env.get('APP_ORIGIN')
const privateBucket = Deno.env.get('MEDIA_PRIVATE_BUCKET')
const scanUrl = exactProviderUrl(Deno.env.get('MEDIA_SCAN_URL'))
const scanToken = Deno.env.get('MEDIA_SCAN_TOKEN')
const processorUrl = exactProviderUrl(Deno.env.get('MEDIA_PROCESSOR_URL'))
const processorToken = Deno.env.get('MEDIA_PROCESSOR_TOKEN')
const providerGateAccepted = Deno.env.get('MEDIA_PROVIDER_GATE_ACCEPTED') === 'true'

function exactProviderUrl(value: string | undefined): URL | undefined {
  if (!value) return
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) return
    return parsed
  } catch {
    return
  }
}

function cors(request: Request): Record<string, string> | undefined {
  const origin = request.headers.get('origin')
  if (!origin || !appOrigin || origin !== appOrigin) return
  return {
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization, Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function unavailable(headers: Record<string, string> = {}, status = 503): Response {
  return new Response('Unavailable', { status, headers })
}

class MediaCapDeniedError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    super('media_cap_exceeded')
  }
}

async function rpc<T>(
  client: ReturnType<typeof createClient>,
  command: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const result = await client.rpc(command, payload)
  if (result.error) throw result.error
  return result.data as T
}

Deno.serve(async (request) => {
  const headers = cors(request)
  if (!headers) return unavailable({}, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (
    request.method !== 'POST' ||
    !providerGateAccepted ||
    !url ||
    !anonKey ||
    !workerJwt ||
    !privateBucket ||
    !scanUrl ||
    !scanToken ||
    !processorUrl ||
    !processorToken
  )
    return unavailable(headers)
  const authorization = request.headers.get('authorization')
  if (!authorization) return unavailable(headers, 401)
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isSafeInteger(declaredLength) || declaredLength > MEDIA_MAX_IMAGE_BYTES + 65_536)
    return unavailable(headers, 413)

  const userClient = createClient(url, anonKey, {
    db: { schema: 'app_public' },
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const workerClient = createClient(url, workerJwt, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const form = await request.formData()
    const image = form.get('image')
    const storeId = form.get('storeId')
    const kind = form.get('kind')
    const altText = form.get('altText')
    const idempotencyKey = form.get('idempotencyKey')
    const rightsConfirmed = form.get('rightsConfirmed')
    const originalUploadId = form.get('originalUploadId')
    const resubmitting = typeof originalUploadId === 'string' && originalUploadId.length > 0
    if (
      !(image instanceof File) ||
      typeof altText !== 'string' ||
      typeof idempotencyKey !== 'string' ||
      rightsConfirmed !== 'true' ||
      image.size > MEDIA_MAX_IMAGE_BYTES
    )
      return unavailable(headers)

    // Resubmission derives store/kind from the server-locked rejected original;
    // the client never supplies store authority. Normal uploads read them from
    // the form as today.
    let activeStoreId: string
    let activeKind: 'cover' | 'gallery'
    if (resubmitting) {
      if (typeof storeId === 'string' || typeof kind === 'string') return unavailable(headers)
      const original = await rpc<{ storeId?: unknown; kind?: unknown }>(userClient, 'media_get_upload', {
        p_upload_id: originalUploadId,
      })
      if (typeof original.storeId !== 'string' || (original.kind !== 'cover' && original.kind !== 'gallery'))
        return unavailable(headers)
      activeStoreId = original.storeId
      activeKind = original.kind
    } else {
      if (typeof storeId !== 'string' || (kind !== 'cover' && kind !== 'gallery'))
        return unavailable(headers)
      activeStoreId = storeId
      activeKind = kind
    }
    const bytes = new Uint8Array(await image.arrayBuffer())

    // Tier cap check at intake for normal uploads (M-01 enforcement per #119).
    // Resubmission performs the cap check atomically inside media_reserve_resubmission
    // against the server-derived store/kind; a denial surfaces as a 409 below.
    if (!resubmitting) {
      const capCheck = await rpc<{ allowed: boolean; remaining?: number; error?: string; message?: string; currentTier?: string; upgradeTier?: string; upgradeCap?: number | null; approvedCount?: number; cap?: number }>(
        userClient,
        'partner_private.check_store_media_cap',
        { p_store_id: activeStoreId, p_kind: activeKind, p_idempotency_key: idempotencyKey }
      )
      if (!capCheck.allowed) {
        return Response.json(
          { error: capCheck.error, message: capCheck.message, currentTier: capCheck.currentTier, upgradeTier: capCheck.upgradeTier, upgradeCap: capCheck.upgradeCap, approvedCount: capCheck.approvedCount, cap: capCheck.cap },
          { status: 409, headers }
        )
      }
    }

    let staged = false
    let acceptedUploadId = ''
    const dependencies: MediaPipelineDependencies = {
      reserve: async (input) => {
        let value: Record<string, unknown>
        if (resubmitting) {
          value = await rpc<Record<string, unknown>>(userClient, 'media_reserve_resubmission', {
            p_original_upload_id: input.originalUploadId,
            p_alt_text: input.altText,
            p_idempotency_key: input.idempotencyKey,
            p_rights_confirmed: input.rightsConfirmed,
            p_source_mime: input.inspection.mime,
            p_source_bytes: input.inspection.bytes,
            p_source_width: input.inspection.width,
            p_source_height: input.inspection.height,
          })
          if (value.error === 'media_cap_exceeded') throw new MediaCapDeniedError(value)
        } else {
          value = await rpc<Record<string, unknown>>(userClient, 'media_reserve_upload', {
            p_store_id: input.storeId,
            p_kind: input.kind,
            p_alt_text: input.altText,
            p_idempotency_key: input.idempotencyKey,
            p_rights_confirmed: input.rightsConfirmed,
            p_source_mime: input.inspection.mime,
            p_source_bytes: input.inspection.bytes,
            p_source_width: input.inspection.width,
            p_source_height: input.inspection.height,
          })
        }
        const uploadId = typeof value.uploadId === 'string' ? value.uploadId : ''
        const originalObjectKey =
          typeof value.originalObjectKey === 'string' ? value.originalObjectKey : ''
        const derivativeObjectKey =
          typeof value.derivativeObjectKey === 'string' ? value.derivativeObjectKey : ''
        if (
          !/^[0-9a-f-]{36}$/iu.test(uploadId) ||
          originalObjectKey !== `quarantine/${uploadId}/original` ||
          derivativeObjectKey !== `quarantine/${uploadId}/derivative.webp`
        )
          throw new Error('media_unavailable')
        acceptedUploadId = uploadId
        return {
          uploadId,
          originalObjectKey,
          derivativeObjectKey,
        }
      },
      async putPrivate(key, value, contentType) {
        const result = await workerClient.storage.from(privateBucket).upload(key, value, {
          cacheControl: '0',
          contentType,
          upsert: false,
        })
        if (result.error) throw result.error
        if (!staged && key.endsWith('/original')) {
          const uploadId = key.split('/')[1]
          await rpc(workerClient, 'media_record_staged_upload', { p_upload_id: uploadId })
          staged = true
        }
      },
      async scan(input) {
        const response = await fetch(scanUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${scanToken}`,
            'Content-Type': 'application/octet-stream',
            'X-Media-Upload-Id': input.uploadId,
          },
          body: input.bytes,
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
        })
        const operationId = response.headers.get('x-provider-operation-id') ?? undefined
        if (!response.ok) return { outcome: 'unknown' as const, operationId }
        const result = (await response.json()) as { outcome?: unknown }
        return {
          outcome:
            result.outcome === 'clean' || result.outcome === 'malicious'
              ? result.outcome
              : ('unknown' as const),
          operationId,
        }
      },
      async reencode(input) {
        const response = await fetch(processorUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${processorToken}`,
            'Content-Type': 'application/octet-stream',
            'X-Media-Upload-Id': input.uploadId,
            'X-Output-Mime': input.outputMime,
            'X-Max-Width': String(input.maxWidth),
            'X-Max-Height': String(input.maxHeight),
            'X-Max-Pixels': String(input.maxPixels),
          },
          body: input.bytes,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/webp')
          throw new Error('media_unavailable')
        const output = new Uint8Array(await response.arrayBuffer())
        return {
          bytes: output,
          mime: 'image/webp',
          width: Number(response.headers.get('x-image-width')),
          height: Number(response.headers.get('x-image-height')),
          metadataStripped: response.headers.get('x-metadata-stripped') === 'true',
          reencoded: response.headers.get('x-reencoded') === 'true',
          operationId: response.headers.get('x-provider-operation-id') ?? '',
        }
      },
      recordQuarantined: (input) =>
        rpc(workerClient, 'media_record_quarantined_upload', {
          p_upload_id: input.uploadId,
          p_outcome: input.outcome,
          p_provider_operation_id: null,
        }),
      recordProcessed: (input) =>
        rpc(workerClient, 'media_record_processing_result', {
          p_upload_id: input.uploadId,
          p_scan_outcome: 'clean',
          p_scan_operation_id: input.scanOperationId,
          p_processor_operation_id: input.processorOperationId,
          p_derivative_digest: `\\x${input.derivativeDigest}`,
          p_derivative_bytes: input.derivativeBytes,
          p_width: input.width,
          p_height: input.height,
          p_metadata_stripped: input.metadataStripped,
          p_reencoded: input.reencoded,
        }),
      claimPublish: async () => Promise.reject(new Error('media_unavailable')),
      getPrivate: async () => Promise.reject(new Error('media_unavailable')),
      putPublic: async () => Promise.reject(new Error('media_unavailable')),
      completePublish: async () => Promise.reject(new Error('media_unavailable')),
      claimPurge: async () => Promise.reject(new Error('media_unavailable')),
      deletePrivate: async () => Promise.reject(new Error('media_unavailable')),
      deletePublic: async () => Promise.reject(new Error('media_unavailable')),
      completePurge: async () => Promise.reject(new Error('media_unavailable')),
    }
    const result = await runMediaIngest(
      {
        bytes,
        claimedMime: image.type,
        storeId: activeStoreId,
        kind: activeKind,
        altText,
        idempotencyKey,
        rightsConfirmed: true,
        originalUploadId: resubmitting ? (originalUploadId as string) : undefined,
      },
      dependencies,
    )
    if (!acceptedUploadId) throw new Error('media_unavailable')
    return Response.json(
      { state: result.state, uploadId: acceptedUploadId },
      { status: 202, headers },
    )
  } catch (error) {
    if (error instanceof MediaCapDeniedError) {
      return Response.json(error.payload, { status: 409, headers })
    }
    return unavailable(headers)
  }
})
