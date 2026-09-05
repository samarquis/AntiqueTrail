/* global console, fetch, process */
const required = [
  'OWNER_RESEARCH_ARTIFACT_DIGEST',
  'OWNER_RESEARCH_RECEIPT_AT',
  'OWNER_RESEARCH_DEPLOYMENT_ID',
  'VERCEL_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const missing = required.filter((name) => !process.env[name])
if (missing.length) throw new Error(`Missing required environment: ${missing.join(', ')}`)

const artifactDigest = process.env.OWNER_RESEARCH_ARTIFACT_DIGEST
const receiptAt = process.env.OWNER_RESEARCH_RECEIPT_AT
if (!/^sha256:[0-9a-f]{64}$/.test(artifactDigest)) throw new Error('Invalid artifact digest.')
if (Number.isNaN(Date.parse(receiptAt))) throw new Error('Invalid Package 10A receipt time.')

const purge = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/owner_research_teardown`, {
  method: 'POST',
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Content-Profile': 'app_public',
  },
  body: JSON.stringify({ p_artifact_digest: artifactDigest, p_receipt_at: receiptAt }),
})
if (!purge.ok) throw new Error(`Research-state purge failed (${purge.status}).`)
const receipt = await purge.json()
if (
  receipt.artifactDigest !== artifactDigest ||
  receipt.deploymentId !== process.env.OWNER_RESEARCH_DEPLOYMENT_ID ||
  Date.parse(receipt.receiptAt) !== Date.parse(receiptAt) ||
  receipt.revoked !== true ||
  !/^sha256:[0-9a-f]{64}$/.test(receipt.receiptDigest ?? '')
)
  throw new Error('Research-state purge receipt verification failed.')

// The database receipt is idempotent; Vercel 404 makes a whole-command retry successful.
const deployment = await fetch(
  `https://api.vercel.com/v13/deployments/${encodeURIComponent(process.env.OWNER_RESEARCH_DEPLOYMENT_ID)}`,
  { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } },
)
if (!deployment.ok && deployment.status !== 404)
  throw new Error(`Deployment teardown failed (${deployment.status}).`)

console.log(JSON.stringify({ deploymentDestroyed: true, receipt }))
