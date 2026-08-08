import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export async function runProviderAuthSmoke({
  url,
  anonKey,
  serviceRoleKey,
  fetchImpl = globalThis.fetch,
}) {
  if (!url || !anonKey || !serviceRoleKey) throw new Error('Provider auth smoke is unconfigured')
  const email = `registration-smoke-${randomUUID()}@invalid.example`
  const headers = (key) => ({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  })
  let signup
  try {
    signup = await fetchImpl(`${url}/auth/v1/signup`, {
      method: 'POST',
      headers: headers(anonKey),
      body: JSON.stringify({ email, password: randomUUID() + randomUUID() }),
    })
  } catch {
    throw new Error('Direct signup status is unknown')
  }
  let signupEvidence
  try {
    signupEvidence = await signup.json()
  } catch {
    throw new Error('Direct signup status is unknown')
  }
  const signupCode = signupEvidence?.code ?? signupEvidence?.error_code
  if (signup.status !== 422 || signupCode !== 'signup_disabled')
    throw new Error('Direct signup status is unknown')
  const generated = await fetchImpl(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: headers(serviceRoleKey),
    body: JSON.stringify({
      type: 'signup',
      email,
      password: randomUUID() + randomUUID(),
      redirect_to: 'http://127.0.0.1:4173/auth/callback',
    }),
  })
  if (!generated.ok) throw new Error('Service generateLink is unavailable')
  const body = await generated.json()
  const userId = body?.user?.id
  if (typeof userId !== 'string') throw new Error('Provider generateLink proof lacks user id')
  const cleanup = await fetchImpl(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: headers(serviceRoleKey),
  })
  if (!cleanup.ok) throw new Error('Provider smoke cleanup failed')
  return {
    directPublicSignupDenied: true,
    serviceGenerateLinkAvailable: true,
    cleanupConfirmed: true,
  }
}

async function main() {
  const proof = await runProviderAuthSmoke({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  process.stdout.write(`${JSON.stringify(proof)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
