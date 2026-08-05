import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

declare const Deno: { env: { get(name: string): string | undefined } }

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const payloadSecret = Deno.env.get('CANDIDATE_PAYLOAD_SECRET')
const workerSecret = Deno.env.get('CANDIDATE_WORKER_SECRET')

export async function handleCandidateDeliveryWorker(request: Request): Promise<Response> {
  if (
    request.method !== 'POST' ||
    !url ||
    !serviceKey ||
    !payloadSecret ||
    !workerSecret ||
    !(await authorized(request.headers.get('authorization'), `Bearer ${serviceKey}`)) ||
    !(await authorized(request.headers.get('x-candidate-worker-secret'), workerSecret))
  )
    return new Response('Unavailable', { status: 503 })
  const admin = createClient(url, serviceKey, {
    db: { schema: 'app_public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const workerId = crypto.randomUUID()
  let jobId: string | null = null
  try {
    const claimed = await admin.rpc('candidate_claim_share_delivery', { p_worker_id: workerId })
    if (claimed.error) throw claimed.error
    if (!claimed.data) return new Response(null, { status: 204 })
    jobId = uuid(claimed.data.jobId)
    let recipientId: string | null = null
    if (typeof claimed.data.encryptedRecipient === 'string' && claimed.data.title) {
      const email = await decrypt(claimed.data.encryptedRecipient, payloadSecret)
      const lookup = await admin.rpc('candidate_edge_exact_recipient', {
        p_normalized_email: email,
        p_recipient_email_hmac: `\\x${claimed.data.recipientDigest}`,
      })
      if (lookup.error) throw lookup.error
      recipientId =
        typeof lookup.data?.recipientId === 'string' ? lookup.data.recipientId : null
    }
    const payload = await encrypt(
      JSON.stringify({ title: claimed.data.title ?? '', urlNote: claimed.data.urlNote ?? '' }),
      payloadSecret,
    )
    const completed = await admin.rpc('candidate_complete_share_delivery', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_recipient_id: recipientId,
      p_encrypted_payload: `\\x${payload}`,
    })
    if (completed.error) throw completed.error
    return Response.json({ processed: true }, { status: 200 })
  } catch {
    if (jobId) {
      await admin.rpc('candidate_fail_share_delivery', {
        p_job_id: jobId,
        p_worker_id: workerId,
      })
    }
    return new Response('Unavailable', { status: 503 })
  }
}

async function authorized(header: string | null, expectedValue: string) {
  const actual = new TextEncoder().encode(header ?? '')
  const expected = new TextEncoder().encode(expectedValue)
  const digest = async (value: Uint8Array) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value).buffer))
  const [left, right] = await Promise.all([digest(actual), digest(expected)])
  let difference = left.length ^ right.length
  for (let index = 0; index < Math.max(left.length, right.length); index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return difference === 0
}

function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
    throw new Error('invalid')
  return value
}
async function aesKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}
async function encrypt(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await aesKey(secret),
      new TextEncoder().encode(value),
    ),
  )
  return hex(new Uint8Array([...iv, ...data]))
}
async function decrypt(value: string, secret: string) {
  const all = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: all.slice(0, 12) },
      await aesKey(secret),
      all.slice(12),
    ),
  )
}
function hex(value: Uint8Array) {
  return [...value].map((item) => item.toString(16).padStart(2, '0')).join('')
}
