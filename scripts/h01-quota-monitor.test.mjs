import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

import { canonicalJson, publicKeyFingerprint } from './h01-gate.mjs'
import {
  actuateQuotaPlan,
  buildObservationPayload,
  evaluateQuotaObservation,
} from './h01-quota-monitor.mjs'

const NOW = new Date('2026-08-04T12:05:00.000Z')
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const fingerprint = publicKeyFingerprint(publicKeySpkiBase64)
const registry = {
  schemaVersion: 1,
  signers: [{ keyId: 'quota-observer-1', fingerprint, publicKeySpkiBase64, status: 'active' }],
}

function observation(percent) {
  const value = (limit) => (percent / 100) * limit
  const result = {
    schemaVersion: 1,
    gate: 'H-01-QUOTA',
    environment: 'shared-alpha',
    observationId: `obs-${percent}`,
    observedAt: '2026-08-04T12:00:00.000Z',
    expiresAt: '2026-08-04T12:10:00.000Z',
    quotas: [
      ['database_mb', 375],
      ['storage_mb', 750],
      ['actions_minutes_month', 1500],
      ['actions_artifacts_mb', 400],
      ['vercel_deployments_month', 2250],
    ].map(([name, limit]) => ({
      name,
      unit: name,
      allowance: limit,
      safeLimit: limit,
      current: value(limit),
      forecastNormal: value(limit),
      forecastAbuse: value(limit),
      automaticPaidOverage: false,
    })),
  }
  result.signature = {
    keyId: 'quota-observer-1',
    signature: sign(
      null,
      Buffer.from(canonicalJson(buildObservationPayload(result))),
      privateKey,
    ).toString('base64'),
  }
  return result
}

test('75 percent pauses new rollouts and recruitment without optional degradation', () => {
  const plan = evaluateQuotaObservation(observation(75), registry, { now: NOW })
  assert.equal(plan.status, 'CURRENT')
  assert.deepEqual(plan.actions, ['pause_new_rollouts', 'pause_recruitment'])
  assert.equal(plan.controls.optionalMapsAllowed, true)
})

test('90 percent disables optional systems before core safety', () => {
  const plan = evaluateQuotaObservation(observation(90), registry, { now: NOW })
  assert.deepEqual(plan.actions, [
    'pause_new_rollouts',
    'pause_recruitment',
    'disable_optional_maps',
    'disable_route_suggestions',
    'disable_media_uploads',
    'disable_nonessential_email',
  ])
  assert.equal(plan.controls.coreBrowseAndAccountSafetyAllowed, true)
})

test('100 percent blocks unsafe work', () => {
  const plan = evaluateQuotaObservation(observation(100), registry, { now: NOW })
  assert.equal(plan.actions.at(-1), 'block_unsafe_work')
  assert.equal(plan.controls.coreBrowseAndAccountSafetyAllowed, false)
})

test('automatic paid overage blocks runtime work at any utilization', () => {
  const signed = observation(10)
  signed.quotas[0].automaticPaidOverage = true
  signed.signature.signature = sign(
    null,
    Buffer.from(canonicalJson(buildObservationPayload(signed))),
    privateKey,
  ).toString('base64')
  const plan = evaluateQuotaObservation(signed, registry, { now: NOW })
  assert.equal(plan.actions.at(-1), 'block_unsafe_work')
  assert.equal(plan.controls.coreBrowseAndAccountSafetyAllowed, false)
})

test('forecast pressure actuates the same thresholds before current usage reaches them', () => {
  const signed = observation(10)
  for (const metric of signed.quotas) metric.forecastAbuse = metric.safeLimit * 0.9
  signed.signature.signature = sign(
    null,
    Buffer.from(canonicalJson(buildObservationPayload(signed))),
    privateKey,
  ).toString('base64')
  const plan = evaluateQuotaObservation(signed, registry, { now: NOW })
  assert.ok(plan.actions.includes('disable_optional_maps'))
  assert.equal(plan.controls.coreBrowseAndAccountSafetyAllowed, true)
})

