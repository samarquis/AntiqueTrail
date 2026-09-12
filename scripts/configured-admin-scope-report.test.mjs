import assert from 'node:assert/strict'
import test from 'node:test'
import { configuredAdminScopeReport } from './configured-admin-scope-report.mjs'

const stats = { expected: 6, unexpected: 0, skipped: 0, flaky: 0 }
const clone = (value) => JSON.parse(JSON.stringify(value))
const complete = {
  stats,
  errors: [],
  suites: [
    {
      specs: Array.from({ length: 6 }, (_, index) => ({
        title: `scenario ${index}`,
        tests: [{ projectName: index < 3 ? 'desktop' : 'phone', results: [{ status: 'passed' }] }],
      })),
    },
  ],
}

test('configured Administrator report passes only six completed cases with no skips or flakes', () => {
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

test('configured Administrator report rejects malformed or incomplete acceptance data', () => {
  assert.throws(() => configuredAdminScopeReport({}), /Malformed browser report/)
  const malformed = clone(complete)
  malformed.stats.skipped = -1
  assert.throws(() => configuredAdminScopeReport(malformed), /Malformed browser counts/)
  const incomplete = clone(complete)
  incomplete.suites[0].specs.pop()
  assert.equal(configuredAdminScopeReport(incomplete).status, 'failed')
})
