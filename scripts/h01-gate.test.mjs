import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildGateReceipt,
  deriveQuotaControls,
  evaluateQuota,
  writeGateReceipt,
} from './h01-gate.mjs'

const DIGEST_A = 'a'.repeat(64)
const DIGEST_B = 'b'.repeat(64)
const SOURCE_SHA = '1'.repeat(40)

function validEvidence() {
  const asset = {
    observedRpoMinutes: 10,
    observedRtoMinutes: 60,
    integrityVerified: true,
    evidenceRef: 'provider-run:123',
  }
  return {
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
  }
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
  const first = buildGateReceipt(evidence)
  const second = buildGateReceipt(validEvidence())
  assert.equal(first.status, 'PASSED')
  assert.equal(first.receiptDigest, second.receiptDigest)

  const directory = await mkdtemp(path.join(os.tmpdir(), 'h01-receipt-'))
  const written = await writeGateReceipt(evidence, directory)
  assert.match(
    path.basename(written.path),
    new RegExp(`^h01-shared-alpha-${first.receiptDigest}\\.json$`),
  )
  assert.equal(path.basename(path.dirname(written.path)), '2026-08-04')
  assert.deepEqual(JSON.parse(await readFile(written.path, 'utf8')), first)
})

test('missing provider and recovery facts produce a blocked receipt', () => {
  const receipt = buildGateReceipt({
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
  const receipt = buildGateReceipt(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('evidence.date_invalid'))
})

test('blocks omitted quota classes and nonzero startup cost', () => {
  const evidence = validEvidence()
  evidence.quotas = evidence.quotas.filter((metric) => metric.name !== 'actions_artifacts_mb')
  evidence.cost.hardCeilingUsd = 10
  const receipt = buildGateReceipt(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('quota.actions_artifacts_mb.missing'))
  assert.ok(receipt.blockers.includes('cost.hard_ceiling_not_zero'))
})

test('blocks insufficient forecast headroom, paid overage, and active degradation threshold', () => {
  const evidence = validEvidence()
  evidence.quotas[0].forecastAbuse = 300
  evidence.quotas[0].automaticPaidOverage = true
  evidence.quotas[0].current = 340
  const receipt = buildGateReceipt(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('quota.database_mb.headroom_below_25_percent'))
  assert.ok(receipt.blockers.includes('quota.database_mb.paid_overage_enabled'))
  assert.ok(receipt.blockers.includes('quota.database_mb.action_degrade'))
})

test('blocks each incomplete recovery asset and an RPO miss', () => {
  const evidence = validEvidence()
  delete evidence.recovery.assets.auth
  evidence.recovery.assets.storage.observedRpoMinutes = 1441
  const receipt = buildGateReceipt(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('recovery.auth.missing'))
  assert.ok(receipt.blockers.includes('recovery.storage.objective_or_integrity_failed'))
})

test('blocks non-separated restore target, rebuilt rollback, and secret material fields', () => {
  const evidence = validEvidence()
  evidence.environment.restoreProjectRef = evidence.environment.supabaseProjectRef
  evidence.rollback.rebuilt = true
  evidence.secrets.apiToken = 'must-never-be-recorded'
  const receipt = buildGateReceipt(evidence)
  assert.equal(receipt.status, 'BLOCKED')
  assert.ok(receipt.blockers.includes('environment.restore_project_not_separate'))
  assert.ok(receipt.blockers.includes('rollback_rebuilt_instead_of_reused'))
  assert.ok(receipt.blockers.some((item) => item.startsWith('evidence.forbidden_secret_field:')))
})
