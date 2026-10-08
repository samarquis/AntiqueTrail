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

test('Details route diagnostics retain only approved local route shapes', () => {
  const report = browserReport(
    JSON.stringify({
      ...good,
      suites: [
        {
          specs: [
            {
              title: 'Details sign-in return',
              tests: [
                {
                  projectName: 'desktop',
                  annotations: [
                    {
                      type: 'issue-565-actual-route',
                      description: '/auth/sign-in?returnTo=/trips/new?addStoreId=<store-id>',
                    },
                  ],
                  results: [
                    {
                      status: 'failed',
                      error: {
                        message: 'expect.toHaveURL',
                        stack: 'at /workspace/e2e/configured-free-shopper.spec.ts:179:4',
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
  assert.equal(
    report.checks[0].failure.actualRoute,
    '/auth/sign-in?returnTo=/trips/new?addStoreId=<store-id>',
  )

  const unsafe = browserReport(
    JSON.stringify({
      ...good,
      suites: [
        {
          specs: [
            {
              title: 'Details sign-in return',
              tests: [
                {
                  projectName: 'desktop',
                  annotations: [
                    {
                      type: 'issue-565-actual-route',
                      description: '/auth/sign-in?token=private-token&email=person@private.invalid',
                    },
                  ],
                  results: [{ status: 'failed', error: { message: 'expect.toHaveURL' } }],
                },
              ],
            },
          ],
        },
      ],
    }),
  )
  assert.equal(unsafe.checks[0].failure.actualRoute, undefined)
  assert.doesNotMatch(JSON.stringify(unsafe.checks), /private-token|private.invalid|token=/)
})

test('Issue 565 probes retain safe route and revocation classes only', () => {
  const report = browserReport(
    JSON.stringify({
      ...good,
      stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        {
          specs: [
            {
              title: 'Issue 565 diagnostic',
              tests: [
                {
                  projectName: 'desktop',
                  annotations: [
                    {
                      type: 'issue-565-add-to-trip-probe',
                      description: JSON.stringify({
                        stage: 'assert-route',
                        locatorCount: 1,
                        hrefPath: '/auth/sign-in?token=private-token',
                        disabled: false,
                        ariaDisabled: 'false',
                        pointerEvents: 'auto',
                        pathnameAfterClick: 'https://private.invalid/auth/sign-in?token=secret',
                        pathnameAtFailure: '/stores/clockwork-cabinet',
                        accessToken: 'must-drop',
                      }),
                    },
                    {
                      type: 'issue-565-discovery-probe',
                      description: JSON.stringify({
                        stage: 'details-heading',
                        path: '/stores/clockwork-cabinet',
                        viewState: 'catalog-error',
                        coverHttpStatus: 0,
                        coverRequestFailed: false,
                        imageState: 'not-rendered',
                        imageErrors: 0,
                      }),
                    },
                    {
                      type: 'issue-565-session-revocation',
                      description: JSON.stringify({
                        tokenSubjectMatchesSibling: true,
                        tokenSessionActive: true,
                        activeSessionAfter: 'revoked',
                        readOutcome: 'http-400-P0001',
                        writeOutcome: 'returned',
                        profileUnchanged: true,
                        sessionId: 'must-drop',
                      }),
                    },
                  ],
                  results: [
                    {
                      status: 'failed',
                      error: { message: 'expect.toHaveURL', stack: 'configured-free-shopper.spec.ts:1:1' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
    1,
  )
  assert.deepEqual(report.checks[0].diagnostics, {
    addToTrip: {
      stage: 'assert-route',
      locatorCount: 1,
      hrefPath: '<other-route>',
      disabled: false,
      ariaDisabled: 'false',
      pointerEvents: 'auto',
      pathnameAfterClick: '<other-route>',
      pathnameAtFailure: '/stores/clockwork-cabinet',
    },
    discovery: {
      stage: 'details-heading',
      path: '/stores/clockwork-cabinet',
      viewState: 'catalog-error',
      coverHttpStatus: null,
      coverRequestFailed: false,
      imageState: 'not-rendered',
      imageErrors: 0,
    },
    sessionRevocation: {
      tokenSubjectMatchesSibling: true,
      tokenSessionActive: true,
      activeSessionAfter: 'revoked',
      readOutcome: 'http-400-P0001',
      writeOutcome: 'returned',
      profileUnchanged: true,
    },
  })
  assert.doesNotMatch(
    JSON.stringify(report.checks),
    /private-token|private\.invalid|accessToken|sessionId|token=/,
  )
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
