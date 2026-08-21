import { Buffer } from 'node:buffer'
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

import {
  canonicalJson,
  deriveQuotaControls,
  evaluateQuota,
  publicKeyFingerprint,
} from './h01-gate.mjs'

const REQUIRED_METRICS = [
  'actions_artifacts_mb',
  'actions_minutes_month',
  'vercel_deployments_month',
  'database_mb',
  'storage_mb',
]
const MAX_OBSERVATION_AGE_MS = 15 * 60 * 1000
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const ACTION_ORDER = [
  'pause_new_rollouts',
  'pause_recruitment',
  'disable_optional_maps',
  'disable_route_suggestions',
  'disable_media_uploads',
  'disable_nonessential_email',
  'block_unsafe_work',
]

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export function buildObservationPayload(observation) {
  return {
    schemaVersion: observation?.schemaVersion ?? null,
    gate: observation?.gate ?? null,
    environment: observation?.environment ?? null,
    observationId: observation?.observationId ?? null,
    observedAt: observation?.observedAt ?? null,
    expiresAt: observation?.expiresAt ?? null,
    quotas: observation?.quotas ?? null,
  }
}

function verifyObservation(observation, registry, now) {
  const blockers = []
  const payload = buildObservationPayload(observation)
  if (payload.schemaVersion !== 1) blockers.push('observation.schema_invalid')
  if (payload.gate !== 'H-01-QUOTA') blockers.push('observation.gate_invalid')
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(payload.environment ?? ''))
    blockers.push('observation.environment_invalid')
  if (!/^[A-Za-z0-9._:-]{1,96}$/.test(payload.observationId ?? ''))
    blockers.push('observation.id_invalid')

  const observedAt = Date.parse(payload.observedAt ?? '')
  const expiresAt = Date.parse(payload.expiresAt ?? '')
  if (!Number.isFinite(observedAt)) blockers.push('observation.observed_at_invalid')
  if (!Number.isFinite(expiresAt)) blockers.push('observation.expires_at_invalid')
  if (Number.isFinite(observedAt) && Number.isFinite(expiresAt)) {
    if (expiresAt <= observedAt) blockers.push('observation.expiry_invalid')
    if (expiresAt - observedAt > MAX_OBSERVATION_AGE_MS)
      blockers.push('observation.window_exceeds_15_minutes')
    if (now < observedAt) blockers.push('observation.not_yet_valid')
    if (now >= expiresAt) blockers.push('observation.stale')
  }

  const metrics = Array.isArray(payload.quotas) ? payload.quotas : []
  const names = metrics.map((metric) => metric?.name)
  for (const required of REQUIRED_METRICS)
    if (names.filter((name) => name === required).length !== 1)
      blockers.push(`quota.${required}.missing_or_duplicate`)
  if (new Set(names).size !== names.length) blockers.push('quota.duplicate_name')

  const signer = registry?.signers?.find((item) => item.keyId === observation?.signature?.keyId)
  if (registry?.schemaVersion !== 1) blockers.push('registry.schema_invalid')
  if (!signer) blockers.push('signature.untrusted_key')
  let signatureValid = false
  if (signer) {
    let fingerprint = null
    try {
      fingerprint = publicKeyFingerprint(signer.publicKeySpkiBase64)
    } catch {
      blockers.push('signature.public_key_invalid')
    }
    if (signer.status !== 'active') blockers.push('signature.signer_inactive')
    if (fingerprint !== signer.fingerprint) blockers.push('signature.fingerprint_mismatch')
    if (!BASE64.test(observation?.signature?.signature ?? ''))
      blockers.push('signature.encoding_invalid')
    else if (fingerprint === signer.fingerprint && signer.status === 'active') {
      try {
        signatureValid = verifySignature(
          null,
          Buffer.from(canonicalJson(payload)),
          createPublicKey({
            key: Buffer.from(signer.publicKeySpkiBase64, 'base64'),
            format: 'der',
            type: 'spki',
          }),
          Buffer.from(observation.signature.signature, 'base64'),
        )
      } catch {
        signatureValid = false
      }
    }
    if (!signatureValid) blockers.push('signature.invalid')
  }
  return { blockers: [...new Set(blockers)].sort(), metrics, payload, signatureValid }
}

function restrictiveActions(controls) {
  const actions = []
  if (!controls.promotionAllowed) actions.push('pause_new_rollouts')
  if (!controls.nonessentialGrowthAllowed) actions.push('pause_recruitment')
  if (!controls.optionalMapsAllowed) actions.push('disable_optional_maps')
  if (!controls.routeSuggestionsAllowed) actions.push('disable_route_suggestions')
  if (!controls.mediaUploadsAllowed) actions.push('disable_media_uploads')
  if (!controls.nonessentialEmailAllowed) actions.push('disable_nonessential_email')
  if (!controls.coreBrowseAndAccountSafetyAllowed) actions.push('block_unsafe_work')
  return actions.sort((left, right) => ACTION_ORDER.indexOf(left) - ACTION_ORDER.indexOf(right))
}

