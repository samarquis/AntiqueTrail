import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA256 = /^[a-f0-9]{64}$/
const SOURCE_SHA = /^[a-f0-9]{40}$/
const STAGE_TARGETS = {
  'shared-alpha': { rpoMinutes: 1440, rtoMinutes: 480 },
  'private-beta': { rpoMinutes: 240, rtoMinutes: 480 },
  'regional-public': { rpoMinutes: 15, rtoMinutes: 240 },
}
const RECOVERY_ASSETS = ['database', 'auth', 'storage']
const STARTUP_SAFE_LIMITS = {
  database_mb: 375,
  storage_mb: 750,
  actions_minutes_month: 1500,
  actions_artifacts_mb: 400,
  cloudflare_builds_month: 375,
}
const FORBIDDEN_KEYS = /^(password|privateKey|secretValue|accessToken|refreshToken|apiToken)$/i

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function has(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null
}

function isCalendarDate(value) {
  if (!DATE.test(value ?? '')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function findForbiddenKey(value, prefix = '') {
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value)) {
    const location = prefix ? `${prefix}.${key}` : key
    if (FORBIDDEN_KEYS.test(key)) return location
    const found = findForbiddenKey(nested, location)
    if (found) return found
  }
  return null
}

function check(condition, code, blockers) {
  if (!condition) blockers.push(code)
}

export function evaluateQuota(metric) {
  if (!metric || !has(metric.name))
    return { valid: false, action: 'block', reason: 'invalid_metric' }
  const numbers = ['allowance', 'safeLimit', 'current', 'forecastNormal', 'forecastAbuse']
  if (numbers.some((key) => !Number.isFinite(metric[key]) || metric[key] < 0)) {
    return { name: metric.name, valid: false, action: 'block', reason: 'invalid_measurement' }
  }
  const contractualLimit = STARTUP_SAFE_LIMITS[metric.name] ?? Number.POSITIVE_INFINITY
  const effectiveLimit = Math.min(metric.allowance, metric.safeLimit, contractualLimit)
  if (effectiveLimit <= 0) {
    return { name: metric.name, valid: false, action: 'block', reason: 'invalid_limit' }
  }
  const utilization = metric.current / effectiveLimit
  const forecastUtilization = Math.max(metric.forecastNormal, metric.forecastAbuse) / effectiveLimit
  let action = 'continue'
  if (utilization >= 1) action = 'block'
  else if (utilization >= 0.9) action = 'degrade'
  else if (utilization >= 0.75) action = 'pause'
  return {
    name: metric.name,
    unit: metric.unit,
    valid: true,
    effectiveLimit,
    utilization,
    forecastUtilization,
    headroomPass: forecastUtilization <= 0.75,
    action,
    automaticPaidOverage: metric.automaticPaidOverage === true,
  }
}

export function deriveQuotaControls(results) {
  const actions = results.map((result) => result.action)
  const blocked = actions.includes('block') || results.some((result) => !result.valid)
  const degraded = blocked || actions.includes('degrade')
  const paused = degraded || actions.includes('pause')
  return {
    promotionAllowed: !paused,
    nonessentialGrowthAllowed: !paused,
    optionalMapsAllowed: !degraded,
    routeSuggestionsAllowed: !degraded,
    mediaUploadsAllowed: !degraded,
    nonessentialEmailAllowed: !degraded,
    coreBrowseAndAccountSafetyAllowed: !blocked,
  }
}

