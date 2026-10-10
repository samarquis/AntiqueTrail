import assert from 'node:assert/strict'
import test from 'node:test'
import {
  browserReport,
  classifyConfiguredShopperRoute,
  projectSafeBrowserFailure,
  recordCleanupFailure,
} from './configured-free-shopper-report.mjs'

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
  const checkedLocation = browserReport(
    JSON.stringify(
      failedBrowserReport({
        location: {
          file: '/workspace/e2e/configured-free-shopper.spec.ts',
          line: 714,
          column: 9,
        },
        resultAnnotations: [],
      }),
    ),
    1,
  )
  assert.equal(checkedLocation.checks[0].failure.sourceLine, 714)
})

const keyedTitle = 'keyed trip create replays after committed response loss'
const signoutTitle =
  'sibling context, sign-out, and account switch deny private trip reads and writes'
const routeObservationType = 'configured-route-observation-v1'

function observation(checkpoint, routeClass = 'trip-plan', repetition = 1) {
  return {
    version: 1,
    checkpoint,
    ...(checkpoint === 'signout-return-plan' ? { repetition } : {}),
    capture: 'route-only',
    routeClass,
  }
}

function failedBrowserReport({
  name = signoutTitle,
  project = 'desktop',
  message = 'Error: expect(locator).toHaveValue(expected) failed',
  location,
  annotations = [],
  resultAnnotations = annotations,
  testAnnotations = [],
  results,
} = {}) {
  return {
    stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
    suites: [
      {
        specs: [
          {
            title: name,
            tests: [
              {
                projectName: project,
                annotations: testAnnotations,
                results: results ?? [
                  {
                    status: 'failed',
                    errors: [
                      {
                        message,
                        location,
                        stack:
                          'at capture (scripts/configured-free-shopper-report.mjs:9:1)\n' +
                          'at test (e2e/configured-free-shopper.spec.ts:581:11)',
                      },
                    ],
                    annotations: resultAnnotations,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    errors: [],
  }
}

function routeAnnotation(value, type = routeObservationType) {
  return { type, description: typeof value === 'string' ? value : JSON.stringify(value) }
}

test('failure projector parses only the leading matcher signature', () => {
  const cases = [
    [
      'Error: expect(locator).toHaveValue(expected) failed\nCall log: expect(locator).toBeVisible()',
      'toHaveValue',
    ],
    [
      'Error: expect(locator).toBeVisible() failed\nCall log: expect(locator).toHaveValue(expected)',
      'toBeVisible',
    ],
    ['expect(locator).toHaveText(expected) failed', 'toHaveText'],
    ['expect(page).toHaveURL(expected) failed', 'toHaveURL'],
    ['expect(locator).toHaveCount(expected) failed', 'toHaveCount'],
    ['expect(received).toBe(expected) failed', 'toBe'],
    ['expect(received).toThrow(expected) failed', 'toThrow'],
    ['locator.click: Timeout 5000ms exceeded', 'locator.click'],
    [
      'Error: expect(locator).toHaveAttr() failed\nCall log: expect(locator).toHaveValue(x)',
      undefined,
    ],
    ['Error: expect(locator).toBeVisiblely() failed', undefined],
    ['Error: arbitrary value toHaveValue(expected)', undefined],
  ]
  for (const [message, expected] of cases) {
    const report = browserReport(
      JSON.stringify(failedBrowserReport({ message, resultAnnotations: [] })),
      1,
    )
    assert.ok(report.checks[0], message)
    assert.equal(report.checks[0].failure.assertion, expected)
  }
})

test('final-result observations survive only for the exact failing case and project', () => {
  const keyed = observation('keyed-return-heading', 'add-to-trip')
  const signoutInitial = observation('signout-initial-plan')
  const signoutReturn = observation('signout-return-plan', 'trip-plan', 2)
  for (const [name, checkpoint, value] of [
    [keyedTitle, 'keyed-return-heading', keyed],
    [signoutTitle, 'signout-initial-plan', signoutInitial],
    [signoutTitle, 'signout-return-plan', signoutReturn],
  ]) {
    const result = browserReport(
      JSON.stringify(
        failedBrowserReport({
          name,
          message:
            checkpoint === 'keyed-return-heading'
              ? 'Error: expect(locator).toBeVisible() failed'
              : 'Error: expect(locator).toHaveValue(expected) failed\nCall log: toBeVisible',
          resultAnnotations: [routeAnnotation(value)],
        }),
      ),
      1,
    )
    assert.equal(result.status, 'failed')
    assert.deepEqual(result.checks[0].failure.observation, value)
    assert.equal(
      result.checks[0].failure.assertion,
      checkpoint === 'keyed-return-heading' ? 'toBeVisible' : 'toHaveValue',
    )
  }

  const withEarlierAttempt = failedBrowserReport({
    resultAnnotations: [],
    testAnnotations: [routeAnnotation(signoutReturn)],
    results: [
      { status: 'failed', annotations: [routeAnnotation(signoutReturn)] },
      {
        status: 'failed',
        errors: [{ message: 'Error: expect(locator).toHaveValue(x)' }],
        annotations: [],
      },
    ],
  })
  const noRetryLeak = browserReport(JSON.stringify(withEarlierAttempt), 1)
  assert.equal(noRetryLeak.checks[0].status, 'failed')
  assert.equal('observation' in noRetryLeak.checks[0].failure, false)

  const passedFinal = failedBrowserReport({
    testAnnotations: [routeAnnotation(signoutReturn)],
    results: [
      { status: 'failed', annotations: [routeAnnotation(signoutReturn)] },
      { status: 'passed', annotations: [routeAnnotation(signoutReturn)] },
    ],
  })
  passedFinal.stats = { expected: 1, unexpected: 0, skipped: 0, flaky: 0 }
  const passed = browserReport(JSON.stringify(passedFinal), 1)
  assert.equal(passed.status, 'passed')
  assert.equal('failure' in passed.checks[0], false)
})

test('checkpoint supplies its matcher only when original matcher is unknown', () => {
  const keyed = observation('keyed-return-heading', 'add-to-trip')
  const keyedAnnotation = routeAnnotation(keyed)
  const projectedUnknown = projectSafeBrowserFailure(
    { assertion: undefined },
    { name: keyedTitle, project: 'desktop', annotations: [keyedAnnotation] },
  )
  assert.equal(projectedUnknown.assertion, 'toBeVisible')
  assert.deepEqual(projectedUnknown.observation, keyed)

  const projectedConflict = projectSafeBrowserFailure(
    { assertion: 'toHaveValue' },
    { name: keyedTitle, project: 'desktop', annotations: [keyedAnnotation] },
  )
  assert.equal(projectedConflict.assertion, 'toHaveValue')
  assert.equal('observation' in projectedConflict, false)

  const signout = observation('signout-initial-plan')
  const projectedKeyedMatch = projectSafeBrowserFailure(
    { assertion: 'toBeVisible' },
    { name: keyedTitle, project: 'desktop', annotations: [keyedAnnotation] },
  )
  assert.equal(projectedKeyedMatch.assertion, 'toBeVisible')
  assert.deepEqual(projectedKeyedMatch.observation, keyed)

  const projectedSignoutConflict = projectSafeBrowserFailure(
    { assertion: 'toBeVisible' },
    { name: signoutTitle, project: 'desktop', annotations: [routeAnnotation(signout)] },
  )
  assert.equal(projectedSignoutConflict.assertion, 'toBeVisible')
  assert.equal('observation' in projectedSignoutConflict, false)

  const projectedSignout = projectSafeBrowserFailure(
    {},
    { name: signoutTitle, project: 'phone', annotations: [routeAnnotation(signout)] },
  )
  assert.equal(projectedSignout.assertion, 'toHaveValue')
  assert.deepEqual(projectedSignout.observation, signout)

  const unavailable = { version: 1, checkpoint: 'signout-initial-plan', capture: 'unavailable' }
  const projectedUnavailable = projectSafeBrowserFailure(
    {},
    { name: signoutTitle, project: 'desktop', annotations: [routeAnnotation(unavailable)] },
  )
  assert.equal(projectedUnavailable.assertion, 'toHaveValue')
  assert.deepEqual(projectedUnavailable.observation, unavailable)

  const projectedMalformed = projectSafeBrowserFailure(
    {},
    { name: signoutTitle, project: 'desktop', annotations: [routeAnnotation('not-json')] },
  )
  assert.equal('assertion' in projectedMalformed, false)
  assert.equal('observation' in projectedMalformed, false)

  for (const [name, assertion, checkpoint, annotationValue] of [
    [keyedTitle, 'toHaveValue', 'keyed-return-heading', keyed],
    [signoutTitle, 'toBeVisible', 'signout-initial-plan', signout],
  ]) {
    const failed = browserReport(
      JSON.stringify(
        failedBrowserReport({
          name,
          message: `Error: expect(locator).${assertion}(expected) failed`,
          resultAnnotations: [routeAnnotation(annotationValue)],
        }),
      ),
      1,
    )
    assert.equal(failed.status, 'failed', checkpoint)
    assert.equal(failed.checks[0].status, 'failed', checkpoint)
    assert.equal('observation' in failed.checks[0].failure, false, checkpoint)
    assert.equal(failed.checks[0].failure.assertion, assertion, checkpoint)
  }

  const unknownReport = browserReport(
    JSON.stringify(
      failedBrowserReport({
        name: keyedTitle,
        message: 'Error: expect(locator).toHaveAttr() failed',
        resultAnnotations: [keyedAnnotation],
      }),
    ),
    1,
  )
  assert.equal(unknownReport.status, 'failed')
  assert.equal(unknownReport.checks[0].failure.assertion, 'toBeVisible')
  assert.deepEqual(unknownReport.checks[0].failure.observation, keyed)

  const malformedReport = browserReport(
    JSON.stringify(
      failedBrowserReport({
        message: 'Error: expect(locator).toHaveAttr() failed',
        resultAnnotations: [routeAnnotation('not-json')],
      }),
    ),
    1,
  )
  assert.equal(malformedReport.status, 'failed')
  assert.equal('assertion' in malformedReport.checks[0].failure, false)
  assert.equal('observation' in malformedReport.checks[0].failure, false)
})

test('route classifier emits only fixed classes from bounded URL input', () => {
  const cases = [
    [
      'https://example.invalid/auth/sign-in?token=hidden#secret',
      'keyed-return-heading',
      undefined,
      'sign-in',
    ],
    [
      'https://example.invalid/trips/new?private=hidden#secret',
      'keyed-return-heading',
      undefined,
      'add-to-trip',
    ],
    [
      'https://example.invalid/trips/id/plan?private=hidden#secret',
      'signout-initial-plan',
      undefined,
      'trip-plan',
    ],
    ['https://example.invalid/catalog', 'keyed-return-heading', undefined, 'other'],
    ['https://example.invalid/trips/id/plan/next', 'keyed-return-heading', undefined, 'other'],
    ['https://example.invalid/trips/a/b/plan', 'keyed-return-heading', undefined, 'other'],
  ]
  for (const [url, checkpoint, repetition, routeClass] of cases) {
    assert.deepEqual(classifyConfiguredShopperRoute(url, checkpoint, repetition), {
      version: 1,
      checkpoint,
      capture: 'route-only',
      routeClass,
    })
  }
  assert.deepEqual(
    classifyConfiguredShopperRoute(
      'https://example.invalid/trips/id/plan',
      'signout-return-plan',
      0,
    ),
    {
      version: 1,
      checkpoint: 'signout-return-plan',
      repetition: 0,
      capture: 'route-only',
      routeClass: 'trip-plan',
    },
  )
  for (const url of [undefined, 'not a URL', `https://example.invalid/${'x'.repeat(8_200)}`]) {
    assert.deepEqual(classifyConfiguredShopperRoute(url, 'keyed-return-heading'), {
      version: 1,
      checkpoint: 'keyed-return-heading',
      capture: 'unavailable',
    })
  }
  const secretUrl =
    'https://origin-SECRET.invalid/trips/id-SECRET/plan?token=SECRET#fragment-SECRET'
  assert.doesNotMatch(
    JSON.stringify(classifyConfiguredShopperRoute(secretUrl, 'signout-initial-plan')),
    /SECRET|origin-|token|fragment/i,
  )
})

test('route-only and unavailable observations survive report and publication projection', () => {
  const cases = [
    [keyedTitle, 'keyed-return-heading', undefined, 'toBeVisible'],
    [signoutTitle, 'signout-initial-plan', undefined, 'toHaveValue'],
    [signoutTitle, 'signout-return-plan', 0, 'toHaveValue'],
    [signoutTitle, 'signout-return-plan', 1, 'toHaveValue'],
    [signoutTitle, 'signout-return-plan', 2, 'toHaveValue'],
  ]
  for (const [name, checkpoint, repetition, matcher] of cases) {
    for (const project of ['desktop', 'phone']) {
      for (const capture of ['route-only', 'unavailable']) {
        const routeValue =
          capture === 'unavailable'
            ? classifyConfiguredShopperRoute(undefined, checkpoint, repetition)
            : classifyConfiguredShopperRoute(
                'https://example.invalid/trips/id/plan',
                checkpoint,
                repetition,
              )
        const annotations = [routeAnnotation(routeValue)]
        const report = browserReport(
          JSON.stringify(
            failedBrowserReport({
              name,
              project,
              message: `Error: expect(locator).${matcher}(expected) failed`,
              resultAnnotations: annotations,
            }),
          ),
          1,
        )
        assert.equal(report.status, 'failed')
        assert.deepEqual(report.checks[0].failure.observation, routeValue)
        const published = projectSafeBrowserFailure(report.checks[0].failure, { name, project })
        assert.equal(published.assertion, matcher)
        assert.deepEqual(published.observation, routeValue)
      }
    }
  }
})

test('unavailable observation keeps absence distinct from false', () => {
  const unavailable = { version: 1, checkpoint: 'signout-initial-plan', capture: 'unavailable' }
  const result = browserReport(
    JSON.stringify(failedBrowserReport({ resultAnnotations: [routeAnnotation(unavailable)] })),
    1,
  )
  assert.deepEqual(result.checks[0].failure.observation, unavailable)
  assert.equal(result.checks[0].status, 'failed')
})

test('strict observation parser omits malformed, duplicated, mismatched, and oversized data', () => {
  const valid = observation('signout-return-plan')
  const invalid = [
    null,
    [],
    { ...valid, version: 2 },
    { ...valid, extra: 'unknown' },
    { ...valid, capture: 'complete', signInVisible: true },
    { version: 1, checkpoint: 'signout-initial-plan', capture: 'route-only' },
    { ...valid, tripNameVisible: true },
    { ...valid, valueMatches: true },
    { ...valid, signInVisible: 'false' },
    { ...valid, tripNameCount: -1 },
    { ...valid, tripNameCount: 1.5 },
    { ...valid, tripNameCount: 3 },
    { ...valid, repetition: -1 },
    { ...valid, repetition: 1.5 },
    { ...valid, repetition: 3 },
    { ...valid, routeClass: 'trip-unavailable' },
    { ...valid, checkpoint: 'unknown-checkpoint' },
    { ...valid, capture: 'partial' },
    { version: 1, checkpoint: 'signout-initial-plan', capture: 'unavailable', routeClass: 'other' },
    { ...valid, tripNameCount: 0, tripNameVisible: true },
    { ...valid, tripNameCount: 0, valueMatches: true },
    { ...valid, checkpoint: 'signout-initial-plan', repetition: 1 },
    { ...valid, checkpoint: 'keyed-return-heading' },
    { ...valid, capture: 'unavailable', routeClass: 'trip-plan' },
  ]
  const noObservation = (annotation, opts = {}) => {
    const result = browserReport(
      JSON.stringify(
        failedBrowserReport({
          resultAnnotations:
            annotation === null ? [] : Array.isArray(annotation) ? annotation : [annotation],
          ...opts,
        }),
      ),
      1,
    )
    assert.equal(result.status, 'failed')
    assert.equal('observation' in result.checks[0].failure, false)
  }
  for (const item of invalid) noObservation(routeAnnotation(item))
  const missingRepetition = { ...valid }
  delete missingRepetition.repetition
  noObservation(routeAnnotation(missingRepetition))
  noObservation(routeAnnotation({ ...observation('signout-initial-plan'), repetition: 0 }))
  noObservation(routeAnnotation({ ...observation('keyed-return-heading'), repetition: 0 }), {
    name: keyedTitle,
  })
  noObservation(routeAnnotation('{'))
  noObservation({ type: routeObservationType, description: 'x'.repeat(1025) })
  noObservation([routeAnnotation(valid), routeAnnotation(valid)])
  noObservation(routeAnnotation(valid), { name: keyedTitle })
  noObservation(routeAnnotation(valid), { project: 'unexpected' })
  noObservation({ type: routeObservationType, description: JSON.stringify(valid), extra: true })
  noObservation(null)

  const unavailable = {
    version: 1,
    checkpoint: 'signout-return-plan',
    repetition: 0,
    capture: 'unavailable',
  }
  const kept = browserReport(
    JSON.stringify(failedBrowserReport({ resultAnnotations: [routeAnnotation(unavailable)] })),
    1,
  )
  assert.deepEqual(kept.checks[0].failure.observation, unavailable)
})

test('publication projector strips canaries from annotation and parsed failures', () => {
  const canary = 'CANARY-Bearer-secret@example.invalid'
  const valid = observation('signout-return-plan')
  const json = JSON.stringify(
    failedBrowserReport({
      annotations: [
        routeAnnotation(valid),
        routeAnnotation(
          `${canary} https://example.invalid/trips?id=private`,
          `${routeObservationType}-${canary}`,
        ),
      ],
      message: `Error: expect(locator).toHaveValue(x) failed ${canary}\n${canary}`,
    }),
  )
  const fromReport = browserReport(json, 1)
  assert.doesNotMatch(
    JSON.stringify(fromReport),
    /CANARY|example\.invalid|authorization|headers|body/i,
  )
  const projected = projectSafeBrowserFailure(
    {
      ...fromReport.checks[0].failure,
      message: canary,
      stack: canary,
      url: `https://example.invalid/trips?id=${canary}`,
      headers: { authorization: `Bearer ${canary}` },
      body: canary,
      expectedValue: canary,
      actualValue: canary,
      extra: canary,
    },
    { name: signoutTitle, project: 'desktop' },
  )
  assert.deepEqual(projected, fromReport.checks[0].failure)
  assert.doesNotMatch(
    JSON.stringify(projected),
    /CANARY|example\.invalid|authorization|headers|body/i,
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
