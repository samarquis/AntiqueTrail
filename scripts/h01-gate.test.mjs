import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { URL } from 'node:url'
import {
  buildGateReceipt,
  buildAuthorizationPayload,
  canonicalJson,
  deriveQuotaControls,
  evaluateQuota,
  publicKeyFingerprint,
  verifyGateReceipt,
  writeGateReceipt,
} from './h01-gate.mjs'

const DIGEST_A = 'a'.repeat(64)
const DIGEST_B = 'b'.repeat(64)
const SOURCE_SHA = '1'.repeat(40)
const TEST_NOW = new Date('2026-08-04T12:10:00.000Z')
const productKeys = generateKeyPairSync('ed25519')
const securityKeys = generateKeyPairSync('ed25519')

function registeredSigner(role, humanId, publicKey) {
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  return {
    role,
    humanId,
    publicKeySpkiBase64,
    fingerprint: publicKeyFingerprint(publicKeySpkiBase64),
    status: 'active',
  }
}

const PRODUCT = registeredSigner('Product', 'human-product', productKeys.publicKey)
const SECURITY = registeredSigner('Security', 'human-security', securityKeys.publicKey)

function signEvidence(evidence) {
  const payload = Buffer.from(canonicalJson(buildAuthorizationPayload(evidence)))
  evidence.authorization.signatures = [
    {
      role: 'Product',
      fingerprint: PRODUCT.fingerprint,
      signature: sign(null, payload, productKeys.privateKey).toString('base64'),
    },
    {
      role: 'Security',
      fingerprint: SECURITY.fingerprint,
      signature: sign(null, payload, securityKeys.privateKey).toString('base64'),
    },
  ]
  return evidence
}

function build(evidence, options = {}) {
  return buildGateReceipt(evidence, { now: TEST_NOW, ...options })
}

function validEvidence() {
  const asset = {
    observedRpoMinutes: 10,
    observedRtoMinutes: 60,
    integrityVerified: true,
    evidenceRef: 'provider-run:123',
  }
  return signEvidence({
    schemaVersion: 1,
    evidenceDate: '2026-08-04',
    stage: 'shared-alpha',
    environment: {
      name: 'shared-alpha',
      supabaseProjectRef: 'stage-ref',
      restoreProjectRef: 'restore-ref',
      hostnames: ['shared.example.test'],
      directUpload: true,
      denyByDefaultAccess: true,
      usRegion: true,
    },
    capabilities: {
      registrationMode: 'closed',
      registrationLatch: 'draining',
      optionalMapsEnabled: false,
      mediaUploadsEnabled: false,
      nonessentialEmailEnabled: false,
      providerKillSwitchesVerified: true,
    },
    secrets: {
      environmentScoped: true,
      leastPrivilegeVerified: true,
      noPrivateKeysInCi: true,
      rotationEvidenceRef: 'vault-receipt:1',
    },
    cost: {
      recurringMonthlyUsd: 0,
      hardCeilingUsd: 0,
      automaticChargesEnabled: false,
      evidenceRef: 'provider-plan:2026-08-04',
    },
    artifact: {
      sourceSha: SOURCE_SHA,
      artifactDigest: DIGEST_A,
      lockfileDigest: DIGEST_B,
      deploymentId: 'deployment-1',
      loggedOutAccessDenied: true,
    },
    rollback: {
      priorArtifactDigest: DIGEST_B,
      observedArtifactDigest: DIGEST_B,
      deploymentId: 'rollback-1',
      rebuilt: false,
      loggedOutAccessDenied: true,
      evidenceRef: 'provider-run:456',
    },
    quotas: [
      {
        name: 'database_mb',
        unit: 'MB',
        allowance: 500,
        safeLimit: 375,
        current: 100,
        forecastNormal: 200,
        forecastAbuse: 280,
        automaticPaidOverage: false,
      },
      {
        name: 'storage_mb',
        unit: 'MB',
        allowance: 1000,
        safeLimit: 750,
        current: 200,
        forecastNormal: 400,
        forecastAbuse: 550,
        automaticPaidOverage: false,
      },
      {
        name: 'actions_minutes_month',
        unit: 'minutes',
        allowance: 2000,
        safeLimit: 1500,
        current: 100,
        forecastNormal: 200,
        forecastAbuse: 300,
        automaticPaidOverage: false,
      },
      {
        name: 'actions_artifacts_mb',
        unit: 'MB',
        allowance: 500,
        safeLimit: 400,
        current: 100,
        forecastNormal: 200,
        forecastAbuse: 250,
        automaticPaidOverage: false,
      },
      {
        name: 'cloudflare_builds_month',
        unit: 'builds',
        allowance: 500,
        safeLimit: 375,
        current: 10,
        forecastNormal: 20,
        forecastAbuse: 30,
        automaticPaidOverage: false,
      },
    ],
    recovery: {
      restoreTargetUnroutable: true,
      registrationFenceEnabled: true,
      preRestoreSessionsInvalidated: true,
      deletionReceiptsReplayed: true,
      revocationReceiptsReplayed: true,
      backupSetId: 'backup-1',
      backupDigest: DIGEST_A,
      twoLayerEncryptionVerified: true,
      singleKeyDecryptionDenied: true,
      assets: { database: asset, auth: asset, storage: asset },
    },
    registrationSafety: {
      fenceDeploymentId: 'fence-shared-alpha',
      fenceVersion: 'fence-v3',
      targetLatchVersion: 'latch-v9',
      journalHighWaterMark: 42,
      journalRoot: 'c'.repeat(64),
      operationSetDigest: 'd'.repeat(64),
      subjectSetDigest: 'e'.repeat(64),
    },
    signerRegistry: {
      schemaVersion: 1,
      signers: [PRODUCT, SECURITY],
      revokedFingerprints: [],
    },
    authorization: {
      schemaVersion: 1,
      nonce: 'f'.repeat(64),
      issuedAt: '2026-08-04T12:00:00.000Z',
      expiresAt: '2026-08-04T12:30:00.000Z',
      deploymentVersion: 'pages-v1',
      operation: 'pages-direct-upload',
      mode: 'promotion',
      allowedTransition: 'no-registration-transition',
      reasonCode: 'shared-alpha-promotion',
      signatures: [],
    },
  })
}