function evaluateRecovery(evidence, stage, blockers) {
  const target = STAGE_TARGETS[stage]
  const recovery = evidence.recovery
  check(Boolean(recovery), 'recovery.missing', blockers)
  if (!recovery) {
    for (const name of RECOVERY_ASSETS) blockers.push(`recovery.${name}.missing`)
    return { target, assets: RECOVERY_ASSETS.map((name) => ({ name, pass: false })) }
  }
  check(
    recovery.restoreTargetUnroutable === true,
    'recovery.restore_target_not_unroutable',
    blockers,
  )
  check(
    recovery.registrationFenceEnabled === true,
    'recovery.registration_fence_not_enabled',
    blockers,
  )
  check(
    recovery.preRestoreSessionsInvalidated === true,
    'recovery.sessions_not_invalidated',
    blockers,
  )
  check(recovery.deletionReceiptsReplayed === true, 'recovery.deletions_not_replayed', blockers)
  check(recovery.revocationReceiptsReplayed === true, 'recovery.revocations_not_replayed', blockers)
  check(has(recovery.backupSetId), 'recovery.backup_set_id_missing', blockers)
  check(SHA256.test(recovery.backupDigest ?? ''), 'recovery.backup_digest_invalid', blockers)
  check(
    recovery.twoLayerEncryptionVerified === true,
    'recovery.two_layer_encryption_unproved',
    blockers,
  )
  check(
    recovery.singleKeyDecryptionDenied === true,
    'recovery.single_key_denial_unproved',
    blockers,
  )

  const assets = RECOVERY_ASSETS.map((name) => {
    const asset = recovery.assets?.[name]
    check(Boolean(asset), `recovery.${name}.missing`, blockers)
    if (!asset) return { name, pass: false }
    const pass =
      Number.isFinite(asset.observedRpoMinutes) &&
      asset.observedRpoMinutes <= target.rpoMinutes &&
      Number.isFinite(asset.observedRtoMinutes) &&
      asset.observedRtoMinutes <= target.rtoMinutes &&
      asset.integrityVerified === true &&
      has(asset.evidenceRef)
    check(pass, `recovery.${name}.objective_or_integrity_failed`, blockers)
    return {
      name,
      observedRpoMinutes: asset.observedRpoMinutes,
      observedRtoMinutes: asset.observedRtoMinutes,
      integrityVerified: asset.integrityVerified === true,
      evidenceRef: asset.evidenceRef ?? null,
      pass,
    }
  })
  return { target, assets }
}

