import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const SHA256 = /^[a-f0-9]{64}$/
const SOURCE_SHA = /^[a-f0-9]{40}$/
const NONCE = /^[a-f0-9]{64}$/
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const SIGNER_ROLES = ['Product', 'Security']
const MAX_AUTHORIZATION_AGE_MS = 30 * 60 * 1000
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

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function publicKeyFingerprint(publicKeySpkiBase64) {
  if (!BASE64.test(publicKeySpkiBase64 ?? '')) throw new Error('Invalid SPKI base64')
  const der = Buffer.from(publicKeySpkiBase64, 'base64')
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' })
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Signer key must be Ed25519')
  return createHash('sha256').update(der).digest('hex')
}

export function buildAuthorizationPayload(evidence) {
  const authorization = evidence?.authorization ?? {}
  const safety = evidence?.registrationSafety ?? {}
  const unsignedEvidence = JSON.parse(JSON.stringify(evidence ?? null))
  if (unsignedEvidence?.authorization) unsignedEvidence.authorization.signatures = []
  return {
    schemaVersion: 1,
    gate: 'H-01',
    evidenceFactsDigest: digest(unsignedEvidence),
    nonce: authorization.nonce ?? null,
    issuedAt: authorization.issuedAt ?? null,
    expiresAt: authorization.expiresAt ?? null,
    environment: evidence?.stage ?? null,
    deploymentVersion: authorization.deploymentVersion ?? null,
    operation: authorization.operation ?? null,
    mode: authorization.mode ?? null,
    allowedTransition: authorization.allowedTransition ?? null,
    reasonCode: authorization.reasonCode ?? null,
    sourceSha: evidence?.artifact?.sourceSha ?? null,
    artifactDigest: evidence?.artifact?.artifactDigest ?? null,
    lockfileDigest: evidence?.artifact?.lockfileDigest ?? null,
    backupSetId: evidence?.recovery?.backupSetId ?? null,
    backupDigest: evidence?.recovery?.backupDigest ?? null,
    fenceDeploymentId: safety.fenceDeploymentId ?? null,
    fenceVersion: safety.fenceVersion ?? null,
    targetLatchVersion: safety.targetLatchVersion ?? null,
    journalHighWaterMark: safety.journalHighWaterMark ?? null,
    journalRoot: safety.journalRoot ?? null,
    operationSetDigest: safety.operationSetDigest ?? null,
    subjectSetDigest: safety.subjectSetDigest ?? null,
  }
}