test('uses the lower limit and exposes 75% pause and 90% degradation', () => {
  const base = {
    name: 'database',
    unit: 'MB',
    allowance: 500,
    safeLimit: 400,
    forecastNormal: 200,
    forecastAbuse: 250,
    automaticPaidOverage: false,
  }
  assert.equal(evaluateQuota({ ...base, current: 299 }).action, 'continue')
  assert.equal(evaluateQuota({ ...base, current: 300 }).action, 'pause')
  assert.equal(evaluateQuota({ ...base, current: 360 }).action, 'degrade')
  assert.equal(evaluateQuota({ ...base, current: 400 }).action, 'block')
  assert.deepEqual(
    deriveQuotaControls([
      evaluateQuota({ ...base, current: 360 }),
      evaluateQuota({ ...base, current: 10 }),
    ]),
    {
      promotionAllowed: false,
      nonessentialGrowthAllowed: false,
      optionalMapsAllowed: false,
      routeSuggestionsAllowed: false,
      mediaUploadsAllowed: false,
      nonessentialEmailAllowed: false,
      coreBrowseAndAccountSafetyAllowed: true,
    },
  )
})

test('passes a complete shared-alpha receipt and binds it deterministically', async () => {
  const evidence = validEvidence()
  const first = build(evidence)
  const second = build(validEvidence())
  assert.equal(first.status, 'PASSED')
  assert.equal(first.receiptDigest, second.receiptDigest)

  const directory = await mkdtemp(path.join(os.tmpdir(), 'h01-receipt-'))
  const written = await writeGateReceipt(evidence, directory, { now: TEST_NOW })
  assert.match(
    path.basename(written.path),
    new RegExp(`^h01-shared-alpha-${first.receiptDigest}\\.json$`),
  )
  assert.equal(path.basename(path.dirname(written.path)), '2026-08-04')
  assert.deepEqual(JSON.parse(await readFile(written.path, 'utf8')), first)
})

test('missing provider and recovery facts produce a blocked receipt', () => {
  const receipt = build({
    schemaVersion: 1,
    evidenceDate: '2026-08-04',
    stage: 'shared-alpha',
  })
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('artifact.missing'))
  assert.ok(receipt.blockers.includes('recovery.database.missing'))
  assert.ok(receipt.blockers.includes('rollback.missing'))
  assert.ok(receipt.blockers.includes('quotas.missing'))
  assert.ok(receipt.blockers.includes('cost.missing'))
})

test('rejects a syntactically shaped but impossible evidence date', () => {
  const evidence = validEvidence()
  evidence.evidenceDate = '2026-02-31'
  const receipt = build(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('evidence.date_invalid'))
})

test('blocks omitted quota classes and nonzero startup cost', () => {
  const evidence = validEvidence()
  evidence.quotas = evidence.quotas.filter((metric) => metric.name !== 'actions_artifacts_mb')
  evidence.cost.hardCeilingUsd = 10
  const receipt = build(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('quota.actions_artifacts_mb.missing'))
  assert.ok(receipt.blockers.includes('cost.hard_ceiling_not_zero'))
})

test('blocks insufficient forecast headroom, paid overage, and active degradation threshold', () => {
  const evidence = validEvidence()
  evidence.quotas[0].forecastAbuse = 300
  evidence.quotas[0].automaticPaidOverage = true
  evidence.quotas[0].current = 340
  const receipt = build(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('quota.database_mb.headroom_below_25_percent'))
  assert.ok(receipt.blockers.includes('quota.database_mb.paid_overage_enabled'))
  assert.ok(receipt.blockers.includes('quota.database_mb.action_degrade'))
})

test('blocks each incomplete recovery asset and an RPO miss', () => {
  const evidence = validEvidence()
  delete evidence.recovery.assets.auth
  evidence.recovery.assets.storage.observedRpoMinutes = 1441
  const receipt = build(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('recovery.auth.missing'))
  assert.ok(receipt.blockers.includes('recovery.storage.objective_or_integrity_failed'))
})

