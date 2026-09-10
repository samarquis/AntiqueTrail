import assert from 'node:assert/strict'
import test from 'node:test'
import { browserReport } from './configured-free-shopper-report.mjs'

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