function evaluateAuthorization(evidence, blockers, options = {}) {
  const authorization = evidence?.authorization
  const registry = evidence?.signerRegistry
  const payload = buildAuthorizationPayload(evidence)
  const nonceDigest = SHA256.test(payload.nonce ?? '')
    ? createHash('sha256').update(payload.nonce).digest('hex')
    : null
  check(Boolean(authorization), 'authorization.missing', blockers)
  check(Boolean(registry), 'signer_registry.missing', blockers)
  check(authorization?.schemaVersion === 1, 'authorization.schema_version_invalid', blockers)
  check(registry?.schemaVersion === 1, 'signer_registry.schema_version_invalid', blockers)
  check(NONCE.test(payload.nonce ?? ''), 'authorization.nonce_invalid', blockers)
  check(has(payload.deploymentVersion), 'authorization.deployment_version_missing', blockers)
  check(
    payload.operation === 'pages-direct-upload',
    'authorization.operation_not_allowed',
    blockers,
  )
  check(
    ['promotion', 'rollback'].includes(payload.mode),
    'authorization.mode_not_allowed',
    blockers,
  )
  check(
    payload.allowedTransition === 'no-registration-transition',
    'authorization.transition_not_allowed',
    blockers,
  )
  check(
    /^[A-Za-z0-9._:-]{1,64}$/.test(payload.reasonCode ?? ''),
    'authorization.reason_invalid',
    blockers,
  )

  const issuedAt = Date.parse(payload.issuedAt ?? '')
  const expiresAt = Date.parse(payload.expiresAt ?? '')
  const now = options.now instanceof Date ? options.now.valueOf() : Date.now()
  check(Number.isFinite(issuedAt), 'authorization.issued_at_invalid', blockers)
  check(Number.isFinite(expiresAt), 'authorization.expires_at_invalid', blockers)
  if (Number.isFinite(issuedAt) && Number.isFinite(expiresAt)) {
    check(expiresAt > issuedAt, 'authorization.expiry_not_after_issue', blockers)
    check(
      expiresAt - issuedAt <= MAX_AUTHORIZATION_AGE_MS,
      'authorization.window_exceeds_30_minutes',
      blockers,
    )
    check(now >= issuedAt, 'authorization.not_yet_valid', blockers)
    check(now < expiresAt, 'authorization.expired', blockers)
  }
  check(
    !nonceDigest || !(options.usedNonceDigests ?? []).includes(nonceDigest),
    'authorization.nonce_replayed',
    blockers,
  )

  const safety = evidence?.registrationSafety
  check(Boolean(safety), 'registration_safety.missing', blockers)
  if (safety) {
    check(has(safety.fenceDeploymentId), 'registration_safety.fence_deployment_missing', blockers)
    check(has(safety.fenceVersion), 'registration_safety.fence_version_missing', blockers)
    check(has(safety.targetLatchVersion), 'registration_safety.latch_version_missing', blockers)
    check(
      Number.isSafeInteger(safety.journalHighWaterMark) && safety.journalHighWaterMark >= 0,
      'registration_safety.journal_high_water_invalid',
      blockers,
    )
    for (const [name, value] of [
      ['journal_root', safety.journalRoot],
      ['operation_set_digest', safety.operationSetDigest],
      ['subject_set_digest', safety.subjectSetDigest],
    ])
      check(SHA256.test(value ?? ''), `registration_safety.${name}_invalid`, blockers)
  }

  const registered = Array.isArray(registry?.signers) ? registry.signers : []
  const revoked = new Set(
    Array.isArray(registry?.revokedFingerprints) ? registry.revokedFingerprints : [],
  )
  const signatures = Array.isArray(authorization?.signatures) ? authorization.signatures : []
  check(registered.length === 2, 'signer_registry.exactly_two_required', blockers)
  check(signatures.length === 2, 'authorization.exactly_two_signatures_required', blockers)
  check(
    new Set(registered.map((item) => item.humanId)).size === registered.length,
    'signer_registry.human_collision',
    blockers,
  )
  check(
    new Set(registered.map((item) => item.fingerprint)).size === registered.length,
    'signer_registry.key_collision',
    blockers,
  )
  const verification = []
  for (const role of SIGNER_ROLES) {
    const signer = registered.find((item) => item.role === role)
    const signature = signatures.find((item) => item.role === role)
    check(Boolean(signer), `signer_registry.${role.toLowerCase()}_missing`, blockers)
    check(Boolean(signature), `authorization.${role.toLowerCase()}_signature_missing`, blockers)
    let valid = false
    if (signer) {
      let derivedFingerprint = null
      try {
        derivedFingerprint = publicKeyFingerprint(signer.publicKeySpkiBase64)
      } catch {
        blockers.push(`signer_registry.${role.toLowerCase()}_key_invalid`)
      }
      check(
        signer.status === 'active',
        `signer_registry.${role.toLowerCase()}_not_active`,
        blockers,
      )
      check(
        derivedFingerprint === signer.fingerprint,
        `signer_registry.${role.toLowerCase()}_fingerprint_mismatch`,
        blockers,
      )
      check(
        !revoked.has(signer.fingerprint),
        `signer_registry.${role.toLowerCase()}_revoked`,
        blockers,
      )
      check(
        signature?.fingerprint === signer.fingerprint,
        `authorization.${role.toLowerCase()}_wrong_key`,
        blockers,
      )
      if (
        derivedFingerprint &&
        signature?.fingerprint === signer.fingerprint &&
        BASE64.test(signature.signature ?? '')
      ) {
        try {
          valid = verifySignature(
            null,
            Buffer.from(canonicalJson(payload)),
            createPublicKey({
              key: Buffer.from(signer.publicKeySpkiBase64, 'base64'),
              format: 'der',
              type: 'spki',
            }),
            Buffer.from(signature.signature, 'base64'),
          )
        } catch {
          valid = false
        }
      }
      check(valid, `authorization.${role.toLowerCase()}_signature_invalid`, blockers)
    }
    verification.push({
      role,
      humanId: signer?.humanId ?? null,
      fingerprint: signer?.fingerprint ?? null,
      valid,
    })
  }
  return {
    payload,
    payloadDigest: digest(payload),
    nonceDigest,
    signatures,
    signerRegistry: registry ?? null,
    verification,
  }
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
  const pressureUtilization = Math.max(utilization, forecastUtilization)
  const automaticPaidOverage = metric.automaticPaidOverage === true
  let action = 'continue'
  if (pressureUtilization >= 1) action = 'block'
  else if (pressureUtilization >= 0.9) action = 'degrade'
  else if (pressureUtilization >= 0.75) action = 'pause'
  return {
    name: metric.name,
    unit: metric.unit,
    valid: true,
    effectiveLimit,
    utilization,
    forecastUtilization,
    headroomPass: forecastUtilization <= 0.75,
    action,
    automaticPaidOverage,
  }
}