test('blocks non-separated restore target, rebuilt rollback, and secret material fields', () => {
  const evidence = validEvidence()
  evidence.environment.restoreProjectRef = evidence.environment.supabaseProjectRef
  evidence.rollback.rebuilt = true
  evidence.secrets.apiToken = 'must-never-be-recorded'
  const receipt = build(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('environment.restore_project_not_separate'))
  assert.ok(receipt.blockers.includes('rollback_rebuilt_instead_of_reused'))
  assert.ok(receipt.blockers.some((item) => item.startsWith('evidence.forbidden_secret_field:')))
})

test('requires both distinct registered human Ed25519 signatures over the same payload', () => {
  const missing = validEvidence()
  missing.authorization.signatures = missing.authorization.signatures.slice(0, 1)
  assert.ok(build(missing).blockers.includes('authorization.security_signature_missing'))

  const collision = validEvidence()
  collision.signerRegistry.signers[1] = { ...collision.signerRegistry.signers[0], role: 'Security' }
  assert.ok(build(collision).blockers.includes('signer_registry.human_collision'))
  assert.ok(build(collision).blockers.includes('signer_registry.key_collision'))

  const revoked = validEvidence()
  revoked.signerRegistry.revokedFingerprints = [SECURITY.fingerprint]
  assert.ok(build(revoked).blockers.includes('signer_registry.security_revoked'))
})

test('rejects wrong keys, changed digests, expiry, and replay', () => {
  const wrongKey = validEvidence()
  wrongKey.authorization.signatures[0].fingerprint = SECURITY.fingerprint
  assert.ok(build(wrongKey).blockers.includes('authorization.product_wrong_key'))

  const changed = validEvidence()
  changed.registrationSafety.operationSetDigest = '0'.repeat(64)
  assert.ok(build(changed).blockers.includes('authorization.product_signature_invalid'))
  assert.ok(build(changed).blockers.includes('authorization.security_signature_invalid'))

  assert.ok(
    build(validEvidence(), { now: new Date('2026-08-04T12:30:00.000Z') }).blockers.includes(
      'authorization.expired',
    ),
  )
  const evidence = validEvidence()
  const nonceDigest = build(evidence).authorization.nonceDigest
  assert.ok(
    build(evidence, { usedNonceDigests: [nonceDigest] }).blockers.includes(
      'authorization.nonce_replayed',
    ),
  )
})

test('deployment verifier binds the PASS receipt, trusted keys, and quota controls', () => {
  const evidence = validEvidence()
  const receipt = build(evidence)
  const expected = {
    stage: 'shared-alpha',
    sourceSha: SOURCE_SHA,
    artifactDigest: DIGEST_A,
    operation: 'pages-direct-upload',
    mode: 'promotion',
    allowedTransition: 'no-registration-transition',
    deploymentVersion: 'pages-v1',
    reasonCode: 'shared-alpha-promotion',
    now: TEST_NOW,
  }
  assert.equal(verifyGateReceipt(receipt, expected, evidence.signerRegistry).valid, true)
  assert.ok(
    verifyGateReceipt(
      receipt,
      { ...expected, artifactDigest: DIGEST_B },
      evidence.signerRegistry,
    ).blockers.includes('receipt.artifact_digest_mismatch'),
  )
  assert.ok(
    verifyGateReceipt(receipt, expected, evidence.signerRegistry, [
      receipt.authorization.nonceDigest,
    ]).blockers.includes('receipt.nonce_replayed'),
  )
  const paused = JSON.parse(JSON.stringify(receipt))
  paused.quotaControls.promotionAllowed = false
  const { receiptDigest: ignored, ...pausedBody } = paused
  assert.ok(ignored)
  paused.receiptDigest = createHash('sha256').update(canonicalJson(pausedBody)).digest('hex')
  assert.ok(
    verifyGateReceipt(paused, expected, evidence.signerRegistry).blockers.includes(
      'receipt.quota_promotion_blocked',
    ),
  )
})

test('Pages workflow verifies and consumes H-01 authorization before provider calls', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/pages-deploy-existing-artifact.yml', import.meta.url),
    'utf8',
  )
  const verification = workflow.indexOf('Verify signed H-01 PASS receipt before any provider call')
  const consumption = workflow.indexOf('Consume signed H-01 nonce before provider access')
  const wrangler = workflow.indexOf('wrangler@$WRANGLER_VERSION')
  const cloudflareApi = workflow.indexOf('https://api.cloudflare.com')
  assert.ok(verification > 0)
  assert.ok(consumption > verification)
  assert.ok(wrangler > consumption)
  assert.ok(cloudflareApi > wrangler)
  assert.match(workflow, /--expected-operation pages-direct-upload/)
  assert.match(workflow, /--expected-transition no-registration-transition/)
  assert.match(workflow, /H01_REVOKED_SIGNER_FINGERPRINTS_JSON/)
  assert.doesNotMatch(workflow, /H01_.*PRIVATE_KEY/)
})