export function buildGateReceipt(evidence) {
  const blockers = []
  check(evidence?.schemaVersion === 1, 'evidence.schema_version_invalid', blockers)
  check(isCalendarDate(evidence?.evidenceDate), 'evidence.date_invalid', blockers)
  check(Boolean(STAGE_TARGETS[evidence?.stage]), 'environment.stage_invalid', blockers)
  const forbiddenKey = findForbiddenKey(evidence)
  check(!forbiddenKey, `evidence.forbidden_secret_field:${forbiddenKey ?? ''}`, blockers)

  const environment = evidence?.environment
  check(Boolean(environment), 'environment.missing', blockers)
  if (environment) {
    check(has(environment.name), 'environment.name_missing', blockers)
    check(environment.name === evidence.stage, 'environment.name_stage_mismatch', blockers)
    check(has(environment.supabaseProjectRef), 'environment.supabase_project_missing', blockers)
    check(has(environment.restoreProjectRef), 'environment.restore_project_missing', blockers)
    check(
      environment.supabaseProjectRef !== environment.restoreProjectRef,
      'environment.restore_project_not_separate',
      blockers,
    )
    check(
      Array.isArray(environment.hostnames) && environment.hostnames.length > 0,
      'environment.hostnames_missing',
      blockers,
    )
    check(environment.directUpload === true, 'environment.direct_upload_unproved', blockers)
    check(
      environment.denyByDefaultAccess === true,
      'environment.access_boundary_unproved',
      blockers,
    )
    check(environment.usRegion === true, 'environment.us_region_unproved', blockers)
  }

  const capabilities = evidence?.capabilities
  check(Boolean(capabilities), 'capabilities.missing', blockers)
  if (capabilities) {
    check(
      capabilities.registrationMode === 'closed',
      'capabilities.registration_not_closed',
      blockers,
    )
    check(
      capabilities.registrationLatch === 'draining',
      'capabilities.registration_latch_not_draining',
      blockers,
    )
    check(
      capabilities.optionalMapsEnabled === false,
      'capabilities.optional_maps_not_disabled',
      blockers,
    )
    check(capabilities.mediaUploadsEnabled === false, 'capabilities.media_not_disabled', blockers)
    check(
      capabilities.nonessentialEmailEnabled === false,
      'capabilities.nonessential_email_not_disabled',
      blockers,
    )
    check(
      capabilities.providerKillSwitchesVerified === true,
      'capabilities.kill_switches_unproved',
      blockers,
    )
  }

  const secrets = evidence?.secrets
  check(Boolean(secrets), 'secrets.missing', blockers)
  if (secrets) {
    check(secrets.environmentScoped === true, 'secrets.not_environment_scoped', blockers)
    check(secrets.leastPrivilegeVerified === true, 'secrets.least_privilege_unproved', blockers)
    check(secrets.noPrivateKeysInCi === true, 'secrets.private_key_exclusion_unproved', blockers)
    check(has(secrets.rotationEvidenceRef), 'secrets.rotation_evidence_missing', blockers)
  }

  const cost = evidence?.cost
  check(Boolean(cost), 'cost.missing', blockers)
  if (cost) {
    check(cost.recurringMonthlyUsd === 0, 'cost.startup_not_zero', blockers)
    check(cost.hardCeilingUsd === 0, 'cost.hard_ceiling_not_zero', blockers)
    check(cost.automaticChargesEnabled === false, 'cost.automatic_charges_enabled', blockers)
    check(has(cost.evidenceRef), 'cost.evidence_missing', blockers)
  }

  const artifact = evidence?.artifact
  check(Boolean(artifact), 'artifact.missing', blockers)
  if (artifact) {
    check(SOURCE_SHA.test(artifact.sourceSha ?? ''), 'artifact.source_sha_invalid', blockers)
    check(SHA256.test(artifact.artifactDigest ?? ''), 'artifact.digest_invalid', blockers)
    check(SHA256.test(artifact.lockfileDigest ?? ''), 'artifact.lockfile_digest_invalid', blockers)
    check(has(artifact.deploymentId), 'artifact.deployment_id_missing', blockers)
    check(
      artifact.loggedOutAccessDenied === true,
      'artifact.logged_out_access_denial_unproved',
      blockers,
    )
  }

  const rollback = evidence?.rollback
  check(Boolean(rollback), 'rollback.missing', blockers)
  if (rollback) {
    check(
      SHA256.test(rollback.priorArtifactDigest ?? ''),
      'rollback.prior_digest_invalid',
      blockers,
    )
    check(
      rollback.priorArtifactDigest === rollback.observedArtifactDigest,
      'rollback.digest_mismatch',
      blockers,
    )
    check(has(rollback.deploymentId), 'rollback.deployment_id_missing', blockers)
    check(rollback.rebuilt === false, 'rollback_rebuilt_instead_of_reused', blockers)
    check(rollback.loggedOutAccessDenied === true, 'rollback.access_denial_unproved', blockers)
    check(has(rollback.evidenceRef), 'rollback.evidence_missing', blockers)
  }

  const quotaResults = Array.isArray(evidence?.quotas) ? evidence.quotas.map(evaluateQuota) : []
  check(quotaResults.length > 0, 'quotas.missing', blockers)
  for (const requiredName of Object.keys(STARTUP_SAFE_LIMITS)) {
    check(
      quotaResults.some((result) => result.name === requiredName),
      `quota.${requiredName}.missing`,
      blockers,
    )
  }
  for (const result of quotaResults) {
    check(result.valid, `quota.${result.name ?? 'unknown'}.invalid`, blockers)
    if (result.valid) {
      check(result.headroomPass, `quota.${result.name}.headroom_below_25_percent`, blockers)
      check(
        result.automaticPaidOverage === false,
        `quota.${result.name}.paid_overage_enabled`,
        blockers,
      )
      check(result.action === 'continue', `quota.${result.name}.action_${result.action}`, blockers)
    }
  }

  const recovery = STAGE_TARGETS[evidence?.stage]
    ? evaluateRecovery(evidence, evidence.stage, blockers)
    : { target: null, assets: [] }
  const uniqueBlockers = [...new Set(blockers)].sort()
  const body = {
    schemaVersion: 1,
    gate: 'H-01',
    evidenceDate: evidence?.evidenceDate ?? null,
    stage: evidence?.stage ?? null,
    environment: environment ?? null,
    quotaResults,
    quotaControls: deriveQuotaControls(quotaResults),
    recovery,
    evidenceDigest: digest(evidence ?? null),
    status: uniqueBlockers.length === 0 ? 'PASSED' : 'BLOCKED',
    blockers: uniqueBlockers,
  }
  return { ...body, receiptDigest: digest(body) }
}

export async function writeGateReceipt(evidence, outDirectory) {
  const receipt = buildGateReceipt(evidence)
  const date = isCalendarDate(receipt.evidenceDate) ? receipt.evidenceDate : 'undated'
  const stage = STAGE_TARGETS[receipt.stage] ? receipt.stage : 'unknown-stage'
  const directory = path.resolve(outDirectory, date)
  const filename = `h01-${stage}-${receipt.receiptDigest}.json`
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, filename), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
  })
  return { receipt, path: path.join(directory, filename) }
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
  if (command !== 'receipt')
    throw new Error('Usage: h01-gate.mjs receipt --evidence file --out-dir directory')
  const options = parseOptions(args)
  if (!options.evidence || !options['out-dir'])
    throw new Error('Both --evidence and --out-dir are required')
  const evidence = JSON.parse(await readFile(path.resolve(options.evidence), 'utf8'))
  const result = await writeGateReceipt(evidence, options['out-dir'])
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.receipt.status !== 'PASSED') process.exitCode = 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