export function deriveQuotaControls(results) {
  const actions = results.map((result) => result.action)
  const blocked =
    actions.includes('block') ||
    results.some((result) => !result.valid || result.automaticPaidOverage === true)
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

export function buildGateReceipt(evidence, options = {}) {
  const blockers = []
  check(evidence?.schemaVersion === 1, 'evidence.schema_version_invalid', blockers)
  check(isCalendarDate(evidence?.evidenceDate), 'evidence.date_invalid', blockers)
  check(Boolean(STAGE_TARGETS[evidence?.stage]), 'environment.stage_invalid', blockers)
  const forbiddenKey = findForbiddenKey(evidence)
  check(!forbiddenKey, `evidence.forbidden_secret_field:${forbiddenKey ?? ''}`, blockers)
  const authorization = evaluateAuthorization(evidence, blockers, options)

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
    authorization,
    evidence: evidence ?? null,
    evidenceDigest: digest(evidence ?? null),
    status: uniqueBlockers.length === 0 ? 'PASSED' : 'BLOCKED',
    blockers: uniqueBlockers,
  }
  return { ...body, receiptDigest: digest(body) }
}

export function verifyGateReceipt(receipt, expected, trustedRegistry, usedNonceDigests = []) {
  const blockers = []
  const { receiptDigest, ...body } = receipt ?? {}
  check(receipt?.status === 'PASSED', 'receipt.not_passed', blockers)
  check(
    SHA256.test(receiptDigest ?? '') && digest(body) === receiptDigest,
    'receipt.digest_invalid',
    blockers,
  )
  check(receipt?.blockers?.length === 0, 'receipt.has_blockers', blockers)
  check(
    digest(receipt?.evidence ?? null) === receipt?.evidenceDigest,
    'receipt.evidence_digest_invalid',
    blockers,
  )
  check(receipt?.stage === expected.stage, 'receipt.environment_mismatch', blockers)
  check(
    receipt?.authorization?.payload?.sourceSha === expected.sourceSha,
    'receipt.source_sha_mismatch',
    blockers,
  )
  check(
    receipt?.authorization?.payload?.artifactDigest === expected.artifactDigest,
    'receipt.artifact_digest_mismatch',
    blockers,
  )
  check(
    receipt?.authorization?.payload?.operation === expected.operation,
    'receipt.operation_mismatch',
    blockers,
  )
  check(receipt?.authorization?.payload?.mode === expected.mode, 'receipt.mode_mismatch', blockers)
  check(
    receipt?.authorization?.payload?.allowedTransition === expected.allowedTransition,
    'receipt.transition_mismatch',
    blockers,
  )
  check(
    receipt?.authorization?.payload?.deploymentVersion === expected.deploymentVersion,
    'receipt.deployment_version_mismatch',
    blockers,
  )
  check(
    receipt?.authorization?.payload?.reasonCode === expected.reasonCode,
    'receipt.reason_mismatch',
    blockers,
  )
  check(
    receipt?.quotaControls?.promotionAllowed === true,
    'receipt.quota_promotion_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.nonessentialGrowthAllowed === true,
    'receipt.quota_growth_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.optionalMapsAllowed === true,
    'receipt.quota_optional_maps_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.routeSuggestionsAllowed === true,
    'receipt.quota_routes_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.mediaUploadsAllowed === true,
    'receipt.quota_media_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.nonessentialEmailAllowed === true,
    'receipt.quota_email_blocked',
    blockers,
  )
  check(
    receipt?.quotaControls?.coreBrowseAndAccountSafetyAllowed === true,
    'receipt.quota_core_blocked',
    blockers,
  )

  const payload = receipt?.authorization?.payload
  const now = expected.now instanceof Date ? expected.now.valueOf() : Date.now()
  if (receipt?.evidence) {
    const rebuilt = buildGateReceipt(receipt.evidence, { now: new Date(now) })
    check(rebuilt.receiptDigest === receiptDigest, 'receipt.reconstruction_mismatch', blockers)
  } else {
    blockers.push('receipt.evidence_missing')
  }
  const issuedAt = Date.parse(payload?.issuedAt ?? '')
  const expiresAt = Date.parse(payload?.expiresAt ?? '')
  check(
    Number.isFinite(issuedAt) && now >= issuedAt,
    'receipt.authorization_not_yet_valid',
    blockers,
  )
  check(Number.isFinite(expiresAt) && now < expiresAt, 'receipt.authorization_expired', blockers)
  check(
    Number.isFinite(issuedAt) &&
      Number.isFinite(expiresAt) &&
      expiresAt - issuedAt <= MAX_AUTHORIZATION_AGE_MS,
    'receipt.authorization_window_invalid',
    blockers,
  )
  check(
    receipt?.authorization?.payloadDigest === digest(payload ?? null),
    'receipt.authorization_payload_digest_invalid',
    blockers,
  )
  const nonceDigest = NONCE.test(payload?.nonce ?? '')
    ? createHash('sha256').update(payload.nonce).digest('hex')
    : null
  check(
    nonceDigest === receipt?.authorization?.nonceDigest,
    'receipt.nonce_digest_invalid',
    blockers,
  )
  check(!nonceDigest || !usedNonceDigests.includes(nonceDigest), 'receipt.nonce_replayed', blockers)

  const trusted = Array.isArray(trustedRegistry?.signers) ? trustedRegistry.signers : []
  const revoked = new Set(trustedRegistry?.revokedFingerprints ?? [])
  check(trustedRegistry?.schemaVersion === 1, 'trusted_registry.schema_version_invalid', blockers)
  check(trusted.length === 2, 'trusted_registry.exactly_two_required', blockers)
  check(
    new Set(trusted.map((item) => item.humanId)).size === trusted.length,
    'trusted_registry.human_collision',
    blockers,
  )
  check(
    new Set(trusted.map((item) => item.fingerprint)).size === trusted.length,
    'trusted_registry.key_collision',
    blockers,
  )
  for (const role of SIGNER_ROLES) {
    const signer = trusted.find((item) => item.role === role)
    const embedded = receipt?.authorization?.signerRegistry?.signers?.find(
      (item) => item.role === role,
    )
    const signature = receipt?.authorization?.signatures?.find((item) => item.role === role)
    check(Boolean(signer), `trusted_registry.${role.toLowerCase()}_missing`, blockers)
    if (!signer) continue
    let fingerprint = null
    try {
      fingerprint = publicKeyFingerprint(signer.publicKeySpkiBase64)
    } catch {
      blockers.push(`trusted_registry.${role.toLowerCase()}_key_invalid`)
    }
    check(
      fingerprint === signer.fingerprint,
      `trusted_registry.${role.toLowerCase()}_fingerprint_mismatch`,
      blockers,
    )
    check(signer.status === 'active', `trusted_registry.${role.toLowerCase()}_not_active`, blockers)
    check(
      !revoked.has(signer.fingerprint),
      `trusted_registry.${role.toLowerCase()}_revoked`,
      blockers,
    )
    check(
      embedded?.humanId === signer.humanId,
      `receipt.${role.toLowerCase()}_human_mismatch`,
      blockers,
    )
    check(
      embedded?.fingerprint === signer.fingerprint,
      `receipt.${role.toLowerCase()}_key_mismatch`,
      blockers,
    )
    let valid = false
    if (
      fingerprint &&
      signature?.fingerprint === signer.fingerprint &&
      BASE64.test(signature.signature ?? '')
    ) {
      try {
        valid = verifySignature(
          null,
          Buffer.from(canonicalJson(payload)),
          createPublicKey({
            key: Buffer.from(signer.publicKeySpkiBase64, 'base64'),
            format: 'der',
            type: 'spki',
          }),
          Buffer.from(signature.signature, 'base64'),
        )
      } catch {
        valid = false
      }
    }
    check(valid, `receipt.${role.toLowerCase()}_signature_invalid`, blockers)
  }
  return { valid: blockers.length === 0, blockers: [...new Set(blockers)].sort(), nonceDigest }
}

