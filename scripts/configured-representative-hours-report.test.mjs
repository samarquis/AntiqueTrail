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

test('six-case hours report requires both stability cases and rejects nonpassing outcomes', () => {
  const six = JSON.parse(passing)
  six.stats.expected = 6
  six.suites[0].specs.push({
    title: 'stability',
    tests: [
      { projectName: 'desktop', results: [{ status: 'passed' }] },
      { projectName: 'phone', results: [{ status: 'passed' }] },
    ],
  })
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'passed')
  assert.equal(representativeHoursReport(passing, 6).status, 'failed')
  const stability = six.suites[0].specs[2]
  for (const status of ['failed', 'skipped', 'timedOut']) {
    stability.tests[1].results[0].status = status
    assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
  }
  stability.tests[1].results[0].status = 'passed'
  six.stats.flaky = 1
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
  six.stats.flaky = 0
  stability.tests.pop()
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
})
