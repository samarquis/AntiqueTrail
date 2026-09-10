import assert from 'node:assert/strict'
import test from 'node:test'
import { representativeHoursReport } from './configured-representative-hours-report.mjs'

const passing = JSON.stringify({
  stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0 },
  errors: [],
  suites: [
    {
      specs: [
        {
          title: 'publish',
          tests: [
            { projectName: 'desktop', results: [{ status: 'passed' }] },
            { projectName: 'phone', results: [{ status: 'passed' }] },
          ],
        },
        {
          title: 'revoke',
          tests: [
            { projectName: 'desktop', results: [{ status: 'passed' }] },
            { projectName: 'phone', results: [{ status: 'passed' }] },
          ],
        },
      ],
    },
  ],
})

test('representative hours report requires every configured browser case', () => {
  assert.equal(representativeHoursReport(passing).status, 'passed')
  assert.equal(representativeHoursReport(passing, 5).status, 'failed')
})

test('representative hours report rejects malformed and failed reports', () => {
  assert.throws(() => representativeHoursReport('{}'), /Malformed browser report/)
  assert.equal(representativeHoursReport(passing.replace('"passed"', '"failed"')).status, 'failed')
})
