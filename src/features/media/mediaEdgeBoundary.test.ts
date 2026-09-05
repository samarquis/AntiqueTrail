import { describe, expect, it } from 'vitest'
import uploadSource from '../../../supabase/functions/media-provider-command/index.ts?raw'
import lifecycleSource from '../../../supabase/functions/media-lifecycle-worker/index.ts?raw'

describe('M-01 Edge wiring contract', () => {
  it('keeps upload disabled without the accepted deployment gate and every constrained dependency', () => {
    expect(uploadSource).toContain("Deno.env.get('MEDIA_PROVIDER_GATE_ACCEPTED') === 'true'")
    expect(uploadSource).toContain("Deno.env.get('MEDIA_WORKER_JWT')")
    expect(uploadSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(uploadSource).not.toContain("'Access-Control-Allow-Origin': '*'")
    expect(uploadSource).toContain('origin !== appOrigin')
  })

  it('uses bounded exact HTTPS providers and private staging before provider work', () => {
    expect(uploadSource).toContain("parsed.protocol !== 'https:'")
    expect(uploadSource).toContain("redirect: 'error'")
    expect(uploadSource).toContain('AbortSignal.timeout(10_000)')
    expect(uploadSource).toContain('AbortSignal.timeout(15_000)')
    expect(uploadSource.indexOf('.upload(key, value')).toBeLessThan(
      uploadSource.indexOf('await fetch(scanUrl'),
    )
    expect(uploadSource).not.toContain('.from(publicBucket)')
    expect(uploadSource).toContain('uploadId: acceptedUploadId')
    expect(uploadSource).toContain('state: result.state')
  })

  it('publishes and purges only behind the constant-time scheduler boundary', () => {
    expect(lifecycleSource).toContain("Deno.env.get('MEDIA_SCHEDULER_TOKEN')")
    expect(lifecycleSource).toContain('difference |= expected[index] ^ actual[index]')
    expect(lifecycleSource).toContain("rpc<string[]>(worker, 'media_list_publish_jobs'")
    expect(lifecycleSource).toContain("rpc<string[]>(lifecycle, 'media_list_purge_jobs'")
    expect(lifecycleSource).toContain('.from(publicBucket).upload')
    expect(lifecycleSource).toContain('.from(publicBucket).remove')
    expect(lifecycleSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('derives store and kind from the server-locked rejected original for resubmission', () => {
    expect(uploadSource).toContain("const originalUploadId = form.get('originalUploadId')")
    expect(uploadSource).toContain("const resubmitting = typeof originalUploadId === 'string'")
    expect(uploadSource).not.toContain("'media_get_upload'")
    expect(uploadSource).toContain("userClient, 'media_reserve_resubmission'")
    expect(uploadSource).toContain('p_source_digest: sourceDigest')
    expect(uploadSource).toContain('upsert: allowOverwrite')
    expect(uploadSource).toContain('class MediaCapDeniedError extends MediaPipelineError')
    expect(uploadSource).toContain(
      "if (value.error === 'media_unavailable') throw new MediaPipelineError()",
    )
    expect(uploadSource).toContain('async function sha256Hex')
    expect(uploadSource).toContain(
      "if (typeof storeId === 'string' || typeof kind === 'string') return unavailable(headers)",
    )
  })
})
