import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cleanupInput,
  finalizePrivateStopProof,
  projectPrimaryFailure,
} from './issue-568-private-stop-proof-report.mjs'

const startupMetadata = {
  category: 'command_exit',
  httpStatus: 503,
  safeErrorCode: 'BOOT_ERROR',
  transportCode: 'ECONNRESET',
  commandExitCode: 7,
  privateMessage: 'PRIVATE_MESSAGE',
  env: { token: 'PRIVATE_TOKEN' },
}

function passedReport() {
  return {
    status: 'failed',
    failureStage: 'browser-tests',
    primaryFailureStage: null,
    startupFailure: null,
    cases: [
      'owner-save-reopen',
      'unknown-hours',
      'cancel-no-rpc',
      'committed-response-lost-retry',
      'stale-version',
      'user-b-denied-list-read-edit',
      'owner-remove',
    ].map((id) => ({ id, status: 'passed' })),
    counts: { expected: 7, passed: 7, failed: 0, skipped: 0, flaky: 0 },
    sourceProbeArmed: true,
    externalSourceRequestCount: 0,
    capabilityInitial: 'disabled',
    capabilityEnabledForRun: true,
    capabilityRestored: true,
    inputRemoved: true,
  }
}

function cleanResources(overrides = {}) {
  return {
    testsPassed: true,
    serviceAllocated: true,
    serviceCleanup: 'removed',
    previewAllocated: false,
    previewStopped: true,
    inputPathAssigned: true,
    inputCleanupState: 'removed',
    capabilityTouched: true,
    capabilityRestored: true,
    localDirectoryExists: false,
    ...overrides,
  }
}

test('primary startup failure projection keeps only finite trusted fields', () => {
  const startup = projectPrimaryFailure('local-services', {
    ...startupMetadata,
    step: 'supabase-start',
  })
  assert.deepEqual(startup, {
    primaryFailureStage: 'local-services',
    startupFailure: {
      step: 'supabase-start',
      category: 'command_exit',
      httpStatus: 503,
      safeErrorCode: 'BOOT_ERROR',
      transportCode: 'ECONNRESET',
      commandExitCode: 7,
    },
  })
  assert.doesNotMatch(JSON.stringify(startup), /PRIVATE_|env/)
  assert.deepEqual(
    projectPrimaryFailure('local-services', {
      step: 'not-a-step',
      category: 'not-a-category',
      httpStatus: 700,
      safeErrorCode: 'private',
      transportCode: 'private',
      commandExitCode: 0,
    }),
    {
      primaryFailureStage: 'local-services',
      startupFailure: {
        step: 'unknown',
        category: 'unknown',
        httpStatus: null,
        safeErrorCode: null,
        transportCode: null,
        commandExitCode: null,
      },
    },
  )
  assert.deepEqual(
    projectPrimaryFailure('browser-build', { ...startupMetadata, step: 'source-copy' }),
    {
      primaryFailureStage: 'browser-build',
      startupFailure: null,
    },
  )
})

test('input cleanup distinguishes absent input from removal and fails closed', () => {
  const absent = () => false
  assert.equal(
    cleanupInput({ path: null, created: false, exists: absent, remove() {} }),
    'not_created',
  )
  assert.equal(
    cleanupInput({ path: 'input', created: false, exists: absent, remove() {} }),
    'not_created',
  )
  assert.equal(
    cleanupInput({ path: 'input', created: true, exists: absent, remove() {} }),
    'removed',
  )

  let present = true
  assert.equal(
    cleanupInput({
      path: 'input',
      created: true,
      exists: () => present,
      remove: () => {
        present = false
      },
    }),
    'removed',
  )
  present = true
  assert.equal(
    cleanupInput({
      path: 'partial-input',
      created: false,
      exists: () => present,
      remove: () => {
        present = false
      },
    }),
    'removed',
  )
  assert.equal(
    cleanupInput({ path: 'input', created: false, exists: () => true, remove: () => {} }),
    'failed',
  )
  assert.equal(
    cleanupInput({
      path: 'input',
      created: true,
      exists: () => true,
      remove: () => {
        throw Error()
      },
    }),
    'failed',
  )
  assert.equal(
    cleanupInput({
      path: 'input',
      created: false,
      exists: () => {
        throw Error()
      },
      remove() {},
    }),
    'failed',
  )
  assert.equal(
    cleanupInput({
      path: 'input',
      created: false,
      exists: () => true,
      remove() {
        throw Error()
      },
    }),
    'failed',
  )
})

test('failed input removal stays failed even when later state might be absent', () => {
  let checks = 0
  const state = cleanupInput({
    path: 'input',
    created: true,
    exists: () => {
      checks++
      return checks === 1
    },
    remove: () => {
      throw Error('PRIVATE_UNLINK_MESSAGE')
    },
  })
  assert.equal(state, 'failed')
  assert.equal(checks, 1)
})