test('missing, stale, tampered, and incomplete observations fail closed deterministically', () => {
  const stale = observation(10)
  const first = evaluateQuotaObservation(stale, registry, {
    now: new Date('2026-08-04T12:11:00.000Z'),
  })
  const second = evaluateQuotaObservation(stale, registry, {
    now: new Date('2026-08-04T12:11:00.000Z'),
  })
  assert.equal(first.status, 'FAIL_CLOSED')
  assert.equal(first.planDigest, second.planDigest)
  assert.equal(first.actions.at(-1), 'block_unsafe_work')

  const tampered = observation(10)
  tampered.quotas[0].current = 1
  assert.equal(evaluateQuotaObservation(tampered, registry, { now: NOW }).status, 'FAIL_CLOSED')

  const incomplete = observation(10)
  incomplete.quotas.pop()
  assert.equal(evaluateQuotaObservation(incomplete, registry, { now: NOW }).status, 'FAIL_CLOSED')
})

test('unconfigured actuator makes no provider call', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    throw new Error('must not call')
  }
  const plan = evaluateQuotaObservation(observation(90), registry, { now: NOW })
  const receipt = await actuateQuotaPlan(plan, {}, fetchImpl)
  assert.equal(receipt.status, 'BLOCKED_NO_CALL')
  assert.equal(calls, 0)
})

test('constrained actuator accepts only a digest-bound exact-action receipt', async () => {
  const plan = evaluateQuotaObservation(observation(90), registry, { now: NOW })
  const applied = await actuateQuotaPlan(
    plan,
    { endpoint: 'https://controls.example.test/h01/quota', token: 'x'.repeat(32) },
    async (_url, options) => {
      const request = JSON.parse(options.body)
      assert.deepEqual(request.actions, plan.actions)
      assert.match(options.headers.authorization, /^Bearer /)
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          status: 'APPLIED',
          authenticated: true,
          requestId: 'request-1',
          planDigest: request.planDigest,
          observationDigest: request.observationDigest,
          actions: request.actions,
        }),
      }
    },
  )
  assert.equal(applied.status, 'APPLIED')
  assert.match(applied.receiptDigest, /^[a-f0-9]{64}$/)

  const rejected = await actuateQuotaPlan(
    plan,
    { endpoint: 'https://controls.example.test/h01/quota', token: 'x'.repeat(32) },
    async () => ({
      ok: true,
      json: async () => ({ status: 'APPLIED', actions: ['enable_maps'] }),
    }),
  )
  assert.equal(rejected.status, 'UNKNOWN_BLOCKED')
})

test('actuator queries idempotent status and persists unknown finality fail closed', async () => {
  const plan = evaluateQuotaObservation(observation(90), registry, { now: NOW })
  const calls = []
  const recovered = await actuateQuotaPlan(
    plan,
    { endpoint: 'https://controls.example.test/h01/quota', token: 'x'.repeat(32) },
    async (_url, options) => {
      const request = JSON.parse(options.body)
      calls.push(request.operation)
      assert.equal(options.headers['idempotency-key'], plan.planDigest)
      if (request.operation === 'apply-h01-quota-restrictions') throw new Error('response lost')
      return {
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          status: 'APPLIED',
          authenticated: true,
          requestId: 'request-recovered',
          planDigest: plan.planDigest,
          observationDigest: plan.observationDigest,
          actions: plan.actions,
        }),
      }
    },
  )
  assert.deepEqual(calls, ['apply-h01-quota-restrictions', 'get-h01-quota-restriction-status'])
  assert.equal(recovered.status, 'APPLIED')

  const unknown = await actuateQuotaPlan(
    plan,
    { endpoint: 'https://controls.example.test/h01/quota', token: 'x'.repeat(32) },
    async () => {
      throw new Error('network unavailable')
    },
  )
  assert.equal(unknown.status, 'UNKNOWN_BLOCKED')
  assert.equal(unknown.reasonCode, 'actuator.finality_unknown')
  assert.match(unknown.receiptDigest, /^[a-f0-9]{64}$/)
})

test('workflow recurs and skips every provider call when unconfigured', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/h01-quota-monitor.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /schedule:/)
  assert.match(workflow, /cron: '17 \*\/6 \* \* \*'/)
  const preflight = workflow.indexOf('Configuration-safe preflight')
  const checkout = workflow.indexOf('Checkout exact revision')
  const actuator = workflow.indexOf('h01-quota-monitor.mjs actuate')
  assert.ok(preflight > 0)
  assert.ok(checkout > preflight)
  assert.ok(actuator > checkout)
  assert.match(workflow, /if: steps\.preflight\.outputs\.configured == 'true'/)
  assert.match(workflow, /No observation was evaluated and no actuator\/provider call was made/)
})
