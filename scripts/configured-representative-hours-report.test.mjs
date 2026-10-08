import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ownerListingFailure,
  ownerListingPathname,
  ownerListingStepResults,
  representativeHoursReport,
} from './configured-representative-hours-report.mjs'

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

test('Owner failure diagnostics retain only allowlisted operation data', () => {
  const failure = ownerListingFailure({
    name: 'TimeoutError',
    message:
      'expect.toBeVisible: Timeout 12000ms exceeded. Bearer private-token person@private.invalid',
    stack: 'at /workspace/e2e/configured-owner-listing.spec.ts:234:4\nBearer private-token',
  })
  assert.deepEqual(failure, {
    assertion: 'toBeVisible',
    sourceLine: 234,
    timeout: true,
    category: 'timeout',
  })
  assert.equal(
    ownerListingPathname(
      'http://127.0.0.1:4174/owner/stores?claimStore=private-id#token=private-token',
    ),
    '/owner/stores',
  )
  assert.equal(ownerListingPathname('https://example.invalid/private'), 'unknown')
  const steps = ownerListingStepResults(
    JSON.stringify([
      {
        name: 'diagnostic',
        status: 'failed',
        durationMs: 12000,
        operation: 'expect_unapproved_owner_access_alert',
        pathname: '/owner/stores?claimStore=private-id#token=private-token',
        failure: { ...failure, message: 'private-token', email: 'person@private.invalid' },
      },
    ]),
  )
  assert.deepEqual(steps[0], {
    name: 'diagnostic',
    status: 'failed',
    durationMs: 12000,
    operation: 'expect_unapproved_owner_access_alert',
    pathname: '/owner/stores',
    failure: {
      assertion: 'toBeVisible',
      sourceLine: 234,
      timeout: true,
      category: 'timeout',
    },
  })
  assert.doesNotMatch(JSON.stringify(steps), /private-token|private-id|private\.invalid|Bearer/)
})
