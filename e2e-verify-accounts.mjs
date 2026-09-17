/* global console, process, fetch */
const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY env vars')
  process.exit(1)
}

const PASSWORD = 'Test123!'
const results = []

async function api(path, options) {
  const res = await fetch(`${SUPABASE_URL}${path}`, options)
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

function authHeaders(extra = {}) {
  return { apikey: ANON_KEY, 'Content-Type': 'application/json', ...extra }
}

async function verifyOne(email) {
  const r = { email, signedIn: false, privateAccess: false }

  const signin = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const token = signin.body?.access_token
  if (signin.status === 200 && token) {
    r.signedIn = true
  } else {
    r.signinError = `HTTP ${signin.status}: ${signin.body?.error_description ?? signin.body?.error ?? signin.body?.msg ?? 'unknown'}`
    return r
  }

  const trips = await api('/rest/v1/rpc/list_trips', {
    method: 'POST',
    headers: authHeaders({ Authorization: `Bearer ${token}`, 'Content-Profile': 'app_public' }),
    body: '{}',
  })
  if (trips.status === 200 && Array.isArray(trips.body)) {
    r.privateAccess = true
    r.tripCount = trips.body.length
  } else {
    r.privateError = `HTTP ${trips.status}: ${JSON.stringify(trips.body).slice(0, 200)}`
  }

  await api('/auth/v1/logout', {
    method: 'POST',
    headers: authHeaders({ Authorization: `Bearer ${token}` }),
  })

  return r
}

const existing = [
  'amy@antiquetrail.test',
  'ann@antiquetrail.test',
  'nick@antiquetrail.test',
  'buc@antiquetrail.test',
  'andrea@antiquetrail.test',
]

for (const email of existing) {
  const r = await verifyOne(email)
  results.push(r)
  const ok = r.signedIn && r.privateAccess
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${r.email}  sign-in=${r.signedIn}${r.signinError ? ` (${r.signinError})` : ''}  private-access=${r.privateAccess}${r.tripCount !== undefined ? ` trips=${r.tripCount}` : ''}${r.privateError ? ` (${r.privateError})` : ''}`,
  )
}

const failed = results.filter((r) => !r.signedIn || !r.privateAccess).length
console.log(`\n${5 - failed}/5 accounts verified end-to-end`)
process.exit(failed > 0 ? 1 : 0)
