import assert from 'node:assert/strict'
import test from 'node:test'
import {
  configuredAdminScopeFailure,
  configuredAdminScopeReport,
  configuredAdminScopeSummary,
} from './configured-admin-scope-report.mjs'

const stats = { expected: 8, unexpected: 0, skipped: 0, flaky: 0 }
const clone = (value) => JSON.parse(JSON.stringify(value))
const complete = {
  stats,
  errors: [],
  suites: [
    {
      specs: Array.from({ length: 8 }, (_, index) => ({
        title: `scenario ${index}`,
        tests: [{ projectName: index < 4 ? 'desktop' : 'phone', results: [{ status: 'passed' }] }],
      })),
    },
  ],
}

test('configured Administrator report passes only eight completed cases with no skips or flakes', () => {
  assert.equal(configuredAdminScopeReport(complete).status, 'passed')
  const skipped = clone(complete)
  skipped.stats = { ...stats, expected: 2, skipped: 3, unexpected: 1 }
  skipped.suites[0].specs[3].tests[0] = { projectName: 'phone', status: 'skipped', results: [] }
  assert.equal(configuredAdminScopeReport(skipped).checks[3].status, 'skipped')
  assert.equal(configuredAdminScopeReport(skipped).status, 'failed')
})

test('configured Administrator report preserves failed and timed-out Playwright statuses', () => {
  for (const status of ['failed', 'timedOut']) {
    const changed = clone(complete)
    changed.suites[0].specs[0].tests[0].results[0].status = status
    assert.equal(configuredAdminScopeReport(changed).checks[0].status, status)
    assert.equal(configuredAdminScopeReport(changed).status, 'failed')
    if (status === 'timedOut')
      assert.equal(configuredAdminScopeReport(changed).checks[0].failure.category, 'timeout')
  }
})

test('configured Administrator failures expose only allowlisted assertion metadata', () => {
  const failed = clone(complete)
  failed.stats = { ...stats, expected: 7, unexpected: 1 }
  failed.suites[0].specs[0].title =
    'exact Owner claim revoke removes Store A access while Store B remains active'
  failed.suites[0].specs[0].tests[0].results = [
    {
      status: 'failed',
      errors: [
        {
          message: 'Expected private-owner@example.invalid; expect(locator).toBeFocused()',
          stack: 'Error\n at /runner/e2e/configured-admin-scope.spec.ts:499:18',
        },
      ],
    },
  ]
  const report = configuredAdminScopeReport(failed)
  assert.deepEqual(report.checks[0].failure, {
    category: 'assertion',
    sourceLine: 499,
    assertion: 'toBeFocused',
    stage: 'browser_checks',
    operation: 'owner_exact_claim_revoke',
    httpStatus: null,
    sqlState: null,
  })
  assert.equal(JSON.stringify(report).includes('private-owner@example.invalid'), false)
  assert.equal(JSON.stringify(report).includes('Expected '), false)
})

test('configured Administrator reports exact allowlisted HTTP status categories without assertion text', () => {
  const failed = clone(complete)
  failed.stats = { ...stats, expected: 7, unexpected: 1 }
  failed.suites[0].specs[0].title =
    'preview cancel then exact revoke and regrant retain sibling scope with audited independent readback'
  failed.suites[0].specs[0].tests[0].results = [
    {
      status: 'failed',
      errors: [
        {
          message: 'Error: expect(received).toBe(expected)\nprivate-owner@example.invalid',
          stack:
            'Error: safe-failure:http_403 status=403\n at /runner/e2e/configured-admin-scope.spec.ts:457:18',
        },
      ],
    },
  ]
  const report = configuredAdminScopeReport(failed)
  assert.deepEqual(report.checks[0].failure, {
    category: 'http_403',
    sourceLine: 457,
    assertion: 'toBe',
    stage: 'browser_checks',
    operation: 'representative_exact_scope_change',
    httpStatus: 403,
    sqlState: null,
  })
  assert.equal(JSON.stringify(report).includes('private-owner@example.invalid'), false)
  assert.equal(JSON.stringify(report).includes('Received'), false)
})

