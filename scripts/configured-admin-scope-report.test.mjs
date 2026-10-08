import assert from 'node:assert/strict'
import test from 'node:test'
import { configuredAdminScopeReport } from './configured-admin-scope-report.mjs'

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
  }
})

test('configured Administrator failures expose only allowlisted assertion metadata', () => {
  const failed = clone(complete)
  failed.stats = { ...stats, expected: 7, unexpected: 1 }
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
  })
  assert.equal(JSON.stringify(report).includes('private-owner@example.invalid'), false)
  assert.equal(JSON.stringify(report).includes('Expected '), false)
})

test('configured Administrator reports exact allowlisted HTTP status categories without assertion text', () => {
  const failed = clone(complete)
  failed.stats = { ...stats, expected: 7, unexpected: 1 }
  failed.suites[0].specs[0].tests[0].results = [
    {
      status: 'failed',
      annotations: [{ type: 'safe-http-status', description: 'http_403' }],
      errors: [
        {
          message: 'Error: expect(received).toBe(expected)\nprivate-owner@example.invalid',
          stack: 'Error\n at /runner/e2e/configured-admin-scope.spec.ts:457:18',
        },
      ],
    },
  ]
  const report = configuredAdminScopeReport(failed)
  assert.deepEqual(report.checks[0].failure, {
    category: 'http_403',
    sourceLine: 457,
    assertion: 'toBe',
  })
  assert.equal(JSON.stringify(report).includes('private-owner@example.invalid'), false)
  assert.equal(JSON.stringify(report).includes('Received'), false)
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