export function evaluateQuotaObservation(observation, registry, options = {}) {
  const now = options.now instanceof Date ? options.now.valueOf() : Date.now()
  const verification = verifyObservation(observation, registry, now)
  const evaluated = verification.metrics.map(evaluateQuota)
  const invalidMetric = evaluated.some((result) => !result.valid)
  const failClosed = verification.blockers.length > 0 || invalidMetric
  const controls = failClosed
    ? deriveQuotaControls([{ valid: false, action: 'block' }])
    : deriveQuotaControls(evaluated)
  const observationDigest = digest(verification.payload)
  const planBody = {
    schemaVersion: 1,
    gate: 'H-01-QUOTA',
    environment: verification.payload.environment,
    observationDigest,
    status: failClosed ? 'FAIL_CLOSED' : 'CURRENT',
    reasonCodes: failClosed
      ? [...verification.blockers, ...(invalidMetric ? ['quota.invalid_measurement'] : [])].sort()
      : [...new Set(evaluated.map((result) => `quota.action_${result.action}`))].sort(),
    controls,
    actions: restrictiveActions(controls),
  }
  return { ...planBody, planDigest: digest(planBody) }
}

export async function actuateQuotaPlan(plan, configuration = {}, fetchImpl = globalThis.fetch) {
  const endpoint = configuration.endpoint?.trim()
  const token = configuration.token?.trim()
  if (!endpoint || !token) {
    return {
      status: 'BLOCKED_NO_CALL',
      reasonCode: 'actuator.configuration_missing',
      planDigest: plan.planDigest,
    }
  }
  let target
  try {
    target = new URL(endpoint)
  } catch {
    return {
      status: 'BLOCKED_NO_CALL',
      reasonCode: 'actuator.endpoint_invalid',
      planDigest: plan.planDigest,
    }
  }
  if (target.protocol !== 'https:' || token.length < 24) {
    return {
      status: 'BLOCKED_NO_CALL',
      reasonCode: 'actuator.boundary_not_constrained',
      planDigest: plan.planDigest,
    }
  }
  const request = {
    schemaVersion: 1,
    operation: 'apply-h01-quota-restrictions',
    environment: plan.environment,
    observationDigest: plan.observationDigest,
    planDigest: plan.planDigest,
    actions: plan.actions,
  }
  const send = async (body) => {
    const response = await fetchImpl(target, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'idempotency-key': plan.planDigest,
      },
      body: JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(10_000),
    })
    return { response, body: await response.json().catch(() => null) }
  }
  const statusRequest = {
    schemaVersion: 1,
    operation: 'get-h01-quota-restriction-status',
    environment: plan.environment,
    observationDigest: plan.observationDigest,
    planDigest: plan.planDigest,
  }
  const exactApplied = ({ response, body }) =>
    response.ok &&
    body?.schemaVersion === 1 &&
    body?.status === 'APPLIED' &&
    body?.authenticated === true &&
    body?.planDigest === plan.planDigest &&
    body?.observationDigest === plan.observationDigest &&
    /^[A-Za-z0-9._:-]{1,96}$/.test(body?.requestId ?? '') &&
    Array.isArray(body?.actions) &&
    canonicalJson(body.actions) === canonicalJson(plan.actions)
  let result
  try {
    result = await send(request)
    if (!exactApplied(result)) result = await send(statusRequest)
  } catch {
    try {
      result = await send(statusRequest)
    } catch {
      result = null
    }
  }
  const valid = result ? exactApplied(result) : false
  const body = result?.body
  const receiptBody = {
    schemaVersion: 1,
    gate: 'H-01-QUOTA',
    status: valid ? 'APPLIED' : 'UNKNOWN_BLOCKED',
    reasonCode: valid ? 'actuator.applied_exact_plan' : 'actuator.finality_unknown',
    planDigest: plan.planDigest,
    observationDigest: plan.observationDigest,
    requestId: valid ? body.requestId : null,
    actions: valid ? plan.actions : [],
  }
  return { ...receiptBody, receiptDigest: digest(receiptBody) }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith('--') || args[index + 1] === undefined)
      throw new Error('Expected --name value')
    options[args[index].slice(2)] = args[index + 1]
  }
  return options
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)
  if (!['evaluate', 'actuate'].includes(command))
    throw new Error(
      'Usage: h01-quota-monitor.mjs evaluate|actuate --observation file --registry file --out file',
    )
  if (!options.observation || !options.registry || !options.out)
    throw new Error('--observation, --registry, and --out are required')
  const observation = JSON.parse(await readFile(path.resolve(options.observation), 'utf8'))
  const registry = JSON.parse(await readFile(path.resolve(options.registry), 'utf8'))
  const plan = evaluateQuotaObservation(observation, registry)
  const result =
    command === 'actuate'
      ? {
          plan,
          receipt: await actuateQuotaPlan(plan, {
            endpoint: process.env.H01_QUOTA_ACTUATOR_URL,
            token: process.env.H01_QUOTA_ACTUATOR_TOKEN,
          }),
        }
      : { plan }
  await writeFile(path.resolve(options.out), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (command === 'actuate' && result.receipt.status !== 'APPLIED') process.exitCode = 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