test('configured Administrator report preserves allowlisted SQLSTATE without RPC body text', () => {
  const failed = clone(complete)
  failed.stats = { ...stats, expected: 7, unexpected: 1 }
  failed.suites[0].specs[0].tests[0].results = [
    {
      status: 'failed',
      errors: [
        {
          message: 'private response body safe-failure:sqlstate_40001 status=500',
          stack: 'Error\n at /runner/e2e/configured-admin-scope.spec.ts:543:18',
        },
      ],
    },
  ]

  const report = configuredAdminScopeReport(failed)
  assert.deepEqual(report.checks[0].failure, {
    category: 'sqlstate',
    sourceLine: 543,
    assertion: null,
    stage: 'browser_checks',
    operation: 'unknown',
    httpStatus: 500,
    sqlState: '40001',
  })
  assert.equal(JSON.stringify(report).includes('private response body'), false)
})

test('safe Administrator failure projection retains bounded stage and code metadata only', () => {
  const error = Object.assign(
    new Error('private-owner@example.invalid eyJhbGciOiJIUzI1NiJ9.private-token'),
    { code: '40001', status: 500 },
  )
  error.stack = 'Error\n at /runner/scripts/configured-admin-scope.mjs:220:18'
  const failure = configuredAdminScopeFailure(error, {
    stage: 'installing distinct-store fixture authority',
    operation: 'install_fixture_authority',
  })
  assert.deepEqual(failure, {
    category: 'sqlstate',
    sourceLine: 220,
    assertion: null,
    stage: 'fixture_authority',
    operation: 'install_fixture_authority',
    httpStatus: 500,
    sqlState: '40001',
  })

  const summary = configuredAdminScopeSummary(
    {
      scope: 'administrator-exact-scope',
      sourceSha: 'a'.repeat(40),
      status: 'failed',
      cleanup: 'removed',
      phase: 'installing distinct-store fixture authority',
      errors: ['private-owner@example.invalid eyJhbGciOiJIUzI1NiJ9.private-token'],
      failure,
      checks: [],
    },
    'a'.repeat(40),
  )
  assert.equal(summary.stage, 'fixture_authority')
  assert.deepEqual(summary.failure, failure)
  const output = JSON.stringify(summary)
  assert.equal(output.includes('private-owner@example.invalid'), false)
  assert.equal(output.includes('eyJhbGciOiJIUzI1NiJ9'), false)
  assert.equal(output.includes('private-token'), false)
})

test('safe Administrator failure projection rejects unallowlisted SQLSTATE and HTTP status', () => {
  const error = Object.assign(new Error('body: private'), { code: 'XX999', status: 999 })
  const failure = configuredAdminScopeFailure(error, {
    stage: 'not a known stage',
    operation: 'not a known operation',
  })
  assert.deepEqual(failure, {
    category: 'runner_error',
    sourceLine: null,
    assertion: null,
    stage: 'unknown',
    operation: 'unknown',
    httpStatus: null,
    sqlState: null,
  })
  assert.equal(JSON.stringify(failure).includes('private'), false)
})

test('safe Administrator failure projection preserves readiness category and bounded HTTP status', () => {
  const failure = configuredAdminScopeFailure(new Error('private Auth response body'), {
    stage: 'starting local service',
    readinessFailure: { category: 'responseParseFailure', status: 503 },
  })
  assert.deepEqual(failure, {
    category: 'response_parse_failure',
    sourceLine: null,
    assertion: null,
    stage: 'local_service',
    operation: 'start_local_service',
    httpStatus: 503,
    sqlState: null,
  })
  assert.equal(JSON.stringify(failure).includes('private Auth response body'), false)
})

test('configured Administrator report rejects malformed or incomplete acceptance data', () => {
  assert.throws(() => configuredAdminScopeReport({}), /Malformed browser report/)
  const malformed = clone(complete)
  malformed.stats.skipped = -1
  assert.throws(() => configuredAdminScopeReport(malformed), /Malformed browser counts/)
  const incomplete = clone(complete)
  incomplete.suites[0].specs.pop()
  assert.equal(configuredAdminScopeReport(incomplete).status, 'failed')
})