test('cleanup failure preserves the primary failure and prevents pass', () => {
  const report = {
    ...passedReport(),
    status: 'unavailable',
    primaryFailureStage: 'local-services',
    startupFailure: {
      ...projectPrimaryFailure('local-services', {
        step: 'edge-readiness',
        category: 'readiness_exhausted',
      }).startupFailure,
    },
  }
  const finalized = finalizePrivateStopProof(
    report,
    cleanResources({ serviceCleanup: 'failed', inputCleanupState: 'failed' }),
  )
  assert.equal(finalized.status, 'failed')
  assert.equal(finalized.failureStage, 'cleanup')
  assert.equal(finalized.primaryFailureStage, 'local-services')
  assert.deepEqual(finalized.startupFailure, report.startupFailure)
  assert.equal(finalized.cleanup, 'failed')

  const cleanupOnly = finalizePrivateStopProof(
    { ...passedReport(), status: 'passed' },
    cleanResources({ serviceCleanup: 'failed' }),
  )
  assert.equal(cleanupOnly.status, 'failed')
  assert.equal(cleanupOnly.failureStage, 'cleanup')
  assert.equal(cleanupOnly.primaryFailureStage, 'cleanup')
})

test('successful cleanup cannot turn startup failure or zero cases into a pass', () => {
  const startupFailure = finalizePrivateStopProof(
    {
      status: 'unavailable',
      failureStage: 'local-services',
      primaryFailureStage: 'local-services',
      startupFailure: { step: 'supabase-start' },
      cases: [],
      counts: { passed: 0 },
    },
    cleanResources({ testsPassed: false }),
  )
  assert.equal(startupFailure.status, 'unavailable')
  assert.equal(startupFailure.cleanup, 'removed')
  assert.equal(startupFailure.cases.length, 0)

  const zeroCases = finalizePrivateStopProof(
    {
      ...passedReport(),
      cases: [],
      counts: { expected: 7, passed: 0, failed: 0, skipped: 0, flaky: 0 },
    },
    cleanResources(),
  )
  assert.notEqual(zeroCases.status, 'passed')
})

test('final pass requires every case, capability, source, request, and cleanup gate', () => {
  const valid = finalizePrivateStopProof({ ...passedReport(), status: 'failed' }, cleanResources())
  assert.equal(valid.status, 'passed')
  assert.equal(valid.failureStage, null)
  assert.equal(valid.cleanup, 'removed')

  const failures = [
    (r) => {
      r.cases[0].status = 'failed'
    },
    (r) => {
      r.cases[0].id = 'unknown-case'
    },
    (r) => {
      r.cases.pop()
    },
    (r) => {
      r.counts.passed = 6
    },
    (r) => {
      r.counts.failed = 1
    },
    (r) => {
      r.counts.skipped = 1
    },
    (r) => {
      r.counts.flaky = 1
    },
    (r) => {
      r.sourceProbeArmed = false
    },
    (r) => {
      r.externalSourceRequestCount = 1
    },
    (r) => {
      r.capabilityInitial = 'unverified'
    },
    (r) => {
      r.capabilityEnabledForRun = false
    },
    (r) => {
      r.capabilityRestored = false
    },
  ]
  for (const change of failures) {
    const report = passedReport()
    change(report)
    assert.notEqual(finalizePrivateStopProof(report, cleanResources()).status, 'passed')
  }
  assert.notEqual(
    finalizePrivateStopProof(passedReport(), cleanResources({ testsPassed: false })).status,
    'passed',
  )
  assert.notEqual(
    finalizePrivateStopProof(
      passedReport(),
      cleanResources({ previewStopped: false, previewAllocated: true }),
    ).status,
    'passed',
  )
  assert.notEqual(
    finalizePrivateStopProof(passedReport(), cleanResources({ serviceCleanup: 'failed' })).status,
    'passed',
  )
  assert.notEqual(
    finalizePrivateStopProof(passedReport(), cleanResources({ capabilityRestored: false })).status,
    'passed',
  )
  assert.notEqual(
    finalizePrivateStopProof(passedReport(), cleanResources({ localDirectoryExists: true })).status,
    'passed',
  )
  const noResources = finalizePrivateStopProof(
    {
      ...passedReport(),
      status: 'unavailable',
      cases: [],
      counts: { expected: 7, passed: 0, failed: 0, skipped: 0, flaky: 0 },
    },
    { testsPassed: false, inputCleanupState: 'not_created' },
  )
  assert.equal(noResources.cleanup, 'not-needed')
  assert.notEqual(noResources.status, 'passed')
})
