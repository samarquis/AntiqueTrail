import assert from 'node:assert/strict'
import test from 'node:test'
import { browserReport, recordCleanupFailure } from './configured-free-shopper-report.mjs'

const good = {
  stats: { expected: 18, unexpected: 0, skipped: 0, flaky: 0 },
  suites: [],
  errors: [],
}
test('failure diagnostics expose only source line and fixed classifications', () => {
  const report = browserReport(
    JSON.stringify({
      ...good,
      suites: [
        {
          specs: [
            {
              title: 'session scenario',
              tests: [
                {
                  projectName: 'desktop',
                  results: [
                    {
                      status: 'failed',
                      error: {
                        message:
                          'expect.toHaveText: strict mode violation. Bearer private-token person@private.invalid',
                        stack:
                          'at /workspace/e2e/configured-free-shopper.spec.ts:123:4\nBearer private-token',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  )
  assert.deepEqual(report.checks[0].failure, {
    sourceLine: 123,
    assertion: 'toHaveText',
    timeout: false,
    strictLocator: true,
  })
  assert.doesNotMatch(JSON.stringify(report.checks), /private-token|private.invalid|Bearer/)
})
test('browser reporting rejects malformed, absent, incomplete, skipped, flaky and failed evidence', () => {
  for (const input of ['{', 'null', '{}', JSON.stringify({ ...good, stats: { expected: 16 } })])
    assert.throws(() => browserReport(input))
  for (const stats of [
    { ...good.stats, expected: 0 },
    { ...good.stats, expected: 15 },
    { ...good.stats, unexpected: 1 },
    { ...good.stats, skipped: 1 },
    { ...good.stats, flaky: 1 },
  ])
    assert.equal(browserReport(JSON.stringify({ ...good, stats })).status, 'failed')
  assert.equal(
    browserReport(JSON.stringify({ ...good, errors: ['worker failed'] })).status,
    'failed',
  )
  assert.equal(
    browserReport(JSON.stringify(good)).status,
    'failed',
    'counts without executed tests cannot pass',
  )
  const complete = {
    ...good,
    suites: [
      {
        specs: Array.from({ length: 18 }, (_, i) => ({
          title: `assertion ${i}`,
          tests: [{ projectName: 'desktop', results: [{ status: 'passed' }] }],
        })),
      },
    ],
  }
  assert.equal(browserReport(JSON.stringify(complete)).status, 'passed')
  complete.suites[0].specs[0].tests[0].results[0].status = 'failed'
  assert.equal(browserReport(JSON.stringify(complete)).status, 'failed')
})

test('focused reports require each exact desktop and phone case once', () => {
  const title = 'keyed trip create replays after committed response loss'
  const requiredCases = [
    { name: title, project: 'desktop' },
    { name: title, project: 'phone' },
  ]
  const focused = (
    cases,
    stats = { expected: cases.length, unexpected: 0, skipped: 0, flaky: 0 },
  ) => ({
    stats,
    suites: [
      {
        specs: cases.map(({ name, project, status = 'passed' }) => ({
          title: name,
          tests: [
            {
              projectName: project,
              annotations: [{ description: 'Bearer private-token' }],
              results: [{ status, error: { message: 'private response payload' } }],
            },
          ],
        })),
      },
    ],
    errors: [],
  })
  const exact = focused([
    { name: title, project: 'desktop' },
    { name: title, project: 'phone' },
  ])
  const result = browserReport(JSON.stringify(exact), 2, requiredCases)
  assert.equal(result.status, 'passed')
  assert.deepEqual(
    result.checks.map(({ name, project, status }) => ({ name, project, status })),
    [
      { name: title, project: 'desktop', status: 'passed' },
      { name: title, project: 'phone', status: 'passed' },
    ],
  )
  assert.doesNotMatch(JSON.stringify(result), /private-token|private response payload|annotations/)

  const rejects = [
    focused([
      { name: 'different title', project: 'desktop' },
      { name: title, project: 'phone' },
    ]),
    focused([
      { name: title, project: 'desktop' },
      { name: title, project: 'desktop' },
    ]),
    focused([{ name: title, project: 'desktop' }]),
    focused([
      { name: title, project: 'desktop' },
      { name: title, project: 'phone' },
      { name: 'extra case', project: 'desktop' },
    ]),
    focused([
      { name: title, project: 'desktop' },
      { name: title, project: 'phone', status: 'skipped' },
    ]),
    focused(
      [
        { name: title, project: 'desktop' },
        { name: title, project: 'phone' },
      ],
      { expected: 2, unexpected: 0, skipped: 0, flaky: 1 },
    ),
    { ...exact, errors: [{ message: 'private worker detail' }] },
  ]
  for (const report of rejects)
    assert.equal(browserReport(JSON.stringify(report), 2, requiredCases).status, 'failed')
  assert.throws(() =>
    browserReport(
      JSON.stringify(
        focused(
          [
            { name: title, project: 'desktop' },
            { name: title, project: 'phone' },
          ],
          { expected: 2, unexpected: -1, skipped: 0, flaky: 0 },
        ),
      ),
      2,
      requiredCases,
    ),
  )
  assert.throws(() => browserReport(JSON.stringify(exact), 2, [{ name: title }]))
})

test('cleanup failure stays separate from the first proof failure', () => {
  const report = {
    status: 'failed',
    failedAt: 'browser-tests',
    cleanup: 'not-started',
    cleanupFailures: [],
  }
  recordCleanupFailure(report, 'service-cleanup')
  assert.deepEqual(report, {
    status: 'failed',
    failedAt: 'browser-tests',
    cleanup: 'failed',
    cleanupFailures: ['service-cleanup'],
  })

  const cleanupOnly = {
    status: 'passed',
    failedAt: undefined,
    cleanup: 'not-started',
    cleanupFailures: [],
  }
  recordCleanupFailure(cleanupOnly, 'browser-input-removal')
  assert.equal(cleanupOnly.failedAt, 'cleanup-browser-input')
  assert.equal(cleanupOnly.cleanup, 'failed')
  assert.equal(cleanupOnly.cleanupFailures[0], 'browser-input-removal')
})