export async function writeGateReceipt(evidence, outDirectory, options = {}) {
  const receipt = buildGateReceipt(evidence, options)
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
  const options = parseOptions(args)
  if (command === 'payload') {
    if (!options.evidence) throw new Error('--evidence is required')
    const evidence = JSON.parse(await readFile(path.resolve(options.evidence), 'utf8'))
    const payload = buildAuthorizationPayload(evidence)
    process.stdout.write(`${canonicalJson(payload)}\n`)
    return
  }
  if (command === 'receipt') {
    if (!options.evidence || !options['out-dir'])
      throw new Error('Both --evidence and --out-dir are required')
    const evidence = JSON.parse(await readFile(path.resolve(options.evidence), 'utf8'))
    const usedNonceDigests = options['used-nonce-ledger']
      ? JSON.parse(await readFile(path.resolve(options['used-nonce-ledger']), 'utf8'))
      : []
    const result = await writeGateReceipt(evidence, options['out-dir'], { usedNonceDigests })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.receipt.status !== 'PASSED') process.exitCode = 2
    return
  }
  if (command === 'verify-receipt') {
    const required = [
      'receipt',
      'trusted-registry',
      'expected-stage',
      'expected-source-sha',
      'expected-artifact-digest',
      'expected-operation',
      'expected-mode',
      'expected-transition',
      'expected-deployment-version',
      'expected-reason',
    ]
    if (required.some((key) => !options[key]))
      throw new Error(`Missing required verification option`)
    const receipt = JSON.parse(await readFile(path.resolve(options.receipt), 'utf8'))
    const trustedRegistry = JSON.parse(
      await readFile(path.resolve(options['trusted-registry']), 'utf8'),
    )
    const usedNonceDigests = options['used-nonce-ledger']
      ? JSON.parse(await readFile(path.resolve(options['used-nonce-ledger']), 'utf8'))
      : []
    const result = verifyGateReceipt(
      receipt,
      {
        stage: options['expected-stage'],
        sourceSha: options['expected-source-sha'],
        artifactDigest: options['expected-artifact-digest'],
        operation: options['expected-operation'],
        mode: options['expected-mode'],
        allowedTransition: options['expected-transition'],
        deploymentVersion: options['expected-deployment-version'],
        reasonCode: options['expected-reason'],
      },
      trustedRegistry,
      usedNonceDigests,
    )
    process.stdout.write(`${JSON.stringify(result)}\n`)
    if (!result.valid) process.exitCode = 2
    return
  }
  throw new Error('Usage: h01-gate.mjs payload|receipt|verify-receipt --name value ...')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
